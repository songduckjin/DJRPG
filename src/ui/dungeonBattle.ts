import { DUNGEON_MAX_FLOOR } from './dungeonLobby';
import { random, seededRandom, useRandom, type Random } from '../game/rng';
import {World, type Enemy, ENEMY_STRIKE_SECONDS, enemyHitDamage, enemyMoveSpeed} from '../game/world';
import {clampArenaPoint} from '../game/arena';
import {jobOrDefault} from '../game/skills';
import {totalStats, type Save} from '../game/store';
import {equipmentDropChance,rollItem,rollSkillBook,skillBookDropChance,type Item} from '../game/items';
import {bossGoldPiles,bossGoldSpot,bossItems} from '../game/bossLoot';
/** Ground loot held by the preview only. Kept off `World.drops` so the shared field renderer stays untouched.
 *  `from` is the body a boss heap was thrown from (작업 196): the dungeon flies the heap out of the boss
 *  to the spot it lands on, exactly as the field does. */
export type DungeonLoot = { id:number; kind:'gold'; x:number; y:number; gold:number; from?:{x:number;y:number} } | { id:number; kind:'item'; x:number; y:number; item:Item };
/**
 * 서버 검증용 고정 스텝 (작업 211).
 *
 * `start`가 준 시드로 전투를 돌리고 서버가 **같은 시드·같은 스텝**으로 다시 돌려 클리어를 확인하므로,
 * 전투는 프레임 시간이 아니라 이 간격으로만 전진한다. 남는 시간은 다음 스텝으로 넘긴다(`dungeonField`).
 * 이 상수는 `server/dungeon-verify.mjs`의 `DUNGEON_STEP`과 같은 값이어야 한다(테스트가 대조한다).
 */
export const DUNGEON_STEP = 1 / 60;
/** 90초 한 판의 최대 스텝 수 — 이보다 긴 요약은 서버가 받지 않는다. */
export const DUNGEON_MAX_STEPS = Math.ceil(90 / DUNGEON_STEP) + 2;
/** digest 표본 간격(스텝). 0.5초마다 남은 체력과 처치 수를 남겨 서버 리플레이와 대조한다. */
export const DUNGEON_TRACE_EVERY = 30;
/** 전투가 끝난 뒤 클라이언트가 `submit`에 실어 보내는 결과 요약. 서버는 같은 시드로 다시 돌린 결과와
 *  이 값을 비교한다(층을 깰 수 있는지·시간이 흘렀는지·실제로 그 전투를 돌렀는지). */
export type DungeonBattleSummary = {
  won: boolean; steps: number; seconds: number; heroHp: number; heroHpMax: number; enemyHp: number; slain: number; digest: string;
};
/** 던전 일반 몹의 아이템 드롭률 (작업 205). */
//
// 미리보기 때는 확인용 50%였는데, 이제 클리어 보상이 계정에 들어가므로 실제 확률로 되돌린다. 필드 일반
// 몹은 0.25~2.2%라 던전이 그대로면 "들어갈 값어치"가 없다. 그래서 1층 15%에서 층마다 .5%p씩 올려
// 10층 19.5%(상한 20%)로 두고, 무엇이 떨어지는지는 필드와 같은 장비:스킬북 비율을 그대로 쓴다.
export const DUNGEON_DROP_CHANCE_BASE = .15;
export const DUNGEON_DROP_CHANCE_STEP = .005;
export const DUNGEON_DROP_CHANCE_MAX = .2;
export function dungeonDropChance(floor:number):number {
  const depth=Math.max(1,Math.min(DUNGEON_MAX_FLOOR,Math.floor(floor)||1));
  return Math.min(DUNGEON_DROP_CHANCE_MAX,DUNGEON_DROP_CHANCE_BASE+(depth-1)*DUNGEON_DROP_CHANCE_STEP);
}
/** 층별 고정 몬스터 체력 (작업 205) — 내 장비·스킬과 무관한 고정 곡선이다. */
//
// 전에는 `dungeonPreviewHp`가 내 DPS에 4배를 곱해 "아무리 세도 4초"로 맞추는 고무줄이었다. 실제 보상을
// 지급하는 지금은 그럴 수 없어 층마다 값을 고정했다. 기준은 필드 자체의 곡선 `enemyMaxHp(2 × 층)`이고,
// 그래서 던전 3층은 필드 6층, 10층은 필드 20층과 같은 손맛이 된다. 첫 층 60은 Lv.5~10·저층 장비
// (평타 DPS 80~130)로 3~6초, 9층 1,055는 20층 언저리 장비로 10여 초, 10층 보스는 보스 배율(30배)로
// 43,320이라 15~20층을 파밍한 장비(대략 DPS 500~1,000)라야 90초 안에 끝난다.
export const DUNGEON_MOB_HP: readonly number[] = [60,106,160,220,299,406,557,767,1055,1444];
/** 이 층의 일반 몹 체력. 1~10층 밖의 값은 가장 가까운 층으로 잘라 쓴다. */
export function dungeonMobHp(floor:number):number {
  const depth=Math.max(1,Math.min(DUNGEON_MOB_HP.length,Math.floor(floor)||1));
  return DUNGEON_MOB_HP[depth-1];
}
/** 보스 층(5·10층)은 같은 층 일반 몹의 30배 — 필드 보스(일반의 6배)보다 훨씬 묵직하다.
 *  10층 보스는 43,320이라 평타 DPS 400(공격 120)짜리 장비로는 90초를 넘기고, 15~20층을 파밍한
 *  장비(DPS 1,000 전후)라야 40초 안팎에 끝난다. */
