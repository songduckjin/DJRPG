import {World, type Enemy, enemyMaxHp, enemyHitDamage} from '../game/world';
import {skillDamageScale,skills} from '../game/skills';
import {totalStats,skillLevel,type Save} from '../game/store';
// Temporary encounter-observation balance, not the eventual fixed progression curve.
export function dungeonPreviewHp(save:Save):number {
  const stats=totalStats(save);
  const powers={slash2:2.15,spin:5,crushing:4.5,slam:5,warcry:2,power:4,destroy:2.7,hell:7};
  const skillDps=save.quickSlots.reduce<number>((sum,id)=>id&&save.learned.includes(id)?sum+powers[id]*skillDamageScale(skillLevel(save,id))/skills[id].cooldown:sum,0);
  const dps=stats.attack*((1+stats.speed/100)/.48+skillDps)*(1+stats.crit/100);
  return Math.max(enemyMaxHp(1,false),Math.ceil(dps*8));
}
class DungeonWorld extends World {
  slain=0;
  // Defend the central position instead of chasing the previous wave's spawn point.
  override update(dt:number):void {
    this.player.x=50;this.player.y=50;
    super.update(dt);
    this.player.x=50;this.player.y=50;this.activeMove={x:0,y:0};
  }
  override nearest():Enemy|undefined {
    const enemy=super.nearest();
    return enemy&&Math.hypot(enemy.x-this.player.x,enemy.y-this.player.y)<=110?enemy:undefined;
  }
  override kill(enemy:Enemy):void { this.slain++;this.effects.push({x:enemy.x,y:enemy.y,kind:'death',age:0,duration:.7,angle:0}); }
}
/** Isolated first-floor preview. Never mutates account save, drops, rewards or rankings. */
export class DungeonBattle {
  readonly world:DungeonWorld;
  elapsed=0;wave=0;waveStarted=0;finished=false;outcome:'clear'|'dead'|'timeout'|null=null;
  elite?:Enemy;private hitCooldown=0;
  constructor(save:Save){const copy=structuredClone(save);copy.floor=1;copy.floorKills=0;copy.tutorial=3;copy.autoClimb=false;
    this.world=new DungeonWorld(copy);this.world.enemies=[];this.world.spawnTimer=Infinity;this.world.bossPending=false;
    this.world.player.hp=totalStats(copy).health;this.world.player.x=50;this.world.player.y=50;this.spawnWave();
  }
  private spawnWave():void {
    this.wave++;this.waveStarted=this.elapsed;
    const count=this.wave===3?1:3;
    for(let i=0;i<count;i++){
      const hp=dungeonPreviewHp(this.world.save)*(this.wave===3?3:1), side=(i-(count-1)/2)*65;
      const enemy:Enemy={x:(-180+side)/2,y:(-180-side)/2,hp,maxHp:hp,boss:false,hit:0,step:0,moving:false,knockX:0,knockY:0,slow:0};
      this.world.enemies.push(enemy);if(this.wave===3)this.elite=enemy;
    }
  }
  advance(seconds:number):void {
    if(this.finished)return;const dt=Math.min(.05,Math.max(0,seconds),90-this.elapsed);this.elapsed+=dt;
    // Suppress the main field's immediate revive; this session owns defeat and retry.
    const hit=this.world.player.hit;this.world.player.hit=Infinity;
    try{this.world.update(dt);}finally{this.world.player.hit=Math.max(0,hit-dt);}
    this.hitCooldown=Math.max(0,this.hitCooldown-dt);
    if(this.hitCooldown===0){const enemy=this.world.enemies.find(e=>Math.hypot(e.x-this.world.player.x,e.y-this.world.player.y)<36);
      if(enemy){this.world.player.hp=Math.max(0,this.world.player.hp-Math.min(enemyHitDamage(1,false,totalStats(this.world.save).defense)*(enemy===this.elite?2:1),totalStats(this.world.save).health*(enemy===this.elite?.03:.018)));this.world.player.hit=.25;this.hitCooldown=.9;}}
    if(this.world.player.hp<=0)this.outcome='dead';
    else if(this.wave===3&&!this.world.enemies.length)this.outcome='clear';
    else if(this.elapsed>=90)this.outcome='timeout';
    if(this.outcome){this.finished=true;return;}
    if(this.wave<3&&(this.elapsed-this.waveStarted>=10||!this.world.enemies.length))this.spawnWave();
  }
}
