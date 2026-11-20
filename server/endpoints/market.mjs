import { marketConnection } from '../market-connection.mjs';
import { snapshot as journeySnapshot, mutate as journeyMutate } from '../journey.mjs';
import { tokenPayload } from '../auth.mjs';
import { account, assertSessionId, fail, schema } from '../database.mjs';
import { snapshot, mutate, recentPrice } from '../market.mjs';
import { announcePouchLegend, announcedItemName, recentAnnouncements } from '../announcements.mjs';
import { runtimeEnv } from '../env.mjs';
import { isPreviewHost } from '../season.mjs';
import { json, readBody, errorResponse, versionGuard } from '../http.mjs';

const withNoStore = response => { response.headers.set('Cache-Control', 'no-store'); return response; };
export async function marketEndpoint(request, { env = runtimeEnv(), createDbClient } = {}) {
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
    // 미리보기 전용 기능(작업 210 테스트 우편)은 `preview-…` 호스트에서만 — 운영 `djrpg.pages.dev`는 늘 false.
    const preview = isPreviewHost(request, env);
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
    if (body.action === 'journey-list') return res.status(200).json(await journeySnapshot(db, id, { preview }));
    if (typeof body.action === 'string' && body.action.startsWith('journey-')) return res.status(200).json(await journeyMutate(db,id,body,{ preview }));
    return res.status(200).json(body.action === 'list' ? await snapshot(db, id, body) : await mutate(db, id, body));
  } catch (error) { return withNoStore(errorResponse(error)); }
  finally { if (createDbClient) await db?.close(); }
}
