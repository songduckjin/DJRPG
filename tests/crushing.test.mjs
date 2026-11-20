import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave, totalStats } = await import('../src/game/store.ts');
const { World, crushHits, crushInterval, crushPoseSpan, crushTrailLife, crushLabelOffset } = await import('../src/game/world.ts');
const { skillOrder, skills, canLearn, skillDamageScale } = await import('../src/game/skills.ts');

/**
 * 딜레이 크러싱(작업 212) — 붉은보석1식 단일 타겟 10연타 + 전사 잔상.
 *
 * 요구 6가지를 코드 상태로 검증한다.
 *  1. 본체가 빠르게 10번 공격한다            → `crush.hits` 0→10, `attackPoseSpan` 이 한 타 길이
 *  2. 타마다 이전 공격 동작의 잔상이 남는다    → 잔상 10점(동시에 최대 5점, 0.3초씩 산다)
 *  3. 잔상은 본체보다 낮은 불투명도           → alpha 0.14~0.42 계단식
 *  4. 10회의 독립 타격 판정                   → 적 체력이 10번 따로 줄고, 타마다 ±8% 흔들림
 *  5. 타마다 데미지 숫자                      → `hit` 이펙트 10개, 팝업 자리도 10가지
 *  6. 10타가 끝나면 잔상이 사라지고 idle 복귀  → 잔상 목록이 비고 `attackPose`·`attackPoseSpan` 복귀
 */

function battlefield(options = {}) {
  const save = freshSave();
  save.learned = ['crushing'];
  save.quickSlots = ['crushing', null, null];
  if (options.level) save.skillLevels = { crushing: options.level };
  const world = new World(save);
  world.spawnTimer = 999;            // 사냥 도중 새 적이 끼어들지 않게
  world.cooldown.attack = 999;       // 평타 피해가 섞이지 않게
  const enemy = world.enemies[0];
  enemy.x = 60; enemy.y = 0;
  enemy.hp = enemy.maxHp = options.hp ?? 5_000_000;
  return { save, world, enemy };
}

/** 발동 즉시 들어가는 첫 타를 기록한다. */
function firstStrike(world, watch, cast) {
  const before = new Map(watch.map(enemy => [enemy, enemy.hp]));
  cast();
  return watch.flatMap(enemy => {
    const dealt = before.get(enemy) - enemy.hp;
    return dealt > 0 ? [{ enemy, amount: dealt }] : [];
  });
}

/** `watch` 적들의 체력 감소와 그동안 살아 있던 잔상·팝업을 모으며 시간을 흘린다. */
function advance(world, seconds, watch, step = 1 / 120) {
  const strikes = [], popups = new Map(), images = new Set();
  const previous = new Map(watch.map(enemy => [enemy, enemy.hp]));
  for (let index = 0; index < Math.ceil(seconds / step); index++) {
    world.update(step);
    for (const enemy of watch) {
      const before = previous.get(enemy), hp = enemy.hp;
      if (hp < before) { strikes.push({ enemy, amount: before - hp }); previous.set(enemy, hp); }
    }
    for (const effect of world.effects) {
      if (effect.kind === 'hit' && effect.labelOffsetX !== undefined) popups.set(effect, `${effect.labelOffsetX},${effect.labelOffsetY}`);
    }
    for (const image of world.afterimages) images.add(image);
  }
  return { strikes, popups: [...popups.values()], images: [...images] };
}

test('전사 액티브 순서 — 딜레이 크러싱·드래곤 트위스터가 마지막 두 자리(18·24)', () => {
  assert.deepEqual([...skillOrder], ['slash2', 'slam', 'warcry', 'power', 'destroy', 'hell', 'crushing', 'spin']);
  assert.deepEqual(skillOrder.map(id => skills[id].level), [2, 4, 5, 7, 10, 14, 18, 24]);
  assert.equal(skillOrder.length, 8);
  assert.equal(canLearn(17, skills.crushing.level), false);
  assert.equal(canLearn(18, skills.crushing.level), true);
  assert.equal(canLearn(23, skills.spin.level), false);
  assert.equal(canLearn(24, skills.spin.level), true);
});

test('한 번 발동에 10타가 따로 들어가고, 타마다 팝업 자리가 다르다', () => {
  const { save, world, enemy } = battlefield();
  const expectedTotal = totalStats(save).attack * 3.4 * skillDamageScale(1);
  const strikes = firstStrike(world, [enemy], () => world.action('crushing'));
  assert.equal(strikes.length, 1, '첫 타는 발동 즉시 들어간다');
  assert.equal(world.crush.hits, 1);
  assert.equal(world.attackPoseSpan, crushPoseSpan, '한 타의 공격 동작은 62ms짜리다');
  assert.equal(world.afterimages.length, 1);
  const rest = advance(world, 1.2, [enemy]);
  const all = [...strikes, ...rest.strikes];
  assert.equal(all.length, crushHits, `10타가 각각 따로 들어가야 한다(실제 ${all.length}타)`);
  assert(all.every(strike => strike.enemy === enemy));
  const total = all.reduce((sum, strike) => sum + strike.amount, 0);
  assert(Math.abs(total - expectedTotal) <= expectedTotal * .05, `총 피해 ${total} vs 기대 ${expectedTotal} — 예전 한 방(× 3.4)에서 늘지 않는다`);
  const perHit = expectedTotal / crushHits;
  for (const strike of all) assert(Math.abs(strike.amount - perHit) <= perHit * .09, `타마다 ±8% 안에서 따로 판정한다(${strike.amount})`);
  assert.equal(rest.popups.length, crushHits, '데미지 숫자도 10개');
  assert.equal(new Set(rest.popups).size, crushHits, '숫자마다 자리가 달라 겹쳐 한 개로 보이지 않는다');
  assert.deepEqual(crushLabelOffset(0), { x: -12, y: -8 });
  assert.deepEqual(crushLabelOffset(9), { x: 12, y: 4 });
});

