import { runtimeEnv } from './env.mjs';
import { transaction } from './database.mjs';
import { seasonResetSave } from './save-seed.mjs';

/** 지금 시즌 번호. 올릴 때마다 서버가 `djrpg_meta`에 이 값을 한 번만 적고 초기화를 한 번 돈다(작업 206). */
export const SEASON_EPOCH = 2;
/** 초기화가 실제로 도는 호스트 — **운영(`djrpg.pages.dev`)뿐**이다.
 *  미리보기(`preview-…djrpg.pages.dev`·배포 해시 호스트)는 같은 Turso DB를 보므로, 여기서 막지 않으면
 *  미리보기 접속만으로 운영 유저의 진행이 지워진다. 목록에 없는 호스트는 조회도 하지 않는다. */
export const PRODUCTION_HOSTS = ['djrpg.pages.dev'];

const hostOf = request => {
  try { return new URL(String(request?.url ?? '')).hostname.toLowerCase(); } catch { return ''; }
};

/** 이 요청이 시즌 초기화를 실행할 수 있는 환경인가. 운영 호스트가 아니면 늘 false다. */
export function seasonArmed(request, env = runtimeEnv()) {
  // 긴급 정지: 운영에서도 `DJRPG_SEASON_RESET=off` 하나로 초기화를 막아 둘 수 있다.
  if (String(env?.DJRPG_SEASON_RESET ?? '').toLowerCase() === 'off') return false;
  const extra = String(env?.DJRPG_PRODUCTION_HOSTS ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const host = hostOf(request);
  return Boolean(host) && [...PRODUCTION_HOSTS, ...extra].includes(host);
}

/** 비우는 공용·부캐·거래 데이터. 아이디·비밀번호(`djrpg_accounts`)와 결제 기록(`djrpg_shop_orders`·
 *  `djrpg_shop_ledger`)·결제 멱등 기록(`djrpg_shop_requests`)은 남긴다 — 잔액(다이아)만 0으로 돌린다. */
export const RESET_TABLES = [
  'djrpg_market', 'djrpg_market_events', 'djrpg_market_inbox', 'djrpg_market_requests',
  'djrpg_warehouse', 'djrpg_warehouse_requests',
  'djrpg_item_owners', 'djrpg_character_item_owners',
  'djrpg_dungeon_records',
  'djrpg_boss_days', 'djrpg_boss_attempts', 'djrpg_boss_scores', 'djrpg_boss_rewards',
  'djrpg_journey', 'djrpg_save_requests', 'djrpg_save_versions',
  'djrpg_announcements'
];

const confirmed = new Set();

/** `season_epoch` 마이그레이션을 **한 번만** 실행한다. 이미 이번 시즌이면 아무것도 하지 않는다.
 *  돌려주는 값은 "이번 요청에서 초기화를 실제로 했다"이다. */
export async function runSeasonReset(db, request, env = runtimeEnv()) {
  if (!seasonArmed(request, env)) return false;
  const key = String(db?.url ?? env?.TURSO_DATABASE_URL ?? '');
  if (key && confirmed.has(key)) return false;
  const read = async tx => (await tx.execute({ sql: "SELECT value FROM djrpg_meta WHERE key='season_epoch'", args: [] })).rows[0];
  const current = await read(db);
  if (current && Number(current.value) >= SEASON_EPOCH) { if (key) confirmed.add(key); return false; }
  let ran = false;
  await transaction(db, async tx => {
    const row = await read(tx);
    if (row && Number(row.value) >= SEASON_EPOCH) return;
    // 던전·월드보스 표는 처음 쓰일 때 만들어지므로, 아직 없는 표는 건너뛴다.
    const existing = new Set((await tx.execute({ sql: `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${RESET_TABLES.map(() => '?').join(',')})`, args: RESET_TABLES })).rows.map(entry => String(entry.name)));
    const season = JSON.stringify(seasonResetSave(''));
    const statements = RESET_TABLES.filter(table => existing.has(table)).map(table => `DELETE FROM ${table}`);
    // 게스트(비밀번호 해시가 'guest')는 이 초기화의 대상이 아니다 — 세이브·캐릭터를 그대로 둔다.
    statements.push(
      { sql: "DELETE FROM djrpg_characters WHERE account_id IN (SELECT id FROM djrpg_accounts WHERE password_hash <> 'guest')", args: [] },
      { sql: `UPDATE djrpg_accounts SET save_json = json_set(?, '$.accountId', id, '$.name', COALESCE(NULLIF(json_extract(save_json, '$.name'), ''), id)), updated_at = ?
               WHERE password_hash <> 'guest'`, args: [season, new Date().toISOString()] },
      { sql: `UPDATE djrpg_account_profiles SET shared_gold = 0, active_slot = 1
               WHERE account_id IN (SELECT id FROM djrpg_accounts WHERE password_hash <> 'guest')`, args: [] },
      // 다이아·부캐 슬롯도 100% 초기화한다(사용자 확정). 결제 기록 자체는 위 주석대로 남긴다.
      { sql: `UPDATE djrpg_shop_wallet SET diamonds = 0, max_slots = 3
               WHERE account_id IN (SELECT id FROM djrpg_accounts WHERE password_hash <> 'guest')`, args: [] },
      'DELETE FROM djrpg_shop_entitlements',
      { sql: "INSERT INTO djrpg_meta(key,value) VALUES('season_epoch',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", args: [String(SEASON_EPOCH)] }
    );
    await tx.batch(statements);
    ran = true;
  });
  if (ran && key) confirmed.add(key);
  return ran;
}
