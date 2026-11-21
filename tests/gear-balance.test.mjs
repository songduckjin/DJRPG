// 작업 255 — 전체 장비 밸런스(직업 정체성·티어 %·부위 역할·쯔바이핸드).
//
// 여기서 고정하는 것:
//  ① 티어 계수: 티어마다 +3.5%, 최고 티어(9 또는 5티어 슬롯의 4)는 +31.5%.
//  ② 부위 역할: 무기가 공격을 이끌고, 투구·갑옷이 방어·체력을 이끌며, 반지는 무기보다 훨씬 적은 공격.
//  ③ 직업 정체성: 전사 방어·체력, 궁수 치명·공속, 마법사 공격. 셋의 종합 전투력은 10% 안쪽.
//  ④ 쯔바이핸드(3티어)는 치명 특화지만 7~9티어 대검을 이기지 않는다.
//  ⑤ 옛 세이브의 장비는 스탯이 그대로 남고, 저장 검증 상한도 옛 공식을 함께 허용한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const items = await import('../src/game/items.ts');
const { freshSave } = await import('../src/game/store.ts');
const { enemyHitDamage } = await import('../src/game/world.ts');
const { jobs } = await import('../src/game/skills.ts');
const {
  slots, baseItems, itemPower, itemJob, gearStats, tierFactor, TIER_STAT_GROWTH, slotProfiles,
  jobMastery, slotProfileFor, maxSlotProfileTable, totalStats, rollItem, rarityScales
} = items;
const { itemWithinBounds, MAX_SLOT_PROFILES } = await import('../server/save-guard.mjs');

const levelFor = floor => Math.min(30, Math.max(1, Math.round(5 + floor * .6)));

/** 한 직업의 한 벌(10칸) — 무기·투구·갑옷은 그 직업 것, 나머지는 공용. */
function setFor(job, floor, rarity, tier) {
  const save = freshSave('male', job);
  save.level = levelFor(floor);
  save.equipment = {};
  for (const slot of slots) {
    const gearJob = slot === 'weapon' || slot === 'helmet' || slot === 'armor' ? job : undefined;
    const stats = gearStats(slot, rarity, Math.min(tier, baseItems[slot].length - 1), floor, gearJob, false, () => 0);
    save.equipment[slot] = { id: `${slot}-${job}`, name: `${slot} ${tier}`, slot, rarity, stats, plus: 0 };
  }
  return save;
}

/** 시뮬레이션 스크립트와 같은 종합 전투력 — √(평타 DPS × 보스 EHP). */
function combatRating(save, floor) {
  const stats = totalStats(save);
  const crit = 1 + Math.min(80, Math.max(0, stats.crit)) / 100 * .8;
  const speed = 1 + Math.max(0, stats.speed) / 100;
  const dps = stats.attack * crit * speed / .48;
  const ehp = stats.health / Math.max(1, enemyHitDamage(floor, true, stats.defense));
  return Math.sqrt(dps * ehp);
}

// ── ① 티어 % ────────────────────────────────────────────────────────────────
test('티어 한 단계마다 3.5%, 최고 티어는 0티어보다 31.5% 강하다(부위별 이름 수와 무관)', () => {
  assert.equal(TIER_STAT_GROWTH, .035);
  // 10티어 슬롯: 0 → 9가 9단계.
  for (const slot of ['weapon', 'helmet', 'armor', 'gloves', 'belt', 'boots']) {
    assert.equal(tierFactor(slot, 0), 1);
    assert.equal(Math.round(tierFactor(slot, 1) * 1000) / 1000, 1.035, `${slot} 1티어 +3.5%`);
    assert.equal(Math.round(tierFactor(slot, 9) * 1000) / 1000, 1.315, `${slot} 최고 티어 +31.5%`);
  }
  // 5티어 슬롯(문장·목걸이·반지): 0 → 4를 9단계로 환산해 역시 +31.5%.
  for (const slot of ['offhand', 'necklace', 'ring1', 'ring2']) {
    assert.equal(tierFactor(slot, 0), 1);
    assert.equal(Math.round(tierFactor(slot, 4) * 1000) / 1000, 1.315, `${slot} 최고 티어 +31.5%`);
    assert(Math.round(tierFactor(slot, 1) * 1000) / 1000 > 1.075, `${slot} 한 단계가 7.5% 이상`);
  }
  // 예전 고정(+6/+4)과 달리 깊은 층에서도 비율이 그대로다 — 50층 전설 무기의 0↔9 티어 차이.
  const low = gearStats('weapon', 'legendary', 0, 50, 'warrior', false, () => 0).attack;
  const high = gearStats('weapon', 'legendary', 9, 50, 'warrior', false, () => 0).attack;
  assert(Math.abs(high / low - 1.315) < .01, `50층 전설 무기 0→9티어 ${low}→${high} (${(high / low).toFixed(3)}×)`);
});

