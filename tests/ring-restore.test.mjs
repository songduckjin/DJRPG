import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {freshSave,parseSave,autoEquipBest,totalStats}=await import('../src/game/store.ts');
const ring=(id,slot,attack,locked=false)=>({id,name:`반지 ${id}`,slot,rarity:'magic',stats:{attack},locked});
for(const gender of ['male','female'])test(`${gender}: auto-equipped opposite-slot rings survive repeated cloud save parsing with power and locks intact`,()=>{
  const save=freshSave(gender);save.equipment.ring1=ring('weak','ring1',1);save.equipment.ring2=ring('strong','ring2',20,true);save.bag=[ring('new','ring1',10)];
  autoEquipBest(save);
  assert.equal(save.equipment.ring1.id,'strong');assert.equal(save.equipment.ring2.id,'new');
  const expected=totalStats(save),before=JSON.stringify(save.equipment);
  let restored=save;for(let i=0;i<3;i++)restored=parseSave(JSON.parse(JSON.stringify(restored)));
  assert.equal(JSON.stringify(restored.equipment),before);assert.deepEqual(totalStats(restored),expected);assert(restored.equipment.ring1.locked);
  assert.equal(restored.equipment.ring1.slot,'ring2');assert.deepEqual(restored.bag.map(i=>i.id),['weak']);
});
test('one ring in either socket is kept with original item identity; other mismatched equipment is still rejected',()=>{
  const save=freshSave();save.equipment.ring2=ring('single','ring1',7,true);save.equipment.helmet={id:'bad',name:'갑옷',slot:'armor',rarity:'common',stats:{defense:1}};
  const restored=parseSave(JSON.parse(JSON.stringify(save)));
  assert.equal(restored.equipment.ring2.id,'single');assert.equal(restored.equipment.ring1,undefined);assert.equal(restored.equipment.helmet,undefined);assert(restored.equipment.ring2.locked);
});
