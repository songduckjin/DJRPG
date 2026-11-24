// 무한 방어전 순위·도전 DDL (2026-11-24).
//
// `djrpg_defense_records`는 **서버가 검증한 최고 도달 스테이지**이고, 세이브의 `defenseStage`는
// 이 값 +1까지만 저장된다(`server/db/save.mjs` `defenseStageCap`). `djrpg_defense_attempts`는 진행 중
// 도전 한 줄(판 번호·시드·시작 시각)이다. 표 등록은 `server/tables.mjs`가 단일 등록부다.
//
// 던전 표와 같은 이유로 기본 스키마(`server/db/schema.mjs`)에서도 같은 DDL을 한 번 더 만든다 —
// 계정 저장 경로(`accountQuery`)가 이 표를 LEFT JOIN 하므로, 방어전 API를 한 번도 부르지 않은 계정의
// 로그인·저장에서도 표가 있어야 한다.
export const DEFENSE_MAX_STAGE = 999;
const schemas = new Map();

export async function defenseSchema(db, key = db.url ?? db) {
  if (!schemas.has(key)) schemas.set(key, initialize(db).catch(error => { schemas.delete(key); throw error; }));
  await schemas.get(key);
}

async function initialize(db) {
  await db.batch([...DEFENSE_TABLE_STATEMENTS], 'write');
}

/** 기본 스키마·방어전 DDL이 함께 쓰는 문장 — 두 곳이 같은 표를 만들도록 문자열을 한 곳에 둔다. */
export const DEFENSE_TABLE_STATEMENTS = Object.freeze([
  `CREATE TABLE IF NOT EXISTS djrpg_defense_records (account_id TEXT PRIMARY KEY COLLATE NOCASE,name TEXT NOT NULL,job TEXT NOT NULL DEFAULT 'warrior',level INTEGER NOT NULL DEFAULT 1,best_stage INTEGER NOT NULL,reached_at INTEGER NOT NULL,run_seconds INTEGER NOT NULL DEFAULT 0,verified INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS djrpg_defense_rank ON djrpg_defense_records(best_stage DESC, reached_at, account_id)',
  'CREATE TABLE IF NOT EXISTS djrpg_defense_attempts (account_id TEXT PRIMARY KEY COLLATE NOCASE,run_id TEXT NOT NULL,seed INTEGER NOT NULL,started_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)'
]);
