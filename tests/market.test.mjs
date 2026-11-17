import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { schema, account, assertRevision, transaction, writeSave, reconcileItems } from '../server/database.mjs';
import { mutate, snapshot } from '../server/market.mjs';
import handler from '../api/account.mjs';
import { createHmac, randomUUID } from 'node:crypto';
let db, directory;
const item = (id = randomUUID(), slot = 'weapon') => ({ id, name: '강철 쯔바이핸드', slot, rarity: 'rare', stats: { attack: 25, crit: 4 } });
const save = (bag = [], gold = 10000) => ({ version: 1, name: '전사', gender: 'male', gold, bag, equipment: {}, floor: 1, maxFloor: 1, level: 1, health: 100, kills: 0 });
async function seed(id, bag = [item()], gold = 10000, guest = false) {
  await db.execute({ sql: 'INSERT INTO djrpg_accounts VALUES (?,?,?,?)', args: [id, guest ? 'guest' : 'test-password-hash', JSON.stringify(save(bag,gold)), new Date().toISOString()] });
}
async function action(id, action, data = {}, requestId = randomUUID()) { const row = await account(db,id); return mutate(db,id,{action, ...data, revision: row.revision, requestId}); }
async function sale(seller = 'seller', price = 100) {
  const row = await account(db, seller), selected = row.save.bag[0];
  await action(seller,'register',{itemId:selected.id,price});
  const all = await snapshot(db,seller,{view:'mine'});
  return all.listings.find(r => r.state === 'active');
}
const error = code => e => e.code === code;
before(async () => {
  directory = await mkdtemp(join(tmpdir(),'djrpg-market-test-'));
  db = createClient({url:`file:${join(directory,'market.db')}`}); await schema(db);
  await seed('seller',[item(),item(),item(),item(),item()]);
  await seed('buyer',[]); await seed('buyer2',[]); await seed('guest',[],10000,true);
});
after(async () => { await db.close(); await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100}); });
test('listing escrows a persisted item, all accounts can search, private IDs stay private', async () => {
  const listing = await sale();
  const row = await account(db,'seller'); assert(!row.save.bag.some(i=>i.id===listing.item.id));
  const result = await snapshot(db,'guest',{query:'쯔바이',category:'weapon',rarity:'rare',stat:'attack',minStat:20,minPrice:90,maxPrice:110});
  assert.equal(result.total,1); assert.equal(result.listings[0].sellerName,'전사'); assert(!('seller' in result.listings[0]));
  assert.equal((await snapshot(db,'buyer',{stat:'attack',minStat:100})).total,0);
});
test('epic and unique equipment save, list, and filter through the market', async () => {
  const epic = { ...item(), rarity: 'epic', name: '비전의 쯔바이핸드' };
  const unique = { ...item(), rarity: 'unique', name: '고대의 쯔바이핸드' };
  await seed('six-grade-seller', [epic, unique]);
  await action('six-grade-seller', 'register', { itemId: epic.id, price: 111 });
  await action('six-grade-seller', 'register', { itemId: unique.id, price: 222 });
  for (const [rarity, expected] of [['epic', epic.id], ['unique', unique.id]]) {
    const result = await snapshot(db, 'guest', { view: 'active', rarity });
    assert(result.listings.some(listing => listing.item.id === expected));
    assert(result.listings.every(listing => listing.item.rarity === rarity));
  }
  const listings = (await snapshot(db, 'six-grade-seller', { view: 'mine' })).listings.filter(listing => listing.state === 'active');
  for (const listing of listings) await action('six-grade-seller', 'cancel', { listingId: listing.id });
});
test('guests are read-only, own listing and insufficient gold cannot buy', async () => {
  const listing = (await snapshot(db,'seller',{view:'active'})).listings[0];
  await assert.rejects(action('guest','buy',{listingId:listing.id}),error('GUEST_READ_ONLY'));
  await assert.rejects(action('seller','buy',{listingId:listing.id}),error('OWN_LISTING'));
  await seed('poor',[],0); await assert.rejects(action('poor','buy',{listingId:listing.id}),error('INSUFFICIENT_GOLD'));
});
test('two simultaneous buyers: exactly one purchase; exact debit, fee, delivery, sold history', async () => {
  const listing = (await snapshot(db,'seller',{view:'active'})).listings[0];
  const buyers = ['buyer','buyer2'];
  const outcomes = await Promise.allSettled(buyers.map(id=>action(id,'buy',{listingId:listing.id})));
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  const winner = buyers[outcomes.findIndex(r=>r.status==='fulfilled')];
  assert.equal((await account(db,winner)).save.gold,9900);
  const delivery = (await snapshot(db,winner,{view:'mine'})).inbox.find(r=>r.item);
  assert.equal(delivery.item.id,listing.item.id);
  const proceeds = (await snapshot(db,'seller',{view:'mine'})).inbox.find(r=>!r.item);
  assert.equal(proceeds.gold,95);
  assert.equal((await snapshot(db,'guest',{view:'sold'})).listings[0].price,100);
  await action(winner,'claim',{deliveryId:delivery.id});
  assert((await account(db,winner)).save.bag.some(i=>i.id===listing.item.id));
  await assert.rejects(action(winner,'claim',{deliveryId:delivery.id}),error('ALREADY_CLAIMED'));
  await action('seller','claim',{deliveryId:proceeds.id}); assert.equal((await account(db,'seller')).save.gold,10095);
});
test('duplicate request replay never charges twice and returns latest state', async () => {
  const listing = await sale(), requestId = randomUUID(), before = await account(db,'buyer');
  const payload = {action:'buy',listingId:listing.id,requestId,revision:before.revision};
  const first = await mutate(db,'buyer',payload), again = await mutate(db,'buyer',payload);
  assert.equal(first.save.gold,again.save.gold); assert.equal(first.revision,again.revision);
});
test('cancel authorization and return via inbox, bag full preserves delivery', async () => {
  const listing = await sale();
  await assert.rejects(action('buyer','cancel',{listingId:listing.id}),error('NOT_OWNER'));
  await action('seller','cancel',{listingId:listing.id});
  const delivery = (await snapshot(db,'seller',{view:'mine'})).inbox.find(r=>r.item?.id===listing.item.id);
  await transaction(db,async tx=>{const row=await account(tx,'seller'); row.save.bag=Array.from({length:40},()=>item()); await writeSave(tx,row,row.save);});
  await assert.rejects(action('seller','claim',{deliveryId:delivery.id}),error('BAG_FULL'));
  assert((await snapshot(db,'seller',{view:'mine'})).inbox.some(r=>r.id===delivery.id));
  await transaction(db,async tx=>{const row=await account(tx,'seller'); row.save.bag.pop(); await writeSave(tx,row,row.save);});
  await action('seller','claim',{deliveryId:delivery.id}); assert.equal((await account(db,'seller')).save.bag.length,40);
});
test('expiry returns an item once and makes buying impossible', async () => {
  await seed('expired',[item()]); const listing=await sale('expired');
  await db.execute({sql:'UPDATE djrpg_market SET expires_at=? WHERE id=?',args:[Date.now()-1000,listing.id]});
  await snapshot(db,'buyer',{}); await snapshot(db,'buyer',{});
  const deliveries=(await snapshot(db,'expired',{view:'mine'})).inbox;
  assert.equal(deliveries.length,1); assert.equal(deliveries[0].item.id,listing.item.id);
  await assert.rejects(action('buyer','buy',{listingId:listing.id}),error('NOT_AVAILABLE'));
});
test('registration limits, integer prices and equipped items are enforced',async()=>{
  await seed('limit',Array.from({length:31},()=>item()));
  for(let i=0;i<30;i++) await sale('limit');
  assert.equal((await snapshot(db,'limit',{})).myActive,30);
  const next=(await account(db,'limit')).save.bag[0];
  await assert.rejects(action('limit','register',{itemId:next.id,price:100}),error('LISTING_LIMIT'));
  await assert.rejects(action('buyer','register',{itemId:'missing',price:1.5}),error('INVALID_PRICE'));
  await assert.rejects(action('buyer','register',{itemId:'missing',price:100}),error('ITEM_NOT_AVAILABLE'));
});
test('old save revision and escrow resurrection are rejected',async()=>{
  await seed('stale',[item()]); const old=await account(db,'stale'); await sale('stale');
  await assert.rejects(transaction(db,async tx=>{const row=await account(tx,'stale'); assertRevision(row,old.revision);}),error('SAVE_CONFLICT'));
  await assert.rejects(transaction(db,async tx=>{const row=await account(tx,'stale'); await reconcileItems(tx,'stale',row.save,old.save);}),error('ITEM_CONFLICT'));
});
test('skillbooks are tradable, item stats immutable and duplicate inventory forbidden',async()=>{
  const book={id:randomUUID(),name:'[스킬북] 소드 슬래시',slot:'skillbook',kind:'skillbook',skillId:'slash2',rarity:'rare',stats:{}};
  await seed('books',[book]); const listing=await sale('books'); assert.equal(listing.item.skillId,'slash2');
  await seed('immutable',[item()]);
  await transaction(db,async tx=>{const row=await account(tx,'immutable'); await reconcileItems(tx,'immutable',row.save,row.save);});
  await assert.rejects(transaction(db,async tx=>{const row=await account(tx,'immutable'),next=structuredClone(row.save);next.bag[0].stats.attack=999;await reconcileItems(tx,'immutable',row.save,next);}),error('ITEM_CONFLICT'));
  await assert.rejects(transaction(db,async tx=>{const row=await account(tx,'immutable');row.save.bag.push(row.save.bag[0]);await reconcileItems(tx,'immutable',row.save,row.save);}),error('INVALID_ITEM'));
});
test('account API rejects legacy saves and applies revision-aware saves',async()=>{
  process.env.TURSO_DATABASE_URL=`file:${join(directory,'market.db')}`;process.env.TURSO_AUTH_TOKEN='local-test-key';
  const value=Buffer.from(JSON.stringify({id:'buyer',exp:Date.now()+60000})).toString('base64url');
  const token=`${value}.${createHmac('sha256','local-test-key').update(value).digest('base64url')}`;
  async function call(body){const result={status:0,body:null};const res={status(n){result.status=n;return this;},json(v){result.body=v;return this;}};await handler({method:'POST',headers:{authorization:`Bearer ${token}`},body},res);return result;}
  const row=await account(db,'buyer');
  assert.equal((await call({action:'save',save:row.save})).status,409);
  const result=await call({action:'save',save:row.save,revision:row.revision});assert.equal(result.status,200);assert.equal(result.body.revision,row.revision+1);
  assert.equal((await call({action:'save',save:row.save,revision:row.revision})).body.code,'SAVE_CONFLICT');
  delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
});

