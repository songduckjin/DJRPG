#!/usr/bin/env node
/**
 * 100명 동시 접속 격리 부하 테스트 (작업 209).
 *
 * **운영 DB가 아니라 임시 로컬 SQLite 파일**에서만 돈다. 실제 엔드포인트 모듈(`server/endpoints/*`)을
 * 그대로 호출하므로 라우팅·검증·트랜잭션·직렬화까지 실제 코드 경로를 지나간다.
 *
 *   node scripts/load-test-100.mjs                       # 기본: 100명 · 10초 · 저장 위주
 *   node scripts/load-test-100.mjs --players=100 --seconds=20 --save-ms=1000
 *   node scripts/load-test-100.mjs --players=100 --mix=trade
 *
 * 읽는 법
 *  - `ok`는 2xx, `busy`는 로컬 SQLite 쓰기 잠금(SQLITE_BUSY)으로 밀린 횟수다. 로컬 파일 DB는 쓰기
 *    트랜잭션을 한 번에 하나만 허용하므로 운영 Turso와 같은 "쓰기 한 줄" 상황이 되고, 클라이언트처럼
 *    잠시 뒤 다시 보낸다(재시도 포함 지연을 그대로 잰다).
 *  - 이 수치는 **이 환경(임시 파일 DB·한 프로세스)** 의 측정값이다. 운영 Turso·Cloudflare의 p95를
 *    대신하는 값이 아니므로, 여기서 나온 지연을 운영 성능으로 단정하지 않는다.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { configureDatabase } from '../server/database-config.mjs';
import { accountEndpoint } from '../server/endpoints/account.mjs';
import { marketEndpoint } from '../server/endpoints/market.mjs';
import { warehouseEndpoint } from '../server/endpoints/warehouse.mjs';

configureDatabase(createClient);

const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const [key, value] = argument.replace(/^--/, '').split('=');
  return [key, value ?? 'true'];
}));
const players = Math.max(1, Math.min(500, Number(args.players ?? 100)));
const seconds = Math.max(1, Math.min(120, Number(args.seconds ?? 10)));
const saveMs = Math.max(100, Number(args['save-ms'] ?? 1000));
const mix = args.mix === 'trade' ? 'trade' : 'save';
const poolSize = Math.max(1, Math.min(32, Number(args.pool ?? 8)));
const directory = await mkdtemp(join(tmpdir(), 'djrpg-load-'));
const url = `file:${join(directory, 'load.db')}`;
const env = { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: 'load-test-key' };
const pool = Array.from({ length: poolSize }, () => createClient({ url }));
let poolIndex = 0;
const nextClient = () => { const client = pool[poolIndex % pool.length]; poolIndex++; return client; };
// 로컬 SQLite는 쓰기 트랜잭션을 하나만 허용한다 — 운영에서 503을 받은 클라이언트가 다시 보내는 것과 같다.
const borrowed = client => ({ execute: (...a) => client.execute(...a), batch: (...a) => client.batch(...a), transaction: (...a) => client.transaction(...a), close: async () => {} });
const post = (path, body, token) => new Request(`https://load.test/api/${path}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });
const busy = error => /SQLITE_BUSY|database is locked/i.test(String(error?.code ?? '') + String(error?.message ?? ''));
const call = async (endpoint, path, body, token) => {
  let attempt = 0;
  for (;;) {
    try { return await endpoint(post(path, body, token), { env, createDbClient: () => borrowed(nextClient()) }); }
    catch (error) { if (!busy(error) || attempt++ > 60) throw error; await new Promise(resolve => setTimeout(resolve, 5 + Math.random() * 20)); }
  }
};

const latencies = [];
const serverMs = [];
let failureSample = '';
const statuses = new Map();
const startedAt = Date.now();
async function player(index) {
  const loginId = `loadplayer${index}`;
  const registration = await call(accountEndpoint, 'account', { action: 'register', loginId, password: 'load-test-password', gender: 'male' });
  const account = await registration.json();
  if (registration.status !== 200) { statuses.set(`register:${registration.status}`, (statuses.get(`register:${registration.status}`) ?? 0) + 1); return; }
  let revision = account.revision;
  // 실제 클라이언트는 `parseSave`로 정규화한 세이브를 보낸다 — 여기서도 같은 기본값을 채운다.
  let save = { bossKills: 0, playSeconds: 0, stones: 0, skillPoints: 0, exp: 0, equipmentCollection: [], bag: [], equipment: {}, ...account.save };
  const deadline = startedAt + seconds * 1000;
  let tick = 0;
  while (Date.now() < deadline) {
    const at = performance.now();
    let status = 0;
    try {
      if (mix === 'trade' && tick % 5 === 0) {
        const response = await call(marketEndpoint, 'market', { action: 'list' }, account.token);
        status = response.status;
        const timing = response.headers.get('Server-Timing');
        if (timing) { const total = /total;dur=([\d.]+)/.exec(timing); if (total) serverMs.push(Number(total[1])); }
      } else {
        save = { ...save, gold: save.gold + 3, kills: save.kills + 1, playSeconds: save.playSeconds + 1 };
        const response = await call(accountEndpoint, 'account', { action: 'save', revision, characterSlot: 1, requestId: randomUUID(), save }, account.token);
        status = response.status;
        // 서버가 붙인 `Server-Timing`(작업 209 계측)에서 요청 처리 시간을 함께 모은다.
        const timing = response.headers.get('Server-Timing');
        if (timing) { const total = /total;dur=([\d.]+)/.exec(timing); if (total) serverMs.push(Number(total[1])); }
        if (response.status === 200) revision = (await response.json()).revision;
        else if (!failureSample) failureSample = await response.clone().text();
      }
    } catch (error) { status = busy(error) ? 'busy' : 0; }
    latencies.push(performance.now() - at);
    statuses.set(status, (statuses.get(status) ?? 0) + 1);
    tick++;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, saveMs - (performance.now() - at))));
  }
}

const percentile = (values, ratio) => { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))]; };
try {
  console.log(`[격리 부하 테스트] 동시 접속 ${players}명 · ${seconds}초 · 저장 주기 ${saveMs}ms · DB 연결 ${poolSize}개 · 임시 파일 DB`);
  await Promise.all(Array.from({ length: players }, (_, index) => player(index + 1)));
  const total = latencies.reduce((sum, value) => sum + value, 0);
  const failures = [...statuses].filter(([status]) => status !== 200).reduce((sum, [, count]) => sum + count, 0);
  console.log(`요청 ${latencies.length}건 · 성공 ${latencies.length - failures} · 실패 ${failures} (오류율 ${(failures / Math.max(1, latencies.length) * 100).toFixed(2)}%)`);
  console.log(`지연 p50 ${percentile(latencies, .5).toFixed(1)}ms · p95 ${percentile(latencies, .95).toFixed(1)}ms · p99 ${percentile(latencies, .99).toFixed(1)}ms · 평균 ${(total / Math.max(1, latencies.length)).toFixed(1)}ms · 최대 ${Math.max(0, ...latencies).toFixed(1)}ms`);
  if (serverMs.length) console.log(`서버 처리(Server-Timing total) p50 ${percentile(serverMs, .5).toFixed(2)}ms · p95 ${percentile(serverMs, .95).toFixed(2)}ms · p99 ${percentile(serverMs, .99).toFixed(2)}ms`);
  console.log(`처리량 ${(latencies.length / seconds).toFixed(1)} req/s · 상태별 ${JSON.stringify(Object.fromEntries([...statuses].map(([key, value]) => [String(key), value])))}`);
  if (failureSample) console.log(`첫 실패 응답: ${failureSample.slice(0, 300)}`);
  console.log('참고: 로컬 파일 DB는 쓰기를 한 줄로 세운다(SQLITE_BUSY 재시도 포함). 이 값은 운영 Turso·Cloudflare p95가 아니다.');
} finally {
  await Promise.all(pool.map(client => Promise.resolve(client.close()).catch(() => {})));
  await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
}
