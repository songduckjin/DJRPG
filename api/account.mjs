import { createClient } from '@libsql/client';
import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const namePattern = /^[가-힣a-zA-Z0-9_]{2,16}$/;
const bad = (res, status, code, error) => res.status(status).json({ code, error });
const initialSave = (id, gender, name) => ({ version: 1, name, accountId: id, gender, auto: true, level: 1, exp: 0, gold: 0, floor: 1, kills: 0, health: 100, equipment: {}, bag: [], tutorial: 0, stones: 0, learned: ['spin', 'slam', 'warcry'], passives: [], quickSlots: ['spin', 'slam', 'warcry'], skillLevels: { spin: 1, slam: 1, warcry: 1 } });
const sign = value => createHmac('sha256', process.env.TURSO_AUTH_TOKEN).update(value).digest('base64url');
const tokenFor = id => { const value = Buffer.from(JSON.stringify({ id, exp: Date.now() + 30 * 86400_000 })).toString('base64url'); return `${value}.${sign(value)}`; };
function tokenId(req) {
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
  try {
    const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
    await db.execute('CREATE TABLE IF NOT EXISTS djrpg_accounts (id TEXT PRIMARY KEY COLLATE NOCASE, password_hash TEXT NOT NULL, save_json TEXT NOT NULL, updated_at TEXT NOT NULL)');
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
      return res.status(200).json({ accountId: id, loginId: action === 'guest' ? '게스트' : id, gender, guest: action === 'guest', token: tokenFor(id), save });
    }
    if (action === 'login') {
      const id = String(body.loginId ?? '').trim();
      if (!namePattern.test(id) || typeof body.password !== 'string') return bad(res, 400, 'INVALID_ACCOUNT', '아이디와 비밀번호를 입력하세요.');
      const row = (await db.execute({ sql: 'SELECT id,password_hash,save_json FROM djrpg_accounts WHERE id = ?', args: [id] })).rows[0];
      if (!row || !await verifyPassword(body.password, row.password_hash)) return bad(res, 401, 'INVALID_CREDENTIALS', '아이디 또는 비밀번호가 올바르지 않습니다.');
      const save = JSON.parse(row.save_json);
      return res.status(200).json({ accountId: row.id, loginId: row.id, gender: save.gender, guest: false, token: tokenFor(row.id), save });
    }
    const id = tokenId(req);
    if (!id) return bad(res, 401, 'INVALID_TOKEN', '인증이 만료되었습니다. 다시 로그인하세요.');
    const row = (await db.execute({ sql: 'SELECT id,password_hash,save_json FROM djrpg_accounts WHERE id = ?', args: [id] })).rows[0];
    if (!row) return bad(res, 401, 'INVALID_TOKEN', '계정을 찾을 수 없습니다. 다시 로그인하세요.');
    if (action === 'load') {
      const save = JSON.parse(row.save_json);
      return res.status(200).json({ accountId: row.id, loginId: row.password_hash === 'guest' ? '게스트' : row.id, gender: save.gender, guest: row.password_hash === 'guest', token: req.headers.authorization.slice(7), save });
    }
    if (action === 'save' || action === 'reset') {
      const save = action === 'reset' ? initialSave(id, JSON.parse(row.save_json).gender === 'female' ? 'female' : 'male', row.password_hash === 'guest' ? '모험가' : id) : body.save;
      if (!save || typeof save !== 'object' || Array.isArray(save) || save.version !== 1 || JSON.stringify(save).length > 200_000) return bad(res, 400, 'INVALID_SAVE', '저장 데이터 형식이 올바르지 않습니다.');
      save.accountId = id;
      await db.execute({ sql: 'UPDATE djrpg_accounts SET save_json = ?, updated_at = ? WHERE id = ?', args: [JSON.stringify(save), new Date().toISOString(), id] });
      return res.status(200).json({ ok: true, save });
    }
    return bad(res, 400, 'INVALID_ACTION', '지원하지 않는 요청입니다.');
  } catch (error) {
    console.error('Account API failed');
    return bad(res, 503, 'DB_UNAVAILABLE', '서버 DB에 연결할 수 없습니다. 잠시 후 다시 시도하세요.');
  }
}
