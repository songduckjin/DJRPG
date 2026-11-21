import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { SaveSync } = await import('../src/game/sync.ts');
const { Journey } = await import('../src/game/journey.ts');
const { modalBlocked } = await import('../src/ui/interface.ts');
const { freshSave } = await import('../src/game/store.ts');

const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
function setup() {
  const save = freshSave();
  const session = { accountId: 'ACC1', loginId: 'hero', guest: false, token: 'token', characterSlot: 1, revision: 5, save, gender: 'male', job: 'warrior' };
  const sync = new SaveSync(save, session);
  const pauses = [];
  sync.onPause = value => pauses.push(value);
  const world = { save, player: { hp: 100 }, onChange() {} };
  return { save, session, sync, world, pauses };
}

// 설계서 C-3·S-5(작업 260): 여정은 거래소 경로(`sync.mutate`·`pendingMarket`)를 쓰지 않고, 두 도메인의
// 대기 상태가 서로의 버튼을 잠그지 않는다.
test('거래소 대기(pendingMarket)가 남아 있어도 우편 수령은 /api/journey로 그대로 된다', async () => {
  const original = globalThis.fetch, requests = [];
  try {
    const { save, sync, world, pauses } = setup();
    sync.pendingMarket = { action: 'buy', data: { listingId: 'L' }, requestId: 'market-1', revision: 5, progress: structuredClone(save) };
    globalThis.fetch = async (url, options) => {
      requests.push({ url, payload: JSON.parse(options.body) });
      return response({ ok: true, message: '3개 보상을 수령했습니다.', revision: 6, save: { ...structuredClone(save), gold: 300 } });
    };
    const journey = new Journey(sync, world); journey.load = () => {};
    await journey.act('journey-claim', { kind: 'daily', id: 'login' });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/journey');
    assert.equal(requests[0].payload.action, 'journey-claim');
    assert.equal(requests[0].payload.revision, 5);
    assert.equal(requests[0].payload.characterSlot, 1);
    assert(sync.save.gold === 300 && sync.revision === 6, '응답의 세이브·revision을 화면 기준으로 받는다');
    assert(sync.pendingMarket && sync.pendingMarket.requestId === 'market-1', '거래소 대기는 건드리지 않는다');
    assert.equal(sync.pendingJourney, undefined, '성공하면 여정 대기는 풀린다');
    assert.deepEqual(pauses, [true], '요청 동안 사냥을 멈춘다(거래소 대기가 남아 있으면 그 대기의 규칙대로 멈춘 채 둔다)');
  } finally { globalThis.fetch = original; }
});

test('여정 대기(pendingJourney)는 거래소·창고를 잠그지 않고, 목록 조회도 막히지 않는다', async () => {
  const original = globalThis.fetch;
  try {
    const { save, sync } = setup();
    sync.pendingJourney = { action: 'journey-claim', data: { kind: 'mail', id: 'all' }, requestId: 'journey-1', revision: 5, progress: structuredClone(save) };
    assert.equal(sync.trading, true, '결과 미확인 여정 요청은 캐릭터 전환을 막는다(옛 캐릭터 revision이 새 캐릭터로 가면 409)');
    const requests = [];
    globalThis.fetch = async (url, options) => { requests.push({ url, payload: options ? JSON.parse(options.body) : undefined }); return response({ mail: [], daily: [], weekly: [], achievements: [], periods: {}, now: 1 }); };
    const journey = new Journey(sync, { save, player: { hp: 100 }, onChange() {} });
    sync.locked = true;
    await journey.load();
    sync.locked = false;
    assert.equal(requests.length, 1, '거래소 요청이 떠 있어도 목록은 불러온다');
    assert.equal(requests[0].url, '/api/journey');
    assert(journey.data, '목록을 받았다');
    assert.equal(journey.error, '');
    // 거래소·창고 요청을 시작할 수 있는 상태인지: 결과 미확인 여정 대기는 막지 않는다(보내는 중만 막는다).
    globalThis.fetch = async () => response({ ok: true, revision: 6, save, effect: { deliveries: [] } });
    await sync.mutate('list', {}, 'market-after-journey-1');
    assert.equal(sync.pendingMarket, undefined);
  } finally { globalThis.fetch = original; }
});

test('여정 응답을 반영하면 대기·dirty가 풀리고 revision이 서버 기준이 된다', async () => {
  const { save, sync } = setup();
  sync.pendingJourney = { action: 'journey-claim', data: {}, requestId: 'j-1', revision: 5, progress: structuredClone(save) };
  sync.markDirty();
  sync.applyJourneyResult({ save: { ...structuredClone(save), gold: 1234 }, revision: 9 });
  assert.equal(sync.pendingJourney, undefined);
  assert.equal(sync.save.gold, 1234);
  assert.equal(sync.revision, 9);
  assert.equal(sync.trading, false);
  sync.pendingJourney = { action: 'journey-claim', data: {}, requestId: 'j-2', revision: 9, progress: structuredClone(save) };
  sync.resetForCharacterSwitch();
  assert.equal(sync.pendingJourney, undefined, '캐릭터를 바꾸면 옛 캐릭터의 여정 대기를 버린다');
});

