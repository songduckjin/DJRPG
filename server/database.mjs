/**
 * 서버 DB 공용 계약 — **re-export만** 남긴다 (작업 260, `work/djrpg_domain_split_plan.md` PR-4).
 *
 * 예전에는 이 파일 하나(446줄)가 연결·스키마 DDL·행 읽기·아이템 소유권·세이브 쓰기·거래소 인덱스 DDL을
 * 모두 들고 있었다. 서버 16개 모듈이 이 파일을 import하므로 어느 도메인 PR이든 여기를 건드려야 했고,
 * 리뷰 범위가 서버 전체로 번졌다.
 *
 * 이제 실제 구현은 `server/db/`의 다섯 파일에 있고, 이 파일은 **기존 import 경로와 시그니처를 그대로
 * 유지하기 위한 파사드**다.
 *
 *   server/db/errors.mjs      ApiError · fail
 *   server/db/schema.mjs      DDL 문장 · 거래소 정렬식/인덱스 · 묶음 열 보정
 *   server/db/connection.mjs  client · schema(1회 초기화) · transaction · 일시 오류 판정
 *   server/db/accounts.mjs    accountQuery · account · decodeAccount · 세션 · assertRevision
 *   server/db/items.mjs       가방 40칸 규칙 · reconcileItems · healStaleLoadItems
 *   server/db/save.mjs        MAX_FLOOR · validateSave · writeSave
 *
 * **바꾸면 안 되는 계약**(분리 전후 동일):
 *  - `writeSave`·`reconcileItems`·`assertRevision`의 시그니처와 에러 코드
 *    (`INVALID_SAVE`·`INVALID_ITEM`·`INVALID_GOLD`·`ITEM_CONFLICT`·`SAVE_CONFLICT`·`CHARACTER_CONFLICT`)
 *  - 단일 세션: `assertSession`/`assertSessionId` → `401 SESSION_REPLACED`
 *  - `account()`·`accountQuery()`의 SELECT 결과 모양(골드는 `shared_gold`에서 온다)
 *  - `schema()`가 프로세스마다 한 번만 도는 것과 실패 시 재시도 규칙
 *
 * 시그니처를 바꾸지 않았는지는 `tests/db-module-split.test.mjs`가 고정한다.
 */
export { ApiError, fail } from './db/errors.mjs';
export { client, schema, transaction } from './db/connection.mjs';
export { marketStatExpression, MARKET_SORT_STATS, marketSortIndexStatements } from './db/schema.mjs';
export {
  accountQuery, account, decodeAccount, sessionReplaced,
  assertSession, assertSessionId, assignSession, assertRevision
} from './db/accounts.mjs';
export {
  EQUIPMENT_BAG_LIMIT, countedBagItems, bagCapacityLimit,
  inventoryOwnerQuery, reconcileItems, healStaleLoadItems
} from './db/items.mjs';
export { MAX_FLOOR, validateSave, writeSave } from './db/save.mjs';
