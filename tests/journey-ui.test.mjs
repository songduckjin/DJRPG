import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';
const {renderSettings,renderUtility,updateUtilityBadges}=await import('../src/ui/modals/utilityModal.ts');
const {Journey}=await import('../src/game/journey.ts');
const {freshSave}=await import('../src/game/store.ts');
const {preferences}=await import('../src/game/preferences.ts');
function node(tag='div'){
  const n={tag,children:[],dataset:{},attrs:{},className:'',textContent:'',append(...children){this.children.push(...children);},setAttribute(k,v){this.attrs[k]=v;}};
  n.classList={add(c){n.className+=` ${c}`;},toggle(c,on){if(on)n.className+=` ${c}`;}};return n;
}
function find(n,test){if(!n||typeof n!=='object')return; if(test(n))return n;for(const child of n.children??[]){const match=find(child,test);if(match)return match;}}
const task=(id,current=1,target=1,claimed=false)=>({id,name:id,current,target,claimed,gold:300,books:0});
function fixture(){
  const calls=[],sync={session:{token:'token',guest:false}},world={save:freshSave(),player:{hp:100},onChange(){}};
  const journey=new Journey(sync,world);journey.data={daily:[task('login'),task('hunt',0,300)],weekly:[task('weekly',0,5000)],achievements:[task('level-5',1,5)],mail:[{id:'welcome',title:'환영',sender:'운영팀',body:'선물',createdAt:1,expiresAt:Date.now()+86400000,expired:false,claimedAt:null,read:false,gold:1000,books:1}],periods:{dailyEnd:Date.now(),weeklyEnd:Date.now()},now:Date.now()};
  journey.act=(...args)=>calls.push(args);journey.load=()=>{};
  const ui={journey,world,session:{loginId:'전사',guest:false},saveStatus:'저장됨',message:m=>calls.push(m),open:k=>calls.push(k),renderModal(){}};
  return {ui,calls};
}
test('settings persist real display preferences and auto climb; account actions remain reachable',()=>{
  const previous=globalThis.document,storage=globalThis.localStorage;globalThis.document={createElement:node};const writes=[];globalThis.localStorage={setItem:(k,v)=>writes.push([k,v])};
  const prior={...preferences};
  try{
    const {ui,calls}=fixture(),dialog=node();renderSettings(ui,dialog);
    const shake=find(dialog,n=>n.tag==='label'&&n.textContent==='화면 흔들림').children[0];shake.checked=false;shake.onchange();assert.equal(preferences.shake,false);assert(writes.length);
    const power=find(dialog,n=>n.tag==='label'&&n.textContent.startsWith('절전')).children[0];power.checked=true;power.onchange();assert(preferences.powerSaving);
    const climb=find(dialog,n=>n.tag==='label'&&n.textContent.includes('자동 등반')).children[0];climb.checked=false;climb.onchange();assert.equal(ui.world.save.autoClimb,false);
    find(dialog,n=>n.textContent==='계정 정보').onclick();assert.equal(calls.at(-1),'account');
  }finally{Object.assign(preferences,prior);globalThis.document=previous;globalThis.localStorage=storage;}
});
test('mail modal warns that the bag is full before and after claiming',()=>{
  const previous=globalThis.document;globalThis.document={createElement:node};
  try{
    const {ui}=fixture();const dialog=node();renderUtility(ui,dialog,'mail');
    assert.equal(find(dialog,n=>n.className==='mail-bag-full'),undefined,'가방이 비었을 때는 안내가 없다');
    const gear=id=>({id,name:'검',slot:'weapon',rarity:'common',stats:{attack:2}});
    ui.world.save.bag=Array.from({length:40},(_,i)=>gear(`g${i}`));
    const full=node();renderUtility(ui,full,'mail');
    const notice=find(full,n=>n.className==='mail-bag-full');
    assert(notice,'가방이 40칸이면 우편함 위에 안내가 뜬다');
    assert.match(notice.textContent,/가방이 가득 찼습니다 \(40\/40칸\)/);
    // 보상 수령 버튼은 그대로 살아 있다 — 받을 것을 잃지 않는 것이 우선이다(작업 246).
    assert.equal(find(full,n=>n.textContent==='모두 받기').disabled,false);
  }finally{globalThis.document=previous;}
});
test('reward tabs select distinct claim scopes and disable unmet, claimed and guest actions',()=>{
  const previous=globalThis.document;globalThis.document={createElement:node};
  try{
    const {ui,calls}=fixture(),dialog=node();renderUtility(ui,dialog,'rewards');
    const all=find(dialog,n=>n.textContent==='모두 받기');assert.equal(all.disabled,false);all.onclick();assert.deepEqual(calls.at(-1),['journey-claim',{kind:'daily',id:'all'}]);
    assert(find(dialog,n=>n.textContent==='진행 중').disabled);
    ui.journey.tab='weekly';const weekly=node();renderUtility(ui,weekly,'rewards');assert(find(find(weekly,n=>n.attrs?.role==='tabpanel'&&!n.hidden),n=>n.textContent==='모두 받기').disabled);
    ui.session.guest=true;ui.journey.tab='daily';const guest=node();renderUtility(ui,guest,'rewards');assert(find(guest,n=>n.textContent==='받기').disabled);
  }finally{globalThis.document=previous;}
});
test('mail and achievement red dots reflect claimability; expired mail does not alert',()=>{
  const {ui}=fixture();const dots=['mail','rewards','achievements'].map(kind=>({dataset:{utilityDot:kind}}));ui.root={querySelectorAll:()=>dots};
  updateUtilityBadges(ui);assert.deepEqual(dots.map(d=>d.hidden),[false,false,true]);
  ui.journey.data.mail[0].expired=true;ui.journey.data.daily[0].claimed=true;ui.journey.data.achievements[0].current=5;
  updateUtilityBadges(ui);assert.deepEqual(dots.map(d=>d.hidden),[true,true,false]);
});
test('결과를 확인하지 못한 수령은 자기 requestId·revision으로 /api/journey에 다시 보낸다(작업 260)',async()=>{
  const original=globalThis.fetch,requests=[];
  try{
    const save=freshSave(),applied=[],calls={begin:0,finish:0};
    const pending={action:'journey-claim',data:{kind:'mail',id:'welcome'},requestId:'same-request',revision:7,progress:{...save}};
    // 거래소 경로(`sync.mutate`)는 아예 주지 않는다 — 여정이 그 경로를 쓰지 않는 것이 이 분리의 핵심이다.
    const sync={save,session:{token:'token',characterSlot:1},revision:7,pendingJourney:pending,beginJourney(){calls.begin++;},finishJourney(){calls.finish++;},journeySnapshot:()=>({revision:9,progress:{...save}}),applyJourneyResult(result){applied.push(result);this.pendingJourney=undefined;},handleError(){}};
    globalThis.fetch=async(url,options)=>{requests.push({url,payload:JSON.parse(options.body)});return{ok:true,status:200,json:async()=>({ok:true,message:'수령 완료',revision:8,save})};};
    const journey=new Journey(sync,{save,player:{hp:100},onChange(){}});journey.load=()=>{};
    await journey.act('journey-claim',{kind:'daily',id:'other'});
    assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/journey');
    assert.equal(requests[0].payload.action,'journey-claim');assert.equal(requests[0].payload.kind,'mail');assert.equal(requests[0].payload.id,'welcome','새 인자가 아니라 남은 대기의 본문을 다시 보낸다');
    assert.equal(requests[0].payload.requestId,'same-request');assert.equal(requests[0].payload.revision,7,'대기에 고정한 revision');
    assert.equal(requests[0].payload.characterSlot,1);assert.deepEqual(requests[0].payload.progress,save);
    assert.equal(applied.length,1);assert.equal(applied[0].revision,8);
    assert.deepEqual(calls,{begin:1,finish:1});assert.equal(journey.busy,false);
  }finally{globalThis.fetch=original;}
});

