import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { manaBurstShield } = await import('../src/game/skills.ts');
const { World } = await import('../src/game/world.ts');

test('마력 폭발 실드는 레벨에 따라 최대 체력의 25%에서 70%까지 증가한다', () => {
  assert.equal(manaBurstShield(1, 1000), 250);
  assert.equal(manaBurstShield(5, 1000), 450);
  assert.equal(manaBurstShield(10, 1000), 700);
});

test('마력 폭발은 적에게 피해를 주지 않고 자신에게 실드를 만든다', () => {
  const save = freshSave('female', 'mage');
  save.learned = ['manaBurst']; save.quickSlots = ['manaBurst', null, null];
  const world = new World(save); world.spawnTimer = 999; world.enemies = []; world.critRoll = () => 1;
  const enemy = (x, y) => {
    const target = { x, y, hp: 100000, maxHp: 100000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
    world.enemies.push(target); return target;
  };
  const center = enemy(world.player.x + 120, world.player.y);
  const edge = enemy(center.x + 80, center.y);
  const outside = enemy(center.x + 145, center.y);
  world.action('manaBurst');
  world.save.quickSlots = [null, null, null]; world.cooldown.attack = Number.POSITIVE_INFINITY;
  const burst = world.effects.find(effect => effect.kind === 'burst' && effect.source === 'manaBurst');
  assert(burst && burst.x === world.player.x && burst.nextHit === burst.duration * .5, '자신 주변에서 응축 뒤 터진다');
  world.update(.2);
  assert.equal(center.hp, center.maxHp, '응축 중에는 피해가 없다');
  world.update(.3);
  assert.equal(center.hp, center.maxHp);
  assert.equal(edge.hp, edge.maxHp);
  assert.equal(outside.hp, outside.maxHp);
  assert.equal(world.player.shield, manaBurstShield(1, world.player.hp), '폭발과 함께 실드 체력이 생긴다');
  const close = enemy(world.player.x + 48, world.player.y);
  const beforeHealth = world.player.hp, beforeShield = world.player.shield;
  world.player.hit = 0;
  world.update(.1);
  assert(close.hp > 0 && world.player.shield < beforeShield, '다음 피격은 실드부터 깎인다');
  assert.equal(world.player.hp, beforeHealth, '실드가 남으면 생명력은 보존된다');
  world.enemies = [];
  world.update(5.1);
  assert.equal(world.player.shield, 0, '5초 뒤 남은 실드도 사라진다');
});
