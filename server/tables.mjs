/**
 * DJRPG 표 **단일 등록부** (작업 260, `work/djrpg_db_schema_plan.md` §7-3).
 *
 * 지금까지 같은 표 목록이 네 곳에 흩어져 있었다.
 *   ① 스키마 DDL — `server/db/schema.mjs` · `server/dungeon-schema.mjs` · `server/world-boss-schema.mjs`
 *   ② 계정 탈퇴 — `server/account-delete.mjs` `ACCOUNT_TABLES`
 *   ③ 시즌 초기화 — `server/season.mjs` `RESET_TABLES`
 *   ④ DB 이관 — `scripts/migrate-turso-db.mjs` `TABLES`/`OPTIONAL_TABLES`
 *
 * 목록이 어긋난 실제 사고: 이관 목록에서 **상점 5표(`djrpg_shop_*`)가 빠져** 있었고, 소스 DB에 상점 표가
 * 있으면 "목록에 없는 테이블" 검사에 걸려 이관이 아예 중단됐다. 또 탈퇴 목록에 표를 하나 빠뜨리면
 * 같은 아이디로 다시 가입한 사람이 이전 주인의 캐릭터·창고·결제 기록을 물려받는다.
 *
 * 그래서 이 파일이 **표 하나 = 한 줄**로 소유·정책을 적고, 나머지 네 곳은 여기서 **파생**한다.
 * 새 표를 만들면 반드시 여기에 한 줄을 더한다 — `tests/table-registry.test.mjs`가
 * ① DDL이 만드는 모든 `djrpg_*` 표가 등록부에 있는지 ② 파생 목록이 기존 네 곳의 목록과 **집합이 같은지**를 검사한다.
 *
 * 필드
 *   name          표 이름(실제 DDL과 같아야 한다)
 *   domain        도메인(문서·리뷰용 분류)
 *   owner         `account` | `character` | `item` | `global` — 무엇에 귀속되는 값인가
 *   accountColumn 계정을 가리키는 열. `null`이면 계정 열이 없다(전역 표)
 *   onDelete      탈퇴 처리. `delete`(계정 열로 지운다) · `market`(seller/buyer) · `listing`(매물 id로)
 *                 · `keep`(지우지 않는다)
 *   onSeason      시즌 초기화 처리. `purge`(RESET_TABLES — 표를 비운다) · `clear`(따로 한 문장으로 비운다)
 *                 · `reset`(행을 지우지 않고 값만 기본값으로 되돌린다) · `keep`(그대로 둔다)
 *   migrate       이관. `required`(소스에 없으면 중단) · `optional`(없으면 0행으로 보고 건너뛴다)
 *   ddl           DDL을 가진 모듈. `schema`(`server/db/schema.mjs`) · `dungeon` · `world-boss`
 *   sequence      AUTOINCREMENT 시퀀스를 이관할 때 이어받아야 하는 표
 *   note          왜 이 정책인지(코드가 아니라 정책인 것만 적는다)
 */
const entry = (name, spec) => Object.freeze({ name, ...spec });

