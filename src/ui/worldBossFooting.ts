type Point={x:number;y:number};
export type FootPair=readonly [readonly [number,number],readonly [number,number]];
// Sole centers and bottom contact rows measured from opaque pixels; weapon fragments excluded.
export const bossFootContacts:Readonly<Record<number,FootPair>>={"0":[[0.402027,0.948198],[0.798423,0.93018]],"1":[[0.404063,0.948198],[0.800226,0.927928]],"2":[[0.405192,0.948198],[0.802483,0.93018]],"3":[[0.404279,0.948198],[0.800676,0.927928]],"4":[[0.402027,0.948081],[0.79955,0.930023]],"5":[[0.404063,0.948081],[0.800226,0.930023]],"6":[[0.405192,0.948081],[0.802483,0.927765]],"7":[[0.404279,0.948081],[0.800676,0.930023]],"32":[[0.329955,0.921171],[0.787162,0.905405]],"33":[[0.325056,0.921171],[0.788939,0.905405]],"34":[[0.299097,0.921171],[0.788939,0.905405]],"35":[[0.269144,0.905405],[0.786036,0.905405]],"36":[[0.274775,0.907449],[0.789414,0.907449]],"37":[[0.282167,0.907449],[0.788939,0.907449]],"38":[[0.332957,0.909707],[0.748307,0.907449]],"39":[[0.344595,0.909707],[0.737613,0.909707]],"40":[[0.383315,0.914318],[0.804397,0.914318]],"41":[[0.369786,0.914318],[0.758737,0.914318]]};
const smooth=(a:number,b:number,t:number):number=>{const v=Math.max(0,Math.min(1,(t-a)/(b-a)));return v*v*(3-2*v);};
export function plantedBossVertex(frame:number,x:number,y:number):Point {
  const source=bossFootContacts[frame];if(!source)return {x,y};
  const target=bossFootContacts[0],u=(x-source[0][0])/(source[1][0]-source[0][0]);
  const weight=smooth(.55,.86,y)*smooth(.14,.24,x)*(1-smooth(.93,1,x));
  const dx=(target[0][0]-source[0][0])*(1-u)+(target[1][0]-source[1][0])*u;
  const dy=(target[0][1]-source[0][1])*(1-u)+(target[1][1]-source[1][1])*u;
  return {x:x+dx*weight,y:y+dy*weight};
}
export function plantedBossShift(frame:number,fallback:number):number {return bossFootContacts[frame] ? .97-bossFootContacts[0][0][1] : fallback;}
