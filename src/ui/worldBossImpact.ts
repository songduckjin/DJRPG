import {activeBossAttack} from '../game/worldBossPattern';
export type RockParticle={x:number;y:number;groundY:number;size:number;angle:number;alpha:number};
export type DustParticle={x:number;y:number;rx:number;ry:number;alpha:number};
// Deterministic velocities make each particle travel instead of repainting a static ground symbol.
export function slamParticles(age:number):{rocks:RockParticle[];dust:DustParticle[]} {
  const rocks:RockParticle[]=[],dust:DustParticle[]=[];
  if(age<0||age>=1.15)return {rocks,dust};
  for(let i=0;i<16;i++){
    const a=i*2.39996,speed=95+(i%5)*23,t=Math.max(0,age-(i%3)*.012),life=.7+(i%4)*.11;
    if(t>=life)continue;
    const groundY=Math.sin(a)*speed*t*.32,height=Math.max(0,(160+(i%4)*28)*t-310*t*t);
    rocks.push({x:Math.cos(a)*speed*t,y:groundY-height,groundY,size:4+i%4,angle:a+t*(i%2?8:-7),alpha:Math.min(1,(life-t)/.2)});
  }
  for(let i=0;i<14;i++){
    const t=age-i%4*.025;if(t<0)continue;
    const life=.8+i%3*.12;if(t>=life)continue;
    const a=i*2.39996,r=12+t*(70+i%4*14),fade=Math.min(1,t/.06)*(1-t/life);
    dust.push({x:Math.cos(a)*r,y:Math.sin(a)*r*.3-t*25,rx:8+t*32,ry:5+t*17,alpha:fade*.38});
  }
  return {rocks,dust};
}

// Share the combat clock so the warning ends at the actual slam hit, not its recovery.
export function slamWarning(seconds:number,reducedMotion=false):{fillAlpha:number;ringAlpha:number;glowAlpha:number;radiusX:number;radiusY:number}|null {
  const attack=activeBossAttack(seconds);
  if(attack?.kind!=='slam'||seconds>=attack.hit)return null;
  const pulse=reducedMotion ? .8 : .5+.5*Math.cos((seconds-attack.start)*Math.PI*8);
  return {fillAlpha:.06+.12*pulse,ringAlpha:.35+.65*pulse,glowAlpha:.08+.14*pulse,radiusX:115,radiusY:46};
}
