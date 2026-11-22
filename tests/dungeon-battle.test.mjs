import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import './ts-loader.mjs';
const {DungeonBattle,DUNGEON_STEP,dungeonDropChance,DUNGEON_DROP_CHANCE_BASE,DUNGEON_DROP_CHANCE_MAX,DUNGEON_DROP_CHANCE_STEP,DUNGEON_MOB_HP,DUNGEON_BOSS_HP_SCALE,DUNGEON_ELITE_HP_SCALE,dungeonMobHp,DUNGEON_ENEMY_SPEED_SCALE,DUNGEON_SPAWN_STEPS,DUNGEON_LOOT_FAN,DUNGEON_ABSORB_DELAY,dungeonSpawnPull,dungeonLootSpots,dungeonLootTimeline,dungeonAbsorbProgress,dungeonAbsorbPoint}=await import('../src/ui/dungeonBattle.ts');
const {clampArenaPoint,projectArenaPoint}=await import('../src/game/arena.ts');
const {World,enemyMoveSpeed,ENEMY_STOP_RANGE,ENEMY_ATTACK_RANGE}=await import('../src/game/world.ts');
const bossLoot=await import('../src/game/bossLoot.ts');
const goldPile=await import('../src/game/render/goldPile.ts');
const {freshSave}=await import('../src/game/store.ts');
function run(battle,seconds){for(let i=0;i<Math.ceil(seconds/.05);i++)battle.advance(.05);}
// Fixed random stream so the drop gate and the equipment/skillbook split are deterministic.
function withRandom(values,work){const original=Math.random;let index=0;Math.random=()=>values[Math.min(index++,values.length-1)]??0;try{return work();}finally{Math.random=original;}}
test('first floor owns a deep copy and never writes loot or progression',()=>{const save=freshSave(),before=structuredClone(save),battle=new DungeonBattle(save);assert.notEqual(battle.world.save,save);assert.equal(battle.wave,1);assert.equal(battle.world.enemies.length,3);battle.world.kill(battle.world.enemies[0]);assert.equal(battle.world.slain,1);assert.equal(battle.world.drops.length,0);assert.deepEqual(save,before);});
test('10 second timeout adds next wave while surviving enemies remain',()=>{const battle=new DungeonBattle(freshSave());battle.world.update=()=>{};run(battle,10.1);assert.equal(battle.wave,2);assert.equal(battle.world.enemies.length,6);run(battle,10.1);assert.equal(battle.wave,3);assert.equal(battle.world.enemies.length,7);assert.equal(battle.elite.boss,false);assert(battle.elite.maxHp>battle.world.enemies[0].maxHp);});
test('clearing each wave early advances and ends only after elite dies',()=>{const battle=new DungeonBattle(freshSave());battle.world.update=()=>{};for(let i=0;i<3;i++){for(const enemy of battle.world.enemies)battle.world.kill(enemy);battle.world.enemies=[];battle.advance(.05);}assert.equal(battle.outcome,'clear');assert.equal(battle.world.slain,7);assert.equal(battle.finished,true);});
test('death stops instead of reviving; fresh retry starts full health and 90 seconds',()=>{const save=freshSave(),battle=new DungeonBattle(save);battle.world.update=()=>{};battle.world.player.hp=0;battle.advance(.05);assert.equal(battle.outcome,'dead');const time=battle.elapsed;battle.advance(.05);assert.equal(battle.elapsed,time);const retry=new DungeonBattle(save);assert(retry.world.player.hp>0);assert.equal(retry.elapsed,0);assert.equal(retry.wave,1);});
test('90 second timeout terminates with remaining enemies',()=>{const battle=new DungeonBattle(freshSave());battle.world.update=()=>{};run(battle,90.1);assert.equal(battle.outcome,'timeout');assert.equal(battle.elapsed,90);});
test('every floor has a fixed toughness that gear cannot change',()=>{
 // 층별 고정 난이도 (작업 205): 예전 `dungeonPreviewHp`는 내 DPS에 4배를 곱해 장비가 세면 몹도 같이
 // 세졌다. 실제 보상을 주는 지금은 그 층의 값이 그대로여야 한다 — 장비를 바꿔도 체력이 같다.
 const plain=freshSave(),geared=structuredClone(plain);
 geared.equipment.weapon={id:'geared',name:'두손검',slot:'weapon',rarity:'legendary',stats:{attack:100000}};
 const before=structuredClone(geared);
 for(let floor=1;floor<=10;floor++){
  const base=new DungeonBattle(plain,floor),full=new DungeonBattle(geared,floor);
  assert.equal(base.world.enemies[0].maxHp,full.world.enemies[0].maxHp,`floor ${floor} moved with gear`);
  assert.equal(base.world.enemies[0].maxHp,dungeonMobHp(floor)*(base.bossFloor?DUNGEON_BOSS_HP_SCALE:1));
 }
 assert.deepEqual(geared,before);
 assert.equal(DUNGEON_MOB_HP.length,10);
 for(let index=1;index<DUNGEON_MOB_HP.length;index++)
  assert(DUNGEON_MOB_HP[index]>DUNGEON_MOB_HP[index-1],`floor ${index+1} is not harder than ${index}`);
 assert.equal(DUNGEON_ELITE_HP_SCALE,2);
 assert.equal(dungeonMobHp(0),DUNGEON_MOB_HP[0]);
 assert.equal(dungeonMobHp(99),DUNGEON_MOB_HP[9]);
});