test('a list response started before a claim cannot overwrite post-claim reward state',async()=>{
  const original=globalThis.fetch;let release;
  const save=freshSave();
  globalThis.fetch=(url,options)=>{
    const payload=JSON.parse(options.body);
    if(payload.action==='journey-list')return new Promise(r=>{release=r;});
    return Promise.resolve({ok:true,status:200,json:async()=>({ok:true,message:'수령 완료',revision:1,save,journey:{daily:[{id:'login',claimed:true}]}})});
  };
  try{
    const sync={save,session:{token:'t',characterSlot:1},revision:0,pendingJourney:undefined,beginJourney(){},finishJourney(){},journeySnapshot:()=>({revision:0,progress:save}),applyJourneyResult(){this.pendingJourney=undefined;},handleError(){}};
    const journey=new Journey(sync,{save,player:{hp:100},onChange(){}});
    const request=journey.load();await journey.act('journey-claim',{kind:'daily',id:'login'});
    const current=journey.data;assert(current.daily[0].claimed,'수령 응답이 반영됐다');
    release({ok:true,status:200,json:async()=>({daily:[{id:'login',claimed:false}]})});await request;
    assert.equal(journey.data,current,'수령 전에 시작한 목록 요청이 수령 뒤 상태를 덮지 않는다');assert.equal(journey.loading,false);
  }finally{globalThis.fetch=original;}
});

