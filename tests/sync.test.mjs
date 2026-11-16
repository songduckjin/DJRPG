import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
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
test('market action includes progress in one request and retries the same transaction',async()=>{
  const sync=setup(),requests=[],pauses=[];sync.onPause=v=>pauses.push(v);let tries=0;
  globalThis.fetch=async(url,options)=>{const payload=JSON.parse(options.body);requests.push({url,payload});if(url==='/api/account')return response({ok:true,revision:1});if(++tries===1)throw new Error('response lost');const save=structuredClone(sync.save);save.gold=99;return response({ok:true,revision:2,save,message:'done'});};
  await sync.mutate('buy',{listingId:'listing'},'same-request-id-123');
  assert.equal(requests.length,2);assert(requests.every(r=>r.url==='/api/market'));
  assert.equal(requests[0].payload.listingId,'listing');assert.equal(requests[0].payload.revision,0);assert.equal(requests[0].payload.progress.gold,0);
  assert.deepEqual(requests[0].payload,requests[1].payload);assert.equal(sync.save.gold,99);assert.equal(sync.revision,2);assert.deepEqual(pauses,[true,false]);
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

test('no save in flight: successful purchase uses exactly one HTTP request',async()=>{
  const sync=setup(),requests=[];sync.save.gold=100;
  globalThis.fetch=async(url,options)=>{const payload=JSON.parse(options.body);requests.push({url,payload});const saved=structuredClone(payload.progress);saved.gold=80;return response({ok:true,save:saved,revision:1});};
  await sync.mutate('buy',{listingId:'listing'},'fast-purchase-request');
  assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/market');assert.equal(requests[0].payload.progress.gold,100);assert.equal(sync.save.gold,80);
});
test('in-flight save settles before combined trade without sending a second save',async()=>{
  const sync=setup(),requests=[];let completeSave;
  globalThis.fetch=async(url,options)=>{const payload=JSON.parse(options.body);requests.push({url,payload});if(url==='/api/account')return new Promise(resolve=>{completeSave=()=>resolve(response({ok:true,revision:1}));});return response({ok:true,save:payload.progress,revision:2});};
  const save=sync.flush();sync.save.gold=100;const trade=sync.mutate('claim',{deliveryId:'money'},'waiting-market-request');completeSave();await save;await trade;
  assert.equal(requests.length,2);assert.equal(requests[1].url,'/api/market');assert.equal(requests[1].payload.revision,1);assert.equal(requests[1].payload.progress.gold,100);
});
test('purchase completion renders before the follow-up list request resolves',async()=>{
  const { Market }=await import('../src/game/market.ts');const sync=setup();
  const sale={id:'offer',state:'active',item:{id:'item'},soldAt:null};
  const delivery={id:'delivery',item:{id:'item'},gold:0,reason:'구매',createdAt:1};
  sync.mutate=async()=>({ok:true,revision:1,save:sync.save,effect:{listing:{id:'offer',state:'sold'},deliveries:[delivery]}});
  const market=new Market(sync);market.data={listings:[sale],inbox:[],myActive:0,revision:0,seq:0};
  let fullUpdates=0;market.onChange=full=>{if(full)fullUpdates++;};
  globalThis.fetch=()=>new Promise(()=>{});
  await market.act('buy',{listingId:'offer'});
  assert.equal(market.busy,false);assert.equal(market.data.listings[0].state,'sold');assert.equal(market.data.inbox[0].id,'delivery');assert(fullUpdates>=2);
  sync.mutate=async()=>({ok:true,revision:2,save:sync.save,effect:{claimedId:'delivery',deliveries:[]}});
  await market.act('claim',{deliveryId:'delivery'});assert.equal(market.data.inbox.length,0);
});

test('seller history and inbox rerender on remote sale without waiting for manual refresh',async()=>{
  const { Market }=await import('../src/game/market.ts');const market=new Market(setup());market.opened=true;market.view='mine';
  market.data={listings:[{id:'remote-offer',state:'active'}],inbox:[],myActive:1,revision:0,seq:1};
  let full=false;market.onChange=v=>{full ||= v;};
  globalThis.fetch=async()=>response({listings:[{id:'remote-offer',state:'sold'}],inbox:[{id:'money',item:null,gold:95}],myActive:0,revision:0,seq:2,watched:[]});
  await market.load(false);assert(full);assert.equal(market.data.listings[0].state,'sold');assert.equal(market.data.inbox[0].gold,95);
});
