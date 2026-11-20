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
    assert.equal(reward.items.length, reward.kills, '한 마리당 정확히 1개');
    assert(reward.items.every(item => item.slot === 'skillbook'), '난수 0은 스킬북 30% 쪽');
    assert.equal(reward.missedDrops, 0, '내 직업 책은 40칸을 쓰지 않는다');
  } finally { Math.random = originalRandom; }
});

test('full bag counts missed drops and tutorial suppresses all loot', () => {
  const originalRandom = Math.random; Math.random = () => 0;
  try {
    const save = freshSave(); save.tutorial = 1;
    save.bag = Array.from({ length: 40 }, (_, index) => ({ id: `item-${index}`, name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } }));
    const reward = applyOfflineRewards(save, 60);
    // 가방 40칸이 가득이어도 내 직업 스킬북은 자리를 쓰지 않는다(작업 210) — 장비였다면 놓쳤을 몫이다.
    assert.equal(reward.items.length, reward.kills); assert(reward.items.every(item=>item.slot==='skillbook')); assert.equal(reward.missedDrops, 0);
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

test('아이템 드롭률은 한 마리당 한 번 — 1층 0.20%→20층 0.80%, 보스 3%→12%에서 멈춘다(작업 210)', () => {
  assert.equal(itemDropChance(1, false), .002);
  assert.equal(itemDropChance(20, false), .008);
  assert.equal(itemDropChance(200, false), .008, '20층 위로는 0.80%에서 멈춘다');
  assert.equal(itemDropChance(1, true), .03);
  assert.equal(itemDropChance(20, true), .12);
  assert.equal(itemDropChance(200, true), .12, '20층 위로는 12%에서 멈춘다');
  // 종류는 70:30 — 예전 이름(장비·스킬북 확률)은 같은 값의 70%·30%다.
  assert.equal(SKILLBOOK_DROP_SHARE, .3);
  const round = value => Math.round(value * 1e6) / 1e6;
  assert.equal(round(equipmentDropChance(1, false)), .0014);
  assert.equal(round(skillBookDropChance(1, false)), .0006);
  assert.equal(round(equipmentDropChance(20, true)), .084);
  assert.equal(round(skillBookDropChance(20, true)), .036);
  // 분포: 10,000회에서 스킬북이 30% 언저리.
  let state = 12345, books = 0;
  const seeded = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
  for (let index = 0; index < 10_000; index++) if (rollItemKind(seeded) === 'skillbook') books++;
  assert(Math.abs(books / 10_000 - .3) < .02, `스킬북 비율 ${books / 10_000}`);
});

test('아래층 오프라인 정산에는 보스 몫(보스 처치·보스 금화)이 들어가지 않는다(작업 210)', () => {
  const originalRandom = Math.random; Math.random = () => .99;
  try {
    const save = freshSave(); save.tutorial = 1; save.floor = 2; save.maxFloor = 7;
    const reward = applyOfflineRewards(save, 3600);
    assert(save.bossKills === 0, '아래층에는 보스가 없으니 보스 처치 0');
    assert.equal(reward.gold, reward.kills * 5, '보스 금화(70×층) 없이 일반 몹 금화만');
    assert(save.floorKills < floorKillTarget(2), '진행도는 목표 안에서만 돈다');
  } finally { Math.random = originalRandom; }
});
