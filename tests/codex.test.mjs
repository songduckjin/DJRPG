import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { codexEntries, equipmentCodexKey, discoverEquipment, codexOwnership, filterCodex, firstDropFloor, codexOptions, codexVariantName }=await import('../src/game/codex.ts');
const { freshSave, parseSave }=await import('../src/game/store.ts');
const { salvageItems }=await import('../src/game/inventory.ts');
const { rollItem, slots, baseItems }=await import('../src/game/items.ts');
const item=(name,slot='weapon')=>({id:name+slot,name,slot,rarity:'rare',stats:{attack:5}});
test('codex contains exactly 75 unique illustrated base items, counting ring types once',()=>{
  assert.equal(codexEntries.length,75);assert.equal(new Set(codexEntries.map(e=>e.key)).size,75);assert.equal(codexEntries.filter(e=>e.slot==='ring').length,5);
  for(const entry of codexEntries){assert.equal(entry.art.columns,5);assert(entry.art.frame>=0&&entry.art.frame<5);assert(entry.art.path.startsWith('/assets/item-art/'));}
});
test('legacy prefixes, tutorial sword and old Zweihander spelling map to the base entry',()=>{
  assert.equal(equipmentCodexKey(item('낡은 두손검')),'weapon:0');assert.equal(equipmentCodexKey(item('영원의 쯔바이핸드')),'weapon:3');assert.equal(equipmentCodexKey(item('영원의 츠바이핸더')),'weapon:3');
  assert.equal(equipmentCodexKey(item('황혼의 낡은 부츠','boots')),'boots:0');assert.equal(equipmentCodexKey(item('커스텀 미등록 검')),undefined);
});
test('migration discovers current equipment and bag, and retains discovery after dismantling',()=>{
  const save=freshSave();save.bag=[item('황혼의 쯔바이핸드')];save.equipment.helmet=item('철제 바시넷','helmet');delete save.equipmentCollection;
  const loaded=parseSave(save);assert.deepEqual(new Set(loaded.equipmentCollection),new Set(['weapon:3','helmet:1']));
  salvageItems(loaded,loaded.bag.map(i=>i.id));const restored=parseSave(JSON.parse(JSON.stringify(loaded)));assert(restored.equipmentCollection.includes('weapon:3'));
  const entry=codexEntries.find(e=>e.key==='weapon:3');assert.deepEqual(codexOwnership(restored,entry),{bag:0,equipped:0,discovered:true});
});
test('ring slots share discovery while retaining the correct number owned',()=>{
  const save=freshSave();save.equipment.ring1=item('은 반지','ring1');save.equipment.ring2=item('황혼의 은 반지','ring2');discoverEquipment(save);
  assert.deepEqual(save.equipmentCollection,['ring:1']);assert.equal(codexOwnership(save,codexEntries.find(e=>e.key==='ring:1')).equipped,2);
});
test('skillbooks and invalid discovery keys never inflate equipment completion',()=>{
  const save=freshSave();save.bag=[{id:'book',name:'스킬북',slot:'skillbook',kind:'skillbook',skillId:'spin',rarity:'rare',stats:{}}];save.equipmentCollection=['unknown:0','weapon:999','weapon:0','weapon:0'];discoverEquipment(save);assert.deepEqual(save.equipmentCollection,['weapon:0']);assert.equal(equipmentCodexKey(save.bag[0]),undefined);
});
test('search and found/missing/owned filters distinguish permanent discovery from ownership',()=>{
  const save=freshSave();save.equipmentCollection=['weapon:3'];
  assert.equal(filterCodex(save,'쯔바이핸드').length,1);assert.equal(filterCodex(save,'영원의 쯔바이핸드').length,1);assert.equal(filterCodex(save,'','weapon').length,10);
  assert.equal(filterCodex(save,'','','found').length,1);assert.equal(filterCodex(save,'','','missing').length,74);assert.equal(filterCodex(save,'','','owned').length,0);
  save.bag=[item('황혼의 쯔바이핸드')];assert.equal(filterCodex(save,'','','owned').length,1);
});
test('tier unlock floors follow the live equipment generator rather than arbitrary levels',()=>{
  const sword=codexEntries.find(e=>e.key==='weapon:9'),ring=codexEntries.find(e=>e.key==='ring:4');
  assert.equal(firstDropFloor(sword,'common'),28);assert.equal(firstDropFloor(sword,'legendary'),10);assert.equal(firstDropFloor(ring,'common'),33);assert.equal(firstDropFloor(ring,'legendary'),17);
});
test('every illustrated tier previews options consistent with generated loot at its first floor',()=>{
  const random=Math.random;
  try { for(const entry of codexEntries) for(const rarity of ['common','magic','rare','legendary']) {
    const floor=firstDropFloor(entry,rarity),count=baseItems[entry.item.slot].length,offset=Math.floor(({common:0,magic:2,rare:4,legendary:6}[rarity])*(count-1)/9);
    const maxTier=Math.min(count-1,Math.floor((floor-1)/(count===10?3:8))+offset);
    const sequence=[{common:.5,magic:.05,rare:.01,legendary:.0001}[rarity],(slots.indexOf(entry.item.slot)+.1)/slots.length,(entry.index+.1)/(maxTier+1),.5];Math.random=()=>sequence.shift()??.5;
    const actual=rollItem(floor),preview=codexOptions(entry,rarity,floor);assert.equal(actual.name,codexVariantName(entry,rarity));
    for(const option of preview.stats){assert(actual.stats[option.stat]>=option.min);assert(actual.stats[option.stat]<=option.max);}
    assert.equal(Object.keys(actual.stats).length,preview.stats.length);
  }} finally {Math.random=random;}
});
