import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { codexEntries, codexEntryKeys, equipmentCodexKey, equipmentCodexVariantKey, discoverEquipment, codexOwnership, filterCodex, firstDropFloor, codexOptions, codexVariantName, codexVariantKey, codexVariants, codexVariantCount, normalizeCollection } = await import('../src/game/codex.ts');
const { freshSave, parseSave } = await import('../src/game/store.ts');
const { salvageItems } = await import('../src/game/inventory.ts');
const { rollItem, slots, baseItems, bowBases, staffBases, rarityOrder, rarityTiers, rarityNames, migrateItem, salvageByRarity, equipmentImage, wearableEquipmentImage } = await import('../src/game/items.ts');
const item = (name, slot = 'weapon', rarity = 'rare') => ({ id: name + slot + rarity, name, slot, rarity, stats: { attack: 5 } });

test('codex holds 135 illustrated base items (job-split weapons, helmets and armour included) and 810 grade cells', () => {
  assert.equal(codexEntries.length, 135); assert.equal(new Set(codexEntries.map(entry => entry.key)).size, 135);
  // 투구·갑옷도 세 직업 10종씩(작업 249) — 전사 0~9 · 궁수 10~19 · 마법사 20~29.
  assert.equal(codexEntries.filter(entry => entry.group === '판금').length, 10);
  assert.equal(codexEntries.filter(entry => entry.group === '경갑').length, 10);
  assert.equal(codexEntries.filter(entry => entry.group === '로브').length, 10);
  assert.equal(codexEntries.filter(entry => entry.group === '후드').length, 10);
  assert.equal(codexEntries.filter(entry => entry.group === '모자').length, 10);
  assert.equal(codexEntries.filter(entry => entry.slot === 'ring').length, 5);
  assert.equal(codexEntries.filter(entry => entry.group === '대검').length, 10);
  assert.equal(codexEntries.filter(entry => entry.group === '활').length, 10);
  assert.equal(codexEntries.filter(entry => entry.group === '지팡이').length, 10);
  assert.equal(codexVariantCount, 810, '135종 × 6등급 = 810칸');
  for (const entry of codexEntries) {
    assert.equal(entry.art.columns, 5); assert(entry.art.frame >= 0 && entry.art.frame < 5); assert(entry.art.path.startsWith('/assets/item-art/'));
    for (const rarity of rarityOrder) assert(normalizeCollection([codexVariantKey(entry, rarity)]).length === 1, `${entry.key}:${rarity} 키가 유효하다`);
  }
  // 무기 번호: 대검 0~9 · 활 10~19 · 지팡이 20~29.
  assert.equal(codexEntries.find(entry => entry.name === bowBases[0]).key, 'weapon:10');
  assert.equal(codexEntries.find(entry => entry.name === staffBases[9]).key, 'weapon:29');
});

test('bows and staves resolve to their own weapon codex number, art and job label', () => {
  assert.equal(equipmentCodexKey(item('황혼의 각궁')), 'weapon:11');
  assert.equal(equipmentCodexKey(item('룬 각궁')), 'weapon:15', '가장 긴 기본형이 이긴다');
  assert.equal(equipmentCodexKey(item('영원의 대현자의 성지팡이')), 'weapon:29');
  const bow = codexEntries.find(entry => entry.key === 'weapon:11');
  assert.equal(bow.group, '활');
  assert.deepEqual(equipmentImage(item('각궁')), { path: '/assets/item-art/bow_0.png', frame: 1, columns: 5 });
  assert.deepEqual(equipmentImage(item('대현자의 성지팡이')), { path: '/assets/item-art/staff_5.png', frame: 4, columns: 5 });
  assert.equal(wearableEquipmentImage(item('각궁')), undefined, '활·지팡이는 착용 외형 시트가 없다');
  assert.equal(codexEntryKeys.size, 135);
});

