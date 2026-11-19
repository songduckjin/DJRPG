import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './ts-loader.mjs';
const {DungeonBattle,DUNGEON_ITEM_DROP_CHANCE,DUNGEON_ENEMY_SPEED_SCALE,DUNGEON_SPAWN_STEPS,DUNGEON_LOOT_FAN,DUNGEON_ABSORB_DELAY,dungeonSpawnPull,dungeonLootSpots,dungeonLootTimeline,dungeonAbsorbProgress,dungeonAbsorbPoint}=await import('../src/ui/dungeonBattle.ts');
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
 const start=Math.hypot(enemy.x-p.x,enemy.y-p.y);assert(start>150);
 run(battle,2);assert.deepEqual([p.x,p.y],[50,50]);assert(enemy.moving);assert(Math.hypot(enemy.x-p.x,enemy.y-p.y)<start);assert.equal(battle.finished,false);assert.equal(battle.world.slain,0);
 for(const target of battle.world.enemies)battle.world.kill(target);battle.world.enemies=[];battle.advance(.05);
 assert.equal(battle.wave,2);assert(battle.world.enemies.every(e=>Math.hypot(e.x-p.x,e.y-p.y)>150));
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

test('each wave starts two of its own strides closer to the hero than the old corner',()=>{
 const battle=new DungeonBattle(freshSave()),p=battle.world.player,pull=dungeonSpawnPull(1,false);
 assert.equal(DUNGEON_SPAWN_STEPS,2);
 assert(Math.abs(pull-2*enemyMoveSpeed(1,false)*2/4.25)<1e-9);
 const corners=[[(-180-65)/2,(-180+65)/2],[-90,-90],[(-180+65)/2,(-180-65)/2]];
 battle.world.enemies.forEach((enemy,index)=>{
  const [cornerX,cornerY]=corners[index],legacy=Math.hypot(cornerX-p.x,cornerY-p.y),now=Math.hypot(enemy.x-p.x,enemy.y-p.y);
  assert(Math.abs(legacy-now-pull)<1e-9,`enemy ${index} travelled ${legacy-now} instead of ${pull}`);
  // Straight along its old approach line, still outside attack range.
  assert(Math.abs((enemy.x-p.x)/now-(cornerX-p.x)/legacy)<1e-9&&Math.abs((enemy.y-p.y)/now-(cornerY-p.y)/legacy)<1e-9);
  assert(now>150);
 });
});

test('drops keep the point they fell on unless the hero or another drop is there',()=>{
 const hero={x:200,y:400},keepX=40,keepY=88,gap=36;
 // Clear of the hero art: the death point itself is the resting spot.
 assert.deepEqual(dungeonLootSpots(hero.x,hero.y,[{x:hero.x+140,y:hero.y-60}],[],keepX,keepY,gap),[{x:hero.x+140,y:hero.y-60}]);
 // A drop on the hero is pulled straight out along its own line toward the kill, never shoved sideways.
 const near={x:hero.x+2,y:hero.y-20},above=dungeonLootSpots(hero.x,hero.y,[near],[],keepX,keepY,gap)[0];
 assert(Math.abs((above.x-hero.x)*(near.y-hero.y)-(above.y-hero.y)*(near.x-hero.x))<1e-6);
 assert(above.y<hero.y&&((above.x-hero.x)/keepX)**2+((above.y-hero.y)/keepY)**2>=1-1e-6);
 assert(Math.hypot(above.x-hero.x,above.y-hero.y)>Math.hypot(near.x-hero.x,near.y-hero.y));
 const side=dungeonLootSpots(hero.x,hero.y,[{x:hero.x+18,y:hero.y-6}],[],keepX,keepY,gap)[0];
 assert(side.x>=hero.x+keepX-1e-6);
 // A whole kill's worth of drops: inside the fan, off the hero, only as far apart as icons need.
 const taken=[],drops=Array.from({length:9},(_,i)=>({x:hero.x+(i%3-1)*6,y:hero.y-22-(i%2)*4}));
 const spots=dungeonLootSpots(hero.x,hero.y,drops,taken,keepX,keepY,gap);
 assert.equal(spots.length,9);assert.equal(taken.length,9);
 for(const spot of spots){
  const dx=spot.x-hero.x,dy=spot.y-hero.y;
  assert(Math.abs(Math.atan2(dx,-dy))<=DUNGEON_LOOT_FAN+1e-9,`outside fan ${dx},${dy}`);
  assert((dx/keepX)**2+(dy/keepY)**2>=1-1e-6,`over the hero ${dx},${dy}`);
  assert(Math.hypot(dx,dy)<260,`drifts from the kill ${Math.hypot(dx,dy)}`);
 }
 for(let i=0;i<taken.length;i++)for(let j=i+1;j<taken.length;j++)assert(Math.hypot(taken[i].x-taken[j].x,taken[i].y-taken[j].y)>=gap-1e-6,`overlap ${i},${j}`);
});