test('mail always shows sender body date and rewards without opening a second view and has no refresh button',()=>{
  const previous=globalThis.document;globalThis.document={createElement:node};
  try{
    const {ui}=fixture(),dialog=node();renderUtility(ui,dialog,'mail');
    assert(find(dialog,n=>n.textContent==='보낸 사람: 운영팀'));assert(find(dialog,n=>n.textContent==='선물'));assert(find(dialog,n=>n.className==='mail-date'));
    assert(find(dialog,n=>n.className.includes('mail-pending')));assert(find(dialog,n=>n.textContent==='스킬북 1권'));assert(!find(dialog,n=>n.textContent==='새로고침'));
  }finally{globalThis.document=previous;}
});
test('가방이 가득 차면 아이템이 든 우편은 가방 가득으로 잠기고 금화만 있는 우편은 받을 수 있다(작업 248)',()=>{
  const previous=globalThis.document;globalThis.document={createElement:node};
  try{
    const {ui,calls}=fixture();
    const gear=i=>({id:`g${i}`,name:'검',slot:'weapon',rarity:'common',stats:{attack:1}});
    const goldMail={id:'gold-only',title:'금화 우편',sender:'운영팀',body:'금화만',createdAt:2,expiresAt:Date.now()+86400000,expired:false,claimedAt:null,read:false,gold:1000,books:0,pouches:0};
    ui.world.save.bag=Array.from({length:40},(_,i)=>gear(i));
    ui.journey.data.mail=[...ui.journey.data.mail,goldMail];
    const dialog=node();renderUtility(ui,dialog,'mail');
    const item=find(dialog,n=>n.textContent==='가방 가득');
    assert(item,'아이템이 든 우편은 "가방 가득"으로 잠긴다');
    assert.equal(item.disabled,true);
    assert(item.title.includes('공간을 비운 뒤'));
    assert(find(dialog,n=>n.className==='utility-note'&&n.textContent.includes('가방이 가득 차 아이템이 든 우편은 받을 수 없습니다')));
    const gold=find(dialog,n=>n.textContent==='받기');
    assert.equal(gold.disabled,false,'금화만 있는 우편은 그대로 받을 수 있다');
    // 한 칸 비우면 스킬북 우편도 버튼이 열린다.
    ui.world.save.bag.pop();const room=node();renderUtility(ui,room,'mail');
    assert(!find(room,n=>n.textContent==='가방 가득'));
  }finally{globalThis.document=previous;}
});

 test('achievements show unclaimed ready rewards first with no filter or refresh controls',()=>{
  const previous=globalThis.document;globalThis.document={createElement:node};
  try{
    const {ui}=fixture(),dialog=node();ui.journey.data.achievements=[task('incomplete',1,5),task('claimed',5,5,true),task('ready',5,5)];
    renderUtility(ui,dialog,'achievements');const cards=dialog.children[0].children.filter(n=>n.className==='utility-card utility-task');
    assert.deepEqual(cards.map(n=>n.children[0].textContent),['ready','incomplete','claimed']);
    for(const text of ['새로고침','전체','달성','미달성'])assert(!find(dialog,n=>n.tag==='button'&&n.textContent===text));
    assert(find(dialog,n=>n.textContent==='모두 받기'));
  }finally{globalThis.document=previous;}
});

