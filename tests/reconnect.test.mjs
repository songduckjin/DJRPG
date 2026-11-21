import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
// ts-loader의 훅이 등록된 뒤에 .ts 모듈을 가져온다.
const {
  NETWORK_OFFLINE, RECONNECT_MESSAGE, RECONNECT_RECOVERED_MESSAGE, RECONNECT_SLOW_AFTER_MS, RECONNECT_SLOW_MESSAGE,
  isNetworkOffline, offlineError, reconnectStage, retryNetwork
} = await import('../src/ui/reconnect.ts');
const { accountRequest } = await import('../src/ui/login.ts');
const { SaveSync } = await import('../src/game/sync.ts');
const { freshSave } = await import('../src/game/store.ts');
const { ReconnectNotice } = await import('../src/ui/reconnect.ts');

/** DOM 없이 안내 부품만 확인하기 위한 최소 가짜 문서 — classList·textContent·hidden만 쓴다. */
function fakeDocument() {
  const classes = element => {
    const set = new Set();
    return {
      add: (...names) => names.forEach(name => set.add(name)),
      remove: (...names) => names.forEach(name => set.delete(name)),
      contains: name => set.has(name),
      get value() { return [...set].join(' '); }
    };
  };
  const make = tag => {
    const element = { tagName: tag, className: '', textContent: '', hidden: false, children: [], attrs: {}, onclick: null };
    element.classList = classes(element);
    element.setAttribute = (name, value) => { element.attrs[name] = String(value); };
    element.append = (...nodes) => element.children.push(...nodes);
    return element;
  };
  const body = make('body');
  body.appendChild = node => { body.children.push(node); return node; };
  return { doc: { createElement: make, body }, body };
}
const tick = ms => new Promise(resolve => setTimeout(resolve, ms));

const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('재접속 안내 문구는 사용자가 요청한 "게임에 접속 중입니다…"이고, 장시간 끊김에만 상태 확인 안내로 바뀐다', () => {
  assert.equal(RECONNECT_MESSAGE, '게임에 접속 중입니다…');
  assert.match(RECONNECT_SLOW_MESSAGE, /네트워크 상태를 확인한 뒤 다시 시도/);
  assert.match(RECONNECT_RECOVERED_MESSAGE, /다시 연결되었습니다/);
  // 20초 경계: 그 전에는 재연결 안내(버튼 없음), 그 뒤에만 상태 확인 안내 + 다시 시도.
  assert.deepEqual(reconnectStage(0), { kind: 'connecting', message: RECONNECT_MESSAGE, retry: false });
  assert.deepEqual(reconnectStage(RECONNECT_SLOW_AFTER_MS - 1), { kind: 'connecting', message: RECONNECT_MESSAGE, retry: false });
  assert.deepEqual(reconnectStage(RECONNECT_SLOW_AFTER_MS), { kind: 'slow', message: RECONNECT_SLOW_MESSAGE, retry: true });
  assert.deepEqual(reconnectStage(5 * 60_000), { kind: 'slow', message: RECONNECT_SLOW_MESSAGE, retry: true });
});

test('끊김 판정은 브라우저의 네트워크 오류만 잡고, HTTP·JSON 오류는 재시도 대상으로 보지 않는다', () => {
  assert.equal(isNetworkOffline(offlineError()), true);
  assert.equal(offlineError().code, NETWORK_OFFLINE);
  assert.equal(offlineError().notice, true, '로그인 화면이 빨간 고장 문구 대신 안내 톤으로 보여 준다');
  assert.equal(offlineError().message, RECONNECT_MESSAGE);
  // iOS Safari·Chrome이 던지는 문구들.
  assert.equal(isNetworkOffline(new TypeError('Failed to fetch')), true);
  assert.equal(isNetworkOffline(new TypeError('Load failed')), true);
  assert.equal(isNetworkOffline(new TypeError('NetworkError when attempting to fetch resource.')), true);
  assert.equal(isNetworkOffline(new Error('The network connection was lost.')), true);
  assert.equal(isNetworkOffline(new Error('The Internet connection appears to be offline.')), true);
  // 서버가 답한 오류·본문 파싱 실패는 여기 해당하지 않는다.
  assert.equal(isNetworkOffline(Object.assign(new Error('가방이 40칸까지입니다.'), { status: 400, code: 'INVALID_SAVE' })), false);
  assert.equal(isNetworkOffline(new SyntaxError('Unexpected token < in JSON at position 0')), false);
  assert.equal(isNetworkOffline(undefined), false);
  assert.equal(isNetworkOffline('Failed to fetch'), false);
});

test('API 요청이 끊기면 "서버에 연결할 수 없습니다"가 아니라 재연결 안내 문구로 끝난다', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  try {
    await assert.rejects(accountRequest('load', {}), error => {
      assert.equal(error.code, NETWORK_OFFLINE);
      assert.equal(error.notice, true);
      assert.equal(error.message, RECONNECT_MESSAGE);
      assert.doesNotMatch(error.message, /서버에 연결할 수 없습니다/);
      return true;
    });
  } finally { globalThis.fetch = realFetch; }
});

test('끊긴 동안 같은 요청을 스스로 다시 보내고, 붙으면 그대로 이어 간다', async () => {
  const waits = [], stages = [];
  let calls = 0;
  const result = await retryNetwork(() => { calls += 1; if (calls < 3) throw offlineError(); return Promise.resolve('붙었다'); }, {
    attempts: 5, delayMs: 7, wait: async ms => { waits.push(ms); }, now: () => 0,
    onWait: (_attempt, elapsedMs) => stages.push(reconnectStage(elapsedMs).kind)
  });
  assert.equal(result, '붙었다');
  assert.equal(calls, 3);
  assert.deepEqual(waits, [7, 7]);
  assert.deepEqual(stages, ['connecting', 'connecting']);
});

