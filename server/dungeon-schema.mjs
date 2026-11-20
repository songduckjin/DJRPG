// 던전 순위·도전 DDL은 전투·TypeScript 모듈 없이 그대로 가져다 쓸 수 있게 둔다(src/game/store.ts의 DUNGEON_MAX_FLOOR와 같은 값).
// `djrpg_dungeon_attempts`는 클리어 검증용 도전 한 줄이다(작업 209: 시작 시각, 작업 211: 시드). 기본 스키마
// (`server/database.mjs`)도 같은 표를 만들지만, 던전 API만 도는 경로에서도 표가 있도록 여기서 한 번 더 보장한다.
export const DUNGEON_MAX_FLOOR = 10;
const schemas = new Map();

export async function dungeonSchema(db, key = db.url ?? db) {
  if (!schemas.has(key)) schemas.set(key, initialize(db).catch(error => { schemas.delete(key); throw error; }));
  await schemas.get(key);
}

async function initialize(db) {
  await db.batch([
    'CREATE TABLE IF NOT EXISTS djrpg_dungeon_records (account_id TEXT PRIMARY KEY COLLATE NOCASE,name TEXT NOT NULL,cleared_floor INTEGER NOT NULL,cleared_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)',
    'CREATE INDEX IF NOT EXISTS djrpg_dungeon_rank ON djrpg_dungeon_records(cleared_floor DESC, cleared_at, account_id)',
    'CREATE TABLE IF NOT EXISTS djrpg_dungeon_attempts (account_id TEXT PRIMARY KEY COLLATE NOCASE,floor INTEGER NOT NULL,started_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,seed INTEGER)'
  ], 'write');
  // 작업 209에서 만든 표에는 `seed`(작업 211) 열이 없다 — 이미 있으면(duplicate column) 넘어간다.
  try { await db.execute('ALTER TABLE djrpg_dungeon_attempts ADD COLUMN seed INTEGER'); }
  catch (error) { if (!/duplicate column name/i.test(String(error?.message ?? error))) throw error; }
}
