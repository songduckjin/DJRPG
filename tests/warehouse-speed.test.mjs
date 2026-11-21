import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { schema, account, transaction, reconcileItems } from '../server/database.mjs';
import { accountEndpoint } from '../server/endpoints/account.mjs';
import { warehouseEndpoint } from '../server/endpoints/warehouse.mjs';
import './ts-loader.mjs';

/**
 * 공용창고 보관·회수 속도 (작업 249).
 *
 * 사용자 제보 "창고 템 보관하고 꺼낼때 시간이 너무 오래걸려"의 두 원인을 고정한다.
 * ① 서버가 아이템마다 쿼리를 따로 보내던 구조 → 한 묶음(`tx.batch`·`IN (...)`)으로.
 * ② 클라이언트가 창고 요청 전에 저장(`flush`)을 한 번 더 왕복하던 구조 → 진행 세이브를 함께 보내
 *    이동과 저장을 한 요청·한 트랜잭션에서 끝낸다. 그래도 **소유권·능력치·40칸 검증은 그대로**다.
 */
const weapon = (id, attack = 4, rarity = 'common') => ({ id, name: `강철 쯔바이핸드${id}`, slot: 'weapon', rarity, stats: { attack } });
const save0 = items => ({ version: 1, accountId: 'hero', name: '전사', gender: 'male', job: 'warrior', auto: true, autoClimb: true, level: 9, exp: 25, gold: 500, floor: 4, maxFloor: 4, floorKills: 3, kills: 50, health: 80, equipment: {}, equipmentCollection: [], bag: items, tutorial: 3, stones: 0, skillPoints: 7, lastActiveAt: Date.now(), learned: [], passives: [], quickSlots: [null, null, null], skillLevels: {} });

/** 창고 테스트용 임시 DB + 로그인 토큰 + API 호출기. `counting`이면 요청 하나가 쓴 DB 왕복을 센다. */
async function harness(items) {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-warehouse-speed-'));
  const url = `file:${join(directory, 'warehouse.db')}`;
  const env = { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: 'local-warehouse-speed' };
  const db = createClient({ url });
  await schema(db, env);
  await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: ['hero', 'test-hash', JSON.stringify(save0(items)), new Date().toISOString()] });
  const signed = Buffer.from(JSON.stringify({ id: 'hero', exp: Date.now() + 60_000 })).toString('base64url');
  const token = `${signed}.${createHmac('sha256', 'local-warehouse-speed').update(signed).digest('base64url')}`;
  const counter = { roundtrips: 0, statements: 0 };
  /** 엔드포인트가 받는 DB 클라이언트 — `counting`이면 `execute`·`batch` 호출(왕복)을 센다. */
  const dbClient = count => {
    if (!count) return createClient({ url });
    const tick = statements => { counter.roundtrips++; counter.statements += statements; };
    const wrapTx = tx => ({
      execute: async statement => { tick(1); return tx.execute(statement); },
      batch: async (statements, mode) => { tick(Array.isArray(statements) ? statements.length : 0); return tx.batch(statements, mode); },
      commit: async () => tx.commit(), rollback: async () => tx.rollback(), close: () => tx.close(), get closed() { return tx.closed; }
    });
    return {
      execute: async statement => { tick(1); return db.execute(statement); },
      batch: async (statements, mode) => { tick(Array.isArray(statements) ? statements.length : 0); return db.batch(statements, mode); },
      transaction: async mode => wrapTx(await db.transaction(mode)),
      close: async () => {}
    };
  };
  /** 엔드포인트를 직접 부르고 응답 상태·본문을 받는다. `counting`이면 이 요청이 쓴 DB 왕복 수까지 센다. */
  const endpoint = async (handler, body, counting = false) => {
    counter.roundtrips = 0; counter.statements = 0;
    const request = { method: 'POST', headers: { get: name => (name.toLowerCase() === 'authorization' ? `Bearer ${token}` : null) }, json: async () => body };
    const response = await handler(request, { env, createDbClient: () => dbClient(counting) });
    const payload = await response.json();
    return { status: response.status, body: payload, roundtrips: counter.roundtrips, statements: counter.statements };
  };
  // 캐릭터 행을 먼저 만들어 둔다(창고는 `writeSave`가 캐릭터 행을 쓴다).
  await transaction(db, async tx => { const row = await account(tx, 'hero'); await reconcileItems(tx, 'hero', row.save, row.save); });
  const owned = async (item, location = 'inventory', slot = 1, accountId = 'hero') => {
    await db.execute({ sql: 'INSERT OR REPLACE INTO djrpg_item_owners VALUES (?,?,?,?)', args: [item.id, accountId, location, JSON.stringify(item)] });
    await db.execute({ sql: 'INSERT OR REPLACE INTO djrpg_character_item_owners VALUES (?,?,?)', args: [item.id, accountId, slot] });
  };
  const loaded = async () => (await endpoint(accountEndpoint, { action: 'load' })).body;
  const owner = async itemId => (await db.execute({ sql: 'SELECT location FROM djrpg_item_owners WHERE item_id=?', args: [itemId] })).rows[0];
  const close = async () => { await db.close(); };
  return { db, endpoint, owned, loaded, owner, close, directory, counter };
}

