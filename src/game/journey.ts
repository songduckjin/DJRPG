import type { SaveSync } from './sync';
import type { World } from './world';
import { apiHeaders, isOutdatedResponse, reloadForNewVersion } from './appVersion';
export type JourneyTask = {id:string;name:string;category?:string;target:number;current:number;gold:number;books:number;/** 무작위 보물 주머니 수량(작업 207) — 전체 완료 보상에만 붙는다. */pouches?:number;claimed:boolean;completion?:boolean};
export type Mail = {id:string;title:string;sender:string;body:string;createdAt:number;expiresAt:number|null;expired:boolean;gold:number;books:number;pouches?:number;diamonds?:number;claimedAt:number|null;read:boolean};
export type JourneyData = {daily:JourneyTask[];weekly:JourneyTask[];achievements:JourneyTask[];mail:Mail[];periods:{dailyEnd:number;weeklyEnd:number};now:number;/** 거래소 수령함에 남은 건수(작업 247) — 거래소 아이콘 빨간 점이 이 값으로 켜진다. */marketInbox?:number};
export class Journey {
  private generation=0;
  data?:JourneyData;
  busy=false;loading=false;error='';tab:'daily'|'weekly'='daily';
  /** `marketInbox`를 마지막으로 확인한 시각(작업 247) — 거래소 아이콘 빨간 점이 거래소 자체 값과 비교해 고른다. */
  inboxAt=0;
  onChange:()=>void=()=>{};onMessage:(message:string)=>void=()=>{};
  constructor(public sync:SaveSync,private world:World){}
  async load():Promise<void>{
    if(this.loading||this.busy||this.sync.locked||this.sync.pendingMarket)return;
    const generation=++this.generation;
    this.loading=true;this.onChange();
    try{
      const response=await fetch('/api/market',{method:'POST',headers:apiHeaders({Authorization:`Bearer ${this.sync.session.token}`}),body:JSON.stringify({action:'journey-list'})});
      const data=await response.json();
      if(isOutdatedResponse(response.status,data.code,data.expected)){reloadForNewVersion();return;}
      if(!response.ok)throw new Error(data.error||'보상 목록을 불러오지 못했습니다.');if(generation===this.generation){this.data=data;this.error='';if(typeof data.marketInbox==='number')this.inboxAt=Date.now();}
    }catch(error){if(generation===this.generation)this.error=error instanceof Error?error.message:String(error);}
    finally{if(generation===this.generation){this.loading=false;this.onChange();}}
  }
  async act(action:string,data:Record<string,unknown>={}):Promise<void>{
    if(this.busy)return;
    this.generation++;this.loading=false;
    this.busy=true;this.error='';this.onChange();
    let refreshed=false;
    try{
      const pending=this.sync.pendingMarket;
      if(pending&&!pending.action.startsWith('journey-'))throw new Error('거래소에서 이전 거래 결과를 먼저 확인하세요.');
      const result=await this.sync.mutate(pending?.action??action,pending?.data??data,pending?.requestId??crypto.randomUUID());
      if(result.journey){
        // 수령 응답에는 `marketInbox`가 없다(작업 247) — 직전 폴링 값을 이어 받아 거래소 빨간 점이 깜빡이지 않게 한다.
        const carried=result.journey.marketInbox??this.data?.marketInbox;
        if(carried!==undefined&&result.journey.marketInbox===undefined)result.journey.marketInbox=carried;
        this.data=result.journey;refreshed=true;
      }
      this.world.player.hp=this.world.save.health;this.onMessage(result.message??'처리했습니다.');
    }catch(error){this.error=error instanceof Error?error.message:String(error);this.onMessage(this.error);}
    finally{this.busy=false;this.onChange();if(!refreshed)void this.load();}
  }
  ready(kind:'mail'|'rewards'|'achievements'):boolean{
    if(!this.data)return false;
    return kind==='mail'?this.data.mail.some(mail=>!mail.claimedAt&&!mail.expired):
      (kind==='rewards'?[...this.data.daily,...this.data.weekly]:this.data.achievements).some(task=>!task.claimed&&task.current>=task.target);
  }
}
