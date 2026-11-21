import './ts-loader.mjs';
import { withWeapon } from './helpers/armed.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { schema, account, assertRevision, reconcileItems, transaction, writeSave } from '../server/database.mjs';
import { mutate, snapshot } from '../server/market.mjs';
import { tokenFor } from '../server/auth.mjs';
import { periods } from '../server/journey-state.mjs';
import { removeTempDbDirectory } from './helpers/temp-db.mjs';
const { worldBossOperation, WORLD_BOSS_HP } = await import('../server/world-boss.mjs');
const { warehouseEndpoint } = await import('../server/endpoints/warehouse.mjs');
const { parseSave, freshSave } = await import('../src/game/store.ts');

/**
 * 동시성·무결성 테스트 (작업 209). **격리된 로컬 SQLite 파일**에서만 돈다(운영 DB 미사용).
 *
 * 지켜야 할 계약: 아이템 복제 0건·소실 0건, 골드 중복 지급 0건.
 * 로컬 SQLite 드라이버는 쓰기 트랜잭션을 동시에 두 개 열지 못한다(SQLITE_BUSY). 운영 Turso도 쓰기는
 * DB에서 한 줄로 서므로, 여기서는 **두 요청이 같은 상태를 읽고 순서대로 커밋되는** 상황을 그대로 만든다
 * (요청 A·B가 같은 revision·같은 매물 상태를 들고 시작 → 한쪽만 성공). 그 뒤 복제·소실·중복 지급이
 * 0건인지 소유 테이블·수령함·지갑을 직접 세어 확인한다.
 *
 * 드라이버가 한 연결에 트랜잭션 두 개를 열지 못하므로 진짜 `Promise.all` 쓰기 경합은 만들지 않는다.
 */
let db, directory, url;
const env = () => ({ TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: 'concurrency-key' });
const item = (id = randomUUID()) => ({ id, name: '황혼의 두손검', slot: 'weapon', rarity: 'rare', stats: { attack: 30 }, plus: 2 });
const saveOf = (over = {}) => ({ ...parseSave({ ...freshSave('male'), name: '전사' }, undefined), gold: 1000, ...over });
const clientFor = () => ({ execute: (...args) => db.execute(...args), batch: (...args) => db.batch(...args), transaction: (...args) => db.transaction(...args), close: async () => {} });

async function seed(id, bag = [], gold = 1000) {
  const save = saveOf({ bag, gold });
  await db.execute({ sql: 'INSERT INTO djrpg_accounts(id,password_hash,save_json,updated_at,session_id) VALUES(?,?,?,?,?)', args: [id, 'hash', JSON.stringify(save), new Date().toISOString(), `sid-${id}`] });
  await account(db, id);
  // 소유 기록을 실제 저장 경로로 한 번 만들어 둔다(그래야 시장·창고·소유권 검사가 의미를 갖는다).
  await transaction(db, async tx => { const row = await account(tx, id); await reconcileItems(tx, id, row.save, row.save); });
}
const register = async (id, bag = [], gold = 1000) => { await seed(id, bag, gold); return account(db, id); };
const action = async (id, data, requestId = randomUUID()) => { const row = await account(db, id); return mutate(db, id, { ...data, revision: row.revision, requestId }); };
const sale = async (seller, price = 100) => {
  const row = await account(db, seller);
  await action(seller, { action: 'register', itemId: row.save.bag[0].id, price });
  return (await snapshot(db, seller, { view: 'mine' })).listings.find(listing => listing.state === 'active');
};
const locationOf = async id => (await db.execute({ sql: 'SELECT location FROM djrpg_item_owners WHERE item_id=?', args: [id] })).rows.map(row => row.location);
const warehouse = (id, body) => warehouseEndpoint(
  new Request('https://example.test/api/warehouse', { method: 'POST', headers: { Authorization: `Bearer ${tokenFor(id, env(), `sid-${id}`)}` }, body: JSON.stringify(body) }),
  { env: env(), createDbClient: clientFor }
);

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'djrpg-concurrency-'));
  url = `file:${join(directory, 'concurrency.db')}`;
  db = createClient({ url });
  await schema(db, env());
});
after(async () => {
  await db.close();
  await removeTempDbDirectory(directory).catch(() => rm(directory, { recursive: true, force: true }));
});

