import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.endsWith('.ts')) {
      const url = new URL(specifier + '.ts', context.parentURL);
      if (existsSync(url)) return { url: url.href, shortCircuit: true };
    }
    return next(specifier,context);
  },
  load(url, context, next) {
    if (url.endsWith('.ts')) return { format:'module', source: ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, shortCircuit: true };
    return next(url,context);
  }
});
const { SaveSync } = await import('../src/game/sync.ts');
const { freshSave } = await import('../src/game/store.ts');
const response = (body, status = 200) => ({ok:status<400,status,json:async()=>body});
function setup() { const save = freshSave(); return new SaveSync(save,{accountId:'test',token:'test-token',revision:0,save}); }
test('save retries use same request ID, then save newer local changes',async()=>{
  const sync=setup(),requests=[]; let fail=true;
  globalThis.fetch=async(_url,options)=>{const payload=JSON.parse(options.body);requests.push(payload);if(fail){fail=false;throw new Error('lost response');}return response({ok:true,revision:payload.revision+1});};
  assert.equal(await sync.flush(),false); sync.save.gold=50;
  assert.equal(await sync.flush(),true);
  assert.equal(requests[0].requestId,requests[1].requestId);
  assert.equal(requests[1].save.gold,0);assert.equal(requests[2].save.gold,50);assert.equal(sync.revision,2);
});
test('market action flushes first, sends flattened payload and retries same transaction',async()=>{
  const sync=setup(),requests=[],pauses=[];sync.onPause=v=>pauses.push(v);let tries=0;
  globalThis.fetch=async(url,options)=>{const payload=JSON.parse(options.body);requests.push({url,payload});if(url==='/api/account')return response({ok:true,revision:1});if(++tries===1)throw new Error('response lost');const save=structuredClone(sync.save);save.gold=99;return response({ok:true,revision:2,save,message:'done'});};
  await sync.mutate('buy',{listingId:'listing'},'same-request-id-123');
  assert.equal(requests[1].payload.listingId,'listing');assert.equal(requests[1].payload.revision,1);
  assert.deepEqual(requests[1].payload,requests[2].payload);assert.equal(sync.save.gold,99);assert.equal(sync.revision,2);assert.deepEqual(pauses,[true,false]);
});
test('unknown market result pauses gameplay and prevents saves until idempotent recovery',async()=>{
  const sync=setup();let offline=true;const requests=[],pauses=[];sync.onPause=v=>pauses.push(v);
  globalThis.fetch=async(url,options)=>{const payload=JSON.parse(options.body);requests.push(payload);if(url==='/api/account')return response({ok:true,revision:1});if(offline)throw new Error('offline');return response({ok:true,revision:2,save:sync.save});};
  await assert.rejects(sync.mutate('buy',{listingId:'x'},'persistent-request-123'));
  assert(sync.pendingMarket);const count=requests.length;assert.equal(await sync.flush(),false);assert.equal(requests.length,count);assert.deepEqual(pauses,[true]);
  offline=false;await sync.mutate('buy',{listingId:'x'},'persistent-request-123');assert.equal(sync.pendingMarket,undefined);assert.equal(sync.revision,2);assert.equal(pauses.at(-1),false);
});
test('failed validation resumes gameplay without leaving a pending transaction',async()=>{
  const sync=setup();const pauses=[];sync.onPause=v=>pauses.push(v);
  globalThis.fetch=async(url)=>url==='/api/account'?response({ok:true,revision:1}):response({code:'INSUFFICIENT_GOLD',error:'골드 부족'},400);
  await assert.rejects(sync.mutate('buy',{listingId:'x'},'validation-request-123'),/골드 부족/);
  assert.equal(sync.pendingMarket,undefined);assert.equal(sync.locked,false);assert.equal(pauses.at(-1),false);
});
