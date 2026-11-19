import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
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
test('unknown claim result retries original request ID and payload through shared save sync',async()=>{
  const save=freshSave(),pending={action:'journey-claim',data:{kind:'mail',id:'welcome'},requestId:'same-request'},calls=[];
  const sync={save,session:{token:'token'},pendingMarket:pending,async mutate(...args){calls.push(args);this.pendingMarket=undefined;return {message:'수령 완료'};}};
  const journey=new Journey(sync,{save,player:{hp:100},onChange(){}});journey.load=()=>{};
  await journey.act('journey-claim',{kind:'daily',id:'other'});
  assert.deepEqual(calls,[['journey-claim',pending.data,'same-request']]);assert.equal(journey.busy,false);
});

test('a list response started before a claim cannot overwrite post-claim reward state',async()=>{
  const original=globalThis.fetch;let resolve;
  globalThis.fetch=()=>new Promise(r=>{resolve=r;});
  try{
    const save=freshSave(),sync={session:{token:'t'},async mutate(){return {message:'완료'};}};
    const journey=new Journey(sync,{save,player:{hp:100},onChange(){}});
    const request=journey.load();journey.load=()=>{};await journey.act('journey-claim',{kind:'daily',id:'login'});
    const current={daily:[{id:'login',claimed:true}]};journey.data=current;
    resolve({ok:true,json:async()=>({daily:[{id:'login',claimed:false}]})});await request;
    assert.equal(journey.data,current);assert.equal(journey.loading,false);
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
 const {ui}=fixture(),data=ui.journey.data;data.daily[0].claimed=true;
 let resaves=0;const world=ui.world;world.onChange=()=>{resaves++;};const sync={session:{token:'t'},async mutate(){return {save:world.save,revision:2,journey:data,message:'수령 완료'};}};
 const journey=new Journey(sync,world);let reloads=0;journey.load=async()=>{reloads++;};
 await journey.act('journey-claim',{kind:'daily',id:'login'});assert.equal(journey.data,data);assert.equal(reloads,0);assert.equal(resaves,0);assert.equal(journey.busy,false);
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
