// A short in-arena animation only. Camera and both actors remain in their combat positions.
const roarFeet=[.9482,.9482,.9482,.9482,.95034,.95034,.95034,.95034];
export class WorldBossIntro {
  elapsed=0;
  readonly duration=2.7;
  get active():boolean{return this.elapsed<this.duration;}
  advance(seconds:number):number {
    const dt=Math.max(0,Math.min(.05,seconds)),remaining=this.duration-this.elapsed;
    this.elapsed=Math.min(this.duration,this.elapsed+dt);return Math.max(0,dt-remaining);
  }
  get frame():number {
    const t=this.elapsed/1.5;
    if(t<.2||t>=1.55)return 0;
    if(t<.55)return 41+Math.min(2,Math.floor((t-.2)/.35*3));
    if(t<1.05)return 43+Math.min(1,Math.floor((t-.55)/.5*2));
    return 45+Math.min(2,Math.floor((t-1.05)/.5*3));
  }
  get footShift():number{return this.frame>=40?.97-roarFeet[this.frame-40]:.0218;}
  get startCue():boolean{return this.elapsed>=1.55*1.5;}
}
