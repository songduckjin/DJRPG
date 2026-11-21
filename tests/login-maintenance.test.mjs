import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
// ts-loader의 훅이 등록된 뒤에 .ts 모듈을 가져와야 하므로 정적 import 대신 동적 import를 쓴다.
const { SERVER_UNAVAILABLE_MESSAGE, serverUnavailableMessage, accountRequest } = await import('../src/ui/login.ts');

// [작업 242]는 2026-11-21 09:00 KST 하나를 위한 하드코딩 배너였다. [작업 256]부터 점검은
// `public/maintenance.json`으로 켜고 끄며(정책: CONTRIBUTING §16), 로그인 화면에는 **시각을 박은 문구**가
// 남지 않는다 — API가 405·비 JSON(정적 폴백)을 돌려줄 때의 안내만 시각 없이 기다리게 한다.

test('점검·정적 폴백 안내는 특정 시각을 박지 않고 기다리게 한다', () => {
  assert.equal(SERVER_UNAVAILABLE_MESSAGE, '현재 서버 점검 중입니다. 잠시 후 다시 이용해 주세요.');
  assert.doesNotMatch(SERVER_UNAVAILABLE_MESSAGE, /9시/);
  assert.doesNotMatch(SERVER_UNAVAILABLE_MESSAGE, /2026-11-21/);
  assert.equal(serverUnavailableMessage(), SERVER_UNAVAILABLE_MESSAGE);
});

test('API가 빈 405(정적 폴백)를 돌려주면 빨간 오류 대신 점검 안내를 띄운다', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 405 });
  try {
    const error = await accountRequest('guest').then(() => null, cause => cause);
    assert.ok(error instanceof Error);
    assert.equal(error.message, SERVER_UNAVAILABLE_MESSAGE);
    assert.equal(error.notice, true, '빨간 오류가 아닌 안내 톤으로 표시해야 한다');
  } finally { globalThis.fetch = realFetch; }
});

test('API 대신 HTML(비 JSON)이 오면 같은 점검 안내로 바꾼다', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<!doctype html><title>Method Not Allowed</title>', { status: 200, headers: { 'content-type': 'text/html' } });
  try {
    const error = await accountRequest('load').then(() => null, cause => cause);
    assert.equal(error.message, SERVER_UNAVAILABLE_MESSAGE);
    assert.equal(error.notice, true);
    assert.doesNotMatch(error.message, /API 배포를 확인하세요/);
  } finally { globalThis.fetch = realFetch; }
});

test('정상 응답과 진짜 서버 오류는 점검 안내로 덮지 않는다', async () => {
  const realFetch = globalThis.fetch;
  const payload = { token: 't', accountId: 'a' };
  globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const result = await accountRequest('load');
    assert.deepEqual(result, payload);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }), { status: 400, headers: { 'content-type': 'application/json' } });
    const error = await accountRequest('login').then(() => null, cause => cause);
    assert.equal(error.message, '아이디 또는 비밀번호가 올바르지 않습니다.');
    assert.equal(error.status, 400);
    assert.notEqual(error.notice, true);
  } finally { globalThis.fetch = realFetch; }
});

test('안내 톤 스타일은 남고, 시각 하드코딩 배너 스타일은 지워졌다', () => {
  const css = readFileSync(new URL('../src/styles/login.css', import.meta.url), 'utf8');
  assert.match(css, /\.login-error\.is-notice\s*\{\s*color: #f3cd93/);
  assert.doesNotMatch(css, /\.maintenance-banner/);
  const source = readFileSync(new URL('../src/ui/login.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /2026-11-21T09:00:00\+09:00/);
});