test('floor 1 is a beginner floor and the 10th boss needs a deep-farming kit inside 90 seconds',()=>{
 // 평타 DPS(스킬 없음, 치명 무시) = 공격력 × 1.6 / 0.48. 일반 층은 6마리 + 정예 1마리(2배) = 8배.
 const dps=attack=>attack*1.6/.48;
 const floorHp=floor=>floor%5===0?dungeonMobHp(floor)*DUNGEON_BOSS_HP_SCALE:8*dungeonMobHp(floor);
 // Lv.5~10·저층 장비(공격 40 안팎)도 1층을 90초 안에 넉넉히 깬다.
 assert(dps(40)>0);
 assert(floorHp(1)/dps(40)<25,`floor 1 takes ${(floorHp(1)/dps(40)).toFixed(1)}s for a beginner`);
 // 15~20층을 파밍한 장비(공격 320·치명 24%·공속 20%)는 10층 보스를 90초 안에 끝낸다.
 const deep=dps(320)*(1+20/100)*(1+24/100);
 assert(floorHp(10)/deep<90,`floor 10 boss takes ${(floorHp(10)/deep).toFixed(1)}s with deep gear`);
 // 그 절반짜리 장비로는 90초를 넘긴다 — 10층은 '고스펙'의 층이다.
 assert(floorHp(10)/dps(120)>90,`floor 10 boss falls to a 120 attack kit in ${(floorHp(10)/dps(120)).toFixed(1)}s`);
 // 5·10층 보스는 같은 층 일반 몹보다 훨씬 묵직하다(필드 보스의 6배보다도 무겁다).
 for(const floor of [5,10])assert(dungeonMobHp(floor)*DUNGEON_BOSS_HP_SCALE>dungeonMobHp(floor)*6);
});

test('enemies spawn away, visibly approach, and the hero walks out to meet them',()=>{
 // 작업 248 — 던전은 `DungeonWorld.update`가 매 프레임 히어로를 (50,50)으로 되돌리고 `activeMove`를 0으로
 // 지워, 적이 다가오길 서서 기다리는 것처럼 보였다. 이제 필드처럼 가까운 적을 향해 `stopRange`까지 걷는다.
 const battle=new DungeonBattle(freshSave()),enemy=battle.world.enemies[0],p=battle.world.player;
 const start=Math.hypot(enemy.x-p.x,enemy.y-p.y);assert(start>150);
 const origin={x:p.x,y:p.y};
 run(battle,.5);
 assert(enemy.moving);assert.equal(battle.finished,false);assert.equal(battle.world.slain,0);
 // ① 자리를 지키지 않고 걸어 나간다(예전에는 0이었다 — 고정 위치로 되돌리느라 걸음이 지워졌다).
 const walked=Math.hypot(p.x-origin.x,p.y-origin.y);
 assert(walked>20,`the hero stood still at ${p.x},${p.y}`);
 // ② 적의 걸음만으로 줄어들 거리보다 더 좁힌다 — 히어로가 실제로 다가간 몫이 있다.
 const gap=Math.hypot(enemy.x-p.x,enemy.y-p.y),enemyWalk=enemyMoveSpeed(1,false)*DUNGEON_ENEMY_SPEED_SCALE*.5;
 assert(gap<start-enemyWalk-5,`the hero added no ground: ${start.toFixed(1)} -> ${gap.toFixed(1)}`);
 // ③ 방향도 가까운 적 쪽이다(화면 X는 `dx-dy`, 걸음은 등각 방향).
 const first=battle.world.nearest();
 assert(first&&(p.x-origin.x)*(first.x-origin.x)+(p.y-origin.y)*(first.y-origin.y)>0,'the hero walked away from the wave');
 // ④ 다음 웨이브는 히어로가 서 있는 자리에서 떨어진 곳에 뜬다(코앞에 튀어나오지 않는다).
 for(const target of [...battle.world.enemies])battle.world.kill(target);battle.world.enemies=[];battle.advance(.05);
 assert.equal(battle.wave,2);
 const closest=Math.min(...battle.world.enemies.map(e=>Math.hypot(e.x-p.x,e.y-p.y)));
 assert(closest>60,`the next wave appeared ${closest.toFixed(1)} from the hero`);
});

