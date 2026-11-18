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

const { attachedDetailPosition } = await import('../src/ui/bagDetail.ts');
const { deferEquippedDismiss } = await import('../src/ui/equippedDetail.ts');
const { wrapEquipmentName, equipmentShowcase } = await import('../src/ui/modals/equipModal.ts');
const { wearableEquipmentImage } = await import('../src/game/items.ts');
test('equipment preview uses a bare gender-matched body and layers the exact equipped wearable art',()=>{
  for(const gender of ['male','female']){
    const save=freshSave(gender);save.equipment={
      weapon:{id:'weapon',name:'서리의 두손검',slot:'weapon',rarity:'magic',stats:{}},
      helmet:{id:'helmet',name:'낡은 가죽 두건',slot:'helmet',rarity:'common',stats:{}},
      armor:{id:'armor',name:'낡은 가죽 조끼',slot:'armor',rarity:'common',stats:{}},
      gloves:{id:'gloves',name:'낡은 천 장갑',slot:'gloves',rarity:'common',stats:{}},
      boots:{id:'boots',name:'서리의 사슬 그리브',slot:'boots',rarity:'magic',stats:{}}
    };
    const preview=equipmentShowcase(save);
    assert.equal(preview.portrait,`/assets/warrior_${gender}_base.png`);
    assert.deepEqual(preview.layers.map(layer=>layer.slot),['weapon','helmet','armor','gloves','boots']);
    for(const layer of preview.layers){
      const art=wearableEquipmentImage(save.equipment[layer.slot]);
      assert.equal(layer.path,art.path);assert.equal(layer.frame,art.frame);
      assert(layer.size>0&&layer.size<=1);assert(layer.left>=0&&layer.left<=1);assert(layer.top>=0&&layer.top<=1);
    }
    assert.equal(preview.layers.find(layer=>layer.slot==='boots').frame,2);
  }
});
test('equipment names wrap at word boundaries within eight characters and retain all name content',()=>{
  assert.equal(wrapEquipmentName('서리의 룬 블레이드'),'서리의 룬\n블레이드');
  assert.equal(wrapEquipmentName('낡은 강철 플레이트'),'낡은 강철\n플레이트');
  assert.equal(wrapEquipmentName('일이삼사오육칠'),'일이삼사오육칠');
  assert.equal(wrapEquipmentName('일이삼사오육칠팔구'),'일이삼사오육칠팔\n구');
  assert.equal(wrapEquipmentName('영원의 강철 브레스트플레이트'),'영원의 강철\n브레스트플레이트');
  for(const name of ['두손검','서리의 룬 블레이드','찬란한영웅의황금갑옷','검⚔️전설장비이름']){
    const wrapped=wrapEquipmentName(name);
    assert.equal(wrapped.replace(/\s/g,''),name.replace(/\s/g,''));
    assert(wrapped.split('\n').every(line=>Array.from(line).length<=8));
  }
});
test('attached descriptions touch either side of their item, including narrow and bottom-edge layouts',()=>{
  for(const width of [270,450]){
    const bounds={left:10,right:10+width,top:10,bottom:600};
    for(const anchor of [{left:20,right:120,top:80,bottom:145},{left:width-100,right:width,top:510,bottom:575}]){
      const p=attachedDetailPosition(bounds,anchor,180,260);
      assert(p.left>=bounds.left+8);assert(p.left+p.width<=bounds.right-8);
      assert(p.top>=bounds.top+8);assert(p.top+180<=bounds.bottom-8);
      assert(p.left<=anchor.right && p.left+p.width>=anchor.left, 'no pointer gap between item and description');
      assert(p.top<anchor.bottom && p.top+180>anchor.top, 'description remains beside its own row');
    }
  }
});
test('moving from equipment into its description cancels dismissal and keeps unequip actionable',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const previous=globalThis.document,f=fixture();
  globalThis.document={createElement:()=>({children:[],dataset:{},style:{},setAttribute(){},append(...nodes){this.children.push(...nodes);},addEventListener(){},remove:()=>f.remove(),getBoundingClientRect:()=>({width:250,height:180})})};
  try{
    showEquippedDetail(f.ui,'weapon');const panel=f.panel;
    deferEquippedDismiss(f.ui);t.mock.timers.tick(90);panel.onpointerenter();t.mock.timers.tick(300);
    assert.equal(f.panel,panel);assert.equal(f.ui.equippedSlot,'weapon');
    panel.children.at(-1).onclick();assert.equal(f.changes,1);
  }finally{globalThis.document=previous;}
});

test('equipped detail lock toggles immediately, persists after unequip and refuses paused edits',()=>{
  const previous=globalThis.document,f=fixture();
  globalThis.document={createElement:()=>({children:[],dataset:{},style:{},attrs:{},setAttribute(key,value){this.attrs[key]=value;},append(...nodes){this.children.push(...nodes);},addEventListener(){},remove:()=>f.remove(),getBoundingClientRect:()=>({width:250,height:180})})};
  try{
    showEquippedDetail(f.ui,'weapon',true);const lock=f.panel.children[0].children[1];assert.equal(lock.attrs['aria-pressed'],'true');assert(lock.innerHTML.includes('is-locked'));
    f.ui.world.paused=true;lock.onclick();assert(f.ui.world.save.equipment.weapon.locked);assert.equal(f.changes,0);assert.match(f.messages.at(-1),/동기화/);
    f.ui.world.paused=false;lock.onclick();assert.equal(f.ui.world.save.equipment.weapon.locked,false);assert.equal(lock.attrs['aria-pressed'],'false');assert(lock.innerHTML.includes('is-open'));
    lock.onclick();assert(f.ui.world.save.equipment.weapon.locked);f.panel.children.at(-1).onclick();assert(f.ui.world.save.bag.at(-1).locked);
  }finally{globalThis.document=previous;}
});
