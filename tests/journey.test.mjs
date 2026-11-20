import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createClient} from '@libsql/client';
import {schema,account,transaction,writeSave,reconcileItems} from '../server/database.mjs';
import {snapshot,mutate} from '../server/journey.mjs';
import {periods,advanceJourney} from '../server/journey-state.mjs';
let db,directory;
const save=()=>({version:1,name:'전사',gender:'male',gold:0,bag:[],equipment:{},kills:0,bossKills:0,playSeconds:0,level:1,floor:1,maxFloor:1,equipmentCollection:[],learned:[],passives:[],skillLevels:{}});
async function seed(id,guest=false){await db.execute({sql:'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)',args:[id,guest?'guest':'hashed',JSON.stringify(save()),new Date().toISOString()]});}
async function act(id,kind,itemId='all',action='journey-claim'){const row=await account(db,id);return mutate(db,id,{action,kind,id:itemId,revision:row.revision,requestId:randomUUID()});}
before(async()=>{directory=await mkdtemp(join(tmpdir(),'journey-'));db=createClient({url:`file:${join(directory,'test.db')}`});await schema(db);});
after(async()=>{await db.close();await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
test('KST 05:00 daily and Monday weekly boundaries preserve lifetime claims and mail',()=>{
  const sunday=Date.parse('2026-11-15T19:59:59Z'),monday=sunday+1000;
  assert.notEqual(periods(sunday).daily,periods(monday).daily);assert.notEqual(periods(sunday).weekly,periods(monday).weekly);
  const state=advanceJourney(undefined,save(),save(),sunday);state.daily.claims=['login','completion'];state.weekly.claims=['hunt','completion'];state.achievements=['level-5'];state.mail[0].claimedAt=sunday;
  const next=advanceJourney(state,save(),{...save(),kills:7},monday);
  assert.deepEqual(next.daily.claims,[]);assert.deepEqual(next.weekly.claims,[]);assert.equal(next.daily.kills,7);assert.deepEqual(next.achievements,['level-5']);assert.equal(next.mail[0].claimedAt,sunday);
});
test('daily login grants once; retry with same request ID never duplicates currency',async()=>{
  await seed('daily');const initial=await snapshot(db,'daily');assert.equal(initial.daily[0].current,1);
  const row=await account(db,'daily'),input={action:'journey-claim',kind:'daily',id:'login',revision:row.revision,requestId:randomUUID()};
  const first=await mutate(db,'daily',input),again=await mutate(db,'daily',input);
  assert.equal(first.save.gold,300);assert.equal(again.save.gold,300);assert.equal(first.revision,again.revision);
  await assert.rejects(act('daily','daily','login'),e=>e.code==='NOT_READY');
  await seed('other');assert.equal((await snapshot(db,'other')).daily[0].claimed,false);
});
test('persisted progress advances daily and weekly counters and book rewards bypass equipment capacity without losing equipment',async()=>{
  await seed('progress');await snapshot(db,'progress');
  await transaction(db,async tx=>{const row=await account(tx,'progress'),next={...row.save,kills:5000,playSeconds:18000,salvageCount:20};await writeSave(tx,row,next);});
  // 월드보스 도전은 서버(`server/world-boss.mjs`)가 여정 상태에 적는다 — 여기서는 같은 상태를 직접 만든다.
  const seedState=(await db.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:['progress']})).rows[0],seedParsed=JSON.parse(seedState.state_json);
  seedParsed.daily.worldBoss=1;seedParsed.weekly.worldBoss=5;
  await db.execute({sql:'UPDATE djrpg_journey SET state_json=? WHERE account_id=?',args:[JSON.stringify(seedParsed),'progress']});
  const data=await snapshot(db,'progress');assert.equal(data.daily.find(t=>t.id==='hunt').current,300);
  assert.equal(data.daily.find(t=>t.id==='salvage').current,3,'일일 장비 분해 3회');
  assert.equal(data.daily.find(t=>t.id==='worldBoss').current,1,'월드보스 1회 도전(서버 기록)');
  assert.equal(data.weekly.find(t=>t.id==='hunt').current,2000,'주간 사냥 2,000');
  assert.equal(data.weekly.find(t=>t.id==='time').current,10800,'주간 3시간');
  assert.equal(data.weekly.find(t=>t.id==='salvage').current,15,'주간 장비 분해 15회');
  await transaction(db,async tx=>{const row=await account(tx,'progress');await writeSave(tx,row,{...row.save,bag:Array.from({length:40},()=>({id:randomUUID(),name:'검',slot:'weapon',rarity:'common',stats:{attack:1}}))});});
  const before=await account(db,'progress');await act('progress','daily');
  const after=await account(db,'progress');
  // 일일·주간 개별 미션은 금화만, 전체 완료 보상만 무작위 보물 주머니 1개(작업 207).
  assert.equal(after.save.gold,before.save.gold+6600,'일일 4,600 + 완료 2,000');
  assert.equal(after.save.bag.filter(item=>!['skillbook','pouch'].includes(item.slot)).length,40,'장비 40칸은 그대로');
  assert.equal(after.save.bag.filter(item=>item.slot==='skillbook').length,0,'개별 미션은 스킬북을 주지 않는다');
  const pouches=after.save.bag.filter(item=>item.slot==='pouch');
  assert.equal(pouches.length,1,'전체 완료 보상으로 보물 주머니 1개');
  assert.equal(pouches[0].name,'무작위 보물 주머니');assert.equal(pouches[0].kind,'pouch');
  assert((await snapshot(db,'progress')).daily.every(t=>t.claimed));
});
test('mail read, claim, deletion, item ownership and concurrent reward requests stay isolated and idempotent',async()=>{
  // 환영·업데이트 안내·다이아 지급 우편이 각각 한 통씩 도착한다.
  await seed('mail');const data=await snapshot(db,'mail');assert.equal(data.mail.length,3);
  assert.equal(data.mail[0].id,'welcome-v1');
  await act('mail',undefined,data.mail[0].id,'journey-read');assert((await snapshot(db,'mail')).mail[0].read);
  await act('mail','mail');const row=await account(db,'mail');assert.equal(row.save.gold,4000);assert.equal(row.save.bag.length,3);
  const wallet=(await db.execute({sql:'SELECT diamonds FROM djrpg_shop_wallet WHERE account_id=?',args:['mail']})).rows[0];assert.equal(Number(wallet.diamonds),1000);
  await transaction(db,async tx=>{const latest=await account(tx,'mail');await reconcileItems(tx,'mail',latest.save,latest.save);});
  await assert.rejects(act('mail','mail'),e=>e.code==='NOT_AVAILABLE');
  await act('mail',undefined,'all','journey-delete');assert.equal((await snapshot(db,'mail')).mail.length,0);
  await seed('race');const accountRow=await account(db,'race');const payload={action:'journey-claim',kind:'daily',id:'login',revision:accountRow.revision,requestId:randomUUID()};
  const results=await Promise.allSettled([mutate(db,'race',payload),mutate(db,'race',{...payload,requestId:randomUUID()})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await account(db,'race')).save.gold,300);
});
test('guests cannot claim; expired mail and unmet achievements never grant rewards',async()=>{
  await seed('guest',true);assert.equal((await snapshot(db,'guest')).mail.some(entry=>entry.id==='all-idle-launch-diamonds-2026-11-20'),false);await assert.rejects(act('guest','daily'),e=>e.code==='GUEST_READ_ONLY');
  await seed('expired');await snapshot(db,'expired');
  const stored=(await db.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:['expired']})).rows[0];const state=JSON.parse(stored.state_json);for(const entry of state.mail)entry.expiresAt=0;
  await db.execute({sql:'UPDATE djrpg_journey SET state_json=? WHERE account_id=?',args:[JSON.stringify(state),'expired']});
  await assert.rejects(act('expired','mail'),e=>e.code==='NOT_AVAILABLE');await assert.rejects(act('expired','achievements'),e=>e.code==='NOT_READY');assert.equal((await account(db,'expired')).save.gold,0);
});

