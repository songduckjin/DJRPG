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
test('503 DB_UNAVAILABLE releases the pending trade so market and mail buttons unlock',async()=>{
  const sync=setup(),messages=[],pauses=[],requests=[];sync.onMessage=message=>messages.push(message);sync.onPause=value=>pauses.push(value);
  globalThis.fetch=async(url,options)=>{requests.push(JSON.parse(options.body));return response({code:'DB_UNAVAILABLE',error:'서버 연결이 불안정합니다. 잠시 후 다시 시도하세요.'},503);};
  await assert.rejects(sync.mutate('claim',{deliveryId:'all'},'db-unavailable-request'),/서버 연결이 불안정합니다/);
  assert.equal(requests.length,1,'DB 연결 거절은 재시도 3회 없이 바로 알린다');
  assert.equal(sync.pendingMarket,undefined,'수령·우편 버튼을 잠그는 pendingMarket을 남기지 않는다');
  assert.equal(sync.locked,false);assert.equal(pauses.at(-1),false);
  assert.deepEqual(messages,['서버 연결이 불안정합니다. 잠시 후 다시 시도하세요.']);
  // 같은 화면에서 바로 다시 시도할 수 있고, 저장도 다시 진행된다.
  globalThis.fetch=async(_url,_options)=>response({ok:true,revision:1,save:sync.save,message:'수령 완료'});
  const result=await sync.mutate('claim',{deliveryId:'all'},'db-unavailable-retry');
  assert.equal(result.message,'수령 완료');assert.equal(sync.pendingMarket,undefined);assert.equal(sync.revision,1);
});
test('503 DB_NOT_CONFIGURED also releases the pending trade',async()=>{
  const sync=setup();
  globalThis.fetch=async()=>response({code:'DB_NOT_CONFIGURED',error:'서버 DB가 설정되지 않았습니다.'},503);
  await assert.rejects(sync.mutate('claim',{deliveryId:'money'},'db-not-configured-request'),/서버 DB가 설정되지 않았습니다/);
  assert.equal(sync.pendingMarket,undefined);assert.equal(sync.locked,false);
});
test('server 500 with an unknown result keeps the pending trade for idempotent re-check',async()=>{
  const sync=setup(),requests=[];let failures=3;
  globalThis.fetch=async(url,options)=>{requests.push({url,payload:JSON.parse(options.body)});if(failures-->0)return response({error:'서버 응답을 확인 중입니다.'},500);return response({ok:true,revision:2,save:sync.save});};
  await assert.rejects(sync.mutate('buy',{listingId:'x'},'unknown-result-request'),/거래 결과 다시 확인/);
  assert.equal(requests.length,3,'결과를 모르는 5xx는 같은 requestId로 다시 확인한다');
  assert.equal(sync.pendingMarket.requestId,'unknown-result-request');
  assert.equal(await sync.flush(),false,'결과를 확인하기 전에는 저장을 보내지 않는다');
  await sync.mutate('buy',{listingId:'x'},'unknown-result-request');
  assert.equal(sync.pendingMarket,undefined);assert.equal(sync.revision,2);
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

test('item and character conflicts reload the latest server save instead of retrying the same request', async () => {
  for (const code of ['ITEM_CONFLICT', 'CHARACTER_CONFLICT']) {
    const sync = setup(), requests = [], messages = [];
    let conflicts = 1;
    sync.onMessage = message => messages.push(message);
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body); requests.push({ url, body });
      if (body.action === 'save') {
        if (conflicts-- > 0) return response({ code, error: '최신 데이터를 다시 불러오세요.' }, 409);
        return response({ ok: true, revision: body.revision + 1 });
      }
      return response({ revision: 9, characterSlot: 1, save: { ...sync.session.save, gold: 42 } });
    };
    assert.equal(await sync.flush(), false);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requests.map(entry => entry.body.action), ['save', 'load'], code);
    assert.equal(sync.revision, 9, code);
    assert.equal(sync.save.gold, 42, code);
    assert.equal(sync.conflicted, false, code);
    assert(messages.some(message => message.includes('자동으로 다시 불러왔습니다.')), code);
    sync.save.gold = 43;
    assert.equal(await sync.flush(), true, code);
    assert.equal(requests.at(-1).body.revision, 9, code);
    assert.equal(requests.at(-1).body.save.gold, 43, code);
  }
});

test('a replaced session clears the token, stops saving and reports the login screen', async () => {
  const sync = setup(), removed = [], ended = [], requests = [];
  globalThis.localStorage = { removeItem: key => removed.push(key), getItem: () => null, setItem: () => {} };
  sync.onSessionEnded = message => ended.push(message);
  try {
    globalThis.fetch = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return response({ code: 'SESSION_REPLACED', error: '다른 기기에서 로그인되어 접속이 해제되었습니다.' }, 401);
    };
    assert.equal(await sync.flush(), false);
    assert.deepEqual(removed, ['djrpg.auth.token']);
    assert.equal(sync.conflicted, true);
    assert.deepEqual(ended, ['다른 기기에서 로그인되어 접속이 해제되었습니다.']);
    sync.save.gold = 99;
    assert.equal(await sync.flush(), false);
    assert.equal(requests.length, 1);
  } finally { delete globalThis.localStorage; }
});

