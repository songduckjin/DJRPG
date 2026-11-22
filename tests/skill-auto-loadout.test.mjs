import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave } = await import('../src/game/store.ts');
const { autoEquipRecommendedSkills, recommendedSkillOrder } = await import('../src/game/loadout.ts');
const { archerSkillOrder, mageSkillOrder, skillOrder } = await import('../src/game/skills.ts');

/** 작업 240 — 스킬 추천 자동 장착(장착 규칙만 본다. 화면은 4단계 스킬 트리로 바뀌었다). */
function warrior(learned = [...skillOrder]) { const save = freshSave('male', 'warrior'); save.learned = learned; return save; }

// ── ① 추천 자동 장착 ────────────────────────────────────────────────────────
test('직업별로 핵심 버프 1개와 주력 공격 2개를 3칸에 채운다', () => {
  // 작업 245: 2·3번 원은 **초당 딜량**(시전 계수 × 레벨 위력 ÷ 쿨) 내림차순이다.
  const cases = [
    { job: 'warrior', learned: [...skillOrder], slots: ['warcry', 'power', 'slash2'] },
    { job: 'archer', learned: [...archerSkillOrder], slots: ['hawkEye', 'multiShot', 'doubleShot'] },
    { job: 'mage', learned: [...mageSkillOrder], slots: ['arcaneShield', 'fireBolt', 'meteorStrike'] }
  ];
  for (const { job, learned, slots } of cases) {
    const save = freshSave('female', job); save.learned = learned;
    const result = autoEquipRecommendedSkills(save);
    assert.equal(result.changed, true, job);
    assert.deepEqual(save.quickSlots, slots, job);
    assert.deepEqual(result.equipped, slots.filter(Boolean), job);
    assert.match(result.message, /추천 조합으로 장착했습니다/);
  }
});

test('미습득 스킬과 다른 직업 스킬은 절대 넣지 않는다', () => {
  const save = warrior(['slam', 'slash2', 'hawkEye', 'stormVolley', 'warcry']);
  autoEquipRecommendedSkills(save);
  // 궁수 스킬(hawkEye·stormVolley)은 전사 퀵슬롯 대상이 아니고, 습득하지 않은 hell·power도 빠진다.
  // 남은 둘은 초당 딜량 순서 — slash2(2.2/4 = .55) > slam(2.75/8 = .34).
  assert.deepEqual(save.quickSlots, ['warcry', 'slash2', 'slam']);
  const onlyForeign = warrior(['hawkEye', 'stormVolley']);
  const result = autoEquipRecommendedSkills(onlyForeign);
  assert.equal(result.changed, false);
  assert.deepEqual(onlyForeign.quickSlots, [null, null, null]);
  assert.match(result.message, /보유한 액티브 스킬이 없습니다/);
});

test('보유가 3개 미만이면 채운 만큼만 앞 칸에 넣고 남은 칸은 비운다', () => {
  const save = warrior(['warcry', 'destroy']);
  const result = autoEquipRecommendedSkills(save);
  assert.deepEqual(save.quickSlots, ['warcry', 'destroy', null]);
  assert.match(result.message, /보유한 2개만 채우고 남은 칸은 비웁니다/);
  const one = warrior(['power']);
  autoEquipRecommendedSkills(one);
  assert.deepEqual(one.quickSlots, ['power', null, null]);
});

test('보유 스킬이 0개면 세이브를 건드리지 않고 안내만 돌려준다', () => {
  const save = freshSave('male', 'warrior'); save.learned = []; save.skillLevels = {}; save.quickSlots = [null, null, null];
  const result = autoEquipRecommendedSkills(save);
  assert.equal(result.changed, false);
  assert.deepEqual(result.equipped, []);
  assert.deepEqual(save.quickSlots, [null, null, null]);
  assert.match(result.message, /스킬 트리에서 SP를 투자해 습득하면 추천 장착을 쓸 수 있습니다/);
});

test('스킬을 강화하면 레벨 위력 배율이 붙어 DPS 순위가 바뀐다', () => {
  // 작업 245 예시: 위력 +70%(Lv.8) iceBolt 1.7×1.7/7 = .413 > 위력 +30%(Lv.4) manaBurst 2.5×1.3/10 = .325
  const base = freshSave('female', 'mage'); base.learned = ['iceBolt', 'manaBurst'];
  assert.deepEqual(recommendedSkillOrder(base).slice(0, 2), ['manaBurst', 'iceBolt'], '1레벨에서는 마력 폭발이 위');
  const leveled = freshSave('female', 'mage'); leveled.learned = ['iceBolt', 'manaBurst'];
  leveled.skillLevels = { iceBolt: 8, manaBurst: 4 };
  assert.deepEqual(recommendedSkillOrder(leveled).slice(0, 2), ['iceBolt', 'manaBurst'], '강화된 아이스 볼트가 앞선다');
  /// 전사: 레벨 6 파워 스트라이크(4×1.5/6 = 1.0)는 1레벨 회전참격(.2375)을 크게 앞선다.
  const warriorSave = warrior(['power', 'hell']);
  warriorSave.skillLevels = { power: 6 };
  assert.deepEqual(recommendedSkillOrder(warriorSave).slice(0, 2), ['power', 'hell']);
});

test('이미 같은 조합이면 changed=false, 순서만 다르면 다시 채운다', () => {
  const save = warrior(['warcry', 'hell', 'power', 'slash2']);
  save.quickSlots = ['warcry', 'power', 'slash2'];
  const same = autoEquipRecommendedSkills(save);
  assert.equal(same.changed, false);
  assert.match(same.message, /이미 추천 조합이 장착되어 있습니다/);
  save.quickSlots = ['power', 'hell', 'warcry'];
  const reordered = autoEquipRecommendedSkills(save);
  assert.equal(reordered.changed, true);
  assert.deepEqual(save.quickSlots, ['warcry', 'power', 'slash2']);
});
