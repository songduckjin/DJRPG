import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectionProvider} from '../server/market-connection.mjs';
test('concurrent and later market requests reuse one initialized connection',async()=>{
  let created=0,initialized=0,release;
  const gate=new Promise(resolve=>release=resolve),db={close(){throw new Error('warm connection must stay open');}};
  const get=connectionProvider(()=>{created++;return db;},async()=>{initialized++;await gate;});
  const a=get(),b=get();assert.equal(created,1);release();assert.equal(await a,db);assert.equal(await b,db);assert.equal(await get(),db);assert.equal(initialized,1);
});
test('failed connection initialization is closed and retried on the next request',async()=>{
  let created=0,closed=0;
  const get=connectionProvider(()=>({id:++created,close(){closed++;}}),async db=>{if(db.id===1)throw new Error('temporarily unavailable');});
  await assert.rejects(get(),/temporarily unavailable/);assert.equal(closed,1);assert.equal((await get()).id,2);assert.equal(created,2);
});
test('market connection does not reuse a database from a different runtime environment',async()=>{
  const get=connectionProvider(env=>({url:env.TURSO_DATABASE_URL,close(){}}),async()=>{});
  const first=await get({TURSO_DATABASE_URL:'libsql://one',TURSO_AUTH_TOKEN:'one'});
  const same=await get({TURSO_DATABASE_URL:'libsql://one',TURSO_AUTH_TOKEN:'one'});
  const second=await get({TURSO_DATABASE_URL:'libsql://two',TURSO_AUTH_TOKEN:'two'});
  assert.equal(first,same);assert.notEqual(first,second);
});
