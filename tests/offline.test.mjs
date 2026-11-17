import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave, floorKillTarget } = await import('../src/game/store.ts');
const { applyOfflineRewards } = await import('../src/game/offline.ts');
const { equipmentDropChance, skillBookDropChance } = await import('../src/game/items.ts');

test('offline hunts award equipment, skillbooks and estimated boss gold', () => {
  const originalRandom = Math.random; Math.random = () => 0;
  try {
    const save = freshSave(); save.tutorial = 1;
    const reward = applyOfflineRewards(save, 600);
    assert.equal(reward.kills, floorKillTarget(1));
    assert.equal(reward.gold, reward.kills * 4 + 70);
    assert.equal(save.gold, reward.gold);
    assert.equal(save.floorKills, 0);
    assert(reward.items.some(item => item.slot === 'skillbook'));
    assert(reward.items.some(item => item.slot === 'weapon'));
    assert.equal(reward.items.length, 40);
    assert.equal(reward.missedDrops, reward.kills * 2 + 2 - 40);
  } finally { Math.random = originalRandom; }
});

test('full bag counts missed drops and tutorial suppresses all loot', () => {
  const originalRandom = Math.random; Math.random = () => 0;
  try {
    const save = freshSave(); save.tutorial = 1;
    save.bag = Array.from({ length: 40 }, (_, index) => ({ id: `item-${index}`, name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } }));
    const reward = applyOfflineRewards(save, 60);
    assert.equal(reward.items.length, 0); assert.equal(reward.missedDrops, reward.kills * 2);
    const tutorial = freshSave(), early = applyOfflineRewards(tutorial, 600);
    assert.equal(early.items.length, 0); assert.equal(early.missedDrops, 0);
    assert.equal(early.gold, early.kills * 4 + 70);
  } finally { Math.random = originalRandom; }
});

test('offline kill rate stays between eight and sixteen per minute', () => {
  const low = freshSave(); low.floor = 50;
  assert.equal(applyOfflineRewards(low, 60).kills, 8);
  const high = freshSave(); high.equipment.weapon = { id: 'high-attack', name: '검', slot: 'weapon', rarity: 'common', stats: { attack: 10_000 } };
  assert.equal(applyOfflineRewards(high, 60).kills, 16);
  assert.equal(applyOfflineRewards(freshSave(), 59), undefined);
});

test('normal and boss drop chances follow the revised capped curves', () => {
  assert.equal(equipmentDropChance(1, false), .0025);
  assert.equal(equipmentDropChance(1, true), .03);
  assert.equal(equipmentDropChance(100, false), .022);
  assert.equal(equipmentDropChance(100, true), .24);
  assert.equal(skillBookDropChance(1, false), .001);
  assert.equal(skillBookDropChance(1, true), .018);
  assert.equal(skillBookDropChance(200, false), .015);
  assert.equal(skillBookDropChance(200, true), .15);
});
