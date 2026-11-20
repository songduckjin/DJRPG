// Keep the world boss DDL importable without loading combat and TypeScript modules.
const schemas = new Map();
const TABLES = ['djrpg_boss_days', 'djrpg_boss_attempts', 'djrpg_boss_scores', 'djrpg_boss_rewards'];
const DDL = [
  'CREATE TABLE IF NOT EXISTS djrpg_boss_days (day TEXT PRIMARY KEY,max_hp INTEGER NOT NULL,hp INTEGER NOT NULL,ends_at INTEGER NOT NULL,killer TEXT,killed_at INTEGER,settled_at INTEGER)',
  'CREATE TABLE IF NOT EXISTS djrpg_boss_attempts (id TEXT PRIMARY KEY,account_id TEXT NOT NULL COLLATE NOCASE,day TEXT NOT NULL,request_id TEXT NOT NULL,save_json TEXT NOT NULL,started_at INTEGER NOT NULL,dodges_json TEXT NOT NULL,credited INTEGER NOT NULL DEFAULT 0,ended_at INTEGER,UNIQUE(account_id,request_id))',
  'CREATE INDEX IF NOT EXISTS djrpg_boss_attempt_owner ON djrpg_boss_attempts(account_id,day)',
  'CREATE INDEX IF NOT EXISTS djrpg_boss_pending ON djrpg_boss_attempts(day,account_id) WHERE ended_at IS NULL',
  'CREATE TABLE IF NOT EXISTS djrpg_boss_scores (day TEXT NOT NULL,account_id TEXT NOT NULL COLLATE NOCASE,name TEXT NOT NULL,damage INTEGER NOT NULL,joined_at INTEGER NOT NULL,PRIMARY KEY(day,account_id))',
  'CREATE INDEX IF NOT EXISTS djrpg_boss_rank ON djrpg_boss_scores(day,damage DESC,joined_at,account_id)',
  'CREATE TABLE IF NOT EXISTS djrpg_boss_rewards (day TEXT NOT NULL,account_id TEXT NOT NULL COLLATE NOCASE,kind TEXT NOT NULL,PRIMARY KEY(day,account_id,kind))'
];
/** 네 테이블이 이미 만들어져 있는지만 센다 — DDL 실패가 '일시 오류'인지 '스키마 없음'인지 가른다. */
const TABLE_PROBE = `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN (${TABLES.map(() => '?').join(',')})`;

/**
 * 월드보스 테이블 초기화(작업 222).
 *
 * DDL은 전부 `IF NOT EXISTS`라 **한 번 만들어진 뒤에는 아무것도 바꾸지 않는다.** 그런데도 초기화가
 * 일시 오류(연결 재사용·지역 레플리카·BUSY)로 실패하면 요청 전체가 `DB_UNAVAILABLE` 503으로 떨어졌다
 * (`#5666`·`#5729` — 한국 ICN 경로). 그래서 DDL이 실패하면 **네 테이블이 모두 있는지 한 번 확인**하고,
 * 있으면 스키마는 준비된 것으로 보고 넘어간다. 테이블이 없거나 확인조차 안 되면(DB 연결 자체가 죽은
 * 경우) 원래 오류를 그대로 올려 정상 에러 처리한다.
 */
export async function worldBossSchema(db, key = db.url ?? db) {
  if (!schemas.has(key)) schemas.set(key, create(db, key));
  await schemas.get(key);
}

async function create(db, key) {
  try {
    await db.batch(DDL, 'write');
  } catch (error) {
    let ready = 0;
    try { ready = Number((await db.execute({ sql: TABLE_PROBE, args: TABLES })).rows[0]?.n ?? 0); }
    catch { schemas.delete(key); throw error; }
    if (ready !== TABLES.length) { schemas.delete(key); throw error; }
  }
}
