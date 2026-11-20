import './ts-loader.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { schema, account, transaction, writeSave } from '../server/database.mjs';
import { removeTempDbDirectory } from './helpers/temp-db.mjs';
const { dungeonOperation } = await import('../server/dungeon.mjs');
const { replayDungeonFloor, verifyDungeonClear, DUNGEON_UNVERIFIED_SECONDS } = await import('../server/dungeon-verify.mjs');
const { parseSave, freshSave } = await import('../src/game/store.ts');
const { DungeonBattle, DUNGEON_STEP, dungeonBattleSummary } = await import('../src/ui/dungeonBattle.ts');

/**
 * 던전 시드·리플레이 검증 (작업 211).
 *
 * 계약:
 *  ① `start`가 서버 시드와 시작 시각을 주고, 같은 층을 다시 열면 그 둘이 그대로다.
 *  ② `submit`은 전투 요약(스텝 수·남은 체력·digest)을 요구한다 — 시간만 기다린 요청은 거부된다.
 *  ③ 조작한 요약(다른 시드로 돌린 것·체력/스텝이 리플레이와 다른 것)은 거부되고 기록이 오르지 않는다.
 *  ④ 실제로 그 시드로 플레이한 클리어는 통과하고, 그 요약은 서버 리플레이와 같은 digest를 낸다(결정적).
 *  ⑤ 리플레이가 못 깨는 세이브는 예전처럼 더 긴 시간을 요구하는 관대 경로(정상 클리어 보호)로 남는다.
 */
let db, directory, url;
const sid = id => `sid-${id}`;
const env = () => ({ TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: 'dungeon-seed-key' });
const key = () => url;
const play = (save, floor, seed) => {
  const battle = new DungeonBattle(save, floor, seed);
  while (!battle.finished && battle.steps < 6000) battle.advance(DUNGEON_STEP);
  return { summary: dungeonBattleSummary(battle), battle };
};
async function seedAccount(id, over = {}) {
  const save = parseSave({ ...freshSave('male'), name: id, level: 30, ...over }, id);
  await db.execute({ sql: 'INSERT INTO djrpg_accounts(id,password_hash,save_json,updated_at,session_id) VALUES(?,?,?,?,?)', args: [id, 'hash', JSON.stringify(save), new Date().toISOString(), sid(id)] });
  await account(db, id);
  return save;
}
const saveFloor = (id, floor, now) => transaction(db, async tx => {
  const row = await account(tx, id);
  return writeSave(tx, row, { ...structuredClone(row.save), dungeonFloor: floor });
});
const call = (id, input, now) => dungeonOperation(db, id, input, sid(id), now, key());
const record = async id => (await db.execute({ sql: 'SELECT * FROM djrpg_dungeon_records WHERE account_id=?', args: [id] })).rows[0];
const attempt = async id => (await db.execute({ sql: 'SELECT * FROM djrpg_dungeon_attempts WHERE account_id=?', args: [id] })).rows[0];

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'djrpg-dungeon-seed-'));
  url = `file:${join(directory, 'seed.db')}`;
  db = createClient({ url });
  await schema(db, env());
});
after(async () => { await db.close(); await removeTempDbDirectory(directory).catch(() => {}); });

test('시작이 시드·시작 시각을 주고, 같은 층을 다시 열면 그대로 둔다', async () => {
  const now = Date.parse('2026-12-10T10:00:00Z');
  await seedAccount('seeded');
  const first = await call('seeded', { action: 'start', floor: 1 }, now);
  assert.equal(first.started, true);
  assert.equal(Number.isInteger(first.seed), true);
  assert(first.seed >= 0 && first.seed <= 0xffffffff);
  const again = await call('seeded', { action: 'start', floor: 1 }, now + 5_000);
  assert.equal(again.seed, first.seed, '같은 층을 다시 열면 전투 난수가 바뀌지 않는다');
  assert.equal(again.startedAt, first.startedAt, '시작 시각도 그대로다');
  const other = await call('seeded', { action: 'start', floor: 2 }, now + 6_000);
  assert.notEqual(other.startedAt, first.startedAt, '다른 층은 새 도전이다');
  assert.equal(Number.isInteger(other.seed), true);
  assert.equal(Number((await attempt('seeded')).seed), other.seed);
  assert(JSON.stringify(await attempt('seeded')).includes('seed'));
});

test('전투 요약 없이 시간만 흘려보낸 클리어는 거부된다', async () => {
  const now = Date.parse('2026-12-11T10:00:00Z');
  await seedAccount('waiter');
  await saveFloor('waiter', 1, now);
  await call('waiter', { action: 'start', floor: 1 }, now);
  await assert.rejects(call('waiter', { action: 'submit' }, now + 600_000), error => error.code === 'DUNGEON_SUMMARY_REQUIRED');
  // 형식만 흉내 낸 요약(승리 true, 체력만 있음)도 스텝이 없으면 거부된다.
  await assert.rejects(call('waiter', { action: 'submit', summary: { won: true, heroHp: 100 } }, now + 600_000), error => error.code === 'DUNGEON_SUMMARY_MISMATCH');
  assert.equal(await record('waiter'), undefined);
  assert.equal(await attempt('waiter')!==undefined, true, '실패한 요청은 도전 기록을 지우지 않는다');
});

