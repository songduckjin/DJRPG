import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {freshSave,parseSave}=await import('../src/game/store.ts');
const {countedInBag,equipmentCount,canStoreItem,EQUIPMENT_BAG_LIMIT}=await import('../src/game/bagCapacity.ts');
const {countedInBag:serverCountedInBag}=await import('../server/stat-books.mjs');
const {unequipItem}=await import('../src/game/appearance.ts');
const {World}=await import('../src/game/world.ts');
const {bagDetailPosition}=await import('../src/ui/bagDetail.ts');
const gear=id=>({id,name:'검',slot:'weapon',rarity:'common',stats:{attack:2}});
/** 영구 스탯북(파트 B) — 스킬북 자리를 이어받아 이제 1개 = 1칸을 쓴다. */
const book=id=>({id,name:'공격의 서',slot:'statbook',kind:'statbook',book:'attack',rarity:'unique',stats:{}});
const foreignBook=id=>({id,name:'체력의 서',slot:'statbook',kind:'statbook',book:'health',rarity:'unique',stats:{}});
const pouch=id=>({id,name:'무작위 보물 주머니',slot:'pouch',kind:'pouch',rarity:'unique',stats:{}});
test('가방 40칸은 장비·영구 스탯북·보물 주머니를 모두 1개씩 센다(파트 B — 직업 예외 없음)',()=>{
  for(const item of [gear('g'),book('b'),foreignBook('f'),pouch('p')]) assert.equal(countedInBag(item,'warrior'),true,`${item.slot} 는 칸을 쓴다`);
  // 서버 규칙(`server/stat-books.mjs`)도 같다.
  for(const job of ['warrior','archer','mage']) for(const item of [gear('g'),book('b'),foreignBook('f'),pouch('p')]) assert.equal(serverCountedInBag(item,job),countedInBag(item,job),`${job} · ${item.slot}`);
  const save=freshSave();save.bag=[...Array.from({length:38},(_,i)=>gear(`g${i}`)),book('book'),pouch('pouch')];
  assert.equal(equipmentCount(save.bag,save.job),40,'장비 38 + 스탯북 1 + 주머니 1 = 40');
  // 주머니 스택형 — 보물 주머니는 수량 무관 한 칸이고, 같은 종류의 책도 이미 있으면 0칸이다.
  assert.equal(canStoreItem(save.bag,pouch('newPouch'),save.job),true,'주머니는 이미 한 칸에 쌓여 있어 40칸에서도 들어간다');
  assert.equal(canStoreItem(save.bag,book('newBook'),save.job),true,'같은 종류(공격)의 스탯북도 한 칸에 쌓인다');
  assert.equal(canStoreItem(save.bag,foreignBook('newForeign'),save.job),false,'다른 종류(체력)의 스탯북은 새 칸이 필요하다');
  assert.equal(canStoreItem(save.bag,gear('new'),save.job),false,'장비는 자리가 없다');
  save.bag.pop();
  assert.equal(equipmentCount(save.bag,save.job),39);
  for(const item of [gear('new'),pouch('newPouch'),book('newBook')]) assert.equal(canStoreItem(save.bag,item,save.job),true,`${item.slot} 는 39칸에 들어간다`);
  assert.equal(EQUIPMENT_BAG_LIMIT,40);
});
test('save parsing keeps legacy items and unequip respects the unified forty-slot capacity',()=>{
  // 예전 규칙(내 직업 책·주머니는 칸을 쓰지 않았다)으로 쌓인 세이브는 40개를 넘을 수 있다 — 읽을 때 지우지 않는다.
  const save=freshSave();save.bag=[...Array.from({length:200},(_,i)=>foreignBook(`b${i}`)),...Array.from({length:39},(_,i)=>gear(`g${i}`))];save.equipment.weapon=gear('equipped');
  const restored=parseSave(JSON.parse(JSON.stringify(save)));assert.equal(restored.bag.length,239,'읽을 때 아이템을 지우지 않는다');assert.equal(equipmentCount(restored.bag),40,'같은 종류의 책 200권 = 한 칸 + 장비 39칸(주머니 스택형)');
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
test('full bag leaves every drop on the floor now that books are a slot too',()=>{

  const save=freshSave();save.tutorial=3;save.bag=Array.from({length:40},(_,i)=>gear(`g${i}`));
  const world=new World(save),point={x:world.player.x,y:world.player.y,age:0,warned:false};
  world.drops=[{...point,item:book('book')},{...point,item:foreignBook('foreign')},{...point,item:pouch('pouch')},{...point,item:gear('full')}];
  for(let i=0;i<25;i++)world.update(.1);
  assert.equal(equipmentCount(save.bag,save.job),40,'가방 40칸은 그대로');
  // 파트 B: 스탯북도 1칸이라 가득 찬 가방에서는 아무것도 줍지 않는다.
  for(const id of ['book','foreign','pouch','full']) assert(world.drops.some(drop=>drop.item.id===id),`${id} 는 바닥에 남는다`);
  // 한 칸 비우면 가장 가까운 드롭 하나가 들어간다.
  save.bag=save.bag.slice(0,39);for(let i=0;i<40;i++)world.update(.1);
  assert.equal(equipmentCount(save.bag,save.job),40,'빈 칸 하나를 드롭 하나가 채운다');
});
test('compact bag tooltip attaches above or below the tile without covering the same row',()=>{
  const bounds={left:10,right:450,top:10,bottom:600};
  const below=bagDetailPosition(bounds,{left:360,top:100,bottom:160},120,260);assert.equal(below.top,159);assert.equal(below.left,182);
  const above=bagDetailPosition(bounds,{left:20,top:500,bottom:560},120,260);assert.equal(above.top,381);assert(above.top+120<=501);
});