export const DUNGEON_BOSS_HP_SCALE = 30;
/** 3웨이브 정예는 일반 몹의 2배(예전 그대로). */
export const DUNGEON_ELITE_HP_SCALE = 2;
/** Dungeon mobs close ground 1.5x the shared field pace; only travel distance scales, never timers. */
export const DUNGEON_ENEMY_SPEED_SCALE = 1.5;
/** Every enemy walks 4.25 half turns a second, so one visible stride (a full turn) lasts 2/4.25 s. */
const ENEMY_STRIDE_SECONDS = 2 / 4.25;
/** Each wave starts this many strides closer to the hero than the old arena corner. */
export const DUNGEON_SPAWN_STEPS = 2;
/** Arena distance a spawn is pulled in: steps at the floor's own walking pace, so it keeps its feel
 *  as enemies get faster on deeper floors. */
export function dungeonSpawnPull(floor:number,boss:boolean):number {
  return DUNGEON_SPAWN_STEPS*enemyMoveSpeed(floor,boss)*ENEMY_STRIDE_SECONDS;
}
export type LootSpot = { x:number; y:number };
/** Ground loot resting on its spot: `gold` marks a coin, which is allowed to pile up on anything. */
export type LootDrop = LootSpot & { gold?:boolean };
/** The floor a drop may rest on, in screen pixels around the hero. `top` is the highest resting y —
 *  above it is the exit door — and `reach` is how far a drop may sit from the hero. Without them a
 *  drop keeps the point it fell on, however far up the room that was. */
export type LootField = { top?:number; reach?:number };
/** Ground loot rests inside a fan opening from the hero: ±100° of straight up. That keeps every drop
 *  near the kill and never behind the feet where the skill bar sits. */
export const DUNGEON_LOOT_FAN = Math.PI*100/180;
/** Coins of one heap land this close together, so only a coin that would sit on the very same point
 *  as another is stepped a few pixels aside — enough that two coins never read as a single coin. */
export const DUNGEON_GOLD_PILE_MIN = 10;
export const DUNGEON_GOLD_PILE_STEP = 6;
/** Resting spots for the drops of a kill (or of several). A drop keeps the point it fell on whenever
 *  that point is already clear of the hero art; inside the hero's keep-out ellipse it is pulled out
 *  along the hero→drop direction — never shoved to the sides — just past the silhouette.
 *  Only equipment and skill books then keep `gap` from each other. A coin piles up with coins and
 *  items alike, moving only to clear the silhouette or to step off a coin in its own heap.
 *  `rx`/`ry` are the keep-out half-width and half-height of the character, `gap` the item pitch, and
 *  `field` the floor the drops may rest on: a spot above `top` or beyond `reach` comes back along
 *  its own line toward the hero, so drops stay on the floor in front of the character instead of
 *  climbing up to the exit door. A drop never ends up on the hero art, even if that costs the top
 *  limit on a very short screen. */
