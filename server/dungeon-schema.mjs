// 던전 순위 DDL은 전투·TypeScript 모듈 없이 그대로 가져다 쓸 수 있게 둔다(src/game/store.ts의 DUNGEON_MAX_FLOOR와 같은 값).
export const DUNGEON_MAX_FLOOR = 10;
const schemas = new Map();

export async function dungeonSchema(db, key = db.url ?? db) {
  if (!schemas.has(key)) schemas.set(key, db.batch([
    'CREATE TABLE IF NOT EXISTS djrpg_dungeon_records (account_id TEXT PRIMARY KEY COLLATE NOCASE,name TEXT NOT NULL,cleared_floor INTEGER NOT NULL,cleared_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)',
    'CREATE INDEX IF NOT EXISTS djrpg_dungeon_rank ON djrpg_dungeon_records(cleared_floor DESC, cleared_at, account_id)'
  ], 'write').catch(error => { schemas.delete(key); throw error; }));
  await schemas.get(key);
}
