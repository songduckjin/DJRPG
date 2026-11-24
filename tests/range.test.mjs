import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { World, archerAttackRange, archerStopRange, mageAttackRange, mageStopRange } = await import('../src/game/world.ts');
const { archerSkillOrder, mageSkillOrder, skills, skillRange } = await import('../src/game/skills.ts');

/**
 * 작업 244 — 궁수·마법사 사거리 소폭 상향(궁수 330/180 · 마법사 285/160).
 *
 * 바뀐 것은 `world.ts`의 사거리·정지 거리 두 쌍과 `skills.ts`의 원거리 공격 스킬 사거리다. 여기서 보는 것은
 * ① 새 정지 거리(궁수 180 · 마법사 160)가 **실제로 서서 쏘는 거리**가 됐는지(종전 150·130이면 걸어가던 자리),
 * ② 그 자리와 사거리 끝에서 쏜 탄환이 **도착해서** 맞는지(탄환 수명이 고정값이면 멀어진 만큼 사라진다),
 * ③ 직업 순서(궁수 > 마법사 > 전사)와 스킬 사거리 비례가 지켜지는지다.
 */

/** 필드 경계(horizontal 250 · vertical 400) 안에서 플레이어로부터 `distance` 만큼 떨어진 적.
 *  코너 방향(325, 75)을 쓰면 두 경계를 동시에 채우는 방향이라 330까지도 필드 안 좌표로 남는다. */
function enemyInField(world, distance) {
  const reach = Math.hypot(325, 75);
  const enemy = {
    x: world.player.x + 325 / reach * distance, y: world.player.y + 75 / reach * distance,
    hp: 100000, maxHp: 100000, boss: false, elite: false, hit: 0, step: 0, moving: false,
    knockX: 0, knockY: 0, slow: 0
  };
  world.enemies = [enemy];
  return enemy;
}

function rangedWorld(job, gender = 'male') {
  const world = new World(freshSave(gender, job));
  world.spawnTimer = 999;
  world.player.x = 0; world.player.y = 0;
  return world;
}

function stepUntilHit(world, enemy, frames = 120) {
  for (let index = 0; index < frames && enemy.hp === 100000; index++) world.update(.016);
}

test('작업 244 확정 수치 — 궁수 330/180 · 마법사 285/160 · 전사 90 그대로', () => {
  assert.equal(archerAttackRange, 330); assert.equal(archerStopRange, 180);
  assert.equal(mageAttackRange, 285); assert.equal(mageStopRange, 160);
  assert(archerAttackRange > mageAttackRange && mageAttackRange > 90, '사거리: 궁수 > 마법사 > 전사');
  assert(archerStopRange > mageStopRange && mageStopRange > 90, '정지 거리: 궁수 > 마법사 > 전사');
  // 정지 거리는 종전 비율(평타의 약 55%)대로 함께 올라간다.
  for (const [attack, stop] of [[archerAttackRange, archerStopRange], [mageAttackRange, mageStopRange]]) {
    const ratio = stop / attack;
    assert(ratio > .5 && ratio < .6, `정지 거리 비율이 어긋났다: ${ratio}`);
  }
});

test('궁수는 새 정지 거리(180) 안이면 서서 쏘고, 그 자리에서 화살이 도착해 맞는다', () => {
  const world = rangedWorld('archer');
  // 종전 정지 거리(150)보다 멀고 새 정지 거리(180) 안인 자리 — 이제는 걸어가지 않고 여기서 쏜다.
  const enemy = enemyInField(world, archerStopRange - 10);
  world.update(.016);
  assert.equal(world.pursuing, false, '정지 거리 안인데 다가간다');
  assert.equal(world.activeMove.x, 0);
  assert.equal(world.activeMove.y, 0);
  const shot = world.effects.find(effect => effect.kind === 'shot');
  assert(shot, '서 있는 자리에서 화살이 나가지 않았다');
  assert.equal(enemy.hp, 100000, '날아가는 동안에는 맞지 않는다');
  stepUntilHit(world, enemy);
  assert(enemy.hp < 100000, '화살이 도착하지 않았다');
});

test('마법사도 새 정지 거리(160) 안이면 서서 마법 구슬을 쏜다', () => {
  const world = rangedWorld('mage', 'female');
  const enemy = enemyInField(world, mageStopRange - 10);
  world.update(.016);
  assert.equal(world.pursuing, false, '정지 거리 안인데 다가간다');
  const shot = world.effects.find(effect => effect.kind === 'shot');
  assert(shot, '서 있는 자리에서 구슬이 나가지 않았다');
  assert.equal(shot.variant, 'fire', '여성 마법사는 붉은 화염 구슬');
  assert.equal(enemy.hp, 100000, '날아가는 동안에는 맞지 않는다');
  stepUntilHit(world, enemy);
  assert(enemy.hp < 100000, '구슬이 도착하지 않았다');
});