test('public change sequence and watched states report new and sold offers',async()=>{
  await seed('live',[item()]);
  const before=await snapshot(db,'buyer',{}), listing=await sale('live');
  const registered=await snapshot(db,'buyer',{watchIds:[listing.id]});
  assert(registered.seq>before.seq);assert.equal(registered.watched[0].state,'active');
  await action('buyer','buy',{listingId:listing.id});
  const sold=await snapshot(db,'buyer2',{watchIds:[listing.id]});assert(sold.seq>registered.seq);assert.equal(sold.watched[0].state,'sold');
});
test('all trade money and item fields come from server inventory, never a submitted draft',async()=>{
  await seed('draft',[item()]);const row=await account(db,'draft'), actual=row.save.bag[0];
  await action('draft','register',{itemId:actual.id,price:200,item:{...actual,stats:{attack:999999}},save:{gold:99999999}});
  const listing=(await snapshot(db,'buyer',{query:'쯔바이',minPrice:200,maxPrice:200})).listings[0];assert.equal(listing.item.stats.attack,25);
  const before=await account(db,'buyer2');
  await action('buyer2','buy',{listingId:listing.id,price:1,gold:999999});assert.equal((await account(db,'buyer2')).save.gold,before.save.gold-200);
});
test('save response loss is recovered idempotently and reset cannot strand market inventory',async()=>{
  process.env.TURSO_DATABASE_URL=`file:${join(directory,'market.db')}`;process.env.TURSO_AUTH_TOKEN='local-test-key';
  const value=Buffer.from(JSON.stringify({id:'limit',exp:Date.now()+60000})).toString('base64url');const token=`${value}.${createHmac('sha256','local-test-key').update(value).digest('base64url')}`;
  async function call(body){const result={status:0,body:null};const res={status(n){result.status=n;return this;},json(v){result.body=v;return this;}};await handler({method:'POST',headers:{authorization:`Bearer ${token}`},body},res);return result;}
  const row=await account(db,'limit'),requestId=randomUUID(),payload={action:'save',save:row.save,revision:row.revision,requestId};
  const first=await call(payload),replay=await call(payload);assert.equal(first.status,200);assert.equal(replay.status,200);assert.equal(first.body.revision,replay.body.revision);
  const reset=await call({action:'reset',revision:first.body.revision});assert.equal(reset.body.code,'MARKET_PENDING');
  delete process.env.TURSO_DATABASE_URL;delete process.env.TURSO_AUTH_TOKEN;
});

