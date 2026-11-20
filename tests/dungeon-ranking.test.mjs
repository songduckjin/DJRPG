import {test} from 'node:test';
import assert from 'node:assert/strict';
// 던전 검증(작업 209)이 `src/ui/dungeonBattle.ts`의 순수 로직을 서버에서 리플레이한다 — ts 로더가 필요하다.
import './ts-loader.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createClient} from '@libsql/client';
import {accountEndpoint} from '../server/endpoints/account.mjs';
// 던전 검증은 클라이언트와 같은 전투 로직(`src/ui/dungeonBattle.ts`)을 서버에서 리플레이한다 —
// 확장자 없는 TS import를 풀어 주는 ts 로더를 먼저 등록한 뒤 동적으로 불러온다.
const {dungeonEndpoint} = await import('../server/endpoints/dungeon.mjs');
const {onRequest: dungeonFunction} = await import('../functions/api/dungeon.js');
const {dungeonOperation} = await import('../server/dungeon.mjs');
const {tokenPayload} = await import('../server/auth.mjs');
const {DungeonBattle, DUNGEON_STEP, dungeonBattleSummary} = await import('../src/ui/dungeonBattle.ts');
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
  const register=async(loginId,name)=>{
    const body=await (await accountEndpoint(post('account',{action:'register',loginId,password:'dungeon-password-197',gender:'male'}),options)).json();
    return {...body,save:{...body.save,name}};
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
    const first=await register('dungeon197a','가람'),second=await register('dungeon197b','누리');
    for(let floor=1;floor<=4;floor++)await clear(first,floor,1_000_000+floor*60_000);
    const firstSubmit=await operation(first,'submit',9_000_000);
    assert.equal(firstSubmit.recorded,4);
    assert.deepEqual(firstSubmit.standing.top.map(row=>[row.rank,row.name,row.clearedFloor,row.mine]),[[1,'가람',4,true]]);
    assert.equal(firstSubmit.standing.mine.rank,1);
    assert.equal(firstSubmit.guest,false);

    // 같은 층은 먼저 기록한 쪽이 위에 남는다.
    for(let floor=1;floor<=4;floor++)await clear(second,floor,2_000_000+floor*60_000);
    const secondSubmit=await operation(second,'submit',9_000_000);
    assert.deepEqual(secondSubmit.standing.top.map(row=>[row.rank,row.name]),[[1,'가람'],[2,'누리']]);
    assert.equal(secondSubmit.standing.mine.rank,2);

    // 더 깊이 간 쪽이 1위가 되고, 최고층은 되돌릴 수 없다.
    for(let floor=5;floor<=6;floor++)await clear(first,floor,3_000_000+floor*60_000);
    const deeper=await operation(first,'submit',9_000_000);
    assert.equal(deeper.standing.top[0].clearedFloor,6);
    assert.equal(deeper.standing.top[0].name,'가람');
    // 세이브는 서버 기록보다 앞서지 못한다 — 검증 없이 2층으로 내려도 6층 그대로다.
    const lowered=await saveFloor(first,2);
    assert.equal(lowered.status,200);
    const reloaded=await (await accountEndpoint(post('account',{action:'load'},first.token),options)).json();
    assert.equal(reloaded.save.dungeonFloor,6,'서버는 저장된 최고층을 낮추지 않는다');
    const again=await operation(first,'submit',9_000_000);
    assert.equal(again.standing.top[0].clearedFloor,6);

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
