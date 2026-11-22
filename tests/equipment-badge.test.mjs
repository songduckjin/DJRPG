import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {renderBagBadge}=await import('../src/ui/hud.ts');
test('equipment badge counts only unseen items still in the bag — 영구 스탯북도 이제 한 칸이다(파트 B)',()=>{
 const badge={},ui={world:{save:{bag:[{id:'sword',slot:'weapon'},{id:'ring',slot:'ring1'},{id:'seen',slot:'helmet'},{id:'book',kind:'statbook',book:'attack'},{id:'book2',kind:'statbook',book:'health'}]}},newItems:new Set(['sword','ring','book','book2','removed']),get:()=>badge};
 renderBagBadge.call(ui);assert.equal(badge.textContent,'4');assert.equal(badge.hidden,false);
 ui.world.save.bag=ui.world.save.bag.filter(item=>item.kind==='statbook');renderBagBadge.call(ui);assert.equal(badge.textContent,'2');assert.equal(badge.hidden,false);
 ui.newItems.delete('book');ui.newItems.delete('book2');ui.world.save.bag=[];renderBagBadge.call(ui);assert.equal(badge.textContent,'0');assert.equal(badge.hidden,true);
 ui.newItems.clear();ui.world.save.bag.push({id:'sword',slot:'weapon'});renderBagBadge.call(ui);assert.equal(badge.hidden,true);
});
