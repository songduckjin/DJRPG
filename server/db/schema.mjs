/**
 * 기본 스키마 DDL (작업 260 — `server/database.mjs` 5분할).
 *
 * 여기 있는 것은 **문장 목록과 인덱스 식**뿐이고, 실제 실행(1회 초기화·재시도)은 `server/db/connection.mjs`가
 * 맡는다. 옮긴 것이 목적이므로 문장·순서·주석은 종전 `server/database.mjs` `schema()`와 같다.
 *
 * 표 목록을 새로 만들 때는 `server/tables.mjs` 등록부에도 한 줄을 더해야 한다
 * (`tests/table-registry.test.mjs`가 DDL과 등록부를 대조한다).
 */
import { commonCodeStatements } from '../core/commonCodes.mjs';
import { journeyRequestTableDDL } from '../journey-requests.mjs';

/**
 * 거래소 스탯 정렬식 (작업 211).
 *
 * `server/market.mjs` `snapshot()`은 스탯을 필터·정렬에 함께 쓴다. 정렬은 `item_json` 안의 값이라
 * 그냥은 임시 B-tree + 전행 스캔이 되는데, 매물이 10만 건이면 ms대가 아니라 70ms대가 된다. 그래서 이
 * **같은 문자열**로 표현식 인덱스(`djrpg_market_sort_*`)를 만들고 `snapshot()`도 이 함수로 식을 만든다 — SQLite는 두 식이 같은 문자열일 때만 인덱스를 쓰기 때문이다(관계는 `tests/market-index.test.mjs`가 확인).
 */
export const marketStatExpression = stat => `COALESCE(json_extract(item_json,'$.stats.${stat}'),0)`;
/** 스탯 정렬을 쓰는 컬럼(거래소 UI가 고를 수 있는 값과 같다). */
export const MARKET_SORT_STATS = ['attack', 'defense', 'health', 'crit', 'speed', 'cdr'];
/**
 * 판매 중 매물의 정렬 인덱스 DDL. 스탯 5종과 가격 각각 하나씩이다.
 *
 * `state`를 첫 열로 두는 이유: 부분 인덱스(`WHERE state='active'`)는 질의의 `state=?`가 **바인딩 값**이라
 * 플래너가 값을 모르는 준비 단계에서 쓸 수 없다(실측으로 확인 — 부분 인덱스는 채택되지 않았다).
 * 정렬 꼬리(`created_at DESC, id ASC`)까지 인덱스에 넣어 `ORDER BY`가 인덱스 순서 그대로 끝나게 한다.
 */
export function marketSortIndexStatements() {
  const statements = MARKET_SORT_STATS.map(stat => `CREATE INDEX IF NOT EXISTS djrpg_market_sort_${stat} ON djrpg_market(state, ${marketStatExpression(stat)} DESC, created_at DESC, id)`);
  statements.push('CREATE INDEX IF NOT EXISTS djrpg_market_sort_price ON djrpg_market(state, price ASC, created_at DESC, id)');
  return statements;
}