test('ordinary snapshot is a single read batch without acquiring a write transaction',async()=>{
  let batches=0;
  const readOnly={batch(statements,mode){batches++;assert.equal(mode,'read');return db.batch(statements,mode);},transaction(){throw new Error('snapshot must not acquire writer lock');},execute(){throw new Error('snapshot must batch independent queries');}};
  const result=await snapshot(readOnly,'buyer',{view:'sold'});assert(result.listings.length);assert.equal(batches,1);
});
test('schema initialization is reused, not rewritten for every request',async()=>{
  let batches=0;const wrapped={batch(...args){batches++;return db.batch(...args);}};
  await schema(wrapped);await schema(wrapped);assert.equal(batches,1);
});
test('unsaved progression and a purchase commit atomically, including response effects',async()=>{
  await seed('atomic-seller',[item()]);await seed('atomic-buyer',[],50);
  const listing=await sale('atomic-seller',100), row=await account(db,'atomic-buyer'),progress=structuredClone(row.save);progress.gold=150;progress.kills=25;
  const result=await mutate(db,'atomic-buyer',{action:'buy',listingId:listing.id,progress,revision:row.revision,requestId:randomUUID()});
  assert.equal(result.revision,row.revision+1);assert.equal(result.save.gold,50);assert.equal(result.save.kills,25);assert.equal(result.effect.listing.state,'sold');assert.equal(result.effect.deliveries[0].item.id,listing.item.id);
  const persisted=await account(db,'atomic-buyer');assert.equal(persisted.save.gold,50);assert.equal(persisted.revision,result.revision);
});
test('failed combined purchase rolls back progression, original ownership and revision',async()=>{
  const row=await account(db,'atomic-buyer'),progress=structuredClone(row.save);progress.gold+=500;
  await assert.rejects(mutate(db,'atomic-buyer',{action:'buy',listingId:'missing',progress,revision:row.revision,requestId:randomUUID()}),error('NOT_AVAILABLE'));
  const after=await account(db,'atomic-buyer');assert.equal(after.revision,row.revision);assert.equal(after.save.gold,row.save.gold);
});
test('buy and money claim group their independent reads and writes into two DB batches',async()=>{
  await seed('fast-seller',[item()]);await seed('fast-buyer',[]);const listing=await sale('fast-seller');
  let reads=0,batches=0;
  const measured={async transaction(mode){const tx=await db.transaction(mode);return {get closed(){return tx.closed;},execute(...args){reads++;return tx.execute(...args);},batch(...args){batches++;return tx.batch(...args);},commit:()=>tx.commit(),rollback:()=>tx.rollback(),close:()=>tx.close()};}};
  const row=await account(db,'fast-buyer');await mutate(measured,'fast-buyer',{action:'buy',listingId:listing.id,revision:row.revision,requestId:randomUUID()});assert.equal(reads,0);assert.equal(batches,2);
  const delivery=(await snapshot(db,'fast-seller',{view:'mine'})).inbox.find(i=>!i.item),seller=await account(db,'fast-seller');
  reads=0;batches=0;await mutate(measured,'fast-seller',{action:'claim',deliveryId:delivery.id,revision:seller.revision,requestId:randomUUID()});assert.equal(reads,0);assert.equal(batches,2);
});

