import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createClient} from '@libsql/client';
import {schema,account,transaction,writeSave,reconcileItems} from '../server/database.mjs';
import {snapshot,mutate} from '../server/journey.mjs';
import {periods,advanceJourney,PREVIEW_POUCH_MAIL_ID,DIAMOND_MAIL_ID,LEGACY_DIAMOND_MAIL_ID,APOLOGY_MAIL_ID,APOLOGY_MAIL_UNTIL} from '../server/journey-state.mjs';
import {isPreviewHost,isProductionHost} from '../server/season.mjs';
let db,directory;
const save=()=>({version:1,name:'전사',gender:'male',gold:0,bag:[],equipment:{},kills:0,bossKills:0,playSeconds:0,level:1,floor:1,maxFloor:1,equipmentCollection:[],learned:[],passives:[],skillLevels:{}});
async function seed(id,guest=false){await db.execute({sql:'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)',args:[id,guest?'guest':'hashed',JSON.stringify(save()),new Date().toISOString()]});}
async function act(id,kind,itemId='all',action='journey-claim'){const row=await account(db,id);return mutate(db,id,{action,kind,id:itemId,revision:row.revision,requestId:randomUUID()});}
before(async()=>{directory=await mkdtemp(join(tmpdir(),'journey-'));db=createClient({url:`file:${join(directory,'test.db')}`});await schema(db);});
after(async()=>{await db.close();await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
// 세이브 변화량은 서버가 아는 경과 시간 안에서만 인정된다(작업 209). 이 테스트들이 한 번에 넣는
// 큰 진행은 "그만큼 사냥한 시간"을 서버 시계로 되돌려 놓고 넣는다.
const rewind=async(id,seconds)=>db.execute({sql:'UPDATE djrpg_characters SET updated_at=? WHERE account_id=?',args:[new Date(Date.now()-seconds*1000).toISOString(),id]});
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
  await seed('progress');await snapshot(db,'progress');await rewind('progress',20000);
  await transaction(db,async tx=>{const row=await account(tx,'progress'),next={...row.save,kills:5000,bossKills:30,playSeconds:18000,salvageCount:20};await writeSave(tx,row,next);});
  // 월드보스 도전은 서버(`server/world-boss.mjs`)가 여정 상태에 적는다 — 여기서는 같은 상태를 직접 만든다.
  const seedState=(await db.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:['progress']})).rows[0],seedParsed=JSON.parse(seedState.state_json);
  seedParsed.daily.worldBoss=1;seedParsed.weekly.worldBoss=5;
  await db.execute({sql:'UPDATE djrpg_journey SET state_json=? WHERE account_id=?',args:[JSON.stringify(seedParsed),'progress']});
  const data=await snapshot(db,'progress');assert.equal(data.daily.find(t=>t.id==='hunt').current,300);
  assert.equal(data.daily.find(t=>t.id==='salvage').current,1,'일일 장비 1개 분해(작업 222)');
  assert.equal(data.daily.find(t=>t.id==='worldBoss').current,1,'월드보스 1회 도전(서버 기록)');
  assert.equal(data.weekly.find(t=>t.id==='hunt').current,2000,'주간 사냥 2,000');
  assert.equal(data.weekly.find(t=>t.id==='time').current,10800,'주간 3시간');
  assert.equal(data.weekly.find(t=>t.id==='salvage').current,15,'주간 장비 분해 15회');
  assert.equal(data.weekly.find(t=>t.id==='worldBoss').current,5,'주간 월드보스 5일');
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
  // 환영·업데이트 안내·새 시즌 안내·사과 보상(작업 237)·다이아 지급 우편이 각각 한 통씩 도착한다.
  await seed('mail');const data=await snapshot(db,'mail');assert.equal(data.mail.length,5);
  assert.equal(data.mail[0].id,'welcome-v1');
  await act('mail',undefined,data.mail[0].id,'journey-read');assert((await snapshot(db,'mail')).mail[0].read);
  // 환영 1,000 + 업데이트 3,000 + 새 시즌 오픈 1,000 = 5,000G, 스킬북 3권 + 보물 주머니 1개 + 사과 보상 주머니 5개.
  await act('mail','mail');const row=await account(db,'mail');assert.equal(row.save.gold,5000);assert.equal(row.save.bag.length,9);
  assert.equal(row.save.bag.filter(item=>item.slot==='pouch').length,6,'새 시즌 오픈 1개 + 사과 보상 5개');
  const wallet=(await db.execute({sql:'SELECT diamonds FROM djrpg_shop_wallet WHERE account_id=?',args:['mail']})).rows[0];assert.equal(Number(wallet.diamonds),4000);
  await transaction(db,async tx=>{const latest=await account(tx,'mail');await reconcileItems(tx,'mail',latest.save,latest.save);});
  await assert.rejects(act('mail','mail'),e=>e.code==='NOT_AVAILABLE');
  await act('mail',undefined,'all','journey-delete');assert.equal((await snapshot(db,'mail')).mail.length,0);
  await seed('race');const accountRow=await account(db,'race');const payload={action:'journey-claim',kind:'daily',id:'login',revision:accountRow.revision,requestId:randomUUID()};
  const results=await Promise.allSettled([mutate(db,'race',payload),mutate(db,'race',{...payload,requestId:randomUUID()})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await account(db,'race')).save.gold,300);
});
test('guests cannot claim; expired mail and unmet achievements never grant rewards',async()=>{
  await seed('guest',true);assert.equal((await snapshot(db,'guest')).mail.some(entry=>entry.id===DIAMOND_MAIL_ID),false);await assert.rejects(act('guest','daily'),e=>e.code==='GUEST_READ_ONLY');
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
  assert.deepEqual(fresh.notices,['update-2026-11-20','season-2-open',APOLOGY_MAIL_ID],'지급 이력을 남긴다');
  const again=advanceJourney(fresh,saveNow(),saveNow(),now+1000);
  assert.equal(again.mail.filter(entry=>entry.id==='update-2026-11-20').length,1,'두 번 붙지 않는다');
  // 수령해서 지운 계정: 우편함이 비어 있어도 지급 이력이 있어 다시 붙지 않는다.
  const cleaned=advanceJourney({...fresh,mail:[]},saveNow(),saveNow(),now+2000);
  assert.equal(cleaned.mail.filter(entry=>entry.id==='update-2026-11-20').length,0);
  // 만료 시각(2026-11-28 00:00 KST)을 넘겨 처음 접속한 계정에는 늦은 보상을 주지 않는다.
  const late=advanceJourney(undefined,saveNow(),saveNow(),Date.UTC(2026,10,27,15,0,0));
  assert.equal(late.mail.filter(entry=>entry.id==='update-2026-11-20').length,0);
  assert.deepEqual(late.notices,['season-2-open',APOLOGY_MAIL_ID],'만료된 업데이트 보상은 붙지 않고, 새 시즌 안내·사과 보상만 남는다');
  assert.equal(late.mail.filter(entry=>entry.id==='season-2-open').length,1,'새 시즌 안내는 만료가 없다');
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
  assert.deepEqual(after.mail.map(entry=>entry.id),['welcome-v1','season-2-open',APOLOGY_MAIL_ID,DIAMOND_MAIL_ID],'수령한 업데이트 우편만 지운다');
  assert.equal(after.mail.filter(entry=>entry.id==='update-2026-11-20').length,0,'삭제 뒤 다시 붙지 않는다');
  assert.equal((await account(db,'notice')).save.gold,3000,'보상도 한 번뿐이다');
});