/** 표를 만드는 문장(전부 `CREATE TABLE IF NOT EXISTS`). 순서는 종전과 같다. */
export function tableStatements() {
  return [
    'CREATE TABLE IF NOT EXISTS djrpg_accounts (id TEXT PRIMARY KEY COLLATE NOCASE, password_hash TEXT NOT NULL, save_json TEXT NOT NULL, updated_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS djrpg_journey (account_id TEXT PRIMARY KEY COLLATE NOCASE, state_json TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS djrpg_save_requests (account_id TEXT PRIMARY KEY COLLATE NOCASE, request_id TEXT NOT NULL, revision INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS djrpg_save_versions (account_id TEXT PRIMARY KEY COLLATE NOCASE, revision INTEGER NOT NULL DEFAULT 0)',
    // 묶음 등록(작업 249): `price`는 **개당** 가격이고, `quantity`는 남은 수량, `items_json`은 아직 팔리지 않은
    // 아이템들의 실제 JSON 배열이다(대표 `item_json`은 검색·정렬 인덱스용). 기존 행은 `quantity=1`·`items_json`
    // 없음(NULL)이며 `item_json` 한 개짜리 매물로 읽힌다.
    `CREATE TABLE IF NOT EXISTS djrpg_market (id TEXT PRIMARY KEY, seller TEXT NOT NULL COLLATE NOCASE, seller_name TEXT NOT NULL, buyer TEXT COLLATE NOCASE, item_json TEXT NOT NULL, name TEXT NOT NULL, slot TEXT NOT NULL, rarity TEXT NOT NULL, price INTEGER NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, sold_at INTEGER, quantity INTEGER NOT NULL DEFAULT 1, items_json TEXT)`,
    'CREATE INDEX IF NOT EXISTS djrpg_market_state_time ON djrpg_market(state, created_at)',
    'CREATE INDEX IF NOT EXISTS djrpg_market_seller ON djrpg_market(seller, state)',
    'CREATE INDEX IF NOT EXISTS djrpg_market_recent_price ON djrpg_market(state,name,rarity,sold_at)',
    'CREATE INDEX IF NOT EXISTS djrpg_market_buyer ON djrpg_market(buyer, sold_at)',
    'CREATE TABLE IF NOT EXISTS djrpg_market_inbox (id TEXT PRIMARY KEY, account_id TEXT NOT NULL COLLATE NOCASE, listing_id TEXT NOT NULL, kind TEXT NOT NULL, item_json TEXT, gold INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL, created_at INTEGER NOT NULL, claimed_at INTEGER, UNIQUE(listing_id,kind))',
    'CREATE INDEX IF NOT EXISTS djrpg_market_inbox_owner ON djrpg_market_inbox(account_id, claimed_at)',
    'CREATE TABLE IF NOT EXISTS djrpg_item_owners (item_id TEXT PRIMARY KEY, account_id TEXT NOT NULL COLLATE NOCASE, location TEXT NOT NULL, item_json TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS djrpg_market_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, listing_id TEXT NOT NULL, created_at INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS djrpg_market_requests (account_id TEXT NOT NULL COLLATE NOCASE, request_id TEXT NOT NULL, response_json TEXT NOT NULL, PRIMARY KEY(account_id, request_id))'
    // 여정 요청은 거래소 요청 표와 분리한다(작업 260 · PR-5). 구번들이 거래소 표에 남긴 응답은 읽기에서 함께 본다.
    , journeyRequestTableDDL
    , 'CREATE TABLE IF NOT EXISTS djrpg_account_profiles (account_id TEXT PRIMARY KEY COLLATE NOCASE, shared_gold INTEGER NOT NULL, active_slot INTEGER NOT NULL DEFAULT 1)'
    // 서버 전역 표시값(작업 206) — `season_epoch`처럼 한 번만 도는 마이그레이션의 완료 표시를 적는다.
    , 'CREATE TABLE IF NOT EXISTS djrpg_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'
    , 'CREATE TABLE IF NOT EXISTS djrpg_characters (account_id TEXT NOT NULL COLLATE NOCASE, slot INTEGER NOT NULL, save_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(account_id, slot))'
    , 'CREATE TABLE IF NOT EXISTS djrpg_character_item_owners (item_id TEXT PRIMARY KEY, account_id TEXT NOT NULL COLLATE NOCASE, slot INTEGER NOT NULL)'
    , 'CREATE TABLE IF NOT EXISTS djrpg_warehouse (account_id TEXT NOT NULL COLLATE NOCASE, item_id TEXT PRIMARY KEY, item_json TEXT NOT NULL)'
    , 'CREATE TABLE IF NOT EXISTS djrpg_warehouse_requests (account_id TEXT NOT NULL COLLATE NOCASE, request_id TEXT NOT NULL, response_json TEXT NOT NULL, PRIMARY KEY(account_id,request_id))'
    , 'CREATE TABLE IF NOT EXISTS djrpg_shop_wallet (account_id TEXT PRIMARY KEY COLLATE NOCASE, diamonds INTEGER NOT NULL DEFAULT 0, max_slots INTEGER NOT NULL DEFAULT 3, customer_key TEXT NOT NULL)'
    , 'CREATE TABLE IF NOT EXISTS djrpg_shop_orders (order_id TEXT PRIMARY KEY, account_id TEXT NOT NULL COLLATE NOCASE, product_id TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL, provider TEXT NOT NULL, grant_json TEXT NOT NULL, status TEXT NOT NULL, payment_key TEXT UNIQUE, created_at INTEGER NOT NULL, confirmed_at INTEGER)'
    , 'CREATE TABLE IF NOT EXISTS djrpg_shop_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL COLLATE NOCASE, source_type TEXT NOT NULL, source_id TEXT NOT NULL, diamonds_delta INTEGER NOT NULL, created_at INTEGER NOT NULL, UNIQUE(account_id,source_type,source_id))'
    , 'CREATE TABLE IF NOT EXISTS djrpg_shop_entitlements (account_id TEXT NOT NULL COLLATE NOCASE, entitlement_key TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0, expires_at INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY(account_id,entitlement_key))'
    , 'CREATE TABLE IF NOT EXISTS djrpg_shop_requests (account_id TEXT NOT NULL COLLATE NOCASE, request_id TEXT NOT NULL, response_json TEXT NOT NULL, PRIMARY KEY(account_id,request_id))'
    // 보물 주머니 레전드 전광판(작업 208) — 정식 계정이 테스트한 레전드 획득만 짧게 남는다.
    , 'CREATE TABLE IF NOT EXISTS djrpg_announcements (id TEXT PRIMARY KEY, account_id TEXT NOT NULL COLLATE NOCASE, character TEXT NOT NULL, item TEXT NOT NULL, created_at INTEGER NOT NULL)'
    , 'CREATE INDEX IF NOT EXISTS djrpg_announcements_time ON djrpg_announcements(created_at)'
    // 던전 최고층의 서버 사본(작업 209). 세이브의 dungeonFloor는 이 기록(+1)까지만 저장되고,
    // 기록은 검증된 submit만 올린다(`server/dungeon.mjs`).
    , 'CREATE TABLE IF NOT EXISTS djrpg_dungeon_records (account_id TEXT PRIMARY KEY COLLATE NOCASE,name TEXT NOT NULL,cleared_floor INTEGER NOT NULL,cleared_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)'
    , 'CREATE INDEX IF NOT EXISTS djrpg_dungeon_rank ON djrpg_dungeon_records(cleared_floor DESC, cleared_at, account_id)'
    , 'CREATE TABLE IF NOT EXISTS djrpg_dungeon_attempts (account_id TEXT PRIMARY KEY COLLATE NOCASE,floor INTEGER NOT NULL,started_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,seed INTEGER)'
  ];
}

