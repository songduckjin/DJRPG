import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
import { accountEndpoint } from '../server/endpoints/account.mjs';
import { marketEndpoint } from '../server/endpoints/market.mjs';
import { warehouseEndpoint } from '../server/endpoints/warehouse.mjs';
import { APP_VERSION, OUTDATED_MESSAGE } from '../server/app-version.mjs';

const post = (path, body = {}, version) => new Request(`https://example.test/api/${path}`, {
  method: 'POST',
  headers: version ? { 'X-App-Version': version } : {},
  body: JSON.stringify(body)
});
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('a client from an older deployment is rejected with 426 before the database is touched', async () => {
  for (const [name, endpoint] of [['account', accountEndpoint], ['market', marketEndpoint], ['warehouse', warehouseEndpoint]]) {
    const stale = await endpoint(post(name, { action: 'load' }, 'old-client-000'), { env: {} });
    assert.equal(stale.status, 426, name);
    assert.equal(stale.headers.get('Cache-Control'), 'no-store', name);
    const body = await stale.json();
    assert.equal(body.code, 'VERSION_OUTDATED', name);
    assert.equal(body.error, OUTDATED_MESSAGE, name);
    assert.equal(body.expected, APP_VERSION, name);
  }
});

test('requests without a version header and requests from the deployed version still reach the endpoint', async () => {
  for (const version of [undefined, APP_VERSION]) {
    const body = await (await accountEndpoint(post('account', { action: 'load' }, version), { env: {} })).json();
    assert.equal(body.code, 'DB_NOT_CONFIGURED', String(version));
  }
  // 헤더가 없는 직접 호출은 기존 설정·인증 경로(테스트·스크립트 호환)를 그대로 지난다.
  assert.equal((await marketEndpoint(post('market', {}, undefined), { env: {} })).status, 503);
});

test('client requests carry the build version and a 426 stops saving instead of retrying', async () => {
  const { SaveSync } = await import('../src/game/sync.ts');
  const { freshSave } = await import('../src/game/store.ts');
  const { APP_VERSION: clientVersion } = await import('../src/game/appVersion.ts');
  const save = freshSave();
  const sync = new SaveSync(save, { accountId: 'test', token: 'test-token', revision: 0, save });
  const requests = [], pauses = [], messages = [];
  sync.onPause = value => pauses.push(value);
  sync.onMessage = message => messages.push(message);
  globalThis.fetch = async (_url, options) => { requests.push(options); return response({ code: 'VERSION_OUTDATED', error: OUTDATED_MESSAGE, expected: 'build-2' }, 426); };
  assert.equal(await sync.flush(), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers['X-App-Version'], clientVersion);
  assert.equal(sync.conflicted, true);
  assert.deepEqual(pauses, [true]);
  assert(messages.some(message => message.includes('새 버전이 배포되었습니다')));
  sync.save.gold = 50;
  assert.equal(await sync.flush(), false);
  assert.equal(requests.length, 1);
});

test('a server that cannot report its own version never stalls the client', async () => {
  const { SaveSync } = await import('../src/game/sync.ts');
  const { freshSave } = await import('../src/game/store.ts');
  const save = freshSave();
  const sync = new SaveSync(save, { accountId: 'test', token: 'test-token', revision: 0, save });
  const requests = [], messages = [];
  sync.onMessage = message => messages.push(message);
  globalThis.fetch = async (_url, options) => { requests.push(options); return response({ code: 'VERSION_OUTDATED', error: OUTDATED_MESSAGE, expected: 'dev' }, 426); };
  assert.equal(await sync.flush(), false);
  // 서버 버전이 'dev'면 차단 사고를 막기 위해 저장을 멈추지 않고 일반 오류로만 알린다.
  assert.equal(sync.conflicted, false);
  assert(messages.some(message => message.includes('새 버전이 배포되었습니다')));
});

test('a second item conflict right after a reload stops the loop with a refresh notice', async () => {
  const { SaveSync } = await import('../src/game/sync.ts');
  const { freshSave } = await import('../src/game/store.ts');
  const save = freshSave();
  const sync = new SaveSync(save, { accountId: 'test', token: 'test-token', revision: 0, save });
  const actions = [], pauses = [], messages = [];
  sync.onPause = value => pauses.push(value);
  sync.onMessage = message => messages.push(message);
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); actions.push(body.action);
    if (body.action === 'save') return response({ code: 'ITEM_CONFLICT', error: '아이템 소유 상태가 달라졌습니다.' }, 409);
    return response({ revision: 5, characterSlot: 1, save: { ...save, gold: 7 } });
  };
  assert.equal(await sync.flush(), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(actions, ['save', 'load']);
  assert.equal(sync.conflicted, false);
  assert.equal(sync.revision, 5);
  sync.save.gold = 8;
  assert.equal(await sync.flush(), false);
  await new Promise(resolve => setImmediate(resolve));
  // 두 번째 충돌은 보내되, 최신 세이브를 또 불러오지 않고 저장을 멈춘다.
  assert.deepEqual(actions, ['save', 'load', 'save']);
  assert.equal(sync.conflicted, true);
  assert.equal(pauses.at(-1), true);
  assert(messages.some(message => message.includes('데이터 동기화가 어긋났습니다')));
  assert.equal(await sync.flush(), false);
  assert.deepEqual(actions, ['save', 'load', 'save']);
});

test('a conflict later than the guard window still recovers once', async () => {
  const { SaveSync } = await import('../src/game/sync.ts');
  const { freshSave } = await import('../src/game/store.ts');
  const save = freshSave();
  const sync = new SaveSync(save, { accountId: 'test', token: 'test-token', revision: 0, save });
  const actions = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); actions.push(body.action);
    if (body.action === 'save') return response({ code: 'CHARACTER_CONFLICT', error: '다른 캐릭터가 선택되었습니다.' }, 409);
    return response({ revision: 3, characterSlot: 1, save: { ...save, gold: 1 } });
  };
  assert.equal(await sync.flush(), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(actions, ['save', 'load']);
  // 10초 넘게 지난 뒤의 충돌은 다시 한 번 최신 세이브를 불러온다.
  sync.conflictReloadAt = Date.now() - 11_000;
  assert.equal(await sync.flush(), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(actions, ['save', 'load', 'save', 'load']);
});
