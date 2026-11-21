import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const {
  archerArmorBases, archerHelmetBases, mageArmorBases, mageHelmetBases, baseItems, armorBasesFor, helmetBasesFor,
  baseItemIndex, canWield, equipmentImage, gearTier, isUpgradeForHero, itemJob, itemPower, migrateItem, rollEquipment, rollItem, usableByJob
} = await import('../src/game/items.ts');
const { codexBaseIndex, equipmentCodexKey } = await import('../src/game/codex.ts');
const { freshSave, parseSave } = await import('../src/game/store.ts');
const { autoEquipBest } = await import('../src/game/items.ts');

const piece = (slot, name, extra = {}) => ({ id: `${slot}:${name}`, name, slot, rarity: 'rare', stats: { defense: 12 }, ...extra });

test('투구·갑옷은 직업마다 10종씩이고 이름이 서로 겹치지 않는다 (작업 249)', () => {
  assert.equal(archerArmorBases.length, 10);
  assert.equal(archerHelmetBases.length, 10);
  assert.equal(mageArmorBases.length, 10);
  assert.equal(mageHelmetBases.length, 10);
  assert.deepEqual(armorBasesFor('warrior'), baseItems.armor, '전사는 기존 판금 10종 그대로');
  assert.deepEqual(helmetBasesFor('warrior'), baseItems.helmet, '전사는 기존 헬름 10종 그대로');
  for (const [slot, lists] of [['armor', [baseItems.armor, archerArmorBases, mageArmorBases]], ['helmet', [baseItems.helmet, archerHelmetBases, mageHelmetBases]]]) {
    const seen = new Set();
    for (const list of lists) for (const name of list) {
      // 이름이 겹치면 도감·아이콘·외형이 어느 목록의 몇 번째인지 가릴 수 없다.
      assert.equal(seen.has(name), false, `${slot} 이름 중복: ${name}`);
      seen.add(name);
    }
    assert.equal(seen.size, 30);
  }
});

test('직업별 투구·갑옷 이름이 그 직업의 것이고, 옛 전사용 이름은 공용으로 남는다', () => {
  const archerRobe = piece('armor', '황혼의 사냥꾼 가죽 코트');
  const mageHat = piece('helmet', '서리의 마법사 고깔모');
  const legacyPlate = piece('armor', '서리의 흑요석 갑주');
  const taggedPlate = piece('armor', '서리의 흑요석 갑주', { job: 'warrior' });
  assert.equal(itemJob(archerRobe), 'archer');
  assert.equal(itemJob(mageHat), 'mage');
  assert.equal(itemJob(legacyPlate), undefined, '옛 세이브의 전사용 갑옷은 공용 — 그대로 입을 수 있다');
  assert.equal(itemJob(taggedPlate), 'warrior', '새로 떨어진 전사 전용 갑옷은 전사 전용');
  assert.equal(gearTier(archerRobe), 2);
  assert.equal(gearTier(mageHat), 3);
  assert.equal(gearTier(legacyPlate), 6);
  // 이름이 서로를 포함하는 경우(`가죽 조끼` ⊂ `사냥꾼 가죽 조끼`)도 가장 긴 기본형이 이긴다.
  assert.equal(gearTier(piece('armor', '황혼의 사냥꾼 가죽 조끼')), 0);
  assert.equal(gearTier(piece('armor', '황혼의 가죽 조끼')), 0);
  assert.equal(itemJob(piece('armor', '황혼의 사냥꾼 가죽 조끼')), 'archer');
});

test('장착 제한 — 다른 직업의 투구·갑옷은 입을 수 없고, 공용 장비는 그대로다', () => {
  const archerArmor = piece('armor', '영원의 용린 레인저 갑주');
  const mageRobe = piece('armor', '영원의 대현자 롱 케이프 성의');
  const warriorPlate = piece('armor', '영원의 패왕의 전갑', { job: 'warrior' });
  const legacyPlate = piece('armor', '영원의 패왕의 전갑');
  const gloves = piece('gloves', '영원의 심연의 장갑');
  assert.equal(canWield(archerArmor, 'archer'), true);
  assert.equal(canWield(archerArmor, 'mage'), false);
  assert.equal(canWield(mageRobe, 'mage'), true);
  assert.equal(canWield(mageRobe, 'warrior'), false);
  assert.equal(canWield(warriorPlate, 'warrior'), true);
  assert.equal(canWield(warriorPlate, 'archer'), false);
  assert.equal(canWield(legacyPlate, 'mage'), true, '옛 장비는 직업과 무관하게 그대로 유효');
  assert.equal(canWield(gloves, 'mage'), true, '장갑·신발·문장·장신구는 공용');
  assert.equal(usableByJob(mageRobe, 'archer'), false);
  assert.equal(usableByJob(legacyPlate, 'archer'), true);
});

