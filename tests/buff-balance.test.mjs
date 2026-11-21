import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave, totalStats } = await import('../src/game/store.ts');
const { World, berserkSpeedScale, berserkAttackScale, cooldowns } = await import('../src/game/world.ts');
const { skills, skillDuration, MAX_SKILL_LEVEL } = await import('../src/game/skills.ts');
const { costumePlaybackRate } = await import('../src/game/render/heroMotion.ts');

const enemyAt = (world, distance) => {
  const enemy = { x: world.player.x + distance, y: world.player.y, hp: 1e9, maxHp: 1e9, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.enemies = [enemy];
  return enemy;
};

/**
 * 광폭 버프 3종(블러드 레이지·호크아이·아케인 실드) 밸런스 다듬기(작업 216).
 *
 * - 공격속도: `min(1.5, 1.2 + (스킬레벨-1)*.01)` — Lv.1 +20%, 레벨당 +1%, 상한 1.5배
 *   (예전 `1.5 + (레벨-1)*.08`은 Lv.1부터 +50%, Lv.30이면 3.8배였다)
 * - 공격력: `1.2 + (스킬레벨-1)*.015` — Lv.1 +20%, Lv.30 +63.5%
 * - 지속: 블러드 레이지 `6 + (레벨-1)*.2`(Lv.30 11.8초 < 쿨 14초),
 *   호크아이·아케인 실드 `7 + (레벨-1)*.17`(Lv.30 11.93초 < 쿨 16초)
 */
test('광폭 버프 공격속도·공격력 배율은 Lv.1 +20%에서 시작하고 공속은 1.5배에서 멈춘다', () => {
  assert.equal(berserkSpeedScale(1), 1.2);
  assert(Math.abs(berserkSpeedScale(5) - 1.24) < 1e-9);
  assert(Math.abs(berserkSpeedScale(30) - 1.49) < 1e-9);
  assert.equal(berserkSpeedScale(60), 1.5, '상한 1.5배');
  assert.equal(berserkAttackScale(1), 1.2);
  assert(Math.abs(berserkAttackScale(30) - 1.635) < 1e-9);
  // 예전 식과 비교: Lv.1 공속 1.5배·Lv.30 3.82배 → 이제 1.2·1.49배
  assert(berserkSpeedScale(1) < 1.5 && berserkSpeedScale(30) < 1.5);
});

test('버프 지속은 어떤 레벨에서도 쿨타임보다 짧다(무한 유지 없음)', () => {
  assert.equal(skillDuration('warcry', 1), 6);
  assert(Math.abs(skillDuration('warcry', MAX_SKILL_LEVEL) - 11.8) < 1e-9);
  assert(skillDuration('warcry', MAX_SKILL_LEVEL) < skills.warcry.cooldown, '14초 쿨보다 짧다');
  for (const id of ['hawkEye', 'arcaneShield']) {
    assert.equal(skillDuration(id, 1), 7);
    const max = skillDuration(id, MAX_SKILL_LEVEL);
    assert(Math.abs(max - 11.93) < 1e-9, `${id} Lv.30 ${max}`);
    assert(max < skills[id].cooldown, `16초 쿨보다 짧다: ${id}`);
  }
  // 표기 문구도 새 수치와 맞는다.
  assert.match(skills.warcry.power, /공격력 × 1\.2/);
  assert.match(skills.warcry.description, /6초/);
  assert.match(skills.hawkEye.description, /7초/);
  assert.match(skills.arcaneShield.description, /7초/);
  assert.match(skills.hawkEye.power, /공격력 × 1\.2/);
  assert.match(skills.arcaneShield.power, /공격력 × 1\.2/);
});

test('블러드 레이지를 걸면 공격 쿨다운이 1/1.2로 줄고 피해는 1.2배가 된다', () => {
  const save = freshSave('male', 'warrior');
  save.learned = ['warcry']; save.quickSlots = ['warcry', null, null]; save.skillLevels = { warcry: 1 };
  const world = new World(save); world.spawnTimer = 999; world.critRoll = () => 1;
  const target = enemyAt(world, 40);
  const attack = totalStats(save).attack;
  world.action('warcry');
  assert(Math.abs(world.player.berserk - 6) < 1e-9, 'Lv.1 지속 6초');
  assert.equal(world.player.berserkLevel, 1);
  // 버프 중 평타: 쿨다운은 기본의 1/1.2, 피해는 1.2배.
  world.action('attack');
  assert(Math.abs(world.cooldown.attack - cooldowns.attack / 1.2) < 1e-9, 'cooldowns.attack / 1.2');
  assert(Math.abs((1e9 - target.hp) - attack * 1.2 * 1.6) < 1e-4, '공격력 1.2배 × 평타 1.6배');
});

test('고레벨 버프도 공속은 1.49배까지만 올라간다(쿨다운 역수)', () => {
  const save = freshSave('male', 'warrior');
  save.learned = ['warcry']; save.quickSlots = ['warcry', null, null]; save.skillLevels = { warcry: 30 };
  const world = new World(save); world.spawnTimer = 999;
  enemyAt(world, 40);
  world.action('warcry');
  assert(Math.abs(world.player.berserk - 11.8) < 1e-9, 'Lv.30 지속 11.8초');
  world.action('attack');
  assert(Math.abs(world.cooldown.attack - cooldowns.attack / 1.49) < 1e-9);
  // 시각 재생 배율도 같은 식을 쓴다(쿨다운 × 배율 = 기본 쿨다운).
  const rate = costumePlaybackRate({ speed: 0, berserk: 1, berserkLevel: 30 });
  assert(Math.abs(rate - 1.49) < 1e-9);
  assert(Math.abs(world.cooldown.attack * rate - cooldowns.attack) < 1e-9);
});
