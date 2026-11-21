import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave, floorKillTarget } = await import('../src/game/store.ts');
const { applyOfflineRewards } = await import('../src/game/offline.ts');
const { equipmentDropChance, skillBookDropChance, itemDropChance, rollItemKind, SKILLBOOK_DROP_SHARE } = await import('../src/game/items.ts');

test('offline hunts award one item per kill (장비 70% · 스킬북 30%) and gold, and a boss only past the floor target', () => {
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
    // 한 마리당 **한 번만** 굴려 1개만 나온다(작업 210) — 난수 0이면 30% 쪽인 스킬북, 두 개가 같이 나오지 않는다.
    // 120마리 모두 스킬북이지만 내 직업 책은 가방 40칸에 세지 않으므로(작업 253) 전부 들어간다.
    assert.equal(reward.items.length, reward.kills, '내 직업 스킬북은 칸을 쓰지 않아 모두 들어간다');
    assert(reward.items.every(item => item.slot === 'skillbook'), '난수 0은 스킬북 30% 쪽');
    assert.equal(reward.missedDrops, 0, '자리가 없어 놓친 드롭은 없다');
    assert.equal(save.bag.length, reward.kills);
  } finally { Math.random = originalRandom; }
});

test('full bag still takes my-job skill books and tutorial suppresses all loot', () => {
  const originalRandom = Math.random; Math.random = () => 0;
  try {
    const save = freshSave(); save.tutorial = 1;
    save.bag = Array.from({ length: 40 }, (_, index) => ({ id: `item-${index}`, name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } }));
    const reward = applyOfflineRewards(save, 60);
    // 난수 0은 스킬북(내 직업) — 내 직업 책은 40칸에 세지 않아(작업 253) 가득 찬 가방에도 모두 들어간다.
    assert.equal(reward.items.length, reward.kills, '내 직업 스킬북은 모두 들어간다');
    assert.equal(reward.missedDrops, 0, '놓친 몫이 없다');
    assert(reward.items.every(item => item.slot === 'skillbook'));
    assert.equal(save.bag.filter(item => item.slot !== 'skillbook').length, 40, '장비 40칸은 그대로');
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

test('아이템 드롭률은 한 마리당 한 번 — 1층 0.40%→20층 1.60%, 보스 6%→24%에서 멈춘다(작업 223)', () => {
  assert.equal(itemDropChance(1, false), .004);
  assert.equal(itemDropChance(20, false), .016);
  assert.equal(itemDropChance(200, false), .016, '20층 위로는 1.60%에서 멈춘다');
  assert.equal(itemDropChance(1, true), .06);
  assert.equal(itemDropChance(20, true), .24);
  assert.equal(itemDropChance(200, true), .24, '20층 위로는 24%에서 멈춘다');
  // 종류는 70:30 — 예전 이름(장비·스킬북 확률)은 같은 값의 70%·30%다.
  assert.equal(SKILLBOOK_DROP_SHARE, .3);
  const round = value => Math.round(value * 1e6) / 1e6;
  assert.equal(round(equipmentDropChance(1, false)), .0028);
  assert.equal(round(skillBookDropChance(1, false)), .0012);
  assert.equal(round(equipmentDropChance(20, true)), .168);
  assert.equal(round(skillBookDropChance(20, true)), .072);
  // 분포: 10,000회에서 스킬북이 30% 언저리.
  let state = 12345, books = 0;
  const seeded = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  for (let index = 0; index < 10_000; index++) if (rollItemKind(seeded) === 'skillbook') books++;
  assert(Math.abs(books / 10_000 - .3) < .02, `스킬북 비율 ${books / 10_000}`);
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
