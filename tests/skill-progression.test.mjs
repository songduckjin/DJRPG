import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave, parseSave, useSkillBook }=await import('../src/game/store.ts');
const {skillBookCost,skillBookStatus,hasSkillUpgrade}=await import('../src/game/skillProgress.ts');
const { MAX_SKILL_LEVEL } = await import('../src/game/skills.ts');
const book=(id,skillId='spin')=>({id,kind:'skillbook',slot:'skillbook',skillId,name:'[스킬북] 드래곤 트위스터',rarity:'rare',stats:{}});

/** 스킬북 사용 규칙 — 스킬 최대 레벨이 Lv.10으로 내려간 뒤(4단계 스킬 트리)의 구간. */
test('target-level costs increase at each five-level boundary and total 105 books',()=>{
  assert.deepEqual([1,5,6,10,11,15,16,20,21,25,26,30].map(skillBookCost),[1,1,2,2,3,3,4,4,5,5,6,6]);
  assert.equal(Array.from({length:30},(_,i)=>skillBookCost(i+1)).reduce((a,b)=>a+b),105);
});
test('active and passive upgrades consume only matching books atomically; insufficient and max keep save intact',()=>{
  assert.equal(MAX_SKILL_LEVEL, 10, '스킬 최대 레벨 Lv.10');
  for(const id of ['spin','body']){
    // Lv.9 → 10은 2권(ceil(10/5)) — 1권으로는 부족하고, 2권이면 오르며 그 뒤로는 최대 레벨이다.
    const save=freshSave();if(id==='body')save.passives=['body'];else save.learned=['spin'];save.skillLevels[id]=9;
    save.bag=[book('b0',id),book('other','slam')];
    const before=JSON.stringify(save);assert(!useSkillBook(save,'b0').ok);assert.equal(JSON.stringify(save),before);assert(!skillBookStatus(save,id).ready);
    save.bag.push(book('second',id));assert(hasSkillUpgrade(save));assert(useSkillBook(save,'b0').ok);
    assert.equal(save.skillLevels[id],10);assert.deepEqual(save.bag.map(i=>i.id),['other']);
    const reloaded=parseSave(JSON.parse(JSON.stringify(save)));assert.equal(reloaded.skillLevels[id],10);
    save.bag=[book('max',id)];const max=JSON.stringify(save);assert(!useSkillBook(save,'max').ok);assert.equal(JSON.stringify(save),max);assert(!hasSkillUpgrade(save));
  }
});
test('existing level 8 survives parsing, upgrades to 9 using two copies, and learning costs one',()=>{
  const save=freshSave();save.learned=['spin'];save.skillLevels.spin=8;save.bag=[book('one'),book('two'),book('three')];
  const parsed=parseSave(JSON.parse(JSON.stringify(save)));assert.equal(parsed.skillLevels.spin,8);assert(useSkillBook(parsed,'two').ok);assert.equal(parsed.skillLevels.spin,9);assert.equal(parsed.bag.length,1);
  parsed.bag=[book('learn','slam')];assert(useSkillBook(parsed,'learn').ok);assert(parsed.learned.includes('slam'));assert.equal(parsed.skillLevels.slam,1);
});
