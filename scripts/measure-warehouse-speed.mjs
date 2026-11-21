#!/usr/bin/env node
/**
 * 공용창고 보관·회수 속도 실측 (작업 258, PR #258의 측정 스크립트 계승).
 *
 * 사용자 제보 "창고 템 보관하고 꺼낼때 시간이 너무 오래걸려"의 원인을 **숫자로** 확인한다.
 * 임시 로컬 SQLite DB를 만들고 `server/endpoints/warehouse.mjs`를 그대로 불러 40개 일괄 보관·회수를
 * 실제로 수행하면서, 그 요청 하나가 **Turso(HTTP)에 몇 번 왕복하는지**를 센다.
 *
 *   node scripts/measure-warehouse-speed.mjs                 # 40개, 왕복 25ms 모델, 5회 중앙값
 *   node scripts/measure-warehouse-speed.mjs --items=1 --latency=40 --reps=7
 *
 * ① `왕복` = `execute()`·`batch()` 호출 수. Turso 호스팅 DB에서 한 번의 호출은 HTTP 1회다.
 * ② `모델 ms` = 각 왕복에 `--latency`(기본 25ms)를 주입하고 잰 실제 경과 시간의 중앙값.
 *    운영 Turso의 왕복 지연은 네트워크에 따라 다르므로 **모델**이다(로컬 파일 DB 자체는 0ms).
 * ③ `세이브 병합` = 작업 258의 경로(화면 세이브를 창고 요청에 함께 보내 저장+이동을 한 번에),
 *    `세이브 별도` = 예전 클라이언트처럼 저장(`/api/account save`)을 먼저 보낸 뒤 창고 요청을 보내던 경로다.
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { schema } from '../server/database.mjs';
import { tokenFor } from '../server/auth.mjs';
import { accountEndpoint } from '../server/endpoints/account.mjs';
import { warehouseEndpoint } from '../server/endpoints/warehouse.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const [key, value] = argument.replace(/^--/, '').split('=');
  return [key, value ?? 'true'];
}));
const itemCount = Math.max(1, Math.min(40, Number(args.items ?? 40)));
const latency = Math.max(0, Math.min(500, Number(args.latency ?? 25)));
const reps = Math.max(1, Math.min(21, Number(args.reps ?? 5)));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** libSQL 클라이언트/트랜잭션을 감싸 `execute`·`batch` 호출(왕복)과 문장 수를 센다. */
function counting(client, counter, delayMs) {
  const tick = async statements => { counter.roundtrips++; counter.statements += statements; if (delayMs) await sleep(delayMs); };
  const wrapTx = tx => ({
    execute: async statement => { await tick(1); return tx.execute(statement); },
    batch: async (statements, mode) => { await tick(Array.isArray(statements) ? statements.length : 0); return tx.batch(statements, mode); },
    commit: async () => tx.commit(), rollback: async () => tx.rollback(), close: () => tx.close(), get closed() { return tx.closed; }
  });
  return {
    execute: async statement => { await tick(1); return client.execute(statement); },
    batch: async (statements, mode) => { await tick(Array.isArray(statements) ? statements.length : 0); return client.batch(statements, mode); },
    transaction: async mode => wrapTx(await client.transaction(mode)),
    // 엔드포인트가 요청 끝에 `close()`를 부른다 — 측정에서는 연결을 계속 쓰므로 닫지 않는다.
    close: async () => {}
  };
}

const weapon = (id, index) => ({ id, name: `강철 쯔바이핸드${index}`, slot: 'weapon', rarity: 'rare', stats: { attack: 20 + index } });

