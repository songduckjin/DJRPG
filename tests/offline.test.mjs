import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave, floorKillTarget } = await import('../src/game/store.ts');
const { applyOfflineRewards } = await import('../src/game/offline.ts');
const { itemDropChance, offlineDropChance } = await import('../src/game/items.ts');
const { STAT_BOOK_DROP_RATES } = await import('../src/game/statBooks.ts');

test('offline hunts drop equipment and the rare stat book per kill, gold, and a boss only past the floor target', () => {
  const originalRandom = Math.random; Math.random = () => 0;
  try {
    const save = freshSave(); save.tutorial = 1;
    const reward = applyOfflineRewards(save, 600);
    // 10분 × 분당 12마리 = 120마리. 1층 목표가 150마리로 올라(작업 204) 600초 정산에는 보스가 없다.
    assert.equal(reward.kills, 120);
    assert(reward.kills < floorKillTarget(1), '1층 보스 목표보다 적게 잡았다');
    assert.equal(reward.gold, reward.kills * 4);
    assert.equal(save.gold, reward.gold);
    assert.equal(save.floorKills, reward.kills);
    // 파트 B: 스킬북이 폐지되어 한 마리당 ① 장비 1개(0.30%) ② 영구 스탯북 1개(개극악 0.01%)를 따로 굴린다.
    // 난수 0이면 두 굴림이 모두 당첨되어 마리당 2개가 나오고, 셋 다 가방 40칸을 센다(스킬북 시절의
    // "내 직업 책은 칸을 쓰지 않는다" 예외가 사라졌다).
    assert.equal(reward.items.length, 40, '가방 40칸까지만 들어간다');
    assert.equal(reward.missedDrops, reward.kills * 2 - 40, '남은 드롭은 놓친 몫으로 센다');
    assert.equal(save.bag.length, 40);
    assert(reward.items.some(item => item.kind === 'statbook'), '영구 스탯북도 떨어진다');
    assert(reward.items.some(item => item.kind !== 'statbook'), '장비도 떨어진다');
    assert(reward.items.filter(item => item.kind === 'statbook').every(item => ['attack', 'defense', 'health'].includes(item.book)));
  } finally { Math.random = originalRandom; }
});

test('a full bag takes nothing now that every item is a slot, and the tutorial suppresses all loot', () => {
  const originalRandom = Math.random; Math.random = () => 0;
  try {
    const save = freshSave(); save.tutorial = 1;
    save.bag = Array.from({ length: 40 }, (_, index) => ({ id: `item-${index}`, name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } }));
    const reward = applyOfflineRewards(save, 60);
    // 파트 B: 모든 아이템이 1칸이라 가득 찬 가방에는 아무것도 들어가지 않는다(스킬북 예외 폐지).
    assert.equal(reward.items.length, 0, '가득 찬 가방에는 들어가지 않는다');
    assert.equal(reward.missedDrops, reward.kills * 2, '놓친 몫이 모두 보고된다');
    assert.equal(save.bag.length, 40, '장비 40칸은 그대로');
    const tutorial = freshSave(), early = applyOfflineRewards(tutorial, 600);
    assert.equal(early.items.length, 0); assert.equal(early.missedDrops, 0);
    // 튜토리얼 전 600초는 120마리 — 새 1층 목표(150)에 못 미쳐 보스 금화가 붙지 않는다.
    assert.equal(early.gold, early.kills * 4);
  } finally { Math.random = originalRandom; }
});

test('offline kill rate stays between eight and sixteen per minute', () => {
  const low = freshSave(); low.floor = 50;
  assert.equal(applyOfflineRewards(low, 60).kills, 8);
  const high = freshSave(); high.equipment.weapon = { id: 'high-attack', name: '검', slot: 'weapon', rarity: 'common', stats: { attack: 10_000 } };
  assert.equal(applyOfflineRewards(high, 60).kills, 16);
  assert.equal(applyOfflineRewards(freshSave(), 59), undefined);
});

