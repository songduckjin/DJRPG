import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { LOOT_REST_SECONDS, LOOT_ABSORB_SECONDS, LOOT_FAN, LOOT_GAP, LOOT_DEPTH, lootRestSpots, lootAbsorbProgress, lootAbsorbPoint } = await import('../src/game/loot.ts');
const { World } = await import('../src/game/world.ts');
const { freshSave } = await import('../src/game/store.ts');

const gear = (id, rarity = 'common') => ({ id, name: '검', slot: 'weapon', rarity, stats: { attack: 2 } });
const dropAt = (x, y, item = gear('drop')) => ({ x, y, item, age: 0, warned: false });
function advance(world, seconds, step = .02) { for (let time = 0; time < seconds - 1e-9; time += step) world.update(step); }
function quiet() { const world = new World(freshSave()); world.save.tutorial = 3; world.enemies = []; world.spawnTimer = 999; return world; }

test('a drop rests on the ground for 1.5 seconds before it is stored', () => {
  const world = quiet();
  world.drops = [dropAt(90, 0)];
  advance(world, 1.4);
  assert.equal(world.drops.length, 1);
  assert.equal(world.drops[0].absorb, undefined, 'the pull may only start at the rest beat');
  assert.equal(world.save.bag.length, 0);
  advance(world, .2);
  assert.notEqual(world.drops[0].absorb, undefined, 'the pull starts right at 1.5 seconds');
  assert.equal(world.save.bag.length, 0, 'nothing is stored while the drop flies in');
  advance(world, .6);
  assert.equal(world.drops.length, 0);
  assert.equal(world.save.bag[0].id, 'drop');
});

test('the pull takes the drop the rest of the way and is drawn from where it began', () => {
  assert.equal(lootAbsorbProgress(0), 0);
  assert.equal(lootAbsorbProgress(LOOT_REST_SECONDS - .01), 0);
  assert.equal(lootAbsorbProgress(LOOT_REST_SECONDS), 0);
  assert(Math.abs(lootAbsorbProgress(LOOT_REST_SECONDS + LOOT_ABSORB_SECONDS) - 1) < 1e-9);
  const half = lootAbsorbProgress(LOOT_REST_SECONDS + LOOT_ABSORB_SECONDS / 2);
  assert(half > .2 && half < .8);
  const from = { x: 10, y: 40 }, to = { x: 100, y: 300 };
  assert.deepEqual(lootAbsorbPoint(from, to, 0), from);
  assert.deepEqual(lootAbsorbPoint(from, to, 1), to);
  // Accelerating: more than half of the way is covered in the second half of the pull.
  assert(lootAbsorbPoint(from, to, .75).y > (from.y + to.y) / 2);
});

test('a drop held back by a full bag stays on the ground and flies in once there is room', () => {
  const world = quiet();
  world.save.bag = Array.from({ length: 40 }, (_, index) => gear(`full-${index}`));
  const messages = [];
  world.onMessage = text => messages.push(text);
  world.drops = [dropAt(90, 0)];
  advance(world, 2.5);
  assert.equal(world.drops.length, 1, 'a full equipment bag keeps the equipment drop on the ground');
  assert.equal(messages.filter(text => text.includes('가방이 가득')).length, 1, 'the full bag is reported once');
  world.save.bag.pop();
  advance(world, 1);
  assert.equal(world.drops.length, 0);
  assert(world.save.bag.some(item => item.id === 'drop'));
});

test('a skill book is still stored while an equipment bag is full', () => {
  const world = quiet();
  world.save.bag = Array.from({ length: 40 }, (_, index) => gear(`full-${index}`));
  world.drops = [dropAt(90, 0, { id: 'book', name: '[스킬북] 회전', slot: 'skillbook', kind: 'skillbook', skillId: 'spin', rarity: 'rare', stats: {} })];
  advance(world, 2.5);
  assert.equal(world.drops.length, 0);
  assert.equal(world.save.bag.at(-1).id, 'book');
});

