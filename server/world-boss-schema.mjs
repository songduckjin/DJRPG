// Keep the world boss DDL importable without loading combat and TypeScript modules.
const schemas = new Map();

export async function worldBossSchema(db, key = db.url ?? db) {
  if (!schemas.has(key)) schemas.set(key, db.batch([
    'CREATE TABLE IF NOT EXISTS djrpg_boss_days (day TEXT PRIMARY KEY,max_hp INTEGER NOT NULL,hp INTEGER NOT NULL,ends_at INTEGER NOT NULL,killer TEXT,killed_at INTEGER,settled_at INTEGER)',
    'CREATE TABLE IF NOT EXISTS djrpg_boss_attempts (id TEXT PRIMARY KEY,account_id TEXT NOT NULL COLLATE NOCASE,day TEXT NOT NULL,request_id TEXT NOT NULL,save_json TEXT NOT NULL,started_at INTEGER NOT NULL,dodges_json TEXT NOT NULL,credited INTEGER NOT NULL DEFAULT 0,ended_at INTEGER,UNIQUE(account_id,request_id))',
    'CREATE INDEX IF NOT EXISTS djrpg_boss_attempt_owner ON djrpg_boss_attempts(account_id,day)',
    'CREATE INDEX IF NOT EXISTS djrpg_boss_pending ON djrpg_boss_attempts(day,account_id) WHERE ended_at IS NULL',
    'CREATE TABLE IF NOT EXISTS djrpg_boss_scores (day TEXT NOT NULL,account_id TEXT NOT NULL COLLATE NOCASE,name TEXT NOT NULL,damage INTEGER NOT NULL,joined_at INTEGER NOT NULL,PRIMARY KEY(day,account_id))',
    'CREATE INDEX IF NOT EXISTS djrpg_boss_rank ON djrpg_boss_scores(day,damage DESC,joined_at,account_id)',
    'CREATE TABLE IF NOT EXISTS djrpg_boss_rewards (day TEXT NOT NULL,account_id TEXT NOT NULL COLLATE NOCASE,kind TEXT NOT NULL,PRIMARY KEY(day,account_id,kind))'
  ], 'write').catch(error => { schemas.delete(key); throw error; }));
  await schemas.get(key);
}