test('진행 세이브를 함께 보내면 보관 한 번에 저장까지 끝난다(작업 249)', async () => {
  const h = await harness([]);
  try {
    const picked = weapon('new-1', 5);
    const start = await h.loaded();
    // 방금 주운 아이템 — 서버 소유 기록이 아직 없는 상태(자동 저장 전)를 그대로 보낸다.
    const progress = { ...start.save, gold: 900, bag: [picked] };
    const response = await h.endpoint(warehouseEndpoint, { action: 'deposit', itemId: picked.id, progress, requestId: randomUUID(), revision: start.revision, characterSlot: 1 });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.revision, start.revision + 1, '저장과 이동을 합쳐 revision은 한 번만 오른다');
    assert.equal(response.body.save.gold, 900, '함께 보낸 진행(금화)도 그대로 저장된다');
    assert.equal(response.body.save.bag.length, 0);
    assert.deepEqual(response.body.items.map(item => item.id), [picked.id]);
    assert.equal((await h.owner(picked.id)).location, 'warehouse', '보관한 아이템의 소유 위치도 한 트랜잭션에서 바뀐다');
  } finally { await h.close(); }
});

test('함께 보낸 진행 세이브도 소유권·능력치·40칸 검증을 그대로 받는다(작업 249)', async () => {
  const h = await harness([]);
  try {
    const start = await h.loaded();
    // ① 다른 계정 소유로 기록된 아이템을 보관하려 하면 통째로 거절.
    const rival = weapon('rival-1', 5);
    await h.owned(rival, 'inventory', 1, 'rival');
    const stolen = await h.endpoint(warehouseEndpoint, { action: 'deposit', itemId: rival.id, progress: { ...start.save, bag: [rival] }, requestId: randomUUID(), revision: start.revision, characterSlot: 1 });
    assert.equal(stolen.status, 409); assert.equal(stolen.body.code, 'ITEM_CONFLICT');
    assert.equal((await h.endpoint(warehouseEndpoint, { action: 'list' })).body.items.length, 0, '아무것도 보관되지 않았다');
    // ② 능력치가 드롭 상한을 넘는 아이템은 저장 단계에서 거절(거래소와 같은 규칙).
    const cheat = weapon('cheat-1', 4000, 'legendary');
    const forged = await h.endpoint(warehouseEndpoint, { action: 'deposit', itemId: cheat.id, progress: { ...start.save, bag: [cheat] }, requestId: randomUUID(), revision: start.revision, characterSlot: 1 });
    assert.equal(forged.status, 400); assert.equal(forged.body.code, 'INVALID_ITEM');
    // ③ 가방 40칸을 넘는 진행 세이브도 거절.
    const flood = Array.from({ length: 41 }, (_, index) => weapon(`flood-${index}`, 4));
    const full = await h.endpoint(warehouseEndpoint, { action: 'deposit', itemId: flood[0].id, progress: { ...start.save, bag: flood }, requestId: randomUUID(), revision: start.revision, characterSlot: 1 });
    assert.equal(full.status, 400); assert.equal(full.body.code, 'INVALID_SAVE');
  } finally { await h.close(); }
});

test('같은 requestId 재전송은 진행 세이브를 다시 적용하지 않는다(작업 249)', async () => {
  const h = await harness([]);
  try {
    const picked = weapon('new-1', 5);
    const start = await h.loaded();
    const requestId = randomUUID();
    const first = await h.endpoint(warehouseEndpoint, { action: 'deposit', itemId: picked.id, progress: { ...start.save, gold: 900, bag: [picked] }, requestId, revision: start.revision, characterSlot: 1 });
    assert.equal(first.status, 200);
    // 응답을 잃어 같은 요청을 다시 보낸 경우 — 금화를 더 실어 보내도 이미 처리된 요청이므로 반영되지 않는다.
    const replay = await h.endpoint(warehouseEndpoint, { action: 'deposit', itemId: picked.id, progress: { ...start.save, gold: 9_000_000, bag: [picked] }, requestId, revision: start.revision, characterSlot: 1 });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.revision, first.body.revision);
    assert.equal(replay.body.save.gold, 900, '재전송은 저장을 다시 쓰지 않는다');
    assert.deepEqual(replay.body.items.map(item => item.id), [picked.id], '창고도 그대로 한 개');
  } finally { await h.close(); }
});