/** 표 하나 = 한 줄. 순서는 DDL·이관 출력 순서를 겸한다(사람이 읽기 좋은 순서로 도메인별). */
export const TABLES = Object.freeze([
  entry('djrpg_accounts', {
    domain: 'account', owner: 'account', accountColumn: 'id', onDelete: 'delete', onSeason: 'reset', migrate: 'required', ddl: 'schema',
    note: '아이디·비밀번호·세션. 탈퇴는 이 행을 id로 지우되 **맨 마지막**에 지운다(남아 있으면 재가입이 409로 막힌다). 시즌은 행을 지우지 않고 세이브만 새 시즌 것으로 되돌린다.'
  }),
  entry('djrpg_account_profiles', {
    domain: 'account', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'reset', migrate: 'required', ddl: 'schema',
    note: '공용 골드·활성 슬롯. 시즌에는 행을 남기고 골드 0·슬롯 1로 되돌린다.'
  }),
  entry('djrpg_characters', {
    domain: 'save', owner: 'character', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'reset', migrate: 'required', ddl: 'schema',
    note: '캐릭터 세이브. 시즌에는 **일반 계정의 행만** 지우고 게스트 세이브는 보존한다(guest 보존은 `season.mjs` 한 문장).'
  }),
  entry('djrpg_save_versions', {
    domain: 'save', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'purge', migrate: 'required', ddl: 'schema'
  }),
  entry('djrpg_save_requests', {
    domain: 'save', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'purge', migrate: 'required', ddl: 'schema'
  }),
  entry('djrpg_journey', {
    domain: 'journey', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'purge', migrate: 'required', ddl: 'schema',
    note: '일일·주간·업적·우편·지급이력 JSON.'
  }),
  entry('djrpg_item_owners', {
    domain: 'items', owner: 'item', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'purge', migrate: 'required', ddl: 'schema',
    note: '아이템 스펙 사본 + 위치(inventory/warehouse/escrow/inbox/consumed).'
  }),
  entry('djrpg_character_item_owners', {
    domain: 'items', owner: 'item', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'purge', migrate: 'required', ddl: 'schema',
    note: '아이템 → 캐릭터 슬롯. `djrpg_item_owners`와 같은 사실을 두 곳에 적는 미러다(작업 260 기준 유지, 통합은 후속 단계).'
  }),
  entry('djrpg_warehouse', {
    domain: 'warehouse', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'purge', migrate: 'required', ddl: 'schema'
  }),
  entry('djrpg_warehouse_requests', {
    domain: 'warehouse', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'purge', migrate: 'required', ddl: 'schema'
  }),
  entry('djrpg_market', {
    domain: 'market', owner: 'item', accountColumn: 'seller', onDelete: 'market', onSeason: 'purge', migrate: 'required', ddl: 'schema',
    note: '매물. 계정을 `seller`/`buyer`로 가리므로 `account_id`로 지우는 목록에 넣을 수 없다(`deleteAccountData`가 따로 지운다).'
  }),
  entry('djrpg_market_inbox', {
    domain: 'market', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'purge', migrate: 'required', ddl: 'schema'
  }),
  entry('djrpg_market_events', {
    domain: 'market', owner: 'global', accountColumn: null, onDelete: 'listing', onSeason: 'purge', migrate: 'required', ddl: 'schema', sequence: true,
    note: '거래소 변경 seq 로그(계정 열 없음). 탈퇴는 그 계정의 매물 id로 줄을 지운다. AUTOINCREMENT 시퀀스를 이관 뒤에도 이어받는다.'
  }),
  entry('djrpg_market_requests', {
    domain: 'market', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'purge', migrate: 'required', ddl: 'schema',
    note: '거래·여정 요청 멱등 기록.'
  }),
  entry('djrpg_shop_wallet', {
    domain: 'shop', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'reset', migrate: 'optional', ddl: 'schema',
    note: '다이아 잔액·최대 슬롯. 시즌에는 행을 남기고 다이아 0·슬롯 3으로 되돌린다(결제 이력은 `djrpg_shop_orders`·`_ledger`).'
  }),
  entry('djrpg_shop_orders', {
    domain: 'shop', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'keep', migrate: 'optional', ddl: 'schema',
    note: '결제 주문 — 환불·문의 추적 근거라 시즌에도 남긴다.'
  }),
  entry('djrpg_shop_ledger', {
    domain: 'shop', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'keep', migrate: 'optional', ddl: 'schema',
    note: '다이아 원장 — 결제 추적 근거라 시즌에도 남긴다.'
  }),
  entry('djrpg_shop_entitlements', {
    domain: 'shop', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'clear', migrate: 'optional', ddl: 'schema',
    note: '이용권·방치 초. 시즌에는 **전 행을 비우지만** 결제 기록이 아니므로 `RESET_TABLES` 목록이 아니라 `runSeasonReset`의 별도 문장이 지운다(현행 동작 유지).'
  }),
  entry('djrpg_shop_requests', {
    domain: 'shop', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'keep', migrate: 'optional', ddl: 'schema',
    note: '구매 멱등 기록 — 시즌 초기화로 지우면 같은 요청이 재지급될 수 있어 남긴다.'
  }),
  entry('djrpg_meta', {
    domain: 'meta', owner: 'global', accountColumn: null, onDelete: 'keep', onSeason: 'keep', migrate: 'optional', ddl: 'schema',
    note: '서버 전역 키/값(`season_epoch` 등). 계정과 무관하므로 탈퇴·시즌 대상이 아니다.'
  }),
  entry('djrpg_announcements', {
    domain: 'announcements', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'purge', migrate: 'optional', ddl: 'schema',
    note: '보물 주머니 레전드 전광판(24시간 뒤 정리). 이관 뒤에 생긴 표라 예전 공용 DB에는 없을 수 있다.'
  }),
  entry('djrpg_dungeon_records', {
    domain: 'dungeon', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'purge', migrate: 'required', ddl: 'dungeon',
    note: '던전 최고층의 서버 사본 — 세이브 클램프의 근거라 함께 옮긴다.'
  }),
  entry('djrpg_dungeon_attempts', {
    domain: 'dungeon', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'keep', migrate: 'required', ddl: 'dungeon',
    note: '진행 중 도전(층·시작 시각·시드). 시즌에는 남긴다 — 지우면 진행 중 도전의 검증 근거가 사라진다(현행 동작 유지).'
  }),
  entry('djrpg_boss_days', {
    domain: 'world-boss', owner: 'global', accountColumn: null, onDelete: 'keep', onSeason: 'purge', migrate: 'required', ddl: 'world-boss',
    note: '그날의 보스 한 행(계정 열 없음). 계정 탈퇴와 무관하다.'
  }),
  entry('djrpg_boss_attempts', {
    domain: 'world-boss', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'purge', migrate: 'required', ddl: 'world-boss'
  }),
  entry('djrpg_boss_scores', {
    domain: 'world-boss', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'purge', migrate: 'required', ddl: 'world-boss'
  }),
  entry('djrpg_boss_rewards', {
    domain: 'world-boss', owner: 'account', accountColumn: 'account_id', onDelete: 'delete', onSeason: 'purge', migrate: 'required', ddl: 'world-boss'
  })
]);

