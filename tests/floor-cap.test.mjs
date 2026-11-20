import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './ts-loader.mjs';

const { freshSave, parseSave, floorKillTarget, MAX_FLOOR } = await import('../src/game/store.ts');
const { World } = await import('../src/game/world.ts');

test('20층이 마지막 층 — 21층 이상 세이브는 층·최고 층만 20으로 당긴다', () => {
  assert.equal(MAX_FLOOR, 20);
  const save = freshSave();
  // 예전에 45층까지 올라가 있던 계정: 장비·아이템·처치 기록은 그대로 두고 층만 20으로 보정한다.
  const legacy = {
    ...save, floor: 45, maxFloor: 60, floorKills: 3000, kills: 90_000,
    equipment: { weapon: { id: 'w', name: '영원의 패왕의 성검', slot: 'weapon', rarity: 'legendary', stats: { attack: 400 } } },
    bag: [{ id: 'b', name: '황혼의 클레이모어', slot: 'weapon', rarity: 'rare', stats: { attack: 40 } }]
  };
  const loaded = parseSave(JSON.parse(JSON.stringify(legacy)));
  assert.equal(loaded.floor, 20, '현재 층은 20층으로');
  assert.equal(loaded.maxFloor, 20, '최고 층도 20층으로');
  assert.equal(loaded.kills, 90_000, '처치 기록은 그대로');
  assert.equal(loaded.equipment.weapon?.name, '영원의 패왕의 성검', '장착 장비는 그대로');
  assert.equal(loaded.bag.length, 1, '가방도 그대로');
  // 20층 위로는 어떤 저장값도 통과하지 못하고, 아래는 1층이 바닥이다.
  assert.equal(parseSave({ ...save, floor: 0 }).floor, 1, '0층은 1층으로');
  assert.equal(parseSave({ ...save, floor: 12, maxFloor: 87 }).floor, 12, '20층 이하는 그대로');
  assert.equal(parseSave({ ...save, floor: 12, maxFloor: 87 }).maxFloor, 20);
  assert.equal(parseSave({ ...save, floor: 20, maxFloor: 20 }).maxFloor, 20);
  // 최고 층은 현재 층보다 낮아지지 않는다(기존 규칙 유지).
  assert.equal(parseSave({ ...save, floor: 15, maxFloor: 3 }).maxFloor, 15);
});

test('층당 보스 목표 — 1층 150마리에서 20층 3,505마리까지 완만히 가팔라진다', () => {
  assert.deepEqual([1, 5, 10, 15, 20].map(floorKillTarget), [150, 472, 1163, 2174, 3505]);
  for (let floor = 2; floor <= 20; floor++) assert(floorKillTarget(floor) > floorKillTarget(floor - 1), `${floor}층 목표가 늘어난다`);
  assert.equal(floorKillTarget(0), 150, '없는 층은 1층과 같다');
  // 상한이 풀리면 곡선은 그대로 이어진다(함수는 20층에서 멈추지 않는다).
  assert(floorKillTarget(30) > floorKillTarget(20));
  // 정산·HUD가 보는 목표와 같은 값이다.
  const save = freshSave();
  assert.equal(parseSave({ ...save, floorKills: 9999 }).floorKills, floorKillTarget(1), '층 목표를 넘는 진행도는 깎인다');
});

test('20층 보스를 잡아도 21층으로 가지 않고 20층에서 계속 사냥한다', () => {
  const originalRandom = Math.random; Math.random = () => 0;
  try {
    const save = freshSave(); save.tutorial = 1; save.autoClimb = true; save.floor = 20; save.maxFloor = 20;
    save.floorKills = floorKillTarget(20);
    const world = new World(save);
    const messages = []; world.onMessage = text => messages.push(text);
    world.kill({ ...world.enemies[0], boss: true, hp: 0 });
    assert.equal(save.floor, 20, '20층에 머문다');
    assert.equal(save.maxFloor, 20, '최고 층도 20층');
    assert.equal(save.floorKills, 0, '층 진행도는 초기화된다');
    assert.equal(world.enemies.length, 0);
    assert.equal(world.spawnTimer, .2, '20층에서도 사냥은 이어진다');
    assert(messages.some(text => text.includes('최고 20층')), messages.join(' / '));

    // 19층에서는 예전처럼 20층으로 오르고, 그 다음부터는 머문다.
    const below = freshSave(); below.tutorial = 1; below.autoClimb = true; below.floor = 19; below.maxFloor = 19;
    below.floorKills = floorKillTarget(19);
    const climb = new World(below);
    climb.kill({ ...climb.enemies[0], boss: true, hp: 0 });
    assert.equal(below.floor, 20);
    assert.equal(below.maxFloor, 20);
    assert.equal(climb.travelToFloor(21).ok, false, '21층은 고를 수 없다');
    assert.equal(climb.travelToFloor(20).ok, true, '20층은 그대로 갈 수 있다');
  } finally { Math.random = originalRandom; }
});

test('서버 저장도 층을 1~20으로 보정한다', async () => {
  const { createClient } = await import('@libsql/client');
  const { schema, account, transaction, writeSave, MAX_FLOOR: serverMax } = await import('../server/database.mjs');
  assert.equal(serverMax, 20, '서버 상수가 게임 상수와 같다');
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-floor-cap-'));
  const db = createClient({ url: `file:${join(directory, 'floor-cap.db')}` });
  try {
    await schema(db);
    const deep = { ...freshSave(), floor: 45, maxFloor: 60 };
    await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: ['deep', 'hashed', JSON.stringify(deep), new Date().toISOString()] });
    const written = await transaction(db, async tx => {
      const row = await account(tx, 'deep');
      return writeSave(tx, row, { ...row.save, floor: 45, maxFloor: 60 });
    });
    assert.equal(written.save.floor, 20);
    assert.equal(written.save.maxFloor, 20);
    const stored = await account(db, 'deep');
    assert.equal(stored.save.floor, 20, 'DB에 20층으로 남는다');
    assert.equal(stored.save.maxFloor, 20);
    // 20층 이하는 그대로 저장된다.
    const kept = await transaction(db, async tx => {
      const row = await account(tx, 'deep');
      return writeSave(tx, row, { ...row.save, floor: 7, maxFloor: 20 });
    });
    assert.equal(kept.save.floor, 7);
    assert.equal(kept.save.maxFloor, 20);
  } finally { await db.close(); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
