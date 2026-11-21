import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave, floorKillTarget } = await import('../src/game/store.ts');
const { World, MOB_CAP } = await import('../src/game/world.ts');

/** 아래층(floor < maxFloor)에서 목표를 하나 남겨 두고 한 마리 잡는 장면. */
const hunt = (options = {}) => {
  const save = freshSave();
  save.tutorial = 1;
  save.floor = 3;
  save.maxFloor = 6;
  save.floorKills = floorKillTarget(3) - 1;
  Object.assign(save, options);
  const world = new World(save);
  world.spawnTimer = 999;
  const messages = [];
  world.onMessage = text => messages.push(text);
  world.enemies = [{ x: 40, y: 0, hp: 1000, maxHp: 1000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  world.chaseTarget = world.enemies[0];
  world.pursuing = true;
  world.elitePending = true;
  return { save, world, messages };
};

test('자동 등반이 켜져 있으면 아래층에서도 목표를 채울 때마다 한 층 올라간다(작업 225)', () => {
  const { save, world, messages } = hunt();
  world.kill({ x: 40, y: 0, hp: 0, maxHp: 1000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
  assert.equal(save.floor, 4, '한 층만 올라간다');
  assert.equal(save.maxFloor, 6, '최고 도달 층은 그대로');
  assert.equal(save.floorKills, 0, '진행도는 새 층에서 0부터');
  assert.equal(world.enemies.length, 0, '필드 몹 정리');
  assert.equal(world.chaseTarget, undefined);
  assert.equal(world.pursuing, false);
  assert.equal(world.spawnTimer, .2, '곧 새 층 몹을 채운다');
  assert.equal(world.elitePending, false, '정예 예약도 정리');
  assert.deepEqual(messages.filter(text => text.includes('층 진입')), ['4층 진입']);
  assert.equal(save.autoClimb, true, '자동 등반 유지');
});

test('자동 등반이 꺼져 있으면(강등 직후 등) 아래층에서 목표를 채워도 그 층에서 계속 사냥한다(작업 225)', () => {
  const { save, world } = hunt({ autoClimb: false });
  world.kill({ x: 40, y: 0, hp: 0, maxHp: 1000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
  assert.equal(save.floor, 3, '층은 그대로');
  assert.equal(save.floorKills, 0, '목표를 채운 진행도만 0으로');
});

test('최고층 바로 아래에서 목표를 채우면 최고층으로 올라가 보스를 부를 수 있게 된다(작업 225)', () => {
  const { save, world, messages } = hunt({ floor: 5, maxFloor: 6, floorKills: floorKillTarget(5) - 1 });
  world.enemies = [{ x: 40, y: 0, hp: 1000, maxHp: 1000, boss: true, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  world.kill({ x: 40, y: 0, hp: 0, maxHp: 1000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
  assert.equal(save.floor, 6, '최고층으로 한 층');
  assert.equal(save.floorKills, 0);
  assert(world.bossFloor(), '이제 최고층 — 목표를 다시 채우면 보스가 나온다');
  assert.deepEqual(messages.filter(text => text.includes('층 진입')), ['6층 진입']);
});

test('강등(30마리)될 때만 자동 등반이 꺼지고, 안내 문구에 중단이 적힌다(작업 225)', () => {
  const save = freshSave(); save.tutorial = 1; save.floor = 4; save.maxFloor = 6; save.autoClimb = true;
  const world = new World(save);
  const mob = i => ({ x: 300 - i, y: 0, hp: 999, maxHp: 999, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
  world.enemies = Array.from({ length: MOB_CAP }, (_, i) => mob(i));
  world.spawnTimer = 999;
  const messages = []; world.onMessage = text => messages.push(text);
  world.update(.01);
  assert.equal(save.floor, 3, '한 층 내려간다');
  assert.equal(save.autoClimb, false, '강등당했을 때만 자동 등반이 꺼진다');
  assert.deepEqual(messages, ['적이 너무 많아 3층으로 내려갑니다. 자동 등반이 중단됩니다.']);
});

test('보스에게 진 뒤 강등돼도 ⚔ 보스 도전은 남고, 누르면 최고층으로 올라가 보스를 소환한다(작업 225)', () => {
  const save = freshSave(); save.tutorial = 1; save.floor = 4; save.maxFloor = 4; save.autoClimb = true;
  const world = new World(save);
  world.enemies = [{ x: 10, y: 0, hp: 999, maxHp: 999, boss: true, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  world.player.hp = 1; world.update(.01);
  assert.equal(world.bossRetryReady, true, '보스 패배 → 도전 버튼');
  // 30마리가 쌓여 3층으로 강등 — 버튼은 그대로 보인다.
  const mob = i => ({ x: 300 - i, y: 0, hp: 999, maxHp: 999, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
  world.enemies = Array.from({ length: MOB_CAP }, (_, i) => mob(i));
  world.spawnTimer = 999; world.player.hit = 1;
  world.update(.01);
  assert.equal(save.floor, 3, '강등');
  assert.equal(world.bossRetryReady, true, '아래층에서도 버튼 유지');
  assert.equal(world.challengeBoss(), true, '버튼을 누르면');
  assert.equal(save.floor, 4, '최고층으로 올라간다');
  assert.equal(save.autoClimb, true, '자동 등반도 다시 켜진다');
  world.update(.05);
  assert(world.enemies.some(enemy => enemy.boss), '그 층 보스가 나타난다');
  assert.equal(world.enemies.filter(enemy => !enemy.boss).length, 0, '보스전에는 일반 몹이 없다');
});