test('the dungeon no longer leashes the hero: a wave that appears far away is still pursued',()=>{
 // 예전 `nearest()`는 110 밖의 적을 없는 것으로 봐서, 150 넘게 뜨는 웨이브를 향해 걷지 않았다.
 const battle=new DungeonBattle(freshSave()),p=battle.world.player,enemy=battle.world.nearest();
 assert(enemy,'the dungeon cannot see its own wave');
 const distance=Math.hypot(enemy.x-p.x,enemy.y-p.y);
 assert(distance>110,`the wave already starts inside the old 110 leash (${distance.toFixed(1)})`);
 const origin={x:p.x,y:p.y};
 run(battle,.3);
 assert(Math.hypot(p.x-origin.x,p.y-origin.y)>15,'the far wave is not worth a single step');
});

test('the hero fights from the room floor: inside the arena and never up at the exit door',()=>{
 // 390×700·360×640 휴대폰에서 철문 문턱은 화면의 38%(dungeon.css `top:10%` + `height:28%`)다.
 // 히어로가 그 위로 걸어 올라가 문을 뚫고 나가면 안 된다 — 아레나 경계와 문 아래 바닥을 함께 본다.
 for(const floor of [1,4,5,10]){
  // 10~20층을 파밍한 장비로 그 층을 실제로 끝까지 싸운다 — 문 쪽으로 가장 멀리 걸어간 순간까지 본다.
  const save=freshSave();save.level=30;
  save.equipment.weapon={id:'probe',name:'두손검',slot:'weapon',rarity:'legendary',stats:{attack:400}};
  const battle=new DungeonBattle(save,floor,97531),p=battle.world.player;
  for(let step=0;step<1800&&!battle.finished;step++){
   battle.advance(DUNGEON_STEP);
   const bounded=clampArenaPoint(p.x,p.y);
   assert(Math.abs(bounded.x-p.x)<1e-9&&Math.abs(bounded.y-p.y)<1e-9,`floor ${floor}: the hero left the arena at ${p.x},${p.y}`);
   for(const [width,height] of [[390,700],[360,640]]){
    const [,screenY]=projectArenaPoint(p.x,p.y,width,height),sill=height*.38;
    assert(screenY>sill+40,`floor ${floor}: the hero stands ${(sill-screenY).toFixed(0)}px above the ${width}×${height} door sill`);
   }
  }
 }
});
test('second floor is a fresh encounter with full health and a harder, fixed mob',()=>{
 const save=freshSave(),before=structuredClone(save),first=new DungeonBattle(save),second=new DungeonBattle(save,2);
 assert.equal(second.floor,2);assert.equal(second.world.save.floor,2);assert.equal(second.elapsed,0);assert.equal(second.wave,1);assert.equal(second.world.player.hp,first.world.player.hp);
 assert(second.world.enemies[0].maxHp>first.world.enemies[0].maxHp);
 // 고정 곡선이라 2층 체력은 필드 4층 곡선 그대로다(작업 205).
 assert.equal(second.world.enemies[0].maxHp,DUNGEON_MOB_HP[1]);
 assert.deepEqual(save,before);
});
test('ten-floor preview uses solo bosses at 5/10 and stops its floor index at ten',()=>{
 for(let floor=1;floor<=10;floor++){
 const battle=new DungeonBattle(freshSave(),floor);assert.equal(battle.floor,floor);assert.equal(battle.bossFloor,floor%5===0);assert.equal(battle.world.enemies.length,battle.bossFloor?1:3);assert.equal(battle.targetCount,battle.bossFloor?1:7);
 if(battle.bossFloor){assert(battle.world.enemies[0].boss);battle.world.update=()=>{};battle.world.enemies=[];battle.advance(.05);assert.equal(battle.outcome,'clear');}
 }
 assert.equal(new DungeonBattle(freshSave(),11).floor,10);
});

