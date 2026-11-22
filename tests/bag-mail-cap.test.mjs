import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHmac } from 'node:crypto';
import { createClient } from '@libsql/client';
import { schema, account, transaction, reconcileItems } from '../server/database.mjs';
import { snapshot, mutate } from '../server/journey.mjs';
import { APOLOGY_MAIL_ID, DIAMOND_MAIL_ID, SEASON_NOTICE_ID } from '../server/journey-state.mjs';
import accountHandler from '../api/account.mjs';
import warehouseHandler from '../api/warehouse.mjs';

// 작업 248 → 파트 B — 가방 40칸에 모든 아이템(스탯북·보물 주머니 포함)이 1칸이고, 가방이 차면 우편·창고 수령도 막는다.
let db, directory;
const gear = (id = randomUUID()) => ({ id, name: '강철 쯔바이핸드', slot: 'weapon', rarity: 'rare', stats: { attack: 25 } });
const book = id => ({ id, name: '공격의 서', slot: 'statbook', kind: 'statbook', book: 'attack', rarity: 'unique', stats: {} });
const pouch = id => ({ id, name: '무작위 보물 주머니', slot: 'pouch', kind: 'pouch', rarity: 'unique', stats: {} });
const save = (bag = []) => ({ version: 1, name: '전사', gender: 'male', job: 'warrior', gold: 0, bag, equipment: {}, equipmentCollection: [], kills: 0, bossKills: 0, playSeconds: 0, level: 1, floor: 1, maxFloor: 1, learned: [], passives: [], skillLevels: {} });
async function seed(id, bag = []) {
  await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: [id, 'test-password-hash', JSON.stringify(save(bag)), new Date().toISOString()] });
}
async function claim(id, kind = 'mail', itemId = 'all') {
  const row = await account(db, id);
  return mutate(db, id, { action: 'journey-claim', kind, id: itemId, revision: row.revision, requestId: randomUUID() });
}
const error = code => e => e.code === code;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'djrpg-bag-cap-'));
  db = createClient({ url: `file:${join(directory, 'bag.db')}` });
  await schema(db);
});
after(async () => { await db.close(); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });

test('가방이 40칸이면 아이템이 든 우편은 409 BAG_FULL로 막히고 미수령으로 남는다', async () => {
  await seed('mail-full', Array.from({ length: 40 }, () => gear()));
  const first = await snapshot(db, 'mail-full');
  const apology = first.mail.find(entry => entry.id === APOLOGY_MAIL_ID);   // 보물 주머니 5개
  const welcome = first.mail.find(entry => entry.id === 'welcome-v1');      // 금화 1,000만(파트 B: 스킬북 제거)
  assert(apology && welcome);
  await assert.rejects(claim('mail-full', 'mail', apology.id), error('BAG_FULL'));
  // 아이템이 없는 우편은 가방과 무관하게 받는다.
  await claim('mail-full', 'mail', welcome.id);
  const row = await account(db, 'mail-full');
  assert.equal(row.save.bag.length, 40, '가방은 40칸 그대로');
  assert.equal(row.save.gold, 1000, '아이템이 없는 우편의 금화는 들어온다');
  const after = await snapshot(db, 'mail-full');
  assert.equal(after.mail.find(entry => entry.id === apology.id).claimedAt, null, '미수령으로 남는다');
  assert(after.mail.find(entry => entry.id === welcome.id).claimedAt, '금화만 있는 우편은 받았다');
});

