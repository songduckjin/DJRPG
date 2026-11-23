import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave, totalStats } = await import('../src/game/store.ts');
const { iceBoltProfile } = await import('../src/game/skills.ts');
const { World } = await import('../src/game/world.ts');

const enemyAt = (world, x, y, hp = 100000) => {
  const enemy = { x, y, hp, maxHp: hp, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.enemies.push(enemy);
  return enemy;
};

test('아이스 볼트는 레벨이 오를수록 약한 피해·구슬 지속시간·눈싸라기 수가 조금씩 늘어난다', () => {
  const first = iceBoltProfile(1), last = iceBoltProfile(10);
  assert.equal(first.power, .65);
  assert(Math.abs(last.power - .83) < 1e-9);
  assert(first.power < last.power && last.power < 1, '만렙에도 공격력 1배 미만');
  assert(first.orbDuration < last.orbDuration && last.orbDuration > 1.8);
  assert.equal(first.flakeCount, 6);
  assert.equal(last.flakeCount, 18);
  for (let level = 2; level <= 10; level++) {
    assert(iceBoltProfile(level).power > iceBoltProfile(level - 1).power);
    assert(iceBoltProfile(level).orbDuration > iceBoltProfile(level - 1).orbDuration);
    assert(iceBoltProfile(level).flakeCount >= iceBoltProfile(level - 1).flakeCount);
  }
});

test('얼음 구슬 한 발은 시전자에서 전진하며 눈싸라기로 둔화하고 적에 닿으면 사라진다', () => {
  const save = freshSave('female', 'mage');
  save.learned = ['iceBolt']; save.quickSlots = ['iceBolt', null, null];
  save.skillLevels = { iceBolt: 10 };
  const world = new World(save); world.spawnTimer = 999; world.enemies = []; world.critRoll = () => 1;
  const target = enemyAt(world, world.player.x + 120, world.player.y + 20);
  const nearby = enemyAt(world, target.x + 14, target.y + 4);
  const distant = enemyAt(world, world.player.x - 160, world.player.y - 40);
  const before = target.hp;
  world.action('iceBolt');
  world.save.quickSlots = [null, null, null]; world.cooldown.attack = Number.POSITIVE_INFINITY;
  const orbs = world.effects.filter(effect => effect.kind === 'iceOrb');
  assert.equal(orbs.length, 1, '아이스 볼트는 항상 한 구슬');
  assert.equal(orbs[0].x, world.player.x, '시전자 위치에서 출발한다');
  assert.equal(orbs[0].level, 10, '시전 당시 스킬 레벨을 유지한다');
  assert(Math.abs(orbs[0].duration - iceBoltProfile(10).orbDuration) < 1e-9);
  world.update(1 / 60);
  assert(orbs[0].x > world.player.x, '발사 방향으로 전진한다');
  for (let step = 0; step < 60; step++) world.update(1 / 60);
  assert(Math.abs(before - target.hp - totalStats(save).attack * iceBoltProfile(10).power) < 1e-6);
  assert.equal(nearby.hp, nearby.maxHp, '눈싸라기는 주변 적에게 추가 피해를 주지 않는다');
  assert(nearby.slow > 0 && nearby.slowScale === .6, '가까운 적은 둔화된다');
  assert.equal(distant.slow, 0, '범위 밖 적은 둔화되지 않는다');
  assert.equal(world.effects.some(effect => effect.kind === 'iceOrb'), false, '적에 닿으면 구슬이 소멸한다');
});

test('적이 없으면 눈싸라기와 함께 사거리 끝까지 지속시간 동안 전진한다', () => {
  const save = freshSave('male', 'mage');
  save.learned = ['iceBolt']; save.quickSlots = ['iceBolt', null, null];
  save.skillLevels = { iceBolt: 10 };
  const world = new World(save); world.spawnTimer = 999; world.enemies = [];
  world.action('iceBolt');
  world.save.quickSlots = [null, null, null]; world.cooldown.attack = Number.POSITIVE_INFINITY;
  const orb = world.effects.find(effect => effect.kind === 'iceOrb');
  const start = { x: orb.x, y: orb.y }, end = { x: orb.tx, y: orb.ty };
  for (let step = 0; step < 55; step++) world.update(1 / 60);
  assert(world.effects.includes(orb));
  assert(orb.x > start.x && orb.x < end.x);
  assert(Math.abs((orb.x - start.x) / (end.x - start.x) - orb.age / orb.duration) < 1e-9);
  for (let step = 0; step < 65; step++) world.update(1 / 60);
  assert.equal(world.effects.includes(orb), false, '시간이 끝나면 사라진다');
});
