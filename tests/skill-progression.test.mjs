import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave, parseSave, useSkillBook }=await import('../src/game/store.ts');
const {skillBookCost,skillBookStatus,hasSkillUpgrade}=await import('../src/game/skillProgress.ts');
const book=(id,skillId='spin')=>({id,kind:'skillbook',slot:'skillbook',skillId,name:'[스킬북] 드래곤 트위스터',rarity:'rare',stats:{}});
test('target-level costs increase at each five-level boundary and total 105 books',()=>{
  assert.deepEqual([1,5,6,10,11,15,16,20,21,25,26,30].map(skillBookCost),[1,1,2,2,3,3,4,4,5,5,6,6]);
  assert.equal(Array.from({length:30},(_,i)=>skillBookCost(i+1)).reduce((a,b)=>a+b),105);
});
test('active and passive upgrades consume only matching books atomically; insufficient and max keep save intact',()=>{
  for(const id of ['spin','body']){
    const save=freshSave();if(id==='body')save.passives=['body'];else save.learned=['spin'];save.skillLevels[id]=25;
    save.bag=[...Array.from({length:5},(_,i)=>book(`b${i}`,id)),book('other','slam')];
    const before=JSON.stringify(save);assert(!useSkillBook(save,'b0').ok);assert.equal(JSON.stringify(save),before);assert(!skillBookStatus(save,id).ready);
    save.bag.push(book('sixth',id));assert(hasSkillUpgrade(save));assert(useSkillBook(save,'b0').ok);
    assert.equal(save.skillLevels[id],26);assert.deepEqual(save.bag.map(i=>i.id),['other']);
    const reloaded=parseSave(JSON.parse(JSON.stringify(save)));assert.equal(reloaded.skillLevels[id],26);
    save.skillLevels[id]=30;save.bag=[book('max',id)];const max=JSON.stringify(save);assert(!useSkillBook(save,'max').ok);assert.equal(JSON.stringify(save),max);assert(!hasSkillUpgrade(save));
  }
});
test('existing level 10 survives parsing, upgrades to 11 using three copies, and learning costs one',()=>{
  const save=freshSave();save.learned=['spin'];save.skillLevels.spin=10;save.bag=[book('one'),book('two'),book('three')];
  const parsed=parseSave(JSON.parse(JSON.stringify(save)));assert.equal(parsed.skillLevels.spin,10);assert(useSkillBook(parsed,'two').ok);assert.equal(parsed.skillLevels.spin,11);assert.equal(parsed.bag.length,0);
  parsed.bag=[book('learn','slam')];assert(useSkillBook(parsed,'learn').ok);assert(parsed.learned.includes('slam'));assert.equal(parsed.skillLevels.slam,1);
});
