import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { removeTempDbDirectory } from './helpers/temp-db.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { schema, account, transaction, reconcileItems } from '../server/database.mjs';
import { mutate, snapshot } from '../server/market.mjs';
import { mutate as mutateJourney } from '../server/journey.mjs';
import accountHandler from '../api/account.mjs';
import warehouseHandler from '../api/warehouse.mjs';
import './ts-loader.mjs';
const { SaveSync } = await import('../src/game/sync.ts');
const { parseSave } = await import('../src/game/store.ts');

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
    await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: ['hero', 'test-hash', JSON.stringify(legacy), new Date().toISOString()] });
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
    // 작업 224: 전환 응답이 활성 캐릭터 이름·리비전·오프라인 초를 함께 준다(HUD 닉네임·즉시 입장).
    assert.equal(created.body.characterName, '새전사'); assert.equal(created.body.characterSlot, 2);
    assert.equal(created.body.revision, deposited.body.revision + 1); assert.equal(created.body.offlineSeconds, 0);
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
    assert.equal(selected.body.characterName, '기존 전사'); assert.equal(selected.body.characterSlot, 1);
    assert.equal(selected.body.revision, withdrawn.body.revision + 1);
    assert.equal(typeof selected.body.offlineSeconds, 'number');
    const forged = structuredClone(selected.body.save); forged.bag.push(item);
    const rejected = await call(accountHandler, { action: 'save', save: forged, revision: selected.body.revision, requestId: randomUUID(), characterSlot: 1 });
    assert.equal(rejected.status, 409); assert.equal(rejected.body.code, 'ITEM_CONFLICT');
    const characters = await call(accountHandler, { action: 'characters' });
    assert.equal(characters.status, 200); assert.deepEqual(characters.body.characters.map(entry => entry.slot), [1, 2]);
    const profile = (await db.execute({ sql: 'SELECT shared_gold FROM djrpg_account_profiles WHERE account_id=?', args: ['hero'] })).rows[0];
    assert.equal(Number(profile.shared_gold), 70);
    const switched = await call(accountHandler, { action: 'selectCharacter', slot: 2, revision: selected.body.revision });
    assert.equal(switched.status, 200);
    assert.equal(switched.body.characterName, '새전사'); assert.equal(switched.body.save.name, '새전사');
    assert.equal(switched.body.save.gold, 70, '공용 금화는 캐릭터를 바꿔도 그대로');
    await assert.rejects(mutateJourney(db, 'hero', { action: 'journey-claim', kind: 'mail', id: 'all', revision: switched.body.revision, requestId: randomUUID(), characterSlot: 1 }), error => error.code === 'CHARACTER_CONFLICT');
    const reward = await mutateJourney(db, 'hero', { action: 'journey-claim', kind: 'mail', id: 'all', revision: switched.body.revision, requestId: randomUUID(), characterSlot: 2 });
    // 우편함에는 환영 1,000 · 2026-11-20 업데이트 안내 3,000 · 새 시즌 오픈 1,000(작업 208)이 함께 있다.
    assert.equal(reward.save.gold, 5070);
    // 파트 B: 우편에서 스킬북을 주지 않으므로 아이템은 보물 주머니 하나뿐이다.
    const rewardItem = reward.save.bag.find(entry => entry.slot === 'pouch');
    assert(rewardItem);
    const rewardOwner = (await db.execute({ sql: 'SELECT slot FROM djrpg_character_item_owners WHERE item_id=?', args: [rewardItem.id] })).rows[0];
    assert.equal(Number(rewardOwner.slot), 2);
  } finally {
    await db.close(); delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
    await removeTempDbDirectory(directory);
  }
});

test('unknown warehouse result resumes combat and is re-checked in the background', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const save = structuredClone(legacy), sync = new SaveSync(save, { accountId: 'hero', token: 'token', revision: 0, characterSlot: 1, save });
  const pauses = [], requests = []; let recovered = 0;
  sync.onPause = value => pauses.push(value);
  sync.onWarehouseRecovered = () => { recovered++; };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const request = JSON.parse(options.body); requests.push(request);
    if (requests.length <= 2) throw new Error('response lost');
    return { ok: true, json: async () => ({ ok: true, revision: 2, save, moved: [item.id], items: [] }) };
  });
  await assert.rejects(sync.transferWarehouse('deposit', item.id), /자동으로 다시 확인/);
  // 작업 258 — 결과를 모르는 이동이 화면을 잠근 채 남지 않는다(사냥이 바로 다시 돈다).
  assert.equal(sync.pendingWarehouse, undefined, '결과 미확인 상태를 화면에 남기지 않는다');
  assert.deepEqual(pauses, [true, false], '보내는 동안만 멈추고 곧 다시 돈다');
  assert.equal(sync.warehouseSettling, true, '화면 밖에서 같은 요청으로 결과를 확인한다');
  assert.equal(sync.locked, false);
  t.mock.timers.tick(800);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sync.warehouseSettling, false);
  assert.equal(pauses.at(-1), false, '확인이 끝나도 사냥은 계속 돈다');
  assert.equal(recovered, 1); assert.equal(requests.length, 3);
  assert(requests.every(request => request.requestId === requests[0].requestId), '같은 requestId(서버 멱등)로만 다시 확인한다');
  assert.equal(sync.revision, 2);
});