test('변경이 없으면 5초 점검은 저장 요청을 보내지 않는다', async () => {
  const sync = setup(), requests = [];
  globalThis.fetch = async (_url, options) => { requests.push(JSON.parse(options.body)); return response({ ok: true, revision: requests.length }); };
  // 아직 아무것도 바뀌지 않았다 → 요청 0건.
  assert.equal(await sync.flushIfDirty(), true);
  assert.equal(requests.length, 0);
  sync.save.gold = 10; sync.markDirty();
  assert.equal(await sync.flushIfDirty(), true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].save.gold, 10);
  // 저장이 끝난 뒤에는 다시 보내지 않는다(예전에는 5초마다 무조건 보냈다).
  assert.equal(await sync.flushIfDirty(), true);
  assert.equal(requests.length, 1);
});

test('저장 중에 또 바뀐 진행은 응답을 받은 뒤 이어서 보낸다', async () => {
  const sync = setup(), requests = [];
  let release;
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    requests.push(payload);
    if (requests.length === 1) return new Promise(resolve => { release = () => resolve(response({ ok: true, revision: payload.revision + 1 })); });
    return response({ ok: true, revision: payload.revision + 1 });
  };
  sync.markDirty();
  const saving = sync.flush();
  sync.save.gold = 77; sync.markDirty();
  release();
  assert.equal(await saving, true);
  assert.equal(requests.length, 2, '저장 중 변경까지 두 번째 요청으로 보낸다');
  assert.equal(requests[1].save.gold, 77);
  assert.equal(requests[1].requestId === requests[0].requestId, false, '새 변경은 새 요청 번호');
  assert.equal(sync.revision, 2);
});

test('저장이 실패하면 같은 요청 번호로 다시 보내고, 성공한 뒤에는 변경이 남지 않는다', async () => {
  const sync = setup(), requests = [];
  let fail = true;
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    requests.push(payload);
    if (fail) { fail = false; throw new Error('lost response'); }
    return response({ ok: true, revision: payload.revision + 1 });
  };
  sync.save.kills = 3; sync.markDirty();
  assert.equal(await sync.flush(), false);
  assert.equal(await sync.flush(), true);
  assert.equal(requests[0].requestId, requests[1].requestId, '재시도는 같은 요청 번호');
  // 응답을 잃은 저장을 되살린 뒤에는 최신 상태를 한 번 더 확정 저장한다(그 뒤로는 조용하다).
  assert.equal(requests.length, 3);
  assert.equal(await sync.flushIfDirty(), true);
  assert.equal(requests.length, 3, '성공 뒤에는 더 보내지 않는다');
});
test('창고 이동은 보낼 변경이 없으면 저장 왕복 없이 요청 한 번으로 끝난다(작업 250)',async()=>{
  const sync=setup(),urls=[],payloads=[];
  globalThis.fetch=async(url,options)=>{urls.push(url);const payload=JSON.parse(options.body);payloads.push(payload);return response({ok:true,revision:1,save:sync.save,items:[],message:'보관했습니다.'});};
  const result=await sync.transferWarehouse('deposit',['a','b']);
  assert.deepEqual(urls,['/api/warehouse'],'저장(dirty=false)이면 /api/account를 부르지 않는다');
  assert.equal(payloads[0].requestId.length>=16,true,'재확인용 requestId를 함께 보낸다');
  assert.deepEqual(payloads[0].itemIds,['a','b']);
  assert.equal(result.message,'보관했습니다.');assert.equal(sync.revision,1);assert.equal(sync.locked,false);
});
test('보낼 변경이 있으면 저장을 따로 왕복하지 않고 진행 세이브를 창고 요청에 실어 보낸다(작업 258)',async()=>{
  const sync=setup(),urls=[],payloads=[];
  sync.save.gold=77;sync.markDirty();
  globalThis.fetch=async(url,options)=>{urls.push(url);const payload=JSON.parse(options.body);payloads.push(payload);return response({ok:true,revision:1,save:{...sync.save,bag:[]},items:[],message:'보관했습니다.'});};
  await sync.transferWarehouse('deposit','a');
  // 예전에는 사냥 중이면 `/api/account`(저장) → `/api/warehouse` 두 번을 왕복했다. 지금은 한 번이다.
  assert.deepEqual(urls,['/api/warehouse'],'저장(/api/account) 왕복 없이 요청 한 번');
  assert.equal(payloads[0].progress.gold,77,'보낼 변경을 progress로 함께 보낸다');
  assert.equal(payloads[0].revision,0,'서버가 이 revision 위에 이동+저장을 한 트랜잭션으로 적용한다');
  assert.equal(sync.revision,1);assert.equal(sync.dirty,false);assert.equal(sync.locked,false);
});
test('응답을 잃은 창고 이동은 화면을 잠그지 않고 같은 requestId로 뒤에서 다시 확인한다(작업 258)',async()=>{
  const sync=setup(),messages=[],pauses=[],requests=[];let offline=true;
  sync.onMessage=message=>messages.push(message);sync.onPause=value=>pauses.push(value);
  globalThis.fetch=async(url,options)=>{const payload=JSON.parse(options.body);requests.push(payload);if(offline)throw new Error('offline');return response({ok:true,revision:1,save:sync.save,moved:['bag-1'],items:[],message:'보관했습니다.'});};
  try{
    await assert.rejects(sync.transferWarehouse('deposit',['bag-1']),/확인하지 못했습니다/);
    assert.equal(requests.length,2,'6초×2회까지만 기다린다');
    assert.equal(requests[0].requestId,requests[1].requestId,'재확인은 같은 requestId(서버 멱등)');
    assert.equal(sync.pendingWarehouse,undefined,'결과 미확인 상태를 남겨 다음 이동을 막지 않는다');
    assert.equal(sync.locked,false,'실패해도 화면 잠금은 풀린다');
    assert.equal(pauses.at(-1),false,'게임이 멈춘 채 얼지 않는다');
    assert(messages.length>=1,'실패는 화면에 바로 알린다');
    assert.equal(sync.warehouseSettling,true,'화면 밖에서 같은 요청으로 결과를 확인한다');
    // 그 사이 새 이동은 "이전 창고 이동 결과를 확인 중"이 아니라 무엇을 기다리는지 분명한 문구로 막는다.
    await assert.rejects(sync.transferWarehouse('withdraw',['s-1']),/창고 상태를 다시 확인하는 중입니다/);
    assert.equal(await sync.flush(),false,'확인이 끝날 때까지 저장은 잠깐 미룬다(revision 경합 방지)');
    offline=false;
    const recovered=new Promise((resolve,reject)=>{sync.onWarehouseRecovered=()=>resolve();setTimeout(()=>reject(new Error('자동 확인이 끝나지 않았다')),4_000);});
    await recovered;
    assert.equal(sync.revision,1,'재확인이 revision을 서버 값으로 맞춘다');
    assert.equal(sync.warehouseSettling,false);
    assert.equal(sync.locked,false);
  }finally{sync.resetForCharacterSwitch();}
});
test('창고 이동의 서버 거절(409)은 결과를 남기지 않고 바로 선택을 다시 누를 수 있게 한다(작업 258)',async()=>{
  const sync=setup(),requests=[];
  globalThis.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return response({code:'ITEM_NOT_AVAILABLE',error:'창고 아이템 상태가 달라졌습니다. 다시 불러오세요.'},409);};
  try{
    await assert.rejects(sync.transferWarehouse('withdraw',['s-1']),/창고 아이템 상태가 달라졌습니다/);
    assert.equal(requests.length,1,'4xx는 확정 결과 — 같은 요청을 다시 보내지 않는다');
    assert.equal(sync.pendingWarehouse,undefined);assert.equal(sync.locked,false);assert.equal(sync.warehouseSettling,false);
  }finally{sync.resetForCharacterSwitch();}
});

