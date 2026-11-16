import { tokenId } from './account.mjs';
import { client, schema, fail, respondError } from '../server/database.mjs';
import { snapshot, mutate } from '../server/market.mjs';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 허용합니다.' });
  let db;
  try {
    if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) fail(503, 'DB_NOT_CONFIGURED', '서버 DB 설정을 확인하세요.');
    const id = tokenId(req); if (!id) fail(401, 'INVALID_TOKEN', '인증이 만료되었습니다. 다시 로그인하세요.');
    db = client(); await schema(db);
    const body = req.body ?? {};
    return res.status(200).json(body.action === 'list' ? await snapshot(db, id, body) : await mutate(db, id, body));
  } catch (error) { return respondError(res, error); }
  finally { db?.close(); }
}
