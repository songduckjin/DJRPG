import {bossHitsBetween} from './worldBossPattern';
import {World, type Enemy, ENEMY_STRIKE_SECONDS, enemyHitDamage} from './world';
import {totalStats,type Save} from './store';
import {effectiveExtraOptions} from './extraOptions';
import {seededRandom, type Random} from './rng';
/** 회피 굴림의 시드 — 클라이언트 연습과 서버 리플레이가 **같은 순서의 회피**를 보도록 고정한다
 *  (서버는 `replayBoss`로 같은 클래스를 다시 돌린다). */
export const REHEARSAL_EVASION_SEED = 0x5eed;
/** 치명타 굴림의 시드(작업 245) — 회피와 같은 이유로 고정한다. 서버가 같은 전투를 다시 돌릴 때
 *  플레이어의 치명타가 같은 순서로 터져야 누적 피해량이 클라이언트와 일치한다. */
export const REHEARSAL_CRIT_SEED = 0xc217;

// This world owns a deep copy. No callbacks, loot, ranking or real-account writes.
export class WorldBossRehearsal {
  readonly world:World;
  readonly boss:Enemy;
  elapsed=0;damage=0;finished=false;defeated=false;
  dodgeCooldown=0;
  dodgeRemaining=0;
  /** 추가옵션 회피율(작업 238) 굴림 — 세션마다 같은 시드에서 시작한다. */
  private chance:Random=seededRandom(REHEARSAL_EVASION_SEED);
  /** 치명타(작업 245) 굴림 — 서버 재계산과 같은 순서가 되도록 별도 시드로 돌린다. */
  private critChance:Random=seededRandom(REHEARSAL_CRIT_SEED);
  evaded:number=0;
  dodge():boolean {
    if(this.finished||this.dodgeCooldown>0)return false;
    this.dodgeCooldown=4;this.dodgeRemaining=.45;return true;
  }
  constructor(save:Save){
    const copy=structuredClone(save);copy.tutorial=3;copy.floorKills=0;
    this.world=new World(copy);this.world.spawnTimer=Infinity;this.world.bossPending=false;
    // 치명타도 서버 재계산과 같은 순서로 — 이 전투의 굴림만 시드 난수를 쓴다(작업 245).
    this.world.critRoll=()=>this.critChance();
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
      if(dodging)continue;
      // 추가옵션 회피율(작업 238) — 성공하면 그 타격을 통째로 피한다. 굴림은 세션 시드로 고정되어
      // 서버 리플레이가 같은 값을 본다(월드보스 점수는 서버가 다시 계산한 피해를 쓴다).
      const evasion=effectiveExtraOptions(this.world.save.equipment).evasionPct;
      if(evasion>0&&this.chance()<evasion/100){this.evaded++;continue;}
      this.boss.attack=ENEMY_STRIKE_SECONDS;
      this.world.player.hp=Math.max(0,this.world.player.hp-enemyHitDamage(this.world.save.floor,true,totalStats(this.world.save).defense)*(attack.kind==='slam'?1.6:1));this.world.player.hit=.35;
    }
    this.defeated=this.world.player.hp<=0;this.finished=this.elapsed>=60||this.defeated;
  }
}