/** 가방 itemCount개를 든 계정 하나 — 같은 아이템을 보관↔회수로 오가며 요청을 잰다. */
async function harness() {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-warehouse-speed-'));
  const url = `file:${join(directory, 'speed.db')}`;
  const env = { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: 'local-warehouse-speed' };
  const db = createClient({ url });
  await schema(db, env);
  const bag = Array.from({ length: itemCount }, (_, index) => weapon(`item-${index}`, index));
  const save = {
    version: 1, accountId: 'speed', name: '전사', gender: 'male', job: 'warrior', auto: true, autoClimb: true,
    level: 9, exp: 25, gold: 500, floor: 4, maxFloor: 4, floorKills: 3, kills: 50, health: 80,
    equipment: {}, equipmentCollection: [], bag, tutorial: 3, stones: 0, skillPoints: 7,
    lastActiveAt: Date.now(), learned: [], passives: [], quickSlots: [null, null, null], skillLevels: {}
  };
  await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: ['speed', 'test-hash', JSON.stringify(save), new Date().toISOString()] });
  const token = tokenFor('speed', env);
  const counter = { roundtrips: 0, statements: 0 };
  const call = async (body, delayMs, endpoint = warehouseEndpoint) => {
    // 요청마다 왕복 지연을 바꿀 수 있게 클라이언트를 새로 감싼다(연결·스키마 캐시는 그대로 재사용).
    const wrapped = counting(db, counter, delayMs);
    const request = {
      method: 'POST',
      headers: { get: name => (name.toLowerCase() === 'authorization' ? `Bearer ${token}` : null) },
      json: async () => body
    };
    return endpoint(request, { env, createDbClient: () => wrapped });
  };
  // 캐릭터 행·소유권 기록 만들기 — 창고는 소유권 표(`djrpg_item_owners`)를 확인한다.
  await call({ action: 'load' }, 0, accountEndpoint);
  await call({ action: 'list' });
  await db.batch(bag.flatMap(item => [
    { sql: 'INSERT OR REPLACE INTO djrpg_item_owners VALUES (?,?,?,?)', args: [item.id, 'speed', 'inventory', JSON.stringify(item)] },
    { sql: 'INSERT OR REPLACE INTO djrpg_character_item_owners VALUES (?,?,?)', args: [item.id, 'speed', 1] }
  ]));
  /** 지금 서버가 들고 있는 캐릭터 세이브 — 진행 세이브를 함께 보내는 요청(작업 258)의 본문이다. 캐릭터 행에는 금화가 없다. */
  const liveSave = async () => ({ ...JSON.parse((await db.execute({ sql: 'SELECT save_json FROM djrpg_characters WHERE account_id=? AND slot=1', args: ['speed'] })).rows[0].save_json), gold: 500 });
  const revision = async () => Number(((await db.execute({ sql: 'SELECT revision FROM djrpg_save_versions WHERE account_id=?', args: ['speed'] })).rows[0] ?? { revision: 0 }).revision ?? 0);
  const reset = () => { counter.roundtrips = 0; counter.statements = 0; };
  const close = async () => { await db.close(); };
  return { call, counter, reset, revision, liveSave, bag, close, db };
}

/** 요청 하나를 재고, 그 요청이 쓴 DB 왕복 수를 함께 남긴다. */
async function timed(h, delayMs, body, endpoint) {
  const revision = await h.revision();
  h.reset();
  const started = performance.now();
  const response = await h.call({ ...body, revision, requestId: randomUUID(), characterSlot: 1 }, delayMs, endpoint);
  const ms = performance.now() - started;
  const roundtrips = h.counter.roundtrips, statements = h.counter.statements;
  const payload = await response.json();
  if (response.status !== 200) throw new Error(`${body.action} 실패: ${response.status} ${JSON.stringify(payload)}`);
  return { ms, roundtrips, statements, moved: payload.moved?.length ?? 0 };
}