test('a dungeon mob drops an item on a flat five percent rate on every floor (작업 248)',()=>{
 // 사용자 확정(11-21): 모든 층 5% 고정 — 깊어져도 드롭률은 그대로, 등급만 10층 구간 표가 올린다.
 assert.equal(DUNGEON_DROP_CHANCE_BASE,.05);
 assert.equal(DUNGEON_DROP_CHANCE_STEP,0);
 assert.equal(DUNGEON_DROP_CHANCE_MAX,.05);
 for(let floor=1;floor<=10;floor++)assert.equal(dungeonDropChance(floor),.05);
 // 10층 밖의 층은 10층으로 잘라 쓴다(던전 상한).
 assert.equal(dungeonDropChance(20),.05);
 const battle=new DungeonBattle(freshSave());
 withRandom([.9],()=>battle.world.kill(battle.world.enemies[0]));
 assert.deepEqual(battle.world.loot.map(entry=>entry.kind),['gold']);
 assert.equal(battle.world.loot[0].gold,3+battle.floor);
 assert.equal(battle.world.drops.length,0);
 // 게이트를 넘으면 필드의 장비:스킬북 비율로 하나가 떨어진다.
 const lucky=new DungeonBattle(freshSave());
 withRandom([.01,.99],()=>lucky.world.kill(lucky.world.enemies[0]));
 assert.deepEqual(lucky.world.loot.map(entry=>entry.kind),['gold','item']);
 // 보스 층은 2개 확정 랜덤템 + 금화 10무더기다(작업 248).
 const boss=new DungeonBattle(freshSave(),5);
 withRandom([.9],()=>boss.world.kill(boss.world.enemies[0]));
 assert.equal(boss.world.loot.filter(entry=>entry.kind==='item').length,2);
 assert.equal(boss.world.loot.filter(entry=>entry.kind==='gold').length,10);
});

test('only a clear hands over the floor loot — a defeat or a timeout pays nothing',()=>{
 const clear=new DungeonBattle(freshSave());
 assert.equal(clear.clearRewards(),undefined,'a running floor already pays out');
 clear.world.update=()=>{};
 withRandom([.9],()=>{for(let i=0;i<3;i++){for(const enemy of clear.world.enemies)clear.world.kill(enemy);clear.world.enemies=[];clear.advance(.05);}});
 assert.equal(clear.outcome,'clear');
 const rewards=clear.clearRewards();
 assert.equal(rewards.gold,7*(3+clear.floor));
 assert.equal(rewards.gold,clear.world.lootGold);
 assert.deepEqual(rewards.items,[]);
 const dead=new DungeonBattle(freshSave());dead.world.update=()=>{};dead.world.player.hp=0;dead.advance(.05);
 assert.equal(dead.outcome,'dead');assert.equal(dead.clearRewards(),undefined);
 const timeout=new DungeonBattle(freshSave());timeout.world.update=()=>{};
 for(let i=0;i<Math.ceil(90.1/.05);i++)timeout.advance(.05);
 assert.equal(timeout.outcome,'timeout');assert.equal(timeout.clearRewards(),undefined);
});

