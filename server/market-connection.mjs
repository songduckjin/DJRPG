import { client, schema } from './database.mjs';
// Keep one client per warm server instance; concurrent requests share initialization.
export function connectionProvider(create = client, initialize = schema) {
  const ready = new Map();
  return env => {
    const key = env ? `${env.TURSO_DATABASE_URL}\0${env.TURSO_AUTH_TOKEN}` : 'default';
    if (ready.has(key)) return ready.get(key);
    const pending = (async () => {
      const db = create(env);
      try { await initialize(db, env); return db; }
      catch (error) { db.close(); throw error; }
    })().catch(error => { ready.delete(key); throw error; });
    ready.set(key, pending);
    return pending;
  };
}
export const marketConnection = connectionProvider();
