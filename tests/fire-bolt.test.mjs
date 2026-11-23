import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave, totalStats } = await import('../src/game/store.ts');
const { World, fireBoltCount, fireBoltScale, fireBoltSpots } = await import('../src/game/world.ts');
const { skillDamageScale: damageScale } = await import('../src/game/skills.ts');

const enemyAt = (world, x, y, hp = 100000) => {
  const enemy = { x, y, hp, maxHp: hp, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.enemies.push(enemy);
  return enemy;
};
const fireShots = world => world.effects.filter(effect => effect.kind === 'shot' && effect.variant === 'fire');

/**
 * 마법사 1번 스킬 `파이어 볼트` 개편(작업 216).
 *
 * 머리 위에 화염구를 N발 띄웠다가(개수는 스킬 레벨), 각 자리에서 목표 한 마리를 향해 곡선 없이
 * 곧장 일직선으로 한 대상만 타격한다. 크기는 레벨에 따라 커지고, 합계 위력은 ×1.5다.
 */
test('화염구 개수는 Lv.1/3/5/8/10에 1/2/3/4/5발', () => {
  assert.equal(fireBoltCount(1), 1);
  assert.equal(fireBoltCount(2), 1);
  assert.equal(fireBoltCount(3), 2);
  assert.equal(fireBoltCount(5), 3);
  assert.equal(fireBoltCount(8), 4);
  assert.equal(fireBoltCount(9), 4);
  assert.equal(fireBoltCount(10), 5);
  assert.equal(fireBoltCount(30), 5, '최대 5발');
});

test('화염구 크기는 레벨에 따라 점진적으로 커진다', () => {
  assert.equal(fireBoltScale(1), 1);
  assert(Math.abs(fireBoltScale(10) - 1.45) < 1e-9);
  assert.equal(fireBoltScale(30), fireBoltScale(10), '스킬 최대 레벨 뒤에는 크기가 더 늘지 않는다');
  for (let level = 2; level <= 10; level++) assert(fireBoltScale(level) > fireBoltScale(level - 1));
});

test('Lv.10 화염구 5개는 머리 위 윗줄 3개·아랫줄 2개로 엇갈린다', () => {
  const one = fireBoltSpots(100, 200, 1);
  assert.equal(one.length, 1);
  // 아이소 투영에서 화면 위쪽은 월드 (−a, −a)다 — 정수리 위로 떠 있다.
  assert(one[0].x < 100 && one[0].y < 200, '머리 위(화면 위쪽)에 있다');
  const five = fireBoltSpots(100, 200, 5);
  assert.equal(five.length, 5);
  // 아이소 투영 화면 좌표로 되돌려 윗줄 3개·아랫줄 2개의 간격과 높이를 확인한다.
  const screen = spot => ({ x: (spot.x - 100 - (spot.y - 200)) * .86, y: ((spot.x - 100) + (spot.y - 200)) * .43 });
  const points = five.map(screen);
  for (let index = 0; index < 5; index++) {
    const expectedX = [-52, 0, 52, -26, 26][index];
    const expectedY = index < 3 ? -110 : -70;
    assert(Math.abs(points[index].x - expectedX) < 1e-6, `화염구 ${index + 1}의 가로 위치`);
    assert(Math.abs(points[index].y - expectedY) < 1e-6, `화염구 ${index + 1}의 높이`);
  }
  assert(points[0].y < points[3].y && points[2].y < points[4].y, '윗줄 3개가 아랫줄 2개보다 높다');
  assert(points[3].x > points[0].x && points[3].x < points[1].x, '아랫줄이 윗줄 사이에 엇갈린다');
  const two = fireBoltSpots(100, 200, 2).map(screen);
  assert(Math.abs(two[0].x + two[1].x) < 1e-6 && Math.abs(two[0].y - two[1].y) < 1e-6, '적은 발수는 기존 좌우 대칭을 유지한다');
});

test('Lv.10에 5발이 같은 목표 한 마리로 날아가고, 합계 피해는 공격력 ×1.5다', () => {
  const save = freshSave('male', 'mage');
  save.learned = ['fireBolt']; save.quickSlots = ['fireBolt', null, null];
  save.skillLevels = { fireBolt: 10 };
  const world = new World(save); world.spawnTimer = 999;
  world.enemies = [];
  const target = enemyAt(world, world.player.x + 120, world.player.y + 20);
  const bystander = enemyAt(world, world.player.x - 160, world.player.y - 40);
  const attack = totalStats(save).attack;
  world.action('fireBolt');
  // 자동 사냥이 평타·스킬을 함께 쓰지 않게 잠근다 — 이 테스트는 파이어 볼트 한 번의 피해만 본다.
  world.save.quickSlots = [null, null, null]; world.cooldown.attack = Number.POSITIVE_INFINITY;

  const shots = fireShots(world);
  assert.equal(shots.length, 5, 'Lv.10은 화염구 5발');
  for (const shot of shots) {
    // 발사 전 머리 위에 떠 있는 시간이 있고, 그 뒤에만 날아간다.
    assert(shot.launch > 0 && shot.launch < shot.duration, '떠 있는 시간(launch)이 비행 시간에 더해진다');
    assert(shot.size > 1, '레벨만큼 커진 화염구');
    assert(Math.abs(shot.tx - target.x) < 1e-9 && Math.abs(shot.ty - target.y) < 1e-9, '모두 같은 목표를 향한다');
    assert.equal(shot.targets, 1, '한 발은 한 마리만 때린다');
    assert(shot.x < world.player.x && shot.y < world.player.y, '출발점은 캐릭터가 아니라 머리 위');
  }
  // 궤적은 직선이다 — 곡선을 그리는 필드가 없고, 발사점·도착점만 있다.
  assert(shots.every(shot => shot.tx !== undefined && shot.ty !== undefined));

  // 화염구가 모두 도착할 때까지 진행한다(피해는 도착 시점에 한 번씩).
  for (let step = 0; step < 90; step++) world.update(1 / 60);
  const dealt = 100000 - target.hp;
  const expected = attack * 1.5 * damageScale(10);
  assert(Math.abs(dealt - expected) < 1e-6, `합계 ${dealt} = 하향한 위력 ${expected}`);
  const perBolt = expected / fireBoltCount(10);
  assert(Math.abs(dealt / fireBoltCount(10) - perBolt) < 1e-6, '위력을 발 수로 나눠 한 발씩 들어간다');
  assert.equal(bystander.hp, 100000, '목표가 아닌 다른 적은 맞지 않는다');
});

test('목표가 먼저 쓰러져도 남은 화염구는 발사한 자리에서 곧장 날아가 사라진다', () => {
  const save = freshSave('male', 'mage');
  save.learned = ['fireBolt']; save.quickSlots = ['fireBolt', null, null];
  save.skillLevels = { fireBolt: 10 };
  const world = new World(save); world.spawnTimer = 999;
  world.enemies = [];
  const target = enemyAt(world, world.player.x + 130, world.player.y + 10, 1);
  const bystander = enemyAt(world, target.x + 12, target.y + 4);
  world.action('fireBolt');
  world.save.quickSlots = [null, null, null]; world.cooldown.attack = Number.POSITIVE_INFINITY;
  assert.equal(fireShots(world).length, 5, 'Lv.10은 5발');
  for (let step = 0; step < 120; step++) world.update(1 / 60);
  assert.equal(target.hp <= 0, true, '한 발에 쓰러진다');
  assert.equal(bystander.hp, 100000, '남은 탄은 다른 적으로 옮겨 맞히지 않는다');
  assert.equal(fireShots(world).length, 0, '남은 화염구도 도착한 뒤 정리된다');
  assert(world.effects.every(effect => effect.kind !== 'shot'), '날아가던 탄이 남지 않는다');
});