test('같은 매물에 두 구매자가 동시에 사도 한 번만 팔리고 골드가 두 번 지급되지 않는다', async () => {
  const offered = item();
  await register('seller-a', [offered]);
  await register('buyer-a', [], 1000);
  await register('buyer-b', [], 1000);
  const listing = await sale('seller-a', 400);
  // 두 구매자가 같은 순간에 같은 매물을 본다(같은 revision·같은 상태) → 커밋은 한 줄로 선다.
  const seenA = await account(db, 'buyer-a'), seenB = await account(db, 'buyer-b');
  const buy = (id, row) => mutate(db, id, { action: 'buy', listingId: listing.id, revision: row.revision, requestId: randomUUID() });
  await buy('buyer-a', seenA);
  await assert.rejects(buy('buyer-b', seenB), error => ['NOT_AVAILABLE', 'SAVE_CONFLICT'].includes(error.code));
  const saleRow = (await db.execute({ sql: 'SELECT * FROM djrpg_market WHERE id=?', args: [listing.id] })).rows;
  assert.equal(saleRow.length, 1); assert.equal(saleRow[0].state, 'sold');
  const deliveries = (await db.execute({ sql: 'SELECT * FROM djrpg_market_inbox WHERE listing_id=?', args: [listing.id] })).rows;
  assert.equal(deliveries.filter(row => row.kind === 'purchase').length, 1, '구매 수령함 1건');
  assert.equal(deliveries.filter(row => row.kind === 'proceeds').length, 1, '판매대금 1건');
  assert.deepEqual(await locationOf(offered.id), ['inbox'], '아이템은 한 곳에만');
  // 판매대금은 수령함으로 한 번만 들어오고, 한 번 수령하면 그만큼만 늘어난다.
  await action('seller-a', { action: 'claim', deliveryId: 'all' });
  const seller = await account(db, 'seller-a');
  assert.equal(seller.save.gold, 1000 + 400 - Math.ceil(400 * 5 / 100), '판매대금은 한 번만');
  const buyerGold = (await account(db, 'buyer-a')).save.gold + (await account(db, 'buyer-b')).save.gold;
  assert.equal(buyerGold, 1000 + 600, '한 명만 400을 냈다');
});

test('같은 requestId는 거래·수령에서 정확히 한 번만 반영된다', async () => {
  const stored = item();
  await register('idem-seller', [stored]);
  await register('idem-buyer', [], 2000);
  const listing = await sale('idem-seller', 300);
  const key = randomUUID();
  const first = await action('idem-buyer', { action: 'buy', listingId: listing.id }, key);
  const again = await action('idem-buyer', { action: 'buy', listingId: listing.id }, key);
  assert.equal(again.revision, first.revision, '재전송은 같은 revision');
  assert.deepEqual(await locationOf(stored.id), ['inbox']);
  const deliveries = (await db.execute({ sql: 'SELECT COUNT(*) AS n FROM djrpg_market_inbox WHERE listing_id=? AND kind=?', args: [listing.id, 'purchase'] })).rows;
  assert.equal(Number(deliveries[0].n), 1);
});

test('창고 동시 이동은 아이템을 복제하지도 잃지도 않는다', async () => {
  const stored = item();
  await register('warehouse-a', [stored]);
  const row = await account(db, 'warehouse-a');
  const deposit = await warehouse('warehouse-a', { action: 'deposit', itemId: stored.id, requestId: randomUUID(), revision: row.revision, characterSlot: 1 });
  assert.equal(deposit.status, 200);
  // 같은 아이템을 한 번 더 넣으려는 요청은 가방에 이미 없으므로 거부되고, 창고에는 한 개만 남는다.
  const again = await warehouse('warehouse-a', { action: 'deposit', itemId: stored.id, requestId: randomUUID(), revision: (await account(db, 'warehouse-a')).revision, characterSlot: 1 });
  assert.equal(again.status, 409);
  const rows = (await db.execute({ sql: 'SELECT COUNT(*) AS n FROM djrpg_warehouse WHERE account_id=? AND item_id=?', args: ['warehouse-a', stored.id] })).rows;
  assert.equal(Number(rows[0].n), 1);
  assert.deepEqual(await locationOf(stored.id), ['warehouse']);
  // 인출을 동시에 두 번 요청해도(같은 requestId) 한 번만 빠져나온다.
  const latest = await account(db, 'warehouse-a');
  const body = { action: 'withdraw', itemId: stored.id, requestId: randomUUID(), revision: latest.revision, characterSlot: 1 };
  const first = await warehouse('warehouse-a', body), replay = await warehouse('warehouse-a', body);
  assert.deepEqual([first.status, replay.status], [200, 200], '같은 requestId 재전송은 멱등하게 성공한다');
  const after = await account(db, 'warehouse-a');
  assert.equal(after.save.bag.filter(entry => entry.id === stored.id).length, 1, '가방에 정확히 한 개');
  assert.deepEqual(await locationOf(stored.id), ['inventory']);
});

