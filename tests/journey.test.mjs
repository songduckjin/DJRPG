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
  await transaction(db,async tx=>{const row=await account(tx,'progress'),next={...row.save,kills:5000,bossKills:30,playSeconds:18000};await writeSave(tx,row,next);});
  const data=await snapshot(db,'progress');assert.equal(data.daily.find(t=>t.id==='hunt').current,300);assert.equal(data.weekly.find(t=>t.id==='boss').current,30);
  await transaction(db,async tx=>{const row=await account(tx,'progress');await writeSave(tx,row,{...row.save,bag:Array.from({length:40},()=>({id:randomUUID(),name:'검',slot:'weapon',rarity:'common',stats:{attack:1}}))});});
  const before=await account(db,'progress');await act('progress','daily');
  const after=await account(db,'progress');assert.equal(after.save.gold,before.save.gold+5800);assert.equal(after.save.bag.filter(item=>item.slot!=='skillbook').length,40);assert.equal(after.save.bag.filter(item=>item.slot==='skillbook').length,5);assert((await snapshot(db,'progress')).daily.every(t=>t.claimed));
});
test('mail read, claim, deletion, item ownership and concurrent reward requests stay isolated and idempotent',async()=>{
  await seed('mail');const data=await snapshot(db,'mail');assert.equal(data.mail.length,1);
  await act('mail',undefined,data.mail[0].id,'journey-read');assert((await snapshot(db,'mail')).mail[0].read);
  await act('mail','mail');const row=await account(db,'mail');assert.equal(row.save.gold,1000);assert.equal(row.save.bag.length,1);
  await transaction(db,async tx=>{const latest=await account(tx,'mail');await reconcileItems(tx,'mail',latest.save,latest.save);});
  await assert.rejects(act('mail','mail'),e=>e.code==='NOT_AVAILABLE');
  await act('mail',undefined,'all','journey-delete');assert.equal((await snapshot(db,'mail')).mail.length,0);
  await seed('race');const accountRow=await account(db,'race');const payload={action:'journey-claim',kind:'daily',id:'login',revision:accountRow.revision,requestId:randomUUID()};
  const results=await Promise.allSettled([mutate(db,'race',payload),mutate(db,'race',{...payload,requestId:randomUUID()})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await account(db,'race')).save.gold,300);
});
test('guests cannot claim; expired mail and unmet achievements never grant rewards',async()=>{
  await seed('guest',true);await assert.rejects(act('guest','daily'),e=>e.code==='GUEST_READ_ONLY');
  await seed('expired');await snapshot(db,'expired');
  const stored=(await db.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:['expired']})).rows[0];const state=JSON.parse(stored.state_json);state.mail[0].expiresAt=0;
  await db.execute({sql:'UPDATE djrpg_journey SET state_json=? WHERE account_id=?',args:[JSON.stringify(state),'expired']});
  await assert.rejects(act('expired','mail'),e=>e.code==='NOT_AVAILABLE');await assert.rejects(act('expired','achievements'),e=>e.code==='NOT_READY');assert.equal((await account(db,'expired')).save.gold,0);
});

test('period progress counts once per save and legacy clients retain new totals',async()=>{
  await seed('legacy');await snapshot(db,'legacy');
  await transaction(db,async tx=>{const row=await account(tx,'legacy');await writeSave(tx,row,{...row.save,kills:10,bossKills:2,playSeconds:15});});
  await transaction(db,async tx=>{const row=await account(tx,'legacy'),next=structuredClone(row.save);delete next.bossKills;delete next.playSeconds;await writeSave(tx,row,next);});
  const latest=await account(db,'legacy');assert.equal(latest.save.bossKills,2);assert.equal(latest.save.playSeconds,15);
  const progress=await snapshot(db,'legacy');assert.equal(progress.daily.find(t=>t.id==='hunt').current,10);assert.equal(progress.daily.find(t=>t.id==='boss').current,2);
});

