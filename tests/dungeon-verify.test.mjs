import { withWeapon } from './helpers/armed.mjs';
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
const { requiredClearSeconds, replayDungeonFloor, DUNGEON_MIN_SECONDS, DUNGEON_UNVERIFIED_SECONDS } = await import('../server/dungeon-verify.mjs');
const { parseSave, freshSave } = await import('../src/game/store.ts');
const { DungeonBattle, DUNGEON_STEP, dungeonBattleSummary } = await import('../src/game/dungeon/battle.ts');
/** 그 세이브로 그 층을 그 시드로 실제로 플레이한 결과 요약 — 클라이언트가 보내는 값과 같다. */
const play = (save, floor, seed) => {
  const battle = new DungeonBattle(save, floor, seed);
  while (!battle.finished && battle.steps < 6000) battle.advance(DUNGEON_STEP);
  return dungeonBattleSummary(battle);
};

/**
 * 던전 클리어 서버 검증 (작업 209).
 * 세이브의 `dungeonFloor`는 서버 기록+1까지만 저장되고, 기록은 `start`(서버 시각) → `submit`(충분한 경과)을
 * 통과한 요청만 올린다. 리플레이가 그 층을 깰 수 있는 세이브면 그 시간의 절반, 아니면 더 긴 시간을 요구한다.
 */
let db, directory, url;
const sid = id => `sid-${id}`;
const env = () => ({ TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: 'dungeon-key' });
const worldBossKey = () => url;
// 던전 몹·보스 공격력 정상화(작업 248) 뒤로는 맨몸 캐릭터가 2층부터 버티지 못한다 — 실제 플레이어처럼
// 장비를 갖춘 세이브로 검증 규칙을 본다(이 파일은 `writeSave`를 직접 쓰므로 소유 기록 검증을 거치지 않는다).
const testGear = id => ({
  armor: { id: `${id}-armor`, name: '시험 갑옷', slot: 'armor', rarity: 'rare', stats: { defense: 40, health: 120 }, plus: 0 },
  helmet: { id: `${id}-helmet`, name: '시험 투구', slot: 'helmet', rarity: 'rare', stats: { defense: 20, health: 60 }, plus: 0 },
  boots: { id: `${id}-boots`, name: '시험 장화', slot: 'boots', rarity: 'rare', stats: { defense: 20, health: 60 }, plus: 0 }
});
async function seed(id, over = {}) {
  const base = withWeapon({ ...freshSave('male'), name: id, level: 7, ...over }, `${id}-weapon`);
  const save = parseSave({ ...base, equipment: { ...testGear(id), ...(base.equipment ?? {}), ...(over.equipment ?? {}) } }, id);
  await db.execute({ sql: 'INSERT INTO djrpg_accounts(id,password_hash,save_json,updated_at,session_id) VALUES(?,?,?,?,?)', args: [id, 'hash', JSON.stringify(save), new Date().toISOString(), sid(id)] });
  await account(db, id);
  return save;
}
const saveFloor = (id, floor, now) => transaction(db, async tx => {
  const row = await account(tx, id);
  return writeSave(tx, row, { ...structuredClone(row.save), dungeonFloor: floor });
});
const call = (id, input, now) => dungeonOperation(db, id, input, sid(id), now, worldBossKey());
const record = async id => (await db.execute({ sql: 'SELECT * FROM djrpg_dungeon_records WHERE account_id=?', args: [id] })).rows[0];
const attempt = async id => (await db.execute({ sql: 'SELECT * FROM djrpg_dungeon_attempts WHERE account_id=?', args: [id] })).rows[0];

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'djrpg-dungeon-verify-'));
  url = `file:${join(directory, 'verify.db')}`;
  db = createClient({ url });
  await schema(db, env());
});
after(async () => { await db.close(); await removeTempDbDirectory(directory).catch(() => {}); });

test('리플레이는 그 세이브로 그 층을 깰 수 있는지와 최소 클리어 시간을 알려 준다', () => {
  const strong = parseSave(withWeapon({ ...freshSave('male'), level: 30, floor: 1 }, 'a-weapon'), 'a');
  const replay = replayDungeonFloat(strong, 1);
  assert.equal(replay.outcome, 'clear');
  assert(replay.seconds > 0 && replay.seconds <= 90);
  assert.equal(requiredClearSeconds(strong, 1), Math.max(DUNGEON_MIN_SECONDS, Math.round(replay.seconds * .5)));
  const weak = parseSave(withWeapon({ ...freshSave('male'), level: 1, floor: 1 }, 'b-weapon'), 'b');
  const hard = replayDungeonFloat(weak, 10);
  assert.equal(requiredClearSeconds(weak, 10), hard.outcome === 'clear' ? Math.max(DUNGEON_MIN_SECONDS, Math.round(hard.seconds * .5)) : DUNGEON_UNVERIFIED_SECONDS);
  function replayDungeonFloat(save, floor) { return replayDungeonFloor(save, floor); }
});

