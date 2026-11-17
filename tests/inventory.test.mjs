import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave }=await import('../src/game/store.ts');
const { canAutoEquip, salvagePlan, salvageItems }=await import('../src/game/inventory.ts');
const { requestSalvage, renderSalvage }=await import('../src/ui/modals/salvageModal.ts');
const item=(id,slot='weapon',attack=5)=>({id,name:id,slot,rarity:'common',stats:{attack}});
test('auto equip availability is non-mutating and detects empty or upgradeable slots',()=>{
  const save=freshSave();assert(!canAutoEquip(save));save.bag=[item('sword')];const before=JSON.stringify(save);assert(canAutoEquip(save));assert.equal(JSON.stringify(save),before);
  save.equipment.weapon=item('strong','weapon',20);assert(!canAutoEquip(save));save.bag.push(item('best','weapon',30));assert(canAutoEquip(save));
});
test('ring reordering alone never advertises an equipment upgrade',()=>{
  const save=freshSave();save.equipment.ring1=item('weak','ring1',5);save.equipment.ring2=item('strong','ring2',10);assert(!canAutoEquip(save));
  save.bag=[item('new','ring2',20)];assert(canAutoEquip(save));
});
test('individual and batch salvage detect empty matching equipment slots',()=>{
  const save=freshSave();save.equipment.weapon=item('worn');save.bag=[item('spare'),item('helmet','helmet')];
  assert.deepEqual(salvagePlan(save,['spare']).emptySlots,[]);assert.deepEqual(salvagePlan(save,['spare','helmet']).emptySlots,['helmet']);
  save.equipment.ring1=item('ring','ring1');save.bag.push(item('ring-spare','ring1'));assert.deepEqual(salvagePlan(save,['ring-spare']).emptySlots,['ring1']);
});
test('requesting risky salvage opens confirmation without removing items or granting gold',()=>{
  const save=freshSave();save.bag=[item('sword')];const before=JSON.stringify(save);let opened;
  const ui={world:{save},open:kind=>{opened=kind;},message:()=>{}};
  requestSalvage.call(ui,['sword']);assert.equal(opened,'salvage');assert.deepEqual(ui.salvageIds,['sword']);assert.equal(JSON.stringify(save),before);
});
test('canceling salvage popup retains all equipment and currency',()=>{
  const save=freshSave();save.bag=[item('sword')];const before=JSON.stringify(save);const nodes=[];
  globalThis.document={createElement:tag=>{const node={tag,children:[],append(...children){this.children.push(...children);},appendChild(child){this.children.push(child);}};nodes.push(node);return node;}};
  const ui={world:{save},salvageIds:['sword'],open:kind=>{ui.opened=kind;}};
  renderSalvage.call(ui,{append(){}});nodes.find(node=>node.textContent==='취소하고 보관').onclick();
  assert.equal(ui.opened,'equipment');assert.equal(ui.salvageIds,undefined);assert.equal(JSON.stringify(save),before);delete globalThis.document;
});
test('confirm removes only captured bag items once, never skillbooks or equipped gear',()=>{
  const save=freshSave();save.equipment.helmet=item('equipped','helmet');save.bag=[item('old'),item('new'),{id:'book',slot:'skillbook',kind:'skillbook',skillId:'spin',rarity:'rare',stats:{}}];
  const result=salvageItems(save,['old','book','equipped']);assert.deepEqual(result,{count:1,gold:3,stones:1});assert.deepEqual(save.bag.map(i=>i.id),['new','book']);assert.equal(save.equipment.helmet.id,'equipped');
  assert.equal(salvageItems(save,['old']).count,0);assert.equal(save.gold,3);
});
test('stored item names are kept by migration so the server ownership identity stays intact',async()=>{
  const { migrateItem }=await import('../src/game/items.ts');
  const blade=migrateItem({id:'blade',name:'영원의 츠바이핸더',slot:'weapon',rarity:'legendary',stats:{attack:40}});
  assert.equal(blade.name,'영원의 츠바이핸더');
  const book=migrateItem({id:'book',kind:'skillbook',slot:'skillbook',skillId:'spin',rarity:'rare',stats:{},name:'[스킬북] 회오리 베기'});
  assert.equal(book.name,'[스킬북] 회오리 베기');
  assert.equal(migrateItem({id:'nameless',slot:'weapon',rarity:'rare',stats:{}}).name,'두손검');
  assert.equal(migrateItem({id:'newbook',kind:'skillbook',slot:'skillbook',skillId:'spin',rarity:'rare',stats:{}}).name,'[스킬북] 드래곤 트위스터');
});