const h = await harness();
const ids = h.bag.map(item => item.id);
const inBag = async () => (await h.liveSave()).bag.some(item => item.id === ids[0]);
/** 매 측정을 같은 시작 상태에서 — 보관은 아이템이 전부 가방에, 회수는 전부 창고에 있게 만든다(준비는 측정에 넣지 않는다). */
const prepare = async action => { if (action === 'deposit' ? !await inBag() : await inBag()) await timed(h, 0, { action: action === 'deposit' ? 'withdraw' : 'deposit', itemIds: ids }); };
/** 작업 258 클라이언트 경로 — 화면 세이브를 함께 실어 보내 이동+저장이 한 요청·한 트랜잭션. */
const merged = async (action, delayMs) => { await prepare(action); return timed(h, delayMs, { action, itemIds: ids, progress: await h.liveSave() }); };
/** 예전 경로 — 저장(`/api/account save`)을 먼저 왕복한 뒤 창고 요청. 두 요청의 왕복을 합쳐 센다. */
const separate = async (action, delayMs) => {
  await prepare(action);
  h.reset();
  const started = performance.now();
  const saveResponse = await h.call({ action: 'save', save: { ...await h.liveSave() }, revision: await h.revision(), requestId: randomUUID(), characterSlot: 1 }, delayMs, accountEndpoint);
  const saveBody = await saveResponse.json();
  if (!saveBody.ok) throw new Error(`save 실패: ${saveResponse.status} ${JSON.stringify(saveBody)}`);
  const saveRoundtrips = h.counter.roundtrips;
  const moveResponse = await h.call({ action, itemIds: ids, revision: saveBody.revision, requestId: randomUUID(), characterSlot: 1 }, delayMs);
  const payload = await moveResponse.json();
  if (moveResponse.status !== 200) throw new Error(`${action} 실패: ${moveResponse.status} ${JSON.stringify(payload)}`);
  return { ms: performance.now() - started, roundtrips: h.counter.roundtrips, statements: h.counter.statements, split: `${saveRoundtrips}+${h.counter.roundtrips - saveRoundtrips}` };
};
const row = (label, entries, local) => [label, entries[0].roundtrips, entries[0].statements, median(entries.map(entry => entry.ms)).toFixed(0), median(local.map(entry => entry.ms)).toFixed(1)];

try {
  const mergedRuns = { deposit: [], withdraw: [] }, separateRuns = { deposit: [], withdraw: [] };
  const mergedLocal = { deposit: [], withdraw: [] }, separateLocal = { deposit: [], withdraw: [] };
  const saves = [], savesLocal = [];
  for (let index = 0; index < reps; index++) {
    mergedRuns.deposit.push(await merged('deposit', latency)); mergedRuns.withdraw.push(await merged('withdraw', latency));
    mergedLocal.deposit.push(await merged('deposit', 0)); mergedLocal.withdraw.push(await merged('withdraw', 0));
    separateRuns.deposit.push(await separate('deposit', latency)); separateRuns.withdraw.push(await separate('withdraw', latency));
    separateLocal.deposit.push(await separate('deposit', 0)); separateLocal.withdraw.push(await separate('withdraw', 0));
    saves.push(await timed(h, latency, { action: 'save', save: { ...await h.liveSave(), kills: 50 + index } }, accountEndpoint));
    savesLocal.push(await timed(h, 0, { action: 'save', save: { ...await h.liveSave(), kills: 80 + index } }, accountEndpoint));
  }
  const list = await timed(h, 0, { action: 'list' });
  const rows = [
    row(`보관 ${itemCount}개 (세이브 병합 · 작업 258)`, mergedRuns.deposit, mergedLocal.deposit),
    row(`회수 ${itemCount}개 (세이브 병합 · 작업 258)`, mergedRuns.withdraw, mergedLocal.withdraw),
    row(`보관 ${itemCount}개 (세이브 별도 · 예전)`, separateRuns.deposit, separateLocal.deposit),
    row(`회수 ${itemCount}개 (세이브 별도 · 예전)`, separateRuns.withdraw, separateLocal.withdraw),
    row('저장(save) 1회', saves, savesLocal),
    ['목록(list)', list.roundtrips, list.statements, (list.roundtrips * latency).toFixed(0), list.ms.toFixed(1)]
  ];
  const header = ['단계', '왕복', '문장', `모델 ms(왕복 ${latency}ms)`, '로컬 ms'];
  const widths = header.map((cell, index) => Math.max(cell.length, ...rows.map(entry => String(entry[index]).length)));
  const pad = entry => entry.map((cell, index) => String(cell).padEnd(widths[index])).join(' | ');
  console.log([`${itemCount}개 · ${reps}회 중앙값`, pad(header), widths.map(width => '-'.repeat(width)).join('-+-'), ...rows.map(pad)].join('\n'));
  console.log(`\n이동 1회 = DB 왕복 ${mergedRuns.deposit[0].roundtrips}회(보관)·${mergedRuns.withdraw[0].roundtrips}회(회수).`);
  console.log(`예전 흐름은 저장 ${saves[0].roundtrips} + 이동 ${separateRuns.deposit[0].split} 로 ${separateRuns.deposit[0].roundtrips}회(보관)였다 — 이동 한 번에 ${separateRuns.deposit[0].roundtrips - mergedRuns.deposit[0].roundtrips}회를 덜 기다린다.`);
} finally {
  await h.close();
}
