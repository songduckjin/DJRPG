// Deep-floor balance (작업 196): the drop rate stays where it was, but a deep floor pays in colour
// instead of white gear, and its mobs stand for a few hits instead of melting in a second.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { rollItem, equipmentDropChance, rarityOrder } = await import('../src/game/items.ts');
const { enemyMaxHp, offlineMobHp } = await import('../src/game/world.ts');

/** A seeded random stream, so the sampled grade shares are the same on every run. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
}
function shares(floor, samples = 6000) {
  const original = Math.random;
  Math.random = seeded(floor * 7919 + 17);
  try {
    const counts = Object.fromEntries(rarityOrder.map(rarity => [rarity, 0]));
    for (let index = 0; index < samples; index++) counts[rollItem(floor).rarity]++;
    return Object.fromEntries(Object.entries(counts).map(([rarity, count]) => [rarity, count / samples]));
  } finally { Math.random = original; }
}

test('the drop rate is untouched while deep floors stop paying in white gear', () => {
  // 작업 210: 아이템 드롭은 한 번 굴려 70:30으로 가른다 — 1층 0.20%(장비 0.14%), 20층 위로 0.80%(장비 0.56%).
  assert.equal(Math.round(equipmentDropChance(1) * 1e6) / 1e6, .0014, 'the first floor still drops rarely');
  assert.equal(Math.round(equipmentDropChance(78) * 1e6) / 1e6, .0056, 'and the drop rate caps at the 20th floor');
  const shallow = shares(1), deep = shares(78);
  // Floor 1 keeps the rare, mostly-white table players start with.
  assert(shallow.common >= .85, `floor 1 is still mostly common (got ${(shallow.common * 100).toFixed(1)}%)`);
  // Floor 78: the magic cut climbs to ~.394, so white gear drops to the low sixties.
  assert(deep.common <= .67, `floor 78 is no longer ~88% white (got ${(deep.common * 100).toFixed(1)}%)`);
  assert(deep.common >= .5, `yet white gear is still the most common drop (got ${(deep.common * 100).toFixed(1)}%)`);
  assert(deep.magic >= .3, `magic gear grows with depth (got ${(deep.magic * 100).toFixed(1)}%)`);
  assert(deep.magic > shallow.magic * 3, 'deep magic drops far outnumber shallow ones');
  // Rare and above widens to ~7.5% with a 1% legendary cap: deep farming pays in colour.
  const colored = deep.rare + deep.epic + deep.unique + deep.legendary;
  assert(colored >= .06 && colored <= .09, `floor 78 pays rare-and-above ~7.5% (got ${(colored * 100).toFixed(1)}%)`);
  assert(deep.legendary <= .012, `legendary stays at its 1% cap (got ${(deep.legendary * 100).toFixed(2)}%)`);
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

test('a deep mob stands for a few hits instead of melting in a second', () => {
  const old = floor => Math.round(24 + floor * 12 + Math.pow(floor, 1.55) * 4);
  // 작업 198: floor 78 goes from the pre-196 ~4,380 and 작업 196's ~15,360 to ~54,800 — three and a half
  // times what the player tested last, so a late mob has to be worn down and a floor that is too hard
  // sends the player back down to farm instead of handing out the 2.2% drop.
  const deep = enemyMaxHp(78, false);
  assert(deep >= 53000 && deep <= 57000, `floor 78 health is ~54,800 (got ${deep})`);
  assert(deep > old(78) * 12, 'over twelve times the old curve');
  // 1~15층 초반 난이도는 거의 유지: the old curve holds through floor 8 and the ramp stays gentle
  // until the teens, so a new character fights the same mobs it always did.
  for (const floor of [1, 2, 3, 5, 8]) assert.equal(enemyMaxHp(floor, false), old(floor), `floor ${floor} is exactly as before`);
  assert(enemyMaxHp(10, false) <= old(10) * 1.1, `floor 10 barely moves (${enemyMaxHp(10, false)} vs ${old(10)})`);
  assert(enemyMaxHp(15, false) <= old(15) * 1.4, `floor 15 is at most 40% tougher (${enemyMaxHp(15, false)} vs ${old(15)})`);
  // 25층부터 본격 상승: from floor 25 on the fight is more than three times the old curve.
  for (const floor of [25, 30, 50, 78]) assert(enemyMaxHp(floor, false) >= old(floor) * 3, `floor ${floor} is at least three times as tough`);
  // The curve never goes backwards.
  for (let floor = 2; floor <= 100; floor++) assert(enemyMaxHp(floor, false) > enemyMaxHp(floor - 1, false), `floor ${floor} is tougher than ${floor - 1}`);
});

test('a deep boss lands at six times a deep mob', () => {
  // 작업 198: a boss used to sit at 2.6~3.1 times its mob (78층 41,700) and a geared player deleted it
  // in one combo. It now stands at six mobs: 78층 ~329,000.
  for (const floor of [25, 30, 50, 60, 70, 78, 90]) {
    const normal = enemyMaxHp(floor, false), boss = enemyMaxHp(floor, true), ratio = boss / normal;
    assert(ratio >= 5.9 && ratio <= 6.1, `floor ${floor} boss is six mobs (got ${ratio.toFixed(2)}x)`);
  }
  assert(Math.abs(enemyMaxHp(78, true) - 330000) <= 5000, `floor 78 boss is ~330,000 (got ${enemyMaxHp(78, true)})`);
  // Early bosses keep their weight instead of shrinking with the new curve: 1~8층은 완만히 블렌드.
  for (const floor of [1, 2, 3, 5, 8]) assert.equal(enemyMaxHp(floor, true), Math.round(220 + floor * 95 + Math.pow(floor, 1.6) * 32), `floor ${floor} boss is exactly as before`);
  assert(enemyMaxHp(1, true) === 347);
  assert(enemyMaxHp(1, true) / enemyMaxHp(1, false) >= 7, 'the first boss is still a wall');
  for (let floor = 2; floor <= 100; floor++) assert(enemyMaxHp(floor, true) > enemyMaxHp(floor - 1, true), `boss ${floor} is tougher than boss ${floor - 1}`);
});

test('offline rewards keep the pace they had before the live curve moved', () => {
  // 20 hours away must not pay 30% less because a live floor-78 fight got longer: offline settlement
  // still measures its kills against the old curve (작업 196).
  const old = floor => Math.round(24 + floor * 12 + Math.pow(floor, 1.55) * 4);
  for (const floor of [1, 10, 30, 50, 78]) {
    assert(Math.abs(offlineMobHp(floor) - old(floor)) <= 1, `floor ${floor} offline pace is unchanged (${offlineMobHp(floor)} vs ${old(floor)})`);
    if (floor > 25) assert(enemyMaxHp(floor, false) > offlineMobHp(floor), 'while the live fight is longer');
  }
});
