/**
 * `/api/journey` — 여정(우편함·일일/주간 보상·업적) 전용 엔드포인트(작업 260 · 설계서 PR-5).
 *
 * 예전에는 `/api/market` 한 핸들러가 `journey-list`·`journey-*`을 함께 받았다. 그래서 거래소 배포·부하·장애가
 * 우편 수령까지 그대로 전이됐고, 클라이언트도 거래소 요청 경로·멱등표·잠금을 함께 썼다(설계서 S-5).
 *
 * 이 핸들러는 같은 `server/journey.mjs` 도메인 로직을 부르되 **입구와 멱등 표를 여정 것으로** 쓴다.
 * 한 릴리스 동안 `/api/market`의 `journey-*` 라우팅도 그대로 남겨 구번들이 동작하게 한다(그쪽 주석 참고).
 */
import { assertSessionId, fail, schema } from '../database.mjs';
import { snapshot as journeySnapshot, mutate as journeyMutate } from '../journey.mjs';
import { tokenPayload } from '../auth.mjs';
import { sharedConnection } from '../connection.mjs';
import { isPreviewHost, isProductionHost } from '../season.mjs';
import { runtimeEnv } from '../env.mjs';
import { json, readBody, errorResponse, versionGuard } from '../http.mjs';
import { createTrace, logRequest } from '../metrics.mjs';

const noStore = { 'Cache-Control': 'no-store' };
/** 목록 조회 액션 — 새 이름 `list`와 구번들의 `journey-list`를 함께 받는다. */
const LIST_ACTIONS = ['journey-list', 'list'];

export async function journeyEndpoint(request, options = {}) {
  const context = { trace: createTrace(), action: '', code: '', clamped: 0 };
  const response = await handle(request, options, context);
  try { response?.headers?.set('Server-Timing', context.trace.header()); } catch { /* 헤더 실패는 응답을 막지 않는다 */ }
  logRequest({ path: '/api/journey', action: context.action, status: response?.status, trace: context.trace, code: context.code, clamped: context.clamped });
  return response;
}

async function handle(request, { env = runtimeEnv(), createDbClient } = {}, context) {
  const req = { method: request.method, body: await readBody(request) };
  if (req.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED', error: 'POST 요청만 허용합니다.' }, 405, noStore);
  const outdated = versionGuard(request);
  if (outdated) return outdated;
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return json({ code: 'DB_NOT_CONFIGURED', error: '서버 DB가 설정되지 않았습니다.' }, 503, noStore);
  const signed = tokenPayload(request, env);
  if (!signed) return json({ code: 'INVALID_TOKEN', error: '인증이 만료되었습니다. 다시 로그인하세요.' }, 401, noStore);
  const id = signed.id;
  let db;
  try {
    db = createDbClient ? createDbClient(env) : await sharedConnection(env);
    if (createDbClient) await context.trace.step('schema', () => schema(db, env));
    await assertSessionId(db, id, signed.sid);
    const body = req.body ?? {};
    const action = typeof body.action === 'string' ? body.action : '';
    context.action = action;
    // 미리보기 전용 기능(테스트 우편)은 호스트를 아는 이 경로에서만 다룬다 — `/api/market`(구 경로)과 같은 규칙.
    const preview = isPreviewHost(request, env) ? 'preview' : isProductionHost(request, env) ? 'production' : false;
    if (LIST_ACTIONS.includes(action)) return json(await journeySnapshot(db, id, { preview }), 200, noStore);
    if (action.startsWith('journey-')) {
      const result = await context.trace.step('tx', () => journeyMutate(db, id, body, { preview }));
      if (result.clamped?.length) context.clamped = result.clamped.length;
      return json(result, 200, noStore);
    }
    fail(400, 'INVALID_ACTION', '지원하지 않는 요청입니다.');
  } catch (error) { context.code = error?.code ?? error?.name ?? ''; return errorResponse(error, noStore); }
  finally { if (createDbClient) await db?.close(); }
}