test('which item falls follows the dungeon drop gate and the rare stat book roll (파트 B)',()=>{
 // 파트 B: 스킬북이 폐지되어 던전 일반 몹은 장비 1개(던전 5% 게이트)와, 개극악 확률의 영구 스탯북을 따로 굴린다.
 const drop=(ratio)=>{const battle=new DungeonBattle(freshSave());withRandom([0,ratio],()=>battle.world.kill(battle.world.enemies[0]));return battle.world.loot.filter(entry=>entry.kind==='item');};
 // 난수 0이면 게이트를 넘고 스탯북 확률도 당첨된다 — 장비 1개 + 스탯북 1개.
 const both=drop(0);
 assert.equal(both.length,2);
 const equipment=both.find(entry=>entry.item.kind!=='statbook'),book=both.find(entry=>entry.item.kind==='statbook');
 assert(equipment,'장비가 떨어진다');
 assert.equal(book.item.kind,'statbook');
 assert(['attack','defense','health'].includes(book.item.book));
 assert.equal(book.item.name,{attack:'공격의 서',defense:'방어의 서',health:'체력의 서'}[book.item.book]);
 // 스탯북 확률을 비껴가는 난수(.5)면 장비 한 개만 떨어진다.
 const gearOnly=drop(.5);
 assert.equal(gearOnly.length,1);
 assert.equal(gearOnly[0].item.kind,undefined);
});

test('preview loot never enters the ground renderer or the account save',()=>{
 const save=freshSave(),before=structuredClone(save),battle=new DungeonBattle(save,3);
 withRandom([.001,.2],()=>{for(const enemy of [...battle.world.enemies])battle.world.kill(enemy);});
 assert.equal(battle.world.loot.filter(entry=>entry.kind==='gold').length,3);
 assert(battle.world.loot.some(entry=>entry.kind==='item'));
 assert.equal(battle.world.drops.length,0);
 assert.deepEqual(save,before);
});

