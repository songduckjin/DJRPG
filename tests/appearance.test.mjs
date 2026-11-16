import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { heroAppearance, unequipItem } = await import('../src/game/appearance.ts');
const { freshSave, parseSave, totalStats } = await import('../src/game/store.ts');
const equipment = slot => ({ id: slot, name: slot === 'helmet' ? '철제 바시넷' : '강철 브레스트플레이트', slot, rarity: 'rare', stats: { defense: 10 } });
for (const gender of ['male','female']) test(`${gender}: removing armor preserves helmet ownership, stats and appearance through saving`,()=>{
  const save=freshSave(gender);save.equipment={helmet:equipment('helmet'),armor:equipment('armor')};
  const before=totalStats(save).defense;
  assert.equal(unequipItem(save,'armor').ok,true);
  assert.equal(save.equipment.helmet.id,'helmet');assert.equal(save.equipment.armor,undefined);assert.deepEqual(save.bag.map(i=>i.id),['armor']);
  assert.equal(totalStats(save).defense,before-10);
  const loaded=parseSave(JSON.parse(JSON.stringify(save))), art=heroAppearance(loaded);
  assert.equal(art.helmet.id,'helmet');assert(!art.portrait.includes('armored'));assert.equal(art.idle,gender);assert.equal(art.attack,`${gender}Attack`);
  assert.equal(unequipItem(loaded,'helmet').ok,true);assert.equal(heroAppearance(loaded).helmet,undefined);assert.deepEqual(loaded.bag.map(i=>i.id),['armor','helmet']);
});
for (const gender of ['male', 'female']) test(`${gender}: armor keeps the correct body in every animation and the helmet remains independent`,()=>{
  const save=freshSave(gender);save.equipment={helmet:equipment('helmet'),armor:equipment('armor')};
  const art=heroAppearance(save), prefix=gender === 'female' ? 'femaleArmoredNoHelm' : 'armoredNoHelm';
  assert.equal(art.idle,prefix);assert.equal(art.walk,`${prefix}Walk`);assert.equal(art.attack,`${prefix}Attack`);
  assert(art.portrait.includes(gender === 'female' ? 'female_armored_nohelm' : 'warrior_armored_nohelm'));
  assert.equal(art.helmet.id,'helmet');
  unequipItem(save,'helmet');assert.equal(save.equipment.armor.id,'armor');assert.equal(heroAppearance(save).idle,prefix);assert.equal(heroAppearance(save).helmet,undefined);
});
test('full bag prevents unequip without losing either armor or helmet',()=>{
  const save=freshSave();save.equipment={helmet:equipment('helmet'),armor:equipment('armor')};save.bag=Array.from({length:40},(_,i)=>({...equipment('armor'),id:String(i)}));
  assert.equal(unequipItem(save,'armor').ok,false);assert.equal(save.bag.length,40);assert.equal(save.equipment.armor.id,'armor');assert.equal(save.equipment.helmet.id,'helmet');
});
