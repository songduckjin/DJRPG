import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { heroAppearance, unequipItem, armorTier, armorPalette, helmetTier, helmetPalette } = await import('../src/game/appearance.ts');
const { baseItems } = await import('../src/game/items.ts');
const { gearHeadBand, gearTintCacheKey, isHairPixel, isSkinPixel } = await import('../src/game/render/gearTint.ts');
const { freshSave, parseSave, totalStats } = await import('../src/game/store.ts');
const equipment = slot => ({ id: slot, name: slot === 'helmet' ? '철제 바시넷' : '강철 브레스트플레이트', slot, rarity: 'rare', stats: { defense: 10 } });
for (const gender of ['male', 'female']) for (const helmet of [false, true]) for (const armor of [false, true]) {
  test(`${gender}: weaponless attack keeps ${helmet ? 'helmet' : 'bare head'} and ${armor ? 'armor' : 'base body'}`, () => {
    const save = freshSave(gender);
    if (helmet) save.equipment.helmet = equipment('helmet');
    if (armor) save.equipment.armor = equipment('armor');
    const appearance = heroAppearance(save);
    assert.equal(appearance.attack, undefined);
    assert.equal(appearance.helmetIntegrated, helmet);
  });
}
for (const gender of ['male','female']) test(`${gender}: removing armor preserves helmet ownership, stats and appearance through saving`,()=>{
  const save=freshSave(gender);save.equipment={helmet:equipment('helmet'),armor:equipment('armor')};
  // 직업 숙련(작업 255)이 장비 방어에 곱해진다 — 갑옷만 뺀 기대값을 같은 `totalStats`로 구해 비교한다.
  const helmetOnly=totalStats({...save,equipment:{helmet:save.equipment.helmet}}).defense;
  const before=totalStats(save).defense;
  assert.equal(unequipItem(save,'armor').ok,true);
  assert.equal(save.equipment.helmet.id,'helmet');assert.equal(save.equipment.armor,undefined);assert.deepEqual(save.bag.map(i=>i.id),['armor']);
  assert.equal(totalStats(save).defense,helmetOnly);assert(before>helmetOnly);
  const loaded=parseSave(JSON.parse(JSON.stringify(save))), art=heroAppearance(loaded);
  assert.equal(art.helmet.id,'helmet');assert(!art.portrait.includes('armored'));
  assert.equal(art.idle,gender === 'female' ? 'femaleBaseHelm' : 'maleBaseHelm');
  assert.equal(art.attack,undefined);
  assert.equal(art.helmetIntegrated,true);
  assert.equal(unequipItem(loaded,'helmet').ok,true);assert.equal(heroAppearance(loaded).helmet,undefined);assert.deepEqual(loaded.bag.map(i=>i.id),['armor','helmet']);
});
for (const gender of ['male', 'female']) test(`${gender}: armor keeps the correct body in every animation and the helmet remains independent`,()=>{
  const save=freshSave(gender);save.equipment={helmet:equipment('helmet'),armor:equipment('armor')};
  const art=heroAppearance(save), prefix=gender === 'female' ? 'femaleArmoredHelm' : 'armored';
  assert.equal(art.idle,prefix);assert.equal(art.walk,`${prefix}Walk`);assert.equal(art.attack,undefined);
  assert(art.portrait.includes(gender === 'female' ? 'female_armored_helm' : 'warrior_armored.png'));
  assert.equal(art.helmet.id,'helmet');
  assert.equal(art.helmetIntegrated,true);
  unequipItem(save,'helmet');assert.equal(save.equipment.armor.id,'armor');
  assert.equal(heroAppearance(save).idle,gender === 'female' ? 'femaleArmoredNoHelm' : 'armoredNoHelm');
  assert.equal(heroAppearance(save).helmet,undefined);
  assert.equal(heroAppearance(save).helmetIntegrated,false);
});
test('full bag prevents unequip without losing either armor or helmet',()=>{
  const save=freshSave();save.equipment={helmet:equipment('helmet'),armor:equipment('armor')};save.bag=Array.from({length:40},(_,i)=>({...equipment('armor'),id:String(i)}));
  assert.equal(unequipItem(save,'armor').ok,false);assert.equal(save.bag.length,40);assert.equal(save.equipment.armor.id,'armor');assert.equal(save.equipment.helmet.id,'helmet');
});
test('male helmet independently changes base and sword sprites without equipping armor',()=>{
  const save=freshSave('male');save.equipment={helmet:equipment('helmet')};
  assert.deepEqual([heroAppearance(save).idle,heroAppearance(save).walk,heroAppearance(save).attack],
    ['maleBaseHelm','maleBaseHelmWalk',undefined]);
  assert.equal(heroAppearance(save).helmetIntegrated,true);
  save.equipment.weapon={...equipment('helmet'),id:'weapon',slot:'weapon',name:'낡은 두손검'};
  assert.deepEqual([heroAppearance(save).idle,heroAppearance(save).walk],['maleSwordHelm','maleHelmWalk']);
  assert.equal(heroAppearance(save).attack,'maleHelmAttack');
  save.equipment.armor=equipment('armor');
  assert.deepEqual([heroAppearance(save).idle,heroAppearance(save).walk,heroAppearance(save).attack],
    ['armored','armoredWalk','armoredAttack']);
  unequipItem(save,'armor');
  assert.equal(heroAppearance(save).idle,'maleSwordHelm');
  unequipItem(save,'helmet');
  assert.deepEqual([heroAppearance(save).idle,heroAppearance(save).walk],['maleSword','maleWalk']);
});
test('female helmet uses integrated images with and without armor and sword',()=>{
  const save=freshSave('female');save.equipment={helmet:equipment('helmet')};
  assert.deepEqual([heroAppearance(save).idle,heroAppearance(save).walk,heroAppearance(save).attack],['femaleBaseHelm','femaleBaseHelmWalk',undefined]);
  save.equipment.weapon={...equipment('helmet'),id:'weapon',slot:'weapon',name:'낡은 두손검'};
  assert.deepEqual([heroAppearance(save).idle,heroAppearance(save).walk],['femaleSwordHelm','femaleHelmWalk']);
  assert.equal(heroAppearance(save).attack,'femaleHelmAttack');
  save.equipment.armor=equipment('armor');
  assert.equal(heroAppearance(save).idle,'femaleArmoredHelm');
  assert.equal(heroAppearance(save).helmetIntegrated,true);
  unequipItem(save,'helmet');
  assert.equal(heroAppearance(save).idle,'femaleArmoredNoHelm');
  assert.equal(heroAppearance(save).helmetIntegrated,false);
});
test('legacy 낡은 투구 uses its horned item art in every female body and motion state',()=>{
  const save=freshSave('female');save.equipment={helmet:{...equipment('helmet'),name:'낡은 투구'}};
  assert.deepEqual([heroAppearance(save).idle,heroAppearance(save).walk,heroAppearance(save).attack],
    ['femaleBaseOldHelm','femaleBaseOldHelmWalk',undefined]);
  assert(heroAppearance(save).portrait.endsWith('warrior_female_base_oldhelm.png'));
  save.equipment.weapon={...equipment('helmet'),id:'weapon',slot:'weapon',name:'낡은 두손검'};
  assert.deepEqual([heroAppearance(save).idle,heroAppearance(save).walk],['femaleSwordOldHelm','femaleOldHelmWalk']);
  assert.equal(heroAppearance(save).attack,'femaleOldHelmAttack');
  save.equipment.armor=equipment('armor');
  assert.deepEqual([heroAppearance(save).idle,heroAppearance(save).walk,heroAppearance(save).attack],
    ['femaleArmoredOldHelm','femaleArmoredOldHelmWalk','femaleArmoredOldHelmAttack']);
  save.equipment.helmet=equipment('helmet');
  assert.equal(heroAppearance(save).idle,'femaleArmoredHelm');
  unequipItem(save,'helmet');
  assert.equal(heroAppearance(save).idle,'femaleArmoredNoHelm');
});

