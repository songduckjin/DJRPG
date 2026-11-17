import { marketConnection } from '../server/market-connection.mjs';
import { snapshot as journeySnapshot, mutate as journeyMutate } from '../server/journey.mjs';
import { tokenId } from './account.mjs';
import { fail, respondError } from '../server/database.mjs';
import { snapshot, mutate, recentPrice } from '../server/market.mjs';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 허용합니다.' });
  let db;
  try {
    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) fail(503, 'DB_NOT_CONFIGURED', '서버 DB 설정을 확인하세요.');
    const id = tokenId(req); if (!id) fail(401, 'INVALID_TOKEN', '인증이 만료되었습니다. 다시 로그인하세요.');
    db = await marketConnection();
    const body = req.body ?? {};
    if (body.action === 'recent-price') return res.status(200).json(await recentPrice(db,body));
    if (body.action === 'journey-list') return res.status(200).json(await journeySnapshot(db, id));
    if (typeof body.action === 'string' && body.action.startsWith('journey-')) return res.status(200).json(await journeyMutate(db,id,body));
    return res.status(200).json(body.action === 'list' ? await snapshot(db, id, body) : await mutate(db, id, body));
  } catch (error) { return respondError(res, error); }
}
