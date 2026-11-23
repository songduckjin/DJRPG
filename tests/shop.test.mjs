import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { schema } from '../server/database.mjs';
import { shopEndpoint } from '../server/endpoints/shop.mjs';
import { accountEndpoint } from '../server/endpoints/account.mjs';
// `characters`가 세이브에서 전투력을 계산하며 게임 모듈(`src/game/*.ts`)을 동적으로 읽는다(백로그 11·B안) —
// 테스트 러너에서 확장자 없는 내부 import까지 풀리도록 TS 훅을 먼저 등록한다.
import './ts-loader.mjs';

test('shop grants paid diamonds once, unlocks only purchased slots, and deletion consumes character items', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-shop-'));
  const url = `file:${join(directory, 'shop.db')}`;
  const env = { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: 'shop-test-secret', TOSS_CLIENT_KEY: 'test-client', TOSS_SECRET_KEY: 'test-secret' };
  const db = createClient({ url });
  const save = { version: 1, name: '첫째', accountId: 'hero', gender: 'male', auto: true, autoClimb: true, level: 1, exp: 0, gold: 0, floor: 1, maxFloor: 1, floorKills: 0, kills: 0, health: 100, equipment: {}, bag: [], learned: [], passives: [], quickSlots: [null, null, null] };
  const signed = Buffer.from(JSON.stringify({ id: 'hero', exp: Date.now() + 60_000 })).toString('base64url');
  const token = `${signed}.${createHmac('sha256', env.TURSO_AUTH_TOKEN).update(signed).digest('base64url')}`;
  const request = body => new Request('http://localhost/api/test', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const callShop = async (body, providerFetch) => {
    const response = await shopEndpoint(request(body), { env, createDbClient: () => createClient({ url }), providerFetch });
    return { status: response.status, body: await response.json() };
  };
  const callAccount = async body => {
    const response = await accountEndpoint(request(body), { env, createDbClient: () => createClient({ url }) });
    return { status: response.status, body: await response.json() };
  };
  try {
    await schema(db, env);
    await db.execute({ sql: 'INSERT INTO djrpg_accounts(id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: ['hero', 'registered', JSON.stringify(save), new Date().toISOString()] });
    const before = await callAccount({ action: 'createCharacter', slot: 4, name: '넷째', gender: 'male', revision: 0 });
    assert.equal(before.status, 403); assert.equal(before.body.code, 'SLOT_LOCKED');
    const catalog = await callShop({ action: 'catalog' });
    assert.equal(catalog.body.wallet.diamonds, 0); assert.equal(catalog.body.diamondPacks.length, 8);
    const order = await callShop({ action: 'createOrder', packId: 'diamond_100' });
    assert.equal(order.status, 200); assert.equal(order.body.amount, 1100);
    let approvals = 0;
    const providerFetch = async (_url, options) => { approvals++; const sent = JSON.parse(options.body); return new Response(JSON.stringify({ status: 'DONE', orderId: sent.orderId, paymentKey: sent.paymentKey, totalAmount: sent.amount }), { status: 200 }); };
    const paid = await callShop({ action: 'confirmOrder', orderId: order.body.orderId, paymentKey: 'payment-key', amount: 1100 }, providerFetch);
    assert.equal(paid.status, 200); assert.equal(paid.body.wallet.diamonds, 100);
    const replay = await callShop({ action: 'confirmOrder', orderId: order.body.orderId, paymentKey: 'payment-key', amount: 1100 }, providerFetch);
    assert.equal(replay.body.wallet.diamonds, 100); assert.equal(approvals, 1);
    const orderLedger = (await db.execute({ sql: "SELECT diamonds_delta FROM djrpg_shop_ledger WHERE account_id=? AND source_type='order' AND source_id=?", args: ['hero', order.body.orderId] })).rows;
    assert.equal(orderLedger.length, 1); assert.equal(Number(orderLedger[0].diamonds_delta), 100);
    await db.execute({ sql: 'UPDATE djrpg_shop_wallet SET diamonds=500 WHERE account_id=?', args: ['hero'] });
    const requestId = randomUUID();
    const unlocked = await callShop({ action: 'buySlot', requestId });
    assert.equal(unlocked.status, 200); assert.equal(unlocked.body.wallet.diamonds, 0); assert.equal(unlocked.body.wallet.maxSlots, 4);
    const repeat = await callShop({ action: 'buySlot', requestId });
    assert.equal(repeat.body.wallet.maxSlots, 4);
    const slotLedger = (await db.execute({ sql: "SELECT diamonds_delta FROM djrpg_shop_ledger WHERE account_id=? AND source_type='slot' AND source_id=?", args: ['hero', requestId] })).rows;
    assert.equal(slotLedger.length, 1); assert.equal(Number(slotLedger[0].diamonds_delta), -500);
    const created = await callAccount({ action: 'createCharacter', slot: 4, name: '넷째', gender: 'male', revision: 0 });
    assert.equal(created.status, 200);
    await db.execute({ sql: 'UPDATE djrpg_shop_wallet SET diamonds=2000 WHERE account_id=?', args: ['hero'] });
    await db.execute({ sql: 'UPDATE djrpg_characters SET updated_at=? WHERE account_id=? AND slot=1', args: [new Date(Date.now()-7200000).toISOString(), 'hero'] });
    assert.equal((await callAccount({ action: 'characters' })).body.characters.find(character => Number(character.slot) === 1).idleSeconds, 0);
    const idleRequestId = randomUUID();
    const idlePurchase = await callShop({ action: 'buyAllIdle', requestId: idleRequestId });
    assert.equal(idlePurchase.status, 200); assert.equal(idlePurchase.body.wallet.diamonds, 500);
    const wrongReplay = await callShop({ action: 'buyAllIdle', requestId });
    assert.equal(wrongReplay.status, 409); assert.equal(wrongReplay.body.code, 'REQUEST_CONFLICT');
    assert(idlePurchase.body.expiresAt > Date.now()+29*86400000);
    const idleReplay = await callShop({ action: 'buyAllIdle', requestId: idleRequestId });
    assert.equal(idleReplay.body.wallet.diamonds, 500);
    const resetAt = (await db.execute({ sql: 'SELECT updated_at FROM djrpg_characters WHERE account_id=? AND slot=1', args: ['hero'] })).rows[0].updated_at;
    assert(Date.now()-Date.parse(resetAt) < 10000, '구매 전 비접속 시간은 방치 보상에 포함하지 않는다');
    await db.execute({ sql: 'UPDATE djrpg_characters SET updated_at=? WHERE account_id=? AND slot=1', args: [new Date(Date.now()-7200000).toISOString(), 'hero'] });
    const idleList = await callAccount({ action: 'characters' });
    assert(idleList.body.characters.find(character => Number(character.slot) === 1).idleSeconds >= 7190);
    assert(idleList.body.allIdleExpiresAt > Date.now());
    const selected = await callAccount({ action: 'selectCharacter', slot: 1, revision: created.body.revision });
    assert.equal(selected.status, 200);
    const entered = await callAccount({ action: 'load' });
    assert(entered.body.offlineSeconds >= 7190, '패키지 방치 보상은 해당 캐릭터 입장 시 정산된다');
    const settled = await callAccount({ action: 'save', save: entered.body.save, revision: entered.body.revision, characterSlot: 1, requestId: randomUUID() });
    assert.equal(settled.status, 200);
    const claim = (await db.execute({ sql: "SELECT quantity FROM djrpg_shop_entitlements WHERE account_id=? AND entitlement_key='idle_claim_1'", args: ['hero'] })).rows;
    assert.equal(claim.length, 0, '정산 저장 뒤에는 대기 중인 방치 보상이 지워진다');
    const expiredAt = Date.now()-3600000;
    await db.execute({ sql: "UPDATE djrpg_shop_entitlements SET expires_at=? WHERE account_id=? AND entitlement_key='all_idle_30d'", args: [expiredAt, 'hero'] });
    await db.execute({ sql: 'UPDATE djrpg_characters SET updated_at=? WHERE account_id=? AND slot=4', args: [new Date(expiredAt-3600000).toISOString(), 'hero'] });
    const expiredList = await callAccount({ action: 'characters' });
    assert(expiredList.body.characters.find(character => Number(character.slot) === 4).idleSeconds >= 3590);
    const lateSelect = await callAccount({ action: 'selectCharacter', slot: 4, revision: settled.body.revision });
    assert.equal(lateSelect.status, 200);
    const lateEntry = await callAccount({ action: 'load' });
    assert(lateEntry.body.offlineSeconds >= 3590 && lateEntry.body.offlineSeconds < 3610, '만료 뒤에도 만료 전 적립분만 받는다');
    const lateSaved = await callAccount({ action: 'save', save: lateEntry.body.save, revision: lateEntry.body.revision, characterSlot: 4, requestId: randomUUID() });
    const back = await callAccount({ action: 'selectCharacter', slot: 1, revision: lateSaved.body.revision });
    assert.equal(back.status, 200);
    const item = { id: randomUUID(), name: '아이템', slot: 'weapon', rarity: 'common', stats: { attack: 1 } };
    await db.execute({ sql: "UPDATE djrpg_characters SET save_json=json_set(save_json,'$.bag',json(?)) WHERE account_id=? AND slot=4", args: [JSON.stringify([item]), 'hero'] });
    await db.execute({ sql: 'INSERT INTO djrpg_item_owners(item_id,account_id,location,item_json) VALUES (?,?,?,?)', args: [item.id, 'hero', 'inventory', JSON.stringify(item)] });
    await db.execute({ sql: 'INSERT INTO djrpg_character_item_owners(item_id,account_id,slot) VALUES (?,?,?)', args: [item.id, 'hero', 4] });
    const characters = await callAccount({ action: 'characters' });
    assert.equal(characters.body.characters.find(character => Number(character.slot) === 4).itemCount, 1);
    const rejected = await callAccount({ action: 'deleteCharacter', slot: 4, name: '틀린이름', revision: back.body.revision });
    assert.equal(rejected.body.code, 'CHARACTER_NAME_MISMATCH');
    const deleted = await callAccount({ action: 'deleteCharacter', slot: 4, name: '넷째', revision: back.body.revision });
    assert.equal(deleted.status, 200);
    const owner = (await db.execute({ sql: 'SELECT location FROM djrpg_item_owners WHERE item_id=?', args: [item.id] })).rows[0];
    assert.equal(owner.location, 'consumed');
    assert.equal((await callAccount({ action: 'characters' })).body.characters.length, 1);
  } finally { await db.close(); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

// 작업 — 캐릭터 슬롯 최대 8칸: 3 → 8까지는 500 다이아씩 사고, 9번째는 팔지 않는다.
test('character slots stop at eight — the ninth slot cannot be bought', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-slot-cap-'));
  const url = `file:${join(directory, 'slot-cap.db')}`;
  const env = { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: 'slot-cap-secret' };
  const db = createClient({ url });
  const save = { version: 1, name: '첫째', accountId: 'hero', gender: 'male', auto: true, autoClimb: true, level: 1, exp: 0, gold: 0, floor: 1, maxFloor: 1, floorKills: 0, kills: 0, health: 100, equipment: {}, bag: [], learned: [], passives: [], quickSlots: [null, null, null] };
  const signed = Buffer.from(JSON.stringify({ id: 'hero', exp: Date.now() + 60_000 })).toString('base64url');
  const token = `${signed}.${createHmac('sha256', env.TURSO_AUTH_TOKEN).update(signed).digest('base64url')}`;
  const request = body => new Request('http://localhost/api/test', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const callShop = async body => {
    const response = await shopEndpoint(request(body), { env, createDbClient: () => createClient({ url }) });
    return { status: response.status, body: await response.json() };
  };
  try {
    await schema(db, env);
    await db.execute({ sql: 'INSERT INTO djrpg_accounts(id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: ['hero', 'registered', JSON.stringify(save), new Date().toISOString()] });
    await db.execute({ sql: 'INSERT INTO djrpg_shop_wallet(account_id,diamonds,max_slots,customer_key) VALUES (?,?,?,?)', args: ['hero', 100_000, 3, randomUUID()] });
    const bought = [];
    for (let index = 0; index < 5; index++) {
      const response = await callShop({ action: 'buySlot', requestId: randomUUID() });
      assert.equal(response.status, 200);
      assert.equal(response.body.type, 'slot');
      bought.push(response.body.wallet.maxSlots);
    }
    assert.deepEqual(bought, [4, 5, 6, 7, 8], '3칸에서 8칸까지 다섯 번 열린다');
    const catalog = await callShop({ action: 'catalog' });
    assert.equal(catalog.status, 200);
    assert.equal(catalog.body.wallet.maxSlots, 8);
    assert.equal(catalog.body.packages.find(pack => pack.id === 'slot').available, false, '슬롯 8칸이면 상점이 슬롯 상품을 잠근다(화면: 최대 슬롯)');
    const ninth = await callShop({ action: 'buySlot', requestId: randomUUID() });
    assert.equal(ninth.status, 409);
    assert.equal(ninth.body.code, 'MAX_SLOTS');
    const wallet = (await db.execute({ sql: 'SELECT diamonds,max_slots FROM djrpg_shop_wallet WHERE account_id=?', args: ['hero'] })).rows[0];
    assert.equal(Number(wallet.max_slots), 8, '9번째 구매는 슬롯 수를 바꾸지 않는다');
    assert.equal(Number(wallet.diamonds), 100_000 - 5 * 500, '9번째 구매는 다이아를 받지 않는다');
    const ledger = (await db.execute({ sql: "SELECT diamonds_delta FROM djrpg_shop_ledger WHERE account_id=? AND source_type='slot'", args: ['hero'] })).rows;
    assert.equal(ledger.length, 5, '구매 5건만 장부에 남는다');
    // 다시 요청해도(같은 결과) 슬롯·다이아가 움직이지 않는다.
    const retry = await callShop({ action: 'buySlot', requestId: randomUUID() });
    assert.equal(retry.status, 409); assert.equal(retry.body.code, 'MAX_SLOTS');
  } finally { await db.close(); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
