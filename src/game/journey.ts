import type { SaveSync } from './sync';
import type { World } from './world';
import { apiHeaders, isOutdatedResponse, reloadForNewVersion } from './appVersion';
export type JourneyTask = {id:string;name:string;category?:string;target:number;current:number;gold:number;books:number;claimed:boolean;completion?:boolean};
export type Mail = {id:string;title:string;sender:string;body:string;createdAt:number;expiresAt:number;expired:boolean;gold:number;books:number;claimedAt:number|null;read:boolean};
export type JourneyData = {daily:JourneyTask[];weekly:JourneyTask[];achievements:JourneyTask[];mail:Mail[];periods:{dailyEnd:number;weeklyEnd:number};now:number};
export class Journey {
  private generation=0;
  data?:JourneyData;
  busy=false;loading=false;error='';tab:'daily'|'weekly'='daily';
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
      if(!response.ok)throw new Error(data.error||'보상 목록을 불러오지 못했습니다.');if(generation===this.generation){this.data=data;this.error='';}
    }catch(error){if(generation===this.generation)this.error=error instanceof Error?error.message:String(error);}
    finally{if(generation===this.generation){this.loading=false;this.onChange();}}
  }
  async act(action:string,data:Record<string,unknown>={}):Promise<void>{
    if(this.busy)return;
    this.generation++;this.loading=false;
    this.busy=true;this.error='';this.onChange();
    try{
      const pending=this.sync.pendingMarket;
      if(pending&&!pending.action.startsWith('journey-'))throw new Error('거래소에서 이전 거래 결과를 먼저 확인하세요.');
      const result=await this.sync.mutate(pending?.action??action,pending?.data??data,pending?.requestId??crypto.randomUUID());
      this.world.player.hp=this.world.save.health;this.onMessage(result.message??'처리했습니다.');this.world.onChange();
    }catch(error){this.error=error instanceof Error?error.message:String(error);this.onMessage(this.error);}
    finally{this.busy=false;this.onChange();void this.load();}
  }
  ready(kind:'mail'|'rewards'|'achievements'):boolean{
    if(!this.data)return false;
    return kind==='mail'?this.data.mail.some(mail=>!mail.claimedAt&&!mail.expired):
      (kind==='rewards'?[...this.data.daily,...this.data.weekly]:this.data.achievements).some(task=>!task.claimed&&task.current>=task.target);
  }
}
