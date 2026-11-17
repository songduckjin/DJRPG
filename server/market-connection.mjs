import { client, schema } from './database.mjs';
// Keep one client per warm server instance; concurrent requests share initialization.
export function connectionProvider(create = client, initialize = schema) {
  let ready;
  return () => ready ??= (async () => {
    const db = create();
    try { await initialize(db); return db; }
    catch (error) { db.close(); throw error; }
  })().catch(error => { ready = undefined; throw error; });
}
export const marketConnection = connectionProvider();