test('server errors resume combat and the transfer is confirmed in the background', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const save = structuredClone(legacy), sync = new SaveSync(save, { accountId: 'hero', token: 'token', revision: 0, characterSlot: 1, save });
  const pauses = [], requests = [];
  sync.onPause = value => pauses.push(value);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(JSON.parse(options.body));
    if (requests.length <= 2) return { ok: false, status: 503, json: async () => ({ error: '일시적인 서버 오류' }) };
    return { ok: true, json: async () => ({ ok: true, revision: 2, save, moved: [item.id], items: [] }) };
  });
  await assert.rejects(sync.transferWarehouse('deposit', item.id), /자동으로 다시 확인/);
  assert.equal(sync.pendingWarehouse, undefined);
  assert.deepEqual(pauses, [true, false]);
  assert.equal(sync.warehouseSettling, true);
  t.mock.timers.tick(800);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sync.warehouseSettling, false);
  assert.equal(requests.length, 3);
  assert(requests.every(request => request.requestId === requests[0].requestId));
  assert.equal(sync.revision, 2);
});

test('loading a save drops ghost items and restores tampered ones so the next save is not stuck', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-heal-load-'));
  const url = `file:${join(directory, 'heal.db')}`;
  process.env.TURSO_DATABASE_URL = url; process.env.TURSO_AUTH_TOKEN = 'local-heal-test';
  const db = createClient({ url });
  const sword = (id, attack = 25) => ({ id, name: '강철 쯔바이핸드', slot: 'weapon', rarity: 'rare', stats: { attack } });
  const helmet = { id: 'stale-helmet', name: '강철 투구', slot: 'helmet', rarity: 'rare', stats: { defense: 8 } };
  const gloves = { id: 'stale-gloves', name: '강철 장갑', slot: 'gloves', rarity: 'rare', stats: { defense: 4 } };
  const save = { version: 1, name: '전사', gender: 'male', gold: 120, level: 5, floor: 2, bag: [sword('clean'), sword('gone-consumed'), sword('rival-item'), sword('slot-two-item'), sword('tampered', 999), sword('clean')], equipment: { helmet, gloves }, equipmentCollection: [], quickSlots: [null, null, null], learned: [], passives: [], skillLevels: {} };
  const owner = async (item, accountId, location, slot) => {
    await db.execute({ sql: 'INSERT INTO djrpg_item_owners VALUES (?,?,?,?)', args: [item.id, accountId, location, JSON.stringify(item)] });
    if (slot) await db.execute({ sql: 'INSERT INTO djrpg_character_item_owners VALUES (?,?,?)', args: [item.id, accountId, slot] });
  };
  try {
    await schema(db);
    await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: ['hero', 'test-hash', JSON.stringify(save), new Date().toISOString()] });
    await owner(sword('clean'), 'hero', 'inventory', 1);
    await owner(sword('gone-consumed'), 'hero', 'consumed');
    await owner(sword('rival-item'), 'rival', 'inventory', 1);
    await owner(sword('slot-two-item'), 'hero', 'inventory', 2);
    await owner(sword('tampered', 25), 'hero', 'inventory', 1);
    await owner(helmet, 'hero', 'inventory', 1);
    await owner(gloves, 'hero', 'consumed');
    const signed = Buffer.from(JSON.stringify({ id: 'hero', exp: Date.now() + 60_000 })).toString('base64url');
    const token = `${signed}.${createHmac('sha256', process.env.TURSO_AUTH_TOKEN).update(signed).digest('base64url')}`;
    const call = async body => {
      const result = {};
      const res = { status(code) { result.status = code; return this; }, json(data) { result.body = data; return this; } };
      await accountHandler({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body }, res);
      return result;
    };
    const loaded = await call({ action: 'load' });
    assert.equal(loaded.status, 200);
    assert.deepEqual(loaded.body.save.bag.map(entry => entry.id), ['clean', 'tampered']);
    assert.equal(loaded.body.save.bag[1].stats.attack, 25);
    assert.deepEqual(Object.keys(loaded.body.save.equipment), ['helmet']);
    assert.equal(loaded.body.save.gold, 120);
    assert.equal(loaded.body.revision, 0);
    const stored = (await db.execute({ sql: 'SELECT save_json FROM djrpg_characters WHERE account_id=? AND slot=1', args: ['hero'] })).rows[0];
    const storedSave = JSON.parse(stored.save_json);
    assert.deepEqual(storedSave.bag.map(entry => entry.id), ['clean', 'tampered']);
    assert.equal(storedSave.gold, undefined);
    const next = await call({ action: 'save', save: loaded.body.save, revision: loaded.body.revision, requestId: randomUUID(), characterSlot: 1 });
    assert.equal(next.status, 200);
    assert.equal(next.body.revision, 1);
    const clean = await call({ action: 'load' });
    assert.equal(clean.status, 200);
    assert.deepEqual(clean.body.save.bag.map(entry => entry.id), ['clean', 'tampered']);
  } finally {
    await db.close(); delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
    await removeTempDbDirectory(directory);
  }
});

