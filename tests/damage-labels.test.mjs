import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave, totalStats } = await import('../src/game/store.ts');
const { World, enemyHitDamage, CRIT_DAMAGE_SCALE } = await import('../src/game/world.ts');
const { DAMAGE_LABEL_COLORS, damageLabelColor, damageLabelText } = await import('../src/game/render/vfx.ts');

/**
 * 피해 숫자 색·정수 표시(작업 260) — 사용자 지시
 * "피격받는 데미지는 정수표시 그리고 내가 공격하는 일반데미지는 흰색 크리티컬은 빨간색 추가데미지는 노랑색".
 */

/** 보너스 추가 데미지(%)만 가진 에픽 장비 하나 — 다른 스탯은 0이라 피해 계산에 끼어들지 않는다. */
const bonusWeapon = (bonusDmgPct) => ({
  id: 'test-bonus-weapon', name: '시험용 검', slot: 'weapon', rarity: 'epic',
  stats: { attack: 0 }, plus: 0, extraOptions: { bonusDmgPct }
});

/** 내가 때리는 세계 하나 — 적은 제자리에 두고 굴림은 인자로 고정한다. */
function strikingWorld({ crit = false, bonusDmgPct } = {}) {
  const save = freshSave();
  save.equipment = bonusDmgPct ? { weapon: bonusWeapon(bonusDmgPct) } : {};
  save.level = 30;
  const world = new World(save);
  world.spawnTimer = 999;
  world.critRoll = () => (crit ? 0 : 1);                      // 0이면 항상 치명타, 1이면 절대 아님
  const enemy = world.enemies[0];
  enemy.x = 10; enemy.y = 0; enemy.hp = enemy.maxHp = 1e9;
  return { world, enemy };
}

const hitEffects = world => world.effects.filter(effect => effect.kind === 'hit');

test('맞은 피해는 소수가 나오는 방어력에서도 정수로 뜬다', () => {
  const save = freshSave();
  save.equipment = {}; save.level = 12;                        // 방어 14 → 14×0.2 = 2.8이 소수
  const defense = totalStats(save).defense;
  const taken = enemyHitDamage(save.floor, false, defense);
  assert.ok(!Number.isInteger(taken), `시험 조건: 실제 피해가 소수여야 한다 (${taken})`);
  const world = new World(save);
  world.spawnTimer = 999; world.cooldown.attack = 999;         // 내 평타가 먼저 적을 죽이지 않게
  const enemy = world.enemies[0];
  enemy.hp = enemy.maxHp = 1e6;
  enemy.x = world.player.x; enemy.y = world.player.y + 20;
  world.player.hit = 0;
  const before = world.player.hp;
  world.update(.016);
  const strike = world.effects.find(effect => effect.kind === 'enemyStrike');
  assert.ok(strike, '맞은 자리에 enemyStrike 효과');
  assert.ok(Number.isInteger(strike.amount), `숫자는 정수여야 한다 (${strike.amount})`);
  assert.equal(strike.amount, Math.round(taken), '반올림한 값이 실린다');
  assert.equal(damageLabelText(strike), `-${Math.round(taken)}`, `화면 글자도 정수 (${damageLabelText(strike)})`);
  // 체력은 종전처럼 실제 소수 피해만큼 줄어든다 — 표시만 정수다.
  assert.ok(Math.abs((before - world.player.hp) - taken) < 1e-9, '실제 피해량은 그대로다');
});

test('일반 피해는 흰색, 치명타는 빨강으로 뜬다', () => {
  const plain = strikingWorld();
  plain.world.damage(120, 100, 0, Math.PI, 0, 0, plain.world.player, 1);
  const [normal] = hitEffects(plain.world);
  assert.equal(normal.crit, false);
  assert.equal(normal.amount, 100);
  assert.equal(normal.bonus, undefined, '추가 데미지가 없으면 숫자는 한 장뿐');
  assert.equal(hitEffects(plain.world).length, 1);
  assert.equal(damageLabelColor(normal), DAMAGE_LABEL_COLORS.hit);
  assert.equal(DAMAGE_LABEL_COLORS.hit, 0xffffff, '일반 피해는 흰색');
  assert.equal(damageLabelText(normal), '-100');

  const crit = strikingWorld({ crit: true });
  crit.world.damage(120, 100, 0, Math.PI, 0, 0, crit.world.player, 1);
  const [critical] = hitEffects(crit.world);
  assert.equal(critical.crit, true);
  assert.equal(critical.amount, Math.round(100 * CRIT_DAMAGE_SCALE));
  assert.equal(damageLabelColor(critical), DAMAGE_LABEL_COLORS.crit);
  assert.equal(DAMAGE_LABEL_COLORS.crit, 0xff4d4d, '치명타는 빨강');
  assert.notEqual(DAMAGE_LABEL_COLORS.crit, DAMAGE_LABEL_COLORS.hit, '흰색과 갈린다');
});

