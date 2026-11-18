import {activeBossAttack,bossIdleTime,bossSlamImpactAge} from '../game/worldBossPattern';
import type {BossStanding} from './worldBossPresentation';
export type BossMotion = 'idle' | 'attack' | 'slam';
export const BOSS_SHEETS = ['/assets/world-boss/valkaron-idle-hd-v1.png', '/assets/world-boss/valkaron-slash-hd-v2.png', '/assets/world-boss/valkaron-slam-rise-hd-v2.png', '/assets/world-boss/valkaron-slam-swing-hd-v2.png', '/assets/world-boss/valkaron-slam-impact-hd-v2.png'];
export const BOSS_ART = BOSS_SHEETS[0];
const footAnchors = [0.9482, 0.94595, 0.9482, 0.94595, 0.94808, 0.94808, 0.94808, 0.94808, 0.95045, 0.95495, 0.95045, 0.95045, 0.96388, 0.95711, 0.95937, 0.95485, 0.91216, 0.91216, 0.91216, 1.0, 0.93228, 0.93454, 0.93454, 0.93228, 0.97973, 0.97973, 0.97973, 0.97973, 0.96388, 0.96388, 0.96388, 0.9684, 0.91892, 0.91892, 0.91892, 0.90541, 0.90745, 0.90745, 0.90971, 0.90971];
export function frameSheet(frame:number):string {return BOSS_SHEETS[Math.floor(Math.max(0,Math.min(39,frame))/8)];}
export function footShift(frame:number):number {return .97-footAnchors[Math.max(0,Math.min(39,Math.floor(frame)))];}
const readySheets = new Set<string>();
const pendingSheets = new Map<string, Promise<void>>();
export function preloadBossSheets(): void {
  if(typeof Image==='undefined')return;
  for(const path of BOSS_SHEETS)if(!readySheets.has(path)&&!pendingSheets.has(path)){
    const image=new Image();
    const ready=new Promise<void>(resolve=>{
      image.onload=()=>{readySheets.add(path);resolve();};
      image.onerror=()=>{pendingSheets.delete(path);resolve();};
      image.src=path;
    });pendingSheets.set(path,ready);
  }
}
export function bossPose(seconds: number): {motion: BossMotion; frame: number; impact: boolean} {
  const attack=activeBossAttack(Math.max(0,seconds));
  if(attack?.kind==='slam'){
    const age=seconds-attack.start,recover=Math.max(0,Math.min(1,(seconds-attack.hit)/.87)),settle=recover*recover*(3-2*recover);
    const frame=age<.7?Math.min(7,Math.floor(age/.7*8)):age<1?8+Math.min(7,Math.floor((age-.7)/.3*8)):16+Math.min(7,Math.floor(settle*8));
    return {motion:'slam',frame:16+frame,impact:seconds>=attack.hit&&seconds<attack.hit+.24};
  }
  if(attack){const age=seconds-attack.start,frame=age<.55?Math.min(3,Math.floor(age/.55*4)):4+Math.min(3,Math.floor((seconds-attack.hit)/.65*4));return {motion:'attack',frame:8+frame,impact:false};}
  return {motion:'idle',frame:Math.floor((bossIdleTime(seconds)+1e-9)*5)%8,impact:false};
}
export function framePosition(frame: number): string {
  const safe = Math.max(0, Math.min(39, Math.floor(frame)));
  return `${safe % 4 / 3 * 100}% ${Math.floor(safe % 8 / 4) * 100}%`;
}
// Visual rehearsal only: no Save, participation counter, ranking or reward mutation.
export class WorldBossPreview {
  tab: 'challenge'|'ranking'|'rewards' = 'challenge';
  standing?:BossStanding;
  startedAt?: number;
  damage = 0;
  private stop?: () => void;
  start(now = performance.now()): void { this.startedAt=now; this.damage=0; }
  elapsed(now = performance.now()): number { return this.startedAt === undefined ? 0 : Math.min(60, Math.max(0,(now-this.startedAt)/1000)); }
  dispose(): void { this.stop?.(); this.stop=undefined; }
  animate(stage: HTMLElement, damagePerSecond: number): void {
    this.dispose(); preloadBossSheets(); let id=0; const origin=performance.now(); let live=true;
    const frame=() => {
      if(!live || !stage.isConnected)return;
      const elapsed=this.elapsed(),running=this.startedAt!==undefined && elapsed<60;
      const pose=bossPose(running?elapsed:(performance.now()-origin)/1000);
      const sprite=stage.querySelector<HTMLElement>('.wb-sprite');
      if(sprite){
        const path=frameSheet(pose.frame),shown=readySheets.has(path)?pose.frame:0;
        sprite.style.backgroundImage=`url('${frameSheet(shown)}')`;
        sprite.style.backgroundPosition=framePosition(shown);
        sprite.style.setProperty('--boss-foot-shift',`${footShift(shown)*100}%`);
      }
      stage.dataset.motion=pose.motion;stage.classList.toggle('wb-impact',pose.impact);
      stage.classList.toggle('wb-running',running);
      const warn=stage.querySelector<HTMLElement>('.wb-warning');if(warn)warn.hidden=pose.motion!=='slam'||pose.impact;
      const clock=stage.querySelector<HTMLElement>('.wb-clock');if(clock)clock.textContent=this.startedAt===undefined?'전투 시간 60초':`${Math.ceil(60-elapsed)}초`;
      if(this.startedAt!==undefined){
        this.damage=Math.floor(elapsed*Math.max(0,damagePerSecond));
        const amount=stage.querySelector<HTMLElement>('.wb-damage');if(amount)amount.textContent=this.damage.toLocaleString('ko-KR');
        const status=stage.querySelector<HTMLElement>('.wb-session-status');if(status)status.textContent=elapsed>=60?'연습 종료 · 기록은 저장되지 않습니다.':'전투 연습 중';
      }
      id=requestAnimationFrame(frame);
    };
    this.stop=()=>{live=false;cancelAnimationFrame(id);};id=requestAnimationFrame(frame);
  }
}

export function slamImpactAge(seconds:number):number|null {return bossSlamImpactAge(seconds);}