test('사거리 끝(궁수 320 · 마법사 275)의 표적에도 탄환이 사라지지 않고 도착한다', () => {
  const cases = [
    { job: 'archer', distance: archerAttackRange - 10, speed: 820 },
    { job: 'mage', distance: mageAttackRange - 10, speed: 760 }
  ];
  for (const { job, distance, speed } of cases) {
    const world = rangedWorld(job);
    const enemy = enemyInField(world, distance);
    // 서서 쏘는 경우를 그대로 만든다(이동 중에는 공격하지 않는 규칙은 `update` 쪽 그대로다).
    world.action('attack');
    const shot = world.effects.find(effect => effect.kind === 'shot');
    assert(shot, `${job}: 사거리 안인데 탄환이 나가지 않았다`);
    // 수명은 `거리 / 속도`라 사거리가 늘어도 탄환이 도착 전에 사라지지 않는다.
    assert(Math.abs(shot.duration - distance / speed) < .02, `${job}: 탄환 수명이 거리와 무관하다(${shot.duration})`);
    stepUntilHit(world, enemy);
    assert(enemy.hp < 100000, `${job}: 사거리 끝의 표적에 탄환이 닿지 않았다`);
  }
});

test('평타 사거리 안이라도 정지 거리 밖이면 다가가며 이동하고, 그동안에는 공격하지 않는다', () => {
  // 이 규칙은 작업 244가 건드리지 않았다 — 사거리 상향으로 바뀐 것은 '서서 쏘는 거리'(정지 거리)다.
  const world = rangedWorld('archer');
  enemyInField(world, archerAttackRange - 10);
  world.update(.016);
  assert(world.pursuing, '정지 거리 밖에서는 다가간다');
  assert.equal(world.effects.filter(effect => effect.kind === 'shot').length, 0, '이동 중에는 공격하지 않는다');
});

test('평타보다 짧은 스킬(더블 샷 265)은 그 자리에서 안 나가고, 정지 거리 안에서는 평타와 함께 나간다', () => {
  const save = freshSave('male', 'archer');
  save.learned = ['doubleShot']; save.quickSlots = ['doubleShot', null, null];
  const world = new World(save);
  world.spawnTimer = 999;
  world.player.x = 0; world.player.y = 0;
  enemyInField(world, archerAttackRange - 10);
  world.action('attack');
  assert(world.effects.some(effect => effect.kind === 'shot' && effect.source === undefined), '평타가 나가지 않았다');
  assert(!world.effects.some(effect => effect.kind === 'shot' && effect.source === 'doubleShot'), '사거리 밖인데 스킬이 나갔다');
  // 정지 거리 안(180)에서는 스킬 사거리(265) 안이므로 평타와 스킬이 함께 나간다.
  world.effects = [];
  world.cooldown.attack = 0; world.cooldown.doubleShot = 0;
  enemyInField(world, archerStopRange - 10);
  world.update(.016);
  assert(world.effects.some(effect => effect.kind === 'shot' && effect.source === 'doubleShot'), '사거리 안인데 스킬이 나가지 않았다');
});

test('원거리 스킬 사거리도 평타와 함께 올라가고, 가장 먼 스킬은 평타보다 멀리 닿는다', () => {
  // 저격 일격은 평타보다 멀리 닿아야 한다(평타만 멀어지면 '저격'이 더 짧아진다).
  assert(skillRange('snipe', 1) > archerAttackRange, `저격 사거리 ${skillRange('snipe', 1)} ≤ 평타 ${archerAttackRange}`);
  assert(Math.max(...mageSkillOrder.map(id => skills[id].range)) >= mageAttackRange, '마법사 최대 스킬 사거리가 평타보다 짧다');
  // 날아가는 공격 스킬은 정지 거리보다 멀리 닿는다 — 서 있는 자리에서 항상 쓸 수 있다.
  const flyingArcher = archerSkillOrder.filter(id => id !== 'hawkEye');
  const flyingMage = mageSkillOrder.filter(id => !['frostNova', 'arcaneShield'].includes(id));
  for (const id of flyingArcher) assert(skillRange(id, 1) > archerStopRange, `${id} 사거리가 정지 거리보다 짧다`);
  for (const id of flyingMage) assert(skillRange(id, 1) > mageStopRange, `${id} 사거리가 정지 거리보다 짧다`);
  // 실제로 늘어난 값 — 평타 상향 폭(약 18%)에 맞춰 약 15% 올렸다.
  assert.equal(skills.doubleShot.range, 265);
  assert.equal(skills.multiShot.range, 260);
  assert.equal(skills.pierceShot.range, 305);
  assert.equal(skills.iceArrow.range, 270);
  assert.equal(skills.snipe.range, 340);
  assert.equal(skills.stormVolley.range, 285);
  assert.equal(skills.arrowRain.range, 295);
  assert.equal(skills.fireBolt.range, 260);
  assert.equal(skills.iceBolt.range, 270);
  assert.equal(skills.chainLightning.range, 275);
  assert.equal(skills.manaBurst.range, 250);
  assert.equal(skills.meteorStrike.range, 285);
  // 몸을 중심으로 퍼지는 프로스트 노바와 버프는 `range`가 효과 반경이다.
  assert.equal(skills.frostNova.range, 150);
  assert.equal(skills.arcaneOverlord.range, 210);
  assert.equal(skills.hawkEye.range, 200);
  assert.equal(skills.arcaneShield.range, 120);
});
