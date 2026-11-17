import type { Interface } from '../interface';
import type { JourneyTask } from '../../game/journey';
import { preferences, savePreferences } from '../../game/preferences';
import { goldNode } from '../currency';

function element<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text=''){const node=document.createElement(tag);node.className=className;node.textContent=text;return node;}
function button(text:string,run:()=>void,disabled=false){const node=element('button','utility-button',text);node.type='button';node.disabled=disabled;node.onclick=run;return node;}
function heading(parent:HTMLElement,text:string){parent.append(element('h3','utility-heading',text));}
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
  section.append(element('p','utility-note','일괄 분해는 장비창에서 설정 · 소리 기능 미지원'));
  heading(section,'계정');const account=element('div','utility-toolbar'),status=element('small','',`서버 ${ui.saveStatus}`);status.dataset.saveStatus='';account.append(element('span','',ui.session.loginId),status,button('계정 정보',()=>ui.open('account')));section.append(account);
  const help=element('details','utility-help');help.append(element('summary','','도움말'),element('p','utility-note','몬스터를 자동으로 사냥합니다. 장비창에서 장착·분해하고 스킬창에서 습득·강화하세요. 보상은 한국 시간 매일 오전 5시, 주간은 월요일 오전 5시에 초기화됩니다.'),element('small','','DJRPG'));section.append(help);
  section.append(button('로그아웃 · 계정 전환',()=>window.dispatchEvent(new Event('game-logout'))));dialog.append(section);
}
function taskRow(ui:Interface,task:JourneyTask,kind:string):HTMLElement{
  const row=element('article',`utility-card utility-task${task.completion?' utility-completion':''}`);row.append(element('b','',`${task.category?task.category+' · ':''}${task.name}`),element('span','',`${task.current.toLocaleString()} / ${task.target.toLocaleString()}`));
  const progress=element('progress');progress.max=task.target;progress.value=task.current;progress.setAttribute('aria-label',`${task.name} 진행도`);row.append(progress);
  const reward=element('div','utility-reward');reward.append(goldNode(task.gold));if(task.books)reward.append(element('span','',`스킬북 ${task.books}권`));row.append(reward);
  row.append(button(task.claimed?'수령 완료':task.current>=task.target?'받기':'진행 중',()=>{void ui.journey.act('journey-claim',{kind,id:task.id});},task.claimed||task.current<task.target||ui.journey.busy||ui.session.guest));return row;
}
export function orderedAchievements(tasks:JourneyTask[]):JourneyTask[] {
  const rank=(task:JourneyTask)=>task.claimed?2:task.current>=task.target?0:1;
  return [...tasks].sort((a,b)=>rank(a)-rank(b));
}
export function renderUtility(ui:Interface,dialog:HTMLElement,kind:'mail'|'rewards'|'achievements'):void{
  const journey=ui.journey,section=element('section',`utility-content utility-${kind}`);
  if(journey.error)section.append(element('p','market-error',journey.error));
  if(journey.sync.pendingMarket?.action.startsWith('journey-'))section.append(button('수령 결과 다시 확인',()=>{void journey.act('journey-claim');},journey.busy));
  if(ui.session.guest)section.append(element('p','utility-note','정식 계정으로 로그인하면 보상을 수령할 수 있습니다.'));
  const data=journey.data;
  if(!data){section.append(element('p','utility-note',journey.loading?'목록을 불러오고 있습니다.':'불러오지 못했습니다. 창을 닫았다 다시 열어주세요.'));dialog.append(section);return;}
  if(kind==='mail'){
    const available=data.mail.filter(mail=>!mail.claimedAt&&!mail.expired),unread=data.mail.filter(mail=>!mail.read).length;
    const toolbar=element('div','utility-toolbar');toolbar.append(element('span','mail-summary',`새 우편 ${unread} · 미수령 ${available.length}`),button('모두 받기',()=>{void journey.act('journey-claim',{kind:'mail',id:'all'});},!available.length||journey.busy||ui.session.guest),button('수령 완료 삭제',()=>{void journey.act('journey-delete');},!data.mail.some(mail=>mail.claimedAt)||journey.busy||ui.session.guest));section.append(toolbar);
    if(!data.mail.length)section.append(element('p','utility-note','받은 우편이 없습니다.'));
    const ready=(mail:typeof data.mail[number])=>!mail.claimedAt&&!mail.expired;
    const mails=[...data.mail].sort((a,b)=>Number(ready(b))-Number(ready(a))||Number(a.read)-Number(b.read)||b.createdAt-a.createdAt);
    for(const mail of mails){
      const row=element('article',`utility-card mail-card${ready(mail)?' mail-pending':''}`),top=element('div','mail-heading');
      const title=button(mail.title,()=>{if(!mail.read&&!ui.session.guest)void journey.act('journey-read',{id:mail.id});},mail.read||journey.busy||ui.session.guest);title.classList.add('mail-title');title.title=mail.read?'읽은 우편':'클릭하여 읽음 표시';
      top.append(title,element('span','mail-state',mail.claimedAt?'수령 완료':mail.expired?'기한 만료':mail.read?'미수령':'새 우편'));row.append(top);
      row.append(element('small','mail-sender',`보낸 사람: ${mail.sender}`),element('p','mail-body',mail.body));
      const received=new Date(mail.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
      row.append(element('small','mail-date',`받은 날짜 ${received} · ${mail.expired?'수령 기한 만료':`남은 시간 ${Math.max(0,Math.ceil((mail.expiresAt-data.now)/3600000))}시간`}`));
      const bottom=element('div','utility-toolbar'),reward=element('div','utility-reward');reward.append(goldNode(mail.gold));if(mail.books)reward.append(element('span','',`스킬북 ${mail.books}권`));
      bottom.append(reward,button(mail.claimedAt?'수령 완료':mail.expired?'기한 만료':'받기',()=>{void journey.act('journey-claim',{kind:'mail',id:mail.id});},!!mail.claimedAt||mail.expired||journey.busy||ui.session.guest));row.append(bottom);section.append(row);
    }
  }else{
    if(kind==='rewards'){
      const tabs=element('div','reward-index-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','보상 기간');
      for(const[scope,label]of [['daily','일일'],['weekly','주간']]as const){
        const tab=button(label,()=>{journey.tab=scope;ui.renderModal();});tab.id=`reward-tab-${scope}`;tab.className='reward-index-tab';tab.setAttribute('role','tab');tab.setAttribute('aria-controls',`reward-panel-${scope}`);tab.setAttribute('aria-selected',String(journey.tab===scope));tab.tabIndex=journey.tab===scope?0:-1;
        tab.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();journey.tab=event.key==='Home'?'daily':event.key==='End'?'weekly':scope==='daily'?'weekly':'daily';ui.renderModal();ui.modal?.querySelector<HTMLElement>(`#reward-tab-${journey.tab}`)?.focus();};tabs.append(tab);
      }
      section.append(tabs);
      for(const[scope,label]of [['daily','일일'],['weekly','주간']]as const){
        const panel=element('section','reward-panel');panel.id=`reward-panel-${scope}`;panel.hidden=journey.tab!==scope;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',`reward-tab-${scope}`);
        const tasks=data[scope],ready=tasks.some(task=>!task.claimed&&task.current>=task.target),toolbar=element('div','utility-toolbar reward-panel-toolbar');
        const all=button('모두 받기',()=>{void journey.act('journey-claim',{kind:scope,id:'all'});},!ready||journey.busy||ui.session.guest);all.setAttribute('aria-label',`${label} 보상 모두 받기`);
        toolbar.append(element('small','utility-note',`${label} 보상`),all);panel.append(toolbar,element('p','utility-note',`초기화: ${new Date(scope==='daily'?data.periods.dailyEnd:data.periods.weeklyEnd).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} (한국 시간)`));
        for(const task of tasks)panel.append(taskRow(ui,task,scope));section.append(panel);
      }
    }else{
      const tasks=orderedAchievements(data.achievements),ready=tasks.some(task=>!task.claimed&&task.current>=task.target),toolbar=element('div','utility-toolbar');
      toolbar.append(button('모두 받기',()=>{void journey.act('journey-claim',{kind:'achievements',id:'all'});},!ready||journey.busy||ui.session.guest));section.append(toolbar);
      for(const task of tasks)section.append(taskRow(ui,task,'achievements'));
    }
  }
  if(journey.busy)section.append(element('p','utility-note','보상을 안전하게 처리하고 있습니다…'));dialog.append(section);
}

export function updateUtilityBadges(ui:Interface):void {
  ui.root.querySelectorAll<HTMLElement>('[data-utility-dot]').forEach(dot=>{
    const kind=dot.dataset.utilityDot as 'mail'|'rewards'|'achievements';dot.hidden=ui.session.guest||!ui.journey.ready(kind);
  });
}
