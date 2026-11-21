import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave, floorKillTarget } = await import('../src/game/store.ts');
const { World, enemyMaxHp, ELITE_KILL_INTERVAL, ELITE_HP_SCALE, ELITE_REWARD_SCALE, ELITE_MOB_SCALE } = await import('../src/game/world.ts');
const { equipmentDropChance, skillBookDropChance, itemDropChance } = await import('../src/game/items.ts');

const enemyOf = (over = {}) => ({ x: 60, y: 20, hp: 0, maxHp: 10, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0, ...over });
/** 다음 스폰을 즉시 돌린다 — 스폰 타이머를 0으로 두고 한 틱만 진행한다. */
const spawnOnce = world => { world.spawnTimer = 0; world.update(.016); return world.enemies[0]; };

test('정예 몹은 일반 몹 30마리 처치마다 한 마리 스폰되고 체력이 2배다', () => {
  assert.equal(ELITE_KILL_INTERVAL, 30);
  assert.equal(ELITE_HP_SCALE, 2);
  assert.equal(ELITE_REWARD_SCALE, 2);
  assert(ELITE_MOB_SCALE > 1.2 && ELITE_MOB_SCALE < 1.25, '일반 몹보다 살짝 큰 1.22배');
  const originalRandom = Math.random; Math.random = () => .99;
  try {
    const save = freshSave(); save.tutorial = 3;
    const world = new World(save); world.enemies = []; world.spawnTimer = 999;
    for (let index = 0; index < ELITE_KILL_INTERVAL - 1; index++) world.kill(enemyOf());
    assert.equal(world.elitePending, false, '29마리까지는 정예가 예약되지 않는다');
    world.kill(enemyOf());
    assert.equal(world.elitePending, true, '30번째 처치가 다음 스폰을 정예로 예약한다');
    const elite = spawnOnce(world);
    assert.equal(elite.elite, true);
    assert.equal(elite.boss, false);
    assert.equal(elite.maxHp, enemyMaxHp(save.floor, false) * ELITE_HP_SCALE, '체력은 그 층 일반 몹의 2배');
    assert.equal(world.elitePending, false, '정예를 냈으면 예약은 소비된다');
    // 정예를 잡아도 다음 정예 카운트는 0부터 다시 센다.
    world.enemies = [];
    world.kill(enemyOf({ elite: true }));
    assert.equal(world.eliteKills, 0);
    for (let index = 0; index < ELITE_KILL_INTERVAL - 1; index++) world.kill(enemyOf());
    assert.equal(world.elitePending, false, '정예 처치는 다음 정예의 30마리에 포함되지 않는다');
    world.kill(enemyOf());
    assert.equal(world.elitePending, true);
  } finally { Math.random = originalRandom; }
});

test('보스 타이밍과 겹치면 보스가 먼저 나오고 정예는 다음 스폰으로 밀린다', () => {
  const originalRandom = Math.random; Math.random = () => .99;
  try {
    const save = freshSave(); save.tutorial = 3; save.floorKills = floorKillTarget(save.floor) - 1;
    const world = new World(save); world.enemies = []; world.spawnTimer = 999; world.eliteKills = ELITE_KILL_INTERVAL - 1;
    world.kill(enemyOf());
    assert.equal(world.elitePending, true); assert.equal(world.bossPending, true, '보스 타이밍과 겹쳤다');
    const first = spawnOnce(world);
    assert.equal(first.boss, true, '겹치면 보스가 우선한다');
    assert.equal(world.elitePending, true, '정예 예약은 남아 있다');
    world.enemies = [];
    const second = spawnOnce(world);
    assert.equal(second.boss, false);
    assert.equal(second.elite, true, '보스 뒤 다음 스폰이 정예다');
  } finally { Math.random = originalRandom; }
});

test('정예 처치는 금화·경험치가 2배이고 장비·스킬북 드롭률은 일반 몹과 같다', () => {
  const floor = 1, gold = 3 + floor;
  const originalRandom = Math.random;
  try {
    // 한 마리당 아이템 드롭 롤은 **한 번**이고 일반·정예가 같은 0.39%(전 층 고정)다(작업 210·254).
    Math.random = () => .005;
    const blocked = freshSave(); blocked.tutorial = 3; blocked.floor = floor;
    const blockedWorld = new World(blocked); blockedWorld.enemies = [];
    blockedWorld.kill(enemyOf());
    const normalDrops = blockedWorld.drops.length;
    blockedWorld.kill(enemyOf({ elite: true, maxHp: enemyMaxHp(floor, false) * ELITE_HP_SCALE }));
    assert.equal(normalDrops, 0, `일반 몹은 ${Math.round(itemDropChance(floor) * 10000) / 100}%에서 떨어지지 않는다`);
    assert.equal(blockedWorld.drops.length, 0, '정예도 같은 1배 확률이라 떨어지지 않는다');
    assert.equal(itemDropChance(floor, false), .0039, '전 층 일반 몹 0.39%');

    // 확률 안쪽 값에서는 일반·정예 모두 **한 개씩** 떨어진다(두 개가 같이 나오지 않는다).
    Math.random = () => .002;
    const both = freshSave(); both.tutorial = 3; both.floor = floor;
    const bothWorld = new World(both); bothWorld.enemies = [];
    bothWorld.kill(enemyOf());
    assert.equal(bothWorld.drops.length, 1, '일반 몹 아이템 1개');
    bothWorld.kill(enemyOf({ elite: true }));
    assert.equal(bothWorld.drops.length, 2, '정예도 1배 그대로 한 번의 확률 롤');

    // 금화·경험치 2배.
    Math.random = () => .99;
    const rich = freshSave(); rich.tutorial = 3; rich.floor = floor;
    const richWorld = new World(rich); richWorld.enemies = [];
    richWorld.kill(enemyOf());
    const normalGold = rich.gold, normalExp = rich.exp;
    richWorld.kill(enemyOf({ elite: true }));
    assert.equal(normalGold, gold);
    assert.equal(rich.gold - normalGold, gold * ELITE_REWARD_SCALE, '정예 금화는 일반의 2배');
    assert.equal(normalExp, 9 + floor, '일반 경험치 = 9 + 층(작업 207)');
    assert.equal(rich.exp - normalExp, (9 + floor) * ELITE_REWARD_SCALE, '정예 경험치는 일반의 2배');
  } finally { Math.random = originalRandom; }
});

test('층을 옮기면 정예 예약과 카운터가 초기화된다', () => {
  const save = freshSave(); save.tutorial = 3; save.maxFloor = 5;
  const world = new World(save); world.eliteKills = 12; world.elitePending = true;
  assert.equal(world.travelToFloor(2).ok, true);
  assert.equal(world.eliteKills, 0); assert.equal(world.elitePending, false);
});
