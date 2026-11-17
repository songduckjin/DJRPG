import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {renderBagBadge}=await import('../src/ui/hud.ts');
test('equipment badge counts only unseen equipment still in the bag, excluding all skillbooks',()=>{
 const badge={},ui={world:{save:{bag:[{id:'sword',slot:'weapon'},{id:'ring',slot:'ring1'},{id:'seen',slot:'helmet'},{id:'book',kind:'skillbook',skillId:'spin'},{id:'passive',kind:'skillbook',skillId:'body'}]}},newItems:new Set(['sword','ring','book','passive','removed']),get:()=>badge};
 renderBagBadge.call(ui);assert.equal(badge.textContent,'2');assert.equal(badge.hidden,false);
 ui.world.save.bag=ui.world.save.bag.filter(item=>item.kind==='skillbook');renderBagBadge.call(ui);assert.equal(badge.textContent,'0');assert.equal(badge.hidden,true);
 ui.newItems.clear();ui.world.save.bag.push({id:'sword',slot:'weapon'});renderBagBadge.call(ui);assert.equal(badge.hidden,true);
});