test('저장 응답이 유실되어 같은 스냅샷을 다시 보내도 진행이 두 번 반영되지 않는다', async () => {
  await register('lost-a');
  const row = await account(db, 'lost-a');
  const key = randomUUID();
  const send = () => transaction(db, async tx => {
    const latest = await account(tx, 'lost-a');
    const replay = (await tx.execute({ sql: 'SELECT * FROM djrpg_save_requests WHERE account_id=?', args: ['lost-a'] })).rows[0];
    if (replay?.request_id === key) { assertRevision(latest, Number(replay.revision)); return { replay: true, revision: latest.revision }; }
    assertRevision(latest, row.revision);
    const saved = await writeSave(tx, latest, { ...structuredClone(row.save), gold: 1100, kills: 12 });
    await tx.execute({ sql: 'INSERT INTO djrpg_save_requests VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET request_id=excluded.request_id, revision=excluded.revision', args: ['lost-a', key, saved.revision] });
    return { replay: false, revision: saved.revision };
  });
  const first = await send(), again = await send();
  assert.equal(first.replay, false); assert.equal(again.replay, true);
  assert.equal(again.revision, first.revision, '재전송은 같은 revision을 돌려준다');
  const latest = await account(db, 'lost-a');
  assert.equal(latest.save.gold, 1100); assert.equal(latest.save.kills, 12);
});

test('다른 계정 아이템은 장착·판매·보관할 수 없다', async () => {
  const mine = item();
  await register('owner-a', [mine]);
  await register('thief-b', []);
  const row = await account(db, 'thief-b');
  const stolen = { ...structuredClone(row.save), bag: [structuredClone(mine)] };
  await assert.rejects(
    transaction(db, async tx => { const latest = await account(tx, 'thief-b'); await reconcileItems(tx, 'thief-b', latest.save, stolen); }),
    error => error.code === 'ITEM_CONFLICT'
  );
  await assert.rejects(action('thief-b', { action: 'register', itemId: mine.id, price: 10 }), error => ['ITEM_NOT_AVAILABLE', 'ITEM_CONFLICT'].includes(error.code));
  const deposit = await warehouse('thief-b', { action: 'deposit', itemId: mine.id, requestId: randomUUID(), revision: row.revision, characterSlot: 1 });
  assert.notEqual(deposit.status, 200);
  assert.deepEqual(await locationOf(mine.id), ['inventory'], '원래 주인 자리에 그대로 있다');
});

test('만들어낸 아이템은 서버 상한에서 거부되고 기존 보유 아이템은 그대로 저장된다', async () => {
  await register('mint-a');
  const forged = { id: randomUUID(), name: '영원의 패왕의 성검', slot: 'weapon', rarity: 'legendary', stats: { attack: 99999 } };
  await assert.rejects(
    transaction(db, async tx => { const latest = await account(tx, 'mint-a'); await reconcileItems(tx, 'mint-a', latest.save, { ...structuredClone(latest.save), bag: [forged] }); }),
    error => error.code === 'INVALID_ITEM'
  );
  // 옛 세이브에 이미 들어 있던 아이템(previous에 있던 것)은 소유 기록만 채우고 통과한다.
  const legacy = { id: randomUUID(), name: '낡은 투구', slot: 'helmet', rarity: 'common', stats: { defense: 900 } };
  await db.execute({ sql: "UPDATE djrpg_characters SET save_json=json_set(save_json,'$.bag',json_array(json(?))) WHERE account_id='mint-a'", args: [JSON.stringify(legacy)] });
  const latest = await account(db, 'mint-a');
  assert.equal(latest.save.bag.length, 1);
  await transaction(db, async tx => {
    const current = await account(tx, 'mint-a');
    const next = { ...structuredClone(current.save), gold: current.save.gold + 1 };
    await reconcileItems(tx, 'mint-a', current.save, next);
    await writeSave(tx, current, next);
  });
  const owners = await db.execute({ sql: 'SELECT item_id,location FROM djrpg_item_owners WHERE item_id=?', args: [legacy.id] });
  assert.equal(owners.rows.length, 1); assert.equal(owners.rows[0].location, 'inventory');
});

test('세이브가 상한을 넘으면 저장은 거부되지 않고 넘친 값만 잘린다', async () => {
  await register('clamp-a');
  const greedy = { ...structuredClone((await account(db, 'clamp-a')).save), gold: 1e12, kills: 5_000_000, level: 30, dungeonFloor: 10 };
  const result = await transaction(db, async tx => { const latest = await account(tx, 'clamp-a'); return writeSave(tx, latest, greedy); });
  assert(result.clamped.includes('gold'));
  assert(result.save.gold < 1e12);
  assert(result.save.kills <= 60 + 6 * 60, '경과 시간 안의 처치만 인정');
  assert(result.save.dungeonFloor <= 1, '검증 없이 10층으로 뛰지 못한다');
});