export function dungeonLootSpots(heroX:number,heroY:number,drops:LootDrop[],taken:LootDrop[],rx:number,ry:number,gap:number,field:LootField={}):LootSpot[] {
  const polar=(r:number,a:number):LootSpot=>({x:heroX+Math.sin(a)*r,y:heroY-Math.cos(a)*r});
  const rim=(a:number)=>1/Math.hypot(Math.sin(a)/rx,Math.cos(a)/ry);
  const fan=(a:number)=>Math.max(-DUNGEON_LOOT_FAN,Math.min(DUNGEON_LOOT_FAN,a));
  const angleOf=(p:LootSpot)=>Math.atan2(p.x-heroX,heroY-p.y);
  // Longest step this direction may take: the floor limit, the reach, and always clear of the hero.
  const ceiling=(a:number):number=>{
    let limit=field.reach??Infinity;const cos=Math.cos(a);
    if(field.top!==undefined&&cos>1e-6)limit=Math.min(limit,(heroY-field.top)/cos);
    return limit;
  };
  const place=(r:number,a:number):LootSpot=>polar(Math.max(Math.min(r,ceiling(a)),rim(a)+2),a);
  // Coins are in `taken` too, but only another item can push an item away.
  const free=(p:LootSpot)=>taken.every(t=>t.gold||Math.hypot(t.x-p.x,t.y-p.y)>=gap-1e-6);
  const spots:LootSpot[]=[];
  for(const drop of drops){
    const a=fan(angleOf(drop)),r=Math.max(Math.hypot(drop.x-heroX,drop.y-heroY),rim(a)+2),base=place(r,a);
    let spot=base;
    // A heap only steps a few pixels off the point it fell on, so it never climbs toward the door even
    // when the heap itself sits on the floor limit.
    if(drop.gold){
      const pile=taken.filter(t=>t.gold&&Math.hypot(t.x-base.x,t.y-base.y)<DUNGEON_GOLD_PILE_MIN).length;
      if(pile){
        const turn=pile*2.4,reach=DUNGEON_GOLD_PILE_STEP*(1+Math.floor(pile/6));
        const nudge={x:base.x+Math.sin(turn)*reach,y:base.y-Math.cos(turn)*reach},nudgeAngle=fan(angleOf(nudge));
        spot=polar(Math.max(Math.hypot(nudge.x-heroX,nudge.y-heroY),rim(nudgeAngle)+2),nudgeAngle);
      }
    }else if(!free(base))for(let ring=1;ring<=12;ring++){
      let nearest=Infinity;
      for(const turn of [0,.4,-.4,.8,-.8,1.2,-1.2,1.6,-1.6]){
        const candidate=place(r+ring*gap,fan(a+turn));
        if(!free(candidate))continue;
        const distance=Math.hypot(candidate.x-base.x,candidate.y-base.y);
        if(distance<nearest){nearest=distance;spot=candidate;}
      }
      if(nearest<Infinity)break;
    }
    taken.push({...spot,gold:drop.gold});spots.push(spot);
  }
  return spots;
}
/** A cleared floor holds its loot on the ground for a beat so the last kill's drops are seen, then
 *  pulls every coin and item in, and only after the last one is gone shows the result. */
export const DUNGEON_ABSORB_DELAY = 1.5;
export const DUNGEON_ABSORB_STAGGER = .045;
export const DUNGEON_ABSORB_FLIGHT = .55;
export const DUNGEON_ABSORB_HOLD = .2;
export const DUNGEON_RESULT_DELAY = .75;
export type LootTimeline = { absorbAt:number; absorbEnd:number; resultAt:number };
export function dungeonLootTimeline(outcome:'clear'|'dead'|'timeout'|null,count:number):LootTimeline {
  if(outcome!=='clear')return {absorbAt:Infinity,absorbEnd:Infinity,resultAt:DUNGEON_RESULT_DELAY};
  const absorbEnd=DUNGEON_ABSORB_DELAY+Math.max(0,count-1)*DUNGEON_ABSORB_STAGGER+DUNGEON_ABSORB_FLIGHT;
  return {absorbAt:DUNGEON_ABSORB_DELAY,absorbEnd,resultAt:absorbEnd+DUNGEON_ABSORB_HOLD};
}
/** 0 while the drop still rests on the ground, 1 once it has been swallowed by the hero. */
export function dungeonAbsorbProgress(timeSinceFinish:number,index:number):number {
  return Math.min(1,Math.max(0,(timeSinceFinish-DUNGEON_ABSORB_DELAY-index*DUNGEON_ABSORB_STAGGER)/DUNGEON_ABSORB_FLIGHT));
}
/** Screen point of a drop `progress` of the way into the hero: it starts at the ground, accelerates
 *  (progress squared), swings a little sideways so drops of one pile do not merge, and lands exactly
 *  on `to` at progress 1, where the node is removed. */
