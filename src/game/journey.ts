import type { SaveSync, SyncResult } from './sync';
import type { World } from './world';
import { apiHeaders, isOutdatedResponse, OUTDATED_MESSAGE, reloadForNewVersion } from './appVersion';
export type JourneyTask = {id:string;name:string;category?:string;target:number;current:number;gold:number;books:number;/** 무작위 보물 주머니 수량(작업 207) — 전체 완료 보상에만 붙는다. */pouches?:number;claimed:boolean;completion?:boolean};
export type Mail = {id:string;title:string;sender:string;body:string;createdAt:number;expiresAt:number|null;expired:boolean;gold:number;books:number;pouches?:number;diamonds?:number;claimedAt:number|null;read:boolean};
export type JourneyData = {daily:JourneyTask[];weekly:JourneyTask[];achievements:JourneyTask[];mail:Mail[];periods:{dailyEnd:number;weeklyEnd:number};now:number;/** 거래소 수령함에 남은 건수(작업 247) — 거래소 아이콘 빨간 점이 이 값으로 켜진다. */marketInbox?:number};
/** 서버가 트랜잭션에 들어가기 전에 거절한 코드 — `pendingJourney`를 남기지 않는다(작업 260). */
const transactionSkippedCodes = ['DB_UNAVAILABLE', 'DB_NOT_CONFIGURED'];
const sessionErrorCodes = ['SESSION_REPLACED', 'INVALID_TOKEN', 'UNAUTHORIZED'];
/** 요청 한 번의 응답 대기 상한 — 응답이 없으면 결과 미확인으로 다루고 '수령 결과 다시 확인'을 남긴다. */
const requestTimeoutMs = 10_000;
/**
 * 여정(우편함·일일/주간 보상·업적) 클라이언트 — 자기 경로(`/api/journey`)와 자기 대기 상태를 쓴다(작업 260 · 설계서 PR-5).
 *
 * 예전에는 `SaveSync.mutate`(거래소 경로)로 보내고 `sync.pendingMarket`에 대기를 실었다. 그래서
 *  ① 거래소 요청이 결과를 확인하지 못한 채 남으면 우편 `받기`·`모두 받기`까지 함께 잠겼고(제보 `#20869`),
 *  ② 가방 40칸 초과로 저장이 거절되면 `flush`가 계속 실패해 두 도메인이 함께 막혔으며,
 *  ③ 거래소와 우편이 같은 멱등 표·라우팅을 써서 한쪽 배포·부하가 다른 쪽 버튼을 잠갔다.
 * 이제 여정은 **자기 `requestId`·revision·대기(`sync.pendingJourney`)** 로 `/api/journey`를 부르고,
 * 거래소 대기와 서로를 잠그지 않는다(거래소 대기 중에도 보상 수령이 된다).
 */