test('a kill pays its gold at once and only leaves a coin behind for the field to draw', () => {
  const world = quiet();
  const before = world.save.gold;
  const enemy = { x: 60, y: 20, hp: 0, maxHp: 10, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.kill(enemy);
  assert.equal(world.save.gold, before + 3 + world.save.floor, 'the gold is granted at the kill, as before');
  assert.equal(world.coins.length, 1);
  assert.deepEqual([world.coins[0].x, world.coins[0].y], [60, 20]);
  assert.equal(world.coins[0].gold, 3 + world.save.floor);
  assert.equal(world.save.gold, before + world.coins[0].gold, 'the coin only shows gold that was already paid');
  advance(world, LOOT_REST_SECONDS + LOOT_ABSORB_SECONDS + .2);
  assert.equal(world.coins.length, 0, 'the coin is gone once it has been pulled in');
  assert.equal(world.save.gold, before + 3 + world.save.floor, 'the pull never pays twice');
});

test('a floor change clears the coins on the ground with the drops', () => {
  const world = quiet();
  world.save.maxFloor = 5;
  world.coins = [{ x: 0, y: 0, age: 0, gold: 4 }];
  world.drops = [dropAt(10, 0)];
  const result = world.travelToFloor(2);
  assert(result.ok);
  assert.equal(world.coins.length, 0);
  assert.equal(world.drops.length, 0);
});

test('drops rest off the character in a fan and only items keep their pitch', () => {
  const hero = { x: 200, y: 400 }, rx = 34, ry = 74;
  // A kill lands on the character: the drop comes back out along its own line, never across it.
  const [alone] = lootRestSpots(hero.x, hero.y, [{ x: hero.x + 3, y: hero.y - 4 }], [], rx, ry, LOOT_GAP);
  assert(Math.abs(alone.x - hero.x) > 1, 'the spot is pushed off the character art');
  assert(alone.y < hero.y, 'and stays above the feet');
  assert(Math.hypot((alone.x - hero.x) / rx, (alone.y - hero.y) / ry) >= 1, 'outside the keep-out ellipse');
  // Nine items of one heap keep the icon pitch apart.
  const taken = [];
  const spots = lootRestSpots(hero.x, hero.y, Array.from({ length: 9 }, (_, index) => ({ x: hero.x + (index % 3 - 1) * 6, y: hero.y - 22 - (index % 2) * 4 })), taken, rx, ry, LOOT_GAP);
  for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) {
    assert(Math.hypot(spots[a].x - spots[b].x, spots[a].y - spots[b].y) >= LOOT_GAP - 1e-6, 'two items never share a spot');
  }
  for (const spot of spots) {
    assert(Math.hypot((spot.x - hero.x) / rx, (spot.y - hero.y) / ry) >= 1, 'no item rests on the character');
    assert(Math.abs(Math.atan2(spot.x - hero.x, hero.y - spot.y)) <= LOOT_FAN + 1e-6, 'inside the fan');
  }
});

test('coins clump together and an item may fall on a coin', () => {
  const hero = { x: 200, y: 400 }, rx = 34, ry = 74, taken = [];
  const coins = lootRestSpots(hero.x, hero.y, [{ x: 120, y: 300, gold: true }, { x: 122, y: 302, gold: true }, { x: 121, y: 301, gold: true }], taken, rx, ry, LOOT_GAP);
  // A heap stays around the kill point instead of being spread an icon apart.
  for (let a = 1; a < coins.length; a++) assert(Math.hypot(coins[a].x - coins[0].x, coins[a].y - coins[0].y) < LOOT_GAP, 'coins stay bunched');
  for (let a = 0; a < coins.length; a++) for (let b = a + 1; b < coins.length; b++) {
    assert(Math.hypot(coins[a].x - coins[b].x, coins[a].y - coins[b].y) > 1, 'two coins never sit on the very same pixel');
  }
  // An item on the pile is not pushed away by the coins, and it paints above them.
  const [item] = lootRestSpots(hero.x, hero.y, [{ x: coins[0].x, y: coins[0].y }], taken, rx, ry, LOOT_GAP);
  assert(Math.hypot(item.x - coins[0].x, item.y - coins[0].y) < 1e-6, 'an item may share a point with a coin');
  assert(LOOT_DEPTH.gold < LOOT_DEPTH.item, 'items always paint over coins');
});

test('the resting spot stays within reach of the character', () => {
  const hero = { x: 200, y: 400 }, reach = 120;
  const [spot] = lootRestSpots(hero.x, hero.y, [{ x: hero.x, y: hero.y - 900 }], [], 34, 74, LOOT_GAP, reach);
  assert(Math.hypot(spot.x - hero.x, spot.y - hero.y) <= reach + 1e-6);
});

test('the field renderer keeps loot in its own layers with coins under items', () => {
  const source = readFileSync(new URL('../src/game/render/drops.ts', import.meta.url), 'utf8');
  const scene = readFileSync(new URL('../src/game/render.ts', import.meta.url), 'utf8');
  assert.match(source, /body\.zIndex = info\.gold \? LOOT_DEPTH\.gold : LOOT_DEPTH\.item/);
  assert.match(source, /lootBack/, 'drops above the character feet are drawn behind him');
  assert.match(source, /lootFront/, 'drops below the feet are drawn in front of him');
  assert.match(scene, /sortableChildren = true/);
  assert.match(scene, /lootRestSpots|LOOT_DEPTH|drawLoot/, 'the field scene draws ground loot');
  assert.doesNotMatch(source, /'#ff|linear-gradient|dungeon-loot/, 'the field loot is drawn by the renderer, not pasted DOM');
});