test('단일 타겟 — 사거리 안 다른 적과 사거리 밖 적은 맞지 않는다', () => {
  const { world, enemy } = battlefield();
  const near = { x: 0, y: 110, hp: 5_000_000, maxHp: 5_000_000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  // 사거리(125) 밖 — 1초 동안 38px 다가와도 125 안으로 들어오지 않는다.
  const far = { x: 200, y: 0, hp: 5_000_000, maxHp: 5_000_000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.enemies.push(near, far);
  const strikes = firstStrike(world, [enemy, near, far], () => world.action('crushing'));
  const { strikes: rest } = advance(world, .5, [enemy, near, far], 1 / 240);
  const all = [...strikes, ...rest];
  assert.equal(all.length, 9, '한 프레임에 한 마리만 맞는다(첫 타 포함 9타까지)');
  assert(all.every(strike => strike.enemy === enemy), '가장 가까운 한 마리만 맞는다');
  assert.equal(near.hp, 5_000_000);
  assert.equal(far.hp, 5_000_000, '사거리 밖 적은 맞지 않는다');
});

test('대상이 중간에 쓰러지면 사거리 안 다음 적으로 이어진다', () => {
  const save = freshSave();
  save.learned = ['crushing']; save.quickSlots = ['crushing', null, null];
  const world = new World(save);
  world.spawnTimer = 999; world.cooldown.attack = 999;
  const first = world.enemies[0];
  first.x = 40; first.y = 0; first.hp = first.maxHp = 1;
  const next = { x: 60, y: 10, hp: 5_000_000, maxHp: 5_000_000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.enemies.push(next);
  const strikes = firstStrike(world, [first, next], () => world.action('crushing'));
  const { strikes: rest } = advance(world, 1.0, [first, next]);
  const all = [...strikes, ...rest];
  assert.equal(all.length, crushHits, '대상이 바뀌어도 타격 횟수는 10회 그대로다');
  assert(all.some(strike => strike.enemy === first));
  assert(all.some(strike => strike.enemy === next), '쓰러진 뒤 남은 타가 다음 적에게 들어간다');
  assert(!world.enemies.includes(first));
});

test('잔상은 타마다 남고 본체보다 낮은 불투명도로 10번째 타 뒤 사라진다', () => {
  const { world } = battlefield();
  const cast = firstStrike(world, [], () => world.action('crushing'));
  assert.equal(cast.length, 0);
  assert.equal(world.crush.next, crushInterval, '두 번째 타는 62ms 뒤다');
  const { images } = advance(world, crushHits * crushInterval, []);
  assert.equal(images.length, crushHits, '10타 각각이 잔상을 하나씩 남긴다');
  for (const image of images) {
    assert(image.alpha >= .14 && image.alpha <= .42, `잔상 불투명도 ${image.alpha} 는 0.14~0.42 안이다`);
    assert(Math.abs(image.x - world.player.x) <= 14 && Math.abs(image.y - world.player.y) <= 14, '잔상은 본체에서 ±14px 안에만 흩어진다');
    assert.equal(image.facingSide, world.player.facingSide);
    assert.equal(image.duration, crushTrailLife);
  }
  assert.equal(new Set(images.map(image => image.alpha)).size, crushHits, '타마다 불투명도가 계단식으로 다르다');
  assert(world.afterimages.length <= 5, '동시에 보이는 잔상은 0.3초 안에 남은 몇 점뿐이다');
  advance(world, crushTrailLife + .1, []);
  assert.equal(world.afterimages.length, 0, '마지막 타 뒤 잔상 목록이 깨끗이 비워진다');
  assert.equal(world.crush, undefined, '시퀀스가 닫힌다');
  assert.equal(world.attackPose, 0, '본체는 기본 대기 모션(idle)으로 돌아간다');
  assert.equal(world.attackPoseSpan, .32, '다음 평타는 원래 공격 동작 길이로 돈다');
});

test('스킬 레벨만큼 총 피해가 커지고, 예전 한 방(× 3.4)보다 세지 않는다', () => {
  const { save, world, enemy } = battlefield({ level: 5 });
  const expected = totalStats(save).attack * 3.4 * skillDamageScale(5);
  const strikes = firstStrike(world, [enemy], () => world.action('crushing'));
  const { strikes: rest } = advance(world, 1.0, [enemy]);
  const all = [...strikes, ...rest];
  const total = all.reduce((sum, strike) => sum + strike.amount, 0);
  assert.equal(all.length, crushHits);
  assert(Math.abs(total - expected) <= expected * .05);
});

test('나머지 전사 스킬도 종전처럼 한 방이 들어간다', () => {
  for (const id of ['slash2', 'slam', 'warcry', 'power', 'destroy', 'hell', 'spin']) {
    const save = freshSave();
    save.learned = [id]; save.quickSlots = [id, null, null];
    const world = new World(save);
    world.spawnTimer = 999; world.cooldown.attack = 999;
    const enemy = world.enemies[0];
    enemy.x = 60; enemy.hp = enemy.maxHp = 5_000_000;
    const before = enemy.hp;
    world.action(id);
    advance(world, 2, [enemy]);
    if (id === 'warcry') assert(world.player.berserk > 0, '블러드 레이지는 종전처럼 버프만 건다');
    else assert(enemy.hp < before, `${id} 스킬이 피해를 준다`);
  }
});