test('업데이트 안내 우편은 계정마다 한 번만, 수령·삭제·만료 뒤에도 다시 붙지 않는다',()=>{
  const saveNow=()=>save(),now=Date.parse('2026-11-20T03:00:00Z');
  const fresh=advanceJourney(undefined,saveNow(),saveNow(),now);
  const notice=fresh.mail.find(entry=>entry.id==='update-2026-11-20');
  assert(notice,'새 계정에도 한 통 지급된다');
  assert.equal(notice.title,'[업데이트 안내] 전투·가방 편의성 및 끝없는 던전 개선');
  assert.equal(notice.sender,'운영팀');assert.equal(notice.gold,3000);assert.equal(notice.books,2);
  assert(notice.expiresAt>now,'만료 전에 수령할 수 있다');assert.equal(notice.claimedAt,null);assert.equal(notice.read,false);
  assert.match(notice.body,/끝없는 던전 진행 저장/);
  assert.deepEqual(fresh.notices,['update-2026-11-20'],'지급 이력을 남긴다');
  const again=advanceJourney(fresh,saveNow(),saveNow(),now+1000);
  assert.equal(again.mail.filter(entry=>entry.id==='update-2026-11-20').length,1,'두 번 붙지 않는다');
  // 수령해서 지운 계정: 우편함이 비어 있어도 지급 이력이 있어 다시 붙지 않는다.
  const cleaned=advanceJourney({...fresh,mail:[]},saveNow(),saveNow(),now+2000);
  assert.equal(cleaned.mail.filter(entry=>entry.id==='update-2026-11-20').length,0);
  // 만료 시각(2026-11-28 00:00 KST)을 넘겨 처음 접속한 계정에는 늦은 보상을 주지 않는다.
  const late=advanceJourney(undefined,saveNow(),saveNow(),Date.UTC(2026,10,27,15,0,0));
  assert.equal(late.mail.filter(entry=>entry.id==='update-2026-11-20').length,0);
  assert.deepEqual(late.notices,[]);
});