// 작업 237 — 503 서버 연결 불안정 사과 보상(무작위 보물 주머니 5개) 우편.
test('서버 연결 불안정 사과 보상 우편은 계정마다 한 번만, 수령·삭제·만료 뒤에도 다시 붙지 않는다',()=>{
  const now=Date.parse('2026-11-21T00:40:00Z');
  const fresh=advanceJourney(undefined,save(),save(),now);
  const apology=fresh.mail.filter(entry=>entry.id===APOLOGY_MAIL_ID);
  assert.equal(apology.length,1,'새 계정에도 한 통 지급된다');
  const mail=apology[0];
  assert.equal(mail.title,'서버 연결 불안정 사과 보상');
  assert.equal(mail.sender,'운영팀');
  assert.equal(mail.body,'서버 연결 불안정으로 이용에 불편을 드려 죄송합니다. 사과의 마음을 담아 무작위 보물 주머니 5개를 보내드립니다.');
  assert.equal(mail.gold,0);assert.equal(mail.books,0);assert.equal(mail.pouches,5,'무작위 보물 주머니 5개');
  assert.equal(mail.claimedAt,null);assert.equal(mail.read,false);
  assert.equal(mail.expiresAt,APOLOGY_MAIL_UNTIL,'만료는 지급일부터 2주(2026-12-05 00:00 KST)');
  assert(mail.expiresAt>now,'만료 전에 수령할 수 있다');
  assert.equal(fresh.notices.filter(id=>id===APOLOGY_MAIL_ID).length,1,'지급 이력을 남긴다');
  const again=advanceJourney(fresh,save(),save(),now+1000);
  assert.equal(again.mail.filter(entry=>entry.id===APOLOGY_MAIL_ID).length,1,'두 번 붙지 않는다');
  // 수령해서 지운 계정: 우편함에 없어도 지급 이력이 있어 다시 붙지 않는다.
  const cleaned=advanceJourney({...fresh,mail:fresh.mail.filter(entry=>entry.id!==APOLOGY_MAIL_ID)},save(),save(),now+2000);
  assert.equal(cleaned.mail.filter(entry=>entry.id===APOLOGY_MAIL_ID).length,0);
  // 만료 시각(2026-12-05 00:00 KST)을 넘겨 처음 접속한 계정에는 늦은 보상을 주지 않는다.
  const late=advanceJourney(undefined,save(),save(),APOLOGY_MAIL_UNTIL);
  assert.equal(late.mail.filter(entry=>entry.id===APOLOGY_MAIL_ID).length,0);
});

