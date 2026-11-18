import {bossHitsBetween} from './worldBossPattern';
import {World, type Enemy, enemyHitDamage} from './world';
import {totalStats,type Save} from './store';

// This world owns a deep copy. No callbacks, loot, ranking or real-account writes.
export class WorldBossRehearsal {
  readonly world:World;
  readonly boss:Enemy;
  elapsed=0;damage=0;finished=false;defeated=false;
  dodgeCooldown=0;
  dodgeRemaining=0;
  dodge():boolean {
    if(this.finished||this.dodgeCooldown>0)return false;
    this.dodgeCooldown=4;this.dodgeRemaining=.45;return true;
  }
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
    const previous=this.elapsed,dt=Math.min(.05,Math.max(0,seconds),60-this.elapsed);this.elapsed+=dt;
    this.boss.x=0;this.boss.y=0;this.boss.knockX=0;this.boss.knockY=0;
    this.dodgeCooldown=Math.max(0,this.dodgeCooldown-dt);
    const dodging=this.dodgeRemaining>0,hp=this.world.player.hp;
    this.dodgeRemaining=Math.max(0,this.dodgeRemaining-dt);
    // This dedicated battle owns enemy damage timing; suppress the shared engine's contact hits.
    const priorHit=this.world.player.hit;this.world.player.hit=Infinity;
    try{this.world.update(dt);}finally{this.world.player.hit=Math.max(0,priorHit-dt);}
    if(dodging){this.world.player.hp=hp;this.world.player.x=-35;this.world.player.y=60;}this.boss.x=0;this.boss.y=0;this.boss.moving=false;
    this.damage=Math.max(0,Math.round(this.boss.maxHp-this.boss.hp));
    for(const attack of bossHitsBetween(previous,this.elapsed)){
      if(!dodging){this.world.player.hp=Math.max(0,this.world.player.hp-enemyHitDamage(this.world.save.floor,true,totalStats(this.world.save).defense)*(attack.kind==='slam'?1.6:1));this.world.player.hit=.35;}
    }
    this.defeated=this.world.player.hp<=0;this.finished=this.elapsed>=60||this.defeated;
  }
}
