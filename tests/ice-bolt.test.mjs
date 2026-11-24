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

test('얼음 구슬은 적을 맞힌 뒤에도 전진하고 지속시간 동안 고드름을 내보낸다', () => {
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
  assert(before - target.hp >= totalStats(save).attack * iceBoltProfile(10).power,
    '구슬의 약한 직접 피해와 고드름 피해가 들어간다');
  assert(nearby.slow > 0 && nearby.slowScale === .6, '가까운 적은 둔화된다');
  assert(distant.slow > 0, '구슬 반경 밖 적도 고드름이 닿으면 둔화된다');
  assert(world.effects.includes(orbs[0]), '적중해도 구슬이 남는다');
  assert(orbs[0].x > target.x, '적을 지나 계속 전진한다');
  assert(world.effects.some(effect => effect.kind === 'iceShard'), '구슬에서 고드름이 나온다');
  for (let step = 0; step < 70; step++) world.update(1 / 60);
  assert.equal(world.effects.includes(orbs[0]), false, '구슬은 지속시간이 끝나야 사라진다');
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

test('고드름은 구슬의 52px 둔화 반경을 넘어 날아가 먼 적도 맞힌다', () => {
  const save = freshSave('male', 'mage');
  save.learned = ['iceBolt']; save.quickSlots = ['iceBolt', null, null];
  const world = new World(save); world.spawnTimer = 999; world.enemies = []; world.critRoll = () => 1;
  world.action('iceBolt');
  world.save.quickSlots = [null, null, null]; world.cooldown.attack = Number.POSITIVE_INFINITY;
  const far = enemyAt(world, world.player.x - 200, world.player.y);
  for (let step = 0; step < 70; step++) world.update(1 / 60);
  assert(far.hp < far.maxHp, '고드름이 구슬 사거리 밖의 적에게 약한 피해를 준다');
  assert(far.slow > 0, '고드름 적중도 둔화를 건다');
  assert(world.effects.some(effect => effect.kind === 'iceShard' && Math.hypot(effect.x - world.player.x, effect.y - world.player.y) > 100),
    '고드름은 정해진 폭발 반경에서 사라지지 않는다');
});