test('armor and helmet base items map to the four appearance tiers and unique palettes', () => {
  const item = (slot, name) => ({ id: `${slot}-${name}`, name, slot, rarity: 'common', stats: {} });
  const armorTiers = baseItems.armor.map(name => armorTier(item('armor', name)));
  const helmetTiers = baseItems.helmet.map(name => helmetTier(item('helmet', name)));
  assert.deepEqual(armorTiers, [1, 1, 2, 2, 2, 3, 3, 3, 4, 4]);
  assert.deepEqual(helmetTiers, [1, 1, 2, 2, 2, 3, 3, 3, 4, 4]);
  assert.equal(new Set(baseItems.armor.map(name => armorPalette(item('armor', name)).key)).size, 10);
  assert.equal(new Set(baseItems.helmet.map(name => helmetPalette(item('helmet', name)).key)).size, 10);
});

test('gear palette helpers preserve empty slots, prefixed names and legacy helmet appearance', () => {
  assert.equal(armorTier(), null); assert.equal(armorPalette(), null);
  assert.equal(helmetTier(), null); assert.equal(helmetPalette(), null);
  const armor = { id: 'a', name: '무결의강철브레스트플레이트', slot: 'armor', rarity: 'legendary', stats: {} };
  assert.equal(armorTier(armor), 2); assert.equal(armorPalette(armor).key, 'steel');
  const legacy = { id: 'h', name: '낡은 투구', slot: 'helmet', rarity: 'common', stats: {} };
  assert.equal(helmetTier(legacy), 3); assert.equal(helmetPalette(legacy).key, 'abyss');
  assert.equal(heroAppearance(freshSave('female')).armorTier, null);
  const save = freshSave('female'); save.equipment.helmet = legacy;
  assert.equal(heroAppearance(save).idle, 'femaleBaseOldHelm');
});

test('gear tint protects skin samples and separates helmet and armor cache entries', () => {
  assert.equal(isSkinPixel(220, 180, 160), true);
  assert.equal(isSkinPixel(130, 135, 140), false);
  assert.equal(isSkinPixel(58, 43, 82), false);
  assert.equal(isSkinPixel(201, 166, 58), false);
  assert.equal(isHairPixel(92, 61, 39), true);
  assert.equal(isHairPixel(224, 190, 126), true);
  assert(gearHeadBand > 0 && gearHeadBand < .4);
  const armor = { key: 'leather' }, helmet = { key: 'iron' };
  assert.notEqual(gearTintCacheKey('body', armor, null), gearTintCacheKey('body', null, helmet));
  assert.notEqual(gearTintCacheKey('body', armor, helmet), gearTintCacheKey('body', armor, null));
});
