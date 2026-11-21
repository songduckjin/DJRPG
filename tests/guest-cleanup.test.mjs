import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { configureDatabase } from '../server/database-config.mjs';
import { schema } from '../server/database.mjs';
import { dungeonSchema } from '../server/dungeon-schema.mjs';
import { worldBossSchema } from '../server/world-boss-schema.mjs';
import { ACCOUNT_TABLES, MARKET_TABLE } from '../server/account-delete.mjs';
import { accountEndpoint } from '../server/endpoints/account.mjs';
import { adminEndpoint } from '../server/endpoints/admin.mjs';
import {
  cleanupExpiredGuests,
  touchGuestActivity,
  GUEST_TTL_MS,
  GUEST_CLEANUP_COOLDOWN_MS,
  GUEST_TOUCH_INTERVAL_MS,
  GUEST_CLEANUP_LIMIT,
  GUEST_ADMIN_CLEANUP_LIMIT
} from '../server/guest-cleanup.mjs';

// 게스트 계정 24시간 자동 삭제(작업 259) — 실제 libSQL 파일 DB로 지운다.
configureDatabase(createClient);

const HOUR = 60 * 60 * 1000;

async function openDatabase(name) {
  const directory = await mkdtemp(join(tmpdir(), `djrpg-${name}-`));
  const url = `file:${join(directory, `${name}.db`)}`;
  process.env.TURSO_DATABASE_URL = url;
  process.env.TURSO_AUTH_TOKEN = `local-${name}-token`;
  const db = createClient({ url });
  await schema(db);
  // 던전·월드보스 표는 처음 쓰일 때 만들어지므로, 계정 종속 표 전부를 확인하려면 미리 만든다.
  await dungeonSchema(db);
  await worldBossSchema(db);
  return db;
}

/** 실제 Pages Functions와 같은 입구로 부른다(`/api/account`). */
function endpoint() {
  return async (body, token) => {
    const request = new Request('https://djrpg.pages.dev/api/account', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    });
    const response = await accountEndpoint(request, { env: process.env });
    return { status: response.status, body: await response.json() };
  };
}

const authorized = path => new Request(`https://example.test/api/admin${path}`, {
  headers: { Authorization: `Basic ${Buffer.from('djsong:example-secret').toString('base64')}` }
});
const adminEnv = () => ({ ...process.env, ADMIN_DASHBOARD_PASSWORD: 'example-secret', ADMIN_DASHBOARD_USER: 'djsong' });

/** 관리자 엔드포인트는 `createDbClient` 연결을 스스로 닫는다 — 테스트 DB는 남겨야 하므로 감싼다. */
const adminCall = async (db, path) => {
  const wrapper = { execute: query => db.execute(query), batch: (statements, mode) => db.batch(statements, mode), transaction: mode => db.transaction(mode), close() {} };
  const response = await adminEndpoint(authorized(path), { env: adminEnv(), createDbClient: () => wrapper });
  return { status: response.status, body: await response.json() };
};

