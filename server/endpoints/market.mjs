import { marketConnection } from '../market-connection.mjs';
import { snapshot as journeySnapshot, mutate as journeyMutate } from '../journey.mjs';
import { tokenId } from '../auth.mjs';
import { fail, schema } from '../database.mjs';
import { snapshot, mutate, recentPrice } from '../market.mjs';
import { runtimeEnv } from '../env.mjs';
import { json, readBody, errorResponse } from '../http.mjs';

const withNoStore = response => { response.headers.set('Cache-Control', 'no-store'); return response; };
export async function marketEndpoint(request, { env = runtimeEnv(), createDbClient } = {}) {
  const res = { status: status => ({ json: body => json(body, status, { 'Cache-Control': 'no-store' }) }) };
  const req = { method: request.method, body: await readBody(request) };
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 허용합니다.' });
  let db;
  try {
    if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) fail(503, 'DB_NOT_CONFIGURED', '서버 DB 설정을 확인하세요.');
    const id = tokenId(request, env); if (!id) fail(401, 'INVALID_TOKEN', '인증이 만료되었습니다. 다시 로그인하세요.');
    db = createDbClient ? createDbClient(env) : await marketConnection(env);
    if (createDbClient) await schema(db, env);
    const body = req.body ?? {};
    if (body.action === 'recent-price') return res.status(200).json(await recentPrice(db,body));
    if (body.action === 'journey-list') return res.status(200).json(await journeySnapshot(db, id));
    if (typeof body.action === 'string' && body.action.startsWith('journey-')) return res.status(200).json(await journeyMutate(db,id,body));
    return res.status(200).json(body.action === 'list' ? await snapshot(db, id, body) : await mutate(db, id, body));
  } catch (error) { return withNoStore(errorResponse(error)); }
  finally { if (createDbClient) await db?.close(); }
}
