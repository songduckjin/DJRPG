import { marketConnection } from '../market-connection.mjs';
import { snapshot as journeySnapshot, mutate as journeyMutate } from '../journey.mjs';
import { tokenPayload } from '../auth.mjs';
import { assertSessionId, fail, schema } from '../database.mjs';
import { snapshot, mutate, recentPrice } from '../market.mjs';
import { runtimeEnv } from '../env.mjs';
import { json, readBody, errorResponse, versionGuard } from '../http.mjs';
import { createTrace, logRequest } from '../metrics.mjs';

const withNoStore = response => { response.headers.set('Cache-Control', 'no-store'); return response; };
export async function marketEndpoint(request, options = {}) {
  const context = { trace: createTrace(), action: '', code: '', clamped: 0 };
  const response = await handle(request, options, context);
  try { response?.headers?.set('Server-Timing', context.trace.header()); } catch { /* 헤더 실패는 응답을 막지 않는다 */ }
  logRequest({ path: '/api/market', action: context.action, status: response?.status, trace: context.trace, code: context.code, clamped: context.clamped });
  return response;
}
async function handle(request, { env = runtimeEnv(), createDbClient } = {}, context) {
  const res = { status: status => ({ json: body => json(body, status, { 'Cache-Control': 'no-store' }) }) };
  const req = { method: request.method, body: await readBody(request) };
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 허용합니다.' });
  const outdated = versionGuard(request);
  if (outdated) return outdated;
  let db;
  try {
    if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) fail(503, 'DB_NOT_CONFIGURED', '서버 DB 설정을 확인하세요.');
    const signed = tokenPayload(request, env); if (!signed) fail(401, 'INVALID_TOKEN', '인증이 만료되었습니다. 다시 로그인하세요.');
    db = createDbClient ? createDbClient(env) : await marketConnection(env);
    if (createDbClient) await schema(db, env);
    await assertSessionId(db, signed.id, signed.sid);
    const id = signed.id;
    const body = req.body ?? {};
    context.action = typeof body.action === 'string' ? body.action : '';
    if (body.action === 'recent-price') return res.status(200).json(await recentPrice(db,body));
    if (body.action === 'journey-list') return res.status(200).json(await journeySnapshot(db, id));
    if (typeof body.action === 'string' && body.action.startsWith('journey-')) return res.status(200).json(await journeyMutate(db,id,body));
    if (body.action === 'list') return res.status(200).json(await context.trace.step('db', () => snapshot(db, id, body)));
    const result = await context.trace.step('tx', () => mutate(db, id, body));
    if (result.clamped?.length) context.clamped = result.clamped.length;
    return res.status(200).json(result);
  } catch (error) { context.code = error?.code ?? error?.name ?? ''; return withNoStore(errorResponse(error)); }
  finally { if (createDbClient) await db?.close(); }
}
