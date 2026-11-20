import {apiHeaders,isOutdatedResponse,reloadForNewVersion} from './appVersion';
import type {SaveSync} from './sync';
import type {Interface} from '../ui/interface';
export type DungeonRecord={rank?:number;name:string;clearedFloor:number;clearedAt:number;mine?:boolean};
export type DungeonStanding={top:DungeonRecord[];mine?:DungeonRecord;total:number};
export type DungeonData={standing:DungeonStanding;guest:boolean;recorded:number;now:number};
/** 서버가 내려준 순위를 이만큼은 그대로 쓴다(탭을 열 때마다 다시 부르지 않는다). */
const freshSeconds=10;
/**
 * 던전 순위의 서버 사본. 기록은 클라이언트가 보낸 층이 아니라 **계정 세이브에 저장된 최고층**에서
 * 서버가 다시 읽으므로, 먼저 저장을 확인한 뒤(`submit`) 기록을 요청한다.
 */
export class DungeonLive {
  data?:DungeonData;
  error='';
  loading=false;
  loadedAt=0;
  private loadPromise?:Promise<void>;
  constructor(readonly sync:SaveSync){}
  get guest():boolean{return this.sync.session.guest;}
  get fresh():boolean{return !!this.data&&Date.now()-this.loadedAt<freshSeconds*1000;}
  private async request(action:string,extra:Record<string,unknown>={}):Promise<DungeonData>{
    const response=await fetch('/api/dungeon',{method:'POST',headers:apiHeaders({Authorization:`Bearer ${this.sync.session.token}`}),body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(15000)});
    const data=await response.json();
    if(!response.ok){if(isOutdatedResponse(response.status,data.code,data.expected))reloadForNewVersion();throw Object.assign(new Error(data.error??'던전 순위에 연결하지 못했습니다.'),{code:data.code,status:response.status});}
    if(action!=='start'){this.data=data;this.loadedAt=Date.now();this.error='';}
    return data;
  }
  /** 층에 들어갈 때 서버에 도전 시작을 알린다 — 서버는 이 서버 시각으로 클리어 시간을 검증한다(작업 209).
   *  실패해도 화면은 그대로 두고, 다음 `submit`에서 서버가 시작 기록이 없다고 하면 한 번 더 알린다. */
  enter(floor:number):Promise<void>{
    if(this.guest)return Promise.resolve();
    return this.request('start',{floor}).then(()=>{},()=>{});
  }
  /** 순위를 불러온다. 실패는 `error`로 남겨 로비가 안내만 하고 화면은 그대로 둔다. */
  load(force=false):Promise<void>{
    if(!force&&this.fresh)return Promise.resolve();
    if(this.loadPromise)return this.loadPromise;
    this.loading=true;
    this.loadPromise=this.request('list').then(()=>{},error=>{this.error=error instanceof Error?error.message:String(error);}).finally(()=>{this.loading=false;this.loadPromise=undefined;});
    return this.loadPromise;
  }
  /** 진행을 먼저 저장하고, 서버가 그 세이브에서 최고층을 읽어 검증한 뒤 순위에 올린다. */
  async submit(floor?:number):Promise<void>{
    if(this.guest)return;
    if(this.loading)await this.loadPromise;
    for(let attempt=0;attempt<3;attempt++){
      try{
        if(!await this.sync.flush()){this.error='진행 상황을 저장하지 못해 순위에 반영하지 못했습니다.';return;}
        await this.request('submit');
        return;
      }catch(error){
        const code=error instanceof Error&&'code' in error?String((error as Error&{code?:unknown}).code??''):'';
        this.error=error instanceof Error?error.message:String(error);
        // 검증(도전 시작 시각·최소 클리어 시간)에 걸린 경우에만 서버 시계를 기다렸다가 다시 보낸다.
        if(code!=='DUNGEON_TOO_FAST'&&code!=='DUNGEON_NOT_STARTED')return;
        if(code==='DUNGEON_NOT_STARTED'&&floor)void this.enter(floor);
        await new Promise(resolve=>setTimeout(resolve,code==='DUNGEON_NOT_STARTED'?2000:12000));
      }
    }
  }
}
export function mountDungeonLive(ui:Interface):void{ui.dungeon.live=new DungeonLive(ui.market.sync);}