test('금화만 있는 우편(다이아)은 가방이 가득 차도 정상 수령된다', async () => {
  await seed('mail-gold', Array.from({ length: 40 }, () => gear()));
  const data = await snapshot(db, 'mail-gold');
  const diamond = data.mail.find(entry => entry.id === DIAMOND_MAIL_ID);
  assert(diamond, '다이아 우편이 있다');
  await claim('mail-gold', 'mail', diamond.id);
  const row = await account(db, 'mail-gold');
  assert.equal(row.save.bag.length, 40, '가방은 그대로');
  const wallet = (await db.execute({ sql: 'SELECT diamonds FROM djrpg_shop_wallet WHERE account_id=?', args: ['mail-gold'] })).rows[0];
  assert.equal(Number(wallet.diamonds), 4000, '다이아는 들어온다');
  assert((await snapshot(db, 'mail-gold')).mail.find(entry => entry.id === diamond.id).claimedAt, '수령 완료');
});

test('모두 받기는 자리가 없는 아이템 우편만 건너뛰고 금화 우편은 받는다', async () => {
  // 가방 40칸 — 아이템이 든 우편은 모두 건너뛰고(미수령 유지), 아이템이 없는 다이아 우편만 받는다.
  await seed('mail-all', Array.from({ length: 40 }, () => gear()));
  const before = await snapshot(db, 'mail-all');
  assert(before.mail.filter(entry => (entry.pouches ?? 0) > 0).length >= 2, '아이템이 든 우편이 여러 통 있다');
  const result = await claim('mail-all', 'mail', 'all');
  assert.match(result.message, /받지 못했습니다/, '못 받은 우편을 알린다');
  const row = await account(db, 'mail-all');
  assert.equal(row.save.bag.length, 40, '가방은 40칸을 넘지 않는다');
  // 아이템(보물 주머니)이 든 우편은 통째로 남기고, 아이템이 없는 금화 우편만 받는다.
  // 파트 B로 옛 업데이트 우편의 스킬북 2권이 사라져 그 우편(금화 3,000)도 아이템 없는 우편이 됐다 → 환영 1,000과 합쳐 4,000.
  assert.equal(row.save.gold, 4000, '아이템이 든 우편의 금화도 함께 주지 않는다(우편을 통째로 남긴다)');
  const after = await snapshot(db, 'mail-all');
  // 파트 B: 아이템은 보물 주머니(`pouches`)뿐이다 — 옛 우편의 `books`는 지급하지 않으므로 세지 않는다.
  for (const entry of after.mail) {
    if ((entry.pouches ?? 0) > 0) assert.equal(entry.claimedAt, null, `${entry.id} 는 미수령으로 남는다`);
  }
  const diamond = after.mail.find(entry => entry.id === DIAMOND_MAIL_ID);
  assert(diamond?.claimedAt, '아이템이 없는 다이아 우편은 받았다');
  const wallet = (await db.execute({ sql: 'SELECT diamonds FROM djrpg_shop_wallet WHERE account_id=?', args: ['mail-all'] })).rows[0];
  assert.equal(Number(wallet.diamonds), 4000);
});

test('가방이 39칸이면 보물 주머니 1개짜리 우편을 받아 40칸이 된다', async () => {
  await seed('mail-room', Array.from({ length: 39 }, () => gear()));
  const data = await snapshot(db, 'mail-room');
  // 새 시즌 안내 = 금화 1,000 + 무작위 보물 주머니 1개(파트 B에서도 그대로).
  const season = data.mail.find(entry => entry.id === SEASON_NOTICE_ID);
  assert(season);
  await claim('mail-room', 'mail', season.id);
  const row = await account(db, 'mail-room');
  assert.equal(row.save.bag.length, 40, '보물 주머니 1개가 40번째 칸');
  assert.equal(row.save.gold, 1000);
});

