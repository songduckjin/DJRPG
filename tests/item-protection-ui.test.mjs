import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave, parseSave } = await import('../src/game/store.ts');
const { migrateItem, salvageByRarity } = await import('../src/game/items.ts');
const { salvagePlan, salvageItems } = await import('../src/game/inventory.ts');
const { orderedSkills, filterSaleItems } = await import('../src/ui/itemOrder.ts');
const { detailPosition } = await import('../src/ui/bagDetail.ts');
const { bindModalClose } = await import('../src/ui/modalClose.ts');
const { renderMarket } = await import('../src/ui/modals/marketModal.ts');
const { Market } = await import('../src/game/market.ts');
const item=(id,slot='weapon',rarity='common',locked=false)=>({id,name:id,slot,rarity,stats:{attack:3},locked});

test('legacy equipment starts unlocked and locks survive bag/equipment save migration',()=>{
  const legacy=item('legacy');delete legacy.locked;assert.equal(migrateItem(legacy).locked,false);
  const save=freshSave();save.bag=[item('protected','weapon','rare',true)];save.equipment.helmet=item('helm','helmet','magic',true);
  const restored=parseSave(JSON.parse(JSON.stringify(save)));assert.equal(restored.bag[0].locked,true);assert.equal(restored.equipment.helmet.locked,true);
});
test('individual and both batch salvage paths exclude protected equipment and preserve its lock',()=>{
  for(const run of [save=>salvageItems(save,['protected','free']),save=>salvageByRarity(save,'unique')]){
    const save=freshSave();save.bag=[item('protected','weapon','common',true),item('free')];
    assert.deepEqual(salvagePlan(save,['protected']).items,[]);
    const result=run(save);assert.equal(result.count,1);assert.deepEqual(save.bag.map(i=>i.id),['protected']);assert(save.bag[0].locked);
  }
});
test('equipped skills lead the list in slot order with no duplicates and ordering updates after unequipping',()=>{
  const save=freshSave();save.quickSlots=['slam',null,'spin'];const sorted=orderedSkills(save);
  assert.deepEqual(sorted.slice(0,2),['slam','spin']);assert.equal(new Set(sorted).size,sorted.length);
  save.quickSlots[0]=null;assert.equal(orderedSkills(save)[0],'spin');
});
test('sale category and grade filters compose and include locked items for explicit unlock confirmation',()=>{
  const items=[item('blade','weapon','rare',true),item('crest','offhand','magic'),item('helm','helmet','rare'),item('ring','ring2','epic'),{id:'book',kind:'skillbook',slot:'skillbook',rarity:'rare',stats:{}}];
  assert.deepEqual(filterSaleItems(items,'weapon','rare').map(i=>i.id),['blade']);
  assert.deepEqual(filterSaleItems(items,'accessory','').map(i=>i.id),['ring']);
  assert.deepEqual(filterSaleItems(items,'skillbook','rare').map(i=>i.id),['book']);
  assert.equal(filterSaleItems(items,'armor','legendary').length,0);
});
test('compact description keeps content width and clamps beside the selected item at screen edge',()=>{
  const bounds={left:10,right:500,top:10,bottom:600};
  const placement=detailPosition(bounds,{left:460,top:150,bottom:200},100,240);
  assert.equal(placement.width,240);assert.equal(placement.left,252);assert(placement.left+placement.width<=492);
});
test('close responds at primary pointerdown before release, with keyboard click fallback',()=>{
  const handlers={};let closed=0,prevented=0,stopped=0;
  bindModalClose({addEventListener:(type,run)=>handlers[type]=run},()=>closed++);
  handlers.pointerdown({button:0,isPrimary:true,preventDefault(){prevented++;},stopPropagation(){stopped++;}});
  assert.equal(closed,1);assert.equal(prevented,1);assert.equal(stopped,1);
  handlers.pointerdown({button:2,isPrimary:true});assert.equal(closed,1);
  handlers.click({detail:1});assert.equal(closed,1);handlers.click({detail:0});assert.equal(closed,2);
});
function element(tag='div'){
  const node={tag,children:[],dataset:{},style:{},className:'',textContent:'',attrs:{},value:'',
    append(...children){this.children.push(...children);},prepend(...children){this.children.unshift(...children);},appendChild(child){this.append(child);return child;},replaceChildren(...children){this.children=children;},setAttribute(k,v){this.attrs[k]=v;}};
  Object.defineProperty(node,'lastElementChild',{get(){return this.children.at(-1);}});
  node.classList={add(name){node.className+=' '+name;},toggle(name,on){if(on)this.add(name);}};return node;
}
function find(node,predicate){if(node&&typeof node==='object'){if(predicate(node))return node;for(const child of node.children??[]){const match=find(child,predicate);if(match)return match;}}}
function hasClass(node,name){return node.className?.split(' ').includes(name);}
test('selling a locked item asks first, cancel keeps lock and approval submits explicit unlock once',()=>{
  const previous=globalThis.document;globalThis.document={createElement:tag=>element(tag)};
  try{
    const save=freshSave();save.bag=[item('protected','weapon','rare',true)];
    const market=new Market({conflicted:false});market.view='register';market.selectedItem='protected';market.price='100';market.data={inbox:[],listings:[],myActive:0};
    const calls=[];market.act=(action,data)=>calls.push({action,data});
    const ui={market,session:{guest:false},world:{save},root:{querySelector:()=>null}};
    const render=()=>{const dialog=element();renderMarket.call(ui,dialog);return dialog;};
    let dialog=render(),form=find(dialog,n=>hasClass(n,'market-register'));
    form.onsubmit({preventDefault(){}});assert.equal(calls.length,0);assert.equal(market.unlockItem,'protected');assert(save.bag[0].locked);
    dialog=render();let confirmation=find(dialog,n=>hasClass(n,'market-unlock-confirm'));
    assert.equal(confirmation.attrs.role,'alertdialog');find(confirmation,n=>n.textContent==='취소 · 잠금 유지').onclick();
    assert.equal(market.unlockItem,undefined);assert(save.bag[0].locked);assert.equal(calls.length,0);
    form=find(render(),n=>hasClass(n,'market-register'));form.onsubmit({preventDefault(){}});
    confirmation=find(render(),n=>hasClass(n,'market-unlock-confirm'));find(confirmation,n=>n.textContent==='잠금 해제 후 판매 등록').onclick();
    assert.deepEqual(calls,[{action:'register',data:{itemId:'protected',price:100,unlockItem:true}}]);assert(save.bag[0].locked);
    market.registerCategory='armor';assert(!find(render(),n=>hasClass(n,'market-pick')));
  }finally{globalThis.document=previous;}
});

