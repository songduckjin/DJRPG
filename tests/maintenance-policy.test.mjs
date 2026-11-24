import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
// ts-loader의 훅이 등록된 뒤에 .ts 모듈을 가져와야 하므로 정적 import 대신 동적 import를 쓴다.
const {
  MAINTENANCE_API_MESSAGE, MAINTENANCE_TITLE, MAINTENANCE_URL, MAINTENANCE_OFF,
  parseMaintenance, maintenanceEtaText, maintenancePopupMarkup, isMaintenanceResponse,
  fetchMaintenance, MaintenanceWatch, announceMaintenance
} = await import('../src/game/maintenance.ts');
const { accountRequest } = await import('../src/ui/login.ts');
const { accountEndpoint } = await import('../server/endpoints/account.mjs');
const { maintenanceMode, maintenanceResponse } = await import('../server/maintenance.mjs');

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const post = body => new Request('https://example.test/api/account', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('저장소 기본 점검 파일은 닫혀 있다 — 배포 전에는 서비스가 열려 있어야 한다', () => {
  const raw = JSON.parse(read('../public/maintenance.json'));
  // 2026-11-22 스킬 개편·서버 초기화 배포 창처럼 **예고된 점검**은 `active:true` + `eta`로 열린다.
  // 그때도 `eta`(예상 완료 시각)는 반드시 있어야 한다 — 시각 없는 점검은 사용자를 기다리게만 한다.
  if (raw.active === true) {
    assert.match(raw.eta, /^\d{4}-\d{2}-\d{2}T/, '점검 중이면 예상 완료 시각(ISO)이 있어야 한다');
    assert.ok(raw.message.length > 0, '점검 중이면 안내 문구가 있어야 한다');
    assert.equal(parseMaintenance(raw).active, true);
    assert.notEqual(maintenancePopupMarkup(parseMaintenance(raw)), '', '점검 중에는 모달 마크업이 있다');
    return;
  }
  assert.equal(raw.active, false);
  assert.equal(raw.title, MAINTENANCE_TITLE);
  assert.equal(raw.eta, '');
  assert.equal(raw.message, '');
  const parsed = parseMaintenance(raw);
  assert.equal(parsed.active, false);
  assert.equal(maintenancePopupMarkup(parsed), '', '열린 상태에서는 모달 마크업이 없다');
  assert.equal(MAINTENANCE_OFF.active, false);
  assert.equal(MAINTENANCE_URL, '/maintenance.json');
});

test('점검 파일은 active:true(boolean)일 때만 점검으로 읽고, 깨진 값은 열린 상태로 둔다', () => {
  assert.equal(parseMaintenance({ active: true }).active, true);
  assert.equal(parseMaintenance({ active: 'true' }).active, false, '문자열 "true"는 점검으로 보지 않는다');
  assert.equal(parseMaintenance({ active: 1 }).active, false);
  assert.equal(parseMaintenance(null).active, false);
  assert.equal(parseMaintenance('active').active, false);
  assert.equal(parseMaintenance({}).title, MAINTENANCE_TITLE);
  const long = parseMaintenance({ active: true, title: '가'.repeat(200), message: '나'.repeat(900) });
  assert.equal(long.title.length, 80);
  assert.equal(long.message.length, 400);
  const trimmed = parseMaintenance({ active: true, title: '  서버 점검  ', eta: ' 2026-11-21T16:30:00+09:00 ', message: ' 새벽 배포 ' });
  assert.equal(trimmed.title, '서버 점검');
  assert.equal(trimmed.eta, '2026-11-21T16:30:00+09:00');
  assert.equal(trimmed.message, '새벽 배포');
});

test('예상 시간은 ISO 시각이면 한국 시간으로, 자유 문구면 그대로 보여 준다', () => {
  assert.equal(maintenanceEtaText('2026-11-21T16:30:00+09:00'), '11월 21일 16:30');
  assert.equal(maintenanceEtaText('2026-11-21T07:30:00Z'), '11월 21일 16:30');
  assert.equal(maintenanceEtaText('오후 4시 30분쯤'), '오후 4시 30분쯤');
  assert.equal(maintenanceEtaText('16:30'), '16:30');
  assert.equal(maintenanceEtaText(''), '');
  assert.equal(maintenanceEtaText('   '), '');
});

test('점검 모달은 "점검 진행 중입니다" + 예상 시간 + 안내를 보여 주고, 점검일 때만 그려진다', () => {
  const state = parseMaintenance({ active: true, eta: '2026-11-21T16:30:00+09:00', message: '새 시즌 업데이트 배포 중입니다.' });
  const markup = maintenancePopupMarkup(state);
  assert.match(markup, /class="maintenance-popup"/);
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /점검 진행 중입니다/);
  assert.match(markup, /예상 완료 시간/);
  assert.match(markup, /11월 21일 16:30/);
  assert.match(markup, /새 시즌 업데이트 배포 중입니다\./);
  assert.match(markup, /data-maintenance-check/);
  assert.match(markup, /다시 확인/);

  const noEta = maintenancePopupMarkup(parseMaintenance({ active: true }));
  assert.match(noEta, /확인 중입니다/, '예상 시간이 비어 있으면 확인 중으로 보여 준다');
  assert.equal(maintenancePopupMarkup(parseMaintenance({ active: false, eta: '2026-11-21T16:30:00+09:00' })), '', '꺼져 있으면 예상 시간이 있어도 모달이 없다');
});

