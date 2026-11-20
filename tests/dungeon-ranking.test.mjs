import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createClient} from '@libsql/client';
import {accountEndpoint} from '../server/endpoints/account.mjs';
import {dungeonEndpoint} from '../server/endpoints/dungeon.mjs';
import {onRequest as dungeonFunction} from '../functions/api/dungeon.js';

const post=(path,body,token)=>new Request(`https://example.test/api/${path}`,{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body:JSON.stringify(body)});

test('던전 순위는 Pages Function으로 열리고 설정·토큰을 확인한다',async()=>{
  assert.equal((await dungeonFunction({request:new Request('https://example.test/api/dungeon'),env:{}})).status,405);
  const missing=await dungeonFunction({request:post('dungeon',{action:'list'}),env:{}});
  assert.equal(missing.status,503);assert.equal((await missing.json()).code,'DB_NOT_CONFIGURED');
  const unauthorized=await dungeonFunction({request:post('dungeon',{action:'list'}),env:{TURSO_DATABASE_URL:'libsql://example.test',TURSO_AUTH_TOKEN:'test'}});
  assert.equal(unauthorized.status,401);assert.equal((await unauthorized.json()).code,'INVALID_TOKEN');
});

test('던전 순위는 세이브의 최고층을 서버가 다시 읽어 상위 10위와 내 기록을 돌려준다',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'djrpg-dungeon-'));
  const env={TURSO_DATABASE_URL:`file:${join(directory,'dungeon.db')}`,TURSO_AUTH_TOKEN:'local-dungeon-key'};
  const options={env,createDbClient:({TURSO_DATABASE_URL})=>createClient({url:TURSO_DATABASE_URL})};
  const register=async(loginId,name)=>{
    const body=await (await accountEndpoint(post('account',{action:'register',loginId,password:'dungeon-password-197',gender:'male'}),options)).json();
    return {...body,save:{...body.save,name,dungeonFloor:4,dungeonClearAt:5}};
  };
  const saveFloor=async(session,floor)=>{
    const response=await accountEndpoint(post('account',{action:'save',revision:session.revision,characterSlot:1,save:{...session.save,dungeonFloor:floor}},session.token),options);
    const body=await response.json();session.revision=body.revision;session.save=body.save ?? session.save;
    return response;
  };
  const submit=async session=>{
    const response=await dungeonEndpoint(post('dungeon',{action:'submit'},session.token),options);
    return {status:response.status,body:await response.json()};
  };
  try{
    const first=await register('dungeon197a','가람'),second=await register('dungeon197b','누리');
    assert.equal((await saveFloor(first,4)).status,200);
    const firstSubmit=await submit(first);
    assert.equal(firstSubmit.status,200);
    assert.equal(firstSubmit.body.recorded,4);
    assert.deepEqual(firstSubmit.body.standing.top.map(row=>[row.rank,row.name,row.clearedFloor,row.mine]),[[1,'가람',4,true]]);
    assert.equal(firstSubmit.body.standing.mine.rank,1);
    assert.equal(firstSubmit.body.guest,false);

    // 같은 층은 먼저 기록한 쪽이 위에 남는다.
    assert.equal((await saveFloor(second,4)).status,200);
    const secondSubmit=await submit(second);
    assert.deepEqual(secondSubmit.body.standing.top.map(row=>[row.rank,row.name]),[[1,'가람'],[2,'누리']]);
    assert.equal(secondSubmit.body.standing.mine.rank,2);

    // 더 깊이 간 쪽이 1위가 되고, 최고층은 되돌릴 수 없다.
    assert.equal((await saveFloor(first,6)).status,200);
    const deeper=await submit(first);
    assert.equal(deeper.body.standing.top[0].clearedFloor,6);
    assert.equal(deeper.body.standing.top[0].name,'가람');
    await saveFloor(first,2);
    const reloaded=await (await accountEndpoint(post('account',{action:'load'},first.token),options)).json();
    assert.equal(reloaded.save.dungeonFloor,6,'서버는 저장된 최고층을 낮추지 않는다');
    const again=await submit(first);
    assert.equal(again.body.standing.top[0].clearedFloor,6);

    // 목록은 로그인만 있으면 누구나, 게스트 기록은 올리지 않는다.
    const guest=await (await accountEndpoint(post('account',{action:'guest'}),options)).json();
    const list=await dungeonEndpoint(post('dungeon',{action:'list'},guest.token),options);
    assert.equal(list.status,200);
    const listed=await list.json();
    assert.equal(listed.guest,true);assert.equal(listed.standing.mine,undefined);
    assert.equal(listed.standing.total,2);
    const blocked=await submit(guest);
    assert.equal(blocked.status,403);assert.equal(blocked.body.code,'GUEST_READ_ONLY');
    assert.equal((await dungeonEndpoint(post('dungeon',{action:'retire'},first.token),options)).status,400);

    // 계정 초기화는 세이브의 진행을 지우므로 순위 기록도 남기지 않는다.
    const resetResponse=await accountEndpoint(post('account',{action:'reset',revision:first.revision,characterSlot:1},first.token),options);
    assert.equal(resetResponse.status,200);
    const resetSave=(await resetResponse.json()).save;
    assert.equal(resetSave.dungeonFloor,0,'계정 초기화는 던전 진행도 지운다');
    first.revision=1;
    const cleared=await submit(first);
    assert.equal(cleared.body.standing.mine,undefined,'초기화된 계정의 순위 기록은 지워진다');
    assert.equal(cleared.body.standing.total,1);
  }finally{await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