/** 등록부에 있는 이름 집합(테스트·검사용). */
export const TABLE_NAMES = Object.freeze(TABLES.map(table => table.name));
const BY_NAME = new Map(TABLES.map(table => [table.name, table]));

/** 표 하나의 정책. 등록되지 않은 이름은 던진다 — 오타·새 표 누락을 조용히 넘기지 않는다. */
export function tableSpec(name) {
  const spec = BY_NAME.get(name);
  if (!spec) throw new Error(`표 등록부(server/tables.mjs)에 없는 표입니다: ${name}`);
  return spec;
}

/** DDL이 만드는 `djrpg_*` 표 이름인가(이관 스크립트의 "목록에 없는 표" 검사에 쓴다). */
export const isRegistered = name => BY_NAME.has(name);

const names = predicate => Object.freeze(TABLES.filter(predicate).map(table => table.name));

/** 계정 탈퇴 때 `account_id`로 지우는 표 — `server/account-delete.mjs`의 `ACCOUNT_TABLES`. */
export const ACCOUNT_TABLES = names(table => table.onDelete === 'delete' && table.accountColumn === 'account_id');

/** 계정을 `seller`/`buyer`로 가리키는 매물 표 — `deleteAccountData`가 따로 지운다. */
export const MARKET_TABLE = 'djrpg_market';
/** 매물 알림 로그 — 매물 id로 함께 지운다. */
export const MARKET_EVENT_TABLE = 'djrpg_market_events';

/** 시즌 초기화가 **비우는** 표 — `server/season.mjs`의 `RESET_TABLES`(표 전체 DELETE). */
export const RESET_TABLES = names(table => table.onSeason === 'purge');
/** 시즌 초기화가 따로 한 문장으로 비우는 표(결제 기록이 아니라 목록에서 분리해 둔 것). */
export const SEASON_CLEAR_TABLES = names(table => table.onSeason === 'clear');
/** 시즌 초기화가 행은 남기고 값만 되돌리는 표. */
export const SEASON_RESET_TABLES = names(table => table.onSeason === 'reset');
/** 시즌 초기화가 건드리지 않는 표. */
export const SEASON_KEPT_TABLES = names(table => table.onSeason === 'keep');

/** DB 이관이 복사하는 표 — `scripts/migrate-turso-db.mjs`의 `TABLES`. */
export const MIGRATION_TABLES = names(table => table.migrate === 'required' || table.migrate === 'optional');
/** 이관에서 "소스에 없으면 건너뛰는" 표 — `OPTIONAL_TABLES`. */
export const OPTIONAL_TABLES = names(table => table.migrate === 'optional');
/** 이관할 때 AUTOINCREMENT 시퀀스를 이어받는 표 — `SEQUENCE_TABLES`. */
export const SEQUENCE_TABLES = names(table => table.sequence === true);

/** 계정에 매달리지 않는 전역 표(귀속 축이 `global`). */
export const GLOBAL_TABLES = names(table => table.owner === 'global');
/** 아이템 스펙·위치를 들고 있는 표. */
export const ITEM_TABLES = names(table => table.owner === 'item');

/**
 * 공통코드 표(작업 260) — 계정·캐릭터에 귀속되지 않는 **전역 사전 표**다.
 *
 * `djrpg_` 접두어를 쓰지 않아 위 `TABLES`(이관·탈퇴·시즌 대상)에는 넣지 않는다. 표를 만드는 것은
 * `schema()`이고(`server/db/schema.mjs` → `commonCodeStatements`), 값을 채우는 것은 시드
 * (`scripts/sync-common-codes.mjs`)다 — DB 행을 복사하는 이관 대상이 아니라 **코드에서 다시 만드는** 표다.
 * 그래도 이름을 여기 적어 두는 이유는 "서버가 만드는 표"를 한 곳에서 찾을 수 있게 하기 위해서다.
 */
export const CODE_TABLES = Object.freeze(['common_code_majors', 'common_code_minors']);

/**
 * DDL을 가진 모듈별 표 목록 — 스키마 검사(등록부 ↔ 실제 DDL)에 쓴다.
 * `server/db/schema.mjs`·`server/dungeon-schema.mjs`·`server/world-boss-schema.mjs`가 만드는 표가
 * 여기와 같아야 한다.
 *
 * `duplicated`는 **두 곳에서 같은 DDL을 다시 쓰는 표**다 — 던전 2표는 `server/db/schema.mjs`(기본 스키마)와
 * `server/dungeon-schema.mjs`(던전 API만 도는 경로) 양쪽에서 만들어 진다(작업 209부터의 사실).
 * 합치면 한쪽 경로에서 표가 없을 수 있으므로 지금은 사실을 등록부에 적어 두고, 정리는 후속 단계로 둔다.
 */
export const DDL_TABLES = Object.freeze({
  schema: names(table => table.ddl === 'schema'),
  dungeon: names(table => table.ddl === 'dungeon'),
  'world-boss': names(table => table.ddl === 'world-boss'),
  duplicated: Object.freeze(['djrpg_dungeon_records', 'djrpg_dungeon_attempts'])
});