test('리플레이와 크게 다른 요약(짧은 스텝·다른 체력)은 거부된다', async () => {
  const now = Date.parse('2026-12-12T10:00:00Z');
  await seedAccount('forger');
  await saveFloor('forger', 1, now);
  const started = await call('forger', { action: 'start', floor: 1 }, now);
  const save = (await account(db, 'forger')).save;
  const honest = play(save, 1, started.seed).summary;
  const later = now + 600_000;
  assert.equal(honest.won, true);
  assert.equal(honest.digest, replayDungeonFloor(save, 1, started.seed).summary.digest, '정직한 요약은 서버 리플레이와 digest까지 같다');

  // ① 스텝이 리플레이보다 훨씬 짧은 요약(시간만 기다린 흉내).
  await assert.rejects(call('forger', { action: 'submit', summary: { ...honest, steps: 30 } }, later), error => error.code === 'DUNGEON_SUMMARY_MISMATCH');
  // ② 스텝이 리플레이보다 훨씬 긴 요약.
  await assert.rejects(call('forger', { action: 'submit', summary: { ...honest, steps: Math.round(honest.steps * 1.6) } }, later), error => error.code === 'DUNGEON_SUMMARY_MISMATCH');
  // ③ 남은 체력이 리플레이와 다른 요약.
  await assert.rejects(call('forger', { action: 'submit', summary: { ...honest, heroHp: honest.heroHp + Math.round(honest.heroHpMax * .5) } }, later), error => error.code === 'DUNGEON_SUMMARY_MISMATCH');
  // ④ 패배를 승리라고 바꾼 요약.
  await assert.rejects(call('forger', { action: 'submit', summary: { ...honest, won: false } }, later), error => error.code === 'DUNGEON_SUMMARY_REQUIRED');
  assert.equal(await record('forger'), undefined, '조작한 요약으로는 순위가 오르지 않는다');
  assert(await attempt('forger'), '실패한 요청은 도전 시각·시드를 지우지 않는다');
});

test('그 시드로 실제로 플레이한 클리어는 통과하고 서버 리플레이와 같은 digest를 낸다', async () => {
  const now = Date.parse('2026-12-13T10:00:00Z');
  await seedAccount('honest');
  await saveFloor('honest', 1, now);
  const started = await call('honest', { action: 'start', floor: 1 }, now);
  const save = (await account(db, 'honest')).save;
  const played = play(save, 1, started.seed);
  assert.equal(played.summary.won, true, '이 세이브는 1층을 깬다');
  // 같은 시드로 두 번 돌려도 같은 결과 — 서버 리플레이(같은 함수)와 digest가 같다.
  const replay = replayDungeonFloor(save, 1, started.seed);
  assert.equal(replay.summary.digest, played.summary.digest);
  assert.equal(replay.steps, played.summary.steps);
  const result = await call('honest', { action: 'submit', summary: played.summary }, now + 600_000);
  assert.equal(result.recorded, 1);
  assert.equal(result.verified, true);
  assert.equal(result.summaryVerified, true);
  assert.equal(Number((await record('honest')).cleared_floor), 1);
});

test('같은 시드는 같은 전투를, 시드가 다르면 다른 전투를 만든다', async () => {
  const save = parseSave({ ...freshSave('male'), name: '결정', level: 12 }, 'det');
  const a = play(save, 4, 12345).summary, b = play(save, 4, 12345).summary;
  assert.deepEqual(a, b, '같은 시드·같은 스텝이면 결과가 같다');
  // 시드는 웨이브 등장 자리를 흔들어 전투 요약을 바꾼다 — 시간만 기다린 요청이 요약을 미리 알 수 없게 한다.
  const digests = new Set([7411, 20202, 333333, 987654321].map(seed => play(save, 4, seed).summary.digest));
  assert(digests.size > 1, '시드가 다르면 요약도 달라진다');
});

test('던전 전투는 고정 스텝으로만 전진해 서버 리플레이와 같은 결과를 낸다', async () => {
  const save = parseSave({ ...freshSave('male'), name: '스텝', level: 8 }, 'step');
  const played = play(save, 3, 424242);
  const replay = replayDungeonFloor(save, 3, 424242);
  assert.equal(played.summary.steps, replay.steps);
  assert.equal(played.summary.heroHp, replay.summary.heroHp);
  assert.equal(played.summary.enemyHp, replay.summary.enemyHp);
  assert.equal(played.summary.digest, replay.summary.digest);
  // 스텝 수 × 고정 스텝 = 전투 시간(초).
  assert(Math.abs(played.summary.steps * DUNGEON_STEP - played.battle.elapsed) < .05);
});