export function dungeonAbsorbPoint(from:LootSpot,to:LootSpot,progress:number,index:number):LootSpot {
  const k=progress*progress,swing=progress>=1?0:Math.sin(Math.PI*progress)*10*(index%2?1:-1);
  return {x:from.x+(to.x-from.x)*k+swing,y:from.y+(to.y-from.y)*k};
}
class DungeonWorld extends World {
  slain=0;
  loot:DungeonLoot[]=[];
  private lootId=0;
  /** Gold this floor's kills left on the ground, which the clear screen reports. */
  get lootGold():number { return this.loot.reduce((sum,entry)=>sum+(entry.kind==='gold'?entry.gold:0),0); }
  // The hero fights from where he stands (작업 248). Until now this override pinned him to (50,50) before
  // and after `super.update`, so every step he took toward a mob was undone in the same frame and the room
  // looked like it was waiting for the monsters. He now walks exactly as the field does — `World.update`
  // moves him along `activeMove` toward the nearest enemy until `stopRange`, inside `clampArenaPoint` — and
  // `nearest()` is no longer cut off at 110. Because he stops a `stopRange` short of the mob, he never
  // reaches the wave's spawn line at the top of the room or the exit door: on a 390×700 phone his feet stay
  // 78px (360×640: 71px) below the door sill, and the whole floor is walked inside the arena. Only the
  // enemies keep the extra step below.
  override update(dt:number):void {
    super.update(dt);
    // `super.update` already walked every mob one shared field step. Adding the remaining half
    // along the same heading makes the travelled distance exactly DUNGEON_ENEMY_SPEED_SCALE,
    // while cooldowns, skills, hit timing and the 90s limit keep running on the real dt.
    const extra=(DUNGEON_ENEMY_SPEED_SCALE-1)*dt;
    for(const enemy of this.enemies){
      const dx=this.player.x-enemy.x,dy=this.player.y-enemy.y,d=Math.hypot(dx,dy);
      if(!enemy.moving||d<=27||extra<=0)continue;
      const step=Math.min(enemyMoveSpeed(this.save.floor,enemy.boss)*(enemy.slow>0?.55:1)*extra,d-27);
      if(step<=0)continue;
      const bounded=clampArenaPoint(enemy.x+dx/d*step,enemy.y+dy/d*step);
      enemy.step+=extra*Math.PI*(enemy.boss?3.25:4.25);
      enemy.x=bounded.x;enemy.y=bounded.y;
    }
  }
  override kill(enemy:Enemy):void { this.slain++;this.effects.push({x:enemy.x,y:enemy.y,kind:'death',age:0,duration:.7,angle:0});this.dropLoot(enemy); }
  // Same rewards the field grants, kept as ground loot until the floor is cleared: a coin on every
  // kill and one item on the floor's own dungeon rate (`dungeonDropChance`) chosen by the field's
  // equipment/skillbook odds. A boss (5층·10층, 작업 194) leaves five random items and its gold in ten
  // heaps bursting out of the body (작업 196), the heaps still adding up to the 70×floor the kill paid.
  // The main field's boss drops only the heaps and keeps the ordinary chance roll (작업 195) — this
  // five-item haul is the dungeon's. Nothing here is paid yet: `clearRewards` hands it to the account
  // only when the floor is actually cleared (작업 205).
  private dropLoot(enemy:Enemy):void {
    const floor=this.save.floor;
    if(enemy.boss){
      bossGoldPiles(70*floor).forEach((gold,index)=>{
        const spot=bossGoldSpot(enemy.x,enemy.y,index);
        this.loot.push({id:++this.lootId,kind:'gold',x:spot.x,y:spot.y,gold,from:{x:enemy.x,y:enemy.y}});
      });
      for(const item of bossItems(floor))this.loot.push({id:++this.lootId,kind:'item',x:enemy.x,y:enemy.y,item});
      return;
    }
    this.loot.push({id:++this.lootId,kind:'gold',x:enemy.x,y:enemy.y,gold:3+floor});
    if(random()>=dungeonDropChance(floor))return;
    const equipment=equipmentDropChance(floor,enemy.boss),book=skillBookDropChance(floor,enemy.boss);
    const item=random()*(equipment+book)<equipment?rollItem(floor,false,enemy.boss,this.save.job):rollSkillBook(floor,jobOrDefault(this.save.job));
    this.loot.push({id:++this.lootId,kind:'item',x:enemy.x,y:enemy.y,item});
  }
}
/** 끝없는 던전 1~10층 전투. 클리어하면 금화·강화석·아이템이 계정 세이브로 들어간다(작업 205). */
export class DungeonBattle {
  readonly world:DungeonWorld;
  readonly floor:number;
  /** 서버가 준 시드(작업 211). 없으면 지금까지처럼 `Math.random`으로 돈다(게스트·시드 실패). */
  readonly seed?:number;
  /** 지금까지 밟은 고정 스텝 수 — 서버 리플레이와 같은 수여야 한다. */
  steps=0;
  private rng?:Random;
  private traceValues:number[]=[];
  get trace():readonly number[]{return this.traceValues;}
  get bossFloor(){return this.floor%5===0;}
  get targetCount(){return this.bossFloor?1:7;}
  elapsed=0;wave=0;waveStarted=0;finished=false;outcome:'clear'|'dead'|'timeout'|null=null;
  elite?:Enemy;private hitCooldown=0;
  /** A clear pays exactly what this floor left on the ground — the gold the kills were worth and every
   *  equipment piece or skill book that fell. A defeat or a timeout pays nothing at all (작업 205). */
  clearRewards():{gold:number;items:Item[]}|undefined {
    if(this.outcome!=='clear')return undefined;
    return {gold:this.world.lootGold,items:this.world.loot.flatMap(entry=>entry.kind==='item'?[entry.item]:[])};
  }
  constructor(save:Save,floor=1,seed?:number){this.floor=Math.min(DUNGEON_MAX_FLOOR,Math.max(1,Math.floor(floor)));const copy=structuredClone(save);copy.floor=this.floor;copy.floorKills=0;copy.tutorial=3;copy.autoClimb=false;
    if(Number.isFinite(seed)){this.seed=Math.floor(Number(seed))>>>0;this.rng=seededRandom(this.seed);}
    this.world=new DungeonWorld(copy);this.world.enemies=[];this.world.spawnTimer=Infinity;this.world.bossPending=false;
    this.world.player.hp=totalStats(copy).health;this.world.player.x=50;this.world.player.y=50;
    // 첫 웨이브도 시드 난수로 세운다 — 서버 리플레이가 같은 자리에서 시작해야 한다.
    if(this.rng){const previous=useRandom(this.rng);try{this.spawnWave();}finally{useRandom(previous);}}else this.spawnWave();
  }
  private spawnWave():void {
    this.wave++;this.waveStarted=this.elapsed;
    const count=this.bossFloor||this.wave===3?1:3, pull=dungeonSpawnPull(this.floor,this.bossFloor);
    // 시드가 걸린 전투는 웨이브마다 등장 자리를 조금 흔든다(작업 211): 자리는 그대로 두고 아레나 중심을 축으로
    // ±8.6°·±8%만 돌려, 도전마다 전투가 같은 요약으로 접히지 않게 한다. 시드가 없으면(연습·게스트) 지금까지와 같다.
    const turn=this.rng?(random()-.5)*.3:0, drift=this.rng?1+(random()-.5)*.16:1, spin=Math.cos(turn), swing=Math.sin(turn);
    for(let i=0;i<count;i++){
      const hp=dungeonMobHp(this.floor)*(this.bossFloor?DUNGEON_BOSS_HP_SCALE:this.wave===3?DUNGEON_ELITE_HP_SCALE:1), side=(i-(count-1)/2)*65;
      // The old arena corner, stepped toward the hero along its own approach line.
      const cornerX=(-180+side)/2, cornerY=(-180-side)/2, ax=50-cornerX, ay=50-cornerY, reach=Math.hypot(ax,ay)||1;
      let x=cornerX+ax/reach*pull, y=cornerY+ay/reach*pull;
      if(this.rng){const dx=x-50, dy=y-50;x=50+(dx*spin-dy*swing)*drift;y=50+(dx*swing+dy*spin)*drift;}
      const enemy:Enemy={x,y,hp,maxHp:hp,boss:this.bossFloor,hit:0,step:0,moving:false,knockX:0,knockY:0,slow:0};
      this.world.enemies.push(enemy);if(this.wave===3||this.bossFloor)this.elite=enemy;
    }
  }
  /** 한 스텝 전진. 시드가 걸려 있으면 이 스텝 동안만 그 시드의 난수를 쓴다 — 서버 리플레이도 같은
   *  시드·같은 스텝 수로 돌기 때문에 적 스폰·드롭·연출의 난수가 모두 같은 순서로 나온다. */
  advance(seconds:number):void {
    if(this.finished)return;
    if(this.rng){const previous=useRandom(this.rng);try{this.step(seconds);}finally{useRandom(previous);}}else this.step(seconds);
    this.steps++;
    if(this.finished||this.steps%DUNGEON_TRACE_EVERY===0)this.sample();
  }
  /** 지금 상태를 digest 표본으로 남긴다(남은 체력·남은 적 체력·처치 수). */
  private sample():void {
    this.traceValues.push(Math.round(this.world.player.hp),Math.round(this.enemyHpLeft()),this.world.slain);
  }
  private enemyHpLeft():number { let total=0;for(const enemy of this.world.enemies)total+=Math.max(0,enemy.hp);return total; }
  private step(seconds:number):void {
    const dt=Math.min(.05,Math.max(0,seconds),90-this.elapsed);this.elapsed+=dt;
    // Suppress the main field's immediate revive; this session owns defeat and retry.
    const hit=this.world.player.hit;this.world.player.hit=Infinity;
    try{this.world.update(dt);}finally{this.world.player.hit=Math.max(0,hit-dt);}
    this.hitCooldown=Math.max(0,this.hitCooldown-dt);
    if(this.hitCooldown===0){const enemy=this.world.enemies.find(e=>Math.hypot(e.x-this.world.player.x,e.y-this.world.player.y)<36);
      if(enemy){const max=totalStats(this.world.save).health;
        const taken=Math.min(enemyHitDamage(this.floor,enemy.boss,totalStats(this.world.save).defense)*(enemy===this.elite?2:1),max*(enemy===this.elite?.008:.005));
        this.world.player.hp=Math.max(0,this.world.player.hp-taken);this.world.player.hit=.25;this.hitCooldown=.9;
        // 적 공격 모션·반격 표시(작업 245) — 때린 적이 내딛고, 내 몸에 할퀴는 자국과 잃은 체력이 뜬다.
        // 연출만 더하므로 시드 난수 소비·전투 결과(체력·처치 수)는 그대로다.
        enemy.attack=ENEMY_STRIKE_SECONDS;
        this.world.effects.push({x:this.world.player.x,y:this.world.player.y,kind:'enemyStrike',age:0,duration:.5,angle:Math.atan2(this.world.player.y-enemy.y,this.world.player.x-enemy.x),amount:Math.round(taken)});}}
    if(this.world.player.hp<=0)this.outcome='dead';
    else if((this.bossFloor||this.wave===3)&&!this.world.enemies.length)this.outcome='clear';
    else if(this.elapsed>=90)this.outcome='timeout';
    if(this.outcome){this.finished=true;return;}
    if(!this.bossFloor&&this.wave<3&&(this.elapsed-this.waveStarted>=10||!this.world.enemies.length))this.spawnWave();
  }
}