// ── ② 부위 역할 ─────────────────────────────────────────────────────────────
test('부위 역할: 무기가 공격을 이끌고, 투구·갑옷이 방어·체력을 이끌며, 반지는 무기 공격의 1/3 이하다', () => {
  const stat = (slot, key) => gearStats(slot, 'legendary', slot === 'weapon' || baseItems[slot].length === 10 ? 9 : 4, 50, slot === 'weapon' ? 'warrior' : 'warrior')[key] ?? 0;
  const weaponAttack = stat('weapon', 'attack');
  for (const slot of ['ring1', 'ring2', 'gloves', 'necklace', 'offhand']) {
    assert(stat(slot, 'attack') < weaponAttack, `${slot} 공격이 무기보다 낮다`);
  }
  for (const slot of ['ring1', 'ring2']) {
    // 배율은 반지 0.35 / 무기 1.05 = 1/3이지만, 반올림·주 스탯 난수(0~3)만큼 차이가 난다.
    assert(stat(slot, 'attack') <= weaponAttack * .36 + 1, `${slot} 공격은 무기의 1/3 남짓 (${stat(slot, 'attack')} vs ${weaponAttack})`);
  }
  assert(stat('gloves', 'attack') < weaponAttack * .65, '장갑 공격도 무기보다 확실히 낮다');
  // 방어·체력의 주인은 갑옷 > 투구. 다른 부위는 그보다 낮다.
  assert(stat('armor', 'defense') > stat('helmet', 'defense'));
  for (const slot of ['offhand', 'belt', 'boots', 'necklace', 'gloves', 'ring1']) {
    assert(stat('helmet', 'defense') > stat(slot, 'defense'), `${slot} 방어 < 투구`);
    assert(stat('helmet', 'health') > stat(slot, 'health'), `${slot} 체력 < 투구`);
  }
  assert(stat('armor', 'health') > stat('helmet', 'health'));
  // 장갑·신발은 공속, 목걸이·반지는 치명이 중심이다.
  assert(stat('boots', 'speed') > stat('armor', 'speed') * 3, '신발이 공속의 주인');
  assert(stat('gloves', 'speed') > stat('weapon', 'speed') * 2, '장갑도 공속이 크다');
  assert(stat('necklace', 'crit') > stat('weapon', 'crit'), '목걸이가 치명의 주인');
  assert(stat('ring1', 'crit') >= stat('armor', 'crit') * 2, '반지도 치명이 크다');
  // 주 스탯 판정 — 슬롯 배분표에서 공격이 방어보다 큰 부위만 공격이 주 스탯이다.
  assert.deepEqual(
    slots.filter(slot => slotProfiles[slot].attack >= slotProfiles[slot].defense),
    ['weapon', 'necklace', 'gloves', 'ring1', 'ring2']
  );
});

