import {test} from 'node:test';
import assert from 'node:assert/strict';
// 던전 검증(작업 209)이 `src/game/dungeon/battle.ts`의 순수 로직을 서버에서 리플레이한다 — ts 로더가 필요하다.
import './ts-loader.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createClient} from '@libsql/client';
import {accountEndpoint} from '../server/endpoints/account.mjs';
import {withWeapon} from './helpers/armed.mjs';
// 던전 검증은 클라이언트와 같은 전투 로직(`src/game/dungeon/battle.ts`)을 서버에서 리플레이한다 —
// 확장자 없는 TS import를 풀어 주는 ts 로더를 먼저 등록한 뒤 동적으로 불러온다.
const {dungeonEndpoint} = await import('../server/endpoints/dungeon.mjs');
const {onRequest: dungeonFunction} = await import('../functions/api/dungeon.js');
const {dungeonOperation} = await import('../server/dungeon.mjs');
const {tokenPayload} = await import('../server/auth.mjs');
const {DungeonBattle, DUNGEON_STEP, dungeonBattleSummary} = await import('../src/game/dungeon/battle.ts');
/** 그 세이브로 그 층을 서버가 준 시드로 실제 플레이한 요약(작업 210) — 클라이언트가 submit에 싣는 값과 같다. */
const play=(save,floor,seed)=>{const battle=new DungeonBattle(save,floor,seed);while(!battle.finished&&battle.steps<6000)battle.advance(DUNGEON_STEP);return dungeonBattleSummary(battle);};

const post=(path,body,token)=>new Request(`https://example.test/api/${path}`,{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body:JSON.stringify(body)});

test('던전 순위는 Pages Function으로 열리고 설정·토큰을 확인한다',async()=>{
  assert.equal((await dungeonFunction({request:new Request('https://example.test/api/dungeon'),env:{}})).status,405);
  const missing=await dungeonFunction({request:post('dungeon',{action:'list'}),env:{}});
  assert.equal(missing.status,503);assert.equal((await missing.json()).code,'DB_NOT_CONFIGURED');
  const unauthorized=await dungeonFunction({request:post('dungeon',{action:'list'}),env:{TURSO_DATABASE_URL:'libsql://example.test',TURSO_AUTH_TOKEN:'test'}});
  assert.equal(unauthorized.status,401);assert.equal((await unauthorized.json()).code,'INVALID_TOKEN');
});

/**
 * 순위 기록은 이제 **검증된 submit**만 올린다(작업 209): 세이브는 서버 기록+1층까지만 저장되고,
 * submit은 `start`로 받은 서버 시각에서 최소 클리어 시간이 흘렀는지 확인한다. 그래서 이 테스트는
 * 서버 시계(`now`)를 직접 넘겨 층을 하나씩 올린다 — 실제 10초를 기다리지 않고 검증 규칙을 그대로 본다.
 */
