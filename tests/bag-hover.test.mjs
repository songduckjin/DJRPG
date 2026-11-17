import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { showBagDetail, dismissBagDetail, deferBagDismiss, bagDetailPinned } = await import('../src/ui/bagDetail.ts');
const { itemDetail } = await import('../src/ui/modals/equipModal.ts');
const { freshSave } = await import('../src/game/store.ts');
function fixture() {
  let panel,changes=0;
  const rect={left:10,right:450,top:10,bottom:700,width:440,height:690};
  const grid={getBoundingClientRect:()=>rect};
  function node(){
    const result={children:[],dataset:{},style:{},attrs:{},className:'',append(...children){this.children.push(...children);},appendChild(child){this.children.push(child);},setAttribute(k,v){this.attrs[k]=v;},addEventListener(){},remove(){panel=undefined;},getBoundingClientRect:()=>({...rect,width:260,height:180}),parentElement:grid};
    result.classList={add(c){result.className+=' '+c;},remove(c){result.className=result.className.split(' ').filter(v=>v!==c).join(' ');},toggle(c,on){this.remove(c);if(on)this.add(c);}};
    return result;
  }
  const cells=['a','b'].map(id=>{const cell=node();cell.className='bag-item';cell.dataset.itemId=id;return cell;});
  const dialog={append(value){panel=value;},getBoundingClientRect:()=>rect};
  const modal={querySelector(selector){if(selector==='.bag-detail-overlay')return panel;if(selector==='.bag-item.selected')return cells.find(c=>c.attrs['aria-expanded']==='true');if(selector==='.modal-dialog')return dialog;return null;},querySelectorAll(selector){return selector==='.bag-item.selected'?cells.filter(c=>c.attrs['aria-expanded']==='true'):cells;}};
  const save=freshSave();save.equipment={};save.bag=['a','b'].map(id=>({id,name:`장비 ${id}`,slot:'weapon',rarity:'rare',stats:{attack:10},locked:false}));
  const ui={modal,openModal:'equipment',world:{save,onChange(){changes++;}},itemDetail(save,item){return itemDetail.call(this,save,item);},renderModal(){throw new Error('hover must not rebuild inventory');}};
  return {ui,cells,node,get panel(){return panel;},get changes(){return changes;}};
}
test('bag hover opens actual comparison and actions without rebuilding inventory; pointer can enter the overlay',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),previous=globalThis.document;
  globalThis.document={createElement:()=>f.node()};
  try{
    showBagDetail(f.ui,'a');const panel=f.panel;
    assert.equal(f.ui.selected,'a');assert.equal(f.cells[0].attrs['aria-expanded'],'true');assert.equal(f.ui.world.save.bag.length,2);
    deferBagDismiss(f.ui);t.mock.timers.tick(90);panel.onpointerenter();t.mock.timers.tick(300);assert.equal(f.panel,panel);
    const actions=panel.children.find(n=>n.className==='detail-actions');actions.children[0].onclick();
    assert.equal(f.ui.world.save.equipment.weapon.id,'a');assert.equal(f.ui.world.save.bag.length,1);assert.equal(f.changes,1);
  }finally{globalThis.document=previous;dismissBagDetail(f.ui);}
});
test('bag hover switches item, touch pins until dismissal, and closing never modifies saved items',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const f=fixture(),previous=globalThis.document;
  globalThis.document={createElement:()=>f.node()};
  try{
    showBagDetail(f.ui,'a');const first=f.panel;showBagDetail(f.ui,'b');assert.notEqual(f.panel,first);
    assert.equal(f.cells[0].attrs['aria-expanded'],'false');assert.equal(f.cells[1].attrs['aria-expanded'],'true');
    showBagDetail(f.ui,'b',true);assert(bagDetailPinned(f.ui));deferBagDismiss(f.ui);t.mock.timers.tick(400);assert.equal(f.ui.selected,'b');
    dismissBagDetail(f.ui);assert.equal(f.ui.selected,undefined);assert.equal(f.panel,undefined);assert(!bagDetailPinned(f.ui));assert.equal(f.ui.world.save.bag.length,2);
    showBagDetail(f.ui,'a');deferBagDismiss(f.ui);t.mock.timers.tick(181);assert.equal(f.panel,undefined);
  }finally{globalThis.document=previous;dismissBagDetail(f.ui);}
});