test('daily and weekly index tabs own distinct all-claim buttons and panels',()=>{
  const previous=globalThis.document;globalThis.document={createElement:node};
  try{
    const {ui,calls}=fixture();ui.journey.data.weekly[0].current=5000;ui.journey.tab='weekly';const dialog=node();renderUtility(ui,dialog,'rewards');
    assert(find(dialog,n=>n.attrs?.role==='tablist'));
    const daily=find(dialog,n=>n.id==='reward-panel-daily'),weekly=find(dialog,n=>n.id==='reward-panel-weekly');assert(daily.hidden);assert(!weekly.hidden);
    const dayAll=find(daily,n=>n.textContent==='모두 받기'),weekAll=find(weekly,n=>n.textContent==='모두 받기');
    assert.equal(dayAll.attrs['aria-label'],'일일 보상 모두 받기');assert.equal(weekAll.attrs['aria-label'],'주간 보상 모두 받기');
    weekAll.onclick();assert.deepEqual(calls.at(-1),['journey-claim',{kind:'weekly',id:'all'}]);dayAll.onclick();assert.deepEqual(calls.at(-1),['journey-claim',{kind:'daily',id:'all'}]);
    assert.equal(find(dialog,n=>n.id==='reward-tab-weekly').attrs['aria-selected'],'true');
  }finally{globalThis.document=previous;}
});

test('reward claim applies the confirmed journey state without an additional list request',async()=>{
 const original=globalThis.fetch,requests=[];
 try{
  const {ui}=fixture(),data=ui.journey.data;data.daily[0].claimed=true;
  let resaves=0;const world=ui.world;world.onChange=()=>{resaves++;};const save=freshSave();
  const sync={save,session:{token:'t',characterSlot:1},revision:2,pendingJourney:undefined,beginJourney(){},finishJourney(){},journeySnapshot:()=>({revision:2,progress:save}),applyJourneyResult(result){this.applied=result;this.pendingJourney=undefined;},handleError(){}};
  globalThis.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return{ok:true,status:200,json:async()=>({ok:true,save,revision:3,message:'수령 완료',journey:data})};};
  const journey=new Journey(sync,world);let reloads=0;journey.load=async()=>{reloads++;};
  await journey.act('journey-claim',{kind:'daily',id:'login'});
  assert.equal(journey.data,data);assert.equal(reloads,0);assert.equal(resaves,0);assert.equal(journey.busy,false);
  assert.equal(requests.length,1,'수령 응답이 목록을 대신하므로 추가 요청이 없다');
  assert.equal(sync.applied.revision,3,'응답의 revision을 화면 기준으로 받는다');
 }finally{globalThis.fetch=original;}
});

test('achievement category shows only next unclaimed step and moves finished category to bottom',async()=>{
 const {orderedAchievements}=await import('../src/ui/modals/utilityModal.ts');
 const step=(id,category,target,claimed=false)=>({...task(id,target,target,claimed),category});
 const tasks=[step('skills-1','스킬',1),step('skills-5','스킬',5),step('skills-11','스킬',11),step('rank-10','스킬',10),step('level-5','성장',5,true),step('level-10','성장',10,true)];
 assert.deepEqual(orderedAchievements(tasks).map(t=>t.id),['skills-1','level-10']);
 tasks[0].claimed=true;assert.deepEqual(orderedAchievements(tasks).map(t=>t.id),['skills-5','level-10']);
 for(const item of tasks)item.claimed=true;assert.equal(orderedAchievements(tasks).length,2);assert(orderedAchievements(tasks).every(t=>t.claimed));
});
test('achievement all-claim receives visible steps only instead of skipping hidden tiers',async()=>{
 const previous=globalThis.document;globalThis.document={createElement:node};
 try{const {ui,calls}=fixture(),dialog=node();
 ui.journey.data.achievements=[{...task('skills-1',1,1),category:'스킬'},{...task('skills-5',5,5),category:'스킬'},{...task('level-5',5,5),category:'성장'}];
 renderUtility(ui,dialog,'achievements');find(dialog,n=>n.tag==='button'&&n.textContent==='모두 받기').onclick();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(calls.filter(call=>call[0]==='journey-claim').map(call=>call[1].id),['skills-1','level-5']);
 }finally{globalThis.document=previous;}
});