test('아이템이 몇 개든 보관·회수 요청의 DB 왕복 수는 그대로다(작업 249)', async () => {
  const many = Array.from({ length: 40 }, (_, index) => weapon(`bulk-${index}`, 4));
  const h = await harness([]);
  try {
    const start = await h.loaded();
    for (const item of many) await h.owned(item);
    const progress = { ...start.save, bag: many };
    const big = await h.endpoint(warehouseEndpoint, { action: 'deposit', itemIds: many.map(item => item.id), progress, requestId: randomUUID(), revision: start.revision, characterSlot: 1 }, true);
    assert.equal(big.status, 200);
    assert.equal(big.body.items.length, 40);
    assert.ok(big.roundtrips <= 9, `보관 40개 왕복 ${big.roundtrips}회 — 아이템마다 쿼리를 보내면 40회 이상이 된다`);
    // 한 개 회수도 같은 왕복 수 — 개수에 비례하지 않는다는 것이 이 최적화의 핵심이다.
    const one = await h.endpoint(warehouseEndpoint, { action: 'withdraw', itemId: many[0].id, progress: { ...big.body.save }, requestId: randomUUID(), revision: big.body.revision, characterSlot: 1 }, true);
    assert.equal(one.status, 200);
    assert.equal(one.body.save.bag.length, 1);
    assert.ok(one.roundtrips <= 9, `회수 왕복 ${one.roundtrips}회(보관 ${big.roundtrips}회) — 개수에 비례하지 않는다`);
  } finally { await h.close(); }
});

// ── 클라이언트 ──────────────────────────────────────────────────────────────
const { SaveSync } = await import('../src/game/sync.ts');
const { freshSave } = await import('../src/game/store.ts');
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('창고 이동은 저장을 따로 왕복하지 않고 한 요청에 진행 세이브를 실어 보낸다(작업 249)', async () => {
  const save = freshSave(); save.gold = 750; save.bag = [weapon('bag-1', 6)];
  const sync = new SaveSync(save, { accountId: 'test', token: 'test-token', revision: 3, save });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    requests.push({ url, payload });
    return response({ ok: true, revision: payload.revision + 1, message: '공용창고에 보관했습니다.', moved: [payload.itemId], items: [weapon('bag-1', 6)], save: { ...save, bag: [] } });
  };
  // 사냥 중이라 저장해야 할 변경이 있는 상태(`queueSave`)를 그대로 둔다.
  sync.queueSave();
  const result = await sync.transferWarehouse('deposit', 'bag-1');
  assert.equal(requests.length, 1, '창고 요청 하나뿐 — 앞에 저장 요청을 따로 보내지 않는다');
  assert.equal(requests[0].url, '/api/warehouse');
  assert.equal(requests[0].payload.itemId, 'bag-1');
  assert.equal(requests[0].payload.progress.gold, 750, '화면 세이브를 함께 보낸다');
  assert.equal(requests[0].payload.progress.bag.length, 1);
  assert.equal(requests[0].payload.revision, 3);
  assert.equal(result.message, '공용창고에 보관했습니다.');
  assert.equal(sync.revision, 4);
  assert.equal(sync.save.bag.length, 0);
  assert.equal(sync.pendingWarehouse, undefined);
});

test('진행 중인 저장이 있으면 그 결과만 기다린 뒤 창고 요청 하나를 보낸다(작업 249)', async () => {
  const save = freshSave(); save.bag = [weapon('bag-1', 6)];
  const sync = new SaveSync(save, { accountId: 'test', token: 'test-token', revision: 0, save });
  const order = [];
  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    order.push(url);
    if (url === '/api/account') return response({ ok: true, revision: payload.revision + 1 });
    return response({ ok: true, revision: payload.revision + 1, message: '가방으로 가져왔습니다.', moved: [payload.itemId], items: [], save });
  };
  sync.queueSave();
  const saving = sync.flush();
  await sync.transferWarehouse('deposit', 'bag-1');
  await saving;
  assert.deepEqual(order, ['/api/account', '/api/warehouse'], '진행 중이던 저장을 기다린 뒤 창고 요청 하나');
});

test('창고 응답을 잃으면 같은 requestId·같은 본문으로 다시 보낸다(작업 249)', async () => {
  const save = freshSave(); save.bag = [weapon('bag-1', 6)];
  const sync = new SaveSync(save, { accountId: 'test', token: 'test-token', revision: 2, save });
  const payloads = [];
  let failures = 1;
  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    payloads.push(payload);
    if (failures-- > 0) throw new Error('네트워크 끊김');
    return response({ ok: true, revision: 3, message: '공용창고에 보관했습니다.', moved: ['bag-1'], items: [weapon('bag-1', 6)], save: { ...save, bag: [] } });
  };
  await sync.transferWarehouse('deposit', 'bag-1');
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].requestId, payloads[1].requestId, '같은 requestId로 멱등 재확인');
  assert.deepEqual(payloads[0].progress, payloads[1].progress, '보낸 진행 세이브도 그대로 다시 보낸다');
  assert.equal(sync.pendingWarehouse, undefined);
});
