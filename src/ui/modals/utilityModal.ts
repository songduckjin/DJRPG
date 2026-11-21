import type { Interface } from '../interface';
import { AUTO_SALVAGE_HINT } from '../autoSalvage';
import { salvagePlusLabel, salvagePlusUnlocked, salvagePlusValues } from '../salvagePlus';
import type { JourneyTask } from '../../game/journey';
import { preferences, savePreferences } from '../../game/preferences';
import { goldNode } from '../currency';
import { POUCH_ICON_URL } from '../pouchArt';
import { EQUIPMENT_BAG_LIMIT, equipmentCount } from '../../game/bagCapacity';
import { loadShop } from './shopModal';

function element<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text=''){const node=document.createElement(tag);node.className=className;node.textContent=text;return node;}
function button(text:string,run:()=>void,disabled=false){const node=element('button','utility-button',text);node.type='button';node.disabled=disabled;node.onclick=run;return node;}
/** 받기·모두 받기(작업 209) — 지금 누를 수 있으면 `is-ready`로 금빛 강조, 아니면 `:disabled`로 흐리게(사용자 요청 #4246). */
function claimButton(text:string,run:()=>void,disabled=false){const node=button(text,run,disabled);node.classList.add('utility-claim');if(!disabled)node.classList.add('is-ready');return node;}
function heading(parent:HTMLElement,text:string){parent.append(element('h3','utility-heading',text));}
/**
 * 보상 카드의 `[주머니 그림] 보물 주머니 N개`(작업 207 → 210, 사용자 지시 `#4461` "보상주는거 이미지로 넣어줘").
 * 금화 보상의 금화 아이콘(`goldNode`)과 같은 인라인 크기로 투명 배경 가죽 주머니 그림을 붙인다 —
 * 일일·주간·업적·우편함이 모두 이 함수를 쓰므로 네 화면이 같은 아이콘을 본다.
 */
