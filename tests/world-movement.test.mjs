import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave, floorKillTarget } = await import('../src/game/store.ts');
const { World, enemyMoveSpeed, enemyMaxHp, enemyHitDamage } = await import('../src/game/world.ts');

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
  assert(movingTicks >= 1); assert(stopped);
  const position = { x: world.player.x, y: world.player.y };
  enemy.x = world.player.x + 75; enemy.y = world.player.y;
  world.update(.1);
  assert.deepEqual({ x: world.player.x, y: world.player.y }, position);
  assert.equal(world.activeMove.x, 0);
});
test('automatic attacks and equipped skills start when the hero reaches attack range', () => {
  const save = freshSave(); save.learned = ['slash2']; save.quickSlots = ['slash2', null, null];
  const world = new World(save); world.spawnTimer = 999;
  const enemy = world.enemies[0]; enemy.x = 120; enemy.y = 0; enemy.hp = enemy.maxHp = 10000;
  world.update(.1);
  assert(Math.hypot(world.activeMove.x, world.activeMove.y) > .05);
  assert.equal(enemy.hp, 10000);
  assert.equal(world.cooldown.attack, 0);
  assert.equal(world.cooldown.slash2, 0);
  assert(!world.effects.some(effect => effect.kind === 'slash' || effect.kind === 'slash2'));

  for (let i = 0; i < 6 && Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y) > 90; i++) world.update(.1);
  world.update(.016);
  assert.equal(Math.hypot(world.activeMove.x, world.activeMove.y), 0);
  assert(Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y) <= 90);
  assert(enemy.hp < 10000);
  assert(world.effects.some(effect => effect.kind === 'slash'));
  assert(world.effects.some(effect => effect.kind === 'slash2'));
  const afterBasicAttack = enemy.hp;
  enemy.x = world.player.x + 40; enemy.y = world.player.y;
  world.update(.15);
  assert(enemy.hp < afterBasicAttack, 'the greatsword skill hits after its swing becomes visible');
});
test('a distant drop still starts pursuit and can be collected', () => {
  const world = new World(freshSave()); world.enemies = []; world.spawnTimer = 999;
  world.drops = [{ x: 90, y: 0, item: { id: 'loot', name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } }, age: 0, warned: false }];
  world.update(.1); assert(world.player.x > 0);
  for (let i = 0; i < 10 && world.drops.length; i++) world.update(.1);
  assert(world.save.bag.some(item => item.id === 'loot'));
});

test('boss floor transition clears old enemies and pursuit but retains drops', () => {
  const originalRandom = Math.random; Math.random = () => 0;
  try {
    for (const autoClimb of [true, false]) {
      const save = freshSave(); save.tutorial = 1; save.autoClimb = autoClimb; save.floorKills = floorKillTarget(save.floor);
      const world = new World(save), oldEnemy = world.enemies[0];
      const boss = { ...oldEnemy, boss: true, hp: 0 };
      world.chaseTarget = oldEnemy; world.pursuing = true; world.activeMove = { x: 1, y: 0 };
      world.kill(boss);
      assert(world.drops.length >= 2, 'boss equipment and skillbook drops remain on the ground');
      assert.equal(save.floor, autoClimb ? 2 : 1);
      assert.equal(save.floorKills, 0);
      if (autoClimb) {
        assert.equal(world.enemies.length, 0); assert.equal(world.chaseTarget, undefined);
        assert.equal(world.pursuing, false); assert.deepEqual(world.activeMove, { x: 0, y: 0 });
        assert.equal(world.spawnTimer, .2);
      } else assert.equal(world.enemies[0], oldEnemy);
    }
  } finally { Math.random = originalRandom; }
});

test('normal difficulty health and damage match the floor curves', () => {
  for (const [floor, normalHp, bossHp, normalDamage, bossDamage] of [
    [1, 40, 347, 10, 27], [10, 286, 2444, 40, 99],
    [30, 1163, 10458, 114, 285], [50, 2344, 21700, 193, 489]
  ]) {
    assert.equal(enemyMaxHp(floor, false), normalHp);
    assert.equal(enemyMaxHp(floor, true), bossHp);
    assert.equal(enemyHitDamage(floor, false, 0), normalDamage);
    assert.equal(enemyHitDamage(floor, true, 0), bossDamage);
    assert.equal(enemyHitDamage(floor, false, 10), normalDamage - 2);
  }
  assert.equal(enemyHitDamage(1, false, 1000), 1);
});
