import { client, schema, transaction, account, assertRevision, reconcileItems, writeSave, respondError, fail } from '../server/database.mjs';
import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const namePattern = /^[가-힣a-zA-Z0-9_]{2,16}$/;
const bad = (res, status, code, error) => res.status(status).json({ code, error });
const initialSave = (id, gender, name) => ({ version: 1, name, accountId: id, gender, auto: true, autoClimb: true, level: 1, exp: 0, gold: 0, floor: 1, maxFloor: 1, floorKills: 0, kills: 0, health: 100, equipment: {}, equipmentCollection: [], bag: [], tutorial: 0, stones: 0, skillPoints: 0, lastActiveAt: Date.now(), learned: [], passives: [], quickSlots: [null, null, null], skillLevels: {} });
const offlineSeconds = updatedAt => {
  const elapsed = Math.floor((Date.now() - Date.parse(String(updatedAt))) / 1000);
  return Number.isFinite(elapsed) && elapsed >= 60 ? Math.min(43_200, elapsed) : 0;
};
const sign = value => createHmac('sha256', process.env.TURSO_AUTH_TOKEN).update(value).digest('base64url');
const tokenFor = id => { const value = Buffer.from(JSON.stringify({ id, exp: Date.now() + 30 * 86400_000 })).toString('base64url'); return `${value}.${sign(value)}`; };
export function tokenId(req) {
  const token = req.headers.authorization?.replace(/^Bearer /i, '');
  if (!token || token.length > 4096) return null;
  const [value, mac, extra] = token.split('.');
  if (!value || !mac || extra || !/^[\w-]+$/.test(value)) return null;
  const expected = Buffer.from(sign(value));
  const received = Buffer.from(mac);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try { const payload = JSON.parse(Buffer.from(value, 'base64url').toString()); return typeof payload.id === 'string' && Number.isFinite(payload.exp) && payload.exp > Date.now() ? payload.id : null; }
  catch { return null; }
}
async function hashPassword(password) { const salt = randomBytes(16).toString('hex'); return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`; }
async function verifyPassword(password, stored) {
  const [salt, hex] = String(stored).split(':');
  if (!salt || !/^[a-f\d]{128}$/.test(hex ?? '')) return false;
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'METHOD_NOT_ALLOWED', 'POST 요청만 허용합니다.');
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) return bad(res, 503, 'DB_NOT_CONFIGURED', '서버 DB가 설정되지 않았습니다. 관리자에게 문의하세요.');
  let db;
  try {
    db = client();
    await schema(db);
    const body = req.body ?? {};
    const action = body.action;
    if (action === 'register' || action === 'guest') {
      const id = action === 'guest' ? `guest_${randomUUID()}` : String(body.loginId ?? '').trim();
      const password = body.password;
      const gender = body.gender === 'female' ? 'female' : 'male';
      if (action === 'register' && (!namePattern.test(id) || typeof password !== 'string' || password.length < 8 || password.length > 72 || !['male', 'female'].includes(body.gender))) return bad(res, 400, 'INVALID_ACCOUNT', '아이디는 한글·영문·숫자·밑줄 2~16자, 비밀번호는 8~72자로 입력하고 성별을 선택하세요.');
      const save = initialSave(id, gender, action === 'guest' ? '모험가' : id);
      try { await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: [id, action === 'guest' ? 'guest' : await hashPassword(password), JSON.stringify(save), new Date().toISOString()] }); }
      catch (error) { if (/UNIQUE|constraint/i.test(String(error))) return bad(res, 409, 'ACCOUNT_EXISTS', '이미 사용 중인 아이디입니다.'); throw error; }
      return res.status(200).json({ accountId: id, loginId: action === 'guest' ? '게스트' : id, gender, guest: action === 'guest', token: tokenFor(id), save, revision: 0 });
    }
    if (action === 'login') {
      const id = String(body.loginId ?? '').trim();
      if (!namePattern.test(id) || typeof body.password !== 'string') return bad(res, 400, 'INVALID_ACCOUNT', '아이디와 비밀번호를 입력하세요.');
      const row = (await db.execute({ sql: 'SELECT id,password_hash,save_json,updated_at FROM djrpg_accounts WHERE id = ?', args: [id] })).rows[0];
      if (!row || !await verifyPassword(body.password, row.password_hash)) return bad(res, 401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');
      const latest = await account(db, row.id);
      const save = latest.save;
      return res.status(200).json({ revision: latest.revision, accountId: row.id, loginId: row.id, gender: save.gender, guest: false, token: tokenFor(row.id), save, offlineSeconds: offlineSeconds(row.updated_at) });
    }
    const id = tokenId(req);
    if (!id) return bad(res, 401, 'INVALID_TOKEN', '인증이 만료되었습니다. 다시 로그인하세요.');
    const row = await account(db, id);
    if (action === 'load') {
      const save = JSON.parse(row.save_json);
      return res.status(200).json({ revision: row.revision, accountId: row.id, loginId: row.password_hash === 'guest' ? '게스트' : row.id, gender: save.gender, guest: row.password_hash === 'guest', token: req.headers.authorization.slice(7), save, offlineSeconds: offlineSeconds(row.updated_at) });
    }
    if (action === 'save' || action === 'reset') {
      const result = await transaction(db, async tx => {
        const latest = await account(tx, id);
        if (action === 'save' && typeof body.requestId === 'string') {
          const replay = (await tx.execute({ sql: 'SELECT * FROM djrpg_save_requests WHERE account_id=?', args: [id] })).rows[0];
          if (replay?.request_id === body.requestId) {
            assertRevision(latest, Number(replay.revision));
            return { ok: true, save: latest.save, revision: latest.revision, offlineSeconds: 0 };
          }
        }
        assertRevision(latest, body.revision);
        const save = action === 'reset' ? initialSave(id, latest.save.gender === 'female' ? 'female' : 'male', latest.password_hash === 'guest' ? '모험가' : id) : body.save;
        if (!save || typeof save !== 'object' || Array.isArray(save) || save.version !== 1 || JSON.stringify(save).length > 1_000_000) fail(400, 'INVALID_SAVE', '저장 데이터 형식이 올바르지 않습니다.');
        if (action === 'reset') {
          const open = (await tx.execute({ sql: "SELECT COUNT(*) AS n FROM djrpg_market WHERE seller=? AND state='active'", args: [id] })).rows[0];
          const inbox = (await tx.execute({ sql: 'SELECT COUNT(*) AS n FROM djrpg_market_inbox WHERE account_id=? AND claimed_at IS NULL', args: [id] })).rows[0];
          if (Number(open.n) || Number(inbox.n)) fail(409, 'MARKET_PENDING', '등록 매물과 미수령 거래가 있어 초기화할 수 없습니다. 먼저 거래소를 정리하세요.');
        }
        await reconcileItems(tx, id, latest.save, save);
        const saved = await writeSave(tx, latest, save, [], action !== 'reset');
        if (action === 'save' && typeof body.requestId === 'string' && body.requestId.length <= 80) await tx.execute({ sql: 'INSERT INTO djrpg_save_requests VALUES (?,?,?) ON CONFLICT(account_id) DO UPDATE SET request_id=excluded.request_id, revision=excluded.revision', args: [id, body.requestId, saved.revision] });
        return { ok: true, ...saved, offlineSeconds: 0 };
      });
      return res.status(200).json(result);
    }
    return bad(res, 400, 'INVALID_ACTION', '지원하지 않는 요청입니다.');
  } catch (error) { return respondError(res, error); }
  finally { db?.close(); }
}
