// Normalized banner regions exclude poles and the rest of the painted arena.
export function bannerOffset(x:number,y:number,time:number):{x:number;y:number} {
  const left=x>.115&&x<.215&&y>.195&&y<.335;
  const right=x>.913&&x<.994&&y>.23&&y<.355;
  if(!left&&!right)return {x:0,y:0};
  const v=(y-(left?.195:.23))/(left?.14:.125),phase=time*1.9-v*5+(left?0:1.7);
  const sway=Math.pow(Math.max(0,v),1.3);
  return {x:Math.sin(phase)*8*sway,y:Math.cos(phase*.85)*2*sway};
}
export function cloudCenter(index:number,time:number,width:number):number {
  const span=width*1.8;
  return ((index*width*.43+time*width*.025)%span+span)%span-width*.4;
}
