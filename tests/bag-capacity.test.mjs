import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {freshSave,parseSave}=await import('../src/game/store.ts');
const {equipmentCount,canStoreItem}=await import('../src/game/bagCapacity.ts');
const {unequipItem}=await import('../src/game/appearance.ts');
const {World}=await import('../src/game/world.ts');
const {bagDetailPosition}=await import('../src/ui/bagDetail.ts');
const gear=id=>({id,name:'검',slot:'weapon',rarity:'common',stats:{attack:2}});
const book=id=>({id,name:'[스킬북] 드래곤 트위스터',slot:'skillbook',kind:'skillbook',skillId:'spin',rarity:'rare',stats:{}});
test('save parsing retains all books plus forty gear and unequip respects only equipment capacity',()=>{
  const save=freshSave();save.bag=[...Array.from({length:200},(_,i)=>book(`b${i}`)),...Array.from({length:39},(_,i)=>gear(`g${i}`))];save.equipment.weapon=gear('equipped');
  const restored=parseSave(JSON.parse(JSON.stringify(save)));assert.equal(restored.bag.length,239);assert.equal(equipmentCount(restored.bag),39);
  assert(unequipItem(restored,'weapon').ok);assert.equal(equipmentCount(restored.bag),40);assert(canStoreItem(restored.bag,book('extra')));assert(!canStoreItem(restored.bag,gear('extra')));
  restored.equipment.weapon=gear('another');assert(!unequipItem(restored,'weapon').ok);assert.equal(restored.bag.length,240);
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
  const world=new World(save),point={x:world.player.x,y:world.player.y,age:0,warned:false};world.drops=[{...point,item:book('book')},{...point,item:gear('full')}];
  // Both drops rest for 1.5s first, then only the book has room in a full equipment bag.
  for(let i=0;i<25;i++)world.update(.1);
  assert.equal(save.bag.length,41);assert.equal(save.bag.at(-1).id,'book');assert(world.drops.some(drop=>drop.item.id==='full'));
});
test('compact bag tooltip attaches above or below the tile without covering the same row',()=>{
  const bounds={left:10,right:450,top:10,bottom:600};
  const below=bagDetailPosition(bounds,{left:360,top:100,bottom:160},120,260);assert.equal(below.top,159);assert.equal(below.left,182);
  const above=bagDetailPosition(bounds,{left:20,top:500,bottom:560},120,260);assert.equal(above.top,381);assert(above.top+120<=501);
});
