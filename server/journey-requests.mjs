/**
 * 여정(우편·보상·업적) 멱등 요청 표 — 거래소 요청 표(`djrpg_market_requests`)와 분리한다(작업 260 · 설계서 PR-5).
 *
 * 예전에는 `server/journey.mjs`가 우편 수령의 응답을 **거래소** 요청 표에 적었다. 그래서 우편 재확인이
 * 거래소 요청 행과 섞였고(이름도 도메인과 달랐다), 표를 정리·보존·이관하는 쪽(탈퇴·시즌 초기화·이관 스크립트)이
 * 두 도메인을 함께 떠안았다. 새 요청은 이 표에만 적는다.
 *
 * 한 릴리스 동안은 **읽을 때 거래소 표도 함께 본다** — 이 배포 직전에 나간 요청(구번들·`/api/market` 경로)의
 * 응답이 아직 그쪽에 남아 있을 수 있고, 그 요청을 다시 보내 보상이 두 번 들어가면 안 되기 때문이다.
 * 구번들 호환이 끝나면 `legacyJourneyRequestRead`를 지운다.
 */

export const JOURNEY_REQUEST_TABLE = 'djrpg_journey_requests';

/** 스키마 초기화(`server/database.mjs`의 `schema()`)가 다른 표와 함께 실행하는 DDL. */
export const journeyRequestTableDDL = `CREATE TABLE IF NOT EXISTS ${JOURNEY_REQUEST_TABLE} (account_id TEXT NOT NULL COLLATE NOCASE, request_id TEXT NOT NULL, response_json TEXT NOT NULL, PRIMARY KEY(account_id, request_id))`;

/** 이 요청 ID로 이미 처리한 응답을 찾는 읽기 문장 — 새 표가 먼저, 구 표(거래소)가 다음이다. */
export const journeyRequestReads = (id, requestId) => [
  { sql: `SELECT response_json FROM ${JOURNEY_REQUEST_TABLE} WHERE account_id=? AND request_id=?`, args: [id, requestId] },
  legacyJourneyRequestRead(id, requestId)
];

/** 구번들·구경로가 남긴 응답(거래소 요청 표) — 다음 릴리스에서 뺀다. */
export const legacyJourneyRequestRead = (id, requestId) => ({
  sql: 'SELECT response_json FROM djrpg_market_requests WHERE account_id=? AND request_id=?',
  args: [id, requestId]
});

/** 재요청이 같은 결과를 받도록 응답을 남긴다 — 보상·세이브 쓰기와 같은 트랜잭션 문장 목록에 넣는다. */
export const journeyRequestReceipt = (id, requestId, response) => ({
  sql: `INSERT INTO ${JOURNEY_REQUEST_TABLE} (account_id, request_id, response_json) VALUES (?,?,?)`,
  args: [id, requestId, response]
});