const rowCount = async (db, table, where, args) => Number((await db.execute({ sql: `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, args })).rows[0].n);
const stampOf = async (db, id) => String((await db.execute({ sql: 'SELECT updated_at FROM djrpg_accounts WHERE id=?', args: [id] })).rows[0]?.updated_at ?? '');
const ageBy = (db, id, ms) => db.execute({ sql: 'UPDATE djrpg_accounts SET updated_at=? WHERE id=?', args: [new Date(Date.now() - ms).toISOString(), id] });

/** 게스트 하나에 계정 종속 표 몇 개를 심는다 — 지울 때 하나라도 남으면 여기서 걸린다. */
async function seedGuestRows(db, id) {
  const now = Date.now();
  const item = { id: `${id}-sword`, name: '기존 검', slot: 'weapon', rarity: 'rare', stats: { attack: 10 } };
  await db.batch([
    { sql: 'INSERT INTO djrpg_item_owners(item_id,account_id,location,item_json) VALUES (?,?,?,?)', args: [item.id, id, 'inventory', JSON.stringify(item)] },
    { sql: 'INSERT INTO djrpg_warehouse(account_id,item_id,item_json) VALUES (?,?,?)', args: [id, `${id}-box`, JSON.stringify({ ...item, id: `${id}-box` })] },
    { sql: 'INSERT INTO djrpg_journey(account_id,state_json) VALUES (?,?)', args: [id, '{}'] },
    { sql: 'INSERT INTO djrpg_character_item_owners(item_id,account_id,slot) VALUES (?,?,1)', args: [item.id, id] },
    { sql: 'INSERT INTO djrpg_market(id,seller,seller_name,buyer,item_json,name,slot,rarity,price,state,created_at,expires_at,sold_at) VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,NULL)',
      args: [`${id}-listing`, id, id, JSON.stringify(item), item.name, item.slot, item.rarity, 500, 'active', now, now + 60_000] },
    { sql: 'INSERT INTO djrpg_market_events(kind,listing_id,created_at) VALUES (?,?,?)', args: ['listed', `${id}-listing`, now] }
  ]);
}

test('마지막 활동이 24시간 지난 게스트는 계정 종속 표까지 함께 지워진다', async () => {
  const db = await openDatabase('guest-cleanup-expired');
  try {
    const call = endpoint();
    const guest = (await call({ action: 'guest' })).body;
    assert.equal(guest.guest, true);
    await seedGuestRows(db, guest.accountId);
    await ageBy(db, guest.accountId, GUEST_TTL_MS + HOUR); // 25시간 전

    const result = await cleanupExpiredGuests(db, { force: true });
    assert.equal(result.deletedCount, 1);
    assert.deepEqual(result.deletedIds, [guest.accountId]);

    for (const table of ACCOUNT_TABLES) assert.equal(await rowCount(db, table, 'account_id=?', [guest.accountId]), 0, `${table} 잔여 행`);
    assert.equal(await rowCount(db, MARKET_TABLE, 'seller=? OR buyer=?', [guest.accountId, guest.accountId]), 0);
    assert.equal(await rowCount(db, 'djrpg_market_events', 'listing_id=?', [`${guest.accountId}-listing`]), 0);
    assert.equal(await rowCount(db, 'djrpg_accounts', 'id=?', [guest.accountId]), 0);

    // 지워진 게스트의 토큰은 더 이상 통하지 않는다.
    assert.equal((await call({ action: 'load' }, guest.token)).status, 401);
  } finally { await db.close(); }
});

test('23시간 남짓 활동한 게스트와 일반 계정은 지우지 않는다', async () => {
  const db = await openDatabase('guest-cleanup-keeps');
  try {
    const call = endpoint();
    const fresh = (await call({ action: 'guest' })).body;
    const recent = (await call({ action: 'guest' })).body;
    const member = (await call({ action: 'register', loginId: 'keeper', password: 'password123' })).body;
    await ageBy(db, recent.accountId, GUEST_TTL_MS - HOUR);  // 23시간 전
    await ageBy(db, member.accountId, 30 * 24 * HOUR);       // 정식 계정은 30일 뒤에도 남는다

    const result = await cleanupExpiredGuests(db, { force: true });
    assert.deepEqual(result.deletedIds, []);

    assert.equal(await rowCount(db, 'djrpg_accounts', 'id=?', [fresh.accountId]), 1);
    assert.equal(await rowCount(db, 'djrpg_accounts', 'id=?', [recent.accountId]), 1);
    assert.equal(await rowCount(db, 'djrpg_accounts', 'id=?', [member.accountId]), 1);
    assert.equal(await rowCount(db, 'djrpg_characters', 'account_id=?', [recent.accountId]), 1);
    assert.equal((await call({ action: 'load' }, recent.token)).status, 200);
    assert.equal((await call({ action: 'login', loginId: 'keeper', password: 'password123' })).status, 200);
  } finally { await db.close(); }
});

test('한 번에 지우는 수는 limit까지만이고 남은 게스트는 다음 정리에서 지운다', async () => {
  const db = await openDatabase('guest-cleanup-limit');
  try {
    const call = endpoint();
    const guests = [];
    for (let i = 0; i < 3; i += 1) {
      const guest = (await call({ action: 'guest' })).body;
      await ageBy(db, guest.accountId, GUEST_TTL_MS + HOUR); // 모두 25시간 전
      guests.push(guest.accountId);
    }

    const first = await cleanupExpiredGuests(db, { force: true, limit: 2 });
    assert.equal(first.deletedCount, 2);
    assert.equal(await rowCount(db, 'djrpg_accounts', "password_hash='guest'", []), 1);

    const second = await cleanupExpiredGuests(db, { force: true, limit: 2 });
    assert.equal(second.deletedCount, 1);
    assert.equal(await rowCount(db, 'djrpg_accounts', "password_hash='guest'", []), 0);
    assert.deepEqual([...first.deletedIds, ...second.deletedIds].sort(), [...guests].sort());
  } finally { await db.close(); }
});

test('쿨다운 안에서는 다시 지우지 않고 force면 건너뛴다', async () => {
  const db = await openDatabase('guest-cleanup-cooldown');
  try {
    const call = endpoint();
    const first = (await call({ action: 'guest' })).body;
    const second = (await call({ action: 'guest' })).body;
    await ageBy(db, first.accountId, GUEST_TTL_MS + HOUR);
    await ageBy(db, second.accountId, GUEST_TTL_MS + HOUR);

    const t0 = Date.now();
    const cleaned = await cleanupExpiredGuests(db, { now: t0, force: true, limit: 1 });
    assert.equal(cleaned.deletedCount, 1);

    const withinCooldown = await cleanupExpiredGuests(db, { now: t0 + 1000, limit: 5 });
    assert.equal(withinCooldown.skipped, true);
    assert.equal(withinCooldown.deletedCount, 0);
    assert.equal(await rowCount(db, 'djrpg_accounts', "password_hash='guest'", []), 1);

    const afterCooldown = await cleanupExpiredGuests(db, { now: t0 + GUEST_CLEANUP_COOLDOWN_MS + 1000, limit: 5 });
    assert.equal(afterCooldown.deletedCount, 1);
    assert.equal(await rowCount(db, 'djrpg_accounts', "password_hash='guest'", []), 0);
  } finally { await db.close(); }
});

test('게스트 입장이 오래된 게스트를 정리하고, 새 게스트는 그대로 만들어진다', async () => {
  const db = await openDatabase('guest-cleanup-entry');
  try {
    const call = endpoint();
    const old = (await call({ action: 'guest' })).body;
    await ageBy(db, old.accountId, GUEST_TTL_MS + HOUR);

    // 쿨다운은 아이솔레이트 전역(모듈 상태)이라 앞선 테스트가 남긴 시각을 0으로 되돌린다 —
    // `now:0`은 아무것도 지우지 않으면서 마지막 정리 시각만 초기화한다(입장 경로가 실제로 돌게).
    await cleanupExpiredGuests(db, { force: true, now: 0 });
    const before = await rowCount(db, 'djrpg_accounts', "password_hash='guest'", []);
    assert.equal(before, 1);
    const entered = await call({ action: 'guest' });
    assert.equal(entered.status, 200);
    assert.equal(entered.body.guest, true);
    assert.equal(await rowCount(db, 'djrpg_accounts', 'id=?', [old.accountId]), 0);
    assert.equal(await rowCount(db, 'djrpg_accounts', 'id=?', [entered.body.accountId]), 1);
    assert.equal((await call({ action: 'load' }, entered.body.token)).status, 200);
  } finally { await db.close(); }
});

test('게스트 load는 1시간 넘게 낡은 활동 시각만 다시 찍는다', async () => {
  const db = await openDatabase('guest-cleanup-touch');
  try {
    const call = endpoint();
    const guest = (await call({ action: 'guest' })).body;
    await ageBy(db, guest.accountId, GUEST_TOUCH_INTERVAL_MS + HOUR);
    const stale = await stampOf(db, guest.accountId);

    assert.equal((await call({ action: 'load' }, guest.token)).status, 200);
    const touched = await stampOf(db, guest.accountId);
    assert.notEqual(touched, stale);
    assert.ok(Date.now() - Date.parse(touched) < 60_000, `활동 시각이 지금이어야 한다: ${touched}`);

    // 곧바로 다시 불러도 1시간 안이므로 쓰지 않는다.
    assert.equal((await call({ action: 'load' }, guest.token)).status, 200);
    assert.equal(await stampOf(db, guest.accountId), touched);

    // 정식 계정은 load로 활동 시각을 다시 찍지 않는다(정리 대상이 아니다).
    const member = (await call({ action: 'register', loginId: 'toucher', password: 'password123' })).body;
    await ageBy(db, member.accountId, 3 * HOUR);
    const memberStamp = await stampOf(db, member.accountId);
    assert.equal(await touchGuestActivity(db, { id: member.accountId, password_hash: 'sha256$mock', updated_at: memberStamp }), false);
    assert.equal(await stampOf(db, member.accountId), memberStamp);
  } finally { await db.close(); }
});

test('관리자 포털은 집계·목록 전에 오래된 게스트를 정리한다', async () => {
  const db = await openDatabase('guest-cleanup-admin');
  try {
    const call = endpoint();
    const expired = (await call({ action: 'guest' })).body;
    const alive = (await call({ action: 'guest' })).body;
    await seedGuestRows(db, expired.accountId);
    await ageBy(db, expired.accountId, GUEST_TTL_MS + HOUR);

    const status = await adminCall(db, '?view=status');
    assert.equal(status.status, 200);
    assert.equal(status.body.database, 'ok');
    assert.equal(status.body.guestsCleaned, 1);
    assert.equal(status.body.accounts, 1, '집계는 정리 뒤 상태여야 한다');
    assert.equal(await rowCount(db, 'djrpg_accounts', 'id=?', [expired.accountId]), 0);
    // 게스트 행에 붙어 있던 표도 함께 사라진다.
    assert.equal(await rowCount(db, 'djrpg_warehouse', 'account_id=?', [expired.accountId]), 0);
    assert.equal(await rowCount(db, MARKET_TABLE, 'seller=?', [expired.accountId]), 0);

    const accounts = await adminCall(db, '?view=accounts');
    assert.equal(accounts.status, 200);
    assert.equal(accounts.body.total, 1);
    assert.deepEqual(accounts.body.accounts.map(entry => entry.id), [alive.accountId]);
    assert.equal(accounts.body.guestsCleaned, 0);
    assert.equal(GUEST_ADMIN_CLEANUP_LIMIT >= GUEST_CLEANUP_LIMIT, true);
  } finally { await db.close(); }
});

test('정리 조회가 실패해도 게스트 입장과 관리자 조회는 성공한다', async () => {
  const brokenSelect = { execute: async query => {
    if (typeof query === 'object' && String(query.sql).includes('SELECT id FROM djrpg_accounts')) throw new Error('read replica unavailable');
    return { rows: [{ count: 0 }] };
  }, close() {} };
  const failed = await cleanupExpiredGuests(brokenSelect, { force: true });
  assert.equal(failed.deletedCount, 0);
  assert.equal(failed.failed, true);
});
