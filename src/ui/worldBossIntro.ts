// Introduction time never advances combat. Crossing the boundary passes only the remainder.
export class WorldBossIntro {
  elapsed=0;
  readonly duration=3;
  get active():boolean{return this.elapsed<this.duration;}
  skip():void{this.elapsed=this.duration;}
  advance(seconds:number):number {
    const dt=Math.max(0,Math.min(.05,seconds)),remaining=this.duration-this.elapsed;
    this.elapsed=Math.min(this.duration,this.elapsed+dt);return Math.max(0,dt-remaining);
  }
  get focus():number {
    const t=this.elapsed;return t<.6?t/.6:t<2.25?1:Math.max(0,(3-t)/.75);
  }
  get frame():number {
    const t=this.elapsed;
    if(t<.55)return 0;if(t<1.15)return Math.min(3,Math.floor((t-.55)/.6*4));
    if(t<1.95)return 3+Math.floor((t-1.15)*5)%2;
    return Math.min(7,5+Math.floor((t-1.95)/.75*3));
  }
}