test('사과 보상 우편 수령으로 무작위 보물 주머니 5개가 한 번만 들어가고 재조회에 중복 지급되지 않는다',async()=>{
  await seed('apology');
  const first=await snapshot(db,'apology');
  assert(first.mail.some(entry=>entry.id===APOLOGY_MAIL_ID),'사과 보상 우편이 우편함에 있다');
  const before=await account(db,'apology');
  await act('apology','mail',APOLOGY_MAIL_ID);
  const row=await account(db,'apology');
  const pouches=row.save.bag.filter(item=>item.slot==='pouch');
  assert.equal(pouches.length,5,'보물 주머니 정확히 5개');
  for(const pouch of pouches){
    assert.equal(pouch.name,'무작위 보물 주머니');
    assert.equal(pouch.kind,'pouch');
  }
  assert.equal(new Set(pouches.map(item=>item.id)).size,5,'주머니마다 다른 id');
  assert.equal(row.save.gold,before.save.gold,'사과 보상은 금화가 아니다');
  assert.equal(row.save.bag.filter(item=>item.slot==='skillbook').length,0,'스킬북을 주지 않는다');
  const owners=await db.execute({sql:"SELECT COUNT(*) AS n FROM djrpg_item_owners WHERE account_id='apology' AND location='inventory'",args:[]});
  assert.equal(Number(owners.rows[0].n),5,'주머니 5개가 소유 기록에 들어간다');
  await assert.rejects(act('apology','mail',APOLOGY_MAIL_ID),error=>error.code==='NOT_AVAILABLE','같은 우편을 두 번 받을 수 없다');
  const again=await snapshot(db,'apology');
  assert.equal(again.mail.filter(entry=>entry.id===APOLOGY_MAIL_ID).length,1,'재조회에도 우편은 한 통뿐');
  assert.equal((await account(db,'apology')).save.bag.filter(item=>item.slot==='pouch').length,5,'재조회로 주머니가 늘지 않는다');
});