test('도전 시작 없이 올린 클리어와 너무 빠른 클리어는 기록되지 않는다', async () => {
  const now = Date.parse('2026-12-05T10:00:00Z');
  await seed('no-start');
  await saveFloor('no-start', 1, now);
  await assert.rejects(call('no-start', { action: 'submit' }, now + 600_000), error => error.code === 'DUNGEON_NOT_STARTED');
  assert.equal(await record('no-start'), undefined);

  await seed('too-fast');
  await saveFloor('too-fast', 1, now);
  await call('too-fast', { action: 'start', floor: 1 }, now);
  await assert.rejects(call('too-fast', { action: 'submit' }, now + 1000), error => error.code === 'DUNGEON_TOO_FAST');
  const stored = await attempt('too-fast');
  assert.equal(Number(stored.floor), 1, '실패한 도전의 시작 시각은 남아 다시 시도할 수 있다');
  assert.equal(await record('too-fast'), undefined);
});

test('시작 시각에서 충분한 시간이 흐르면 한 층씩 기록되고 같은 요청은 멱등하다', async () => {
  const now = Date.parse('2026-12-06T10:00:00Z');
  await seed('climber');
  for (const floor of [1, 2, 3]) {
    await saveFloor('climber', floor, now);
    const started = await call('climber', { action: 'start', floor }, now + floor * 100_000);
    assert.equal(started.seed !== undefined && Number.isInteger(started.seed), true, 'start가 전투 시드를 준다');
    const save = (await account(db, 'climber')).save;
    const summary = play(save, floor, started.seed);
    const result = await call('climber', { action: 'submit', summary }, now + floor * 100_000 + 600_000);
    assert.equal(result.recorded, floor);
    assert.equal(result.verified, true);
  }
  const stored = await record('climber');
  assert.equal(Number(stored.cleared_floor), 3);
  // 이미 기록된 층을 다시 보내도 기록은 그대로이고 시간을 다시 요구하지 않는다.
  const again = await call('climber', { action: 'submit' }, now + 1);
  assert.equal(again.recorded, 3);
});

test('세이브는 서버 기록보다 한 층 앞까지만 저장되고, 기록이 있으면 여러 층 도약은 거부된다', async () => {
  const now = Date.parse('2026-12-07T10:00:00Z');
  await seed('jumper');
  const saved = await saveFloor('jumper', 10, now);
  assert.equal(saved.save.dungeonFloor, 1, '검증 없이 저장되는 최고층은 한 층까지');
  // 검증된 기록이 생기기 전(배포 이전 세이브)이면 저장된 층을 한 번 따라잡게 한다 — 그러지 않으면 그 계정은
  // 한 층씩 올리는 규칙에 걸려 영원히 순위에 오르지 못한다.
  await db.execute({ sql: "UPDATE djrpg_characters SET save_json=json_set(save_json,'$.dungeonFloor',3) WHERE account_id='jumper'" });
  const caughtUp = await call('jumper', { action: 'submit' }, now + 600_000);
  assert.equal(caughtUp.recorded, 3, '기록이 비어 있을 때 한 번만 저장된 층을 인정한다');
  // 그 뒤로는 한 층씩만 — 이미 기록된 계정이 세이브를 고쳐 두 층을 뛰면 거부된다.
  await db.execute({ sql: "UPDATE djrpg_characters SET save_json=json_set(save_json,'$.dungeonFloor',6) WHERE account_id='jumper'" });
  await assert.rejects(call('jumper', { action: 'submit' }, now + 600_000), error => error.code === 'DUNGEON_OUT_OF_ORDER');
});

test('순위 조회는 쓰기 없이 답한다(계정·기록·revision 그대로)', async () => {
  const now = Date.parse('2026-12-08T10:00:00Z');
  await seed('viewer');
  const before = await account(db, 'viewer');
  const listed = await call('viewer', { action: 'list' }, now);
  assert.equal(listed.recorded, 0);
  assert.equal(listed.guest, false);
  const after = await account(db, 'viewer');
  assert.equal(after.revision, before.revision);
  assert.equal(await record('viewer'), undefined);
  assert.equal(await attempt('viewer'), undefined);
});

test('게스트는 순위를 볼 수만 있고 기록은 올리지 못한다', async () => {
  const now = Date.parse('2026-12-09T10:00:00Z');
  const save = parseSave(withWeapon({ ...freshSave('male'), name: '게스트' }), 'guest-x');
  await db.execute({ sql: 'INSERT INTO djrpg_accounts(id,password_hash,save_json,updated_at,session_id) VALUES(?,?,?,?,?)', args: ['guest-x', 'guest', JSON.stringify(save), new Date().toISOString(), sid('guest-x')] });
  await account(db, 'guest-x');
  const listed = await call('guest-x', { action: 'list' }, now);
  assert.equal(listed.guest, true);
  await assert.rejects(call('guest-x', { action: 'start', floor: 1 }, now), error => error.code === 'GUEST_READ_ONLY');
  await assert.rejects(call('guest-x', { action: 'submit' }, now), error => error.code === 'GUEST_READ_ONLY');
  assert.equal(await record('guest-x'), undefined);
});
