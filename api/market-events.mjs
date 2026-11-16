import { client, schema } from '../server/database.mjs';
export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) return res.status(503).end();
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
      const row = (await db.execute('SELECT COALESCE(MAX(seq),0) AS seq FROM djrpg_market_events')).rows[0];
      res.write(`data: ${JSON.stringify({ seq: Number(row.seq) })}\n\n`);
      await new Promise(resolve => { const done = () => { clearTimeout(timer); res.off('close', done); resolve(); }; const timer = setTimeout(done, 2000); res.once('close', done); });
    }
  } catch { if (!closed) res.write('event: retry\ndata: {}\n\n'); }
  finally { if (!closed) res.end(); db.close(); }
}
