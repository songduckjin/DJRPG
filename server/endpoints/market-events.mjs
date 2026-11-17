import { client, schema } from '../database.mjs';
import { runtimeEnv } from '../env.mjs';
import { latestSeq } from '../market-events.mjs';

export async function marketEventsEndpoint(request, { env = runtimeEnv(), createDbClient } = {}) {
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return new Response(null, { status: 503 });
  let db;
  try {
    db = createDbClient ? createDbClient(env) : client(env);
    await schema(db, env);
  } catch {
    db?.close();
    return new Response(null, { status: 503 });
  }
  const encoder = new TextEncoder();
  let timer, wake;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    wake?.();
    db.close();
  };
  const stream = new ReadableStream({
    async start(controller) {
      const started = Date.now();
      try {
        while (!closed && !request.signal?.aborted && Date.now() - started < 45_000) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ seq: await latestSeq(db) })}\n\n`));
          await new Promise(resolve => { wake = resolve; timer = setTimeout(resolve, 1000); });
          wake = undefined;
        }
      } catch { if (!closed && !request.signal?.aborted) controller.enqueue(encoder.encode('event: retry\ndata: {}\n\n')); }
      finally { if (!closed) controller.close(); close(); }
    },
    cancel: close
  });
  request.signal?.addEventListener('abort', close, { once: true });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' } });
}
