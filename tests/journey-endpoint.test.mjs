import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { onRequest as journeyFunction } from '../functions/api/journey.js';
import { journeyEndpoint } from '../server/endpoints/journey.mjs';
import { marketEndpoint } from '../server/endpoints/market.mjs';
import { accountEndpoint } from '../server/endpoints/account.mjs';

const post = (path, body, token) => new Request(`https://example.test/api/${path}`, {
  method: 'POST',
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  body: JSON.stringify(body)
});

// 작업 260(설계서 PR-5): 여정은 자기 입구 `/api/journey`를 갖는다. 메서드·설정·인증 규칙은 다른 API와 같다.
test('여정 Pages Function은 메서드·설정·인증을 지키고 JSON으로 답한다', async () => {
  assert.equal((await journeyFunction({ request: new Request('https://example.test/api/journey'), env: {} })).status, 405);
  const missing = await journeyFunction({ request: post('journey', {}), env: {} });
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).code, 'DB_NOT_CONFIGURED');
  assert.equal(missing.headers.get('Cache-Control'), 'no-store');
  const unauthorized = await journeyFunction({ request: post('journey', {}), env: { TURSO_DATABASE_URL: 'libsql://example.test', TURSO_AUTH_TOKEN: 'test' } });
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).code, 'INVALID_TOKEN');
});

test('여정 엔드포인트가 목록·수령을 처리하고 같은 요청을 두 번 보상하지 않는다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-journey-endpoint-'));
  const env = { TURSO_DATABASE_URL: `file:${join(directory, 'journey.db')}`, TURSO_AUTH_TOKEN: 'local-journey-key' };
  const options = { env, createDbClient: ({ TURSO_DATABASE_URL }) => createClient({ url: TURSO_DATABASE_URL }) };
  try {
    const registration = await (await accountEndpoint(post('account', { action: 'register', loginId: 'journey260', password: 'journey-260-password', gender: 'male' }), options)).json();
    const created = await (await accountEndpoint(post('account', { action: 'createCharacter', slot: 1, name: '여정', gender: 'male', job: 'warrior', revision: registration.revision }, registration.token), options)).json();
    assert(Number.isSafeInteger(created.revision), '캐릭터 생성 응답에 revision이 있다');
    const token = registration.token;

    // 목록 조회 — 새 이름 `list`와 구번들의 `journey-list`가 같은 응답을 준다.
    const list = await journeyEndpoint(post('journey', { action: 'list' }, token), options);
    assert.equal(list.status, 200);
    assert.equal(list.headers.get('Cache-Control'), 'no-store');
    const view = await list.json();
    assert(Array.isArray(view.mail) && view.mail.length > 0, '우편함 목록');
    assert(Array.isArray(view.daily) && Array.isArray(view.weekly) && Array.isArray(view.achievements));
    const legacyList = await journeyEndpoint(post('journey', { action: 'journey-list' }, token), options);
    assert.equal(legacyList.status, 200);
    assert.deepEqual((await legacyList.json()).mail.map(entry => entry.id), view.mail.map(entry => entry.id));

    const requestId = randomUUID();
    const claimBody = { action: 'journey-claim', kind: 'mail', id: 'all', revision: created.revision, requestId, characterSlot: 1 };
    const claim = await journeyEndpoint(post('journey', claimBody, token), options);
    assert.equal(claim.status, 200);
    const claimed = await claim.json();
    assert.match(claimed.message, /개 보상을 수령했습니다/);
    assert(claimed.revision > created.revision, '수령이 세이브를 저장하고 revision을 올린다');

    // 같은 requestId 재전송 — 보상은 한 번만, 응답은 그대로(멱등).
    const replay = await journeyEndpoint(post('journey', claimBody, token), options);
    assert.equal(replay.status, 200);
    const repeated = await replay.json();
    assert.equal(repeated.save.gold, claimed.save.gold, '보상이 두 번 들어가지 않는다');
    assert.equal(repeated.save.bag.length, claimed.save.bag.length);
    assert.equal(repeated.message, claimed.message);

    // 멱등 응답은 여정 표에만 남는다.
    const db = createClient({ url: env.TURSO_DATABASE_URL });
    try {
      const own = (await db.execute({ sql: 'SELECT COUNT(*) AS n FROM djrpg_journey_requests WHERE account_id=? AND request_id=?', args: ['journey260', requestId] })).rows[0];
      assert.equal(Number(own.n), 1);
      const shared = (await db.execute({ sql: 'SELECT COUNT(*) AS n FROM djrpg_market_requests WHERE account_id=? AND request_id=?', args: ['journey260', requestId] })).rows[0];
      assert.equal(Number(shared.n), 0, '거래소 요청 표와 섞이지 않는다');
    } finally { await db.close(); }

    const unknown = await journeyEndpoint(post('journey', { action: 'market-list' }, token), options);
    assert.equal(unknown.status, 400);
    assert.equal((await unknown.json()).code, 'INVALID_ACTION');

    // 구번들 호환: `/api/market`으로 오는 여정 목록은 이 릴리스 동안 그대로 처리한다(폐지 예정).
    const legacy = await marketEndpoint(post('market', { action: 'journey-list' }, token), options);
    assert.equal(legacy.status, 200);
    assert(Array.isArray((await legacy.json()).mail));
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('다른 기기 로그인으로 세션이 바뀐 토큰은 여정 경로에서도 막힌다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-journey-session-'));
  const env = { TURSO_DATABASE_URL: `file:${join(directory, 'session.db')}`, TURSO_AUTH_TOKEN: 'local-journey-session' };
  const options = { env, createDbClient: ({ TURSO_DATABASE_URL }) => createClient({ url: TURSO_DATABASE_URL }) };
  try {
    const first = await (await accountEndpoint(post('account', { action: 'register', loginId: 'journeytwo', password: 'journey-two-password', gender: 'female' }), options)).json();
    const second = await (await accountEndpoint(post('account', { action: 'login', loginId: 'journeytwo', password: 'journey-two-password' }), options)).json();
    assert.notEqual(first.token, second.token);
    const stale = await journeyEndpoint(post('journey', { action: 'list' }, first.token), options);
    assert.equal(stale.status, 401);
    assert.equal((await stale.json()).code, 'SESSION_REPLACED');
    assert.equal((await journeyEndpoint(post('journey', { action: 'list' }, second.token), options)).status, 200);
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
