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
test('사거리 경계(89~90)에서 추격 플래그가 공격을 삼키지 않는다', () => {
  const world = new World(freshSave()); world.spawnTimer = 999;
  const enemy = world.enemies[0]; enemy.hp = enemy.maxHp = 10000;
  for (const distance of [89.9, 89.5, 89, 85.2, 40]) {
    world.player.x = 0; world.player.y = 0;
    world.cooldown.attack = 0; world.attackPose = 0; world.effects = [];
    world.cooldown.slash2 = 0; world.cooldown.spin = 0; world.cooldown.crushing = 0; world.cooldown.slam = 0;
    enemy.x = distance; enemy.y = 0; enemy.knockX = 0; enemy.knockY = 0; enemy.hit = 0;
    // 추격해 들어오던 상태 그대로 — 예전 코드는 이 상태에서 경계에 걸치면 공격을 취소했다.
    world.chaseTarget = enemy; world.pursuing = true; world.activeMove = { x: 1, y: 0 };
    world.update(.016);
    assert.equal(Math.hypot(world.activeMove.x, world.activeMove.y), 0, `${distance}: 사거리 안에서는 걷지 않는다`);
    assert.equal(world.pursuing, false, `${distance}: 사거리 안이면 추격을 즉시 끈다`);
    assert(world.effects.some(effect => effect.kind === 'slash'), `${distance}: 사거리 안이면 바로 공격한다`);
    assert(world.cooldown.attack > 0, `${distance}: 공격이 실제로 나갔다`);
    assert(enemy.hp < 10000, `${distance}: 피해가 들어갔다`);
    assert.equal(world.player.x, 0, `${distance}: 제자리에서 때린다`);
  }
});

test('사거리 경계에서 때리다 멈추지 않고 쿨다운마다 계속 공격한다', () => {
  const world = new World(freshSave()); world.spawnTimer = 999;
  const enemy = world.enemies[0]; enemy.hp = enemy.maxHp = 100000;
  enemy.x = 89.5; enemy.y = 0;
  world.chaseTarget = enemy; world.pursuing = true;   // 추격 중 경계에 들어온 상태에서 시작
  let attacks = 0;
  for (let i = 0; i < 60; i++) {   // 6초
    enemy.x = world.player.x + 89.5; enemy.y = world.player.y;   // 넉백·접근과 무관하게 경계 고정
    world.update(.1);
    attacks += world.effects.filter(effect => effect.kind === 'slash').length;
    world.effects = [];
    assert.equal(world.activeMove.x, 0, '경계에서도 걷기 시작하지 않는다');
  }
  assert.equal(world.player.x, 0);
  assert(attacks >= 8, `6초 동안 쿨다운마다 공격했다(실제 ${attacks}회)`);
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

const dummyEnemy = (x, y, hp = 1000) => ({ x, y, hp, maxHp: hp, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });

test('평타는 사거리·부채꼴 안에서 가장 가까운 한 마리만 때린다', () => {
  const world = new World(freshSave()); world.spawnTimer = 999;
  const far = dummyEnemy(70, 4), near = dummyEnemy(40, 0);
  world.enemies = [far, near];   // 배열 순서와 무관하게 가까운 쪽이 맞는다
  world.action('attack');
  assert(near.hp < 1000, '가장 가까운 적이 맞았다');
  assert.equal(far.hp, 1000, '같은 사거리·부채꼴 안의 다른 적은 그대로다');
  assert.equal(world.effects.filter(effect => effect.kind === 'hit').length, 1, '피격 표시도 한 마리만');
  assert(near.hit > 0); assert.equal(far.hit, 0);
});

test('평타가 한 마리를 처치해도 사거리 안의 다른 적은 그대로 살아 있다', () => {
  const world = new World(freshSave()); world.spawnTimer = 999;
  const far = dummyEnemy(70, 4), near = dummyEnemy(40, 0, 1);
  world.enemies = [far, near];
  const kills = world.save.kills;
  world.action('attack');
  assert.equal(world.enemies.length, 1, '처치된 한 마리만 빠진다');
  assert.equal(world.enemies[0], far);
  assert.equal(world.save.kills, kills + 1);
});

test('액티브 스킬은 종전처럼 사거리 안의 모든 적을 때린다', () => {
  const save = freshSave(); save.learned = ['destroy']; save.quickSlots = ['destroy', null, null];
  const world = new World(save); world.spawnTimer = 999;
  const far = dummyEnemy(70, 4), near = dummyEnemy(40, 0);
  world.enemies = [far, near];
  world.action('destroy');
  assert(near.hp < 1000, '가까운 적이 맞았다');
  assert(far.hp < 1000, '먼 적도 함께 맞는다');
});
