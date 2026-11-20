import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
// ts-loader의 훅이 등록된 뒤에 .ts 모듈을 가져와야 하므로 정적 import 대신 동적 import를 쓴다.
const {
  MAINTENANCE_BANNER, MAINTENANCE_MESSAGE, MAINTENANCE_UNTIL, SERVER_UNAVAILABLE_MESSAGE,
  inMaintenance, maintenanceBannerMarkup, serverUnavailableMessage, accountRequest
} = await import('../src/ui/login.ts');

// 2026-11-21 09:00 KST === UTC 자정. Cloudflare Pages 무료 플랜의 일일 한도가 다시 열리는 시각이다.
const untilMs = Date.parse('2026-11-21T09:00:00+09:00');
const inWindow = Date.parse('2026-11-21T07:52:00+09:00');
const afterWindow = Date.parse('2026-11-21T09:00:00+09:00');

const withClock = async (now, run) => {
  const real = Date.now;
  Date.now = () => now;
  try { return await run(); } finally { Date.now = real; }
};

test('점검 안내는 2026-11-21 09:00 KST(UTC 자정)에 끝나고, 그 시각이 지나면 스스로 사라진다', () => {
  assert.equal(MAINTENANCE_UNTIL, untilMs);
  assert.equal(new Date(MAINTENANCE_UNTIL).toISOString(), '2026-11-21T00:00:00.000Z');
  assert.equal(inMaintenance(inWindow), true);
  assert.equal(inMaintenance(untilMs - 1), true);
  assert.equal(inMaintenance(afterWindow), false, '09:00 정각부터는 점검 안내가 꺼져야 한다');
  assert.equal(inMaintenance(afterWindow + 86_400_000), false);
});

test('로그인 패널 상단 배너는 점검 시간에만 그려지고 문구에 9시가 들어 있다', () => {
  const banner = maintenanceBannerMarkup(inWindow);
  assert.match(banner, /class="maintenance-banner"/);
  assert.match(banner, /🛠️ 서버 점검 안내/);
  assert.ok(banner.includes(MAINTENANCE_BANNER));
  assert.match(MAINTENANCE_BANNER, /오늘 오전 9시까지 서버 점검 중입니다/);
  assert.match(MAINTENANCE_BANNER, /9시 이후 정상 이용 가능합니다/);
  assert.equal(maintenanceBannerMarkup(afterWindow), '');
  assert.equal(maintenanceBannerMarkup(Date.parse('2026-11-22T00:00:00+09:00')), '');
});

test('점검 중 API 안내는 9시를 언급하고, 점검 뒤에는 시각 없이 기다리게 한다', () => {
  assert.equal(serverUnavailableMessage(inWindow), MAINTENANCE_MESSAGE);
  assert.equal(MAINTENANCE_MESSAGE, '현재 서버 점검 중입니다. 오전 9시 이후 다시 이용해 주세요.');
  assert.equal(serverUnavailableMessage(afterWindow), SERVER_UNAVAILABLE_MESSAGE);
  assert.doesNotMatch(SERVER_UNAVAILABLE_MESSAGE, /9시/);
});

test('API가 빈 405(정적 폴백)를 돌려주면 빨간 오류 대신 점검 안내를 띄운다', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 405 });
  try {
    await withClock(inWindow, async () => {
      const error = await accountRequest('guest').then(() => null, cause => cause);
      assert.ok(error instanceof Error);
      assert.equal(error.message, MAINTENANCE_MESSAGE);
      assert.equal(error.notice, true, '빨간 오류가 아닌 안내 톤으로 표시해야 한다');
    });
  } finally { globalThis.fetch = realFetch; }
});

test('API 대신 HTML(비 JSON)이 오면 같은 점검 안내로 바꾼다', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<!doctype html><title>Method Not Allowed</title>', { status: 200, headers: { 'content-type': 'text/html' } });
  try {
    await withClock(inWindow, async () => {
      const error = await accountRequest('load').then(() => null, cause => cause);
      assert.equal(error.message, MAINTENANCE_MESSAGE);
      assert.equal(error.notice, true);
      assert.doesNotMatch(error.message, /API 배포를 확인하세요/);
    });
  } finally { globalThis.fetch = realFetch; }
});

test('정상 응답과 진짜 서버 오류는 점검 안내로 덮지 않는다', async () => {
  const realFetch = globalThis.fetch;
  const payload = { token: 't', accountId: 'a' };
  globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    await withClock(inWindow, async () => {
      const result = await accountRequest('load');
      assert.deepEqual(result, payload);
      globalThis.fetch = async () => new Response(JSON.stringify({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }), { status: 400, headers: { 'content-type': 'application/json' } });
      const error = await accountRequest('login').then(() => null, cause => cause);
      assert.equal(error.message, '아이디 또는 비밀번호가 올바르지 않습니다.');
      assert.equal(error.status, 400);
      assert.notEqual(error.notice, true);
    });
  } finally { globalThis.fetch = realFetch; }
});

test('배너·안내 톤 스타일이 다크 판타지 팔레트로 정의돼 있다', () => {
  const css = readFileSync(new URL('../src/styles/login.css', import.meta.url), 'utf8');
  assert.match(css, /\.maintenance-banner\s*\{[^}]*border-left: 3px solid #e8a94e/);
  assert.match(css, /\.login-error\.is-notice\s*\{\s*color: #f3cd93/);
});