test('저장이 서버 검사(가방 40칸 초과)에서 거절되면 최신 서버 세이브로 다시 맞춰 저장 교착을 푼다', async () => {
  const sync = setup(), requests = [];
  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    requests.push({ url, payload });
    if (url === '/api/account' && payload.action === 'save') {
      return response({ code: 'INVALID_SAVE', error: '가방이 40칸까지입니다. 장비·다른 직업 스킬북을 분해하거나 거래소에 올려 자리를 비워 주세요.' }, 400);
    }
    if (url === '/api/account') return response({ ok: true, accountId: 'test', token: 'test-token', revision: 7, save: { ...sync.save, gold: 5 }, characterSlot: 1 });
    return response({ ok: true, save: payload.progress, revision: 8, message: '수령 완료' });
  };
  sync.save.gold = 99; sync.markDirty();
  assert.equal(await sync.flush(), false, '거절된 저장은 실패로 돌아온다');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(sync.pendingSave, undefined, '거절된 스냅샷을 계속 들고 있지 않는다');
  assert.equal(sync.conflicted, false, '새로고침을 요구하는 잠금으로 남기지 않는다');
  assert.equal(sync.revision, 7, '서버의 최신 revision을 받아들인다');
  assert.equal(sync.save.gold, 5);
  // 거래·우편 수령은 다시 진행된다(작업 246 — 우편함이 잠기던 경로).
  const result = await sync.mutate('journey-claim', { kind: 'mail', id: 'all' }, 'after-invalid-save');
  assert.equal(result.message, '수령 완료');
  assert.deepEqual(requests.map(request => `${request.url}:${request.payload.action ?? ''}`), ['/api/account:save', '/api/account:load', '/api/market:journey-claim']);
});

test('저장이 막혀 거래를 시작하지 못하면 서버가 알려 준 실제 이유를 함께 보여 준다', async () => {
  const sync = setup();
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal(await sync.flush(), false);
  await assert.rejects(sync.mutate('journey-claim', { kind: 'mail', id: 'all' }, 'blocked-by-save'), /이전 저장 결과를 확인해야 거래할 수 있습니다\. \(게임에 접속 중입니다/);
});