function pouchReward(count:number):HTMLElement{
  const node=element('span','pouch-reward');
  const icon=document.createElement('img');icon.className='pouch-reward-icon';icon.src=POUCH_ICON_URL;icon.alt='';icon.draggable=false;
  node.append(icon,element('span','pouch-reward-label',`보물 주머니 ${count}개`));
  node.title='무작위 보물 주머니 · 가방에서 열면 금화·장비·스킬북이 나옵니다';
  return node;
}
function persist(ui:Interface){if(!savePreferences())ui.message('이 기기에서 설정을 저장하지 못했습니다. 현재 실행에는 적용됩니다.');}
export function renderSettings(ui:Interface,dialog:HTMLElement):void{
  const section=element('section','utility-content');heading(section,'화면');
  for(const [key,label]of [['shake','화면 흔들림'],['powerSaving','절전 모드 (30 FPS)']]as const){
    const row=element('label','setting-row',label),input=element('input');input.type='checkbox';input.checked=preferences[key];
    input.onchange=()=>{preferences[key]=input.checked;persist(ui);};row.append(input);section.append(row);
  }
  const effects=element('label','setting-row','스킬 이펙트'),select=element('select');
  for(const[value,name]of [['full','전체'],['low','약하게']]){const option=element('option','',name);option.value=value;select.append(option);}select.value=preferences.effects;
  select.onchange=()=>{preferences.effects=select.value==='low'?'low':'full';persist(ui);};effects.append(select);section.append(effects);
  heading(section,'사냥');const climb=element('label','setting-row','보스 처치 후 자동 등반'),toggle=element('input');toggle.type='checkbox';toggle.checked=ui.world.save.autoClimb;
  toggle.onchange=()=>{if(ui.world.paused){toggle.checked=ui.world.save.autoClimb;ui.message('동기화 후 변경해 주세요.');return;}ui.world.save.autoClimb=toggle.checked;ui.world.onChange();};climb.append(toggle);section.append(climb);
  // 접속 중 자동 분해 (작업 196): the same switch as the equipment popup, with the same limit spelled out.
  const auto=element('label','setting-row','자동 분해 (접속 중)'),autoToggle=element('input');autoToggle.type='checkbox';autoToggle.checked=ui.autoSalvage;
  autoToggle.onchange=()=>{ui.setAutoSalvage(autoToggle.checked);};
  auto.append(autoToggle);section.append(auto,element('p','utility-note',AUTO_SALVAGE_HINT));
  // 41층부터 (작업 203): 자동 분해가 갈 `+단계` 상한 — 장비창과 같은 기기 저장값을 쓰고, 40층 이하에서는 줄 자체가 없다.
  if(salvagePlusUnlocked(ui.world.save.maxFloor)){
    const plus=element('label','setting-row','자동 분해 +단계'),plusSelect=element('select');
    for(const value of salvagePlusValues){const option=element('option','',salvagePlusLabel(value));option.value=String(value);plusSelect.append(option);}
    plusSelect.value=String(ui.salvagePlus);plusSelect.onchange=()=>{ui.setSalvagePlus(Number(plusSelect.value));};
    plus.append(plusSelect);section.append(plus,element('p','utility-note','고른 단계보다 높은 장비는 경매장 판매용으로 보관됩니다.'));
  }  section.append(element('p','utility-note','일괄 분해 기준은 장비창에서 설정 · 소리 기능 미지원'));
  heading(section,'계정');const account=element('div','utility-toolbar'),status=element('small','',`서버 ${ui.saveStatus}`);status.dataset.saveStatus='';account.append(element('span','',ui.session.loginId),status,button('계정 정보',()=>ui.open('account')));section.append(account);
  const help=element('details','utility-help');help.append(element('summary','','도움말'),element('p','utility-note','몬스터를 자동으로 사냥합니다. 장비창에서 장착·분해하고 스킬창에서 습득·강화하세요. 보상은 한국 시간 매일 오전 5시, 주간은 월요일 오전 5시에 초기화됩니다.'),element('small','','DJRPG'));section.append(help);
  section.append(button('로그아웃 · 계정 전환',()=>window.dispatchEvent(new Event('game-logout'))));dialog.append(section);
}
function taskRow(ui:Interface,task:JourneyTask,kind:string):HTMLElement{
  const row=element('article',`utility-card utility-task${task.completion?' utility-completion':''}`);row.append(element('b','',`${task.category?task.category+' · ':''}${task.name}`),element('span','',`${task.current.toLocaleString()} / ${task.target.toLocaleString()}`));
  const progress=element('progress');progress.max=task.target;progress.value=task.current;progress.setAttribute('aria-label',`${task.name} 진행도`);row.append(progress);
  const reward=element('div','utility-reward');reward.append(goldNode(task.gold));if(task.books)reward.append(element('span','',`스킬북 ${task.books}권`));if(task.pouches)reward.append(pouchReward(task.pouches));row.append(reward);
  row.append(claimButton(task.claimed?'수령 완료':task.current>=task.target?'받기':'진행 중',()=>{void ui.journey.act('journey-claim',{kind,id:task.id});},task.claimed||task.current<task.target||ui.journey.busy||ui.session.guest));return row;
}
export function orderedAchievements(tasks:JourneyTask[]):JourneyTask[] {
  const groups=new Map<string,JourneyTask[]>();
  for(const task of tasks){const key=task.category||task.id;const group=groups.get(key)??[];group.push(task);groups.set(key,group);}
  const current=[...groups.values()].map(group=>group.find(task=>!task.claimed)??group[group.length-1]);
  const rank=(task:JourneyTask)=>task.claimed?2:task.current>=task.target?0:1;
  return current.sort((a,b)=>rank(a)-rank(b));
}
export function renderUtility(ui:Interface,dialog:HTMLElement,kind:'mail'|'rewards'|'achievements'):void{
  const journey=ui.journey,section=element('section',`utility-content utility-${kind}`);
  if(journey.error)section.append(element('p','market-error',journey.error));
  if(journey.sync.pendingMarket?.action.startsWith('journey-'))section.append(button('수령 결과 다시 확인',()=>{void journey.act('journey-claim');},journey.busy));
  // 거래소 거래가 걸려 있어도 우편함에서 바로 풀 수 있게 같은 안내와 재확인 버튼을 둔다(작업 226).
  if(journey.sync.pendingMarket&&!journey.sync.pendingMarket.action.startsWith('journey-')){
    if(ui.market)section.append(button('거래 결과 다시 확인',()=>{void ui.market.retry();},journey.busy));
    section.append(element('p','utility-note','거래소 거래 결과를 확인하지 못해 받기 버튼이 잠겨 있습니다. 위 버튼으로 거래를 먼저 마무리하세요.'));
  }
  if(ui.session.guest)section.append(element('p','utility-note','정식 계정으로 로그인하면 보상을 수령할 수 있습니다.'));
  const data=journey.data;
  if(!data){section.append(element('p','utility-note',journey.loading?'목록을 불러오고 있습니다.':'불러오지 못했습니다. 창을 닫았다 다시 열어주세요.'));dialog.append(section);return;}
  if(kind==='mail'){
    // 가방 가득 참 안내(작업 246, 사용자 요청 `#20938` "우편도 받을따 가방이 꽉차짔다거 알림주기").
    // 보상 수령 자체는 막지 않는다(받을 것을 잃지 않게) — 대신 가방을 비우는 방법을 화면에 남긴다.
    const bagUsed=equipmentCount(ui.world.save.bag,ui.world.save.job);
    if(bagUsed>=EQUIPMENT_BAG_LIMIT)section.append(element('p','mail-bag-full',`가방이 가득 찼습니다 (${bagUsed}/${EQUIPMENT_BAG_LIMIT}칸). 우편 보상은 그대로 받을 수 있지만, 새 장비를 주우려면 분해·판매로 자리를 비워 주세요.`));
    const available=data.mail.filter(mail=>!mail.claimedAt&&!mail.expired),unread=data.mail.filter(mail=>!mail.read).length;
    const toolbar=element('div','utility-toolbar');toolbar.append(element('span','mail-summary',`새 우편 ${unread} · 미수령 ${available.length}`),claimButton('모두 받기',()=>{void journey.act('journey-claim',{kind:'mail',id:'all'}).then(()=>loadShop(ui));},!available.length||journey.busy||ui.session.guest),button('수령 완료 삭제',()=>{void journey.act('journey-delete');},!data.mail.some(mail=>mail.claimedAt)||journey.busy||ui.session.guest));section.append(toolbar);
    if(!data.mail.length)section.append(element('p','utility-note','받은 우편이 없습니다.'));
    const ready=(mail:typeof data.mail[number])=>!mail.claimedAt&&!mail.expired;
    const mails=[...data.mail].sort((a,b)=>Number(ready(b))-Number(ready(a))||Number(a.read)-Number(b.read)||b.createdAt-a.createdAt);
    // 가방 40칸에는 스킬북·보물 주머니도 함께 센다(작업 248) — 자리가 없으면 아이템이 든 우편은 받을 수 없다.
    // 금화만 있는 우편은 칸을 쓰지 않으므로 늘 받을 수 있다(서버 규칙과 같다).
    const bagFree=Math.max(0,EQUIPMENT_BAG_LIMIT-equipmentCount(ui.world.save.bag,ui.world.save.job));
    const mailItems=(mail:{books?:number;pouches?:number})=>Math.max(0,mail.books??0)+Math.max(0,mail.pouches??0);
    const bagBlocked=(mail:{books?:number;pouches?:number,claimedAt?:number|null,expired?:boolean})=>!mail.claimedAt&&!mail.expired&&mailItems(mail)>bagFree;
    if(mails.some(bagBlocked))section.append(element('p','utility-note','가방이 가득 차 아이템이 든 우편은 받을 수 없습니다. 가방을 비우면 받을 수 있고, 금화만 있는 우편은 지금도 받을 수 있습니다.'));
    for(const mail of mails){
      const row=element('article',`utility-card mail-card${ready(mail)?' mail-pending':''}`),top=element('div','mail-heading');
      const title=button(mail.title,()=>{if(!mail.read&&!ui.session.guest)void journey.act('journey-read',{id:mail.id});},mail.read||journey.busy||ui.session.guest);title.classList.add('mail-title');title.title=mail.read?'읽은 우편':'클릭하여 읽음 표시';
      top.append(title,element('span','mail-state',mail.claimedAt?'수령 완료':mail.expired?'기한 만료':mail.read?'미수령':'새 우편'));row.append(top);
      row.append(element('small','mail-sender',`보낸 사람: ${mail.sender}`),element('p','mail-body',mail.body));
      const received=new Date(mail.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
      row.append(element('small','mail-date',`받은 날짜 ${received} · ${mail.expiresAt===null?'수령 기한 없음':mail.expired?'수령 기한 만료':`남은 시간 ${Math.max(0,Math.ceil((mail.expiresAt-data.now)/3600000))}시간`}`));
      const bottom=element('div','utility-toolbar'),reward=element('div','utility-reward');if(mail.gold)reward.append(goldNode(mail.gold));if(mail.books)reward.append(element('span','',`스킬북 ${mail.books}권`));if(mail.pouches)reward.append(pouchReward(mail.pouches));if(mail.diamonds)reward.append(element('span','',`◆ 다이아 ${mail.diamonds.toLocaleString('ko-KR')}개`));
      const blocked=bagBlocked(mail),claim=claimButton(mail.claimedAt?'수령 완료':mail.expired?'기한 만료':blocked?'가방 가득':'받기',()=>{void journey.act('journey-claim',{kind:'mail',id:mail.id}).then(()=>loadShop(ui));},!!mail.claimedAt||mail.expired||blocked||journey.busy||ui.session.guest);
      if(blocked)claim.title='가방이 가득 찼습니다. 공간을 비운 뒤 우편을 받아주세요. (금화만 있는 우편은 받을 수 있습니다)';
      bottom.append(reward,claim);row.append(bottom);section.append(row);
    }
  }else{
    if(kind==='rewards'){
      // 탭 위 빨간 점(작업 247) — 그 기간에 **받을 보상**(개별 미션 또는 전체 완료)이 있을 때만 켠다.
      const readyOf=(scope:'daily'|'weekly')=>data[scope].some(task=>!task.claimed&&task.current>=task.target);
      const tabs=element('div','reward-index-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','보상 기간');
      for(const[scope,label]of [['daily','일일 보상'],['weekly','주간 보상']]as const){
        const tab=button(label,()=>{journey.tab=scope;ui.renderModal();});tab.id=`reward-tab-${scope}`;tab.className='reward-index-tab';tab.setAttribute('role','tab');tab.setAttribute('aria-controls',`reward-panel-${scope}`);tab.setAttribute('aria-selected',String(journey.tab===scope));tab.tabIndex=journey.tab===scope?0:-1;
        const dot=element('i','reward-tab-dot');dot.setAttribute('aria-hidden','true');dot.hidden=!readyOf(scope);tab.append(dot);
        tab.title=readyOf(scope)?`${label} · 받을 보상이 있습니다`:`${label}`;
        tab.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();journey.tab=event.key==='Home'?'daily':event.key==='End'?'weekly':scope==='daily'?'weekly':'daily';ui.renderModal();ui.modal?.querySelector<HTMLElement>(`#reward-tab-${journey.tab}`)?.focus();};tabs.append(tab);
      }
      section.append(tabs);
      for(const[scope,label]of [['daily','일일 보상'],['weekly','주간 보상']]as const){
        const panel=element('section','reward-panel');panel.id=`reward-panel-${scope}`;panel.hidden=journey.tab!==scope;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',`reward-tab-${scope}`);
        const tasks=data[scope],ready=readyOf(scope),toolbar=element('div','utility-toolbar reward-panel-toolbar');
        const all=claimButton('모두 받기',()=>{void journey.act('journey-claim',{kind:scope,id:'all'});},!ready||journey.busy||ui.session.guest);all.setAttribute('aria-label',`${label} 모두 받기`);
        toolbar.append(element('small','utility-note',label),all);panel.append(toolbar,element('p','utility-note',`초기화: ${new Date(scope==='daily'?data.periods.dailyEnd:data.periods.weeklyEnd).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} (한국 시간)`));
        // 전체 완료 보상은 **맨 위**, 개별 미션은 별도 묶음으로 아래에(작업 247 — 사용자 요청).
        const completion=tasks.find(task=>task.completion),missions=tasks.filter(task=>!task.completion);
        if(completion){const block=element('section','reward-completion');heading(block,'전체 완료 보상');block.append(taskRow(ui,completion,scope));panel.append(block);}
        panel.append(element('h3','utility-heading reward-missions-heading',`${scope==='daily'?'일일':'주간'} 미션`));
        const group=element('section','reward-mission-group');
        for(const task of missions)group.append(taskRow(ui,task,scope));
        panel.append(group);section.append(panel);
      }
    }else{
      const tasks=orderedAchievements(data.achievements),ready=tasks.some(task=>!task.claimed&&task.current>=task.target),toolbar=element('div','utility-toolbar');
      toolbar.append(claimButton('모두 받기',()=>{void (async()=>{
        // Claim only the displayed step once per category; newly revealed steps stay visible.
        const ids=tasks.filter(task=>!task.claimed&&task.current>=task.target).map(task=>task.id);
        for(const id of ids){await journey.act('journey-claim',{kind:'achievements',id});if(journey.error)break;}
      })();},!ready||journey.busy||ui.session.guest));section.append(toolbar);
      for(const task of tasks)section.append(taskRow(ui,task,'achievements'));
    }
  }
  if(journey.busy)section.append(element('p','utility-note','보상을 안전하게 처리하고 있습니다…'));dialog.append(section);
}

export function updateUtilityBadges(ui:Interface):void {
  ui.root.querySelectorAll<HTMLElement>('[data-utility-dot]').forEach(dot=>{
    const kind=dot.dataset.utilityDot as 'mail'|'rewards'|'achievements';dot.hidden=ui.session.guest||!(kind==='achievements'&&ui.journey.data?orderedAchievements(ui.journey.data.achievements).some(task=>!task.claimed&&task.current>=task.target):ui.journey.ready(kind));
  });
}
