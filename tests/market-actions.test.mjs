import {test} from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {Market}=await import('../src/game/market.ts');
const snapshot=()=>({inbox:[],listings:[],watched:[],seq:0,total:0,page:0,myActive:0,revision:0,rules:{maxListings:30}});
test('market makes no request while idle and opens, tabs and refresh only query after explicit action',async()=>{
  const original=globalThis.fetch,oldEventSource=globalThis.EventSource;let requests=[];
  globalThis.fetch=async(_url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>snapshot()};};globalThis.EventSource=class{constructor(){throw new Error('automatic event stream is forbidden');}};
  try{
    const market=new Market({session:{token:'t'}});assert.equal(requests.length,0);
    market.open();await new Promise(r=>setImmediate(r));assert.equal(requests.length,1);
    market.switch('inbox');await new Promise(r=>setImmediate(r));assert.equal(requests.length,2);
    market.refresh();await new Promise(r=>setImmediate(r));assert.equal(requests.length,3);
    market.close();await new Promise(r=>setImmediate(r));assert.equal(requests.length,3);
  }finally{globalThis.fetch=original;globalThis.EventSource=oldEventSource;}
});
test('successful bulk claim removes acknowledged deliveries immediately with no extra list request',async()=>{
  const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('post-claim list reload is unnecessary');};
  try{
    const market=new Market({async mutate(){return {revision:2,effect:{deliveries:[],claimedIds:['one','two']}};}});market.data={...snapshot(),inbox:[{id:'one'},{id:'two'},{id:'overflow'}]};
    await market.act('claim',{deliveryId:'all'});assert.equal(market.error,'');assert.deepEqual(market.data.inbox.map(entry=>entry.id),['overflow']);assert.equal(market.busy,false);
  }finally{globalThis.fetch=original;}
});
test('recent price response from an older item cannot replace the current selection',async()=>{
  const original=globalThis.fetch,resolve=[];globalThis.fetch=()=>new Promise(r=>resolve.push(r));
  try{
    const market=new Market({session:{token:'t'}}),a={id:'a',name:'A',slot:'weapon',rarity:'rare'},b={...a,id:'b',name:'B'};
    const first=market.selectItem(a),second=market.selectItem(b);
    resolve[1]({ok:true,json:async()=>({lastPrice:200,count:1})});await second;
    resolve[0]({ok:true,json:async()=>({lastPrice:100,count:1})});await first;
    assert.equal(market.quote.itemId,'b');assert.equal(market.quote.lastPrice,200);
  }finally{globalThis.fetch=original;}
});

test('switching views aborts an outdated list request and preserves the new result',async()=>{
  const original=globalThis.fetch,pending=[];
  globalThis.fetch=(_url,options)=>new Promise((resolve,reject)=>{pending.push({options,resolve});options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')));});
  try{
    const market=new Market({session:{token:'t'}});market.open();market.switch('inbox');
    assert.equal(pending[0].options.signal.aborted,true);
    pending[1].resolve({ok:true,json:async()=>({...snapshot(),seq:9})});
    await new Promise(r=>setImmediate(r));assert.equal(market.data.seq,9);assert.equal(market.error,'');assert.equal(market.loading,false);
  }finally{globalThis.fetch=original;}
});

test('confirmed registration stays in the register tab and does not wait for another list request',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=()=>{throw new Error('registration must not reload the list');};
 try{
  const market=new Market({async mutate(){return {revision:2,effect:{listing:{id:'new',state:'active'},deliveries:[]}};}});market.data=snapshot();market.view='register';market.selectedItem='gear';market.price='100';
  await market.act('register',{itemId:'gear',price:100});assert.equal(market.error,'');assert.equal(market.view,'register');assert.equal(market.data.myActive,1);assert.equal(market.selectedItem,'');assert.equal(market.busy,false);assert.equal(market.loading,false);
 }finally{globalThis.fetch=previous;}
});
