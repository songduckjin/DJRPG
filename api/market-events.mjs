import { client, schema } from '../server/database.mjs';
import { createClient } from '@libsql/client';
import { configureDatabase } from '../server/database-config.mjs';
import { envValue } from '../server/env.mjs';
import { latestSeq } from '../server/market-events.mjs';
configureDatabase(createClient);
export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!envValue('TURSO_DATABASE_URL') || !envValue('TURSO_AUTH_TOKEN')) return res.status(503).end();
  const db = client();
  try { await schema(db); } catch { return res.status(503).end(); }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  let closed = false;
  res.on('close', () => { closed = true; });
  const started = Date.now();
  try {
    while (!closed && Date.now() - started < 45_000) {
      // Only a public change counter is streamed. No credentials or private trade data in URLs.
      res.write(`data: ${JSON.stringify({ seq: await latestSeq(db) })}\n\n`);
      await new Promise(resolve => { const done = () => { clearTimeout(timer); res.off('close', done); resolve(); }; const timer = setTimeout(done, 1000); res.once('close', done); });
    }
  } catch { if (!closed) res.write('event: retry\ndata: {}\n\n'); }
  finally { if (!closed) res.end(); db.close(); }
}
