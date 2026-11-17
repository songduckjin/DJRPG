import { ApiError } from './database.mjs';
import { APP_VERSION, OUTDATED_MESSAGE, versionMismatch } from './app-version.mjs';

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

export async function readBody(request) {
  try { return await request.json() ?? {}; }
  catch { return {}; }
}

// 배포본과 다른 버전을 보낸 클라이언트는 426으로 돌려보내 새 번들을 받게 한다.
export function versionGuard(request) {
  if (!versionMismatch(request)) return undefined;
  return json({ code: 'VERSION_OUTDATED', error: OUTDATED_MESSAGE, expected: APP_VERSION }, 426, { 'Cache-Control': 'no-store' });
}

export function errorResponse(error) {
  if (error instanceof ApiError) return json({ code: error.code, error: error.message }, error.status);
  console.error('Database request failed');
  return json({ code: 'DB_UNAVAILABLE', error: '서버 연결이 불안정합니다. 잠시 후 다시 시도하세요.' }, 503);
}
