import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { chainLightningCount } = await import('../src/game/skills.ts');
const { CHAIN_LIGHTNING_JUMP_RADIUS } = await import('../src/game/battle/skillAreas.ts');
const { World } = await import('../src/game/world.ts');

const enemyAt = (world, x, y) => {
  const enemy = { x, y, hp: 100000, maxHp: 100000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.enemies.push(enemy);
  return enemy;
};

test('체인 라이트닝의 전이 대상 상한은 Lv.1/5/10에 3/4/5명이다', () => {
  assert.equal(chainLightningCount(1), 3);
  assert.equal(chainLightningCount(4), 3);
  assert.equal(chainLightningCount(5), 4);
  assert.equal(chainLightningCount(9), 4);
  assert.equal(chainLightningCount(10), 5);
  assert.equal(chainLightningCount(30), 5);
  assert(CHAIN_LIGHTNING_JUMP_RADIUS > 70);
});

for (const [level, maximum] of [[1, 3], [10, 5]]) test(`Lv.${level} 번개는 첫 적 뒤 가까운 적에게 차례로 전이해 ${maximum}명까지만 맞힌다`, () => {
  const save = freshSave('male', 'mage');
  save.learned = ['chainLightning']; save.quickSlots = ['chainLightning', null, null];
  save.skillLevels = { chainLightning: level };
  const world = new World(save); world.spawnTimer = 999; world.enemies = []; world.critRoll = () => 1;
  const enemies = Array.from({ length: 6 }, (_, index) => enemyAt(world, world.player.x + 120 + index * 74, world.player.y));
  world.action('chainLightning');
  world.save.quickSlots = [null, null, null]; world.cooldown.attack = Number.POSITIVE_INFINITY;
  assert.equal(world.effects.some(effect => effect.kind === 'shot' && effect.source === 'chainLightning'), false, '전기 구슬은 없다');
  const originArc = world.effects.find(effect => effect.kind === 'chainArc' && effect.hits === 0);
  assert(originArc && originArc.x === world.player.x && originArc.tx === enemies[0].x, '시전자에서 첫 적까지 전기가 이어진다');
  assert(enemies[0].hp < enemies[0].maxHp, '첫 적이 먼저 맞는다');
  for (let step = 0; step < 20; step++) world.update(1 / 60);
  const chain = world.effects.find(effect => effect.kind === 'chainCast');
  assert(chain && chain.hits >= 2, '전기가 다음 적에게 전이한다');
  assert(world.effects.includes(originArc), '전이 중에도 처음 전기 줄기가 끊어지지 않는다');
  for (let step = 0; step < 50; step++) world.update(1 / 60);
  const struck = enemies.filter(enemy => enemy.hp < enemy.maxHp);
  assert.equal(struck.length, maximum);
  assert.deepEqual(struck, enemies.slice(0, maximum), '직전 대상에서 가장 가까운 미피격 적에게 순서대로 전이');
  assert.equal(enemies[maximum].hp, enemies[maximum].maxHp, '상한 밖 적은 맞지 않는다');
});