export class Journey {
  private generation=0;
  data?:JourneyData;
  busy=false;loading=false;error='';tab:'daily'|'weekly'='daily';
  /** `marketInbox`를 마지막으로 확인한 시각(작업 247) — 거래소 아이콘 빨간 점이 거래소 자체 값과 비교해 고른다. */
  inboxAt=0;
  onChange:()=>void=()=>{};onMessage:(message:string)=>void=()=>{};
  constructor(public sync:SaveSync,private world:World){}
  /** 결과를 확인하지 못한 여정 요청 — 있으면 `retry()`가 같은 본문·같은 `requestId`로 다시 보낸다. */
  get pending(){return this.sync.pendingJourney;}
  /**
   * 목록·보상 조회. 읽기만 하므로 거래소 요청(`sync.locked`)이나 결과 미확인 거래(`pendingMarket`) 때문에
   * 멈추지 않는다 — 예전에는 그 둘을 이유로 조용히 반환해 우편함이 옛 목록에 머물렀다(작업 260).
   */
  async load():Promise<void>{
    if(this.loading||this.busy)return;
    const generation=++this.generation;
    this.loading=true;this.onChange();
    try{
      const response=await fetch('/api/journey',{method:'POST',headers:apiHeaders({Authorization:`Bearer ${this.sync.session.token}`}),body:JSON.stringify({action:'journey-list'})});
      const data=await response.json();
      if(isOutdatedResponse(response.status,data.code,data.expected)){reloadForNewVersion();return;}
      if(!response.ok)throw new Error(data.error||'보상 목록을 불러오지 못했습니다.');if(generation===this.generation){this.data=data;this.error='';if(typeof data.marketInbox==='number')this.inboxAt=Date.now();}
    }catch(error){if(generation===this.generation)this.error=error instanceof Error?error.message:String(error);}
    finally{if(generation===this.generation){this.loading=false;this.onChange();}}
  }
  /** 결과를 확인하지 못한 요청을 같은 본문으로 다시 보낸다 — 화면의 '수령 결과 다시 확인' 버튼이 부른다. */
  async retry():Promise<void>{
    const pending=this.sync.pendingJourney;
    await this.act(pending?.action??'journey-claim',pending?.data??{});
  }
  async act(action:string,data:Record<string,unknown>={}):Promise<void>{
    if(this.busy)return;
    this.generation++;this.loading=false;
    this.busy=true;this.error='';this.onChange();
    let refreshed=false;
    try{
      await this.sync.beginJourney();
      // 결과를 확인하지 못한 요청이 있으면 그 본문·requestId 그대로 다시 보낸다 — 서버가 이미 처리했으면
      // 저장된 응답을 돌려주므로(멱등) 보상이 두 번 들어가지 않는다.
      const pending=this.sync.pendingJourney??(this.sync.pendingJourney={action,data,requestId:crypto.randomUUID(),...this.sync.journeySnapshot()});
      const result=await this.send(pending);
      if(result.journey){
        // 수령 응답에는 `marketInbox`가 없다(작업 247) — 직전 폴링 값을 이어 받아 거래소 빨간 점이 깜빡이지 않게 한다.
        const carried=result.journey.marketInbox??this.data?.marketInbox;
        if(carried!==undefined&&result.journey.marketInbox===undefined)result.journey.marketInbox=carried;
        this.data=result.journey;refreshed=true;
      }
      this.world.player.hp=this.world.save.health;this.onMessage(result.message??'처리했습니다.');
    }catch(error){this.reportFailure(error);}
    finally{this.sync.finishJourney();this.busy=false;this.onChange();if(!refreshed)void this.load();}
  }
  /** `/api/journey` 한 번 — 응답을 받은 실패는 `status`·`code`를 실어 던지고, 못 받은 실패는 같은 본문으로 다시 보낸다. */
  private async send(pending:NonNullable<SaveSync['pendingJourney']>):Promise<SyncResult>{
    for(let attempt=0;attempt<3;attempt++){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),requestTimeoutMs);
      try{
        const response=await fetch('/api/journey',{method:'POST',headers:apiHeaders({Authorization:`Bearer ${this.sync.session.token}`}),body:JSON.stringify({action:pending.action,...pending.data,requestId:pending.requestId,revision:pending.revision,progress:pending.progress,characterSlot:this.sync.session.characterSlot}),signal:controller.signal});
        const body=await response.json();
        if(isOutdatedResponse(response.status,body.code,body.expected)){reloadForNewVersion();throw new Error(OUTDATED_MESSAGE);}
        if(response.ok){
          if(!Number.isSafeInteger(body.revision))throw new Error('보상 응답이 올바르지 않습니다.');
          // 서버가 이 응답을 저장했으므로 화면 세이브·revision을 그 값으로 맞춘다(거래 응답과 같은 규칙).
          this.sync.applyJourneyResult({save:body.save,revision:body.revision});
          return body as SyncResult;
        }
        const error=Object.assign(new Error(body.error||'보상을 받지 못했습니다.'),{status:response.status,code:body.code,expected:body.expected});
        // DB 연결·설정 단계에서 거절된 5xx는 보상 트랜잭션이 시작되지 않았다 — 대기를 남기지 않는다.
        if(response.status>=500&&transactionSkippedCodes.includes(body.code)){this.sync.pendingJourney=undefined;throw error;}
        // 코드 없는 5xx·응답 유실은 결과를 모른다 — 대기를 남겨 같은 requestId로 다시 확인하게 한다.
        if(response.status>=500)throw error;
        // 4xx는 확정 거절이다(같은 본문을 다시 보내도 같은 결과) — 대기를 지우고 이유만 알린다.
        this.sync.pendingJourney=undefined;throw error;
      }catch(error){
        if(error instanceof Error&&'status' in error)throw error;
        if(attempt===2)throw new Error('연결이 끊겨 보상 결과를 확인 중입니다. `수령 결과 다시 확인`을 눌러주세요.');
      }finally{clearTimeout(timer);}
    }
    throw new Error('보상 결과를 확인하지 못했습니다. `수령 결과 다시 확인`을 눌러주세요.');
  }
  private reportFailure(error:unknown):void{
    const status=typeof error==='object'&&error&&'status' in error?Number((error as {status?:unknown}).status??0):0;
    const code=typeof error==='object'&&error&&'code' in error?String((error as {code?:unknown}).code??''):'';
    this.error=error instanceof Error&&error.message?error.message:String(error);
    if(status===401||sessionErrorCodes.includes(code)){this.sync.handleError(error);return;}
    // 다른 기기·탭이나 결과를 확인하지 못한 거래가 revision을 먼저 올렸다 — 화면 세이브를 서버 기준으로
    // 조용히 다시 맞추고 다시 시도하게 한다(예전에는 이 경우 거래소·우편이 함께 잠겼다).
    if(code==='SAVE_CONFLICT'||(status===409&&code!=='CHARACTER_CONFLICT')){
      this.error='진행 상황이 다른 곳에서 바뀌었습니다. 최신 상태를 다시 불러왔습니다. 다시 시도해 주세요.';
      void this.sync.reloadLatest(true);
    }
    this.onMessage(this.error);
  }
  ready(kind:'mail'|'rewards'|'achievements'):boolean{
    if(!this.data)return false;
    return kind==='mail'?this.data.mail.some(mail=>!mail.claimedAt&&!mail.expired):
      (kind==='rewards'?[...this.data.daily,...this.data.weekly]:this.data.achievements).some(task=>!task.claimed&&task.current>=task.target);
  }
}
