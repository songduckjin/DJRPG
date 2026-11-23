import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave } = await import('../src/game/store.ts');
const { autoEquipRecommendedSkills, recommendedSkillOrder } = await import('../src/game/loadout.ts');
const { archerSkillOrder, mageSkillOrder, skillOrder } = await import('../src/game/skills.ts');

/** 스킬 추천 자동 장착(작업 240 · 4단계 스킬 트리 A안 — 장착 규칙만 본다). 화면은 `skill-modal-ui`. */
function warrior(learned = [...skillOrder]) { const save = freshSave('male', 'warrior'); save.learned = learned; return save; }

// ── ① 추천 자동 장착 ────────────────────────────────────────────────────────
test('직업별로 핵심 버프 1개와 주력 공격 2개를 빈 3칸에 채운다', () => {
  // 2·3번 원은 **초당 딜량**(시전 계수 × 레벨 위력 ÷ 쿨) 내림차순이다.
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
    assert.deepEqual(result.equipped, slots, job);
    assert.equal(result.message, '추천 조합 3개 장착 완료', `${job}: 빈 원만 채우면 교체 내역이 없다`);
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
  assert.match(result.message, /습득한 액티브 스킬이 없습니다/);
});

test('습득이 3개 미만이면 가진 만큼만 채우고 남은 원은 비운다', () => {
  const save = warrior(['warcry', 'destroy']);
  const result = autoEquipRecommendedSkills(save);
  assert.deepEqual(save.quickSlots, ['warcry', 'destroy', null]);
  assert.match(result.message, /추천 조합 2개 장착 완료/);
  assert.match(result.message, /남은 1개 원은 비웁니다/);
  const one = warrior(['power']);
  autoEquipRecommendedSkills(one);
  assert.deepEqual(one.quickSlots, ['power', null, null]);
});

test('습득 스킬이 0개면 세이브를 건드리지 않고 안내만 돌려준다', () => {
  const save = freshSave('male', 'warrior'); save.learned = []; save.skillLevels = {}; save.quickSlots = [null, null, null];
  const result = autoEquipRecommendedSkills(save);
  assert.equal(result.changed, false);
  assert.deepEqual(result.equipped, []);
  assert.deepEqual(save.quickSlots, [null, null, null]);
  assert.match(result.message, /스킬 트리에서 SP를 투자해 습득하면 추천 장착을 쓸 수 있습니다/);
});

test('스킬을 강화하면 레벨 위력 배율이 붙어 DPS 순위가 바뀐다', () => {
  // 예시: 위력 +70%(Lv.8) iceBolt 1.7×1.7/7 = .413 > 위력 +30%(Lv.4) manaBurst 2.5×1.3/10 = .325
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

// ── ② A안 배치 규칙 — 이미 꽂힌 추천 스킬은 그 자리에 둔다 ────────────────────
test('이미 장착된 추천 스킬은 그 원에 그대로 두고, 남은 추천만 다른 원에 넣는다', () => {
  const save = warrior(['warcry', 'power', 'slash2', 'hell', 'destroy']);
  save.quickSlots = ['slash2', 'hell', 'destroy'];   // 1번 원의 이단참은 추천 조합에 있다 → 유지
  const result = autoEquipRecommendedSkills(save);
  assert.deepEqual(save.quickSlots, ['slash2', 'warcry', 'power'], '이단참은 1번 원 그대로, 2·3번 원에 나머지');
  assert.equal(result.changed, true);
  assert.deepEqual(result.equipped, ['slash2', 'warcry', 'power']);
  assert.equal(result.message, '추천 조합 3개 장착 완료 · 2번 원 → 블러드 레이지 · 3번 원 → 파워 스트라이크', '교체한 원만 요약한다');
});

test('빈 원을 먼저 채우고, 그다음 추천 밖 스킬이 있는 원을 바꾼다', () => {
  const save = warrior(['warcry', 'power', 'slash2', 'hell']);
  save.quickSlots = [null, 'hell', null];
  autoEquipRecommendedSkills(save);
  // 빈 1·3번 원이 먼저(블러드 레이지·파워 스트라이크), 남는 이단참이 마지막 교체 대상인 2번 원으로 간다.
  assert.deepEqual(save.quickSlots, ['warcry', 'slash2', 'power']);
});

test('추천 조합이 이미 다 꽂혀 있으면 순서가 달라도 건드리지 않는다', () => {
  const save = warrior(['warcry', 'power', 'slash2', 'hell']);
  save.quickSlots = ['power', 'warcry', 'slash2'];
  const result = autoEquipRecommendedSkills(save);
  assert.equal(result.changed, false);
  assert.deepEqual(save.quickSlots, ['power', 'warcry', 'slash2'], '손으로 맞춘 순서를 흔들지 않는다');
  assert.match(result.message, /이미 추천 조합이 장착되어 있습니다: 블러드 레이지 · 파워 스트라이크 · 이단참/);

  save.quickSlots = ['warcry', 'power', 'slash2'];
  const same = autoEquipRecommendedSkills(save);
  assert.equal(same.changed, false);
  assert.match(same.message, /이미 추천 조합이 장착되어 있습니다/);
});

test('추천 밖 스킬만 꽂혀 있으면 그 원들을 추천으로 교체한다', () => {
  const save = warrior(['warcry', 'power', 'slash2', 'slam', 'crushing']);
  save.quickSlots = ['slam', 'crushing', 'slam'];
  const result = autoEquipRecommendedSkills(save);
  assert.deepEqual(save.quickSlots, ['warcry', 'power', 'slash2']);
  assert.match(result.message, /1번 원 → 블러드 레이지/);
  assert.match(result.message, /3번 원 → 이단참/);
});
