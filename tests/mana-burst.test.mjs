import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { manaBurstFalloff } = await import('../src/game/skills.ts');
const { World } = await import('../src/game/world.ts');

test('마력 폭발은 중심 피해가 강하고 바깥쪽으로 점차 약해진다', () => {
  assert.equal(manaBurstFalloff(0, 96), 1);
  assert.equal(manaBurstFalloff(38, 96), 1);
  assert(Math.abs(manaBurstFalloff(96, 96) - .55) < 1e-9);
  assert(manaBurstFalloff(70, 96) < 1);
  assert(manaBurstFalloff(70, 96) > .55);
});

test('마력 폭발은 응축 후 중심과 외곽을 한 번씩 때린다', () => {
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
  assert(burst && burst.nextHit === burst.duration * .5, '응축 뒤 터진다');
  world.update(.2);
  assert.equal(center.hp, center.maxHp, '응축 중에는 피해가 없다');
  world.update(.3);
  assert(center.hp < edge.hp && edge.hp < edge.maxHp, '중심이 외곽보다 강하다');
  assert.equal(outside.hp, outside.maxHp, '범위 밖은 맞지 않는다');
});
