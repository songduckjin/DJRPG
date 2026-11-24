import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { skillArea } = await import('../src/game/battle/skillAreas.ts');
const { skillDamageScale } = await import('../src/game/skills.ts');
const { World } = await import('../src/game/world.ts');

const enemyAt = (world, x) => {
  const enemy = { x, y: world.player.y, hp: 100000, maxHp: 100000, boss: false,
    hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.enemies.push(enemy); return enemy;
};

test('메테오는 스킬 레벨과 함께 피해와 폭발 반경이 커진다', () => {
  assert.equal(skillArea('meteorStrike', 1).radius, 110);
  assert.equal(skillArea('meteorStrike', 10).radius, 164);
  assert(skillDamageScale(10) > skillDamageScale(1));
  const save = freshSave('male', 'mage');
  save.learned = ['meteorStrike']; save.quickSlots = ['meteorStrike', null, null];
  const world = new World(save); world.spawnTimer = 999; world.enemies = []; world.critRoll = () => 1;
  const center = enemyAt(world, world.player.x + 120);
  const edge = enemyAt(world, center.x + 75);
  const outside = enemyAt(world, center.x + 155);
  world.action('meteorStrike');
  world.save.quickSlots = [null, null, null]; world.cooldown.attack = Number.POSITIVE_INFINITY;
  const meteor = world.effects.find(effect => effect.kind === 'burst' && effect.source === 'meteorStrike');
  assert(meteor && meteor.radius === 110 && meteor.nextHit === meteor.duration * .48);
  world.update(.4);
  assert.equal(center.hp, center.maxHp, '운석이 떨어지기 전에는 피해가 없다');
  world.update(.3);
  assert(center.hp < center.maxHp && edge.hp < edge.maxHp);
  assert.equal(outside.hp, outside.maxHp);
});

test('워터 캐논은 고정된 한 방향의 여러 적을 지속해서 때린다', () => {
  assert.equal(skillArea('arcaneOverlord', 1).projectileRadius, 42);
  assert.equal(skillArea('arcaneOverlord', 10).projectileRadius, 60);
  const save = freshSave('female', 'mage');
  save.learned = ['arcaneOverlord']; save.quickSlots = ['arcaneOverlord', null, null];
  const world = new World(save); world.spawnTimer = 999; world.enemies = []; world.critRoll = () => 1;
  const center = enemyAt(world, world.player.x + 150);
  const near = enemyAt(world, world.player.x + 60);
  const beyond = enemyAt(world, world.player.x + 260);
  const side = enemyAt(world, world.player.x + 120);
  side.y += 80;
  world.action('arcaneOverlord');
  world.save.quickSlots = [null, null, null]; world.cooldown.attack = Number.POSITIVE_INFINITY;
  const cannon = world.effects.find(effect => effect.kind === 'waterCannon');
  assert(cannon && cannon.x === world.player.x && cannon.tx === world.player.x + 210);
  world.update(.2);
  assert(center.hp < center.maxHp && near.hp < near.maxHp, '물줄기 경로의 여러 적을 함께 때린다');
  const afterFirstPulse = center.hp;
  world.update(.4);
  assert(center.hp < afterFirstPulse, '같은 방향에 지속 피해가 들어간다');
  assert.equal(beyond.hp, beyond.maxHp);
  assert.equal(side.hp, side.maxHp);
});