/**
 * 표를 만든 뒤 **한 번만** 도는 보정 문장(기존 계정의 프로필·캐릭터·지갑·소유 기록 채우기).
 * 전부 `INSERT OR IGNORE`라 여러 번 돌아도 결과가 같다.
 */
export function backfillStatements() {
  return [
    "INSERT OR IGNORE INTO djrpg_account_profiles(account_id,shared_gold,active_slot) SELECT id, COALESCE(CAST(json_extract(save_json,'$.gold') AS INTEGER),0),1 FROM djrpg_accounts WHERE json_valid(save_json)",
    "INSERT OR IGNORE INTO djrpg_characters(account_id,slot,save_json,updated_at) SELECT id,1,json_remove(save_json,'$.gold'),updated_at FROM djrpg_accounts WHERE json_valid(save_json)",
    "INSERT OR IGNORE INTO djrpg_shop_wallet(account_id,customer_key) SELECT id,lower(hex(randomblob(16))) FROM djrpg_accounts",
    `INSERT OR IGNORE INTO djrpg_character_item_owners(item_id,account_id,slot)
       SELECT o.item_id,o.account_id,1 FROM djrpg_item_owners o JOIN djrpg_accounts a ON a.id=o.account_id
       WHERE json_valid(a.save_json) AND o.location='inventory' AND o.item_id IN (
         SELECT json_extract(j.value,'$.id') FROM json_each(a.save_json,'$.bag') j
         UNION SELECT json_extract(j.value,'$.id') FROM json_each(a.save_json,'$.equipment') j
       )`
  ];
}

/**
 * 공통코드 2표(작업 260, 추가형 DDL). 표·데이터를 건드리지 않는 `CREATE TABLE IF NOT EXISTS`라
 * 기존 DB에 그대로 실행해도 안전하다. 1단계에서는 이 표를 읽는 요청 경로가 없다.
 */
export { commonCodeStatements };

/** `djrpg_accounts.session_id`(단일 세션, 작업 210) — 예전 DB에는 없으므로 따로 더한다. */
export const SESSION_COLUMN_STATEMENT = 'ALTER TABLE djrpg_accounts ADD COLUMN session_id TEXT';

/**
 * 묶음 등록 열 보정(작업 249).
 *
 * `CREATE TABLE IF NOT EXISTS`는 이미 있는 표를 바꾸지 않으므로, 2026-11-21 이전에 만들어진 DB에는
 * `quantity`·`items_json`이 없다. 여기서 한 번만 더한다 — 실패해도 게임(로그인·저장)이 멈추지 않도록
 * 예외를 밖으로 던지지 않고, 열이 없는 동안에는 `server/market.mjs`가 단건처럼 동작한다(묶음 등록 거부).
 */
export async function addMarketBundleColumns(db) {
  try {
    const columns = new Set((await db.execute("SELECT name FROM pragma_table_info('djrpg_market')")).rows.map(row => String(row.name)));
    if (!columns.has('quantity')) await db.execute('ALTER TABLE djrpg_market ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1');
    if (!columns.has('items_json')) await db.execute('ALTER TABLE djrpg_market ADD COLUMN items_json TEXT');
  } catch (error) {
    console.error(JSON.stringify({ event: 'market_bundle_columns_skipped', message: String(error?.message ?? error).slice(0, 160) }));
  }
}