test('일일 전체 완료 보상(보물 주머니 1개)도 가방이 가득 차면 받지 않는다', async () => {
  await seed('daily-full', Array.from({ length: 40 }, () => gear()));
  await snapshot(db, 'daily-full');
  const stored = (await db.execute({ sql: 'SELECT state_json FROM djrpg_journey WHERE account_id=?', args: ['daily-full'] })).rows[0];
  const state = JSON.parse(stored.state_json);
  state.daily = { ...state.daily, kills: 300, seconds: 1800, worldBoss: 1, salvage: 1, login: 1 };
  await db.execute({ sql: 'UPDATE djrpg_journey SET state_json=? WHERE account_id=?', args: [JSON.stringify(state), 'daily-full'] });
  await assert.rejects(claim('daily-full', 'daily', 'completion'), error('BAG_FULL'));
  assert.equal((await account(db, 'daily-full')).save.bag.length, 40);
  // 개별 미션(금화만)은 받을 수 있다.
  const row = await claim('daily-full', 'daily', 'hunt');
  assert.equal(row.save.gold, 1000);
});

test('던전·창고: 가방이 가득 차면 스킬북·보물 주머니 꺼내기도 BAG_FULL로 막힌다', async () => {
  process.env.TURSO_DATABASE_URL = `file:${join(directory, 'bag.db')}`;
  process.env.TURSO_AUTH_TOKEN = 'local-bag-test';
  try {
    const storedBook = book('w-book'), storedPouch = pouch('w-pouch');
    await seed('warehouse-hero', Array.from({ length: 40 }, () => gear()));
    for (const item of [storedBook, storedPouch]) {
      await db.execute({ sql: 'INSERT OR REPLACE INTO djrpg_warehouse(account_id,item_id,item_json) VALUES (?,?,?)', args: ['warehouse-hero', item.id, JSON.stringify(item)] });
      await db.execute({ sql: 'INSERT OR REPLACE INTO djrpg_item_owners VALUES (?,?,?,?)', args: [item.id, 'warehouse-hero', 'warehouse', JSON.stringify(item)] });
      await db.execute({ sql: 'INSERT OR REPLACE INTO djrpg_character_item_owners VALUES (?,?,?)', args: [item.id, 'warehouse-hero', 0] });
    }
    const signed = Buffer.from(JSON.stringify({ id: 'warehouse-hero', exp: Date.now() + 60_000 })).toString('base64url');
    const token = `${signed}.${createHmac('sha256', process.env.TURSO_AUTH_TOKEN).update(signed).digest('base64url')}`;
    const call = async (handler, body) => {
      const result = {};
      const res = { status(code) { result.status = code; return this; }, json(data) { result.body = data; return this; } };
      await handler({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body }, res);
      return result;
    };
    await transaction(db, async tx => { const row = await account(tx, 'warehouse-hero'); await reconcileItems(tx, 'warehouse-hero', row.save, row.save); });
    const revision = async () => (await account(db, 'warehouse-hero')).revision;
    for (const item of [storedBook, storedPouch]) {
      const blocked = await call(warehouseHandler, { action: 'withdraw', itemIds: [item.id], requestId: randomUUID(), revision: await revision(), characterSlot: 1 });
      assert.equal(blocked.status, 409, `${item.slot} 꺼내기가 막힌다`);
      assert.equal(blocked.body.code, 'BAG_FULL');
    }
    const listed = await call(warehouseHandler, { action: 'list' });
    assert.equal(listed.body.items.length, 2, '창고에는 그대로 남아 있다');
    // 39칸이면 스킬북을 꺼내 40칸이 된다.
    const trimmed = JSON.parse((await db.execute({ sql: 'SELECT save_json FROM djrpg_characters WHERE account_id=? AND slot=1', args: ['warehouse-hero'] })).rows[0].save_json);
    trimmed.bag.pop();
    await db.execute({ sql: 'UPDATE djrpg_characters SET save_json=? WHERE account_id=? AND slot=1', args: [JSON.stringify(trimmed), 'warehouse-hero'] });
    const moved = await call(warehouseHandler, { action: 'withdraw', itemIds: [storedBook.id], requestId: randomUUID(), revision: await revision(), characterSlot: 1 });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.save.bag.length, 40);
    assert(moved.body.save.bag.some(item => item.id === storedBook.id), '스킬북이 가방으로 들어왔다');
  } finally { delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN; }
});