test('market search offers only category, grade and option; selecting option immediately refreshes first page',()=>{
  const previous=globalThis.document;globalThis.document={createElement:tag=>element(tag)};
  try{
    const market=new Market({conflicted:false});market.view='active';market.data={inbox:[],listings:[],myActive:0,total:0};market.filters.page=2;
    let refreshed=0;market.refresh=()=>refreshed++;
    const dialog=element();renderMarket.call({market,session:{guest:false},world:{save:freshSave()},root:{querySelector:()=>null}},dialog);
    const form=find(dialog,n=>hasClass(n,'market-search')),labels=[];
    function collect(node){if(!node||typeof node!=='object')return;if(node.tag==='select')labels.push(node.attrs['aria-label']);for(const child of node.children??[])collect(child);}
    collect(form);assert.deepEqual(labels,['분류','등급','옵션']);
    const option=find(form,n=>n.tag==='select'&&n.attrs['aria-label']==='옵션');option.value='attack';option.onchange();
    assert.equal(market.filters.stat,'attack');assert.equal(market.filters.page,0);assert.equal(refreshed,1);
  }finally{globalThis.document=previous;}
});

test('bag grid marks only locked equipment at top-right without inserting details or changing cell count',async()=>{
  const { renderInventory }=await import('../src/ui/modals/equipModal.ts');
  const previous=globalThis.document;
  globalThis.document={createElement(tag){const node=element(tag);node.querySelector=function(selector){
    const existing=find(this,n=>n!==this&&n.tag===selector);if(existing)return existing;
    if(selector==='b'&&this.innerHTML?.includes('<b>')){const title=element('b');this.append(title);return title;}return null;
  };return node;}};
  try{
    const save=freshSave();save.bag=[item('protected','weapon','rare',true),item('free'),{id:'book',name:'book',kind:'skillbook',slot:'skillbook',rarity:'rare',skillId:'slash2',stats:{}}];
    const ui={world:{save},bagFilter:'all',salvageRarity:'common',iconPath:()=>'/empty.png'};
    const render=()=>{const dialog=element();renderInventory.call(ui,dialog);return find(dialog,n=>hasClass(n,'bag-grid'));};
    const grid=render();assert.equal(grid.children.length,3);
    const [locked,unlocked,book]=grid.children;
    assert(find(locked,n=>hasClass(n,'bag-lock-badge')));assert(locked.attrs['aria-label'].includes('잠긴 장비'));
    assert(!find(unlocked,n=>hasClass(n,'bag-lock-badge')));assert(!find(book,n=>hasClass(n,'bag-lock-badge')));
    save.bag[0].locked=false;const refreshed=render();assert.equal(refreshed.children.length,3);assert(!find(refreshed,n=>hasClass(n,'bag-lock-badge')));
  }finally{globalThis.document=previous;}
});

test('registration at the limit remains clickable and explains rejection before browser price validation',()=>{
  const previous=globalThis.document;globalThis.document={createElement:tag=>element(tag)};
  try{
    const save=freshSave();save.bag=[item('sale')];
    const market=new Market({conflicted:false});market.view='register';market.selectedItem='sale';market.price='';
    const calls=[],messages=[];market.act=(...args)=>calls.push(args);
    const ui={market,session:{guest:false},world:{save},message:message=>messages.push(message),root:{querySelector:()=>null}};
    for(const limit of [10,30]){
      market.data={inbox:[],listings:[],myActive:limit,rules:{maxListings:limit}};
      const dialog=element();renderMarket.call(ui,dialog);
      const form=find(dialog,n=>hasClass(n,'market-register')),submit=find(form,n=>hasClass(n,'market-primary'));
      assert.equal(submit.disabled,false);let prevented=false;
      submit.onclick({preventDefault(){prevented=true;}});assert(prevented);assert(messages.at(-1).includes(`${limit}개`));
      assert(find(form,n=>n.attrs?.role==='alert').textContent.includes('취소'));
      form.onsubmit({preventDefault(){}});assert.equal(calls.length,0);
      market.data.myActive=limit-1;market.price='100';form.onsubmit({preventDefault(){}});
      assert.deepEqual(calls.pop(),['register',{itemId:'sale',price:100}]);
    }
  }finally{globalThis.document=previous;}
});