test('드롭은 투구·갑옷도 세 직업 1/3로 떨어지고 주인 직업을 함께 적는다', () => {
  const original = Math.random;
  try {
    let state = 2492026;
    Math.random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    const lists = { warrior: baseItems.armor, archer: archerArmorBases, mage: mageArmorBases };
    const counts = { warrior: 0, archer: 0, mage: 0 };
    let seen = 0;
    for (let index = 0; index < 4000; index++) {
      const item = rollEquipment(30, 'rare');
      if (item.slot !== 'armor' && item.slot !== 'helmet') continue;
      seen++;
      const name = item.name.replace(/^[^ ]+ /, '');
      // 가장 긴 기본형이 이기는 규칙(`가죽 조끼` ⊂ `사냥꾼 가죽 조끼`)으로 주인 직업을 찾는다.
      const owner = Object.keys(lists).map(job => ({
        job,
        length: (job === 'warrior' ? baseItems[item.slot] : item.slot === 'armor' ? armorBasesFor(job) : helmetBasesFor(job))
          .map(base => (name === base || name.endsWith(base)) ? base.length : 0).reduce((best, length) => Math.max(best, length), 0)
      })).sort((a, b) => b.length - a.length)[0];
      assert(owner.length > 0, `기본형 목록에 없는 장비 이름: ${item.name}`);
      const ownerJob = owner.job;
      assert.equal(item.job, ownerJob, `${item.name} 은 ${ownerJob} 전용으로 적힌다`);
      counts[ownerJob]++;
    }
    assert(seen > 100, '투구·갑옷 드롭이 나온다');
    for (const job of Object.keys(counts)) assert(Math.abs(counts[job] / seen - 1 / 3) < .06, `${job} ${(counts[job] / seen * 100).toFixed(1)}%`);
    // 무기에는 `job` 표식을 붙이지 않는다 — 이름으로 판별하기 때문이다.
    const weapon = rollItem(30, false, false, 'warrior');
    if (weapon.slot === 'weapon') assert.equal(weapon.job, undefined);
  } finally { Math.random = original; }
});

test('직업별 아이콘 — 궁수·마법사 투구·갑옷은 자기 아틀라스를, 옛 전사용 장비는 판금 아틀라스를 쓴다', () => {
  assert.deepEqual(equipmentImage(piece('armor', '황혼의 사냥꾼 가죽 코트')), { path: '/assets/item-art/archer_armor_0.png', frame: 2, columns: 5 });
  assert.deepEqual(equipmentImage(piece('armor', '황혼의 미스릴 레인저 아머')), { path: '/assets/item-art/archer_armor_5.png', frame: 0, columns: 5 });
  assert.deepEqual(equipmentImage(piece('helmet', '황혼의 발키리 서클릿')), { path: '/assets/item-art/archer_helmet_5.png', frame: 3, columns: 5 });
  assert.deepEqual(equipmentImage(piece('armor', '황혼의 룬 전투 법의')), { path: '/assets/item-art/mage_armor_0.png', frame: 3, columns: 5 });
  assert.deepEqual(equipmentImage(piece('helmet', '황혼의 대현자의 황금 왕관')), { path: '/assets/item-art/mage_helmet_5.png', frame: 4, columns: 5 });
  assert.deepEqual(equipmentImage(piece('helmet', '황혼의 마법사 고깔모')), { path: '/assets/item-art/mage_helmet_0.png', frame: 3, columns: 5 });
  // 옛 전사용 이름과 전사 전용 장비는 기존 판금 아틀라스 그대로다.
  assert.deepEqual(equipmentImage(piece('armor', '황혼의 흑요석 갑주')), { path: '/assets/item-art/armor_5.png', frame: 1, columns: 5 });
  assert.deepEqual(equipmentImage(piece('helmet', '황혼의 기사 헬름')), { path: '/assets/item-art/helmet_0.png', frame: 3, columns: 5 });
  assert.equal(baseItemIndex(piece('armor', '황혼의 패왕의 신궁 갑주')), 9);
  assert.equal(baseItemIndex(piece('helmet', '황혼의 사슬 사냥 코이프')), 2);
});