test('던전 순위는 검증된 클리어만 기록하고 상위 10위·내 기록을 서버 시계 기준으로 돌려준다',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'djrpg-dungeon-'));
  const env={TURSO_DATABASE_URL:`file:${join(directory,'dungeon.db')}`,TURSO_AUTH_TOKEN:'local-dungeon-key'};
  const options={env,createDbClient:({TURSO_DATABASE_URL})=>createClient({url:TURSO_DATABASE_URL})};
  // [작업 216] 가입은 캐릭터 0개로 시작하므로, 1번 슬롯 캐릭터를 만든 뒤 그 세이브로 진행한다.
  // 무기도 함께 챙긴다 — 무기 미장착이면 던전에서 공격이 막혀 클리어가 불가능하다.
  const register=async(loginId,name)=>{
    const body=await (await accountEndpoint(post('account',{action:'register',loginId,password:'dungeon-password-197'}),options)).json();
    const created=await (await accountEndpoint(post('account',{action:'createCharacter',slot:1,name,gender:'male',job:'warrior',revision:body.revision},body.token),options)).json();
    return {...body,revision:created.revision,characterSlot:created.characterSlot,save:withWeapon({...created.save},`weapon-${loginId}`)};
  };
  // 던전 몹·보스 공격력 정상화(작업 248) 뒤로는 맨몸 1레벨 캐릭터가 2층부터 버티지 못한다 — 실제 플레이어처럼
  // 장비를 갖춘 20레벨 세이브로 순위 규칙을 본다(세이브를 DB에 직접 심고 소유 기록도 함께 넣어 검증을 건너뛰지 않는다).
  const gearFor=(id,slot,defense,health)=>({id:`rank-${id}-${slot}`,name:'순위 시험 장비',slot,rarity:'rare',stats:{defense,health},plus:0});
  const strengthen=async(session)=>{
    const gear=[gearFor(session.accountId,'armor',60,200),gearFor(session.accountId,'helmet',30,100),gearFor(session.accountId,'boots',30,100),gearFor(session.accountId,'gloves',30,100)];
    const row=(await db.execute({sql:'SELECT save_json FROM djrpg_characters WHERE account_id=? AND slot=1',args:[session.accountId]})).rows[0];
    const save=JSON.parse(row.save_json);
    save.level=20;save.health=828;
    save.equipment={...(save.equipment??{})};
    // 무기는 반드시 남긴다 — 무기 미장착이면 던전에서 공격이 막혀 클리어가 불가능하다.
    if(session.save.equipment?.weapon)save.equipment.weapon=session.save.equipment.weapon;
    for(const item of gear)save.equipment[item.slot]=item;
    await db.execute({sql:'UPDATE djrpg_characters SET save_json=? WHERE account_id=? AND slot=1',args:[JSON.stringify(save),session.accountId]});
    for(const item of gear){
      await db.execute({sql:'INSERT OR REPLACE INTO djrpg_item_owners VALUES (?,?,?,?)',args:[item.id,session.accountId,'inventory',JSON.stringify(item)]});
      await db.execute({sql:'INSERT OR REPLACE INTO djrpg_character_item_owners VALUES (?,?,?)',args:[item.id,session.accountId,1]});
    }
    const loaded=await (await accountEndpoint(post('account',{action:'load'},session.token),options)).json();
    session.save=loaded.save;session.revision=loaded.revision;
    return session;
  };
  const saveFloor=async(session,floor)=>{
    const response=await accountEndpoint(post('account',{action:'save',revision:session.revision,characterSlot:1,save:{...session.save,dungeonFloor:floor}},session.token),options);
    const body=await response.json();session.revision=body.revision;
    if(body.save)session.save=body.save;
    return response;
  };
  let db;
  const sid=sess=>tokenPayload(post('dungeon',{},sess.token),env).sid;
  const operation=(sess,action,at,extra={})=>dungeonOperation(db,sess.accountId,{action,...extra},sid(sess),at,env.TURSO_DATABASE_URL);
  // 서버 시계(`at`)를 직접 넘겨 도전 시작 → (충분한 시간) → 클리어 제출을 한 층씩 반복한다.
  const clear=async(sess,floor,at)=>{
    assert.equal((await saveFloor(sess,floor)).status,200);
    const started=await operation(sess,'start',at,{floor});
    const result=await operation(sess,'submit',at+600_000,{summary:play(sess.save,floor,started.seed)});
    assert.equal(result.recorded,floor);
    return result;
  };
  try{
    db=createClient({url:env.TURSO_DATABASE_URL});
    const first=await strengthen(await register('dungeon197a','가람')),second=await strengthen(await register('dungeon197b','누리'));
    // 5·10층은 보스층(일반의 30배 체력, 작업 205)이라 장비 없는 새 계정으로는 깰 수 없다 — 이 테스트는
    // 순위 규칙만 보므로 보스가 아닌 층(1~4)으로 진행한다.
    for(let floor=1;floor<=3;floor++)await clear(first,floor,1_000_000+floor*60_000);
    const firstSubmit=await operation(first,'submit',9_000_000);
    assert.equal(firstSubmit.recorded,3);
    assert.deepEqual(firstSubmit.standing.top.map(row=>[row.rank,row.name,row.clearedFloor,row.mine]),[[1,'가람',3,true]]);
    assert.equal(firstSubmit.standing.mine.rank,1);
    assert.equal(firstSubmit.guest,false);

    // 같은 층은 먼저 기록한 쪽이 위에 남는다.
    for(let floor=1;floor<=3;floor++)await clear(second,floor,2_000_000+floor*60_000);
    const secondSubmit=await operation(second,'submit',9_000_000);
    assert.deepEqual(secondSubmit.standing.top.map(row=>[row.rank,row.name]),[[1,'가람'],[2,'누리']]);
    assert.equal(secondSubmit.standing.mine.rank,2);

    // 더 깊이 간 쪽이 1위가 되고, 최고층은 되돌릴 수 없다.
    await clear(first,4,3_240_000);
    const deeper=await operation(first,'submit',9_000_000);
    assert.equal(deeper.standing.top[0].clearedFloor,4);
    assert.equal(deeper.standing.top[0].name,'가람');
    // 세이브는 서버 기록보다 앞서지 못한다 — 검증 없이 2층으로 내려도 4층 그대로다.
    const lowered=await saveFloor(first,2);
    assert.equal(lowered.status,200);
    const reloaded=await (await accountEndpoint(post('account',{action:'load'},first.token),options)).json();
    assert.equal(reloaded.save.dungeonFloor,4,'서버는 저장된 최고층을 낮추지 않는다');
    const again=await operation(first,'submit',9_000_000);
    assert.equal(again.standing.top[0].clearedFloor,4);

    // 목록은 로그인만 있으면 누구나(쓰기 없이), 게스트 기록은 올리지 않는다.
    const guest=await (await accountEndpoint(post('account',{action:'guest'}),options)).json();
    const list=await dungeonEndpoint(post('dungeon',{action:'list'},guest.token),options);
    assert.equal(list.status,200);
    const listed=await list.json();
    assert.equal(listed.guest,true);assert.equal(listed.standing.mine,undefined);
    assert.equal(listed.standing.total,2);
    const blocked=await dungeonEndpoint(post('dungeon',{action:'submit'},guest.token),options);
    assert.equal(blocked.status,403);assert.equal((await blocked.json()).code,'GUEST_READ_ONLY');
    assert.equal((await dungeonEndpoint(post('dungeon',{action:'retire'},first.token),options)).status,400);

    // 계정 초기화는 세이브의 진행을 지우므로 순위 기록도 남기지 않는다.
    const resetResponse=await accountEndpoint(post('account',{action:'reset',revision:first.revision,characterSlot:1},first.token),options);
    assert.equal(resetResponse.status,200);
    const resetSave=(await resetResponse.json()).save;
    assert.equal(resetSave.dungeonFloor,0,'계정 초기화는 던전 진행도 지운다');
    first.revision=1;
    const cleared=await operation(first,'submit',9_000_000);
    assert.equal(cleared.standing.mine,undefined,'초기화된 계정의 순위 기록은 지워진다');
    assert.equal(cleared.standing.total,1);
  }finally{await db?.close();await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
