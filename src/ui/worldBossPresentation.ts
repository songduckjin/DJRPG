export type BossRank = {rank:number;name:string;damage:number;mine?:boolean};
export type BossStanding = {top:BossRank[];mine?:BossRank;nearMine?:BossRank[]};
export const bossRewardTiers=[
 {id:'first',label:'1위',range:'rank',min:1,max:1,gold:10000,pouches:4},
 {id:'podium',label:'2~3위',range:'rank',min:2,max:3,gold:8000,pouches:3},
 {id:'top-ten',label:'4~10위',range:'rank',min:4,max:10,gold:6000,pouches:2},
 {id:'top-fifty',label:'11~50위',range:'rank',min:11,max:50,gold:4000,pouches:1},
 {id:'top-hundred',label:'51~100위',range:'rank',min:51,max:100,gold:3000,pouches:1},
 {id:'participation',label:'101위 이하 공통',range:'rank',min:101,max:Infinity,gold:2000,pouches:1}
] as const;
export function myRewardTier(rank?:number):string|undefined {
 if(rank===undefined||!Number.isInteger(rank)||rank<1)return;
 return bossRewardTiers.find(t=>rank>=t.min&&rank<=t.max)?.id;
}
export function topTen(standing?:BossStanding):BossRank[]{return [...(standing?.top??[])].filter(r=>Number.isInteger(r.rank)&&r.rank>=1&&r.rank<=10).sort((a,b)=>a.rank-b.rank).slice(0,10);}