test('다이아 우편은 계정당 한 번만 지급되고 수령은 원장에 기록된다',async()=>{
  await seed('diamonds');const first=await snapshot(db,'diamonds');
  const gift=first.mail.find(entry=>entry.id===DIAMOND_MAIL_ID);
  assert.equal(gift.diamonds,4000);
  await act('diamonds','mail',gift.id);
  await assert.rejects(act('diamonds','mail',gift.id),error=>error.code==='NOT_AVAILABLE');
  const wallet=(await db.execute({sql:'SELECT diamonds FROM djrpg_shop_wallet WHERE account_id=?',args:['diamonds']})).rows[0];
  const ledger=(await db.execute({sql:"SELECT diamonds_delta FROM djrpg_shop_ledger WHERE account_id=? AND source_type='mail'",args:['diamonds']})).rows;
  assert.equal(Number(wallet.diamonds),4000);assert.equal(ledger.length,1);assert.equal(Number(ledger[0].diamonds_delta),4000);
  await act('diamonds',undefined,'all','journey-delete');
  assert.equal((await snapshot(db,'diamonds')).mail.some(entry=>entry.id===gift.id),false);
});

// 핫픽스 220(`#5539`): 시즌 초기화는 `djrpg_journey`만 비우고 다이아 원장은 남긴다. 시즌1에 우편 다이아를
// 받은 계정이 시즌2 우편을 다시 받으면 같은 원장 ID로 INSERT하다 UNIQUE 충돌(500)로 우편 받기가 막혔다.
const seasonOneClaim = async (id, amount = 1000) => {
  await db.execute({ sql: 'INSERT INTO djrpg_shop_ledger(account_id,source_type,source_id,diamonds_delta,created_at) VALUES (?,?,?,?,?)', args: [id, 'mail', LEGACY_DIAMOND_MAIL_ID, amount, 1] });
};
const resetToSeasonTwo = async id => {
  await db.execute({ sql: 'DELETE FROM djrpg_journey WHERE account_id=?', args: [id] });
  await db.execute({ sql: 'UPDATE djrpg_shop_wallet SET diamonds=0 WHERE account_id=?', args: [id] });
};
const walletOf = async id => Number((await db.execute({ sql: 'SELECT diamonds FROM djrpg_shop_wallet WHERE account_id=?', args: [id] })).rows[0].diamonds);

test('시즌1에 다이아 우편을 받은 계정도 시즌2 우편을 모두 받기·개별 받기로 오류 없이 받는다 (핫픽스 220)', async () => {
  // 시즌1 원장 기록이 남은 채 시즌2로 초기화된 두 계정 — 하나는 `모두 받기`, 하나는 개별 `받기`.
  for (const id of ['s1-all', 's1-one']) { await seed(id); await seasonOneClaim(id); await resetToSeasonTwo(id); }
  const all = await snapshot(db, 's1-all');
  const diamondAll = all.mail.find(entry => entry.id === DIAMOND_MAIL_ID);
  assert(diamondAll, '시즌2 다이아 우편은 새 ID로 온다');
  assert.equal(diamondAll.diamonds, 4000);
  assert.equal(all.mail.some(entry => entry.id === LEGACY_DIAMOND_MAIL_ID), false, '옛 ID 우편은 새로 붙지 않는다');
  const claimedAll = await act('s1-all', 'mail', 'all');
  assert.equal(await walletOf('s1-all'), 4000, '모두 받기로 4,000 다이아가 들어간다');
  assert.equal(claimedAll.journey.mail.filter(entry => !entry.claimedAt).length, 0);
  const ledger = (await db.execute({ sql: "SELECT source_id FROM djrpg_shop_ledger WHERE account_id='s1-all' AND source_type='mail' ORDER BY id", args: [] })).rows;
  assert.deepEqual(ledger.map(row => row.source_id), [LEGACY_DIAMOND_MAIL_ID, DIAMOND_MAIL_ID], '시즌1·시즌2 기록이 따로 남는다');

  const one = await snapshot(db, 's1-one');
  const diamondOne = one.mail.find(entry => entry.id === DIAMOND_MAIL_ID);
  const claimedOne = await act('s1-one', 'mail', diamondOne.id);
  assert(claimedOne.journey.mail.find(entry => entry.id === DIAMOND_MAIL_ID).claimedAt, '개별 받기도 성공한다');
  assert.equal(await walletOf('s1-one'), 4000);
  await assert.rejects(act('s1-one', 'mail', DIAMOND_MAIL_ID), error => error.code === 'NOT_AVAILABLE', '두 번째 받기는 500이 아니라 안내 오류다');
});

