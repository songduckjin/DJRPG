import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {DungeonBattle,DUNGEON_ITEM_DROP_CHANCE,DUNGEON_ENEMY_SPEED_SCALE,dungeonLootLanding}=await import('../src/ui/dungeonBattle.ts');
const {World,enemyMoveSpeed}=await import('../src/game/world.ts');
const {freshSave}=await import('../src/game/store.ts');
function run(battle,seconds){for(let i=0;i<Math.ceil(seconds/.05);i++)battle.advance(.05);}
// Fixed random stream so the drop gate and the equipment/skillbook split are deterministic.
function withRandom(values,work){const original=Math.random;let index=0;Math.random=()=>values[Math.min(index++,values.length-1)]??0;try{return work();}finally{Math.random=original;}}
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
test('ten-floor preview uses solo bosses at 5/10 and stops its floor index at ten',()=>{
 for(let floor=1;floor<=10;floor++){
 const battle=new DungeonBattle(freshSave(),floor);assert.equal(battle.floor,floor);assert.equal(battle.bossFloor,floor%5===0);assert.equal(battle.world.enemies.length,battle.bossFloor?1:3);assert.equal(battle.targetCount,battle.bossFloor?1:7);
 if(battle.bossFloor){assert(battle.world.enemies[0].boss);battle.world.update=()=>{};battle.world.enemies=[];battle.advance(.05);assert.equal(battle.outcome,'clear');}
 }
 assert.equal(new DungeonBattle(freshSave(),11).floor,10);
});

test('every kill leaves field-matched gold and gates the item drop at the test 50 percent',()=>{
 assert.equal(DUNGEON_ITEM_DROP_CHANCE,.5);
 const battle=new DungeonBattle(freshSave());
 withRandom([.9],()=>battle.world.kill(battle.world.enemies[0]));
 assert.deepEqual(battle.world.loot.map(entry=>entry.kind),['gold']);
 assert.equal(battle.world.loot[0].gold,3+battle.floor);
 assert.equal(battle.world.drops.length,0);
});

test('which item falls follows the field equipment and skillbook odds',()=>{
 // Floor 1 normal: equipment .0025 vs skillbook .001, so the split sits at 5/7 (≈.714).
 const drop=(ratio)=>{const battle=new DungeonBattle(freshSave());withRandom([0,ratio],()=>battle.world.kill(battle.world.enemies[0]));return battle.world.loot.find(entry=>entry.kind==='item').item;};
 const equipment=drop(.70),book=drop(.72);
 assert.equal(equipment.kind,undefined);
 assert.equal(equipment.slot==='skillbook',false);
 assert.equal(book.kind,'skillbook');
 assert.equal(book.rarity,'rare');
 assert(book.name.startsWith('[스킬북]'));
 assert.equal(book.skillId.length>0,true);
});

test('preview loot never enters the ground renderer or the account save',()=>{
 const save=freshSave(),before=structuredClone(save),battle=new DungeonBattle(save,3);
 withRandom([.1,.2],()=>{for(const enemy of [...battle.world.enemies])battle.world.kill(enemy);});
 assert.equal(battle.world.loot.filter(entry=>entry.kind==='gold').length,3);
 assert(battle.world.loot.some(entry=>entry.kind==='item'));
 assert.equal(battle.world.drops.length,0);
 assert.deepEqual(save,before);
});

test('dungeon mobs close ground 1.5x the shared field pace',()=>{
 // Same enemy, same dt: only travel distance may differ, so attacks/skills are stubbed out.
 const travel=(world)=>{const p=world.player,enemy={x:p.x+50,y:p.y,hp:1e9,maxHp:1e9,boss:false,hit:0,step:0,moving:false,knockX:0,knockY:0,slow:0};
  world.enemies=[enemy];world.action=()=>{};world.spawnTimer=Infinity;
  const before=Math.hypot(enemy.x-p.x,enemy.y-p.y);
  for(let i=0;i<6;i++)world.update(.05);
  return before-Math.hypot(enemy.x-p.x,enemy.y-p.y);};
 assert.equal(DUNGEON_ENEMY_SPEED_SCALE,1.5);
 const fieldTravel=travel(new World(freshSave())),dungeonTravel=travel(new DungeonBattle(freshSave()).world);
 assert(Math.abs(fieldTravel-enemyMoveSpeed(1,false)*.3)<1e-9);
 assert(Math.abs(dungeonTravel-fieldTravel*DUNGEON_ENEMY_SPEED_SCALE)<1e-9);
});

test('drops land outside the hero ring and never over the character',()=>{
 const hero={x:200,y:340};
 for(const ring of [58,70,92])for(const bias of [-.44,0,.44])for(let dx=-40;dx<=40;dx+=10)for(let dy=-40;dy<=40;dy+=10){
  const spot=dungeonLootLanding(hero.x,hero.y,hero.x+dx,hero.y+dy,ring,bias),rx=spot.x-hero.x,ry=spot.y-hero.y;
  assert(Math.hypot(rx,ry)>=ring-1e-6,`ring ${ring} bias ${bias} at ${dx},${dy}`);
  // Beside the body, or below the feet: never sitting across the hero art.
  assert(Math.abs(rx)>=ring*.5||ry>=ring*.3,`cover ${ring} bias ${bias} at ${dx},${dy}`);
  assert(ry>=-ring*.65,`head ${ring} bias ${bias} at ${dx},${dy}`);
 }
 // A drop that already fell clear of the ring stays where it fell.
 assert.deepEqual(dungeonLootLanding(hero.x,hero.y,hero.x+150,hero.y-40,70,0),{x:hero.x+150,y:hero.y-40});
});
