export const BOSS_DEFEAT_SHEET='/assets/world-boss/valkaron-defeat-hd-v1.png';
const frameTimes=[0,.2,.45,.7,.98,1.25,1.55,1.85];
const swordX=[0,0,.245,.241,.234,.235,.238,.236];
const groundY=[.946,.946,.946,.946,.948,.948,.948,.950];
// Own presentation time only. A server-confirmed shared kill is the sole trigger.
export class WorldBossDefeat {
  started=false;elapsed=0;readonly duration=3.6;
  start(killed:boolean):boolean {if(!killed||this.started)return false;this.started=true;return true;}
  advance(dt:number):void {if(this.started)this.elapsed=Math.min(this.duration,this.elapsed+Math.max(0,Math.min(.05,dt)));}
  get finished():boolean{return this.started&&this.elapsed>=this.duration-1e-9;}
  get frame():number {let frame=0;for(let i=1;i<frameTimes.length;i++)if(this.elapsed>=frameTimes[i])frame=i;return frame;}
  get notice():boolean{return this.started&&this.elapsed>=2.25&&!this.finished;}
  get noticeOpacity():number{return this.notice?Math.min(1,(this.elapsed-2.25)/.2,(this.duration-this.elapsed)/.2):0;}
  get impactAge():number|null {const age=this.elapsed-.45;return this.started&&age>=0&&age<1.15?age:null;}
}
export function defeatFrameOffset(frame:number):{x:number;y:number}{
  const i=Math.max(0,Math.min(7,Math.floor(frame)));
  return {x:i>=2?.245-swordX[i]:0,y:.97-groundY[i]};
}
