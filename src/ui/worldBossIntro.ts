import {BOSS_FRAME_COUNT} from './worldBossPreview';
// A short in-arena animation only. Camera and both actors remain in their combat positions.
const roarFeet=[.9482,.9482,.9482,.9482,.95034,.95034,.95034,.95034];
export class WorldBossIntro {
  elapsed=0;
  readonly roarDuration=2.7;
  readonly duration=3.8;
  get active():boolean{return this.elapsed<this.duration;}
  advance(seconds:number):number {
    const dt=Math.max(0,Math.min(.05,seconds)),remaining=this.duration-this.elapsed;
    const next=Math.min(this.duration,this.elapsed+dt);
    this.elapsed=this.duration-next<1e-9?this.duration:next;return Math.max(0,dt-remaining);
  }
  get frame():number {
    const t=this.elapsed/1.5;
    if(t<.2)return 0;
    if(t>=1.55)return Math.floor((this.elapsed-1.55*1.5+1e-9)*5)%8;
    if(t<.55)return BOSS_FRAME_COUNT+1+Math.min(2,Math.floor((t-.2)/.35*3));
    if(t<1.05)return BOSS_FRAME_COUNT+3+Math.min(1,Math.floor((t-.55)/.5*2));
    return BOSS_FRAME_COUNT+5+Math.min(2,Math.floor((t-1.05)/.5*3));
  }
  get idleCarry():number{return Math.max(0,this.duration-1.55*1.5);}
  get footShift():number{return this.frame>=BOSS_FRAME_COUNT?.97-roarFeet[this.frame-BOSS_FRAME_COUNT]:.0218;}
  get startCue():boolean{return this.elapsed>=this.roarDuration&&this.active;}
  get cueOpacity():number {return this.startCue?Math.max(0,Math.min(1,(this.elapsed-this.roarDuration)/.18,(this.duration-this.elapsed)/.3)):0;}
}