test('gold piles up where the mob fell while only items keep their pitch',()=>{
 const hero={x:200,y:400},keepX=40,keepY=88,gap=36,taken=[];
 const kill={x:hero.x+70,y:hero.y-46};
 // Three coins of one kill stay on the death point: no 36px fan, only a few pixels apart.
 const coins=dungeonLootSpots(hero.x,hero.y,Array.from({length:3},()=>({...kill,gold:true})),taken,keepX,keepY,gap);
 for(const coin of coins)assert(Math.hypot(coin.x-kill.x,coin.y-kill.y)<=12,`coin scattered ${Math.hypot(coin.x-kill.x,coin.y-kill.y)}`);
 for(let i=0;i<coins.length;i++)for(let j=i+1;j<coins.length;j++)assert(Math.hypot(coins[i].x-coins[j].x,coins[i].y-coins[j].y)>1,`coins ${i},${j} merged`);
 // A coin on top of a heap of coins is a coin: it is never pushed aside to make room for an item,
 // and an item is never pushed by a coin either — the item simply lands over the coin.
 const overCoin=dungeonLootSpots(hero.x,hero.y,[{...kill,gold:true},{...kill}],taken,keepX,keepY,gap);
 assert(Math.hypot(overCoin[0].x-kill.x,overCoin[0].y-kill.y)<=12);
 assert.deepEqual(overCoin[1],kill);
 // Two items still keep the icon pitch between them, and the item list is what decides it.
 const both=dungeonLootSpots(hero.x,hero.y,[{...kill},{...kill}],[],keepX,keepY,gap);
 assert(Math.hypot(both[0].x-both[1].x,both[0].y-both[1].y)>=gap-1e-6);
 // A whole floor of kills piled around the hero: every coin stays at its own kill point instead
 // of walking outward a full icon pitch per extra drop.
 const spots=dungeonLootSpots(hero.x,hero.y,Array.from({length:7},(_,i)=>({x:hero.x+38+(i%3)*4,y:hero.y-40-(i%2)*3,gold:true})),[],keepX,keepY,gap);
 const kills=Array.from({length:7},(_,i)=>({x:hero.x+38+(i%3)*4,y:hero.y-40-(i%2)*3}));
 spots.forEach((spot,index)=>assert(Math.hypot(spot.x-kills[index].x,spot.y-kills[index].y)<=16,`coin ${index} drifted ${Math.hypot(spot.x-kills[index].x,spot.y-kills[index].y)}`));
});

test('a coin inside the hero art is pulled clear without breaking up its heap',()=>{
 const hero={x:200,y:400},keepX=40,keepY=88,gap=36,near={x:hero.x+2,y:hero.y-20};
 const pair=dungeonLootSpots(hero.x,hero.y,[{...near,gold:true},{...near,gold:true}],[],keepX,keepY,gap);
 for(const coin of pair){
  const dx=coin.x-hero.x,dy=coin.y-hero.y;
  assert((dx/keepX)**2+(dy/keepY)**2>=1-1e-6,`coin still over the hero ${dx},${dy}`);
  assert(Math.abs(Math.atan2(dx,-dy))<=DUNGEON_LOOT_FAN+1e-9,`coin left the fan ${dx},${dy}`);
  assert(Math.hypot(dx,dy)<=keepY+12,`coin flew away ${Math.hypot(dx,dy)}`);
 }
 assert(Math.hypot(pair[0].x-pair[1].x,pair[0].y-pair[1].y)>1,'two coins share one pixel');
});