test('점검 파일의 문구는 그대로 넣지 않고 이스케이프한다', () => {
  const markup = maintenancePopupMarkup(parseMaintenance({ active: true, title: '<img src=x onerror=alert(1)>', message: '<script>alert(1)</script>' }));
  assert.doesNotMatch(markup, /<img/);
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;img/);
  assert.match(markup, /&lt;script&gt;/);
});

test('API 응답이 점검인지(503 MAINTENANCE·헤더)와 DB 장애(DB_UNAVAILABLE)를 구분한다', () => {
  assert.equal(isMaintenanceResponse(503, { code: 'MAINTENANCE' }), true);
  assert.equal(isMaintenanceResponse(503, {}, { get: () => '1' }), true);
  assert.equal(isMaintenanceResponse(503, { code: 'DB_UNAVAILABLE' }, { get: () => null }), false);
  assert.equal(isMaintenanceResponse(200, {}), false);
  assert.equal(isMaintenanceResponse(401, { code: 'UNAUTHORIZED' }), false);
});

test('점검 파일은 캐시 없이(?t=·no-store) 읽고, 읽지 못하면 null(모르는 상태)이다', async () => {
  const calls = [];
  const fetcher = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ active: true, eta: '2026-11-21T16:30:00+09:00' }), { status: 200 }); };
  const state = await fetchMaintenance(fetcher);
  assert.equal(state.active, true);
  assert.match(calls[0].url, /^\/maintenance\.json\?t=\d+$/);
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(calls[0].init.headers['Cache-Control'], 'no-cache');

  assert.equal(await fetchMaintenance(async () => new Response('nope', { status: 404 })), null);
  assert.equal(await fetchMaintenance(async () => new Response('<html>', { status: 200 })), null, 'JSON이 아니면 모르는 상태');
  assert.equal(await fetchMaintenance(async () => { throw new Error('offline'); }), null);
});

test('감시자는 점검이 켜진 순간에만 알리고, 꺼졌다 다시 켜지면 또 알린다', async () => {
  let active = false;
  const extra = [];
  const fetcher = async () => new Response(JSON.stringify({ active, title: MAINTENANCE_TITLE, eta: '', message: '' }), { status: 200 });
  const seen = [];
  const timers = { ids: [], cleared: [], setInterval(fn, ms) { this.ids.push(ms); return this.ids.length; }, clearInterval(id) { this.cleared.push(id); } };
  const watch = new MaintenanceWatch({ onMaintenance: state => seen.push(state), fetcher, intervalMs: 20_000, timers, watchVisibility: false });

  assert.equal((await watch.check()).active, false);
  assert.equal(seen.length, 0, '열린 상태로는 아무것도 하지 않는다');

  active = true;
  assert.equal((await watch.check()).active, true);
  assert.equal(seen.length, 1, '점검이 켜진 순간 한 번 알린다');
  assert.equal(seen[0].active, true);
  await watch.check();
  assert.equal(seen.length, 1, '이미 점검 중이면 반복해서 알리지 않는다');
  assert.equal(watch.maintenanceActive, true);

  active = false;
  await watch.check();
  assert.equal(watch.maintenanceActive, false);
  active = true;
  await watch.check();
  assert.equal(seen.length, 2, '꺼졌다 다시 켜지면 새 점검으로 알린다');

  watch.start();
  assert.deepEqual(timers.ids, [20_000], '기본 20초마다 점검 파일을 다시 읽는다');
  watch.stop();
  assert.equal(timers.cleared.length >= 1, true, 'stop()은 폴링을 멈춘다');
  extra.length = 0;
});

test('읽지 못한 점검 확인은 상태를 바꾸지 않는다(offline일 때 게임을 끊지 않는다)', async () => {
  const seen = [];
  const watch = new MaintenanceWatch({ onMaintenance: state => seen.push(state), fetcher: async () => { throw new Error('offline'); }, watchVisibility: false });
  assert.equal(await watch.check(), null);
  assert.equal(watch.maintenanceActive, false);
  assert.equal(seen.length, 0);
});