/** FNV-1a 32비트 — 표본 정수 배열을 8자리 16진수 한 줄로 접는다(작업 211). */
export function dungeonDigest(values: readonly number[]): string {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const int = Math.max(-2147483648, Math.min(2147483647, Math.round(value))) | 0;
    for (const shift of [24, 16, 8, 0]) { hash ^= (int >>> shift) & 255; hash = Math.imul(hash, 0x01000193) >>> 0; }
  }
  return hash.toString(16).padStart(8, '0');
}

/** 끝난 전투의 결과 요약. 클라이언트가 `submit`에 싣고, 서버는 같은 시드로 돌린 결과와 비교한다. */
export function dungeonBattleSummary(battle: DungeonBattle): DungeonBattleSummary {
  const playerHp = Math.max(0, Math.ceil(battle.world.player.hp));
  const enemyHp = Math.max(0, Math.ceil(battle.world.enemies.reduce((sum, enemy) => sum + Math.max(0, enemy.hp), 0)));
  const health = Math.max(1, Math.ceil(totalStats(battle.world.save).health));
  return {
    won: battle.outcome === 'clear',
    steps: battle.steps,
    seconds: Math.round(battle.elapsed * 10) / 10,
    heroHp: playerHp, heroHpMax: health, enemyHp, slain: battle.world.slain,
    digest: dungeonDigest([...battle.trace, playerHp, enemyHp, battle.world.slain])
  };
}

/** 그 세이브로 그 층을 고정 스텝으로 끝까지 돌린다 — 클라이언트 재생과 서버 리플레이가 같은 함수를 쓴다. */
export function runDungeonBattle(save: Save, floor: number, seed?: number): DungeonBattle {
  const battle = new DungeonBattle(save, floor, seed);
  while (!battle.finished && battle.steps < DUNGEON_MAX_STEPS) battle.advance(DUNGEON_STEP);
  return battle;
}
