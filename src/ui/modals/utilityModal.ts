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
  section.append(element('p','utility-note','일괄 분해 기준은 장비창에서 선택할 수 있습니다. 배경음·효과음은 현재 제공되지 않습니다.'));
  heading(section,'계정');section.append(element('p','',`${ui.session.loginId} · 저장 상태: ${ui.saveStatus}`),button('계정 정보',()=>ui.open('account')));
  heading(section,'도움말');section.append(element('p','utility-note','몬스터를 자동으로 사냥합니다. 장비창에서 장착·분해하고 스킬창에서 습득·강화하세요. 보상은 한국 시간 매일 오전 5시, 주간은 월요일 오전 5시에 초기화됩니다.'),element('small','','DJRPG · 메뉴 업데이트 1'));
  section.append(button('로그아웃 · 계정 전환',()=>window.dispatchEvent(new Event('game-logout'))));dialog.append(section);
}
function taskRow(ui:Interface,task:JourneyTask,kind:string):HTMLElement{
  const row=element('article','utility-card');row.append(element('b','',`${task.category?task.category+' · ':''}${task.name}`),element('span','',`${task.current.toLocaleString()} / ${task.target.toLocaleString()}`));
  const progress=element('progress');progress.max=task.target;progress.value=task.current;progress.setAttribute('aria-label',`${task.name} 진행도`);row.append(progress);
  const reward=element('div','utility-reward');reward.append(goldNode(task.gold),element('span','',`스킬북 ${task.books}권`));row.append(reward);
  row.append(button(task.claimed?'수령 완료':task.current>=task.target?'받기':'진행 중',()=>{void ui.journey.act('journey-claim',{kind,id:task.id});},task.claimed||task.current<task.target||ui.journey.busy||ui.session.guest));return row;
}
export function renderUtility(ui:Interface,dialog:HTMLElement,kind:'mail'|'rewards'|'achievements'):void{
  const journey=ui.journey,section=element('section','utility-content');
  if(journey.error)section.append(element('p','market-error',journey.error));
  if(journey.sync.pendingMarket?.action.startsWith('journey-'))section.append(button('수령 결과 다시 확인',()=>{void journey.act('journey-claim');},journey.busy));
  if(ui.session.guest)section.append(element('p','utility-note','정식 계정으로 로그인하면 보상을 수령할 수 있습니다.'));
  section.append(button(journey.loading?'불러오는 중…':'새로고침',()=>{void journey.load();},journey.loading||journey.busy));
  const data=journey.data;if(!data){section.append(element('p','',journey.loading?'목록을 불러오고 있습니다.':'목록을 불러오지 못했습니다. 새로고침을 눌러주세요.'));dialog.append(section);return;}
  if(kind==='mail'){
    const available=data.mail.filter(mail=>!mail.claimedAt&&!mail.expired);
    section.append(button('모두 받기',()=>{void journey.act('journey-claim',{kind:'mail',id:'all'});},!available.length||journey.busy||ui.session.guest),button('수령 완료 우편 삭제',()=>{void journey.act('journey-delete');},!data.mail.some(mail=>mail.claimedAt)||journey.busy||ui.session.guest));
    if(!data.mail.length)section.append(element('p','','받은 우편이 없습니다.'));
    for(const mail of data.mail){
      const row=element('article','utility-card');row.append(button(`${mail.read?'':'● '}${mail.title}`,()=>{journey.mailId=journey.mailId===mail.id?undefined:mail.id;if(!mail.read&&!ui.session.guest)void journey.act('journey-read',{id:mail.id});ui.renderModal();},journey.busy));
      row.append(element('small','',`${mail.sender} · ${new Date(mail.createdAt).toLocaleDateString('ko-KR')} · ${mail.expired?'기한 만료':`남은 시간 ${Math.max(0,Math.ceil((mail.expiresAt-data.now)/3600000))}시간`}`));
      if(journey.mailId===mail.id){row.append(element('p','',mail.body));const reward=element('div','utility-reward');reward.append(goldNode(mail.gold),element('span','',`스킬북 ${mail.books}권`));row.append(reward);}
      row.append(button(mail.claimedAt?'수령 완료':mail.expired?'기한 만료':'받기',()=>{void journey.act('journey-claim',{kind:'mail',id:mail.id});},!!mail.claimedAt||mail.expired||journey.busy||ui.session.guest));section.append(row);
    }
  }else{
    const tabs=element('div','utility-tabs');
    if(kind==='rewards'){
      for(const[key,label]of [['daily','일일'],['weekly','주간']]as const){const tab=button(label,()=>{journey.tab=key;ui.renderModal();});tab.classList.toggle('active',journey.tab===key);tabs.append(tab);}
      section.append(tabs,element('p','utility-note',`초기화: ${new Date(journey.tab==='daily'?data.periods.dailyEnd:data.periods.weeklyEnd).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} (한국 시간)`));
    }else{
      for(const[key,label]of [['all','전체'],['ready','달성'],['incomplete','미달성']]as const){const tab=button(label,()=>{journey.filter=key;ui.renderModal();});tab.classList.toggle('active',journey.filter===key);tabs.append(tab);}section.append(tabs);
    }
    const scope=kind==='rewards'?journey.tab:'achievements',tasks=data[scope],ready=tasks.some(task=>!task.claimed&&task.current>=task.target);
    section.append(button('모두 받기',()=>{void journey.act('journey-claim',{kind:scope,id:'all'});},!ready||journey.busy||ui.session.guest));
    for(const task of tasks){if(kind==='achievements'&&((journey.filter==='ready'&&task.current<task.target)||(journey.filter==='incomplete'&&task.current>=task.target)))continue;section.append(taskRow(ui,task,scope));}
  }
  if(journey.busy)section.append(element('p','','보상을 안전하게 처리하고 있습니다…'));dialog.append(section);
}

export function updateUtilityBadges(ui:Interface):void {
  ui.root.querySelectorAll<HTMLElement>('[data-utility-dot]').forEach(dot=>{
    const kind=dot.dataset.utilityDot as 'mail'|'rewards'|'achievements';dot.hidden=ui.session.guest||!ui.journey.ready(kind);
  });
}
