import {bindModalClose} from '../modalClose';
import type {Interface} from '../interface';
import {preloadBossSheets} from '../worldBossPreview';
import {openWorldBossField} from '../worldBossField';
import {bossRewardTiers,myRewardTier,topTen,type BossStanding} from '../worldBossPresentation';
function text(tag:string,value:string,className=''):HTMLElement {const el=document.createElement(tag);el.textContent=value;el.className=className;return el;}
export function renderBossRanking(parent:HTMLElement,standing?:BossStanding):void {
  const list=document.createElement('div');list.className='wb-rank-list';
  const entries=topTen(standing);
  for(let rank=1;rank<=10;rank++){
    const row=document.createElement('div');row.className='wb-rank-row';const entry=entries.find(r=>r.rank===rank);
    if(entry&&(entry.mine||standing?.mine?.rank===rank))row.classList.add('is-mine');
    row.append(text('b',`${rank}위`),text('span',entry?.name??'집계 대기'),text('strong',entry?entry.damage.toLocaleString('ko-KR'):'—'));list.append(row);
  }
  const mine=document.createElement('div');mine.className='wb-my-rank';mine.append(text('b','내 순위'),text('span',standing?.mine?`${standing.mine.rank}위 · ${standing.mine.name}`:'집계 대기'),text('strong',standing?.mine?standing.mine.damage.toLocaleString('ko-KR'):'—'));
  parent.append(list,mine);
}
export function renderBossRewards(parent:HTMLElement,rank?:number):void {
  parent.append(text('p','순위 보상은 토벌 완료 또는 매일 오전 5시 정산 후 우편으로 지급됩니다.','wb-reward-note'));
  const list=document.createElement('div');list.className='wb-reward-list';
  for(const tier of bossRewardTiers){const row=document.createElement('div');row.className='wb-reward-row';if(tier.id===myRewardTier(rank))row.classList.add('is-mine');
    row.append(text('b',tier.label),text('span',`${tier.gold.toLocaleString('ko-KR')} 금화 · 스킬북 ${tier.books}권`));if(tier.id===myRewardTier(rank))row.append(text('small','내 보상 구간'));list.append(row);
  }
  for(const [label,content] of [['도전 참여 보상','매 도전 1,000 금화'],['마지막 타격 보상','최종 처치자 · 5,000 금화 + 스킬북 2권'],['공동 처치 보상','유효 피해를 기록한 모든 참여자 · 2,000 금화 + 스킬북 1권']]){
    const row=document.createElement('div');row.className='wb-reward-extra';row.append(text('b',label),text('span',content));list.append(row);
  }
  parent.append(list);
}
export function renderWorldBoss(ui:Interface,dialog:HTMLElement):void {
  ui.worldBoss.dispose();preloadBossSheets();const preview=ui.worldBoss;
  const live=preview.live,practice=!live||live.practice;
  if(live)void live.load().then(()=>live.onChange()).catch(()=>{});
  const body=document.createElement('section');body.className='world-boss-content';
  body.innerHTML='<div class="wb-visual"><img class="wb-intro-portrait" src="/assets/world-boss/valkaron-resting-sharp-v2.png" alt="어깨에 대검을 메고 아래 창에 손을 얹은 잿불의 군주 발카론"><i class="wb-clouds wb-intro-clouds" aria-hidden="true"></i></div><img class="wb-intro-hand" src="/assets/world-boss/valkaron-resting-sharp-v2.png" alt="" aria-hidden="true">' ;
  const details=document.createElement('div');details.className='wb-details';
  const heading=document.createElement('div');heading.className='wb-info-heading';
  const exit=document.createElement('button');exit.type='button';exit.className='wb-info-exit';exit.textContent='나가기';exit.setAttribute('aria-label','월드보스 나가기');
  bindModalClose(exit,()=>ui.open(null));heading.append(text('h3','잿불의 군주 발카론','wb-name'),exit);details.append(heading);
  const health=document.createElement('div');health.className='wb-health';health.innerHTML='<i></i><span>공유 체력 연동 준비 중</span>';details.append(health);
  const tabs=document.createElement('div');tabs.className='wb-tabs';tabs.setAttribute('role','tablist');
  for(const [id,label] of [['challenge','도전'],['ranking','순위'],['rewards','보상']] as const){
    const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-selected',String(preview.tab===id));
    button.onclick=()=>{preview.tab=id;ui.renderModal();};tabs.append(button);
  }
  details.append(tabs);const panel=document.createElement('div');panel.className='wb-panel';panel.setAttribute('role','tabpanel');
  if(preview.tab==='challenge'){
    const guide=document.createElement('div');guide.className='wb-challenge-guide';guide.innerHTML='<h4>월드보스 도전 안내</h4><ul><li>계정당 하루 3회, 한 번에 최대 60초 참여합니다.</li><li>모든 유저가 하나의 보스 체력을 함께 깎습니다.</li><li>하루 누적 피해량으로 순위와 보상이 결정됩니다.</li><li>보스 처치 시 진행 중인 전투가 종료되며 추가 도전은 할 수 없습니다.</li><li>마지막 타격자에게 추가 보상을 지급합니다.</li><li>토벌 성공 시 피해를 기록한 모든 참여자가 공동 처치 보상을 받습니다.</li></ul>';panel.append(guide);
    panel.append(text('p',practice?'게스트는 연습 모드입니다. 실전은 정식 계정으로 로그인해 주세요.':'매일 오전 5시 초기화 · 도전 횟수는 계정 내 캐릭터가 공유합니다. 보상은 우편함에서 수령하세요.','wb-preview-note'));
    if(live?.error)panel.append(text('p',live.error,'wb-preview-note'));
    if(preview.damage>0)panel.append(text('p',`최근 전투 피해량 ${preview.damage.toLocaleString('ko-KR')}`));
    const start=document.createElement('button');start.type='button';start.className='wb-challenge';start.textContent=practice?'연습하기':`도전하기 · ${live?.data?.remaining??'…'}/${live?.data?.maxAttempts??3}`;start.disabled=!practice&&(!live?.data||live.data.killed||live.data.remaining===0);start.onclick=()=>openWorldBossField(ui);panel.append(start);
  }else if(preview.tab==='ranking')renderBossRanking(panel,preview.standing);
  else renderBossRewards(panel,preview.standing?.mine?.rank);
  details.append(panel);body.append(details);dialog.append(body);
  if(live){live.onModalChange=()=>{if(dialog.isConnected&&preview.tab==='ranking'){panel.replaceChildren();renderBossRanking(panel,live.data?.standing);}};live.onChange();}
}
