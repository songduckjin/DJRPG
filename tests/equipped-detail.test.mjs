import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const { wrapEquipmentName } = await import('../src/ui/modals/equipModal.ts');
const { equipmentFallbackPortrait, equipmentPortraitPlan, resetEquipmentPortraitCache } = await import('../src/ui/equipmentPortrait.ts');
const portraitSource = readFileSync(new URL('../src/ui/equipmentPortrait.ts', import.meta.url), 'utf8');
resetEquipmentPortraitCache();

for (const gender of ['male', 'female']) test(`${gender}: field and equipment preview keep the approved pilot art for every equipped set`, () => {
  const save = freshSave(gender);
  // 기본형 갑옷이면 그 티어의 시트(작업 155), 아니면 기준 본체 시트.
  // [작업 216] 무기를 안 찼으면 기본 검을 지운 `noweapon/` 판을 쓴다(빈손).
  const expectedBase = (armorIndex = -1, swordless = !save.equipment.weapon) => {
    const headless = save.equipment.helmet ? 'headless/' : '';
    if (armorIndex >= 0) return `/assets/pilot-25d/${swordless ? 'noweapon/' : ''}armors/${headless}warrior_${gender}_armor_${armorIndex}_idle_v1.png`;
    return swordless ? `/assets/pilot-25d/noweapon/${headless}warrior_${gender}_idle_v1.png` : `/assets/pilot-25d/${headless}warrior_${gender}_idle_v1.png`;
  };
  const check = (armorIndex = -1) => {
    const expected = expectedBase(armorIndex);
    assert.equal(equipmentFallbackPortrait(save), expected);
    const plan = equipmentPortraitPlan(save);
    assert.equal(plan.mode, 'fallback');
    assert.equal(plan.base, expected);
    // 초상화 키는 성별 + 갑옷 티어(작업 155) + 착용 투구 머리 파츠(작업 151). 없으면 '-'.
    assert.match(plan.key, new RegExp(`^pilot:${gender}:`));
    assert.equal(plan.key, `pilot:${gender}:a${armorIndex}:${plan.helmet ? plan.helmet.path : '-'}:${plan.weapon ? plan.weapon.path : '-'}`);
    assert.deepEqual(plan.layers, []);
  };
  check();
  save.equipment = {
    weapon: { id: 'weapon', name: '전설의 두손검', slot: 'weapon', rarity: 'legendary', stats: {} },
    armor: { id: 'armor', name: '용비늘 갑옷', slot: 'armor', rarity: 'legendary', stats: {} },
    helmet: { id: 'helmet', name: '낡은 투구', slot: 'helmet', rarity: 'common', stats: {} },
    offhand: { id: 'crest', name: '강철 문장', slot: 'offhand', rarity: 'common', stats: {} },
    boots: { id: 'boots', name: '기사의 사바톤', slot: 'boots', rarity: 'common', stats: {} }
  };
  // 기본형이 아닌 갑옷 이름은 기준 시트를 그대로 쓴다.
  check();
  // 기본형 10종은 그 티어 시트로 바뀐다(머리 없음 포함).
  save.equipment.armor = { id: 'armor', name: '사슬 갑옷', slot: 'armor', rarity: 'rare', stats: {} };
  check(2);
  save.equipment.helmet = undefined;
  check(2);
  // 기본형 대검(0번이 아닌 검)을 차면 필드·장비창 모두 기본 검을 지운 시트를 쓴다(작업 156).
  save.equipment.weapon = { id: 'weapon', name: '쯔바이핸드', slot: 'weapon', rarity: 'rare', stats: {} };
  assert.equal(equipmentFallbackPortrait(save),
    `/assets/pilot-25d/noweapon/armors/warrior_${gender}_armor_2_idle_v1.png`);
  const armed = equipmentPortraitPlan(save);
  assert.equal(armed.weapon?.path, '/assets/pilot-25d/weapons/weapon_3_v1.png');
  assert.match(armed.key, /weapon_3_v1\.png$/);
  // 0번(두손검)은 본체 시트에 그려져 있으므로 파츠를 쓰지 않는다.
  save.equipment.weapon = { id: 'weapon', name: '두손검', slot: 'weapon', rarity: 'common', stats: {} };
  assert.equal(equipmentPortraitPlan(save).weapon, undefined);
  assert.equal(equipmentFallbackPortrait(save),
    `/assets/pilot-25d/armors/warrior_${gender}_armor_2_idle_v1.png`);
});

test('equipment portrait uses a cached full-body pilot image without loading costume manifests or overlays', () => {
  assert.match(portraitSource, /pilot:\$\{save\.gender\}/);
  assert.match(portraitSource, /warrior_\$\{save\.gender\}_idle_v1\.png/);
  assert.doesNotMatch(portraitSource, /loadCostumeManifest|planHeroCostume|wearableEquipmentImage/);
  assert.match(portraitSource, /portraitCache\.size > 24/);
});
test('all six tier portraits are 720px tall transparent PNG assets',()=>{
  for(const gender of ['male','female']) for(const tier of [2,3,4]){
    const image=readFileSync(new URL(`../public/assets/warrior_equipped_t${tier}_${gender}.png`,import.meta.url));
    assert.equal(image.subarray(1,4).toString(),'PNG');
    assert.equal(image.readUInt32BE(20),720);
    assert(image.readUInt32BE(16)>256);
    assert.equal(image[24],8);
    assert.equal(image[25],3);
    assert(image.includes(Buffer.from('tRNS')));
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
