import { DUNGEON_MAX_FLOOR } from './dungeonLobby';
import {World, type Enemy, enemyMaxHp, enemyHitDamage, enemyMoveSpeed} from '../game/world';
import {clampArenaPoint} from '../game/arena';
import {skillDamageScale,skills} from '../game/skills';
import {totalStats,skillLevel,type Save} from '../game/store';
import {equipmentDropChance,rollItem,rollSkillBook,skillBookDropChance,type Item} from '../game/items';
/** Ground loot held by the preview only. Kept off `World.drops` so the shared field renderer stays untouched. */
export type DungeonLoot = { id:number; kind:'gold'; x:number; y:number; gold:number } | { id:number; kind:'item'; x:number; y:number; item:Item };
/** Test rate for the whole 1-10 floor preview. Which item falls keeps the field's own odds (see `dropLoot`). */
export const DUNGEON_ITEM_DROP_CHANCE = .5;
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
/** Ground loot rests inside a fan opening from the hero: ±100° of straight up. That keeps every drop
 *  near the kill and never behind the feet where the skill bar sits. */
export const DUNGEON_LOOT_FAN = Math.PI*100/180;
/** Resting spots for the drops of a kill (or of several). A drop keeps the point it fell on whenever
 *  that point is already clear of the hero art; inside the hero's keep-out ellipse it is pulled out
 *  along the hero→drop direction — never shoved to the sides — just past the silhouette, and it only
 *  moves as far as needed for no two drops to overlap. `rx`/`ry` are the keep-out half-width and
 *  half-height of the character, `gap` the icon pitch. */
