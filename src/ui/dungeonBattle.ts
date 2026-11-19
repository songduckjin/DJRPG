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
/** Screen point where a drop rests. A kill lands almost on top of the hero, so any drop inside the
 *  keep-out ring is pushed out to the side or below the feet of the character; drops that already
 *  fell outside the ring keep the spot they fell on. `bias` fans drops of one kill apart. */
export function dungeonLootLanding(heroX:number,heroY:number,dropX:number,dropY:number,ring:number,bias=0):{x:number;y:number} {
  const ox=dropX-heroX,oy=dropY-heroY,dist=Math.hypot(ox,oy);
  if(dist>=ring)return {x:dropX,y:dropY};
  let ax=dist>1?ox/dist:0,ay=dist>1?oy/dist:1;
  if(bias){const cos=Math.cos(bias),sin=Math.sin(bias),x=ax*cos-ay*sin;ay=ax*sin+ay*cos;ax=x;}
  // Beside the body (never across it), and never over the character's head.
  if(ay<-.45)ay=-.45;
  if(Math.abs(ax)<.6&&ay<.5)ax=.6*(ax<0?-1:1);
  const magnitude=Math.hypot(ax,ay)||1;
  return {x:heroX+ax/magnitude*ring,y:heroY+ay/magnitude*ring};
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
    const count=this.bossFloor||this.wave===3?1:3;
    for(let i=0;i<count;i++){
      const hp=dungeonPreviewHp(this.world.save)*(this.bossFloor?4:this.wave===3?2:1)*(1+(this.floor-1)*.12), side=(i-(count-1)/2)*65;
      const enemy:Enemy={x:(-180+side)/2,y:(-180-side)/2,hp,maxHp:hp,boss:this.bossFloor,hit:0,step:0,moving:false,knockX:0,knockY:0,slow:0};
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