test('업데이트 우편 보상은 정확히 한 번만 지급되고 삭제 뒤 재지급되지 않는다',async()=>{
  await seed('notice');
  const first=await snapshot(db,'notice');
  const notice=first.mail.find(entry=>entry.id==='update-2026-11-20');
  assert(notice,'업데이트 우편이 우편함에 있다');
  await act('notice','mail',notice.id);
  const row=await account(db,'notice');
  assert.equal(row.save.gold,3000,'금화 3,000');
  assert.equal(row.save.bag.length,2,'스킬북 2권');
  await assert.rejects(act('notice','mail',notice.id),error=>error.code==='NOT_AVAILABLE','같은 우편을 두 번 받을 수 없다');
  await act('notice',undefined,'all','journey-delete');
  const after=await snapshot(db,'notice');
  assert.deepEqual(after.mail.map(entry=>entry.id),['welcome-v1','all-idle-launch-diamonds-2026-11-20'],'수령한 업데이트 우편만 지운다');
  assert.equal(after.mail.filter(entry=>entry.id==='update-2026-11-20').length,0,'삭제 뒤 다시 붙지 않는다');
  assert.equal((await account(db,'notice')).save.gold,3000,'보상도 한 번뿐이다');
});

test('다이아 우편은 계정당 한 번만 지급되고 수령은 원장에 기록된다',async()=>{
  await seed('diamonds');const first=await snapshot(db,'diamonds');
  const gift=first.mail.find(entry=>entry.id==='all-idle-launch-diamonds-2026-11-20');
  assert.equal(gift.diamonds,1000);
  await act('diamonds','mail',gift.id);
  await assert.rejects(act('diamonds','mail',gift.id),error=>error.code==='NOT_AVAILABLE');
  const wallet=(await db.execute({sql:'SELECT diamonds FROM djrpg_shop_wallet WHERE account_id=?',args:['diamonds']})).rows[0];
  const ledger=(await db.execute({sql:"SELECT diamonds_delta FROM djrpg_shop_ledger WHERE account_id=? AND source_type='mail'",args:['diamonds']})).rows;
  assert.equal(Number(wallet.diamonds),1000);assert.equal(ledger.length,1);assert.equal(Number(ledger[0].diamonds_delta),1000);
  await act('diamonds',undefined,'all','journey-delete');
  assert.equal((await snapshot(db,'diamonds')).mail.some(entry=>entry.id===gift.id),false);
});

test('period progress counts once per save and legacy clients retain new totals',async()=>{
  await seed('legacy');await snapshot(db,'legacy');
  await transaction(db,async tx=>{const row=await account(tx,'legacy');await writeSave(tx,row,{...row.save,kills:10,bossKills:2,playSeconds:15,salvageCount:2});});
  await transaction(db,async tx=>{const row=await account(tx,'legacy'),next=structuredClone(row.save);delete next.bossKills;delete next.playSeconds;await writeSave(tx,row,next);});
  const latest=await account(db,'legacy');assert.equal(latest.save.bossKills,2);assert.equal(latest.save.playSeconds,15);
  const progress=await snapshot(db,'legacy');assert.equal(progress.daily.find(t=>t.id==='hunt').current,10);assert.equal(progress.daily.find(t=>t.id==='salvage').current,2);
});