test('시즌 초기화 전에 받아 둔 옛 ID 다이아 우편은 새 시즌 ID로 바뀌어 한 번만 받힌다 (핫픽스 220)', async () => {
  await seed('s1-pending');
  await seasonOneClaim('s1-pending');
  // 시즌2 서버가 옛 코드로 붙여 둔 상태: 옛 ID 미수령 우편 + 옛 ID 지급 이력.
  const legacyMail = { id: LEGACY_DIAMOND_MAIL_ID, title: '다이아 4,000개 지급', sender: '운영팀', body: '전 슬롯 방치 기능 출시를 기념해 계정마다 다이아 4,000개를 드립니다.', createdAt: 1, expiresAt: null, gold: 0, books: 0, diamonds: 4000, claimedAt: null, read: false };
  await db.execute({ sql: 'INSERT INTO djrpg_journey(account_id,state_json) VALUES (?,?)', args: ['s1-pending', JSON.stringify({ achievements: [], notices: [LEGACY_DIAMOND_MAIL_ID], mail: [legacyMail] })] });
  const view = await snapshot(db, 's1-pending');
  const diamonds = view.mail.filter(entry => Number(entry.diamonds ?? 0) > 0);
  assert.equal(diamonds.length, 1, '같은 4,000 다이아 우편이 두 통이 되지 않는다');
  assert.equal(diamonds[0].id, DIAMOND_MAIL_ID, '미수령 옛 우편은 새 시즌 ID로 바뀐다');
  assert.equal(diamonds[0].claimedAt, null);
  const stored = JSON.parse((await db.execute({ sql: 'SELECT state_json FROM djrpg_journey WHERE account_id=?', args: ['s1-pending'] })).rows[0].state_json);
  assert(stored.notices.includes(DIAMOND_MAIL_ID), '지급 이력도 새 ID로 맞춘다');
  assert.equal(stored.notices.includes(LEGACY_DIAMOND_MAIL_ID), false, '옛 ID 지급 이력은 남지 않는다');
  const claimed = await act('s1-pending', 'mail', DIAMOND_MAIL_ID);
  assert(claimed.journey.mail.find(entry => entry.id === DIAMOND_MAIL_ID).claimedAt, '옛 우편을 그대로 받을 수 있다');
  assert.equal(await walletOf('s1-pending'), 4000);
  const again = await snapshot(db, 's1-pending');
  assert.equal(again.mail.some(entry => entry.id === LEGACY_DIAMOND_MAIL_ID), false, '받은 뒤 옛 ID 우편이 다시 붙지 않는다');
});

test('핫픽스 전에 옛 ID로 이미 받은 계정에는 4,000 다이아를 한 번 더 주지 않는다 (작업 220 후속)', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  // 시즌1에 1,000을 받았고 시즌2 옛 ID 우편도 받아 지운 계정 — `notices`에 옛 ID만 남아 있다.
  const early = advanceJourney({ achievements: [], notices: [LEGACY_DIAMOND_MAIL_ID], mail: [] }, save(), save(), now, true);
  assert.equal(early.mail.some(entry => Number(entry.diamonds ?? 0) > 0), false, '이미 받은 보상은 새 ID로 다시 붙지 않는다');
  assert.deepEqual(early.notices.filter(id => id.startsWith('all-idle-launch')), [LEGACY_DIAMOND_MAIL_ID], '다이아 지급 이력은 옛 ID 그대로(새 ID로 다시 주지 않는다)');
  // 아직 아무것도 받지 않은 계정은 새 ID로 한 통 받는다.
  const fresh = advanceJourney({ achievements: [], notices: [], mail: [] }, save(), save(), now, true);
  assert.equal(fresh.mail.filter(entry => entry.id === DIAMOND_MAIL_ID).length, 1);
  assert.equal(fresh.mail.find(entry => entry.id === DIAMOND_MAIL_ID).diamonds, 4000);
  // 시즌1 ID 미수령 우편이 남아 있는 계정은 마이그레이션된 한 통을 받는다(중복 없음).
  const pending = { achievements: [], notices: [LEGACY_DIAMOND_MAIL_ID], mail: [{ id: LEGACY_DIAMOND_MAIL_ID, diamonds: 4000, claimedAt: null, read: false, gold: 0, books: 0, title: '다이아 4,000개 지급', sender: '운영팀', body: '', createdAt: 1, expiresAt: null }] };
  const migrated = advanceJourney(pending, save(), save(), now, true);
  const diamondMails = migrated.mail.filter(entry => Number(entry.diamonds ?? 0) > 0);
  assert.equal(diamondMails.length, 1);
  assert.equal(diamondMails[0].id, DIAMOND_MAIL_ID);
});

