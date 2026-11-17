import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { showEquippedDetail, dismissEquippedDetail } = await import('../src/ui/equippedDetail.ts');
const { freshSave } = await import('../src/game/store.ts');
function fixture() {
  let panel;
  const rect={left:10,right:460,top:10,bottom:700,width:450,height:690};
  const anchor={dataset:{equippedSlot:'weapon'},setAttribute(){},getBoundingClientRect:()=>({...rect,top:70,bottom:140})};
  const dialog={getBoundingClientRect:()=>rect,append(node){panel=node;}};
  const modal={querySelector(selector){if(selector==='.equipped-detail')return panel;if(selector==='.modal-dialog')return dialog;if(selector.startsWith('[data-equipped'))return anchor;return null;},querySelectorAll:selector=>selector === '.equipment-slot' ? [anchor] : []};
  const save=freshSave();save.equipment.weapon={id:'blade',name:'검',slot:'weapon',rarity:'magic',stats:{attack:12},locked:true};
  let changes=0;const messages=[];
  const ui={modal,openModal:'equipment',world:{save,onChange(){changes++;}},message:m=>messages.push(m)};
  return {ui,get panel(){return panel;},get changes(){return changes;},messages,remove(){panel=undefined;}};
}
test('hover and touch inspect equipped stats without removing gear; explicit unequip preserves lock',()=>{
  const previous=globalThis.document;const f=fixture();
  globalThis.document={createElement:()=>({children:[],dataset:{},style:{},setAttribute(){},append(...nodes){this.children.push(...nodes);},addEventListener(){},remove:()=>f.remove(),getBoundingClientRect:()=>({width:250,height:180})})};
  try {
    showEquippedDetail(f.ui,'weapon');
    assert.equal(f.ui.world.save.equipment.weapon.id,'blade');assert.equal(f.changes,0);
    assert(f.panel.children.some(n=>n.textContent==='공격 +12'));
    showEquippedDetail(f.ui,'weapon',true);assert.equal(f.ui.equippedPinned,true);
    const button=f.panel.children.at(-1);button.onclick();
    assert.equal(f.ui.world.save.equipment.weapon,undefined);assert.equal(f.ui.world.save.bag.at(-1).locked,true);assert.equal(f.changes,1);assert.equal(f.ui.equippedSlot,undefined);
  } finally {globalThis.document=previous;}
});
test('full bag prevents unequip and explains failure; dismiss only clears view state',()=>{
  const previous=globalThis.document;const f=fixture();
  globalThis.document={createElement:()=>({children:[],dataset:{},style:{},setAttribute(){},append(...nodes){this.children.push(...nodes);},addEventListener(){},remove:()=>f.remove(),getBoundingClientRect:()=>({width:250,height:180})})};
  try {
    f.ui.world.save.bag=Array.from({length:40},()=>({id:'other'}));showEquippedDetail(f.ui,'weapon',true);
    f.panel.children.at(-1).onclick();assert(f.ui.world.save.equipment.weapon);assert.equal(f.changes,0);assert.match(f.messages[0],/가방이 가득/);
    dismissEquippedDetail(f.ui);assert.equal(f.ui.equippedPinned,false);assert(f.ui.world.save.equipment.weapon);
  } finally {globalThis.document=previous;}
});
