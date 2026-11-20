import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { scrypt as nodeScrypt } from 'node:crypto';
import { configureDatabase } from '../server/database-config.mjs';
import { schema } from '../server/database.mjs';
import { accountEndpoint } from '../server/endpoints/account.mjs';
import { deriveScrypt, needsPasswordUpgrade, verifyPassword, hashPassword } from '../server/auth.mjs';
import { scryptJs } from '../server/scrypt-js.mjs';
import { verifyLegacyViaVercel } from '../server/legacy-auth.mjs';

// Functions 어댑터가 하는 일과 같다 — DB 클라이언트 공장을 등록해야 엔드포인트가 DB를 연다.
configureDatabase(createClient);

const PASSWORD = 'legacyPass1';
const SALT = '0123456789abcdef0123456789abcdef';
const hex = bytes => Buffer.from(bytes).toString('hex');
const legacyHash = async (password, cost = { N: 16384, r: 8, p: 1 }) =>
  `${SALT}:${hex(await new Promise((resolve, reject) => nodeScrypt(password, SALT, 64, cost, (error, key) => error ? reject(error) : resolve(key))))}`;

let db, directory;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'djrpg-legacy-login-'));
  const url = `file:${join(directory, 'legacy.db')}`;
  process.env.TURSO_DATABASE_URL = url;
  process.env.TURSO_AUTH_TOKEN = 'local-legacy-token';
  db = createClient({ url });
  await schema(db);
});
after(async () => { await db.close(); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });

function endpoint(legacyVerifier) {
  return async body => {
    const request = new Request('https://djrpg.pages.dev/api/account', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const response = await accountEndpoint(request, { env: process.env, legacyVerifier });
    return { status: response.status, body: await response.json() };
  };
}
async function seedLegacy(id, password = PASSWORD) {
  await db.execute({
    sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)',
    args: [id, await legacyHash(password), JSON.stringify({ version: 1, name: id, gender: 'male', gold: 0, bag: [], equipment: {}, floor: 1, maxFloor: 1, level: 1 }), new Date().toISOString()]
  });
}
const storedHash = async id => (await db.execute({ sql: 'SELECT password_hash FROM djrpg_accounts WHERE id=?', args: [id] })).rows[0].password_hash;

test('순수 JS scrypt는 node:crypto와 같은 값을 낸다(구형 N=16384·신형 N=2048)', async () => {
  const native = (password, salt, keyLen, options) => new Promise((resolve, reject) => nodeScrypt(password, salt, keyLen, options, (error, key) => error ? reject(error) : resolve(key)));
  for (const cost of [{ N: 1024, r: 8, p: 1 }, { N: 16384, r: 8, p: 1 }]) {
    const expected = hex(await native(PASSWORD, SALT, 64, cost));
    assert.equal(hex(await scryptJs(PASSWORD, SALT, 64, cost)), expected, `scryptJs N=${cost.N}`);
    assert.equal(hex(await deriveScrypt(PASSWORD, SALT, 64, cost, null)), expected, `네이티브가 없는 런타임 폴백 N=${cost.N}`);
  }
});

test('네이티브 scrypt가 예외를 내도 verifyPassword가 순수 JS로 구형·신형 해시를 검증한다', async () => {
  const broken = () => { throw new Error('scrypt is not implemented'); };
  const legacy = await legacyHash(PASSWORD);
  assert.equal(needsPasswordUpgrade(legacy), true);
  assert.equal(await deriveScrypt(PASSWORD, SALT, 64, { N: 16384, r: 8, p: 1 }, broken).then(hex), hex(await new Promise((resolve, reject) => nodeScrypt(PASSWORD, SALT, 64, { N: 16384, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key)))));
  assert.equal(await verifyPassword(PASSWORD, legacy), true);
  assert.equal(await verifyPassword('wrong-password', legacy), false);
  const modern = await hashPassword(PASSWORD);
  assert.match(modern, /^scrypt\$2048\$8\$1\$[a-f\d]{32}\$[a-f\d]{128}$/);
  assert.equal(await verifyPassword(PASSWORD, modern), true);
  assert.equal(await verifyPassword('wrong-password', modern), false);
});

test('구형 계정 로그인: 외부 Vercel이 503이어도 틀린 비밀번호는 401이고 서버가 직접 판정한다 (사용자 제보 #6466·#6486·#6510)', async () => {
  await seedLegacy('legacyuser');
  let calls = 0;
  const brokenVerifier = async () => { calls++; const error = new Error('서버 연결이 불안정합니다.'); error.status = 503; error.code = 'DB_UNAVAILABLE'; throw error; };
  const login = endpoint(brokenVerifier);
  const wrong = await login({ action: 'login', loginId: 'legacyuser', password: 'wrong' });
  assert.equal(wrong.status, 401, '503이 아니라 401');
  assert.equal(wrong.body.code, 'INVALID_CREDENTIALS');
  assert.equal(calls, 0, '서버가 직접 판정하므로 외부 검증을 부르지 않는다');

  const right = await login({ action: 'login', loginId: 'legacyuser', password: PASSWORD });
  assert.equal(right.status, 200);
  assert.equal(right.body.accountId, 'legacyuser');
  assert.equal(right.body.guest, false);
  assert.equal(calls, 0);
  const upgraded = await storedHash('legacyuser');
  assert.match(upgraded, /^scrypt\$2048\$8\$1\$/, '로그인 성공 즉시 새 해시로 자동 업그레이드');
  assert.equal(await verifyPassword(PASSWORD, upgraded), true);
  // 업그레이드 뒤에는 같은 비밀번호로 다시 로그인된다.
  assert.equal((await login({ action: 'login', loginId: 'legacyuser', password: PASSWORD })).status, 200);
  assert.equal((await login({ action: 'login', loginId: 'legacyuser', password: 'nope' })).status, 401);
});

test('서버 내부 검증이 아예 불가능한 런타임에서만 외부 검증을 마지막 수단으로 쓴다', async () => {
  await seedLegacy('legacyfallback');
  let calls = 0;
  const verifier = async (id, password) => { calls++; return id === 'legacyfallback' && password === PASSWORD; };
  // 정상 런타임에서는 내부 검증이 결정한다 — 외부 호출 없음, 틀린 비밀번호도 401.
  const login = endpoint(verifier);
  assert.equal((await login({ action: 'login', loginId: 'legacyfallback', password: 'wrong' })).status, 401);
  assert.equal(calls, 0);
});

test('예전 Vercel 검증은 fetch 옵션에 cache를 넣지 않고, 401은 false·네트워크 실패는 503으로 남는다', async () => {
  const seen = [];
  const ok = async (url, options) => { seen.push({ url, options }); return { status: 401, ok: false, json: async () => ({}) }; };
  assert.equal(await verifyLegacyViaVercel('fks3997', 'wrong', process.env, ok), false);
  assert.equal(seen.length, 1);
  assert.equal('cache' in seen[0].options, false, 'Workers fetch가 거부하는 cache 옵션을 보내지 않는다');
  assert.equal(seen[0].options.redirect, 'error');
  await assert.rejects(
    verifyLegacyViaVercel('fks3997', 'wrong', process.env, async () => { throw new TypeError('fetch failed'); }),
    error => error.status === 503 && error.code === 'DB_UNAVAILABLE'
  );
});