test('period progress counts once per save and legacy clients retain new totals',async()=>{
  await seed('legacy');await snapshot(db,'legacy');await rewind('legacy',120);
  await transaction(db,async tx=>{const row=await account(tx,'legacy');await writeSave(tx,row,{...row.save,kills:10,bossKills:2,playSeconds:15,salvageCount:2});});
  await transaction(db,async tx=>{const row=await account(tx,'legacy'),next=structuredClone(row.save);delete next.bossKills;delete next.playSeconds;await writeSave(tx,row,next);});
  const latest=await account(db,'legacy');assert.equal(latest.save.bossKills,2);assert.equal(latest.save.playSeconds,15);
  const progress=await snapshot(db,'legacy');assert.equal(progress.daily.find(t=>t.id==='hunt').current,10);assert.equal(progress.daily.find(t=>t.id==='salvage').current,1,'일일 분해 목표는 1개(작업 222)');
});

test('completion bonuses require all goals, separate daily and weekly claims and never pay twice',async()=>{
  await seed('completion');const start=await snapshot(db,'completion');assert(start.daily.some(task=>task.completion));await rewind('completion',20000);
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
  await seed('old-completion');await snapshot(db,'old-completion');await rewind('old-completion',2000);
  await transaction(db,async tx=>{const row=await account(tx,'old-completion');await writeSave(tx,row,{...row.save,kills:300,bossKills:3,playSeconds:1800,salvageCount:3});});
  const stored=(await db.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:['old-completion']})).rows[0],state=JSON.parse(stored.state_json);state.daily.worldBoss=1;state.daily.claims=['login','hunt','time','worldBoss','salvage'];state.daily.completed=true;state.weekly.days=1;
  await db.execute({sql:'UPDATE djrpg_journey SET state_json=? WHERE account_id=?',args:[JSON.stringify(state),'old-completion']});
  const result=await act('old-completion','daily','completion');assert.equal(result.save.gold,2000);assert.equal(result.save.bag.filter(item=>item.slot==='pouch').length,1);
  const latest=JSON.parse((await db.execute({sql:'SELECT state_json FROM djrpg_journey WHERE account_id=?',args:['old-completion']})).rows[0].state_json);assert.equal(latest.weekly.days,1);
});

test('업적 보상은 금화와 보물 주머니로 지급되고 스킬북은 주지 않는다 (작업 208)',async()=>{
  await seed('achievement-reward');await snapshot(db,'achievement-reward');
  // 레벨 30은 서버 상한(작업 209) 안에서만 저장된다 — 12시간 창 두 번으로 나눠 올린다.
  for(const level of [25,30]){
    await rewind('achievement-reward',43200);
    await transaction(db,async tx=>{const row=await account(tx,'achievement-reward');await writeSave(tx,row,{...row.save,level});});
  }
  assert.equal((await account(db,'achievement-reward')).save.level,30,'레벨 30이 저장되었다');
  await snapshot(db,'achievement-reward');
  const first=await act('achievement-reward','achievements','level-5');
  assert.equal(first.save.gold,1000,'첫 단계 1,000G');
  assert.equal(first.save.bag.filter(item=>item.slot==='skillbook').length,0,'업적은 스킬북을 주지 않는다');
  assert.equal(first.save.bag.filter(item=>item.slot==='pouch').length,0,'짧은 앞 단계는 주머니 없음');
  const mid=await act('achievement-reward','achievements','level-15');
  assert.equal(mid.save.gold,4000,'1,000 + 3,000');
  assert.equal(mid.save.bag.filter(item=>item.slot==='pouch').length,1,'3번째 단계부터 주머니 1개');
  const last=await act('achievement-reward','achievements','level-30');
  assert.equal(last.save.gold,16000,'1,000 + 3,000 + 12,000(레벨 사슬 마지막 단계 index 5)');
  assert.equal(last.save.bag.filter(item=>item.slot==='pouch').length,3,'마지막 단계는 주머니 2개(누적 3개)');
  assert.equal(last.save.bag.filter(item=>item.slot==='skillbook').length,0,'끝까지 스킬북 0');
  const pouches=last.save.bag.filter(item=>item.slot==='pouch');
  assert(pouches.every(item=>item.name==='무작위 보물 주머니'&&item.kind==='pouch'));
  // 가방 40칸은 장비만 센다 — 주머니를 3개 받아도 장비 칸은 그대로다.
  const owners=(await db.execute({sql:"SELECT COUNT(*) AS n FROM djrpg_item_owners WHERE account_id='achievement-reward' AND json_extract(item_json,'$.slot')='pouch'",args:[]})).rows[0];
  assert.equal(Number(owners.n),3,'주머니도 소유권에 기록된다');
});

