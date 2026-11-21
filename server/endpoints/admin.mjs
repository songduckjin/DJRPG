import { createHash, timingSafeEqual } from 'node:crypto';
import { APP_VERSION } from '../app-version.mjs';
import { sharedConnection } from '../connection.mjs';
import { runtimeEnv } from '../env.mjs';
import { json } from '../http.mjs';
import { cleanupExpiredGuests, GUEST_ADMIN_CLEANUP_LIMIT } from '../guest-cleanup.mjs';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const reply = (body, status = 200) => json(body, status, headers);
const same = (left, right) => timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest());
const unavailable = database => ({ version: APP_VERSION, checkedAt: new Date().toISOString(), database, databaseMs: null, accounts: null, characters: null, active24h: null });

function credentials(request) {
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Basic ') || header.length > 600) return null;
  try {
    const value = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = value.indexOf(':');
    if (separator < 1 || value.length > 300) return null;
    return [value.slice(0, separator), value.slice(separator + 1)];
  } catch { return null; }
}

export async function adminEndpoint(request, { env = runtimeEnv(), createDbClient } = {}) {
  if (request.method !== 'GET') return reply({ code: 'METHOD_NOT_ALLOWED', error: 'GET 요청만 허용합니다.' }, 405);
  if (!env.ADMIN_DASHBOARD_PASSWORD) return reply({ code: 'ADMIN_NOT_CONFIGURED', error: '관리자 접속 정보가 설정되지 않았습니다.' }, 503);
  const pair = credentials(request);
  if (!pair || !same(pair[0], String(env.ADMIN_DASHBOARD_USER || 'djsong')) || !same(pair[1], String(env.ADMIN_DASHBOARD_PASSWORD))) {
    return reply({ code: 'ADMIN_UNAUTHORIZED', error: '관리자 아이디 또는 비밀번호가 올바르지 않습니다.' }, 401);
  }
  const url = new URL(request.url);
  const view = url.searchParams.get('view') ?? 'status';
  if (view !== 'status' && view !== 'accounts') return reply({ code: 'INVALID_VIEW', error: '지원하지 않는 조회입니다.' }, 400);
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return view === 'status'
    ? reply(unavailable('unconfigured'))
    : reply({ code: 'DB_NOT_CONFIGURED', error: '서버 DB가 설정되지 않았습니다.' }, 503);

  let db;
  try {
    const start = Date.now();
    db = createDbClient ? createDbClient(env) : await sharedConnection(env);
    // 게스트 24시간 자동 삭제(작업 259) — 집계·목록보다 먼저 돌려 화면이 정리된 실제 상태를 보여 준다.
    // `force`라 열 때마다 돈다(게스트 입장 경로의 5분 쿨다운과 별개).
    const guests = await cleanupExpiredGuests(db, { force: true, limit: GUEST_ADMIN_CLEANUP_LIMIT });
    const guestsCleaned = Number(guests?.deletedCount ?? 0);
    if (view === 'status') {
      const [ping, accounts, characters, active] = await Promise.all([
        db.execute('SELECT 1'),
        db.execute('SELECT COUNT(*) AS count FROM djrpg_accounts'),
        db.execute('SELECT COUNT(*) AS count FROM djrpg_characters'),
        db.execute({ sql: 'SELECT COUNT(*) AS count FROM djrpg_accounts WHERE updated_at >= ?', args: [new Date(Date.now() - 86400_000).toISOString()] })
      ]);
      void ping;
      return reply({ version: APP_VERSION, checkedAt: new Date().toISOString(), database: 'ok', databaseMs: Date.now() - start, accounts: Number(accounts.rows[0].count), characters: Number(characters.rows[0].count), active24h: Number(active.rows[0].count), guestsCleaned });
    }

    const search = (url.searchParams.get('q') ?? '').trim().slice(0, 50);
    const page = Math.min(1000, Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1));
    const size = 25;
    const filter = 'instr(lower(a.id), lower(?)) > 0';
    const [total, result] = await Promise.all([
      db.execute({ sql: `SELECT COUNT(*) AS count FROM djrpg_accounts a WHERE ${filter}`, args: [search] }),
      db.execute({ sql: `SELECT a.id, CASE WHEN a.password_hash='guest' THEN 1 ELSE 0 END AS guest,
          a.updated_at, COUNT(c.slot) AS characters,
          COALESCE(MAX(CASE WHEN json_valid(c.save_json) THEN CAST(json_extract(c.save_json,'$.maxFloor') AS INTEGER) ELSE 0 END),0) AS max_floor
        FROM djrpg_accounts a LEFT JOIN djrpg_characters c ON c.account_id=a.id
        WHERE ${filter} GROUP BY a.id, a.password_hash, a.updated_at
        ORDER BY a.updated_at DESC, a.id LIMIT ? OFFSET ?`, args: [search, size, (page - 1) * size] })
    ]);
    return reply({ page, size, total: Number(total.rows[0].count), guestsCleaned, accounts: result.rows.map(row => ({ id: String(row.id), guest: Boolean(row.guest), updatedAt: String(row.updated_at), characters: Number(row.characters), maxFloor: Number(row.max_floor) })) });
  } catch (error) {
    console.error(JSON.stringify({ event: 'admin_error', name: error?.name ?? 'Error' }));
    if (view === 'status') return reply(unavailable('error'));
    return reply({ code: 'DB_UNAVAILABLE', error: '서버 상태를 조회할 수 없습니다.' }, 503);
  } finally {
    if (createDbClient && db) try { db.close(); } catch { /* 테스트 연결 정리 */ }
  }
}
