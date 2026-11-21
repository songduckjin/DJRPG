import assert from 'node:assert/strict';
import test from 'node:test';
import { adminEndpoint } from '../server/endpoints/admin.mjs';

const env = { ADMIN_DASHBOARD_PASSWORD: 'example-secret', TURSO_DATABASE_URL: 'file:test', TURSO_AUTH_TOKEN: 'test' };
const authorized = path => new Request(`https://example.test/api/admin${path}`, { headers: { Authorization: `Basic ${Buffer.from('djsong:example-secret').toString('base64')}` } });

test('admin rejects missing configuration and unauthenticated requests without opening DB', async () => {
  let opened = false;
  const createDbClient = () => { opened = true; throw new Error('should not open'); };
  const unconfigured = await adminEndpoint(authorized(''), { env: { ...env, ADMIN_DASHBOARD_PASSWORD: '' }, createDbClient });
  assert.equal(unconfigured.status, 503);
  assert.equal((await unconfigured.json()).code, 'ADMIN_NOT_CONFIGURED');
  const unauthorized = await adminEndpoint(new Request('https://example.test/api/admin'), { env, createDbClient });
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).code, 'ADMIN_UNAUTHORIZED');
  assert.equal(opened, false);
});

test('admin status exposes health and aggregate counts only', async () => {
  const executed = [];
  const db = { execute: async query => {
    executed.push(query);
    if (query === 'SELECT 1') return { rows: [{ 1: 1 }] };
    if (typeof query === 'string' && query.includes('djrpg_characters')) return { rows: [{ count: 8 }] };
    return { rows: [{ count: 5 }] };
  }, close() {} };
  const response = await adminEndpoint(authorized('?view=status'), { env, createDbClient: () => db });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(body.database, 'ok');
  assert.equal(body.accounts, 5);
  assert.equal(body.characters, 8);
  assert.equal(body.active24h, 5);
  assert.equal(executed.length, 4);
  assert.equal(JSON.stringify(body).includes(env.ADMIN_DASHBOARD_PASSWORD), false);
});

test('admin can inspect status when the database is unavailable', async () => {
  const response = await adminEndpoint(authorized('?view=status'), { env, createDbClient: () => { throw new Error('connection failed'); } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.database, 'error');
  assert.equal(body.accounts, null);
  assert.equal(JSON.stringify(body).includes('connection failed'), false);
});

test('admin account search is parameterized and returns a limited public projection', async () => {
  const executed = [];
  const db = { execute: async query => {
    executed.push(query);
    return executed.length === 1 ? { rows: [{ count: 1 }] } : { rows: [{ id: 'player', guest: 0, updated_at: '2026-11-20T00:00:00Z', characters: 2, max_floor: 17, password_hash: 'must-not-leak', save_json: '{}' }] };
  }, close() {} };
  const response = await adminEndpoint(authorized('?view=accounts&q=%25%27%20OR%201%3D1&page=999999'), { env, createDbClient: () => db });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.page, 1000);
  assert.equal(executed[0].args[0], "%' OR 1=1");
  assert.equal(executed[1].args[1], 25);
  assert.equal(executed[1].args[2], 24975);
  assert.deepEqual(Object.keys(body.accounts[0]), ['id', 'guest', 'updatedAt', 'characters', 'maxFloor']);
  assert.equal(JSON.stringify(body).includes('must-not-leak'), false);
});
