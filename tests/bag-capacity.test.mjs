import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {freshSave,parseSave}=await import('../src/game/store.ts');
const {countedInBag,equipmentCount,canStoreItem,EQUIPMENT_BAG_LIMIT}=await import('../src/game/bagCapacity.ts');
const {countedInBag:serverCountedInBag}=await import('../server/skill-ids.mjs');
const {unequipItem}=await import('../src/game/appearance.ts');
const {World}=await import('../src/game/world.ts');
const {bagDetailPosition}=await import('../src/ui/bagDetail.ts');
const gear=id=>({id,name:'검',slot:'weapon',rarity:'common',stats:{attack:2}});
const book=id=>({id,name:'[스킬북] 드래곤 트위스터',slot:'skillbook',kind:'skillbook',skillId:'spin',rarity:'rare',stats:{}});
const foreignBook=id=>({id,name:'[스킬북] 파이어 볼트',slot:'skillbook',kind:'skillbook',skillId:'fireBolt',rarity:'rare',stats:{}});
const pouch=id=>({id,name:'무작위 보물 주머니',slot:'pouch',kind:'pouch',rarity:'unique',stats:{}});
test('가방 40칸은 장비·스킬북(내 직업·다른 직업)·보물 주머니를 모두 1개씩 센다(작업 248)',()=>{
  for(const item of [gear('g'),book('b'),foreignBook('f'),pouch('p')]) assert.equal(countedInBag(item,'warrior'),true,`${item.slot} 는 칸을 쓴다`);
  // 서버 규칙(`server/skill-ids.mjs`)도 같다.
  for(const job of ['warrior','archer','mage']) for(const item of [gear('g'),book('b'),foreignBook('f'),pouch('p')]) assert.equal(serverCountedInBag(item,job),countedInBag(item,job),`${job} · ${item.slot}`);
  const save=freshSave();save.bag=[...Array.from({length:37},(_,i)=>gear(`g${i}`)),book('mine'),foreignBook('foreign'),pouch('pouch')];
  assert.equal(equipmentCount(save.bag,save.job),40,'장비 37 + 스킬북 2 + 주머니 1 = 40');
  for(const item of [gear('new'),book('newBook'),pouch('newPouch')]) assert.equal(canStoreItem(save.bag,item,save.job),false,`${item.slot} 는 자리가 없다`);
  save.bag.pop();
  assert.equal(equipmentCount(save.bag,save.job),39);
  for(const item of [gear('new'),book('newBook'),pouch('newPouch')]) assert.equal(canStoreItem(save.bag,item,save.job),true,`${item.slot} 는 39칸에 들어간다`);
  assert.equal(EQUIPMENT_BAG_LIMIT,40);
});
test('save parsing keeps legacy items and unequip respects the unified forty-slot capacity',()=>{
  // 예전 규칙(내 직업 책·주머니는 칸을 쓰지 않았다)으로 쌓인 세이브는 40개를 넘을 수 있다 — 읽을 때 지우지 않는다.
  const save=freshSave();save.bag=[...Array.from({length:200},(_,i)=>book(`b${i}`)),...Array.from({length:39},(_,i)=>gear(`g${i}`))];save.equipment.weapon=gear('equipped');
  const restored=parseSave(JSON.parse(JSON.stringify(save)));assert.equal(restored.bag.length,239,'읽을 때 아이템을 지우지 않는다');assert.equal(equipmentCount(restored.bag),239);
  assert.equal(unequipItem(restored,'weapon').ok,false,'가방이 40칸을 넘었으니 장비를 해제할 수 없다');
  restored.bag=Array.from({length:39},(_,i)=>gear(`g${i}`));
  assert(unequipItem(restored,'weapon').ok);assert.equal(equipmentCount(restored.bag),40,'해제한 장비가 40번째 칸으로 들어간다');
  restored.equipment.weapon=gear('another');
  assert.equal(unequipItem(restored,'weapon').ok,false,'40칸이면 더 해제할 수 없다');
  assert.equal(restored.bag.length,40);
});
test('가방 40칸이 차면 하단 내 정보 버튼과 가방 창에 가득 참이 표시된다',async()=>{
  const {renderBagBadge}=await import('../src/ui/hud.ts');
  const badge={textContent:'',hidden:true},fullBadge={textContent:'',hidden:true};
  const nav={className:'',attrs:{},title:'',classList:{toggle(name,on){this.last=[name,on];}},setAttribute(k,v){this.attrs[k]=v;}};
  const save=freshSave();save.bag=Array.from({length:40},(_,i)=>gear(`g${i}`));
  const ui={world:{save},newItems:new Set(),root:{querySelector:sel=>sel==='.new-badge'?badge:sel==='.bag-full-badge'?fullBadge:sel.includes('data-modal')?nav:null},get:sel=>sel==='.new-badge'?badge:undefined};
  renderBagBadge.call(ui);
  assert.equal(fullBadge.hidden,false);assert.equal(fullBadge.textContent,'FULL');
  assert.deepEqual(nav.classList.last,['is-bag-full',true]);assert.match(nav.attrs['aria-label'],/가방 가득 참 \(40\/40\)/);
  save.bag=save.bag.slice(0,39);renderBagBadge.call(ui);
  assert.equal(fullBadge.hidden,true);assert.deepEqual(nav.classList.last,['is-bag-full',false]);assert.equal(nav.attrs['aria-label'],'내 정보');
});
test('full equipment bag still picks up books while leaving equipment drops intact',()=>{

  const save=freshSave();save.tutorial=3;save.bag=Array.from({length:40},(_,i)=>gear(`g${i}`));
  const world=new World(save),point={x:world.player.x,y:world.player.y,age:0,warned:false};
  world.drops=[{...point,item:book('book')},{...point,item:pouch('pouch')},{...point,item:gear('full')}];
  for(let i=0;i<25;i++)world.update(.1);
  assert.equal(save.bag.length,40,'가득 찬 가방은 그대로');
  for(const id of ['book','pouch','full']) assert(world.drops.some(drop=>drop.item.id===id),`${id} 는 바닥에 남는다`);
  // 한 칸 비우면 스킬북은 들어간다(스킬북도 한 칸을 쓴다).
  save.bag.pop();for(let i=0;i<40;i++)world.update(.1);
  assert.equal(save.bag.length,40);assert(save.bag.some(item=>item.id==='book'));
  assert(world.drops.some(drop=>drop.item.id==='pouch'),'주머니는 아직 자리가 없다');
});
test('compact bag tooltip attaches above or below the tile without covering the same row',()=>{
  const bounds={left:10,right:450,top:10,bottom:600};
  const below=bagDetailPosition(bounds,{left:360,top:100,bottom:160},120,260);assert.equal(below.top,159);assert.equal(below.left,182);
  const above=bagDetailPosition(bounds,{left:20,top:500,bottom:560},120,260);assert.equal(above.top,381);assert(above.top+120<=501);
});
