import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { manaBurstShield } = await import('../src/game/skills.ts');
const { totalStats } = await import('../src/game/items.ts');
const { World } = await import('../src/game/world.ts');

test('마력 폭발 보호막은 스킬 레벨에 따라 크게 증가한다', () => {
  assert(manaBurstShield(100, 5) > manaBurstShield(100, 1) * 1.9);
  assert(manaBurstShield(100, 10) > manaBurstShield(100, 5) * 1.5);
});

test('마력 폭발은 적에게 피해 없이 지연 후 보호막을 만든다', () => {
  const save = freshSave('female', 'mage');
  save.learned = ['manaBurst']; save.quickSlots = ['manaBurst', null, null];
  const world = new World(save); world.spawnTimer = 999; world.enemies = []; world.critRoll = () => 1;
  const enemy = { x: world.player.x + 30, y: world.player.y, hp: 100000, maxHp: 100000,
    boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.enemies.push(enemy);
  world.action('manaBurst');
  world.save.quickSlots = [null, null, null]; world.cooldown.attack = Number.POSITIVE_INFINITY;
  const burst = world.effects.find(effect => effect.kind === 'burst' && effect.source === 'manaBurst');
  assert(burst && burst.nextHit === burst.duration * .5);
  world.update(.2);
  assert.equal(world.player.shield, 0);
  world.update(.3);
  assert.equal(world.player.shield, manaBurstShield(totalStats(save).attack, 1));
  assert.equal(enemy.hp, enemy.maxHp);
});

test('보호막은 적의 공격을 체력보다 먼저 흡수한다', () => {
  const world = new World(freshSave('male', 'mage'));
  world.enemies = [{ x: world.player.x + 20, y: world.player.y, hp: 1000, maxHp: 1000,
    boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  world.player.shield = 1000;
  const hp = world.player.hp;
  world.tickEnemies(.02);
  assert.equal(world.player.hp, hp);
  assert(world.player.shield < 1000);
});