test('claim returns an authoritative updated list and batches ownership and receipt writes with save',async()=>{
 await seed('fast-claim');await snapshot(db,'fast-claim');const row=await account(db,'fast-claim'),requestId=randomUUID();let batchedReceipt=false,separateReceipt=false;
 const wrapped={async transaction(mode){const tx=await db.transaction(mode);return {get closed(){return tx.closed;},execute(query){if(query.sql?.startsWith('INSERT INTO djrpg_market_requests'))separateReceipt=true;return tx.execute(query);},batch(queries,...args){if(queries.some(q=>q.sql?.startsWith('INSERT INTO djrpg_market_requests')))batchedReceipt=true;return tx.batch(queries,...args);},commit:()=>tx.commit(),rollback:()=>tx.rollback(),close:()=>tx.close()};}};
 const input={action:'journey-claim',kind:'daily',id:'login',revision:row.revision,requestId};const result=await mutate(wrapped,'fast-claim',input);
 assert(result.journey.daily.find(t=>t.id==='login').claimed);assert(batchedReceipt);assert.equal(separateReceipt,false);
 const retry=await mutate(db,'fast-claim',input);assert.equal(retry.save.gold,result.save.gold);assert(retry.journey.daily.find(t=>t.id==='login').claimed);
});

test('미리보기 테스트 보물 주머니 우편은 preview 호스트에서만 1회 지급되고 운영에서는 지워진다(작업 210)', async () => {
  const request = url => new Request(url);
  assert.equal(isPreviewHost(request('https://preview-gravel-background-fk.djrpg.pages.dev/api/market')), true, '미리보기 호스트');
  assert.equal(isPreviewHost(request('https://djrpg.pages.dev/api/market')), false, '운영 호스트는 미리보기가 아니다');
  assert.equal(isProductionHost(request('https://djrpg.pages.dev/api/market')), true);
  assert.equal(isPreviewHost(request('https://example.com/preview/api/market')), false, '경로에 preview만 있으면 아니다');
  const empty = () => ({ achievements: [], mail: [] });
  const preview = advanceJourney(empty(), save(), save(), Date.now(), true, true);
  const mail = preview.mail.find(entry => entry.id === PREVIEW_POUCH_MAIL_ID);
  // 작업 212(`#4951`): 6단계 연출·`1개 더 열기`를 마음껏 확인하도록 100개를 준다.
  assert(mail && mail.pouches === 100 && (mail.gold ?? 0) === 0 && (mail.books ?? 0) === 0 && mail.expiresAt === null, '주머니 100개·만료 없음');
  assert.equal(mail.title, '[미리보기 테스트] 보물 주머니 100개');
  assert.equal(PREVIEW_POUCH_MAIL_ID, 'preview-pouch-test-3', 'test-2를 받은 계정도 새로고침하면 다시 받는다');
  const again = advanceJourney(preview, save(), save(), Date.now(), true, true);
  assert.equal(again.mail.filter(entry => entry.id === PREVIEW_POUCH_MAIL_ID).length, 1, '계정당 1회');
  const production = advanceJourney(structuredClone(again), save(), save(), Date.now(), true, 'production');
  assert.equal(production.mail.some(entry => entry.id === PREVIEW_POUCH_MAIL_ID), false, '운영 호스트는 남아 있으면 지운다');
  const unknownHost = advanceJourney(structuredClone(again), save(), save(), Date.now(), true, false);
  assert.equal(unknownHost.mail.some(entry => entry.id === PREVIEW_POUCH_MAIL_ID), true, '호스트를 모르는 호출은 건드리지 않는다');
  const offPreview = advanceJourney(empty(), save(), save(), Date.now(), true, 'production');
  assert.equal(offPreview.mail.some(entry => entry.id === PREVIEW_POUCH_MAIL_ID), false, '운영 호스트에는 지급하지 않는다');
});

