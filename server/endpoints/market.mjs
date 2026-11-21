import { marketConnection } from '../market-connection.mjs';
import { snapshot as journeySnapshot, mutate as journeyMutate } from '../journey.mjs';
import { tokenPayload } from '../auth.mjs';
import { account, assertSessionId, fail, schema } from '../database.mjs';
import { snapshot, mutate, recentPrice } from '../market.mjs';
import { announcePouchLegend, announcedItemName, recentAnnouncements } from '../announcements.mjs';
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
    // 보물 주머니 레전드 전광판(작업 208): 접속 중인 모두가 받아 가는 최근 공지와, 내가 뽑은 레전드 기록.
    if (body.action === 'announcements') return res.status(200).json(await recentAnnouncements(db, Date.now()));
    if (body.action === 'announcePouchLegend' || body.action === 'announce-pouch-legend') {
      const row = await account(db, id);
      if (row.password_hash === 'guest') fail(403, 'GUEST_READ_ONLY', '게스트는 전광판에 소식을 올릴 수 없습니다.');
      const item = announcedItemName(body.itemName);
      if (!item) fail(400, 'INVALID_ITEM', '알릴 아이템 이름을 확인하세요.');
      return res.status(200).json(await announcePouchLegend(db, { accountId: id, character: row.save?.name, item }, Date.now()));
    }
    // ── 폐지 예정(작업 260 · 설계서 PR-5): 여정(우편함·일일/주간 보상·업적)은 `/api/journey`로 옴겼다.
    //    이 배포 직전에 받아 둔 구번들은 아직 `/api/market`으로 `journey-list`·`journey-*`을 보내므로 한 릴리스
    //    동안 같은 핵심으로 계속 처리한다(구번들 호환·진행 중 재확인). 새 코드는 이 두 줄을 쓰지 않는다.
    //    다음 릴리스에서 이 라우팅·journey import를 지운다.
    if (body.action === 'journey-list') return res.status(200).json(await journeySnapshot(db, id));
    if (typeof body.action === 'string' && body.action.startsWith('journey-')) return res.status(200).json(await journeyMutate(db,id,body));
    if (body.action === 'list') return res.status(200).json(await context.trace.step('db', () => snapshot(db, id, body)));
    const result = await context.trace.step('tx', () => mutate(db, id, body));
    if (result.clamped?.length) context.clamped = result.clamped.length;
    return res.status(200).json(result);
  } catch (error) { context.code = error?.code ?? error?.name ?? ''; return withNoStore(errorResponse(error)); }
  finally { if (createDbClient) await db?.close(); }
}