test('legacy prefixes, tutorial sword and old Zweihander spelling map to the base entry', () => {
  assert.equal(equipmentCodexKey(item('낡은 두손검')), 'weapon:0'); assert.equal(equipmentCodexKey(item('영원의 쯔바이핸드')), 'weapon:3'); assert.equal(equipmentCodexKey(item('영원의 츠바이핸더')), 'weapon:3');
  assert.equal(equipmentCodexKey(item('황혼의 낡은 부츠', 'boots')), 'boots:0'); assert.equal(equipmentCodexKey(item('커스텀 미등록 검')), undefined);
  assert.equal(equipmentCodexVariantKey(item('황혼의 낡은 부츠', 'boots')), 'boots:0:rare');
});

test('no-space legacy item name resolves to its distinct inventory and wearable frame', () => {
  const hood = item('낡은가죽두건', 'helmet');
  assert.deepEqual(equipmentImage(hood), { path: '/assets/item-art/helmet_0.png', frame: 0, columns: 5 });
  assert.deepEqual(wearableEquipmentImage(hood), { path: '/assets/wearable/helmets.png', frame: 0, columns: 5, rows: 2 });
  assert.equal(wearableEquipmentImage(item('낡은 철제바시넷', 'helmet'))?.frame, 1);
  assert.equal(wearableEquipmentImage(item('낡은 투구', 'helmet'))?.frame, 7);
  assert.equal(equipmentCodexKey(item('낡은 투구', 'helmet')), 'helmet:7', '그림과 도감 칸이 같은 기본형을 가리킨다');
});

test('all fifty equipment base models have an individual wearable art frame', () => {
  for (const slot of ['weapon', 'helmet', 'armor', 'gloves', 'boots']) for (const [frame, name] of baseItems[slot].entries()) {
    assert.deepEqual(wearableEquipmentImage(item(`낡은 ${name}`, slot)), { path: `/assets/wearable/${slot === 'weapon' ? 'weapons' : slot === 'helmet' ? 'helmets' : slot}.png`, frame, columns: 5, rows: 2 });
  }
});

test('먹은 등급만 발견된다 — 일반 한 벌로 레전드까지 채워지지 않는다 (작업 208 버그 수정)', () => {
  const save = freshSave(); save.bag = [item('황혼의 강철 브레스트플레이트', 'armor', 'common')];
  discoverEquipment(save);
  assert.deepEqual(save.equipmentCollection, ['armor:3:common'], '일반 한 칸만 발견');
  const entry = codexEntries.find(entry => entry.key === 'armor:3');
  assert.equal(codexOwnership(save, entry).discovered, true);
  const variants = codexVariants(save, '강철 브레스트플레이트');
  assert.equal(variants.length, 6);
  assert.deepEqual(variants.map(variant => variant.discovered), [true, false, false, false, false, false]);
  assert.deepEqual(variants.filter(variant => variant.rarity === 'legendary').map(variant => variant.discovered), [false], '레전드는 미발견');
  // 업적 `장비 도감 수집` 카운트 = 실제 발견한 등급별 개수.
  assert.equal(save.equipmentCollection.length, 1);
});

test('현재 보유한 장비는 착용·가방 모두 발견으로 잡히고 등급별로 따로 센다', () => {
  const save = freshSave();
  save.bag = [item('황혼의 쯔바이핸드', 'weapon', 'rare'), item('영원의 쯔바이핸드', 'weapon', 'legendary')];
  save.equipment.helmet = item('서리의 철제 바시넷', 'helmet', 'magic');
  discoverEquipment(save);
  assert.deepEqual(new Set(save.equipmentCollection), new Set(['weapon:3:rare', 'weapon:3:legendary', 'helmet:1:magic']));
  const sword = codexVariants(save, '쯔바이핸드');
  assert.deepEqual(sword.map(variant => variant.discovered), [false, false, true, false, false, true]);
  assert.equal(codexVariants(save, '', '', 'found').length, 3, '발견한 등급 칸만 3개');
  assert.equal(codexVariants(save, '', '', 'missing').length, 807);
});

