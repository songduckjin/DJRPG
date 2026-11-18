export type BossRank = {rank:number;name:string;damage:number;mine?:boolean};
export type BossStanding = {top:BossRank[];mine?:BossRank};
export const bossRewardTiers=[
 {id:'first',label:'1위',range:'rank',min:1,max:1,gold:50000,books:10},
 {id:'podium',label:'2~3위',range:'rank',min:2,max:3,gold:30000,books:7},
 {id:'top-ten',label:'4~10위',range:'rank',min:4,max:10,gold:20000,books:5},
 {id:'participation',label:'11위 이하 참여자',range:'rank',min:11,max:Infinity,gold:5000,books:2}
] as const;
export function myRewardTier(rank?:number):string|undefined {
 if(rank===undefined||!Number.isInteger(rank)||rank<1)return;
 return bossRewardTiers.find(t=>rank>=t.min&&rank<=t.max)?.id;
}
export function topTen(standing?:BossStanding):BossRank[]{return [...(standing?.top??[])].filter(r=>Number.isInteger(r.rank)&&r.rank>=1&&r.rank<=10).sort((a,b)=>a.rank-b.rank).slice(0,10);}