test('끊김이 이어지면 횟수를 다 쓰고 상태 확인 안내(느린 문구)로 끝난다 — 화면이 그때 다시 시도 버튼을 보여 준다', async () => {
  let calls = 0, clock = 0;
  await assert.rejects(
    retryNetwork(() => { calls += 1; throw offlineError(); }, { attempts: 4, delayMs: 5, wait: async () => { clock += 6_000; }, now: () => clock }),
    error => { assert.equal(error.code, NETWORK_OFFLINE); assert.equal(error.message, RECONNECT_SLOW_MESSAGE); return true; }
  );
  assert.equal(calls, 4, '시도 횟수만큼만 보낸다');
});

test('서버가 답한 오류는 다시 보내지 않고 그대로 올려 보낸다(재시도로 풀리지 않는다)', async () => {
  let calls = 0;
  await assert.rejects(
    retryNetwork(() => { calls += 1; return Promise.reject(Object.assign(new Error('아이디 또는 비밀번호가 올바르지 않습니다.'), { status: 401, code: 'INVALID_CREDENTIALS' })); }, { attempts: 4, delayMs: 0, wait: async () => {} }),
    /아이디 또는 비밀번호/
  );
  assert.equal(calls, 1);
});

test('게임 저장이 끊기면 빨간 오류 토스트 대신 재접속 안내를 띄우고, 다시 저장되면 저절로 내린다', async () => {
  const save = freshSave();
  const sync = new SaveSync(save, { accountId: 'test', token: 'test-token', revision: 0, save });
  const messages = [], network = [], statuses = [];
  sync.onMessage = message => messages.push(message);
  sync.onNetwork = state => network.push(state);
  sync.onStatus = status => statuses.push(status);

  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('Load failed'); };
  try {
    assert.equal(await sync.flush(), false, '끊긴 저장은 실패로 돌아온다');
    assert.deepEqual(network, ['connecting'], '재접속 안내를 띄운다');
    assert.deepEqual(messages, [], '"서버에 연결할 수 없습니다"를 빨갛게 띄우지 않는다');
    assert.equal(statuses.at(-1), '연결 중', '저장 실패가 아니라 연결 중으로 표시한다');

    // 창을 다시 올려 네트워크가 돌아온 뒤 — 같은 저장이 성공하면 안내가 내려간다.
    globalThis.fetch = async (_url, options) => {
      const payload = JSON.parse(options.body);
      return response({ ok: true, revision: payload.revision + 1 });
    };
    assert.equal(await sync.flush(), true);
    assert.deepEqual(network, ['connecting', 'recovered']);
    assert.equal(statuses.at(-1), '저장됨');
    assert.deepEqual(messages, [], '성공 뒤에도 오류 문구를 남기지 않는다');
  } finally { globalThis.fetch = realFetch; }
});

test('거래 요청이 끊겨도 재접속 안내로 넘어가고, 서버가 답한 거래 오류는 그대로 알린다', async () => {
  const save = freshSave();
  const sync = new SaveSync(save, { accountId: 'test', token: 'test-token', revision: 0, save });
  const network = [];
  sync.onNetwork = state => network.push(state);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  try {
    await assert.rejects(sync.mutate('journey-claim', { kind: 'mail', id: 'all' }, 'offline-trade'), /거래 결과 다시 확인/);
    assert.equal(network[0], 'connecting');
  } finally { globalThis.fetch = realFetch; }
});

test('화면 부품: 끊기면 "게임에 접속 중입니다…"를 띄우고, 20초 뒤에만 다시 시도 버튼이 나오며, 붙으면 저절로 사라진다', async () => {
  const { doc, body } = fakeDocument();
  const retries = [];
  const notice = new ReconnectNotice({ doc, onRetry: () => retries.push(Date.now()), slowAfterMs: 15, retryMs: 60_000, slowRetryMs: 60_000, recoveredMs: 10 });
  notice.show();
  notice.show(); // 재시도가 또 실패해도 안내는 하나만 뜨고, 20초 시계는 새로 걸리지 않는다
  assert.equal(body.children.length, 1, '안내는 하나만 만든다');
  const element = body.children[0];
  const text = element.children.find(child => child.className === 'reconnect-text');
  const button = element.children.find(child => child.className === 'reconnect-retry');
  assert.ok(element.classList.contains('visible'), '안내가 보인다');
  assert.equal(element.attrs.role, 'status');
  assert.equal(element.attrs['aria-live'], 'polite');
  assert.equal(text.textContent, RECONNECT_MESSAGE);
  assert.equal(button.hidden, true, '잠깐의 끊김에는 누를 것을 만들지 않는다');

  await tick(40); // slowAfterMs(15ms)가 지난 뒤
  assert.ok(element.classList.contains('slow'));
  assert.equal(text.textContent, RECONNECT_SLOW_MESSAGE);
  assert.equal(button.hidden, false, '진짜 장시간 오프라인일 때만 다시 시도 안내로 바뀐다');
  button.onclick();
  assert.equal(retries.length, 1, '다시 시도 버튼은 저장을 다시 보낸다');

  notice.recovered();
  assert.equal(text.textContent, RECONNECT_RECOVERED_MESSAGE);
  await tick(30);
  assert.equal(element.classList.contains('visible'), false, '복구되면 안내가 저절로 사라진다');
  assert.equal(element.classList.contains('recovered'), false);
  assert.equal(notice.visible, false);
});