test('legacy item names survive parseSave, so load then save no longer deadlocks on 409 ITEM_CONFLICT', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-item-name-'));
  const url = `file:${join(directory, 'item-name.db')}`;
  process.env.TURSO_DATABASE_URL = url; process.env.TURSO_AUTH_TOKEN = 'local-item-name-test';
  const db = createClient({ url });
  const blade = { id: 'legacy-zweihander', name: '영원의 츠바이핸더', slot: 'weapon', rarity: 'legendary', stats: { attack: 40, crit: 6 } };
  // 파트 B: 옛 스킬북 대신 영구 스탯북으로 이름-마이그레이션 허용 경로를 검사한다(서버가 받는 모양).
  const book = { id: 'legacy-statbook', name: '공격의 서', slot: 'statbook', kind: 'statbook', book: 'attack', rarity: 'unique', stats: {} };
  try {
    await schema(db);
    await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: ['hero', 'test-hash', JSON.stringify({ ...legacy, bag: [blade, book], equipment: {}, gold: 10 }), new Date().toISOString()] });
    await transaction(db, async tx => { const row = await account(tx, 'hero'); await reconcileItems(tx, 'hero', row.save, row.save); });
    const signed = Buffer.from(JSON.stringify({ id: 'hero', exp: Date.now() + 60_000 })).toString('base64url');
    const token = `${signed}.${createHmac('sha256', process.env.TURSO_AUTH_TOKEN).update(signed).digest('base64url')}`;
    const call = async body => {
      const result = {};
      const res = { status(code) { result.status = code; return this; }, json(data) { result.body = data; return this; } };
      await accountHandler({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body }, res);
      return result;
    };
    const names = save => save.bag.map(entry => entry.name);
    const loaded = await call({ action: 'load' });
    assert.equal(loaded.status, 200);
    const client = parseSave(loaded.body.save, 'hero');
    assert.deepEqual(names(client), ['영원의 츠바이핸더', '공격의 서']);
    const saved = await call({ action: 'save', save: client, revision: loaded.body.revision, requestId: randomUUID(), characterSlot: 1 });
    assert.equal(saved.status, 200);
    // 아직 이름을 덮어쓰는 구버전 번들이 저장을 보내도 영구 409가 아니라 서버에 저장된 이름으로 정리되어 통과한다.
    const staleClient = structuredClone(saved.body.save);
    staleClient.bag[0].name = '영원의 쯔바이핸드';
    staleClient.bag[1].name = '체력의 서';
    const tolerated = await call({ action: 'save', save: staleClient, revision: saved.body.revision, requestId: randomUUID(), characterSlot: 1 });
    assert.equal(tolerated.status, 200);
    assert.deepEqual(names(tolerated.body.save), ['영원의 츠바이핸더', '공격의 서']);
    // 이름이 달라도 등급·능력치 변조는 계속 ITEM_CONFLICT로 막는다.
    const forged = structuredClone(staleClient);
    forged.bag[0].stats.attack = 999;
    const rejected = await call({ action: 'save', save: forged, revision: tolerated.body.revision, requestId: randomUUID(), characterSlot: 1 });
    assert.equal(rejected.status, 409); assert.equal(rejected.body.code, 'ITEM_CONFLICT');
  } finally {
    await db.close(); delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
    await removeTempDbDirectory(directory);
  }
});
