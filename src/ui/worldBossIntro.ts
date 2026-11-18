const smooth=(a:number,b:number,t:number):number=>{const p=Math.max(0,Math.min(1,(t-a)/(b-a)));return p*p*(3-2*p);};
// Fog, camera and UI all share this one clock. Combat receives only time after the intro.
export class WorldBossIntro {
  elapsed=0;
  readonly duration=4;
  get active():boolean{return this.elapsed<this.duration;}
  skip():void{this.elapsed=this.duration;}
  advance(seconds:number):number {
    const dt=Math.max(0,Math.min(.05,seconds)),remaining=this.duration-this.elapsed;
    this.elapsed=Math.min(this.duration,this.elapsed+dt);return Math.max(0,dt-remaining);
  }
  get focus():number{return 1-smooth(1.5,3.65,this.elapsed);}
  get fog():number{return 1-smooth(.2,1.3,this.elapsed);}
  get faceDetail():number{return 1-smooth(1.8,2.8,this.elapsed);}
  get bodyAlpha():number{return 1-smooth(3.65,4,this.elapsed);}
  get playerAlpha():number{return smooth(2.7,3.55,this.elapsed);}
  get hudAlpha():number{return smooth(3.6,4,this.elapsed);}
  get startCue():boolean{return this.elapsed>=3.45;}
  camera(width:number,height:number):{zoom:number;x:number;y:number} {
    const focus=this.focus;
    if(focus===0)return {zoom:1,x:0,y:height*.07};
    const zoom=1+3.2*focus,bodyHeight=Math.min(width*.82,height*.39)*.96;
    const faceX=width/2+bodyHeight*(2/3)*(550/1024-.5);
    const faceY=height/2+bodyHeight/.96*.02-bodyHeight*.97+bodyHeight*(190/1536);
    return {zoom,x:(width/2-faceX*zoom)*focus,y:(height*.43-faceY*zoom)*focus+height*.07*(1-focus)};
  }
}
