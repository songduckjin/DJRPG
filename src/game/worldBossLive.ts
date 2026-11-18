import {apiHeaders,isOutdatedResponse,reloadForNewVersion} from './appVersion';
import type {SaveSync} from './sync';
import type {Save} from './store';
import type {BossStanding} from '../ui/worldBossPresentation';
import type {Interface} from '../ui/interface';
export type BossData={day:string;hp:number;maxHp:number;remaining:number;endsAt:number;killed:boolean;guest:boolean;standing:BossStanding;now:number;battle?:{id:string;startedAt:number;elapsed:number;damage:number;hp:number;finished:boolean;defeated:boolean;save?:Save}};
export class WorldBossLive {
  data?:BossData;error='';loading=false;private loadPromise?:Promise<BossData>;
  onChange:()=>void=()=>{};onModalChange:()=>void=()=>{};
  constructor(readonly sync:SaveSync){}
  get practice():boolean{return this.sync.session.guest;}
  async request(action:string,input:Record<string,unknown>={}):Promise<BossData>{
    const response=await fetch('/api/world-boss',{method:'POST',headers:apiHeaders({Authorization:`Bearer ${this.sync.session.token}`}),body:JSON.stringify({action,...input}),signal:AbortSignal.timeout(15000)});
    const data=await response.json();
    if(!response.ok){if(isOutdatedResponse(response.status,data.code,data.expected))reloadForNewVersion();throw new Error(data.error??'월드보스에 연결하지 못했습니다.');}
    this.data=data;this.error='';this.onChange();this.onModalChange();return data;
  }
  load():Promise<BossData>{
    if(this.loadPromise)return this.loadPromise;this.loading=true;
    this.loadPromise=this.request('list').catch(error=>{this.error=error instanceof Error?error.message:String(error);this.onChange();throw error;}).finally(()=>{this.loading=false;this.loadPromise=undefined;});return this.loadPromise;
  }
  async start(requestId:string):Promise<BossData>{
    if(!await this.sync.flush())throw new Error('진행 상황 저장 후 다시 도전해 주세요.');
    return this.request('start',{requestId,characterSlot:this.sync.session.characterSlot});
  }
}
export function mountWorldBossLive(ui:Interface):void {
  const live=new WorldBossLive(ui.market.sync);ui.worldBoss.live=live;
  live.onChange=()=>{
    const data=live.data;if(data)ui.worldBoss.standing=data.standing;
    const entry=ui.root.querySelector<HTMLElement>('.world-boss-entry');
    if(entry){entry.setAttribute('aria-label',live.practice?'월드보스 연습':'월드보스');entry.title=live.error||(!data?'월드보스 연결 중':`공유 체력 ${data.hp.toLocaleString('ko-KR')} / ${data.maxHp.toLocaleString('ko-KR')} · 남은 도전 ${data.remaining}/3`);
      entry.style.setProperty('--wb-hp-angle',`${data?280*data.hp/data.maxHp:0}deg`);
      const count=entry.querySelector('.wb-entry-count');if(count)count.textContent=live.practice?'연습':data?`${data.remaining}/3`:'…';
    }
    const health=ui.root.querySelector<HTMLElement>('.world-boss-content .wb-health');
    if(health){const bar=health.querySelector<HTMLElement>('i'),label=health.querySelector('span');if(bar)bar.style.width=`${data?data.hp/data.maxHp*100:0}%`;if(label)label.textContent=live.error||(!data?'공유 체력 확인 중…':data.killed?'오늘의 월드보스 처치 완료':`${data.hp.toLocaleString('ko-KR')} / ${data.maxHp.toLocaleString('ko-KR')}`);}
    const start=ui.root.querySelector<HTMLButtonElement>('.world-boss-content .wb-challenge');if(start&&!live.practice){start.disabled=!data||data.killed||data.remaining===0;start.textContent=!data?'연결 중…':data.killed?'토벌 완료':data.remaining===0?'오늘 도전 완료':`도전하기 · ${data.remaining}/3`;}
  };
  live.onChange();const refresh=()=>{if(!document.hidden&&!ui.worldBossField&&!live.sync.locked&&!live.sync.conflicted)void live.load().catch(()=>{});};
  refresh();const timer=setInterval(refresh,5000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
