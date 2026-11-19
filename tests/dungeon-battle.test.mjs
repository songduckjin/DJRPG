import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {DungeonBattle}=await import('../src/ui/dungeonBattle.ts');
const {freshSave}=await import('../src/game/store.ts');
function run(battle,seconds){for(let i=0;i<Math.ceil(seconds/.05);i++)battle.advance(.05);}
test('first floor owns a deep copy and never writes loot or progression',()=>{const save=freshSave(),before=structuredClone(save),battle=new DungeonBattle(save);assert.notEqual(battle.world.save,save);assert.equal(battle.wave,1);assert.equal(battle.world.enemies.length,3);battle.world.kill(battle.world.enemies[0]);assert.equal(battle.world.slain,1);assert.equal(battle.world.drops.length,0);assert.deepEqual(save,before);});
test('10 second timeout adds next wave while surviving enemies remain',()=>{const battle=new DungeonBattle(freshSave());battle.world.update=()=>{};run(battle,10.1);assert.equal(battle.wave,2);assert.equal(battle.world.enemies.length,6);run(battle,10.1);assert.equal(battle.wave,3);assert.equal(battle.world.enemies.length,7);assert.equal(battle.elite.boss,false);assert(battle.elite.maxHp>battle.world.enemies[0].maxHp);});
test('clearing each wave early advances and ends only after elite dies',()=>{const battle=new DungeonBattle(freshSave());battle.world.update=()=>{};for(let i=0;i<3;i++){for(const enemy of battle.world.enemies)battle.world.kill(enemy);battle.world.enemies=[];battle.advance(.05);}assert.equal(battle.outcome,'clear');assert.equal(battle.world.slain,7);assert.equal(battle.finished,true);});
test('death stops instead of reviving; fresh retry starts full health and 90 seconds',()=>{const save=freshSave(),battle=new DungeonBattle(save);battle.world.update=()=>{};battle.world.player.hp=0;battle.advance(.05);assert.equal(battle.outcome,'dead');const time=battle.elapsed;battle.advance(.05);assert.equal(battle.elapsed,time);const retry=new DungeonBattle(save);assert(retry.world.player.hp>0);assert.equal(retry.elapsed,0);assert.equal(retry.wave,1);});
test('90 second timeout terminates with remaining enemies',()=>{const battle=new DungeonBattle(freshSave());battle.world.update=()=>{};run(battle,90.1);assert.equal(battle.outcome,'timeout');assert.equal(battle.elapsed,90);});
test('preview toughness scales with equipped attack so high gear cannot erase floor in one second',()=>{
 const save=freshSave();save.equipment.weapon={id:'preview-weapon',name:'preview',slot:'weapon',rarity:'legendary',stats:{attack:100000}};
 const before=structuredClone(save),battle=new DungeonBattle(save),base=new DungeonBattle(freshSave());
 assert(battle.world.enemies[0].maxHp>base.world.enemies[0].maxHp*100);
 run(battle,1);assert.equal(battle.finished,false);assert.equal(battle.wave,1);assert.deepEqual(save,before);
});

test('enemies spawn away, visibly approach, and hero does not chase into the next spawn',()=>{
 const battle=new DungeonBattle(freshSave()),enemy=battle.world.enemies[0],p=battle.world.player;
 const start=Math.hypot(enemy.x-p.x,enemy.y-p.y);assert(start>190);
 run(battle,2);assert.deepEqual([p.x,p.y],[50,50]);assert(enemy.moving);assert(Math.hypot(enemy.x-p.x,enemy.y-p.y)<start);assert.equal(battle.finished,false);assert.equal(battle.world.slain,0);
 for(const target of battle.world.enemies)battle.world.kill(target);battle.world.enemies=[];battle.advance(.05);
 assert.equal(battle.wave,2);assert(battle.world.enemies.every(e=>Math.hypot(e.x-p.x,e.y-p.y)>190));
});
test('second floor is a fresh preview encounter with full health and modestly higher toughness',()=>{
 const save=freshSave(),before=structuredClone(save),first=new DungeonBattle(save),second=new DungeonBattle(save,2);
 assert.equal(second.floor,2);assert.equal(second.world.save.floor,2);assert.equal(second.elapsed,0);assert.equal(second.wave,1);assert.equal(second.world.player.hp,first.world.player.hp);
 assert(second.world.enemies[0].maxHp>first.world.enemies[0].maxHp);assert(second.world.enemies[0].maxHp<first.world.enemies[0].maxHp*1.3);assert.deepEqual(save,before);
});