test('migration keeps only real grades and drops the old slot:index keys, rediscovering from the save', () => {
  const save = freshSave(); save.bag = [item('황혼의 쯔바이핸드')]; save.equipment.helmet = item('철제 바시넷', 'helmet');
  delete save.equipmentCollection;
  const loaded = parseSave(save);
  assert.deepEqual(new Set(loaded.equipmentCollection), new Set(['weapon:3:rare', 'helmet:1:rare']));
  // 구버전 세이브의 `부위:번호` 키는 버린다 — 같은 가방에 있는 실제 등급만 다시 찾는다.
  const legacy = parseSave({ ...save, equipmentCollection: ['weapon:3', 'helmet:1', 'weapon:0:godlike'] });
  assert.deepEqual(new Set(legacy.equipmentCollection), new Set(['weapon:3:rare', 'helmet:1:rare']), '구키·가짜 등급은 남지 않는다');
  salvageItems(loaded, loaded.bag.map(entry => entry.id));
  const restored = parseSave(JSON.parse(JSON.stringify(loaded)));
  assert(restored.equipmentCollection.includes('weapon:3:rare'), '분해 뒤에도 발견 기록은 남는다');
  assert.deepEqual(codexOwnership(restored, codexEntries.find(entry => entry.key === 'weapon:3')), { bag: 0, equipped: 0, discovered: true });
});

test('ring slots share discovery while retaining the correct number owned', () => {
  const save = freshSave(); save.equipment.ring1 = item('은 반지', 'ring1'); save.equipment.ring2 = item('황혼의 은 반지', 'ring2'); discoverEquipment(save);
  assert.deepEqual(save.equipmentCollection, ['ring:1:rare']); assert.equal(codexOwnership(save, codexEntries.find(entry => entry.key === 'ring:1')).equipped, 2);
});

test('skillbooks, pouches and invalid discovery keys never inflate equipment completion', () => {
  const save = freshSave();
  save.bag = [{ id: 'book', name: '스킬북', slot: 'skillbook', kind: 'skillbook', skillId: 'spin', rarity: 'rare', stats: {} }, { id: 'pouch', name: '무작위 보물 주머니', slot: 'pouch', kind: 'pouch', rarity: 'unique', stats: {} }];
  save.equipmentCollection = ['unknown:0', 'weapon:999', 'weapon:0', 'weapon:0:common', 'weapon:0:common', 'weapon:3:godlike'];
  discoverEquipment(save);
  assert.deepEqual(save.equipmentCollection, ['weapon:0:common']);
  assert.equal(equipmentCodexKey(save.bag[0]), undefined); assert.equal(equipmentCodexVariantKey(save.bag[1]), undefined);
});

test('search and found/missing/owned filters work per grade and include bows and staves', () => {
  const save = freshSave(); save.equipmentCollection = ['weapon:3:legendary'];
  assert.equal(filterCodex(save, '쯔바이핸드').length, 1); assert.equal(filterCodex(save, '영원의 쯔바이핸드').length, 1);
  assert.equal(filterCodex(save, '', 'weapon').length, 30, '무기 = 대검 10 + 활 10 + 지팡이 10');
  assert.equal(filterCodex(save, '각궁').length, 2, '각궁·룬 각궁 두 기본형');
  assert.equal(codexVariants(save, '', 'weapon', 'all', 'legendary').length, 30);
  assert.equal(codexVariants(save, '', 'weapon', 'found').length, 1);
  assert.equal(codexVariants(save, '', 'weapon', 'missing').length, 179);
  assert.equal(codexVariants(save, '', 'weapon', 'owned').length, 0);
  save.bag = [item('황혼의 쯔바이핸드')]; assert.equal(codexVariants(save, '', 'weapon', 'owned').length, 1);
});

test('tier unlock floors follow the live equipment generator rather than arbitrary levels', () => {
  const sword = codexEntries.find(entry => entry.key === 'weapon:9'), ring = codexEntries.find(entry => entry.key === 'ring:4'), bow = codexEntries.find(entry => entry.key === 'weapon:19');
  assert.equal(firstDropFloor(sword, 'common'), 28); assert.equal(firstDropFloor(sword, 'legendary'), 7); assert.equal(firstDropFloor(ring, 'common'), 33); assert.equal(firstDropFloor(ring, 'legendary'), 9);
  assert.equal(firstDropFloor(bow, 'common'), 28, '활 10번째 티어도 대검과 같은 곡선');
});

