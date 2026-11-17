import { ApiError } from './database.mjs';

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

export async function readBody(request) {
  try { return await request.json() ?? {}; }
  catch { return {}; }
}

export function errorResponse(error) {
  if (error instanceof ApiError) return json({ code: error.code, error: error.message }, error.status);
  console.error('Database request failed');
  return json({ code: 'DB_UNAVAILABLE', error: '서버 연결이 불안정합니다. 잠시 후 다시 시도하세요.' }, 503);
}