test('도감 — 투구·갑옷이 직업별 번호(0~9 · 10~19 · 20~29)로 갈린다', () => {
  assert.equal(equipmentCodexKey(piece('armor', '황혼의 사냥꾼 가죽 코트')), 'armor:12');
  assert.equal(equipmentCodexKey(piece('helmet', '황혼의 대현자의 황금 왕관')), 'helmet:29');
  assert.equal(equipmentCodexKey(piece('armor', '황혼의 흑요석 갑주')), 'armor:6');
  assert.equal(equipmentCodexKey(piece('armor', '황혼의 흑요석 갑주', { job: 'warrior' })), 'armor:6');
  assert.equal(codexBaseIndex(piece('helmet', '황혼의 후드 헬름')), -1, '없는 이름은 도감 번호가 없다');
  assert.equal(codexBaseIndex(piece('helmet', '황혼의 용린 후드 헬름')), 16);
});

test('자동 장착·업그레이드 화살표는 내 직업의 투구·갑옷만 본다', () => {
  const save = freshSave(); save.job = 'mage';
  save.bag = [piece('helmet', '영원의 신궁의 왕관', { stats: { defense: 999 } }), piece('armor', '영원의 대현자 롱 케이프 성의', { stats: { defense: 5 } })];
  assert.equal(autoEquipBest(save), 1);
  assert.equal(save.equipment.armor?.name, '영원의 대현자 롱 케이프 성의');
  assert.equal(save.equipment.helmet, undefined, '궁수 전용 투구는 마법사가 쓰지 않는다');
  assert.equal(isUpgradeForHero(save, piece('helmet', '영원의 신궁의 왕관', { stats: { defense: 999 } })), false);
  assert.equal(isUpgradeForHero(save, piece('helmet', '영원의 신궁의 왕관', { stats: { defense: 999 }, job: 'archer' })), false);
  assert.equal(isUpgradeForHero(save, piece('helmet', '영원의 미스릴 사파이어 서클릿', { stats: { defense: 1 } })), true);
  assert(itemPower(piece('helmet', '영원의 신궁의 왕관')) > 0);
});

test('옛 세이브 — 전사용 투구·갑옷을 입고 있던 궁수·마법사가 INVALID로 막히지 않는다', () => {
  const save = freshSave(); save.job = 'mage';
  // 예전 드롭 그대로: 이름만 있고 `job` 표식이 없는 전사용 판금.
  save.equipment.armor = { id: 'old-armor', name: '영원의 패왕의 전갑', slot: 'armor', rarity: 'legendary', stats: { defense: 120 }, plus: 3 };
  save.equipment.helmet = { id: 'old-helmet', name: '서리의 불멸의 왕관', slot: 'helmet', rarity: 'magic', stats: { defense: 40 }, plus: 1 };
  save.bag = [{ id: 'old-bag', name: '황혼의 드래곤 메일', slot: 'armor', rarity: 'rare', stats: { defense: 30 }, plus: 0 }];
  const loaded = parseSave(JSON.parse(JSON.stringify(save)));
  assert.equal(loaded.equipment.armor?.job, undefined, '옛 장비에는 표식이 생기지 않는다');
  assert.equal(loaded.equipment.helmet?.name, '서리의 불멸의 왕관');
  assert.equal(loaded.bag.length, 1);
  assert.equal(canWield(loaded.equipment.armor, 'mage'), true, '입고 있던 장비는 그대로 유효');
  assert.equal(canWield(loaded.bag[0], 'mage'), true, '가방에 있던 옛 장비도 그대로 쓸 수 있다');
  // 새 드롭의 표식은 저장·재로드에서 유지된다.
  const tagged = migrateItem({ id: 'new', name: '황혼의 그림자 추적자', slot: 'armor', rarity: 'rare', stats: { defense: 10 }, job: 'archer' });
  assert.equal(tagged.job, 'archer');
  assert.equal(parseSave({ ...freshSave(), job: 'archer', bag: [tagged] }).bag[0].job, 'archer');
  // 알 수 없는 표식은 버린다.
  assert.equal(migrateItem({ id: 'x', name: '황혼의 가죽 조끼', slot: 'armor', rarity: 'rare', stats: {}, job: 'rogue' }).job, undefined);
});
