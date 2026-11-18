import {World, type Enemy, enemyHitDamage} from './world';
import {totalStats,type Save} from './store';
// This world owns a deep copy. No callbacks, loot, ranking or real-account writes.
export class WorldBossRehearsal {
  readonly world:World;
  readonly boss:Enemy;
  elapsed=0;damage=0;finished=false;defeated=false;
  private lastBossHit=-1;
  constructor(save:Save){
    const copy=structuredClone(save);copy.tutorial=3;copy.floorKills=0;
    this.world=new World(copy);this.world.spawnTimer=Infinity;this.world.bossPending=false;
    this.world.player.hp=totalStats(copy).health;
    this.world.player.x=10;this.world.player.y=65;
    const maxHp=Math.max(1e12,totalStats(copy).attack*1e7);
    this.boss={x:0,y:0,hp:maxHp,maxHp,boss:true,hit:0,step:0,moving:false,knockX:0,knockY:0,slow:0};
    this.world.enemies=[this.boss];
  }
  advance(seconds:number):void{
    if(this.finished)return;
    const dt=Math.min(.05,Math.max(0,seconds),60-this.elapsed);this.elapsed+=dt;
    this.boss.x=0;this.boss.y=0;this.boss.knockX=0;this.boss.knockY=0;
    this.world.update(dt);this.boss.x=0;this.boss.y=0;this.boss.moving=false;
    this.damage=Math.max(0,Math.round(this.boss.maxHp-this.boss.hp));
    const cycle=Math.floor(this.elapsed/12),phase=this.elapsed%12;
    const hit=phase>=10.65?cycle*2+1:phase>=4.55?cycle*2:-1;
    if(hit>=0&&hit!==this.lastBossHit){
      this.lastBossHit=hit;
      this.world.player.hp=Math.max(0,this.world.player.hp-enemyHitDamage(this.world.save.floor,true,totalStats(this.world.save).defense)*(phase>=10.65?1.6:1));
      this.world.player.hit=.35;
    }
    this.defeated=this.world.player.hp<=0;this.finished=this.elapsed>=60||this.defeated;
  }
}
