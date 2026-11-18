export type BossAttack={kind:'attack'|'slam';start:number;hit:number;end:number};
export const SLAM_TIMES=[15,30,45] as const;
const slams:BossAttack[]=SLAM_TIMES.map(hit=>({kind:'slam',start:hit-1,hit,end:hit+.87}));
const normal:BossAttack[]=[];
for(let hit=5;hit<60;hit+=5){
  // Postpone a clashing normal attack; the five-second interval resumes from that time.
  const clash=slams.find(s=>hit+.65>s.start+1e-9&&hit-.55<s.hit+2-1e-9);
  if(clash)hit=clash.hit+2+.55;
  normal.push({kind:'attack',start:Math.round((hit-.55)*100)/100,hit,end:Math.round((hit+.65)*100)/100});
}
export const bossAttacks:readonly BossAttack[]=[...normal,...slams].sort((a,b)=>a.start-b.start);
export function activeBossAttack(seconds:number):BossAttack|undefined{return bossAttacks.find(a=>seconds>=a.start&&seconds<a.end);}
export function bossHitsBetween(from:number,to:number):BossAttack[]{return bossAttacks.filter(a=>a.hit>from+1e-9&&a.hit<=to+1e-9);}
export function bossIdleTime(seconds:number):number {
  let end=0;for(const a of bossAttacks)if(a.end<=seconds&&a.end>end)end=a.end;return Math.max(0,seconds-end);
}
export function bossSlamImpactAge(seconds:number):number|null {
  const hit=SLAM_TIMES.find(t=>seconds>=t&&seconds<t+1.15);return hit===undefined?null:seconds-hit;
}
