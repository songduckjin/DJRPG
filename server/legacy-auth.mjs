import { tokenId } from './auth.mjs';
import { fail } from './database.mjs';

const legacyLoginUrl = 'https://djrpg.vercel.app/api/account';

export async function verifyLegacyViaVercel(id, password, env, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(legacyLoginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', loginId: id, password }),
      redirect: 'error',
      // Cloudflare Workers `fetch()`는 `cache` 옵션을 거부한다 — 넣으면 검증이 통째로 503이 됐다(작업 224).
      signal: AbortSignal.timeout(8000)
    });
  } catch { fail(503, 'DB_UNAVAILABLE', '서버 연결이 불안정합니다. 잠시 후 다시 시도하세요.'); }
  if (response.status === 401) return false;
  if (!response.ok) fail(503, 'DB_UNAVAILABLE', '서버 연결이 불안정합니다. 잠시 후 다시 시도하세요.');
  let result;
  try { result = await response.json(); }
  catch { fail(503, 'DB_UNAVAILABLE', '서버 연결이 불안정합니다. 잠시 후 다시 시도하세요.'); }
  const signedId = tokenId({ headers: { get: () => `Bearer ${result?.token ?? ''}` } }, env);
  if (signedId !== id || result.accountId !== id) fail(503, 'DB_UNAVAILABLE', '서버 연결이 불안정합니다. 잠시 후 다시 시도하세요.');
  return true;
}
