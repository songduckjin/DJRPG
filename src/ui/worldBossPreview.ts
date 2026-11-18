export type BossMotion = 'idle' | 'attack' | 'slam';
export const BOSS_ART = '/assets/world-boss/valkaron-v1.png';
export function bossPose(seconds: number): {motion: BossMotion; frame: number; impact: boolean} {
  const phase = Math.max(0, seconds) % 12;
  if (phase >= 9) {
    const frame = Math.min(15, Math.floor((phase - 9) / 3 * 16));
    return {motion:'slam', frame:16 + frame, impact:frame >= 9 && frame <= 11};
  }
  if (phase >= 4 && phase < 5.2) return {motion:'attack', frame:8 + Math.min(7, Math.floor((phase - 4) / 1.2 * 8)), impact:false};
  return {motion:'idle', frame:Math.floor(seconds * 5) % 8, impact:false};
}
export function framePosition(frame: number): string {
  const safe = Math.max(0, Math.min(31, Math.floor(frame)));
  return `${safe % 8 / 7 * 100}% ${Math.floor(safe / 8) / 3 * 100}%`;
}
// Visual rehearsal only: no Save, participation counter, ranking or reward mutation.
export class WorldBossPreview {
  tab: 'challenge'|'ranking'|'rewards' = 'challenge';
  startedAt?: number;
  damage = 0;
  private stop?: () => void;
  start(now = performance.now()): void { this.startedAt=now; this.damage=0; }
  elapsed(now = performance.now()): number { return this.startedAt === undefined ? 0 : Math.min(60, Math.max(0,(now-this.startedAt)/1000)); }
  dispose(): void { this.stop?.(); this.stop=undefined; }
  animate(stage: HTMLElement, damagePerSecond: number): void {
    this.dispose(); let id=0; const origin=performance.now(); let live=true;
    const frame=() => {
      if(!live || !stage.isConnected)return;
      const elapsed=this.elapsed(),running=this.startedAt!==undefined && elapsed<60;
      const pose=bossPose(running?elapsed:(performance.now()-origin)/1000);
      const sprite=stage.querySelector<HTMLElement>('.wb-sprite');
      if(sprite)sprite.style.backgroundPosition=framePosition(pose.frame);
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
