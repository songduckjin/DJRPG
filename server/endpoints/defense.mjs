import { client, schema } from '../database.mjs';
import { sharedConnection } from '../connection.mjs';
import { createTrace, logRequest } from '../metrics.mjs';
import { tokenPayload } from '../auth.mjs';
import { runtimeEnv } from '../env.mjs';
import { json, readBody, errorResponse, versionGuard } from '../http.mjs';
import { defenseOperation } from '../defense.mjs';

/** POST /api/defense — 무한 방어전 순위(2026-11-24). 골격은 `/api/dungeon`과 같다. */
export async function defenseEndpoint(request, { env = runtimeEnv(), createDbClient } = {}) {
  const context = { trace: createTrace(), action: '', code: '' };
  const response = await handle(request, { env, createDbClient }, context);
  try { response?.headers?.set('Server-Timing', context.trace.header()); } catch { /* 헤더를 못 붙여도 응답은 그대로 */ }
  logRequest({ path: '/api/defense', action: context.action, status: response?.status, trace: context.trace, code: context.code });
  return response;
}

async function handle(request, { env = runtimeEnv(), createDbClient } = {}, context) {
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED', error: 'POST 요청만 허용합니다.' }, 405);
  const outdated = versionGuard(request); if (outdated) return outdated;
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return json({ code: 'DB_NOT_CONFIGURED', error: '서버 DB가 설정되지 않았습니다.' }, 503);
  const signed = tokenPayload(request, env); if (!signed) return json({ code: 'INVALID_TOKEN', error: '다시 로그인해 주세요.' }, 401);
  let db;
  try {
    const input = await readBody(request);
    db = createDbClient ? createDbClient(env) : await sharedConnection(env);
    if (createDbClient) await context.trace.step('schema', () => schema(db, env));
    context.action = typeof input?.action === 'string' ? input.action : '';
    return json(await defenseOperation(db, signed.id, input ?? {}, signed.sid, Date.now(), env.TURSO_DATABASE_URL));
  } catch (error) {
    context.code = error?.code ?? error?.name ?? '';
    return errorResponse(error);
  } finally { if (createDbClient) await db?.close(); }
}