test('추가 데미지는 기본 피해와 따로 노란 숫자로 뜨고, 합은 예전 한 방과 같다', () => {
  const { world, enemy } = strikingWorld({ bonusDmgPct: 2 });
  const before = enemy.hp;
  world.damage(120, 100, 0, Math.PI, 0, 0, world.player, 1);
  const effects = hitEffects(world);
  assert.equal(effects.length, 2, '기본 + 추가 두 장');
  const base = effects.find(effect => !effect.bonus), bonus = effects.find(effect => effect.bonus);
  assert.ok(base && bonus, '기본 피해와 추가 데미지가 갈린다');
  assert.equal(base.amount, 100);
  assert.equal(base.crit, false);
  assert.equal(damageLabelColor(base), DAMAGE_LABEL_COLORS.hit, '기본은 흰색');
  assert.equal(bonus.amount, 2, '100의 2% = 2');
  assert.equal(damageLabelColor(bonus), DAMAGE_LABEL_COLORS.bonus);
  assert.equal(DAMAGE_LABEL_COLORS.bonus, 0xffdf40, '추가 데미지는 노랑');
  assert.notEqual(DAMAGE_LABEL_COLORS.bonus, DAMAGE_LABEL_COLORS.hit);
  assert.notEqual(DAMAGE_LABEL_COLORS.bonus, DAMAGE_LABEL_COLORS.crit);
  // 두 숫자가 한 점에 겹치지 않게 추가 몫은 위로 띄운다.
  assert.equal(base.labelOffsetY, undefined);
  assert.equal(bonus.labelOffsetY, -18, '추가 숫자는 기본 숫자 위 18px');
  // 실제 피해는 두 값의 합 — 예전 `amount * (1 + 2/100)` 한 방과 같다(반올림은 표시에서만).
  assert.ok(Math.abs((before - enemy.hp) - 102) < 1e-9, `피해 합계 ${before - enemy.hp}`);
});

test('치명타에 추가 데미지가 붙으면 기본은 빨강, 추가 몫은 그대로 노랑이다', () => {
  const { world, enemy } = strikingWorld({ crit: true, bonusDmgPct: 3 });
  const before = enemy.hp;
  world.damage(120, 100, 0, Math.PI, 0, 0, world.player, 1);
  const effects = hitEffects(world);
  const base = effects.find(effect => !effect.bonus), bonus = effects.find(effect => effect.bonus);
  assert.equal(base.crit, true);
  assert.equal(damageLabelColor(base), DAMAGE_LABEL_COLORS.crit, '치명타 기본 피해는 빨강');
  assert.equal(damageLabelColor(bonus), DAMAGE_LABEL_COLORS.bonus, '추가 몫은 치명타여도 노랑');
  const expectedBonus = 100 * CRIT_DAMAGE_SCALE * .03;
  assert.equal(bonus.amount, Math.max(1, Math.round(expectedBonus)));
  assert.ok(Math.abs((before - enemy.hp) - (100 * CRIT_DAMAGE_SCALE * 1.03)) < 1e-6, '합계는 예전 치명타 한 방');
  // 아주 작은 추가 몫도 0이 아니라 1로 보인다(노란 숫자가 사라지지 않게).
  const tiny = strikingWorld({ bonusDmgPct: 1 });
  tiny.world.damage(120, 1, 0, Math.PI, 0, 0, tiny.world.player, 1);
  assert.equal(hitEffects(tiny.world).find(effect => effect.bonus)?.amount, 1);
});

test('회피·회복·맞은 피해 색은 내 피해 세 색과 겹치지 않는다', () => {
  const colors = new Set([DAMAGE_LABEL_COLORS.hit, DAMAGE_LABEL_COLORS.crit, DAMAGE_LABEL_COLORS.bonus,
    DAMAGE_LABEL_COLORS.enemyStrike, DAMAGE_LABEL_COLORS.evade, DAMAGE_LABEL_COLORS.heal]);
  assert.equal(colors.size, 6, '여섯 가지 색이 모두 다르다');
  assert.notEqual(DAMAGE_LABEL_COLORS.enemyStrike, DAMAGE_LABEL_COLORS.crit, '맞은 피해(주황)와 내 치명타(빨강)');
  assert.equal(damageLabelText({ kind: 'evade' }), '회피');
  assert.equal(damageLabelText({ kind: 'heal', amount: 3.4 }), '+3');
  assert.equal(damageLabelText({ kind: 'hit', amount: 99.6 }), '-100');
});
