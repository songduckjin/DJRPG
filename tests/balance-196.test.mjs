// Deep-floor balance (작업 196 → 밸런스 v2): the drop rate now follows depth down (1층 0.242% → 20층 0.153%
// → 34층+ 0.144%), the deep mob curve is the v2 one, and a boss stands at thirteen mobs of its floor.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { rollItem, equipmentDropChance, itemDropChance } = await import('../src/game/items.ts');
const { enemyMaxHp, offlineMobHp } = await import('../src/game/world.ts');
const { killsToBoss, fieldRewardScale } = await import('../src/game/progress.ts');

/** A seeded random stream, so the sampled grade shares are the same on every run. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}

test('the drop rate now follows depth down while deep floors still pay in colour', () => {
  // 밸런스 v2: 목표 생존 수 젠으로 젠이 빨라진 만큼 마리당 드롭률을 낮춘다.
  // 접속 일반 1층 0.242% → 20층 0.153% → 34층+ 0.144%(층별 계수 0.62 → 0.37), 보스는 4% 그대로.
  const round = value => Math.round(value * 1e6) / 1e6;
  assert.equal(round(itemDropChance(1)), .002418, '1층 0.242%');
  assert.equal(round(itemDropChance(20)), .001529, '20층 0.153%');
  assert.equal(round(itemDropChance(40)), round(.0039 * .37), '34층+ 0.144%');
  assert.equal(itemDropChance(200), itemDropChance(40), '더 깊어도 0.37 계수에서 멈춘다');
  assert.equal(itemDropChance(1, true), .04, '보스 4%는 그대로');
  // 파트 B: 스킬북이 폐지되어 한 번 굴린 드롭은 그대로 장비 하나다(70:30 분기 없음).
  assert.equal(round(equipmentDropChance(1)), round(.002418));
  assert.equal(round(equipmentDropChance(20)), round(.001529));
});

test('the grade cuts stay ordered and the magic cut climbs with depth', () => {
  // Feeding the rarity roll directly shows the cut each floor applies: .1 is magic on floor 78 and
  // was white on the old fixed .117 cut anywhere past the first floors.
  const rarityAt = (floor, roll) => {
    const original = Math.random; let first = true;
    Math.random = () => { if (first) { first = false; return roll; } return .5; };
    try { return rollItem(floor).rarity; } finally { Math.random = original; }
  };
  assert.equal(rarityAt(1, .1), 'magic', 'a .1 roll is magic even on floor 1');
  assert.equal(rarityAt(78, .1), 'magic', 'and still magic on floor 78');
  assert.equal(rarityAt(78, .3), 'magic', 'a .3 roll is magic deep down now');
  assert.equal(rarityAt(1, .3), 'common', 'but still white on floor 1 — the cut grows with depth');
  assert.equal(rarityAt(78, .45), 'common', 'above the .40 cut it is white again');
  assert.equal(rarityAt(78, .05), 'rare', 'the rare band widened too');
  assert.equal(rarityAt(1, .05), 'magic', 'while floor 1 keeps its narrow rare band');
  assert.equal(rarityAt(78, .005), 'legendary', 'the legendary cap rose to 1%');
  assert.equal(rarityAt(1, .005), 'epic', 'floor 1 still has almost no legendary chance');
});

test('1~8층은 그대로, 9~20층은 ×0.75, 21층+는 98.5 × (1 + 층/2) 선형이다', () => {
  const old = floor => Math.round(24 + floor * 12 + Math.pow(floor, 1.55) * 4);
  // 밸런스 v2 입문 완화: 1층 26 · 2층 43 · 3층 65 · 4층 91 · 5층 123, 6층부터 종전 곡선.
  assert.equal(enemyMaxHp(1, false), 26, '1층 몹 HP 26');
  assert.equal(enemyMaxHp(2, false), Math.round(old(2) * .72));
  assert.equal(enemyMaxHp(3, false), Math.round(old(3) * .79));
  assert.equal(enemyMaxHp(4, false), Math.round(old(4) * .86));
  assert.equal(enemyMaxHp(5, false), Math.round(old(5) * .93));
  for (const floor of [6, 7, 8]) assert.equal(enemyMaxHp(floor, false), old(floor), `floor ${floor} is exactly as before`);
  // 9~20층은 종전 곡선의 75%, 20층 1,083.
  const blend = floor => Math.round(offlineMobHp(floor) + (Math.round(24 + floor * 14 + Math.pow(floor, 2.65) * 0.52) - offlineMobHp(floor)) * Math.min(1, Math.max(0, (floor - 8) / 17)));
  for (const floor of [9, 10, 15, 20]) assert.equal(enemyMaxHp(floor, false), Math.max(220, Math.round(blend(floor) * .75)), `floor ${floor}`);
  assert.equal(enemyMaxHp(20, false), 1083, '20층 몹 HP 1,083');
  // 21층+ 선형 — 20 → 21층이 끊기지 않고 이어진다.
  assert.equal(enemyMaxHp(21, false), 1133);
  assert.equal(enemyMaxHp(40, false), 2069);
  assert.equal(enemyMaxHp(78, false), 3940);
  // 9층은 8층과 같다(0.75 배율이 8층보다 낮아 220 하한에 걸린다 — 8→9층이 끊기지 않게 하는 하한).
  assert.equal(enemyMaxHp(9, false), 220);
  for (let floor = 10; floor <= 100; floor++) assert(enemyMaxHp(floor, false) > enemyMaxHp(floor - 1, false), `floor ${floor} is tougher than ${floor - 1}`);
});

test('보스는 일반 몹의 13배이고, 1~8층 보스는 종전 그대로다', () => {
  for (const floor of [9, 10, 15, 20, 21, 25, 40, 78]) {
    const normal = enemyMaxHp(floor, false), boss = enemyMaxHp(floor, true), ratio = boss / normal;
    assert(ratio >= 12.99 && ratio <= 13.01, `floor ${floor} boss is thirteen mobs (got ${ratio.toFixed(2)}x)`);
  }
  assert.equal(enemyMaxHp(20, true), 14079);
  assert.equal(enemyMaxHp(78, true), 51220);
  // Early bosses keep their weight instead of shrinking with the new curve: 1~8층은 종전 그대로.
  for (const floor of [1, 2, 3, 5, 8]) assert.equal(enemyMaxHp(floor, true), Math.round(220 + floor * 95 + Math.pow(floor, 1.6) * 32), `floor ${floor} boss is exactly as before`);
  assert.equal(enemyMaxHp(1, true), 347);
  assert(enemyMaxHp(1, true) / enemyMaxHp(1, false) >= 13, 'the first boss is still a wall');
  for (let floor = 2; floor <= 100; floor++) assert(enemyMaxHp(floor, true) > enemyMaxHp(floor - 1, true), `boss ${floor} is tougher than boss ${floor - 1}`);
});

test('killsToBoss는 150 + 30d + d², 필드 보상 계수는 1층 0.70 → 28층+ 0.35', () => {
  assert.equal(killsToBoss(1), 150);
  assert.equal(killsToBoss(20), 1081);
  assert.equal(killsToBoss(40), 2841);
  assert.equal(killsToBoss(78), 8389);
  assert.equal(fieldRewardScale(1), .70);
  assert.equal(Math.round(fieldRewardScale(20) * 100) / 100, .45);
  assert.equal(fieldRewardScale(40), .35);
  assert.equal(fieldRewardScale(78), .35);
});

test('offline pace now uses the live v2 mob curve', () => {
  const old = floor => Math.round(24 + floor * 12 + Math.pow(floor, 1.55) * 4);
  for (const floor of [1, 10, 30, 50, 78]) {
    assert(Math.abs(offlineMobHp(floor) - old(floor)) <= 1, `floor ${floor} offline curve is the old curve (${offlineMobHp(floor)} vs ${old(floor)})`);
  }
  // 방치 정산은 접속과 같은 몹 HP·젠을 쓴다 — 20층은 접속 곡선(1,083)이다.
  assert.equal(enemyMaxHp(20, false), 1083);
});