test('아이템 드롭률은 전 층 고정 — 접속 일반 0.39%·보스 4%, 방치 일반 0.30%·보스 4%(작업 254)', () => {
  assert.equal(itemDropChance(1, false), .0039);
  assert.equal(itemDropChance(20, false), .0039, '층이 올라가도 그대로');
  assert.equal(itemDropChance(200, false), .0039);
  assert.equal(itemDropChance(1, true), .04);
  assert.equal(itemDropChance(20, true), .04);
  assert.equal(itemDropChance(200, true), .04);
  // 방치 사냥은 같은 자리의 `offlineDropChance` — 일반만 낮은 0.30%, 보스는 같다.
  assert.equal(offlineDropChance(1, false), .003);
  assert.equal(offlineDropChance(20, false), .003);
  assert.equal(offlineDropChance(200, false), .003);
  assert.equal(offlineDropChance(1, true), .04);
  assert.equal(offlineDropChance(20, true), .04);
  // 파트 B(2026-11-22): 스킬북이 폐지되어 드롭은 **장비 한 종류**다 — 70:30으로 가르지 않는다.
  // 영구 스탯북은 이 확률과 별개로 `STAT_BOOK_DROP_RATES`가 한 번 더 굴린다(일반 0.01%·보스 0.05%).
  assert.equal(STAT_BOOK_DROP_RATES.hunt, .0001);
  assert.equal(STAT_BOOK_DROP_RATES.offline, .0001);
  assert.equal(STAT_BOOK_DROP_RATES.boss, .0005);
});

test('아래층 오프라인 정산에는 보스 몫(보스 처치·보스 금화)이 들어가지 않는다(작업 210)', () => {
  const originalRandom = Math.random; Math.random = () => .99;
  try {
    // 자동 등반이 꺼져 있으면 아래층에서 계속 사냥한다(작업 245 — 켜져 있으면 한 층씩 올라간다).
    const save = freshSave(); save.tutorial = 1; save.floor = 2; save.maxFloor = 7; save.autoClimb = false;
    const reward = applyOfflineRewards(save, 3600);
    assert(save.bossKills === 0, '아래층에는 보스가 없으니 보스 처치 0');
    assert.equal(reward.gold, reward.kills * 5, '보스 금화(70×층) 없이 일반 몹 금화만');
    assert.equal(save.floor, 2, '자동 등반이 꺼져 있으면 층은 그대로');
    assert(save.floorKills < floorKillTarget(2), '진행도는 목표 안에서만 돈다');
  } finally { Math.random = originalRandom; }
});

test('자동 등반 중이면 방치 정산도 층 목표를 채울 때마다 한 층씩 올라가고, 최고층에서는 보스를 상대한다(작업 245)', () => {
  const originalRandom = Math.random; Math.random = () => .99;
  try {
    const save = freshSave(); save.tutorial = 1; save.floor = 1; save.maxFloor = 2; save.floorKills = 0;
    const reward = applyOfflineRewards(save, 3600);
    assert(reward.kills > floorKillTarget(1), '1층 목표를 넘길 만큼 잡았다');
    assert.equal(save.floor, 2, '목표를 채운 만큼 한 층 올라간다');
    assert.equal(reward.endFloor, 2, '정산이 끝난 층도 올라간 층이다');
    assert.equal(save.maxFloor, 2, '올라가도 최고 도달 층은 그대로');
    assert(save.floorKills <= floorKillTarget(2), '최고층 진행도는 목표 안에');
    assert(reward.gold >= floorKillTarget(1) * (3 + 1), '올라간 1층 사냥은 1층 금화로 정산');
    // 목표를 다 못 채우면 그 층에 머문다.
    const short = freshSave(); short.tutorial = 1; short.floor = 1; short.maxFloor = 3;
    const shortReward = applyOfflineRewards(short, 60);
    assert(shortReward.kills < floorKillTarget(1), '10분으로는 1층 목표에 못 미친다');
    assert.equal(short.floor, 1, '1층 목표에 못 미치면 1층에 머문다');
    assert.equal(short.floorKills, shortReward.kills, '잡은 만큼 진행도에 쌓인다');
    // 자동 등반이 꺼져 있으면 목표를 채워도 층은 그대로(작업 210 규칙 유지).
    const still = freshSave(); still.tutorial = 1; still.floor = 1; still.maxFloor = 3; still.autoClimb = false;
    applyOfflineRewards(still, 3600);
    assert.equal(still.floor, 1, '자동 등반이 꺼져 있으면 올라가지 않는다');
  } finally { Math.random = originalRandom; }
});
