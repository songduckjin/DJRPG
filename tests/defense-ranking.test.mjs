import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { accountEndpoint } from '../server/endpoints/account.mjs';
import { withWeapon } from './helpers/armed.mjs';

const { defenseEndpoint } = await import('../server/endpoints/defense.mjs');
const { onRequest: defenseFunction } = await import('../functions/api/defense.js');
const { defenseOperation } = await import('../server/defense.mjs');
const { tokenPayload } = await import('../server/auth.mjs');
const { DefenseBattle, DEFENSE_STEP, DEFENSE_MAX_STEPS, defenseBattleSummary } = await import('../src/game/dungeon/defenseBattle.ts');

const post = (path, body, token) => new Request(`https://example.test/api/${path}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });
/** 실제 플레이처럼 그 시드로 끝까지 돌린 결과 — 클라이언트가 submit에 싣는 값과 같다. */
const play = (save, seed) => {
  const battle = new DefenseBattle(save, seed);
  while (!battle.finished && battle.steps < DEFENSE_MAX_STEPS) battle.advance(DEFENSE_STEP);
  return { battle, summary: defenseBattleSummary(battle) };
};

test('무한 방어전 API는 Pages Function으로 열리고 설정·토큰을 확인한다', async () => {
  assert.equal((await defenseFunction({ request: new Request('https://example.test/api/defense'), env: {} })).status, 405);
  const missing = await defenseFunction({ request: post('defense', { action: 'list' }), env: {} });
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).code, 'DB_NOT_CONFIGURED');
  const unauthorized = await defenseFunction({ request: post('defense', { action: 'list' }), env: { TURSO_DATABASE_URL: 'libsql://example.test', TURSO_AUTH_TOKEN: 'test' } });
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).code, 'INVALID_TOKEN');
});

test('방어전 순위는 검증된 판만 기록하고, 동점은 먼저 도달한 도전자가 위에 온다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-defense-'));
  const env = { TURSO_DATABASE_URL: `file:${join(directory, 'defense.db')}`, TURSO_AUTH_TOKEN: 'local-defense-key' };
  const options = { env, createDbClient: ({ TURSO_DATABASE_URL }) => createClient({ url: TURSO_DATABASE_URL }) };
  const register = async (loginId, name) => {
    const body = await (await accountEndpoint(post('account', { action: 'register', loginId, password: 'defense-password-197' }), options)).json();
    const created = await (await accountEndpoint(post('account', { action: 'createCharacter', slot: 1, name, gender: 'male', job: 'warrior', revision: body.revision }, body.token), options)).json();
    // 무기를 챙긴 세이브를 서버에 적는다 — 서버 리플레이가 이 세이브로 돈다(무기 미장착이면 공격이 막힌다).
    const save = withWeapon({ ...created.save }, `weapon-${loginId}`);
    const saved = await (await accountEndpoint(post('account', { action: 'save', revision: created.revision, characterSlot: 1, save }, body.token), options)).json();
    const loaded = await (await accountEndpoint(post('account', { action: 'load' }, body.token), options)).json();
    return { ...body, revision: saved.revision ?? loaded.revision, save: loaded.save };
  };
  let db;
  const sid = sess => tokenPayload(post('defense', {}, sess.token), env).sid;
  const operation = (sess, action, at, extra = {}) => defenseOperation(db, sess.accountId, { action, ...extra }, sid(sess), at, env.TURSO_DATABASE_URL);
  /** 판 한 번 — 시작(시드 발급) → 실제 플레이 → 검증 통과 시각에 submit. */
  const runOne = async (sess, at) => {
    const start = await operation(sess, 'start', at);
    // 같은 계정이 다시 start 하면 진행 중인 도전의 판 번호·시드를 그대로 돌려준다(새로고침 방어).
    const resumed = await operation(sess, 'start', at + 30_000);
    assert.equal(resumed.runId, start.runId);
    assert.equal(resumed.seed, start.seed);
    const { summary } = play(sess.save, start.seed);
    const result = await operation(sess, 'submit', at + 900_000, { runId: start.runId, stage: summary.stages, summary });
    return { start, summary, result };
  };
  try {
    db = createClient({ url: env.TURSO_DATABASE_URL });
    const first = await register('defense197a', '가람');
    const second = await register('defense197b', '누리');

    const one = await runOne(first, 1_000_000);
    assert.equal(one.result.recorded, one.summary.stages, '검증을 통과한 판이 기록된다');
    assert.equal(one.result.verified, true, '2분 안에 끝난 판은 리플레이까지 확인한다');
    assert.deepEqual(one.result.standing.top.map(row => [row.rank, row.name, row.bestStage, row.mine]), [[1, '가람', one.summary.stages, true]]);
    assert.equal(one.result.standing.mine.rank, 1);

    // 진행 중인 도전이 있는데 다른 판 번호로 보내면 거부한다.
    await operation(first, 'start', 3_000_000);
    await assert.rejects(
      () => operation(first, 'submit', 3_600_000, { runId: 'not-this-run', stage: 1, summary: one.summary }),
      error => error.code === 'DEFENSE_RUN_MISMATCH'
    );

    const two = await runOne(second, 2_000_000);
    assert.equal(two.result.recorded, two.summary.stages);
    // 두 기록을 같은 스테이지로 맞추면 먼저 도달한 쪽(가람)이 위에 남는다.
    await db.execute({ sql: 'UPDATE djrpg_defense_records SET best_stage=?', args: [two.summary.stages] });
    const list = await (await defenseEndpoint(post('defense', { action: 'list' }, first.token), options)).json();
    assert.deepEqual(list.standing.top.map(row => [row.rank, row.name]), [[1, '가람'], [2, '누리']]);
    assert.equal(list.standing.mine.rank, 1);

    // 세이브의 방어전 스테이지는 검증된 기록 +1까지만 저장된다.
    const inflated = await accountEndpoint(post('account', { action: 'save', revision: first.revision, characterSlot: 1, save: { ...first.save, defenseStage: 60 } }, first.token), options);
    assert.equal(inflated.status, 200);
    const inflatedBody = await inflated.json();
    assert.ok(inflatedBody.save.defenseStage <= two.summary.stages + 1, `세이브는 기록 +1까지만 (${inflatedBody.save.defenseStage})`);

    // 게스트는 목록만 보고 기록은 올릴 수 없다.
    const guest = await (await accountEndpoint(post('account', { action: 'guest' }), options)).json();
    const guestList = await defenseEndpoint(post('defense', { action: 'list' }, guest.token), options);
    assert.equal(guestList.status, 200);
    const listed = await guestList.json();
    assert.equal(listed.guest, true);
    assert.equal(listed.standing.mine, undefined);
    assert.equal(listed.standing.total, 2);
    const blocked = await defenseEndpoint(post('defense', { action: 'submit' }, guest.token), options);
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json()).code, 'GUEST_READ_ONLY');
    // 지원하지 않는 action은 400.
    assert.equal((await defenseEndpoint(post('defense', { action: 'retire' }, first.token), options)).status, 400);
  } finally {
    await db?.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('검증을 통과하지 못한 제출은 순위를 올리지 않는다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-defense-bad-'));
  const env = { TURSO_DATABASE_URL: `file:${join(directory, 'defense.db')}`, TURSO_AUTH_TOKEN: 'local-defense-key' };
  const options = { env, createDbClient: ({ TURSO_DATABASE_URL }) => createClient({ url: TURSO_DATABASE_URL }) };
  let db;
  try {
    db = createClient({ url: env.TURSO_DATABASE_URL });
    const body = await (await accountEndpoint(post('account', { action: 'register', loginId: 'defensebad197', password: 'defense-password-197' }), options)).json();
    const created = await (await accountEndpoint(post('account', { action: 'createCharacter', slot: 1, name: '사기꾼', gender: 'male', job: 'warrior', revision: body.revision }, body.token), options)).json();
    await accountEndpoint(post('account', { action: 'save', revision: created.revision, characterSlot: 1, save: withWeapon({ ...created.save }, 'weapon-bad') }, body.token), options);
    const sid = tokenPayload(post('defense', {}, body.token), env).sid;
    const start = await defenseOperation(db, body.accountId, { action: 'start' }, sid, 1, env.TURSO_DATABASE_URL);
    // 1초 만에 30스테이지에 도달했다는 주장 — 스폰 하한만으로도 불가능하다.
    const lie = { stages: 30, kills: 500, seconds: 1, steps: 62, heroHp: 500, heroHpMax: 1000, items: 10, digest: 'deadbeef' };
    await assert.rejects(
      () => defenseOperation(db, body.accountId, { action: 'submit', runId: start.runId, stage: 30, summary: lie }, sid, 2000, env.TURSO_DATABASE_URL),
      error => error.code === 'DEFENSE_TOO_FAST'
    );
    const rows = await db.execute('SELECT COUNT(*) AS n FROM djrpg_defense_records');
    assert.equal(Number(rows.rows[0].n), 0, '거부된 판은 순위에 남지 않는다');
  } finally {
    await db?.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
