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
test('market automatically retries an unknown result and resumes auto combat', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { Market } = await import('../src/game/market.ts');
  const sync = setup(), market = new Market(sync), pauses = [], requests = [];
  sync.onPause = value => pauses.push(value);
  market.load = async () => {};
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body); requests.push(payload);
    if (requests.length <= 3) throw new Error('temporary outage');
    return response({ ok: true, revision: 1, save: sync.save, message: 'recovered' });
  };
  await market.act('buy', { listingId: 'offer' });
  assert(sync.pendingMarket); assert.deepEqual(pauses, [true]);
  t.mock.timers.tick(2000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sync.pendingMarket, undefined);
  assert.equal(pauses.at(-1), false);
  assert.equal(requests.length, 4);
  assert(requests.every(request => request.requestId === requests[0].requestId));
});
test('a stalled save times out so starting a trade cannot pause auto combat forever', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sync = setup(), pauses = [];
  sync.onPause = value => pauses.push(value);
  globalThis.fetch = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const saving = sync.flush();
  const trade = sync.mutate('buy', { listingId: 'offer' }, 'stalled-save-request');
  assert.deepEqual(pauses, [true]);
  t.mock.timers.tick(10_000);
  assert.equal(await saving, false);
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(10_000);
  await assert.rejects(trade, /이전 저장 결과/);
  assert.equal(sync.pendingMarket, undefined);
  assert.equal(pauses.at(-1), false);
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
test('market waits for every queued in-flight save before taking its revision snapshot',async()=>{
  const sync=setup(),requests=[];let completeFirst;
  globalThis.fetch=async(url,options)=>{
    const payload=JSON.parse(options.body);requests.push({url,payload});
    if(url==='/api/account' && payload.revision===0) return new Promise(resolve=>{completeFirst=()=>resolve(response({ok:true,revision:1}));});
    if(url==='/api/account') return response({ok:true,revision:2});
    return response({ok:true,save:payload.progress,revision:3});
  };
  const saving=sync.flush();sync.save.gold=50;sync.flush();
  const trade=sync.mutate('buy',{listingId:'offer'},'wait-for-all-saves');
  assert.deepEqual(requests.map(r=>r.url),['/api/account']);
  completeFirst();await saving;await trade;
  assert.deepEqual(requests.map(r=>r.url),['/api/account','/api/account','/api/market']);
  assert.equal(requests[1].payload.save.gold,50);
  assert.equal(requests[2].payload.revision,2);
  assert.equal(requests[2].payload.progress.gold,50);
  assert.equal(sync.revision,3);
});
test('failed in-flight save prevents market request and releases trade pause',async()=>{
  const sync=setup(),requests=[],pauses=[];let failFirst;
  sync.onPause=value=>pauses.push(value);
  globalThis.fetch=async(url,options)=>{
    const payload=JSON.parse(options.body);requests.push({url,payload});
    if(url==='/api/account' && requests.length===1) return new Promise((_resolve,reject)=>{failFirst=()=>reject(new Error('network down'));});
    if(url==='/api/account') throw new Error('network down');
    return response({ok:true,save:payload.progress,revision:1});
  };
  const saving=sync.flush();const trade=sync.mutate('buy',{listingId:'offer'},'blocked-by-save');
  failFirst();assert.equal(await saving,false);
  await assert.rejects(trade,/이전 저장 결과/);
  assert(requests.every(request=>request.url==='/api/account'));
  assert.equal(requests[0].payload.requestId,requests[1].payload.requestId);
  assert.equal(sync.locked,false);assert.equal(sync.pendingMarket,undefined);
  assert.equal(pauses.at(-1),false);
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

test('burst of loot changes queues one save instead of starting one for every item', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sync=setup(), requests=[];
  globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);return response({ok:true,revision:body.revision+1});};
  for(let i=1;i<=10;i++){sync.save.gold=i;sync.queueSave();}
  assert.equal(requests.length,0);t.mock.timers.tick(1000);await sync.active;
  assert.equal(requests.length,1);assert.equal(requests[0].save.gold,10);
});
test('purchase absorbs a queued autosave with no prior save request or delayed duplicate', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sync=setup(), requests=[];sync.save.gold=100;
  globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);requests.push({url,body});const saved=structuredClone(body.progress);saved.gold-=20;return response({ok:true,save:saved,revision:1});};
  sync.queueSave();await sync.mutate('buy',{listingId:'offer'},'queued-save-purchase');
  t.mock.timers.tick(2000);assert.equal(requests.length,1);assert.equal(requests[0].url,'/api/market');assert.equal(requests[0].body.progress.gold,100);assert.equal(sync.save.gold,80);
});
test('explicit save on leaving page flushes queued progress immediately once', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sync=setup(), requests=[];
  globalThis.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return response({ok:true,revision:1});};
  sync.save.gold=75;sync.queueSave();await sync.flush();t.mock.timers.tick(2000);
  assert.equal(requests.length,1);assert.equal(requests[0].save.gold,75);
});
