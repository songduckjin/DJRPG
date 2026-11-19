import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { createClient as createWebClient } from '@libsql/client/web';
import { randomUUID, createHmac, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { onRequest as accountFunction } from '../functions/api/account.js';
import { onRequest as marketFunction } from '../functions/api/market.js';
import { onRequest as warehouseFunction } from '../functions/api/warehouse.js';
import { onRequest as eventsFunction } from '../functions/api/market-events.js';
import { accountEndpoint } from '../server/endpoints/account.mjs';
import { marketEndpoint } from '../server/endpoints/market.mjs';
import { warehouseEndpoint } from '../server/endpoints/warehouse.mjs';
import { verifyLegacyViaVercel } from '../server/legacy-auth.mjs';
import { configureDatabase } from '../server/database-config.mjs';
import { client } from '../server/database.mjs';
import { tokenFor, tokenPayload } from '../server/auth.mjs';

const post = (path, body, token) => new Request(`https://example.test/api/${path}`, {
  method: 'POST',
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  body: JSON.stringify(body)
});

test('DB 접속 토큰을 분리해도 기존 세션 서명 키가 유지된다', () => {
  const env = {
    TURSO_DATABASE_URL: 'libsql://new-db.example.test',
    TURSO_AUTH_TOKEN: 'old-session-signing-key',
    TURSO_DATABASE_AUTH_TOKEN: 'new-database-token'
  };
  let connection;
  try {
    configureDatabase(options => { connection = options; return { close() {} }; });
    client(env);
    assert.deepEqual(connection, { url: env.TURSO_DATABASE_URL, authToken: env.TURSO_DATABASE_AUTH_TOKEN });
    const token = tokenFor('guest_existing', env, 'copied-session-id');
    assert.deepEqual(tokenPayload(post('account', { action: 'load' }, token), env), { id: 'guest_existing', sid: 'copied-session-id' });
    assert.equal(tokenPayload(post('account', { action: 'load' }, token), { ...env, TURSO_AUTH_TOKEN: 'different-key' }), null);
    client({ TURSO_DATABASE_URL: env.TURSO_DATABASE_URL, TURSO_AUTH_TOKEN: env.TURSO_AUTH_TOKEN });
    assert.equal(connection.authToken, env.TURSO_AUTH_TOKEN, '새 변수가 없으면 기존 DB 접속 방식을 사용한다');
  } finally {
    configureDatabase(createWebClient);
  }
});

test('Pages Functions preserve method, configuration, token and cache responses', async () => {
  for (const [name, functionHandler] of [['account', accountFunction], ['market', marketFunction], ['warehouse', warehouseFunction]]) {
    const get = await functionHandler({ request: new Request(`https://example.test/api/${name}`), env: {} });
    assert.equal(get.status, 405);
    const missing = await functionHandler({ request: post(name, {}), env: {} });
    assert.equal(missing.status, 503);
    assert.equal((await missing.json()).code, 'DB_NOT_CONFIGURED');
    if (name !== 'account') {
      const unauthorized = await functionHandler({ request: post(name, {}), env: { TURSO_DATABASE_URL: 'libsql://example.test', TURSO_AUTH_TOKEN: 'test' } });
      assert.equal(unauthorized.status, 401);
      assert.equal((await unauthorized.json()).code, 'INVALID_TOKEN');
    }
    if (name === 'market') assert.equal(missing.headers.get('Cache-Control'), 'no-store');
  }
  assert.equal((await eventsFunction({ request: post('market-events', {}), env: {} })).status, 405);
  assert.equal((await eventsFunction({ request: new Request('https://example.test/api/market-events'), env: {} })).status, 503);
});

test('Fetch endpoints register, save, load and query shared data using the existing schema', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-pages-'));
  const env = { TURSO_DATABASE_URL: `file:${join(directory, 'pages.db')}`, TURSO_AUTH_TOKEN: 'local-pages-key' };
  const options = { env, createDbClient: ({ TURSO_DATABASE_URL }) => createClient({ url: TURSO_DATABASE_URL }) };
  try {
    const registration = await accountEndpoint(post('account', { action: 'register', loginId: 'tester119', password: 'test-password-119', gender: 'female' }), options);
    assert.equal(registration.status, 200);
    const registered = await registration.json();
    assert.equal(registered.characterSlot, 1);
    const db = createClient({ url: env.TURSO_DATABASE_URL });
    try {
      const fresh = (await db.execute({ sql: 'SELECT password_hash FROM djrpg_accounts WHERE id=?', args: ['tester119'] })).rows[0].password_hash;
      assert.match(fresh, /^scrypt\$2048\$8\$1\$[a-f\d]{32}\$[a-f\d]{128}$/);
    } finally { await db.close(); }
    const token = registered.token;
    const item = { id: randomUUID(), name: '기존 검', slot: 'weapon', rarity: 'rare', stats: { attack: 10 } };
    const save = { ...registered.save, gold: 17, bag: [item] };
    const savedResponse = await accountEndpoint(post('account', { action: 'save', revision: 0, characterSlot: 1, save }, token), options);
    assert.equal(savedResponse.status, 200);
    const saved = await savedResponse.json();
    assert.equal(saved.save.gold, 17);
    const load = await accountEndpoint(post('account', { action: 'load' }, token), options);
    assert.equal((await load.json()).save.gold, 17);
    const login = await accountEndpoint(post('account', { action: 'login', loginId: 'tester119', password: 'test-password-119' }), options);
    assert.equal(login.status, 200);
    const relogin = await login.json();
    assert.equal(relogin.save.gold, 17);
    // 새 로그인 토큰(마지막 세션)이 이후 요청의 기준이다. 이전 토큰은 단일 세션 규칙으로 무효가 된다.
    const sessionToken = relogin.token;
    const deposit = await warehouseEndpoint(post('warehouse', { action: 'deposit', itemId: item.id, requestId: randomUUID(), revision: saved.revision, characterSlot: 1 }, sessionToken), options);
    assert.equal(deposit.status, 200);
    assert.equal((await deposit.json()).save.bag.length, 0);
    const warehouse = await warehouseEndpoint(post('warehouse', { action: 'list' }, sessionToken), options);
    assert.deepEqual((await warehouse.json()).items.map(entry => entry.id), [item.id]);
    const market = await marketEndpoint(post('market', { action: 'list', view: 'mine' }, sessionToken), options);
    assert.equal(market.status, 200);
    assert.equal(market.headers.get('Cache-Control'), 'no-store');
    const stale = await accountEndpoint(post('account', { action: 'save', revision: 0, characterSlot: 1, save }, sessionToken), options);
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).code, 'SAVE_CONFLICT');
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

test('a newer login replaces the previous device session across account, market and warehouse', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-session-'));
  const env = { TURSO_DATABASE_URL: `file:${join(directory, 'session.db')}`, TURSO_AUTH_TOKEN: 'local-session-key' };
  const options = { env, createDbClient: ({ TURSO_DATABASE_URL }) => createClient({ url: TURSO_DATABASE_URL }) };
  // 세션 번호가 없는 구 토큰(세션 열 도입 전 발급본)
  const legacyToken = id => {
    const value = Buffer.from(JSON.stringify({ id, exp: Date.now() + 60_000 })).toString('base64url');
    return `${value}.${createHmac('sha256', env.TURSO_AUTH_TOKEN).update(value).digest('base64url')}`;
  };
  const credentials = { action: 'login', loginId: 'twodevice', password: 'two-device-password' };
  try {
    const first = await (await accountEndpoint(post('account', { action: 'register', loginId: 'twodevice', password: 'two-device-password', gender: 'male' }), options)).json();
    assert.equal((await accountEndpoint(post('account', { action: 'load' }, first.token), options)).status, 200);
    const second = await (await accountEndpoint(post('account', credentials), options)).json();
    assert.notEqual(second.token, first.token);
    for (const [label, response] of [
      ['account', await accountEndpoint(post('account', { action: 'load' }, first.token), options)],
      ['market', await marketEndpoint(post('market', { action: 'list', view: 'mine' }, first.token), options)],
      ['warehouse', await warehouseEndpoint(post('warehouse', { action: 'list' }, first.token), options)]
    ]) {
      assert.equal(response.status, 401, label);
      const body = await response.json();
      assert.equal(body.code, 'SESSION_REPLACED', label);
      assert.equal(body.error, '다른 기기에서 로그인되어 접속이 해제되었습니다.', label);
    }
    assert.equal((await accountEndpoint(post('account', { action: 'save', save: first.save, revision: 0, characterSlot: 1 }, first.token), options)).status, 401);
    assert.equal((await accountEndpoint(post('account', { action: 'load' }, second.token), options)).status, 200);
    assert.equal((await marketEndpoint(post('market', { action: 'list', view: 'mine' }, second.token), options)).status, 200);
    assert.equal((await warehouseEndpoint(post('warehouse', { action: 'list' }, second.token), options)).status, 200);
    const old = await accountEndpoint(post('account', { action: 'load' }, legacyToken('twodevice')), options);
    assert.equal(old.status, 401);
    assert.equal((await old.json()).code, 'SESSION_REPLACED');
    const guest = await (await accountEndpoint(post('account', { action: 'guest' }), options)).json();
    assert.equal((await accountEndpoint(post('account', { action: 'load' }, guest.token), options)).status, 200);
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});

test('legacy password upgrades only after a successful login without changing save or token', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-password-upgrade-'));
  const env = { TURSO_DATABASE_URL: `file:${join(directory, 'legacy.db')}`, TURSO_AUTH_TOKEN: 'local-legacy-key' };
  let registered, legacyCalls = 0;
  const options = {
    env,
    createDbClient: ({ TURSO_DATABASE_URL }) => createClient({ url: TURSO_DATABASE_URL }),
    legacyVerifier: (id, password, environment) => verifyLegacyViaVercel(id, password, environment, async (url, request) => {
      legacyCalls++;
      assert.equal(url, 'https://djrpg.vercel.app/api/account');
      assert.equal(request.redirect, 'error');
      assert.equal(JSON.parse(request.body).loginId, id);
      return password === 'legacy-password'
        ? Response.json({ accountId: id, token: registered.token })
        : Response.json({ code: 'INVALID_CREDENTIALS' }, { status: 401 });
    })
  };
  const withDb = async run => {
    const db = createClient({ url: env.TURSO_DATABASE_URL });
    try { return await run(db); }
    finally { await db.close(); }
  };
  try {
    registered = await (await accountEndpoint(post('account', { action: 'register', loginId: 'legacy119', password: 'legacy-password', gender: 'male' }), options)).json();
    const salt = '0123456789abcdef0123456789abcdef';
    const legacyHash = `${salt}:${(await promisify(scryptCallback)('legacy-password', salt, 64)).toString('hex')}`;
    await withDb(db => db.execute({ sql: 'UPDATE djrpg_accounts SET password_hash=? WHERE id=?', args: [legacyHash, 'legacy119'] }));
    const failed = await accountEndpoint(post('account', { action: 'login', loginId: 'legacy119', password: 'wrong-password' }), options);
    assert.equal(failed.status, 401);
    const storedHash = () => withDb(async db => (await db.execute({ sql: 'SELECT password_hash FROM djrpg_accounts WHERE id=?', args: ['legacy119'] })).rows[0].password_hash);
    assert.equal(await storedHash(), legacyHash);
    const login = await accountEndpoint(post('account', { action: 'login', loginId: 'legacy119', password: 'legacy-password' }), options);
    assert.equal(login.status, 200);
    const loginBody = await login.json();
    assert.deepEqual(loginBody.save, registered.save);
    const upgraded = await storedHash();
    assert.match(upgraded, /^scrypt\$2048\$8\$1\$[a-f\d]{32}\$[a-f\d]{128}$/);
    assert.equal((await accountEndpoint(post('account', { action: 'load' }, loginBody.token), options)).status, 200);
    assert.equal((await accountEndpoint(post('account', { action: 'login', loginId: 'legacy119', password: 'legacy-password' }), options)).status, 200);
    assert.equal(legacyCalls, 2);
    await assert.rejects(verifyLegacyViaVercel('legacy119', 'legacy-password', env, async () => Response.json({ accountId: 'legacy119', token: 'forged' })), error => error.code === 'DB_UNAVAILABLE');
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('an account table created before session tracking is migrated and old tokens keep working until the next login', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-session-migration-'));
  const env = { TURSO_DATABASE_URL: `file:${join(directory, 'legacy-session.db')}`, TURSO_AUTH_TOKEN: 'local-migration-key' };
  const options = { env, createDbClient: ({ TURSO_DATABASE_URL }) => createClient({ url: TURSO_DATABASE_URL }) };
  const db = createClient({ url: env.TURSO_DATABASE_URL });
  const legacyToken = id => {
    const value = Buffer.from(JSON.stringify({ id, exp: Date.now() + 60_000 })).toString('base64url');
    return `${value}.${createHmac('sha256', env.TURSO_AUTH_TOKEN).update(value).digest('base64url')}`;
  };
  const columns = async () => (await db.execute({ sql: "SELECT name FROM pragma_table_info('djrpg_accounts')" })).rows.map(row => row.name);
  try {
    // session_id 열이 없던 시점의 스키마 그대로 계정 한 건을 만든다.
    await db.execute({ sql: 'CREATE TABLE djrpg_accounts (id TEXT PRIMARY KEY COLLATE NOCASE, password_hash TEXT NOT NULL, save_json TEXT NOT NULL, updated_at TEXT NOT NULL)' });
    const salt = '0123456789abcdef0123456789abcdef';
    const passwordHash = `scrypt$2048$8$1$${salt}$${(await promisify(scryptCallback)('old-password', salt, 64, { N: 2048, r: 8, p: 1 })).toString('hex')}`;
    const oldSave = { version: 1, name: '옛전사', gender: 'male', gold: 5, floor: 2, level: 3, bag: [], equipment: {}, equipmentCollection: [], quickSlots: [null, null, null], skillLevels: {}, learned: [], passives: [] };
    await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: ['oldhero', passwordHash, JSON.stringify(oldSave), new Date().toISOString()] });
    assert(!(await columns()).includes('session_id'));
    const legacyLoad = await accountEndpoint(post('account', { action: 'load' }, legacyToken('oldhero')), options);
    assert.equal(legacyLoad.status, 200);
    assert.equal((await legacyLoad.json()).save.level, 3);
    assert((await columns()).includes('session_id'));
    const stored = (await db.execute({ sql: 'SELECT session_id FROM djrpg_accounts WHERE id=?', args: ['oldhero'] })).rows[0];
    assert.equal(stored.session_id, null);
    const loginResponse = await accountEndpoint(post('account', { action: 'login', loginId: 'oldhero', password: 'old-password' }), options);
    assert.equal(loginResponse.status, 200);
    const login = await loginResponse.json();
    const sessionAfterLogin = (await db.execute({ sql: 'SELECT session_id FROM djrpg_accounts WHERE id=?', args: ['oldhero'] })).rows[0].session_id;
    assert.equal(typeof sessionAfterLogin, 'string');
    assert.notEqual(sessionAfterLogin, '');
    assert.equal((await accountEndpoint(post('account', { action: 'load' }, login.token), options)).status, 200);
    const stale = await accountEndpoint(post('account', { action: 'load' }, legacyToken('oldhero')), options);
    assert.equal(stale.status, 401);
    assert.equal((await stale.json()).code, 'SESSION_REPLACED');
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