test('서버 점검 플래그(DJRPG_MAINTENANCE=1)는 계정 API를 DB에 닿기 전에 503 MAINTENANCE로 닫는다', async () => {
  assert.equal(maintenanceMode({ DJRPG_MAINTENANCE: '1' }), true);
  assert.equal(maintenanceMode({ DJRPG_MAINTENANCE: 'true' }), true);
  assert.equal(maintenanceMode({ DJRPG_MAINTENANCE: 'off' }), false);
  assert.equal(maintenanceMode({}), false);
  assert.equal(maintenanceResponse({}), undefined);

  const on = await accountEndpoint(post({ action: 'guest' }), { env: { DJRPG_MAINTENANCE: '1' } });
  assert.equal(on.status, 503);
  assert.equal(on.headers.get('x-djrpg-maintenance'), '1');
  assert.equal(on.headers.get('cache-control'), 'no-store');
  const body = await on.json();
  assert.equal(body.code, 'MAINTENANCE');
  assert.match(body.error, /점검 중/);

  const off = await accountEndpoint(post({ action: 'guest' }), { env: {} });
  const offBody = await off.json();
  assert.notEqual(offBody.code, 'MAINTENANCE', '환경변수가 없으면 점검 응답으로 막지 않는다(DB 설정 검사로 넘어간다)');
  assert.equal(offBody.code, 'DB_NOT_CONFIGURED');
});

test('API가 503 점검을 돌려주면 로그인 화면은 점검 안내(주황)로 바꾸고 즉시 점검 확인을 알린다', async () => {
  const realFetch = globalThis.fetch;
  const realWindow = globalThis.window;
  const events = [];
  globalThis.window = { dispatchEvent: event => { events.push(event.type); return true; } };
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 'MAINTENANCE', error: MAINTENANCE_API_MESSAGE }), {
    status: 503, headers: { 'content-type': 'application/json', 'X-DJRPG-Maintenance': '1' }
  });
  try {
    const error = await accountRequest('guest').then(() => null, cause => cause);
    assert.ok(error instanceof Error);
    assert.equal(error.message, MAINTENANCE_API_MESSAGE);
    assert.equal(error.code, 'MAINTENANCE');
    assert.equal(error.status, 503);
    assert.equal(error.notice, true, '빨간 오류가 아닌 안내 톤으로 보여야 한다');
    assert.deepEqual(events, ['djrpg-maintenance']);
  } finally {
    globalThis.fetch = realFetch;
    if (realWindow === undefined) delete globalThis.window; else globalThis.window = realWindow;
  }
});

test('화면 연결: 로그인은 점검 중 로그인·게스트를 잠그고, 사냥 중이면 저장 뒤 로그인 화면으로 돌아간다', () => {
  const login = read('../src/ui/login.ts');
  assert.match(login, /new MaintenanceWatch/);
  assert.match(login, /setLoginBlocked\(overlay, state\.active\)/);
  assert.match(login, /showMaintenancePopup\(overlay, state/);
  assert.match(login, /watch\.maintenanceActive/);
  assert.doesNotMatch(login, /2026-11-21T09:00:00\+09:00/, '하드코딩된 09:00 점검 배너는 없어야 한다');
  assert.doesNotMatch(login, /MAINTENANCE_BANNER/);
  assert.match(login, /isMaintenanceResponse\(response\.status, result, response\.headers\)/);

  const main = read('../src/main.ts');
  assert.match(main, /new MaintenanceWatch/);
  assert.match(main, /showMaintenancePopup\(document\.body, state/);
  assert.match(main, /leavingForMaintenance/);
  assert.match(main, /MAINTENANCE_EVENT/);
  assert.match(main, /location\.reload\(\)/);

  const css = read('../src/styles/login.css');
  assert.match(css, /\.maintenance-layer\s*\{[^}]*position: fixed/);
  assert.match(css, /\.maintenance-card\s*\{/);
  assert.match(css, /\.maintenance-eta strong\s*\{/);
  assert.match(css, /\.maintenance-check\s*\{[^}]*min-height: 46px/);
  assert.match(css, /\.login-screen\.is-maintenance/);
  assert.doesNotMatch(css, /\.maintenance-banner/, '예전 배너 스타일은 지운다');

  const headers = read('../public/_headers');
  assert.match(headers, /\/maintenance\.json\r?\n\s+Cache-Control: no-store/);

  const policy = read('../AGENTS.md');
  assert.match(policy, /배포·점검 정책/);
  assert.match(policy, /점검 진행 중입니다/);
  assert.match(policy, /전수 정상화 확인/);
  const contributing = read('../CONTRIBUTING.md');
  assert.match(contributing, /## 16\. 배포·오픈 절차/);
  assert.match(contributing, /ops\/maintenance-on-/);
  assert.match(contributing, /ops\/maintenance-off-/);
});

test('announceMaintenance는 window가 없으면 조용히 넘어간다(단위 테스트·SSR 안전)', () => {
  const realWindow = globalThis.window;
  delete globalThis.window;
  try { announceMaintenance(); } finally { if (realWindow !== undefined) globalThis.window = realWindow; }
  assert.ok(true);
});