// ── ③ 직업 정체성 ───────────────────────────────────────────────────────────
test('직업 정체성: 전사는 방어·체력, 궁수는 치명·공속, 마법사는 공격이 앞선다', () => {
  const floor = 50;
  const totals = Object.fromEntries(jobs.map(job => [job, totalStats(setFor(job, floor, 'legendary', 9))]));
  assert(totals.warrior.defense > totals.archer.defense && totals.warrior.defense > totals.mage.defense, '전사 방어 우위');
  assert(totals.warrior.health > totals.archer.health && totals.warrior.health > totals.mage.health, '전사 체력 우위');
  assert(totals.archer.crit > totals.warrior.crit && totals.archer.speed > totals.mage.speed, '궁수 치명·공속 우위');
  assert(totals.mage.attack > totals.warrior.attack && totals.mage.attack > totals.archer.attack, '마법사 공격 우위');
  // 공격 우위는 장비 배분 + 숙련에서 나온다(마법사 지팡이 1.18 × 숙련 1.52).
  // 밸런스 v2: 궁수의 공속·치명은 직업 숙련이 아니라 장비 배율(`GEAR_SPEED_SCALE`/`GEAR_CRIT_SCALE`)로 옮겼다.
  assert.equal(jobMastery.warrior.defense, 1.12);
  assert.equal(jobMastery.archer.crit, 1.15);
  assert.equal(jobMastery.mage.attack, 1.52);
  assert.deepEqual({ ...items.GEAR_SPEED_SCALE }, { warrior: .55, archer: 1.48, mage: .45 });
  assert.equal(items.GEAR_CRIT_SCALE.archer, 1.15);
  assert(slotProfileFor('armor', 'warrior').health > slotProfileFor('armor', 'archer').health, '판금 > 가죽');
  assert(slotProfileFor('armor', 'mage').attack > slotProfileFor('armor', 'warrior').attack, '로브는 공격이 붙는다');
  // 직업을 모르는 투구·갑옷(PR #254 이전 `main`)은 공용 기준값으로 떨어진다.
  assert.equal(slotProfileFor('armor'), slotProfiles.armor);
});

test('세 직업의 종합 전투력은 레어 이상에서 어느 층이든 10% 안쪽이다', () => {
  for (const floor of [1, 20, 25, 50, 78, 100]) {
    for (const rarity of ['rare', 'legendary']) {
      const ratings = Object.fromEntries(jobs.map(job => [job, combatRating(setFor(job, floor, rarity, 9), floor)]));
      const values = Object.values(ratings);
      const spread = Math.max(...values) / Math.min(...values) - 1;
      // 평타 DPS·보스 생존만 센 지표다(사거리·스킬은 직업마다 달라 제외). 그래도 레어 이상은 13% 안쪽.
      // 일반·매직은 버리는 장비라 숙련 배율이 크게 보여 최대 20%까지 벌어진다(50층 매직 56/52/61).
      assert(spread < .13, `${floor}층 ${rarity}: ${jobs.map(job => `${job} ${Math.round(ratings[job])}`).join(' / ')} (${(spread * 100).toFixed(1)}%)`);
    }
  }
});

// ── ④ 쯔바이핸드 ────────────────────────────────────────────────────────────
test('쯔바이핸드(3티어)는 치명 특화지만 7~9티어 대검을 이기지 않는다', () => {
  const weapon = (tier, name, zweihander, rarity = 'legendary') => {
    const stats = gearStats('weapon', rarity, tier, 50, 'warrior', zweihander, () => 0);
    return { id: `${tier}-${name}`, name, slot: 'weapon', rarity, stats, plus: 0 };
  };
  const zwei3 = weapon(3, '영원의 쯔바이핸드', true);
  const plain3 = weapon(3, '영원의 클레이모어', false);
  const plain7 = weapon(7, '영원의 아다만트 그레이트소드', false);
  const plain9 = weapon(9, '영원의 패왕의 성검', false);
  assert(zwei3.stats.crit > plain3.stats.crit, '같은 티어보다 치명이 높다');
  assert(zwei3.stats.attack < plain7.stats.attack, '공격은 7티어보다 낮다');
  assert(itemPower(zwei3) < itemPower(plain7), `3티어 쯔바이핸드(${Math.round(itemPower(zwei3))}) < 7티어 대검(${Math.round(itemPower(plain7))})`);
  assert(itemPower(zwei3) < itemPower(plain9));
  // 예전(공격 +25%·치명 +50%)이면 3티어가 9티어를 이겼다 — 그 역전이 사라졌다.
  assert(itemPower(zwei3) > itemPower(plain3), '같은 티어에서는 여전히 조금 강하다');
});