test('업적 카드는 금화와 보물 주머니(그림 포함)를 함께 보여 주고 스킬북은 표시하지 않는다',async()=>{
  const previous=globalThis.document;globalThis.document={createElement:node};
  try{
    const {ui}=fixture(),dialog=node();
    ui.journey.data.achievements=[{...task('boss-200',200,200),gold:20000,books:0,pouches:2,category:'보스'},{...task('boss-10',10,10),gold:1000,books:0,pouches:0,category:'보스'}];
    renderUtility(ui,dialog,'achievements');
    assert(find(dialog,n=>n.textContent==='보물 주머니 2개'),'마지막 단계 주머니 표시');
    // 주머니 보상은 글자만이 아니라 가죽 주머니 그림과 함께 보여 준다(작업 210, 사용자 지시 #4461).
    const reward=find(dialog,n=>String(n.className).includes('pouch-reward'));
    assert(reward,'보물 주머니 보상 칸');
    const icon=reward.children.find(child=>child.tag==='img');
    assert(icon&&String(icon.className).includes('pouch-reward-icon'),'주머니 그림 아이콘');
    assert.equal(icon.src,'/assets/icons/treasure_pouch_v2.png','투명 배경 가죽 주머니');
    const {readFileSync}=await import('node:fs');
    const css=modalStyles();
    assert(/\.pouch-reward-icon\s*\{[^}]*width:\s*19px/.test(css),'금화 아이콘과 같은 인라인 크기');
    assert(!find(dialog,n=>String(n.textContent).startsWith('스킬북')),'스킬북 표시 없음');
  }finally{globalThis.document=previous;}
});