test('DB 연결 거절(503)은 여정 대기를 남기지 않고, 결과를 모르는 실패만 같은 requestId로 재확인한다', async () => {
  const original = globalThis.fetch;
  try {
    const { save, sync, world } = setup();
    const journey = new Journey(sync, world); journey.load = () => {};
    let requests = 0;
    globalThis.fetch = async () => { requests++; return response({ code: 'DB_UNAVAILABLE', error: '서버 연결이 불안정합니다. 잠시 후 다시 시도하세요.' }, 503); };
    await journey.act('journey-claim', { kind: 'mail', id: 'all' });
    assert.equal(requests, 1, 'DB 연결 거절은 재시도 3회 없이 바로 알린다');
    assert.equal(sync.pendingJourney, undefined, '버튼을 잠그는 대기를 남기지 않는다');
    assert.match(journey.error, /서버 연결이 불안정합니다/);

    // 코드 없는 5xx·응답 유실은 결과를 모른다 — 같은 본문·requestId로 다시 확인한다.
    const sent = [];
    globalThis.fetch = async (_url, options) => { sent.push(JSON.parse(options.body)); return response({ error: '서버 응답을 확인 중입니다.' }, 500); };
    await journey.act('journey-claim', { kind: 'mail', id: 'all' });
    assert.equal(sent.length, 1);
    assert(sync.pendingJourney, '결과 미확인 대기를 남긴다');
    const pinned = sync.pendingJourney.requestId;
    globalThis.fetch = async (_url, options) => {
      const payload = JSON.parse(options.body); sent.push(payload);
      return response({ ok: true, message: '수령 완료', revision: 7, save });
    };
    await journey.retry();
    assert.equal(sent.at(-1).requestId, pinned, '재확인은 같은 requestId로 나간다');
    assert.equal(sync.pendingJourney, undefined);
    assert.equal(sync.revision, 7);
  } finally { globalThis.fetch = original; }
});

test('실제 fetch 실패는 같은 요청을 다시 보내고, 끝내 모르면 재확인 안내를 남긴다', async () => {
  const original = globalThis.fetch;
  try {
    const { save, sync, world } = setup();
    const journey = new Journey(sync, world); journey.load = () => {};
    const sent = [];
    globalThis.fetch = async (_url, options) => { sent.push(JSON.parse(options.body).requestId); throw new Error('network down'); };
    await journey.act('journey-claim', { kind: 'daily', id: 'login' });
    assert.equal(sent.length, 3, '응답을 못 받으면 같은 본문으로 세 번까지 다시 보낸다');
    assert.equal(new Set(sent).size, 1, '모두 같은 requestId다');
    assert(sync.pendingJourney, '결과 미확인 대기를 남긴다');
    assert.match(journey.error, /수령 결과 다시 확인/);
    assert.equal(sync.save.gold, save.gold, '보상을 받았다고 화면에 반영하지 않는다');
  } finally { globalThis.fetch = original; }
});

test('모달 열기 잠금은 거래소와 여정이 서로를 막지 않는다(설계서 C-3)', () => {
  const { sync } = setup();
  const market = { busy: false, sync };
  for (const kind of [null, 'mail', 'rewards', 'achievements', 'equipment', 'market']) assert.equal(modalBlocked(market, kind), false, `${kind} 기본 열림`);
  // 거래소 대기는 거래소 창만 열고, 우편·보상 창은 그대로 연다.
  sync.pendingMarket = { action: 'buy', data: {}, requestId: 'm', revision: 5, progress: freshSave() };
  assert.equal(modalBlocked(market, 'mail'), true);
  assert.equal(modalBlocked(market, 'market'), false, '거래 결과를 풀 수 있는 거래소 창은 연다');
  sync.pendingMarket = undefined;
  // 여정 대기는 어느 창도 막지 않는다.
  sync.pendingJourney = { action: 'journey-claim', data: {}, requestId: 'j', revision: 5, progress: freshSave() };
  for (const kind of [null, 'mail', 'rewards', 'market', 'equipment']) assert.equal(modalBlocked(market, kind), false, `${kind} 여정 대기와 무관`);
  sync.pendingJourney = undefined;
  // 보내는 중인 요청은 그 응답의 세이브·revision이 화면과 엇갈리므로 창을 열지 않는다.
  sync.locked = true;
  assert.equal(modalBlocked(market, 'mail'), true);
  sync.locked = false;
  assert.equal(modalBlocked({ busy: true, sync }, 'mail'), true);
});

test('거래소 응답을 잃은 뒤에도 예약 저장이 막히지 않는 것은 아니지만, 여정 요청은 저장 대기를 스스로 정리한다', async () => {
  const original = globalThis.fetch;
  try {
    const { save, sync, world, pauses } = setup();
    const journey = new Journey(sync, world); journey.load = () => {};
    // 결과를 확인하지 못한 **저장**이 남아 있으면(서버가 세이브를 거절한 경우) 먼저 그 결과를 확인한다.
    globalThis.fetch = async url => {
      if (String(url).includes('/api/account')) return response({ ok: true, revision: 6, save });
      return response({ ok: true, message: '수령 완료', revision: 7, save });
    };
    await sync.flush();
    assert.equal(sync.revision, 6);
    await journey.act('journey-claim', { kind: 'daily', id: 'login' });
    assert.equal(sync.revision, 7);
    assert.deepEqual(pauses, [true, false], '걸리는 대기가 없으면 요청 동안만 멈추고 끝나면 다시 돌린다');
  } finally { globalThis.fetch = original; }
});