test('older saves preserve recorded discoveries while an explicit reset clears them',async()=>{
  await seed('collection',[]);
  await transaction(db,async tx=>{const row=await account(tx,'collection'),next=structuredClone(row.save);next.equipmentCollection=['weapon:3'];await writeSave(tx,row,next);});
  await transaction(db,async tx=>{const row=await account(tx,'collection'),next=structuredClone(row.save);delete next.equipmentCollection;await writeSave(tx,row,next);});
  assert.deepEqual((await account(db,'collection')).save.equipmentCollection,['weapon:3']);
  await transaction(db,async tx=>{const row=await account(tx,'collection');await writeSave(tx,row,save([]),[],false);});
  assert.deepEqual((await account(db,'collection')).save.equipmentCollection,[]);
});

test('purchase and claim reconcile new loot in two DB batches with no extra ownership requests',async()=>{
  await seed('batch-seller',[item()]);await seed('batch-buyer',[]);
  const offer=await sale('batch-seller',100);let batches=0,executes=0;
  const counted={async transaction(mode){
    const tx=await db.transaction(mode);
    return {batch(ops){batches++;return tx.batch(ops);},execute(op){executes++;return tx.execute(op);},commit:()=>tx.commit(),rollback:()=>tx.rollback(),close:()=>tx.close(),get closed(){return tx.closed;}};
  }};
  const buyer=await account(db,'batch-buyer'),loot=item();buyer.save.bag.push(loot);
  const bought=await mutate(counted,'batch-buyer',{action:'buy',listingId:offer.id,revision:buyer.revision,requestId:randomUUID(),progress:buyer.save});
  assert.equal(batches,2);assert.equal(executes,0);
  assert.equal((await db.execute({sql:'SELECT location FROM djrpg_item_owners WHERE item_id=?',args:[loot.id]})).rows[0].location,'inventory');
  batches=0;executes=0;const progress=structuredClone(bought.save),secondLoot=item();progress.bag.push(secondLoot);
  const claimed=await mutate(counted,'batch-buyer',{action:'claim',deliveryId:bought.effect.deliveries[0].id,revision:bought.revision,requestId:randomUUID(),progress});
  assert.equal(batches,2);assert.equal(executes,0);assert(claimed.save.bag.some(entry=>entry.id===offer.item.id));
  assert.equal((await db.execute({sql:'SELECT location FROM djrpg_item_owners WHERE item_id=?',args:[secondLoot.id]})).rows[0].location,'inventory');
});
test('batched inventory reconciliation rejects foreign ownership and rolls back queued inserts on failed purchase',async()=>{
  await seed('batch-owner',[item()]);await seed('batch-thief',[],0);
  const offer=await sale('batch-owner',100),buyer=await account(db,'batch-thief'),loot=item();buyer.save.bag.push(loot);
  await assert.rejects(mutate(db,'batch-thief',{action:'buy',listingId:offer.id,revision:buyer.revision,requestId:randomUUID(),progress:buyer.save}),error('INSUFFICIENT_GOLD'));
  assert.equal((await db.execute({sql:'SELECT * FROM djrpg_item_owners WHERE item_id=?',args:[loot.id]})).rows.length,0);
  buyer.save.bag=[offer.item];
  await assert.rejects(mutate(db,'batch-thief',{action:'claim',deliveryId:'missing',revision:buyer.revision,requestId:randomUUID(),progress:buyer.save}),error('ITEM_CONFLICT'));
  assert.equal((await account(db,'batch-thief')).revision,buyer.revision);
});

