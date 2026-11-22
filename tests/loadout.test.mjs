import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave, parseSave }=await import('../src/game/store.ts');
const { normalizeQuickSlots, availableSkills, equipSkill, unequipSkill }=await import('../src/game/loadout.ts');
const { World }=await import('../src/game/world.ts');
test('new save has three genuinely empty skill slots',()=>assert.deepEqual(freshSave().quickSlots,[null,null,null]));
test('legacy save retains learned equipped skills and clears unlearned placeholders',()=>{
  const save=freshSave();save.learned=['slash2','spin'];save.quickSlots=['slash2','spin','slam'];
  assert.deepEqual(parseSave(save).quickSlots,['slash2','spin',null]);
  save.quickSlots=['spin','slash2',null];assert.deepEqual(parseSave(save).quickSlots,['spin','slash2',null]);
});
test('duplicate or damaged loadouts normalize without losing valid learned placements',()=>{
  assert.deepEqual(normalizeQuickSlots(['spin','spin','unknown'],['spin']),['spin',null,null]);
  assert.deepEqual(normalizeQuickSlots(null,['spin']),[null,null,null]);
});
test('a newly learned active skill is available but is not silently auto equipped',()=>{
  // 파트 B: 스킬북이 폐지되어 습득 경로는 파트 A의 스킬 트리(SP 투자)다 — 여기서는 `learned`로 습득 상태를 만든다.
  const save=freshSave();save.learned=['slash2'];assert.deepEqual(availableSkills(save),['slash2']);assert.deepEqual(save.quickSlots,[null,null,null]);
  assert(equipSkill(save,'slash2',1).ok);assert.deepEqual(availableSkills(save),[]);assert.deepEqual(save.quickSlots,[null,'slash2',null]);
  assert.deepEqual(parseSave(JSON.parse(JSON.stringify(save))).quickSlots,[null,'slash2',null]);
});
test('a fourth skill replaces only the field circle chosen by the player',()=>{
  const save=freshSave();save.learned=['slash2','spin','slam','power'];save.quickSlots=['slash2','spin','slam'];
  assert.deepEqual(availableSkills(save),['power']);assert(equipSkill(save,'power',1).ok);assert.deepEqual(save.quickSlots,['slash2','power','slam']);assert.deepEqual(availableSkills(save),['spin']);
});
test('unlearned skills, invalid slots and duplicates never change equipment',()=>{
  const save=freshSave();save.learned=['spin'];const original=JSON.stringify(save);
  assert(!equipSkill(save,'slam',0).ok);assert(!equipSkill(save,'spin',3).ok);assert.equal(JSON.stringify(save),original);
  equipSkill(save,'spin',0);assert(!equipSkill(save,'spin',1).ok);assert.deepEqual(save.quickSlots,['spin',null,null]);
});
test('empty skill slots are safe for automatic combat and keyboard actions',()=>{
  const world=new World(freshSave());assert.doesNotThrow(()=>world.action(null));assert.doesNotThrow(()=>world.update(.016));
});
test('unequipping a skill clears only its quick slot and preserves learning, levels, and save recovery',()=>{
  const save=freshSave();save.learned=['slash2','spin'];save.quickSlots=['slash2','spin',null];save.skillLevels.spin=4;
  assert.deepEqual(unequipSkill(save,'spin'),{ok:true,message:'2번 스킬 원에서 해제했습니다.'});
  assert.deepEqual(save.quickSlots,['slash2',null,null]);assert.deepEqual(save.learned,['slash2','spin']);assert.equal(save.skillLevels.spin,4);
  assert.deepEqual(availableSkills(save),['spin']);
  const loaded=parseSave(JSON.parse(JSON.stringify(save)));assert.deepEqual(loaded.quickSlots,['slash2',null,null]);assert.equal(loaded.skillLevels.spin,4);
  assert(equipSkill(loaded,'spin',2).ok);assert.deepEqual(loaded.quickSlots,['slash2',null,'spin']);
});
test('unequipping an absent skill reports the reason without changing slots',()=>{
  const save=freshSave();save.learned=['spin'];const before=JSON.stringify(save);
  assert.deepEqual(unequipSkill(save,'spin'),{ok:false,message:'장착되지 않은 스킬입니다.'});assert.equal(JSON.stringify(save),before);
});