test('우편·보상의 받기/모두 받기 버튼은 누를 수 있을 때만 is-ready로 금빛 강조된다(작업 209)',async()=>{
  const {readFileSync}=await import('node:fs');
  const previous=globalThis.document;globalThis.document={createElement:node};
  try{
    const ready=button=>String(button.className).split(' ').includes('is-ready');
    const {ui}=fixture(),mail=node();renderUtility(ui,mail,'mail');
    // 미수령 우편이 있으면 '모두 받기'가 켜지고 강조된다.
    const all=find(mail,n=>n.tag==='button'&&n.textContent==='모두 받기');
    assert.equal(all.disabled,false);assert(ready(all),'활성 모두 받기는 is-ready');
    const claim=find(mail,n=>n.tag==='button'&&n.textContent==='받기');
    assert.equal(claim.disabled,false);assert(ready(claim),'활성 받기는 is-ready');
    // 수령했거나 기한이 지난 우편은 흐리게(disabled) — 강조 클래스가 붙지 않는다.
    ui.journey.data.mail[0].claimedAt=Date.now();const claimed=node();renderUtility(ui,claimed,'mail');
    const allDone=find(claimed,n=>n.tag==='button'&&n.textContent==='모두 받기');
    assert.equal(allDone.disabled,true);assert(!ready(allDone),'수령 뒤 모두 받기는 강조 없음');
    assert(!ready(find(claimed,n=>n.tag==='button'&&n.textContent==='수령 완료')));
    // 보상 탭도 같은 규칙 — 달성한 미션의 받기만 강조된다.
    const rewards=node();renderUtility(ui,rewards,'rewards');
    const daily=find(rewards,n=>n.attrs?.role==='tabpanel'&&!n.hidden);
    assert(ready(find(daily,n=>n.tag==='button'&&n.textContent==='모두 받기')),'일일 모두 받기 강조');
    assert(!ready(find(daily,n=>n.tag==='button'&&n.textContent==='진행 중')),'진행 중은 강조 없음');
    // 강조/흐림은 스타일에서도 실제로 갈린다.
    const css=modalStyles();
    assert(/\.utility-button\.utility-claim\.is-ready\s*\{[^}]*border-color:\s*#e6b866/.test(css),'활성 금빛 테두리');
    assert(/\.utility-button\.utility-claim:not\(\.is-ready\)[^{]*\{[^}]*opacity:\s*\.38/.test(css),'비활성은 더 흐리게');
    assert(/\.utility-button\.utility-claim:disabled[^{]*\{[^}]*filter:\s*grayscale/.test(css),'비활성은 채도도 낮춘다');
  }finally{globalThis.document=previous;}
});

test('거래소 대기가 우편 수령을 잠그지 않고, 우편 대기는 우편함에서만 다시 확인한다(작업 260)',()=>{
  const previous=globalThis.document;globalThis.document={createElement:node};
  try{
    const {ui}=fixture();ui.journey.sync.pendingMarket={action:'claim',data:{deliveryId:'all'},requestId:'pending-1'};
    let retried=0;ui.market={retry:()=>{retried++;}};
    const dialog=node();renderUtility(ui,dialog,'mail');
    const retry=find(dialog,n=>n.tag==='button'&&n.textContent==='거래 결과 다시 확인');
    assert(retry,'거래소 대기는 우편함에서도 풀 수 있다');retry.onclick();
    assert.equal(retried,1);assert(!ui.market.error);
    assert(find(dialog,n=>n.className==='utility-note'&&n.textContent.includes('우편·보상 수령은 그대로 이용할 수 있습니다')));
    // 이 분리의 핵심(설계서 C-3): 거래소 결과를 확인하지 못해도 우편 `받기`는 그대로 눌 수 있다.
    assert.equal(find(dialog,n=>n.tag==='button'&&n.textContent==='받기').disabled,false,'거래소 대기가 우편 수령을 잠그지 않는다');
    assert.equal(find(dialog,n=>n.tag==='button'&&n.textContent==='모두 받기').disabled,false);
    assert(!find(dialog,n=>n.tag==='button'&&n.textContent==='수령 결과 다시 확인'),'여정 대기가 없으면 여정 재확인 버튼도 없다');
    // 여정 대기는 자기 자리(우편함)의 버튼으로만 다시 확인한다.
    ui.journey.sync.pendingJourney={action:'journey-claim',data:{kind:'mail',id:'all'},requestId:'pending-2'};
    const claim=node();renderUtility(ui,claim,'mail');
    assert(find(claim,n=>n.tag==='button'&&n.textContent==='수령 결과 다시 확인'),'우편 수령 대기는 수령 결과 다시 확인');
    assert(find(claim,n=>n.tag==='button'&&n.textContent==='거래 결과 다시 확인'),'거래소 대기 안내는 그대로 남는다');
  }finally{globalThis.document=previous;}
});

test('일일·주간 보상 탭은 받을 보상이 있는 기간에만 빨간 점을 띄우고 전체 완료 보상을 맨 위로 올린다(작업 247)', () => {
  const previous = globalThis.document; globalThis.document = { createElement: node };
  try {
    const { ui } = fixture();
    ui.journey.data.daily = [task('login', 1, 1), task('hunt', 0, 300), { ...task('completion', 1, 2), completion: true, name: '일일 전체 완료 보상' }];
    ui.journey.data.weekly = [task('weekly', 0, 5000), { ...task('completion', 0, 5), completion: true, name: '주간 전체 완료 보상' }];
    const dialog = node(); renderUtility(ui, dialog, 'rewards');
    const tab = id => find(dialog, n => n.id === id);
    const dot = id => find(tab(id), n => String(n.className).includes('reward-tab-dot'));
    assert.equal(dot('reward-tab-daily').hidden, false, '일일은 받을 보상이 있다');
    assert.equal(dot('reward-tab-weekly').hidden, true, '주간은 달성한 보상이 없다');

    const panel = find(dialog, n => n.id === 'reward-panel-daily');
    const completionAt = panel.children.findIndex(child => child.className === 'reward-completion');
    const groupAt = panel.children.findIndex(child => child.className === 'reward-mission-group');
    assert(completionAt >= 0 && groupAt > completionAt, '전체 완료 보상이 개별 미션 묶음보다 위');
    const completion = panel.children[completionAt];
    assert(find(completion, n => n.textContent === '일일 전체 완료 보상'), '전체 완료 카드는 위쪽 묶음에 있다');
    const group = panel.children[groupAt];
    assert(!find(group, n => n.textContent === '일일 전체 완료 보상'), '개별 미션 묶음에는 전체 완료가 없다');
    assert.deepEqual(group.children.map(card => card.children[0].textContent), ['login', 'hunt']);
    assert(find(panel, n => n.textContent === '일일 미션'), '개별 미션 묶음 제목');

    // 주간 탭에서 달성하면 주간 점만 켜진다.
    ui.journey.data.weekly[0].current = 5000;
    const weekly = node(); renderUtility(ui, weekly, 'rewards');
    assert.equal(find(find(weekly, n => n.id === 'reward-tab-weekly'), n => String(n.className).includes('reward-tab-dot')).hidden, false);
    assert.equal(find(find(weekly, n => n.id === 'reward-tab-daily'), n => String(n.className).includes('reward-tab-dot')).hidden, false);
  } finally { globalThis.document = previous; }
});
