import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { randomUUID, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { onRequest as accountFunction } from '../functions/api/account.js';
import { onRequest as marketFunction } from '../functions/api/market.js';
import { onRequest as warehouseFunction } from '../functions/api/warehouse.js';
import { onRequest as eventsFunction } from '../functions/api/market-events.js';
import { accountEndpoint } from '../server/endpoints/account.mjs';
import { marketEndpoint } from '../server/endpoints/market.mjs';
import { warehouseEndpoint } from '../server/endpoints/warehouse.mjs';
import { verifyLegacyViaVercel } from '../server/legacy-auth.mjs';

const post = (path, body, token) => new Request(`https://example.test/api/${path}`, {
  method: 'POST',
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  body: JSON.stringify(body)
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
    assert.equal((await login.json()).save.gold, 17);
    const deposit = await warehouseEndpoint(post('warehouse', { action: 'deposit', itemId: item.id, requestId: randomUUID(), revision: saved.revision, characterSlot: 1 }, token), options);
    assert.equal(deposit.status, 200);
    assert.equal((await deposit.json()).save.bag.length, 0);
    const warehouse = await warehouseEndpoint(post('warehouse', { action: 'list' }, token), options);
    assert.deepEqual((await warehouse.json()).items.map(entry => entry.id), [item.id]);
    const market = await marketEndpoint(post('market', { action: 'list', view: 'mine' }, token), options);
    assert.equal(market.status, 200);
    assert.equal(market.headers.get('Cache-Control'), 'no-store');
    const stale = await accountEndpoint(post('account', { action: 'save', revision: 0, characterSlot: 1, save }, token), options);
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).code, 'SAVE_CONFLICT');
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
    assert.deepEqual((await login.json()).save, registered.save);
    const upgraded = await storedHash();
    assert.match(upgraded, /^scrypt\$2048\$8\$1\$[a-f\d]{32}\$[a-f\d]{128}$/);
    assert.equal((await accountEndpoint(post('account', { action: 'load' }, registered.token), options)).status, 200);
    assert.equal((await accountEndpoint(post('account', { action: 'login', loginId: 'legacy119', password: 'legacy-password' }), options)).status, 200);
    assert.equal(legacyCalls, 2);
    await assert.rejects(verifyLegacyViaVercel('legacy119', 'legacy-password', env, async () => Response.json({ accountId: 'legacy119', token: 'forged' })), error => error.code === 'DB_UNAVAILABLE');
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