test('dungeon mobs close ground 1.5x the shared field pace',()=>{
 // Same enemy, same dt: only travel distance may differ, so attacks/skills are stubbed out.
 // 적은 정지 거리(60)보다 멀리서 시작해야 걷기를 재을 수 있고, 던전 아레나(120/180) 안에 있어야 한다(작업 254).
 const travel=(world)=>{const p=world.player,enemy={x:p.x+70,y:p.y-40,hp:1e9,maxHp:1e9,boss:false,hit:0,step:0,moving:false,knockX:0,knockY:0,slow:0};
  world.enemies=[enemy];world.action=()=>{};world.spawnTimer=Infinity;
  const x0=enemy.x,y0=enemy.y;
  for(let i=0;i<6;i++)world.update(.05);
  // 히어로도 걸어오므로 거리 감소가 아니라 **적이 실제로 옮긴 자리**로 잰다.
  return Math.hypot(enemy.x-x0,enemy.y-y0);};
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

test('a drop rests on the floor below the exit door instead of climbing up the room',()=>{
 // 390x700 phone: the door sill sits at 38% of the field and a drop's art hangs 38px over its spot.
 const hero={x:195,y:393},keepX=40,keepY=73.5,gap=36,sill=.38*700,top=sill+38+6,high={x:hero.x+34,y:hero.y-210};
 // Without a floor limit the drop still keeps the point it fell on (the old contract).
 const unchanged=dungeonLootSpots(hero.x,hero.y,[high],[],keepX,keepY,gap)[0];
 assert(Math.hypot(unchanged.x-high.x,unchanged.y-high.y)<1e-9,`unlimited drop moved to ${unchanged.x},${unchanged.y}`);
 const [spot]=dungeonLootSpots(hero.x,hero.y,[high],[],keepX,keepY,gap,{top});
 assert(spot.y>=top-1e-9,`drop rests at ${spot.y}, above the floor top ${top}`);
 assert(spot.y-38>=sill,`drop art tops out at ${spot.y-38}, over the door sill ${sill}`);
 assert(spot.y>high.y,'drop did not come down from the door');
 // It comes back along its own line from the hero, so it reads as the same drop, nearer.
 assert(Math.abs((spot.x-hero.x)*(high.y-hero.y)-(spot.y-hero.y)*(high.x-hero.x))<1e-6,'drop left its own line');
 assert(Math.hypot(spot.x-hero.x,spot.y-hero.y)<Math.hypot(high.x-hero.x,high.y-hero.y));
});

test('a floor of drops stays under the door, off the hero and an icon apart',()=>{
 const hero={x:195,y:393},keepX=40,keepY=73.5,gap=36,top=310,reach=139,taken=[],spots=[];
 // Fourteen drops from kills above the hero: the limit has to hold for the whole pile, not one drop.
 for(let i=0;i<14;i++){
  const drop={x:hero.x+(i%3-1)*6,y:hero.y-40-(i%2)*6,gold:i%2===0};
  const [spot]=dungeonLootSpots(hero.x,hero.y,[drop],taken,keepX,keepY,gap,{top,reach});
  taken.push({...spot,gold:drop.gold});spots.push({...spot,gold:drop.gold});
 }
 for(const spot of spots){
  const dx=spot.x-hero.x,dy=spot.y-hero.y;
  assert(spot.y>=top-1e-9,`drop rests above the floor top: ${spot.y}`);
  assert((dx/keepX)**2+(dy/keepY)**2>=1-1e-6,`drop lies on the hero ${dx},${dy}`);
  assert(Math.hypot(dx,dy)<=reach+1e-6,`drop sits past the reach ${Math.hypot(dx,dy)}`);
 }
 // Items still keep the icon pitch, and a heap still stays bunched below the limit.
 const items=spots.filter(spot=>!spot.gold),coins=spots.filter(spot=>spot.gold);
 for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)
  assert(Math.hypot(items[i].x-items[j].x,items[i].y-items[j].y)>=gap-1e-6,`items ${i},${j} overlap`);
 for(const coin of coins)assert(coin.y>=top-1e-9&&Math.hypot(coin.x-hero.x,coin.y-hero.y)<=reach+1e-6);
});

test('every ground drop is painted above the exit door, in either loot layer',()=>{
 const css=readFileSync(new URL('../src/styles/dungeon.css',import.meta.url),'utf8');
 const z=pattern=>{const match=css.match(pattern);return match?Number(match[1]):NaN;};
 const gate=z(/\.dungeon-exit-gate\{[^}]*z-index:(-?\d+)/),behind=z(/\.dungeon-loot-layer\.is-behind\{z-index:(-?\d+)/),
  canvas=z(/\.dungeon-field-canvas\{[^}]*z-index:(-?\d+)/),front=z(/\.dungeon-loot-layer\{[^}]*z-index:(-?\d+)/),
  hud=z(/\.dungeon-battle-hud\{[^}]*z-index:(-?\d+)/),result=z(/\.dungeon-battle-result\{[^}]*z-index:(-?\d+)/);
 for(const [name,value] of Object.entries({gate,behind,canvas,front,hud,result}))assert(Number.isFinite(value),`${name} stacking rule is missing`);
 // The door is a backdrop: no coin, weapon or skill book is ever hidden behind it.
 assert(behind>gate,`loot behind the hero (${behind}) is not above the door (${gate})`);
 assert(front>gate,`loot in front of the hero (${front}) is not above the door (${gate})`);
 assert(canvas>behind,`the arena canvas (${canvas}) does not cover the behind layer (${behind})`);
 assert(front>canvas,`loot in front (${front}) is not above the canvas (${canvas})`);
 assert(hud>front&&result>hud,`HUD (${hud}) or result (${result}) do not sit above the drops`);
});

test('a skill book carries the same grade outline as equipment while gold stays plain',()=>{
 const css=readFileSync(new URL('../src/styles/dungeon.css',import.meta.url),'utf8');
 const rule=pattern=>css.match(pattern)?.[0]??'';
 const equipment=rule(/\.dungeon-loot\.is-item \.dungeon-loot-art\{[^}]*\}/),book=rule(/\.dungeon-loot\.is-item \.dungeon-loot-book\{[^}]*\}/);
 assert(equipment.includes('animation:dungeon-loot-glow'),'equipment halo is missing');
 assert(book.includes('animation:dungeon-loot-glow'),'skill book has no halo');
 // The 1px hard outline sits on the book itself too, so it stays crisp with reduced motion.
 const base=rule(/\.dungeon-loot-book\{[^}]*\}/);
 for(const shadow of ['1px 0 0 var(--loot-ink)','-1px 0 0 var(--loot-ink)','0 1px 0 var(--loot-ink)','0 -1px 0 var(--loot-ink)'])
  assert(base.includes(`drop-shadow(${shadow})`),`skill book outline misses ${shadow}`);
 assert(/@media\(prefers-reduced-motion:reduce\)\{[^}]*\.dungeon-loot\.is-item \.dungeon-loot-book/.test(css),'reduced motion forgets the skill book');
 // Gold alone keeps no light at all.
 assert(/\.dungeon-loot\.is-gold \.dungeon-loot-coin\{[^}]*filter:none/.test(css),'gold must stay plain');
});