test('every illustrated tier previews options consistent with generated loot at its first floor', () => {
  const random = Math.random;
  try {
    for (const entry of codexEntries) for (const rarity of rarityOrder) {
      const floor = firstDropFloor(entry, rarity), count = entry.slot === 'weapon' ? baseItems.weapon.length : baseItems[entry.item.slot].length, offset = Math.floor(rarityTiers[rarity] * (count - 1) / 9);
      const maxTier = Math.min(count - 1, Math.floor((floor - 1) / (count === 10 ? 3 : 8)) + offset);
      const depth = floor - 1, legendary = Math.min(.006, .002 + depth * .00005), rare = Math.min(.035, .017 + depth * .0004);
      const unique = legendary + (rare - legendary) * .18, epic = legendary + (rare - legendary) * .48;
      const rarityRoll = { common: .5, magic: .05, rare: (epic + rare) / 2, epic: (unique + epic) / 2, unique: (legendary + unique) / 2, legendary: legendary / 2 }[rarity];
      // 무기·투구·갑옷 드롭은 세 직업 1/3 확률이라(작업 204·249) 이 기본형의 직업 난수를 사이에 둔다.
      const mageGroup = entry.group === '지팡이' || entry.group === '로브' || entry.group === '모자';
      const archerGroup = entry.group === '활' || entry.group === '경갑' || entry.group === '후드';
      const jobSplit = entry.slot === 'weapon' || entry.slot === 'helmet' || entry.slot === 'armor';
      const jobRoll = jobSplit ? [archerGroup ? 1.1 / 3 : mageGroup ? 2.1 / 3 : .1 / 3] : [];
      const sequence = [rarityRoll, (slots.indexOf(entry.item.slot) + .1) / slots.length, ...jobRoll, (entry.tier + .1) / (maxTier + 1), .5];
      Math.random = () => sequence.shift() ?? 0;
      const actual = rollItem(floor), preview = codexOptions(entry, rarity, floor); assert.equal(actual.name, codexVariantName(entry, rarity));
      for (const option of preview.stats) { assert(actual.stats[option.stat] >= option.min); assert(actual.stats[option.stat] <= option.max); }
      assert.equal(Object.keys(actual.stats).length, preview.stats.length);
    }
  } finally { Math.random = random; }
});

test('grade filtering yields six variants per base with distinct identities and exact ownership', () => {
  const save = freshSave();
  assert.equal(codexVariants(save).length, 810); assert.equal(codexVariants(save, '', '', 'all', 'rare').length, 135);
  const swords = codexVariants(save, '쯔바이핸드', 'weapon'); assert.equal(swords.length, 6); assert.equal(new Set(swords.map(variant => variant.key)).size, 6);
  assert.equal(codexVariants(save, '쯔바이핸드', 'weapon', 'all', 'legendary')[0].name, '영원의 쯔바이핸드');
  save.bag = [item('황혼의 쯔바이핸드')]; save.equipment.weapon = { ...item('서리의 쯔바이핸드'), rarity: 'magic' };
  assert.equal(codexVariants(save, '', 'weapon', 'owned', 'rare').length, 1); assert.equal(codexVariants(save, '', 'weapon', 'owned', 'legendary').length, 0);
});

test('all six rarity keys survive save migration and salvage thresholds protect legendary gear', () => {
  assert.deepEqual(Object.values(rarityNames), ['일반', '매직', '레어', '에픽', '유니크', '레전드']);
  const save = freshSave(); save.bag = rarityOrder.map((rarity, index) => ({ id: String(index), name: `${rarity} 두손검`, slot: 'weapon', rarity, stats: { attack: 10 } }));
  const loaded = parseSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(loaded.bag.map(entry => entry.rarity), rarityOrder);
  for (const rarity of rarityOrder) assert.equal(migrateItem({ id: rarity, name: rarity, slot: 'weapon', rarity, stats: { attack: 1 } }).rarity, rarity);
  const result = salvageByRarity(loaded, 'unique'); assert.equal(result.count, 5); assert.deepEqual(loaded.bag.map(entry => entry.rarity), ['legendary']);
});
