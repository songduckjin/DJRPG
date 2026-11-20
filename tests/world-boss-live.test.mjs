import './ts-loader.mjs';
import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@libsql/client';
import {schema,account} from '../server/database.mjs';
const {worldBossOperation:operation,replayBoss,tier,WORLD_BOSS_HP}=await import('../server/world-boss.mjs');
const {parseSave,freshSave}=await import('../src/game/store.ts');
import {periods} from '../server/journey-state.mjs';
const {worldBossEndpoint}=await import('../server/endpoints/world-boss.mjs');
let db;let now=Date.parse('2026-11-18T10:00:00Z');
async function seed(id,guest=false,connection=db){const save=parseSave({...freshSave('male'),name:id,auto:true,level:7,floor:1,learned:[],quickSlots:[null,null,null]},id);await connection.execute({sql:'INSERT INTO djrpg_accounts(id,password_hash,save_json,updated_at) VALUES (?,?,?,?)',args:[id,guest?'guest':'hash',JSON.stringify(save),new Date(now).toISOString()]});}
const act=(id,input={},time=now,sid)=>operation(db,id,{action:'list',...input},sid,time);
const start=(id,time=now,requestId=randomUUID())=>act(id,{action:'start',requestId,characterSlot:1},time);
before(async()=>{db=createClient({url:'file::memory:?cache=shared'});await schema(db);});
beforeEach(()=>{now+=2*86400000;});
after(async()=>{await db.close();});
test('shared HP is ten million; server replay is deterministic and leaves save untouched',()=>{
 assert.equal(WORLD_BOSS_HP,10000000);const save=parseSave({...freshSave('male'),level:7},'replay'),before=structuredClone(save);
 const first=replayBoss(save,15),again=replayBoss(save,15);assert.equal(first.damage,again.damage);assert(first.damage>0);assert.deepEqual(save,before);
 const evade=replayBoss(save,15,[3]);assert(evade.world.player.hp>=first.world.player.hp);
});
test('start is idempotent; only one active battle and account-wide three attempts',async()=>{
 await seed('limit');const key=randomUUID(),first=await start('limit',now,key),again=await start('limit',now,key);assert.equal(first.battle.id,again.battle.id);assert.equal(again.remaining,2);
 await assert.rejects(start('limit'),e=>e.code==='BOSS_ALREADY_ACTIVE');
 for(let i=0;i<3;i++){
  const battle=i===0?first:await start('limit',now+i*2000);
  await act('limit',{action:'finish',attemptId:battle.battle.id},now+i*2000+1000);
 }
 await assert.rejects(start('limit',now+10000),e=>e.code==='BOSS_LIMIT');
 const next=await start('limit',periods(now).dailyEnd+1);assert.equal(next.remaining,2);assert.notEqual(next.day,first.day);
});
test('server ignores fabricated damage and elapsed; attempt ownership and sessions are checked',async()=>{
 await seed('authority');await seed('outsider');const first=await start('authority');
 const tick=await act('authority',{action:'tick',attemptId:first.battle.id,damage:9e12,elapsed:60},now+1000);
 assert.equal(tick.battle.damage,replayBoss(first.battle.save,1).damage);assert(tick.battle.damage<9e12);assert(Math.abs(tick.battle.elapsed-1)<1e-6);
 await assert.rejects(act('outsider',{action:'finish',attemptId:first.battle.id},now+2000),e=>e.code==='BOSS_ATTEMPT_NOT_FOUND');
 await db.execute({sql:'UPDATE djrpg_accounts SET session_id=? WHERE id=?',args:['new-session','authority']});
 await assert.rejects(act('authority',{},now,'old-session'),e=>e.code==='SESSION_REPLACED');
});
test('guests cannot start, slot conflicts do not consume attempts, snapshot freezes loadout',async()=>{
 await seed('guest',true);await assert.rejects(start('guest'),e=>e.code==='GUEST_READ_ONLY');
 await seed('freeze');await assert.rejects(act('freeze',{action:'start',requestId:randomUUID(),characterSlot:2}),e=>e.code==='CHARACTER_CONFLICT');
 const first=await start('freeze');assert.equal(first.remaining,2);const stored=await account(db,'freeze');assert.equal(stored.revision,0);assert.equal(stored.save.gold,0);
 await db.execute({sql:"UPDATE djrpg_characters SET save_json=json_set(save_json,'$.level',30) WHERE account_id=?",args:['freeze']});
 const data=await act('freeze',{action:'tick',attemptId:first.battle.id},now+2000);assert.equal(data.battle.damage,replayBoss(first.battle.save,2).damage);
});
test('dodge timing comes from server and cooldown prevents repeated inputs',async()=>{
 await seed('dodge');const first=await start('dodge');
 await act('dodge',{action:'dodge',attemptId:first.battle.id,elapsed:30},now+1000);
 await act('dodge',{action:'dodge',attemptId:first.battle.id},now+1100);
 const row=(await db.execute({sql:'SELECT dodges_json FROM djrpg_boss_attempts WHERE id=?',args:[first.battle.id]})).rows[0];assert.deepEqual(JSON.parse(row.dodges_json),[1]);
});
test('shared kill has one last hitter, ranking, shared rewards and idempotent mailbox delivery',async()=>{
 const day=periods(now).daily;
 // Isolate the day from earlier tests without touching account saves.
 await db.execute({sql:'DELETE FROM djrpg_boss_scores WHERE day=?',args:[day]});
 await db.execute({sql:'UPDATE djrpg_boss_attempts SET ended_at=? WHERE day=?',args:[now,day]});
 await seed('contributor');await seed('killer');const one=await start('contributor');const two=await start('killer');
 const partial=await act('contributor',{action:'finish',attemptId:one.battle.id},now+1000);assert(partial.battle.damage>0);
 await db.execute({sql:'UPDATE djrpg_boss_days SET hp=1 WHERE day=?',args:[day]});
 const kill=await act('killer',{action:'tick',attemptId:two.battle.id},now+2000);assert.equal(kill.hp,0);assert(kill.killed);assert(kill.battle.finished);assert.equal(kill.battle.damage,1);
 await assert.rejects(start('contributor',now+3000),e=>e.code==='BOSS_DEFEATED');
 await act('killer',{action:'finish',attemptId:two.battle.id},now+4000);await act('contributor',{},now+4000);
 for(const id of ['contributor','killer']){
  const row=(await db.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:[id]})).rows[0];const mail=JSON.parse(row.state_json).mail.filter(m=>m.id.startsWith('boss:'));
  assert.equal(mail.filter(m=>m.title.includes('공동 처치')).length,1);assert.equal(mail.filter(m=>m.title.includes('위 보상')).length,1);assert.equal(mail.filter(m=>m.title.includes('도전 참여')).length,0);
  const shared=mail.find(m=>m.title.includes('공동 처치'));assert.equal(shared.gold,1500);assert.equal(shared.pouches,1);assert.equal(shared.books,0);
  assert.equal(mail.filter(m=>m.title.includes('마지막 타격')).length,id==='killer'?1:0);assert.equal((await account(db,id)).save.gold,0);
 }
 assert.equal(kill.standing.top.length,2);assert(kill.standing.mine.mine);
});
test('fresh day restores health and attempts; endpoint refuses missing auth and wrong method',async()=>{
 const next=await act('contributor',{},periods(now).dailyEnd+1);assert.equal(next.hp,WORLD_BOSS_HP);assert.equal(next.remaining,3);assert.equal(next.killed,false);
 const get=await worldBossEndpoint(new Request('https://game.test/api/world-boss'));assert.equal(get.status,405);
 const auth=await worldBossEndpoint(new Request('https://game.test/api/world-boss',{method:'POST',body:'{}'}),{env:{TURSO_DATABASE_URL:'file:test',TURSO_AUTH_TOKEN:'test'}});assert.equal(auth.status,401);
});
test('authorized endpoint starts a real battle and preserves API error codes',async()=>{
 await seed('endpoint');const {tokenFor}=await import('../server/auth.mjs');
 const env={TURSO_DATABASE_URL:'file::memory:?cache=shared',TURSO_AUTH_TOKEN:'test-only-key'};
 const options={env,createDbClient:()=>createClient({url:env.TURSO_DATABASE_URL})};
 const post=body=>new Request('https://game.test/api/world-boss',{method:'POST',headers:{Authorization:`Bearer ${tokenFor('endpoint',env)}`},body:JSON.stringify(body)});
 const first=await worldBossEndpoint(post({action:'start',requestId:randomUUID(),characterSlot:1}),options),data=await first.json();assert.equal(first.status,200);assert.equal(data.maxHp,10000000);assert.equal(data.remaining,2);assert.equal(data.guest,false);assert(data.battle.save);
 const again=await worldBossEndpoint(post({action:'start',requestId:randomUUID(),characterSlot:1}),options);assert.equal(again.status,409);assert.equal((await again.json()).code,'BOSS_ALREADY_ACTIVE');
});
test('boss mail uses the existing claim path and duplicate claims cannot duplicate gold or books',async()=>{
 const {mutate}=await import('../server/journey.mjs');const row=await account(db,'killer');
 const state=JSON.parse((await db.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:['killer']})).rows[0].state_json);
 const mail=state.mail.find(m=>m.title.includes('마지막 타격'));assert(mail);
 const input={action:'journey-claim',kind:'mail',id:mail.id,revision:row.revision,requestId:randomUUID()};
 const first=await mutate(db,'killer',input),again=await mutate(db,'killer',input);assert.equal(first.save.gold,2000);assert.equal(again.save.gold,2000);assert.equal(first.save.bag.filter(i=>i.slot==='skillbook').length,0);
});
test('client coalesces refreshes and never starts a battle when the required save flush fails',async()=>{
 const {WorldBossLive}=await import('../src/game/worldBossLive.ts'),original=globalThis.fetch;let calls=0;
 const sync={session:{token:'test-only-token',characterSlot:1,guest:false},flush:async()=>false};
 const client=new WorldBossLive(sync);
 globalThis.fetch=async()=>{calls++;return Response.json({hp:10000000,maxHp:10000000,remaining:3,standing:{top:[]}});};
 try{await assert.rejects(client.start(randomUUID()),/저장/);assert.equal(calls,0);await Promise.all([client.load(),client.load()]);assert.equal(calls,1);assert.equal(client.data.remaining,3);client.data={...client.data,now:2000};globalThis.fetch=async()=>Response.json({now:1000,hp:0});await client.request('list');assert.equal(client.data.hp,10000000);}finally{globalThis.fetch=original;}
});
test('entrance preparation overlaps saving and is reused without another save or early attempt',async()=>{
 const {WorldBossLive}=await import('../src/game/worldBossLive.ts'),original=globalThis.fetch;let saves=0,calls=0,finishSave;
 const sync={session:{token:'test',characterSlot:1,guest:false},flush:()=>{saves++;return new Promise(resolve=>{finishSave=resolve;});}};
 const client=new WorldBossLive(sync);globalThis.fetch=async()=>{calls++;return Response.json({now:1,remaining:2});};
 try{
  const prepared=client.prepare();await Promise.resolve();assert.equal(saves,1);assert.equal(calls,0);
  const battle=client.start(randomUUID(),prepared);assert.equal(calls,0);finishSave(true);await battle;assert.equal(saves,1);assert.equal(calls,1);await assert.rejects(client.start(randomUUID(),prepared,()=>{throw new Error('입장 취소');}),/입장 취소/);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
test('stalled preparation ends with a retryable message and cannot start a battle after timing out',async()=>{
 const {WorldBossLive}=await import('../src/game/worldBossLive.ts'),original=globalThis.fetch;let calls=0,finishSave;
 const sync={session:{token:'test',characterSlot:1,guest:false},flush:()=>new Promise(resolve=>{finishSave=resolve;})};
 const client=new WorldBossLive(sync);globalThis.fetch=async()=>{calls++;return Response.json({});};
 try{await assert.rejects(client.start(randomUUID(),client.prepare(5)),/저장 확인이 지연/);finishSave(true);await Promise.resolve();assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
test('new battle avoids redundant credit writes and fits a bounded DB round-trip budget',async()=>{
 const isolated=createClient({url:'file::memory:'});await schema(isolated);await seed('rpc-budget',false,isolated);await account(isolated,'rpc-budget');let trips=0;
 const wrapped={batch:async(...args)=>{trips++;return isolated.batch(...args);},transaction:async(...args)=>{
  const tx=await isolated.transaction(...args);return new Proxy(tx,{get(target,key){const value=target[key];if(typeof value!=='function')return value;return (...args)=>{if(key==='execute'||key==='batch')trips++;return value.apply(target,args);};}});
 }};
 const result=await operation(wrapped,'rpc-budget',{action:'start',requestId:randomUUID(),characterSlot:1},undefined,now);
 assert.equal(result.battle.elapsed,0);assert.equal(result.battle.damage,0);assert.equal(result.remaining,2);await isolated.close();assert(trips<=9,`new start made ${trips} DB round trips`);
});
test('single rank query keeps top ten and the previous nine plus successor around an outside rank',async()=>{
 await seed('rank-window');const day=periods(now).daily;await act('rank-window');
 await db.batch(Array.from({length:20},(_,i)=>({sql:'INSERT INTO djrpg_boss_scores VALUES (?,?,?,?,?)',args:[day,i===14?'rank-window':`rank-${i}`,`전사${i}`,2000-i*10,now]})));
 await db.batch(Array.from({length:20},(_,i)=>({sql:'INSERT INTO djrpg_boss_attempts VALUES (?,?,?,?,?,?,?,?,?)',args:[randomUUID(),i===14?'rank-window':`rank-${i}`,day,randomUUID(),'{}',now,'[]',2000-i*10,now]})));
 const result=await act('rank-window');assert.equal(result.standing.mine.rank,15);assert.deepEqual(result.standing.top.map(r=>r.rank),[1,2,3,4,5,6,7,8,9,10]);assert.deepEqual(result.standing.nearMine.map(r=>r.rank),[6,7,8,9,10,11,12,13,14,15,16]);
});

test('three attempts reduce shared HP by their sum but rank by best; legacy sums and retries are safe',async()=>{
 await seed('best-record');
 const one=await start('best-record');
 const first=await act('best-record',{action:'finish',attemptId:one.battle.id},now+1000);
 assert(first.battle.damage>0);assert.equal(first.battle.record.status,'first');
 const two=await start('best-record',now+2000);
 const improved=await act('best-record',{action:'finish',attemptId:two.battle.id},now+7000);
 assert(improved.battle.damage>first.battle.damage);assert.equal(improved.battle.record.status,'improved');
 assert.equal(improved.battle.record.previousBestDamage,first.battle.damage);
 const three=await start('best-record',now+8000);
 const lower=await act('best-record',{action:'finish',attemptId:three.battle.id},now+9000);
 assert.equal(lower.battle.record.status,'unchanged');
 assert.equal(lower.hp,WORLD_BOSS_HP-first.battle.damage-improved.battle.damage-lower.battle.damage);
 assert.equal(lower.standing.mine.damage,improved.battle.damage);
 await db.execute({sql:'UPDATE djrpg_boss_scores SET damage=9999999 WHERE day=? AND account_id=?',args:[first.day,'best-record']});
 const listed=await act('best-record',{},now+10000);assert.equal(listed.standing.mine.damage,improved.battle.damage);
 const repeat=await act('best-record',{action:'finish',attemptId:three.battle.id},now+11000);assert.equal(repeat.hp,lower.hp);assert.equal(repeat.battle.record.status,'unchanged');
 await act('best-record',{},periods(now).dailyEnd+1);
 const state=JSON.parse((await db.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:['best-record']})).rows[0].state_json);
 const rewards=state.mail.filter(m=>m.id.startsWith(`boss:${first.day}:`));assert.equal(rewards.length,1);assert.equal(rewards[0].gold,10000);assert.equal(rewards[0].books,0);assert.equal(rewards[0].pouches,4);
 const owner=await account(db,'best-record'),{mutate}=await import('../server/journey.mjs');
 const input={action:'journey-claim',kind:'mail',id:rewards[0].id,revision:owner.revision,requestId:randomUUID()};
 const claimed=await mutate(db,'best-record',input),retried=await mutate(db,'best-record',input);
 assert.equal(claimed.save.gold,10000);assert.equal(claimed.save.bag.filter(i=>i.slot==='pouch').length,4);assert.deepEqual(retried.save.bag,claimed.save.bag);
});
test('rank reward boundaries match the approved gold and pouch table',()=>{
 for(const [rank,gold,pouches] of [[1,10000,4],[2,8000,3],[3,8000,3],[4,6000,2],[10,6000,2],[11,4000,1],[50,4000,1],[51,3000,1],[100,3000,1],[101,2000,1]])assert.deepEqual(tier(rank),[gold,pouches]);
});
