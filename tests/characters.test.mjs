import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { schema, account } from '../server/database.mjs';
import { mutate, snapshot } from '../server/market.mjs';
import { mutate as mutateJourney } from '../server/journey.mjs';
import accountHandler from '../api/account.mjs';
import warehouseHandler from '../api/warehouse.mjs';
import './ts-loader.mjs';
const { SaveSync } = await import('../src/game/sync.ts');

const item = { id: 'legacy-sword-1', name: '기존 검', slot: 'weapon', rarity: 'rare', stats: { attack: 10 } };
const listedItem = { ...item, id: 'legacy-axe-2', name: '기존 도끼' };
const legacy = { version: 1, accountId: 'hero', name: '기존 전사', gender: 'female', auto: true, autoClimb: true, level: 8, exp: 25, gold: 50, floor: 4, maxFloor: 4, floorKills: 3, kills: 50, health: 80, equipment: {}, equipmentCollection: [], bag: [item, listedItem], tutorial: 3, stones: 0, skillPoints: 7, lastActiveAt: Date.now(), learned: [], passives: [], quickSlots: [null,null,null], skillLevels: {} };

test('legacy slot, shared gold and warehouse transfers preserve independent characters', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-characters-'));
  const url = `file:${join(directory, 'characters.db')}`;
  process.env.TURSO_DATABASE_URL = url; process.env.TURSO_AUTH_TOKEN = 'local-character-test';
  const db = createClient({ url });
  try {
    await schema(db);
    await db.execute({ sql: 'INSERT INTO djrpg_accounts VALUES (?,?,?,?)', args: ['hero', 'test-hash', JSON.stringify(legacy), new Date().toISOString()] });
    const signed = Buffer.from(JSON.stringify({ id: 'hero', exp: Date.now() + 60_000 })).toString('base64url');
    const token = `${signed}.${createHmac('sha256', process.env.TURSO_AUTH_TOKEN).update(signed).digest('base64url')}`;
    const call = async (handler, body) => {
      const result = {};
      const res = { status(code) { result.status = code; return this; }, json(data) { result.body = data; return this; } };
      await handler({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body }, res);
      return result;
    };
    const migrated = await account(db, 'hero');
    assert.equal(migrated.slot, 1); assert.equal(migrated.save.level, 8); assert.equal(migrated.save.gold, 50);
    const original = (await db.execute({ sql: 'SELECT save_json FROM djrpg_accounts WHERE id=?', args: ['hero'] })).rows[0];
    assert.deepEqual(JSON.parse(original.save_json), legacy);
    const first = structuredClone(migrated.save); first.gold = 70;
    const saved = await call(accountHandler, { action: 'save', save: first, revision: 0, requestId: randomUUID(), characterSlot: 1 });
    assert.equal(saved.status, 200); assert.equal(saved.body.save.gold, 70);
    const stored = (await db.execute({ sql: 'SELECT save_json FROM djrpg_characters WHERE account_id=? AND slot=1', args: ['hero'] })).rows[0];
    assert.equal(JSON.parse(stored.save_json).gold, undefined);
    const marketRequestId = randomUUID();
    const listing = await mutate(db, 'hero', { action: 'register', itemId: listedItem.id, price: 100, revision: saved.body.revision, requestId: marketRequestId, characterSlot: 1, progress: saved.body.save });
    const depositId = randomUUID();
    const deposited = await call(warehouseHandler, { action: 'deposit', itemId: item.id, requestId: depositId, revision: listing.revision, characterSlot: 1 });
    assert.equal(deposited.status, 200); assert.equal(deposited.body.save.bag.length, 0);
    const replay = await call(warehouseHandler, { action: 'deposit', itemId: item.id, requestId: depositId, revision: saved.body.revision, characterSlot: 1 });
    assert.equal(replay.status, 200); assert.equal(replay.body.revision, deposited.body.revision);
    const created = await call(accountHandler, { action: 'createCharacter', slot: 2, name: '새전사', gender: 'male', revision: deposited.body.revision });
    assert.equal(created.status, 200); assert.equal(created.body.save.gold, 70);
    await assert.rejects(mutate(db, 'hero', { action: 'register', requestId: marketRequestId, characterSlot: 1 }), error => error.code === 'CHARACTER_CONFLICT');
    const staleWarehouse = await call(warehouseHandler, { action: 'deposit', itemId: item.id, requestId: depositId, revision: deposited.body.revision, characterSlot: 1 });
    assert.equal(staleWarehouse.status, 409); assert.equal(staleWarehouse.body.code, 'CHARACTER_CONFLICT');
    assert((await snapshot(db, 'hero', { view: 'mine' })).listings.some(entry => entry.id === listing.effect.listing.id));
    const listed = await call(warehouseHandler, { action: 'list' });
    assert.equal(listed.body.items.length, 1);
    const withdrawn = await call(warehouseHandler, { action: 'withdraw', itemId: item.id, requestId: randomUUID(), revision: created.body.revision, characterSlot: 2 });
    assert.equal(withdrawn.status, 200); assert.equal(withdrawn.body.save.bag[0].id, item.id);
    const selected = await call(accountHandler, { action: 'selectCharacter', slot: 1, revision: withdrawn.body.revision });
    assert.equal(selected.status, 200); assert.equal(selected.body.save.level, 8); assert.equal(selected.body.save.gold, 70);
    assert.equal(selected.body.save.bag.length, 0);
    const forged = structuredClone(selected.body.save); forged.bag.push(item);
    const rejected = await call(accountHandler, { action: 'save', save: forged, revision: selected.body.revision, requestId: randomUUID(), characterSlot: 1 });
    assert.equal(rejected.status, 409); assert.equal(rejected.body.code, 'ITEM_CONFLICT');
    const characters = await call(accountHandler, { action: 'characters' });
    assert.equal(characters.status, 200); assert.deepEqual(characters.body.characters.map(entry => entry.slot), [1, 2]);
    const profile = (await db.execute({ sql: 'SELECT shared_gold FROM djrpg_account_profiles WHERE account_id=?', args: ['hero'] })).rows[0];
    assert.equal(Number(profile.shared_gold), 70);
    const switched = await call(accountHandler, { action: 'selectCharacter', slot: 2, revision: selected.body.revision });
    assert.equal(switched.status, 200);
    await assert.rejects(mutateJourney(db, 'hero', { action: 'journey-claim', kind: 'mail', id: 'all', revision: switched.body.revision, requestId: randomUUID(), characterSlot: 1 }), error => error.code === 'CHARACTER_CONFLICT');
    const reward = await mutateJourney(db, 'hero', { action: 'journey-claim', kind: 'mail', id: 'all', revision: switched.body.revision, requestId: randomUUID(), characterSlot: 2 });
    assert.equal(reward.save.gold, 1070);
    const rewardItem = reward.save.bag.find(entry => entry.slot === 'skillbook');
    assert(rewardItem);
    const rewardOwner = (await db.execute({ sql: 'SELECT slot FROM djrpg_character_item_owners WHERE item_id=?', args: [rewardItem.id] })).rows[0];
    assert.equal(Number(rewardOwner.slot), 2);
  } finally {
    await db.close(); delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('unknown warehouse result retries the same transfer and resumes combat', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const save = structuredClone(legacy), sync = new SaveSync(save, { accountId: 'hero', token: 'token', revision: 0, characterSlot: 1, save });
  const pauses = [], requests = []; let recovered = 0;
  sync.onPause = value => pauses.push(value);
  sync.onWarehouseRecovered = () => { recovered++; };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === '/api/account') return { ok: true, json: async () => ({ ok: true, revision: 1 }) };
    const request = JSON.parse(options.body); requests.push(request);
    if (requests.length <= 3) throw new Error('response lost');
    return { ok: true, json: async () => ({ ok: true, revision: 2, save }) };
  });
  await assert.rejects(sync.transferWarehouse('deposit', item.id), /자동으로 다시 확인/);
  assert(sync.pendingWarehouse); assert.deepEqual(pauses, [true]);
  t.mock.timers.tick(2000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sync.pendingWarehouse, undefined); assert.equal(pauses.at(-1), false);
  assert.equal(recovered, 1); assert.equal(requests.length, 4);
  assert(requests.every(request => request.requestId === requests[0].requestId));
});

test('server errors keep the warehouse request pending until its result is confirmed', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const save = structuredClone(legacy), sync = new SaveSync(save, { accountId: 'hero', token: 'token', revision: 0, characterSlot: 1, save });
  const pauses = [], requests = [];
  sync.onPause = value => pauses.push(value);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === '/api/account') return { ok: true, json: async () => ({ ok: true, revision: 1 }) };
    requests.push(JSON.parse(options.body));
    if (requests.length <= 3) return { ok: false, status: 503, json: async () => ({ error: '일시적인 서버 오류' }) };
    return { ok: true, json: async () => ({ ok: true, revision: 2, save }) };
  });
  await assert.rejects(sync.transferWarehouse('deposit', item.id), /자동으로 다시 확인/);
  assert(sync.pendingWarehouse); assert.deepEqual(pauses, [true]);
  t.mock.timers.tick(2000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sync.pendingWarehouse, undefined); assert.equal(pauses.at(-1), false);
  assert.equal(requests.length, 4);
  assert(requests.every(request => request.requestId === requests[0].requestId));
});