export function dungeonLootSpots(heroX:number,heroY:number,drops:LootSpot[],taken:LootSpot[],rx:number,ry:number,gap:number):LootSpot[] {
  const polar=(r:number,a:number):LootSpot=>({x:heroX+Math.sin(a)*r,y:heroY-Math.cos(a)*r});
  const rim=(a:number)=>1/Math.hypot(Math.sin(a)/rx,Math.cos(a)/ry);
  const fan=(a:number)=>Math.max(-DUNGEON_LOOT_FAN,Math.min(DUNGEON_LOOT_FAN,a));
  const angleOf=(p:LootSpot)=>Math.atan2(p.x-heroX,heroY-p.y);
  const free=(p:LootSpot)=>taken.every(t=>Math.hypot(t.x-p.x,t.y-p.y)>=gap-1e-6);
  const spots:LootSpot[]=[];
  for(const drop of drops){
    const a=fan(angleOf(drop)),r=Math.max(Math.hypot(drop.x-heroX,drop.y-heroY),rim(a)+2),base=polar(r,a);
    let spot=base;
    if(!free(base))for(let ring=1;ring<=12;ring++){
      let nearest=Infinity;
      for(const turn of [0,.4,-.4,.8,-.8,1.2,-1.2,1.6,-1.6]){
        const candidate=polar(r+ring*gap,fan(a+turn));
        if(!free(candidate))continue;
        const distance=Math.hypot(candidate.x-base.x,candidate.y-base.y);
        if(distance<nearest){nearest=distance;spot=candidate;}
      }
      if(nearest<Infinity)break;
    }
    taken.push(spot);spots.push(spot);
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
// Temporary encounter-observation balance, not the eventual fixed progression curve.
export function dungeonPreviewHp(save:Save):number {
  const stats=totalStats(save);
  const powers={slash2:2.15,spin:5,crushing:4.5,slam:5,warcry:2,power:4,destroy:2.7,hell:7};
  const skillDps=save.quickSlots.reduce<number>((sum,id)=>id&&save.learned.includes(id)?sum+powers[id]*skillDamageScale(skillLevel(save,id))/skills[id].cooldown:sum,0);
  const dps=stats.attack*((1+stats.speed/100)/.48+skillDps)*(1+stats.crit/100);
  return Math.max(enemyMaxHp(1,false),Math.ceil(dps*4));
}
class DungeonWorld extends World {
  slain=0;
  loot:DungeonLoot[]=[];
  private lootId=0;
  /** Gold this floor's kills left on the ground, which the clear screen reports. */
  get lootGold():number { return this.loot.reduce((sum,entry)=>sum+(entry.kind==='gold'?entry.gold:0),0); }
  // Defend the central position instead of chasing the previous wave's spawn point.
  override update(dt:number):void {
    this.player.x=50;this.player.y=50;
    super.update(dt);
    this.player.x=50;this.player.y=50;this.activeMove={x:0,y:0};
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
  override nearest():Enemy|undefined {
    const enemy=super.nearest();
    return enemy&&Math.hypot(enemy.x-this.player.x,enemy.y-this.player.y)<=110?enemy:undefined;
  }
  override kill(enemy:Enemy):void { this.slain++;this.effects.push({x:enemy.x,y:enemy.y,kind:'death',age:0,duration:.7,angle:0});this.dropLoot(enemy); }
  // Same rewards the field grants, kept as ground loot for display only: gold on every kill and,
  // on the test 50% gate, one item chosen by the field's equipment/skillbook drop odds.
  private dropLoot(enemy:Enemy):void {
    const floor=this.save.floor;
    this.loot.push({id:++this.lootId,kind:'gold',x:enemy.x,y:enemy.y,gold:enemy.boss?70*floor:3+floor});
    if(Math.random()>=DUNGEON_ITEM_DROP_CHANCE)return;
    const equipment=equipmentDropChance(floor,enemy.boss),book=skillBookDropChance(floor,enemy.boss);
    const item=Math.random()*(equipment+book)<equipment?rollItem(floor,false,enemy.boss):rollSkillBook(floor);
    this.loot.push({id:++this.lootId,kind:'item',x:enemy.x,y:enemy.y,item});
  }
}
/** Isolated ten-floor preview. Never mutates account save, drops, rewards or rankings. */
export class DungeonBattle {
  readonly world:DungeonWorld;
  readonly floor:number;
  get bossFloor(){return this.floor%5===0;}
  get targetCount(){return this.bossFloor?1:7;}
  elapsed=0;wave=0;waveStarted=0;finished=false;outcome:'clear'|'dead'|'timeout'|null=null;
  elite?:Enemy;private hitCooldown=0;
  constructor(save:Save,floor=1){this.floor=Math.min(DUNGEON_MAX_FLOOR,Math.max(1,Math.floor(floor)));const copy=structuredClone(save);copy.floor=this.floor;copy.floorKills=0;copy.tutorial=3;copy.autoClimb=false;
    this.world=new DungeonWorld(copy);this.world.enemies=[];this.world.spawnTimer=Infinity;this.world.bossPending=false;
    this.world.player.hp=totalStats(copy).health;this.world.player.x=50;this.world.player.y=50;this.spawnWave();
  }
  private spawnWave():void {
    this.wave++;this.waveStarted=this.elapsed;
    const count=this.bossFloor||this.wave===3?1:3, pull=dungeonSpawnPull(this.floor,this.bossFloor);
    for(let i=0;i<count;i++){
      const hp=dungeonPreviewHp(this.world.save)*(this.bossFloor?4:this.wave===3?2:1)*(1+(this.floor-1)*.12), side=(i-(count-1)/2)*65;
      // The old arena corner, stepped toward the hero along its own approach line.
      const cornerX=(-180+side)/2, cornerY=(-180-side)/2, ax=50-cornerX, ay=50-cornerY, reach=Math.hypot(ax,ay)||1, x=cornerX+ax/reach*pull, y=cornerY+ay/reach*pull;
      const enemy:Enemy={x,y,hp,maxHp:hp,boss:this.bossFloor,hit:0,step:0,moving:false,knockX:0,knockY:0,slow:0};
      this.world.enemies.push(enemy);if(this.wave===3||this.bossFloor)this.elite=enemy;
    }
  }
  advance(seconds:number):void {
    if(this.finished)return;const dt=Math.min(.05,Math.max(0,seconds),90-this.elapsed);this.elapsed+=dt;
    // Suppress the main field's immediate revive; this session owns defeat and retry.
    const hit=this.world.player.hit;this.world.player.hit=Infinity;
    try{this.world.update(dt);}finally{this.world.player.hit=Math.max(0,hit-dt);}
    this.hitCooldown=Math.max(0,this.hitCooldown-dt);
    if(this.hitCooldown===0){const enemy=this.world.enemies.find(e=>Math.hypot(e.x-this.world.player.x,e.y-this.world.player.y)<36);
      if(enemy){this.world.player.hp=Math.max(0,this.world.player.hp-Math.min(enemyHitDamage(this.floor,enemy.boss,totalStats(this.world.save).defense)*(enemy===this.elite?2:1),totalStats(this.world.save).health*(enemy===this.elite?.008:.005)));this.world.player.hit=.25;this.hitCooldown=.9;}}
    if(this.world.player.hp<=0)this.outcome='dead';
    else if((this.bossFloor||this.wave===3)&&!this.world.enemies.length)this.outcome='clear';
    else if(this.elapsed>=90)this.outcome='timeout';
    if(this.outcome){this.finished=true;return;}
    if(!this.bossFloor&&this.wave<3&&(this.elapsed-this.waveStarted>=10||!this.world.enemies.length))this.spawnWave();
  }
}