test('a dungeon drop falls plainly: no rotation on the way down, at rest, or on the pull',()=>{
 const source=readFileSync(new URL('../src/ui/dungeonField.ts',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/styles/dungeon.css',import.meta.url),'utf8');
 assert.doesNotMatch(source,/rotate\(|spinV|entry\.spin/,'the drop art must keep its upright angle for the whole drop beat');
 // The toss, rest and absorb beat are unchanged: only the turning was taken out.
 assert.match(source,/-50%,-100%\) translateY\(/,'the bounce still lifts the drop');
 assert.match(source,/scale\(\$\{1-\.55\*p\*p\}\)/,'the pull still shrinks the drop');
 assert.doesNotMatch(css,/\.dungeon-loot-body\{[^}]*rotate/,'no CSS turn is layered back onto the drop body');
 assert.doesNotMatch(css,/animation:dungeon-loot-(?!glow)[a-z-]+/,'no drop animation may turn the art');
});

test('a dungeon drop makes the same one small hop as the field',()=>{
 const source=readFileSync(new URL('../src/ui/dungeonField.ts',import.meta.url),'utf8');
 const field=readFileSync(new URL('../src/game/render/drops.ts',import.meta.url),'utf8');
 const num=(text,name)=>Number(text.match(new RegExp(`${name} ?= ?([0-9.]+)`))[1]);
 const gravity=num(source,'LOOT_GRAVITY'),peak=num(source,'LOOT_TOSS_PEAK'),vary=num(source,'LOOT_TOSS_VARY'),rebound=num(source,'LOOT_TOSS_REBOUND'),settle=num(source,'LOOT_TOSS_SETTLE');
 assert(peak>2&&peak<=8,'the first arc is a hop, not a lob');
 // Both screens show the same drop, so both keep the same hop height and gravity.
 assert.equal(peak,num(field,'TOSS_PEAK'),'the dungeon keeps the field hop height');
 assert.equal(gravity,num(field,'BOUNCE_GRAVITY'),'and the same gravity');
 const fall=scale=>{
  let h=2,vh=Math.sqrt(2*gravity*peak)*scale,apex=2,tap=0,bounces=0,tapped=false,frames=0;
  while(frames++<240){
   h+=vh/60;vh-=gravity/60;apex=Math.max(apex,h);
   if(h<=0){h=0;if(!tapped&&vh<-settle){tapped=true;vh=-vh*rebound;bounces++;}else break;}
   if(bounces)tap=Math.max(tap,h);
  }
  return {apex,tap,bounces,seconds:frames/60};
 };
 for(const scale of [1+vary,1-vary]){
  const {apex,tap,bounces,seconds}=fall(scale);
  assert(apex<=11,`the first arc stays a small hop (got ${apex.toFixed(1)}px)`);
  assert.equal(bounces,1,'one tap only');
  assert(tap<=2,`the tap is about a pixel (got ${tap.toFixed(2)})`);
  assert(seconds<.6,'the fall is over in well under a second');
 }
});

test('a boss floor leaves two random items and ten scattered gold heaps', () => {
  const { BOSS_GOLD_PILES, BOSS_ITEM_DROPS } = bossLoot;
  const battle = new DungeonBattle(freshSave(), 5);
  assert(battle.bossFloor, 'the 5th floor is a boss floor');
  const boss = battle.world.enemies[0];
  assert(boss.boss);
  withRandom([.5, .5, .5, .5, .5, .5], () => battle.world.kill(boss));
  const gold = battle.world.loot.filter(entry => entry.kind === 'gold'), items = battle.world.loot.filter(entry => entry.kind === 'item');
  assert.equal(gold.length, BOSS_GOLD_PILES, 'the boss gold falls in ten heaps');
  assert.equal(items.length, BOSS_ITEM_DROPS, 'and its two random items fall with it');
  assert.equal(gold.reduce((sum, entry) => sum + entry.gold, 0), 70 * 5, 'the heaps add up to the boss gold');
  assert.equal(battle.world.lootGold, 70 * 5, 'the clear screen still reports the same gold');
  assert.equal(new Set(gold.map(entry => `${Math.round(entry.x)},${Math.round(entry.y)}`)).size, BOSS_GOLD_PILES, 'every heap has its own point');
  for (const entry of items) assert(entry.item.name.length > 0 && entry.item.id, 'each item is a real roll');
  // A normal floor keeps the old beat: one coin and the test 50% item gate.
  const normal = new DungeonBattle(freshSave(), 1);
  withRandom([.9], () => normal.world.kill(normal.world.enemies[0]));
  assert.equal(normal.world.loot.filter(entry => entry.kind === 'gold').length, 1);
  assert.equal(normal.world.loot.filter(entry => entry.kind === 'item').length, 0);
});

test('a dungeon gold heap always sits in the behind layer, under monsters and items', () => {
  const source = readFileSync(new URL('../src/ui/dungeonField.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles/dungeon.css', import.meta.url), 'utf8');
  assert.match(source, /loot\.kind==='gold'\|\|spot\.y<heroY-6\?backLootLayer:lootLayer/, 'a coin always goes to the behind layer');
  const z = pattern => { const match = css.match(pattern); return match ? Number(match[1]) : NaN; };
  const gate = z(/\.dungeon-exit-gate\{[^}]*z-index:(-?\d+)/), behind = z(/\.dungeon-loot-layer\.is-behind\{z-index:(-?\d+)/),
    canvas = z(/\.dungeon-field-canvas\{[^}]*z-index:(-?\d+)/), gold = z(/\.dungeon-loot\.is-gold\{z-index:(-?\d+)/), item = z(/\.dungeon-loot\.is-item\{z-index:(-?\d+)/);
  assert(gate < behind && behind < canvas, `the door (${gate}) < the behind layer (${behind}) < the arena (${canvas})`);
  assert(gold < item, `a coin (${gold}) is painted under an item (${item}) even in the same layer`);
});

test('a dungeon coin heap is the same bright flat heap as the field', () => {
  const { GOLD_PILE, GOLD_COIN_CHIP_DROP } = goldPile;
  assert(GOLD_PILE.length >= 2 && GOLD_PILE.length <= 3);
  // The coins lie down at half their width and keep the art's own bright gold (작업 196).
  for (const coin of GOLD_PILE) {
    assert(coin.size >= 15 && coin.size <= 16, `each coin is 15~16px wide (got ${coin.size})`);
    assert.equal(coin.squash, .5, `each coin is squashed to .50 (got ${coin.squash})`);
  }
  // 작업 197: the heap stays smaller than the 34px item icon beside it.
  const left = Math.min(...GOLD_PILE.map(coin => coin.dx - coin.size / 2)), right = Math.max(...GOLD_PILE.map(coin => coin.dx + coin.size / 2));
  assert(right - left <= 30 && right - left < 34, `the heap is about 29~30px wide (got ${right - left})`);
  const source = readFileSync(new URL('../src/ui/dungeonField.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles/dungeon.css', import.meta.url), 'utf8');
  assert.match(source, /for\(const coin of GOLD_PILE\)/, 'the dungeon draws every coin of the heap');
  assert(source.includes('const chip=goldCoinChipUrl(coin)'), 'each coin is the chip baked for both screens');
  assert(source.includes('const width=chip?goldCoinChipWidth(coin):coin.size'), 'the chip sets the box, the plain art the fallback');
  assert(source.includes('art.style.bottom=`${-coin.dy-(chip?GOLD_COIN_CHIP_DROP:0)}px`'), 'and the shared heap table places it');
  assert.match(source, /warmGoldCoinChips\(\)/, 'the chips are baked when the arena opens, before the first kill');
  assert.doesNotMatch(source, /gold-pile\.png/, 'no second heap asset is loaded');
  // No colour grade or outline is stacked on a coin here: the baked chip already carries both.
  assert(/\.dungeon-loot\.is-gold \.dungeon-loot-coin\{[^}]*filter:none/.test(css), 'a coin heap carries no outer light');
  assert.doesNotMatch(css, /is-gold \.dungeon-loot-body\{filter/, 'and is not toned down any more');
});