test('미리보기 journey 목록에만 테스트 우편이 내려오고 기본(운영) 목록에는 없다', async () => {
  await seed('preview-mail');
  const preview = await snapshot(db, 'preview-mail', { preview: true });
  const mail = preview.mail.find(entry => entry.id === PREVIEW_POUCH_MAIL_ID);
  assert(mail, '미리보기 목록에 테스트 우편');
  assert.equal(mail.pouches, 100);
  const normal = await snapshot(db, 'preview-mail', { preview: 'production' });
  assert.equal(normal.mail.some(entry => entry.id === PREVIEW_POUCH_MAIL_ID), false, '운영 목록에서는 지운다');
  assert.equal(normal.mail.length, 5, '환영·업데이트 안내·새 시즌 안내·사과 보상·다이아 우편 5통은 그대로');
});

test('자동 저장(writeSave, preview 생략)이 돌아도 미리보기 테스트 우편은 남고, 운영 호스트에서만 지워진다(작업 211)', async () => {
  await seed('preview-keep');
  const granted = await snapshot(db, 'preview-keep', { preview: 'preview' });
  assert(granted.mail.some(entry => entry.id === PREVIEW_POUCH_MAIL_ID), '미리보기 호스트에서 지급');
  // 1초 뒤 클라이언트 자동 저장(account.mjs → database.writeSave) — preview 인자를 넘기지 않는다.
  const row = await account(db, 'preview-keep');
  await transaction(db, tx => writeSave(tx, row, { ...save(), kills: 3 }));
  const afterSave = await snapshot(db, 'preview-keep', { preview: 'preview' });
  assert.equal(afterSave.mail.filter(entry => entry.id === PREVIEW_POUCH_MAIL_ID).length, 1, '자동 저장이 우편을 지우지 않는다');
  const production = await snapshot(db, 'preview-keep', { preview: 'production' });
  assert.equal(production.mail.some(entry => entry.id === PREVIEW_POUCH_MAIL_ID), false, '운영 호스트에서만 지운다');
  const stale = advanceJourney({ achievements: [], mail: [{ id: 'preview-pouch-test-1', title: '옛 테스트', pouches: 1, claimedAt: null, read: false }] }, save(), save(), Date.now(), true, 'production');
  assert.equal(stale.mail.some(entry => String(entry.id).startsWith('preview-pouch-test-')), false, 'ID를 올린 뒤 남은 예전 테스트 우편도 운영에서 지운다');
});

test('여정 응답이 거래소 수령함 건수(marketInbox)를 함께 준다 — 거래소 아이콘 빨간 점의 근거(작업 247)', async () => {
  await seed('inbox-count');
  assert.equal((await snapshot(db, 'inbox-count')).marketInbox, 0);
  await db.execute({ sql: 'INSERT INTO djrpg_market_inbox VALUES (?,?,?,?,?,?,?,?,NULL)', args: ['ji-1', 'inbox-count', 'ji-l', 'proceeds', null, 50, '판매대금', 1] });
  assert.equal((await snapshot(db, 'inbox-count')).marketInbox, 1);
  // 수령하면 다시 0 — 거래소 창을 열지 않아도 다음 폴링에서 점이 꺼진다.
  await db.execute({ sql: 'UPDATE djrpg_market_inbox SET claimed_at=? WHERE id=?', args: [Date.now(), 'ji-1'] });
  assert.equal((await snapshot(db, 'inbox-count')).marketInbox, 0);
});
