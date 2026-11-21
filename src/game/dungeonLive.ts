import {apiHeaders,isOutdatedResponse,reloadForNewVersion} from './appVersion';
import type {SaveSync} from './sync';
import type {Interface} from '../ui/interface';
import type {DungeonBattleSummary} from './dungeon/battle';
export type DungeonRecord={rank?:number;name:string;clearedFloor:number;clearedAt:number;mine?:boolean};
export type DungeonStanding={top:DungeonRecord[];mine?:DungeonRecord;total:number};
export type DungeonData={standing:DungeonStanding;guest:boolean;recorded:number;now:number};
/** `start`가 돌려주는 도전 한 건 — 서버 시각과 **시드**(작업 211). 클라이언트는 이 시드로 전투를 돌린다. */
export type DungeonStart={floor:number;startedAt:number;seed:number};
/** 서버가 내려준 순위를 이만큼은 그대로 쓴다(탭을 열 때마다 다시 부르지 않는다). */
const freshSeconds=10;
/** 마지막 클리어 요약을 담아 두는 세션 저장 키(새로고침 후 순위 재전송용). */
const clearKey='djrpg.dungeon.clear';
/**
 * 던전 순위의 서버 사본. 기록은 클라이언트가 보낸 층이 아니라 **계정 세이브에 저장된 최고층**에서
 * 서버가 다시 읽으므로, 먼저 저장을 확인한 뒤(`submit`) 기록을 요청한다.
 *
 * 작업 211: 층에 들어갈 때 서버가 시드를 주고(`begin`), 클리어하면 그 전투의 결과 요약(스텝 수·남은 체력·
 * digest)을 `submit`에 실어 보낸다. 서버는 같은 시드로 다시 돌려 그 층을 깰 수 있는지와 요약이 맞는지
 * 확인하므로, 시간만 흘려보내고 submit하는 요청은 통과하지 못한다.
 */
export class DungeonLive {
  data?:DungeonData;
  error='';
  loading=false;
  loadedAt=0;
  private loadPromise?:Promise<void>;
  /** 마지막으로 클리어한 층의 전투 요약 — 순위 전송이 실패했을 때 다시 보낼 수 있게 들고 있는다. */
  private lastClear?:{floor:number;summary:DungeonBattleSummary};
  constructor(readonly sync:SaveSync){
    // 새로고침해도 같은 탭이면 마지막 요약을 되살린다 — 전송이 실패한 클리어를 순위 탭에서 다시 보낼 수 있게.
    try{
      const raw=typeof sessionStorage==='undefined'?null:sessionStorage.getItem(clearKey);
      const saved=raw?JSON.parse(raw) as {floor?:unknown;summary?:DungeonBattleSummary}:null;
      if(saved&&Number.isInteger(Number(saved.floor))&&saved.summary&&typeof saved.summary==='object')this.lastClear={floor:Number(saved.floor),summary:saved.summary};
    }catch{}
  }
  /** 그 층의 전투 요약을 들고 있는지 — 없으면 순위 재전송을 시도하지 않는다(서버가 요약을 요구한다). */
  hasClear(floor:number):boolean{return this.lastClear?.floor===floor;}
  get guest():boolean{return this.sync.session.guest;}
  get fresh():boolean{return !!this.data&&Date.now()-this.loadedAt<freshSeconds*1000;}
  private async request(action:string,extra:Record<string,unknown>={}):Promise<DungeonData>{
    const response=await fetch('/api/dungeon',{method:'POST',headers:apiHeaders({Authorization:`Bearer ${this.sync.session.token}`}),body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(15000)});
    const data=await response.json();
    if(!response.ok){if(isOutdatedResponse(response.status,data.code,data.expected))reloadForNewVersion();throw Object.assign(new Error(data.error??'던전 순위에 연결하지 못했습니다.'),{code:data.code,status:response.status});}
    if(action!=='start'){this.data=data;this.loadedAt=Date.now();this.error='';}
    return data;
  }
  /** 층에 들어갈 때 서버에서 시드·시작 시각을 받는다 — 서버는 이 시각과 시드로 클리어를 검증한다(작업 209·210).
   *  게스트·네트워크 실패면 `undefined`를 주고, 화면은 로컬 시드로 전투를 돌린다(그 기록은 서버가 확인하지 못한다). */
  begin(floor:number):Promise<DungeonStart|undefined>{
    if(this.guest)return Promise.resolve(undefined);
    return this.request('start',{floor}).then(data=>{
      const start=data as unknown as Partial<DungeonStart>;
      const seed=Number(start.seed);
      return {floor:Number.isFinite(Number(start.floor))?Number(start.floor):floor,startedAt:Number.isFinite(Number(start.startedAt))?Number(start.startedAt):Date.now(),seed:Number.isFinite(seed)?seed>>>0:0};
    },()=>undefined);
  }
  /** 클리어한 층의 전투 요약을 기억해 둔다 — 순위 전송이 실패해 나중에 다시 보낼 때 그대로 싣는다. */
  rememberClear(floor:number,summary:DungeonBattleSummary):void{
    this.lastClear={floor,summary};
    try{if(typeof sessionStorage!=='undefined')sessionStorage.setItem(clearKey,JSON.stringify({floor,summary}));}catch{}
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
  async submit(floor?:number,summary?:DungeonBattleSummary):Promise<void>{
    if(this.guest)return;
    if(this.loading)await this.loadPromise;
    const record=summary??(floor!==undefined&&this.lastClear?.floor===floor?this.lastClear.summary:undefined);
    for(let attempt=0;attempt<3;attempt++){
      try{
        if(!await this.sync.flush()){this.error='진행 상황을 저장하지 못해 순위에 반영하지 못했습니다.';return;}
        await this.request('submit',record?{summary:record}:{});
        return;
      }catch(error){
        const code=error instanceof Error&&'code' in error?String((error as Error&{code?:unknown}).code??''):'';
        this.error=error instanceof Error?error.message:String(error);
        // 검증(도전 시작 시각·최소 클리어 시간)에 걸린 경우에만 서버 시계를 기다렸다가 다시 보낸다.
        // 전투 기록이 맞지 않으면(DUNGEON_SUMMARY_MISMATCH) 다시 보내도 같으므로 한 번만 알리고 멈춘다.
        if(code!=='DUNGEON_TOO_FAST'&&code!=='DUNGEON_NOT_STARTED')return;
        if(code==='DUNGEON_NOT_STARTED'&&floor)void this.begin(floor);
        await new Promise(resolve=>setTimeout(resolve,code==='DUNGEON_NOT_STARTED'?2000:12000));
      }
    }
  }
}
export function mountDungeonLive(ui:Interface):void{ui.dungeon.live=new DungeonLive(ui.market.sync);}