test('월드보스 공유 HP는 동시 피해의 합과 정확히 같고 보상은 한 번만 지급된다', async () => {
  const now = Date.parse('2026-12-01T10:00:00Z');
  const day = periods(now).daily;
  for (const id of ['boss-a', 'boss-b']) {
    // [작업 216] 무기가 없으면 공격이 막혀 월드보스 피해가 0이 된다 — 실제 플레이어처럼 무기를 찬다.
    const save = parseSave(withWeapon({ ...freshSave('male'), name: id, level: 7 }, `boss-weapon-${id}`), id);
    await db.execute({ sql: 'INSERT INTO djrpg_accounts(id,password_hash,save_json,updated_at,session_id) VALUES(?,?,?,?,?)', args: [id, 'hash', JSON.stringify(save), new Date(now).toISOString(), `sid-${id}`] });
    await account(db, id);
  }
  const call = (id, input, at) => worldBossOperation(db, id, input, `sid-${id}`, at, url);
  const startA = await call('boss-a', { action: 'start', requestId: randomUUID(), characterSlot: 1 }, now);
  const startB = await call('boss-b', { action: 'start', requestId: randomUUID(), characterSlot: 1 }, now);
  // 두 사람이 같은 시각에 각자 피해를 넣고, A가 같은 시각으로 한 번 더 보낸다(중복 집계 방지 확인).
  const tickA = await call('boss-a', { action: 'tick', attemptId: startA.battle.id }, now + 3000);
  const tickB = await call('boss-b', { action: 'tick', attemptId: startB.battle.id }, now + 3000);
  const tickAAgain = await call('boss-a', { action: 'tick', attemptId: startA.battle.id }, now + 3000);
  assert.equal(tickAAgain.battle.damage, tickA.battle.damage, '같은 시각 재전송은 피해를 더하지 않는다');
  const total = tickA.battle.damage + tickB.battle.damage;
  const today = (await db.execute({ sql: 'SELECT hp FROM djrpg_boss_days WHERE day=?', args: [day] })).rows[0];
  assert.equal(Number(today.hp), WORLD_BOSS_HP - total, '동시 피해가 유실·중복 없이 반영된다');
  const scores = (await db.execute({ sql: 'SELECT account_id,damage FROM djrpg_boss_scores WHERE day=? ORDER BY account_id', args: [day] })).rows;
  assert.deepEqual(scores.map(row => Number(row.damage)), [tickA.battle.damage, tickB.battle.damage]);
  await call('boss-a', { action: 'finish', attemptId: startA.battle.id }, now + 4000);
  await call('boss-b', { action: 'finish', attemptId: startB.battle.id }, now + 5000);
  await call('boss-a', { action: 'list' }, now + 6_000_000);
  const rewards = (await db.execute({ sql: 'SELECT account_id,kind,COUNT(*) AS n FROM djrpg_boss_rewards WHERE day=? GROUP BY account_id,kind', args: [day] })).rows;
  for (const row of rewards) assert.equal(Number(row.n), 1, `${row.account_id} ${row.kind} 보상 중복 없음`);
  const mails = (await db.execute({ sql: "SELECT account_id,state_json FROM djrpg_journey WHERE account_id IN ('boss-a','boss-b')" })).rows;
  for (const row of mails) {
    const ids = JSON.parse(row.state_json).mail.map(entry => entry.id);
    assert.equal(new Set(ids).size, ids.length, '같은 우편이 두 번 들어가지 않는다');
  }
});

test('월드보스 상태 조회는 쓰기 트랜잭션을 잡지 않는다', async () => {
  const now = Date.parse('2026-12-02T10:00:00Z');
  const id = 'boss-read';
  const save = parseSave({ ...freshSave('male'), name: id, level: 7 }, id);
  await db.execute({ sql: 'INSERT INTO djrpg_accounts(id,password_hash,save_json,updated_at,session_id) VALUES(?,?,?,?,?)', args: [id, 'hash', JSON.stringify(save), new Date(now).toISOString(), `sid-${id}`] });
  await account(db, id);
  const call = (at, input = { action: 'list' }) => worldBossOperation(db, id, input, `sid-${id}`, at, url);
  await call(now); // 오늘 row를 만드는 첫 요청은 쓰기 경로로 내려간다.
  let wrote = 0;
  const readOnly = { execute: (...args) => db.execute(...args), batch: (...args) => db.batch(...args), transaction: (...args) => { wrote++; return db.transaction(...args); } };
  const listed = await worldBossOperation(readOnly, id, { action: 'list' }, `sid-${id}`, now + 1000, url);
  assert.equal(wrote, 0, '조회는 쓰기 트랜잭션 없이 읽기 배치만 쓴다');
  assert.equal(listed.maxHp, WORLD_BOSS_HP);
  assert.equal(listed.remaining, 3);
});
