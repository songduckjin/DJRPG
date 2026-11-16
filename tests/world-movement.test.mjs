import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave } = await import('../src/game/store.ts');
const { World, enemyMoveSpeed } = await import('../src/game/world.ts');

test('ordinary monsters approach more slowly and never outpace the player at deep floors', () => {
  assert.equal(enemyMoveSpeed(1, false), 38);
  assert(enemyMoveSpeed(10, false) < enemyMoveSpeed(30, false));
  assert.equal(enemyMoveSpeed(100, false), 64);
  assert.equal(enemyMoveSpeed(100, true), 28);
  const save = freshSave(); save.floor = 100;
  const world = new World(save); world.spawnTimer = 999;
  world.enemies = [{ x: 110, y: -10, hp: 1000, maxHp: 1000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  world.update(.1);
  assert(Math.hypot(world.player.x, world.player.y) > 0);
  assert(Math.abs(Math.hypot(world.enemies[0].x - 110, world.enemies[0].y + 10) - 6.4) < 1e-8);
  assert(Math.hypot(world.activeMove.x, world.activeMove.y) > 0);
});
test('hero does not shuffle in place around a nearby enemy or short knockback', () => {
  const world = new World(freshSave()); world.spawnTimer = 999; world.cooldown.attack = 999;
  const enemy = world.enemies[0]; enemy.x = 80; enemy.y = 0; enemy.hp = enemy.maxHp = 10000;
  world.update(.1);
  assert.equal(world.player.x, 0); assert.equal(world.activeMove.x, 0);
  enemy.x = 120;
  let movingTicks = 0, stopped = false;
  for (let i = 0; i < 14; i++) {
    world.update(.1);
    const moving = Math.hypot(world.activeMove.x, world.activeMove.y) > .05;
    if (moving) { assert(!stopped, 'a short chase must not restart near the target'); movingTicks++; }
    else if (movingTicks) stopped = true;
  }
  assert(movingTicks >= 3); assert(stopped);
  const position = { x: world.player.x, y: world.player.y };
  enemy.x = world.player.x + 75; enemy.y = world.player.y;
  world.update(.1);
  assert.deepEqual({ x: world.player.x, y: world.player.y }, position);
  assert.equal(world.activeMove.x, 0);
});
test('a distant drop still starts pursuit and can be collected', () => {
  const world = new World(freshSave()); world.enemies = []; world.spawnTimer = 999;
  world.drops = [{ x: 90, y: 0, item: { id: 'loot', name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } }, age: 0, warned: false }];
  world.update(.1); assert(world.player.x > 0);
  for (let i = 0; i < 10 && world.drops.length; i++) world.update(.1);
  assert(world.save.bag.some(item => item.id === 'loot'));
});