test('completion bonuses require all goals, separate daily and weekly claims and never pay twice',async()=>{
  await seed('completion');const start=await snapshot(db,'completion');assert(start.daily.some(task=>task.completion));
  await assert.rejects(act('completion','daily','completion'),e=>e.code==='NOT_READY');
  await transaction(db,async tx=>{const row=await account(tx,'completion');await writeSave(tx,row,{...row.save,kills:5000,playSeconds:18000,salvageCount:20});});
  // 월드보스 도전 미션은 서버가 적는다 — 같은 상태를 직접 만든다.
  const seedRow=(await db.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:['completion']})).rows[0],seedJson=JSON.parse(seedRow.state_json);
  seedJson.daily.worldBoss=1;seedJson.weekly.worldBoss=5;
  await db.execute({sql:'UPDATE djrpg_journey SET state_json=? WHERE account_id=?',args:[JSON.stringify(seedJson),'completion']});
  await act('completion','daily');let row=await account(db,'completion');assert.equal(row.save.gold,6600);
  assert.equal(row.save.bag.filter(item=>item.slot==='pouch').length,1,'일일 전체 완료 = 주머니 1개');
  assert.equal(row.save.bag.filter(item=>item.slot==='skillbook').length,0,'일일 미션은 금화만');
  await assert.rejects(act('completion','daily','completion'),e=>e.code==='NOT_READY');
  assert.equal((await snapshot(db,'completion')).weekly.find(task=>task.completion).current,4,'사냥·플레이·월드보스·분해 4개(일일 5일은 아직)');
  await assert.rejects(act('completion','weekly','completion'),e=>e.code==='NOT_READY');
  const stored=(await db.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:['completion']})).rows[0],state=JSON.parse(stored.state_json);state.weekly.days=5;
  await db.execute({sql:'UPDATE djrpg_journey SET state_json=? WHERE account_id=?',args:[JSON.stringify(state),'completion']});
  row=await account(db,'completion');const input={action:'journey-claim',kind:'weekly',id:'completion',revision:row.revision,requestId:randomUUID()};
  const first=await mutate(db,'completion',input),retry=await mutate(db,'completion',input);assert.equal(first.save.gold,16600);assert.equal(retry.save.gold,16600);
  await act('completion','weekly');const end=await account(db,'completion');assert.equal(end.save.gold,44600,'주간 28,000 + 완료 10,000');
  assert.equal(end.save.bag.filter(item=>item.slot==='pouch').length,4,'일일 1 + 주간 3 주머니');
  assert.equal(end.save.bag.filter(item=>item.slot==='skillbook').length,0,'주간 미션도 금화만');
  const claimed=await snapshot(db,'completion');assert(claimed.daily.every(task=>task.claimed));assert(claimed.weekly.every(task=>task.claimed));
});
test('existing base rewards claimed before the update still allow completion bonus without recounting a day',async()=>{
  await seed('old-completion');await snapshot(db,'old-completion');
  await transaction(db,async tx=>{const row=await account(tx,'old-completion');await writeSave(tx,row,{...row.save,kills:300,playSeconds:1800,salvageCount:3});});
  const stored=(await db.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:['old-completion']})).rows[0],state=JSON.parse(stored.state_json);state.daily.worldBoss=1;state.daily.claims=['login','hunt','time','worldBoss','salvage'];state.daily.completed=true;state.weekly.days=1;
  await db.execute({sql:'UPDATE djrpg_journey SET state_json=? WHERE account_id=?',args:[JSON.stringify(state),'old-completion']});
  const result=await act('old-completion','daily','completion');assert.equal(result.save.gold,2000);assert.equal(result.save.bag.filter(item=>item.slot==='pouch').length,1);
  const latest=JSON.parse((await db.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:['old-completion']})).rows[0].state_json);assert.equal(latest.weekly.days,1);
});

test('claim returns an authoritative updated list and batches ownership and receipt writes with save',async()=>{
 await seed('fast-claim');await snapshot(db,'fast-claim');const row=await account(db,'fast-claim'),requestId=randomUUID();let batchedReceipt=false,separateReceipt=false;
 const wrapped={async transaction(mode){const tx=await db.transaction(mode);return {get closed(){return tx.closed;},execute(query){if(query.sql?.startsWith('INSERT INTO djrpg_market_requests'))separateReceipt=true;return tx.execute(query);},batch(queries,...args){if(queries.some(q=>q.sql?.startsWith('INSERT INTO djrpg_market_requests')))batchedReceipt=true;return tx.batch(queries,...args);},commit:()=>tx.commit(),rollback:()=>tx.rollback(),close:()=>tx.close()};}};
 const input={action:'journey-claim',kind:'daily',id:'login',revision:row.revision,requestId};const result=await mutate(wrapped,'fast-claim',input);
 assert(result.journey.daily.find(t=>t.id==='login').claimed);assert(batchedReceipt);assert.equal(separateReceipt,false);
 const retry=await mutate(db,'fast-claim',input);assert.equal(retry.save.gold,result.save.gold);assert(retry.journey.daily.find(t=>t.id==='login').claimed);
});