test('completion bonuses require all goals, separate daily and weekly claims and never pay twice',async()=>{
  await seed('completion');const start=await snapshot(db,'completion');assert(start.daily.some(task=>task.completion));
  await assert.rejects(act('completion','daily','completion'),e=>e.code==='NOT_READY');
  await transaction(db,async tx=>{const row=await account(tx,'completion');await writeSave(tx,row,{...row.save,kills:5000,bossKills:30,playSeconds:18000});});
  await act('completion','daily');let row=await account(db,'completion');assert.equal(row.save.gold,5800);assert.equal(row.save.bag.length,5);
  await assert.rejects(act('completion','daily','completion'),e=>e.code==='NOT_READY');
  assert.equal((await snapshot(db,'completion')).weekly.find(task=>task.completion).current,3);
  await assert.rejects(act('completion','weekly','completion'),e=>e.code==='NOT_READY');
  const stored=(await db.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:['completion']})).rows[0],state=JSON.parse(stored.state_json);state.weekly.days=5;
  await db.execute({sql:'UPDATE djrpg_journey SET state_json=? WHERE account_id=?',args:[JSON.stringify(state),'completion']});
  row=await account(db,'completion');const input={action:'journey-claim',kind:'weekly',id:'completion',revision:row.revision,requestId:randomUUID()};
  const first=await mutate(db,'completion',input),retry=await mutate(db,'completion',input);assert.equal(first.save.gold,15800);assert.equal(retry.save.gold,15800);
  await act('completion','weekly');const end=await account(db,'completion');assert.equal(end.save.gold,38800);assert.equal(end.save.bag.length,22);
  const claimed=await snapshot(db,'completion');assert(claimed.daily.every(task=>task.claimed));assert(claimed.weekly.every(task=>task.claimed));
});
test('existing base rewards claimed before the update still allow completion bonus without recounting a day',async()=>{
  await seed('old-completion');await snapshot(db,'old-completion');
  await transaction(db,async tx=>{const row=await account(tx,'old-completion');await writeSave(tx,row,{...row.save,kills:300,bossKills:3,playSeconds:1800});});
  const stored=(await db.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:['old-completion']})).rows[0],state=JSON.parse(stored.state_json);state.daily.claims=['login','hunt','boss','time'];state.daily.completed=true;state.weekly.days=1;
  await db.execute({sql:'UPDATE djrpg_journey SET state_json=? WHERE account_id=?',args:[JSON.stringify(state),'old-completion']});
  const result=await act('old-completion','daily','completion');assert.equal(result.save.gold,2000);assert.equal(result.save.bag.length,2);
  const latest=JSON.parse((await db.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:['old-completion']})).rows[0].state_json);assert.equal(latest.weekly.days,1);
});

test('claim returns an authoritative updated list and batches ownership and receipt writes with save',async()=>{
 await seed('fast-claim');await snapshot(db,'fast-claim');const row=await account(db,'fast-claim'),requestId=randomUUID();let batchedReceipt=false,separateReceipt=false;
 const wrapped={async transaction(mode){const tx=await db.transaction(mode);return {get closed(){return tx.closed;},execute(query){if(query.sql?.startsWith('INSERT INTO djrpg_market_requests'))separateReceipt=true;return tx.execute(query);},batch(queries,...args){if(queries.some(q=>q.sql?.startsWith('INSERT INTO djrpg_market_requests')))batchedReceipt=true;return tx.batch(queries,...args);},commit:()=>tx.commit(),rollback:()=>tx.rollback(),close:()=>tx.close()};}};
 const input={action:'journey-claim',kind:'daily',id:'login',revision:row.revision,requestId};const result=await mutate(wrapped,'fast-claim',input);
 assert(result.journey.daily.find(t=>t.id==='login').claimed);assert(batchedReceipt);assert.equal(separateReceipt,false);
 const retry=await mutate(db,'fast-claim',input);assert.equal(retry.save.gold,result.save.gold);assert(retry.journey.daily.find(t=>t.id==='login').claimed);
});