// ── ⑤ 옛 세이브·서버 호환 ───────────────────────────────────────────────────
test('옛 장비는 스탯을 그대로 유지한 채 직업 숙련만 새로 받는다', () => {
  const old = { id: 'o', name: '황혼의 두손검', slot: 'weapon', rarity: 'rare', stats: { attack: 82 }, plus: 4 };
  const save = freshSave('male', 'warrior');
  save.equipment = { weapon: old };
  const warrior = totalStats(save);
  assert.equal(warrior.attack, 8 + save.level * 2 + 82, '옛 장비 스탯은 그대로 합산(전사 숙련은 방어·체력만)');
  const archer = totalStats({ ...save, job: 'archer' });
  assert.equal(archer.attack, warrior.attack, '궁수 숙련은 공격에 붙지 않는다');
  assert(archer.speed >= warrior.speed, '궁수 숙련은 공속에 붙는다');
  // 서버 상한은 새 공식과 옛 공식을 함께 허용한다 — 새 드롭과 옛 장비 모두 통과.
  for (let floor = 1; floor <= 120; floor += 7) for (let i = 0; i < 8; i++) {
    const fresh = rollItem(floor, false, i % 2 === 0, jobs[i % 3]);
    assert(itemWithinBounds(fresh, floor), `${floor}층 ${fresh.rarity} ${fresh.slot}`);
  }
  assert(itemWithinBounds(old, 120), '옛 장비도 통과');
  // 직업별 상한표는 서버 사본과 같다.
  for (const slot of slots) assert.deepEqual({ ...maxSlotProfileTable[slot] }, { ...MAX_SLOT_PROFILES[slot] });
});

test('새 드롭의 스탯은 정수이고, 등급이 오르면 주 스탯이 커진다', () => {
  let previous = 0;
  for (const rarity of items.rarityOrder) {
    const stats = gearStats('armor', rarity, 9, 40, 'warrior', false, () => 0);
    for (const value of Object.values(stats)) assert(Number.isInteger(value) && value > 0, `${rarity} ${JSON.stringify(stats)}`);
    assert(stats.defense > previous, `${rarity} 방어가 이전 등급보다 크다`);
    previous = stats.defense;
  }
  // 슬롯 배분표의 배율 자체는 등급배율과 곱해지므로, 같은 등급·티어에서 층이 오르면 커진다.
  const shallow = gearStats('weapon', 'rare', 0, 10, 'warrior', false, () => 0).attack;
  const deep = gearStats('weapon', 'rare', 0, 40, 'warrior', false, () => 0).attack;
  // 층 배율 (1 + floor/2): 10층 6배 → 40층 21배 (3.5배). 반올림 오차만 허용한다.
  assert(Math.abs(deep / shallow - 3.5) < .06, `층 배율 10→40층 x${(deep / shallow).toFixed(2)} (${shallow}→${deep})`);
  // 이름/등급만 바꿔 만든 장비라도 무기의 주인 직업은 이름으로 판별한다(활=궁수, 지팡이=마법사).
  const bow = { id: 'b', name: '사냥꾼의 활', slot: 'weapon', rarity: 'rare', stats: {} };
  const staff = { id: 's', name: '견습생의 지팡이', slot: 'weapon', rarity: 'rare', stats: {} };
  assert.equal(itemJob(bow), 'archer');
  assert.equal(itemJob(staff), 'mage');
  assert.equal(itemJob({ ...bow, name: '낡은 두손검' }), 'warrior');
  // 등급 배율이 1,2,3,4,5,6 그대로다(서버와 같은 표).
  assert.deepEqual(rarityScales, { common: 1, magic: 2, rare: 3, epic: 4, unique: 5, legendary: 6 });
});