test('an item is painted above a coin that shares its spot, in either loot layer',()=>{
 const css=readFileSync(new URL('../src/styles/dungeon.css',import.meta.url),'utf8');
 const layer=css.match(/\.dungeon-loot\.is-gold\{z-index:(\d+)\}/),item=css.match(/\.dungeon-loot\.is-item\{z-index:(\d+)\}/);
 assert(layer&&item,'gold and item stacking rules are missing');
 // The rule sits on `.dungeon-loot` itself, and both loot layers use the same two classes.
 assert.equal((css.match(/\.dungeon-loot-layer\.is-behind\{z-index:\d+\}/)||[]).length,1);
 assert(Number(item[1])>Number(layer[1]),`item ${item[1]} is not above gold ${layer[1]}`);
});

test('every clear absorbs the ground loot before any result can show',()=>{
 for(const count of [0,1,2,7,14]){
  const timeline=dungeonLootTimeline('clear',count);
  assert.equal(timeline.absorbAt,DUNGEON_ABSORB_DELAY);
  assert(timeline.absorbEnd>timeline.absorbAt);
  assert(timeline.resultAt>=timeline.absorbEnd,`result ${count} before the last drop is in`);
  for(let index=0;index<count;index++){
   // Nothing moves before its turn, and each drop is fully inside the hero once the flight ends.
   assert.equal(dungeonAbsorbProgress(DUNGEON_ABSORB_DELAY+index*.045-1e-6,index),0);
   assert(dungeonAbsorbProgress(timeline.absorbEnd,index)>=1-1e-9);
   assert.equal(dungeonAbsorbProgress(timeline.resultAt,index),1);
  }
  // Halfway through its flight a drop really sits between the ground and the hero.
  const half=dungeonAbsorbProgress(DUNGEON_ABSORB_DELAY+.55*.5,0);
  assert(half>0&&half<1);
 }
 // Failing or timing out keeps the old quick result and never absorbs.
 assert.equal(dungeonLootTimeline('dead',5).resultAt,.75);
 assert.equal(dungeonLootTimeline('timeout',5).resultAt,.75);
});

test('a clear really moves every drop into the hero, frame by frame, before the result',()=>{
 const timeline=dungeonLootTimeline('clear',5),to={x:195,y:465-26};
 const ground=[{x:166,y:402},{x:151,y:369},{x:195,y:376},{x:224,y:402},{x:239,y:369}];
 const at=(time,index)=>dungeonAbsorbPoint(ground[index],to,dungeonAbsorbProgress(time,index),index);
 // Held on the ground: a 60fps replay moves nothing before the beat is over.
 for(let frame=0;frame<Math.round(timeline.absorbAt*60);frame++)for(const [index,spot] of ground.entries())
  assert.deepEqual(at(frame/60,index),spot,`frame ${frame} drop ${index} moved early`);
 // In flight: each drop closes on the hero and is inside it once its own flight ends.
 ground.forEach((spot,index)=>{
  const distance=time=>Math.hypot(at(time,index).x-to.x,at(time,index).y-to.y),start=DUNGEON_ABSORB_DELAY+index*.045,end=start+.55;
  assert(distance(start)>distance(start+.55/2)&&distance(start+.55/2)>distance(end-.001),`drop ${index} did not travel`);
  assert(distance(end)<1e-9,`drop ${index} never reached the hero`);
 });
 // The result frame comes after the last drop is gone.
 assert(timeline.resultAt>DUNGEON_ABSORB_DELAY+4*.045+.55);
});

test('the clear record totals the gold the floor left on the ground',()=>{
 const battle=new DungeonBattle(freshSave());
 withRandom([.9],()=>{for(const enemy of [...battle.world.enemies])battle.world.kill(enemy);});
 assert.equal(battle.world.loot.filter(entry=>entry.kind==='gold').length,3);
 assert.equal(battle.world.lootGold,3*(3+battle.floor));
 const boss=new DungeonBattle(freshSave(),5);
 withRandom([.9],()=>boss.world.kill(boss.world.enemies[0]));
 assert.equal(boss.world.lootGold,70*5);
});