test('locked inventory cannot list without approval; failed approval retains lock and successful listing unlocks atomically',async()=>{
  const protectedItem={...item(),locked:true};await seed('lock-seller',[protectedItem]);
  await assert.rejects(action('lock-seller','register',{itemId:protectedItem.id,price:100}),error('ITEM_LOCKED'));
  assert.equal((await account(db,'lock-seller')).save.bag[0].locked,true);
  await assert.rejects(action('lock-seller','register',{itemId:protectedItem.id,price:0,unlockItem:true}),error('INVALID_PRICE'));
  assert.equal((await account(db,'lock-seller')).save.bag[0].locked,true);
  const row=await account(db,'lock-seller'),requestId=randomUUID(),payload={action:'register',itemId:protectedItem.id,price:100,unlockItem:true,revision:row.revision,requestId};
  const registered=await mutate(db,'lock-seller',payload),replayed=await mutate(db,'lock-seller',payload);
  assert.equal(registered.revision,replayed.revision);
  const offers=await snapshot(db,'lock-seller',{view:'mine'});assert.equal(offers.listings.length,1);assert.equal(offers.listings[0].item.locked,false);
  assert.equal((await account(db,'lock-seller')).save.bag.length,0);
});

test('selected option sorts all matches by stat descending before pagination, overriding price order',async()=>{
  const now=Date.now(),operations=[];
  for(let value=1;value<=23;value++){
    const gear={...item(),name:'옵션정렬검',stats:{attack:value}};
    operations.push({sql:'INSERT INTO djrpg_market VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,NULL)',args:[randomUUID(),'seller','전사',JSON.stringify(gear),gear.name,gear.slot,gear.rarity,value,'active',now+value,now+3600000]});
  }
  await db.batch(operations);
  const first=await snapshot(db,'buyer',{query:'옵션정렬검',stat:'attack',sort:'priceAsc'});
  assert.equal(first.total,23);assert.deepEqual(first.listings.map(s=>s.item.stats.attack),Array.from({length:20},(_,i)=>23-i));
  const second=await snapshot(db,'buyer',{query:'옵션정렬검',stat:'attack',page:1});assert.deepEqual(second.listings.map(s=>s.item.stats.attack),[3,2,1]);
});

test('skillbook delivery succeeds with forty equipment while equipment delivery stays blocked',async()=>{
  const book={id:randomUUID(),name:'[스킬북] 드래곤 트위스터',slot:'skillbook',kind:'skillbook',skillId:'spin',rarity:'rare',stats:{}};
  await seed('book-seller',[book]);await seed('book-buyer',Array.from({length:40},()=>item()));
  const offer=await sale('book-seller',100);await action('book-buyer','buy',{listingId:offer.id});
  const delivery=(await snapshot(db,'book-buyer',{})).inbox.find(entry=>entry.item?.id===book.id);
  await action('book-buyer','claim',{deliveryId:delivery.id});const row=await account(db,'book-buyer');
  assert.equal(row.save.bag.filter(entry=>entry.slot!=='skillbook').length,40);assert.equal(row.save.bag.at(-1).id,book.id);
  await assert.rejects(transaction(db,async tx=>{const next=structuredClone(row.save);next.bag.push(item());await reconcileItems(tx,'book-buyer',row.save,next);}),error('INVALID_SAVE'));
  await transaction(db,async tx=>{const latest=await account(tx,'book-buyer');await reconcileItems(tx,'book-buyer',latest.save,latest.save);});
});
