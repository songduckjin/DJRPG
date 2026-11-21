#!/usr/bin/env node
// DJRPG 전용 Turso DB 이관 스크립트.
// 공용 DB(puzzle-mates)에서 djrpg_* 테이블만 새 DB로 복사한다.
// 소스 DB에는 SELECT만 실행한다(어떤 쓰기도 하지 않는다). 사용법: node scripts/migrate-turso-db.mjs --dry-run
import { createClient } from '@libsql/client';
import { pathToFileURL } from 'node:url';
import { schema } from '../server/database.mjs';
import { worldBossSchema } from '../server/world-boss-schema.mjs';
import { isRegistered, MIGRATION_TABLES, OPTIONAL_TABLES as REGISTERED_OPTIONAL_TABLES, SEQUENCE_TABLES as REGISTERED_SEQUENCE_TABLES } from '../server/tables.mjs';

/**
 * 이관 목록은 **`server/tables.mjs` 등록부에서 만든다**(작업 260).
 *
 * 예전에는 이 파일이 목록을 직접 들고 있었고, 상점 5표(`djrpg_shop_*`)가 빠진 것을 아무도 몰랐다 —
 * 소스에 상점 표가 있으면 "이관 목록에 없는 테이블" 검사에 걸려 이관이 아예 중단됐고, 검사를 풀면
 * 다이아 지갑·결제 원장·구매 슬롯이 빈 표로 시작했다. 이제 표를 새로 만들면 등록부에만 더하면 된다.
 * (테스트 호환을 위해 `TABLES`/`OPTIONAL_TABLES` 이름은 그대로 export한다.)
 */
export const TABLES = [...MIGRATION_TABLES];
// 최신 스키마에만 있는 표 — 소스에 없으면 0행으로 보고 건너뛴다.
export const OPTIONAL_TABLES = [...REGISTERED_OPTIONAL_TABLES];
// AUTOINCREMENT 시퀀스를 이어받아야 하는 테이블.
const SEQUENCE_TABLES = [...REGISTERED_SEQUENCE_TABLES];
const DEFAULT_CHUNK = 500;
const HELP = `DJRPG Turso DB 이관 (djrpg_* 테이블만 새 DB로 복사)

사용법:
  node scripts/migrate-turso-db.mjs --dry-run     # 소스 행 수만 확인 (아무 것도 쓰지 않음)
  node scripts/migrate-turso-db.mjs               # 빈 타겟 DB로 실제 이관
  node scripts/migrate-turso-db.mjs --force       # 타겟의 djrpg_* 행을 비우고 다시 이관

환경변수:
  SOURCE_TURSO_DATABASE_URL   기존 공용 DB URL (puzzle-mates). 로컬 테스트는 file:경로
  SOURCE_TURSO_AUTH_TOKEN     기존 DB 토큰 (file: URL이면 생략 가능)
  TARGET_TURSO_DATABASE_URL   새 DJRPG 전용 DB URL
  TARGET_TURSO_AUTH_TOKEN     새 DB 토큰 (file: URL이면 생략 가능)

옵션:
  --dry-run                   소스 djrpg_* 테이블 ${TABLES.length}개의 행 수만 출력하고 종료
  --force                     타겟 DB의 djrpg_* ${TABLES.length}개 테이블 행을 모두 지우고 다시 복사
  --chunk-size=N              한 번에 복사할 행 수 (기본 ${DEFAULT_CHUNK}, 1~5000)
  -h, --help                  이 도움말

안전 규칙:
  - 소스 DB는 읽기 전용 트랜잭션으로만 조회한다(puzzle-mates 테이블은 건드리지 않는다).
  - 타겟에 이미 행이 있으면 --force 없이는 중단한다.
  - 예상하지 못한 djrpg_* 테이블이 소스에 있으면 중단한다.
  - 복사 후 ${TABLES.length}개 테이블 COUNT(*)가 소스·타겟에서 일치하는지 검사하고, 하나라도 다르면 실패한다.
  - djrpg_meta·djrpg_announcements·상점 5표는 예전 소스에 없으면 0행으로 보고 건너뛴다(있으면 함께 옮긴다).
`;

const isLocalUrl = url => /^file:/i.test(url);
const quote = name => `"${String(name).replaceAll('"', '""')}"`;
const number = value => (typeof value === 'bigint' ? Number(value) : Number(value ?? 0)).toLocaleString('ko-KR');
const totalOf = counts => TABLES.reduce((sum, table) => sum + (counts[table] ?? 0), 0);

class UsageError extends Error {}

function parseOptions(argv) {
  const options = { dryRun: false, force: false, chunk: DEFAULT_CHUNK, help: false };
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--chunk-size=')) {
      const chunk = Number(arg.slice('--chunk-size='.length));
      if (!Number.isInteger(chunk) || chunk < 1 || chunk > 5000) throw new UsageError('--chunk-size는 1~5000 사이 정수여야 합니다.');
      options.chunk = chunk;
    } else throw new UsageError(`알 수 없는 옵션입니다: ${arg}`);
  }
  return options;
}

function readConnection(label, url, token, { required }) {
  if (!url) throw new UsageError(`${label} URL이 없습니다. 환경변수 ${label}_TURSO_DATABASE_URL을 지정하세요.`);
  if (!required) return null;
  if (!isLocalUrl(url) && !token) throw new UsageError(`${label} 토큰이 없습니다. 환경변수 ${label}_TURSO_AUTH_TOKEN을 지정하세요. (file: URL이면 생략 가능)`);
  return token ? createClient({ url, authToken: token }) : createClient({ url });
}

const countRows = async (client, table) => Number((await client.execute(`SELECT COUNT(*) AS n FROM ${quote(table)}`)).rows[0].n);

async function tableNames(client) {
  const rows = (await client.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows;
  return new Set(rows.map(row => String(row.name)));
}

async function guestCount(snapshot) {
  const row = (await snapshot.execute("SELECT COUNT(*) AS n FROM djrpg_accounts WHERE password_hash='guest'")).rows[0];
  return Number(row?.n ?? 0);
}

// 소스 djrpg_* 테이블을 rowid 오름차순으로 chunk개씩 읽어 타겟에 넣는다.
async function copyTable(snapshot, target, table, chunk) {
  const first = (await snapshot.execute(`SELECT MIN(rowid) AS rid FROM ${quote(table)}`)).rows[0]?.rid;
  if (first === null || first === undefined) return 0;
  let cursor = Number(first) - 1;
  let copied = 0;
  while (true) {
    const page = await snapshot.execute({
      sql: `SELECT rowid AS __rid, * FROM ${quote(table)} WHERE rowid > ? ORDER BY rowid LIMIT ?`,
      args: [cursor, chunk]
    });
    if (!page.rows.length) break;
    const columns = page.columns.filter(column => column !== '__rid');
    if (!columns.length) break;
    const statement = `INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
    const writes = page.rows.map(row => ({ sql: statement, args: columns.map(column => row[column]) }));
    await target.batch(writes, 'write');
    cursor = Number(page.rows[page.rows.length - 1].__rid);
    copied += page.rows.length;
  }
  return copied;
}

// AUTOINCREMENT 테이블의 sqlite_sequence 값을 소스와 복사본 중 큰 값으로 맞춘다(seq 재사용 방지).
async function syncSequence(snapshot, target, table) {
  let sourceSeq = 0;
  try {
    sourceSeq = Number((await snapshot.execute({ sql: 'SELECT seq FROM sqlite_sequence WHERE name=?', args: [table] })).rows[0]?.seq ?? 0);
  } catch { sourceSeq = 0; }
  const copied = Number((await target.execute(`SELECT COALESCE(MAX(seq),0) AS n FROM ${quote(table)}`)).rows[0].n);
  const seq = Math.max(sourceSeq, copied);
  await target.batch([
    { sql: 'DELETE FROM sqlite_sequence WHERE name=?', args: [table] },
    { sql: 'INSERT INTO sqlite_sequence(name,seq) VALUES (?,?)', args: [table, seq] }
  ], 'write');
  return seq;
}

// 앱 스키마에 없는 컬럼이 소스에만 있으면(스키마 드리프트) 복사를 중단한다 — 컬럼을 조용히 빠뜨리지 않는다.
async function assertColumns(snapshot, target) {
  for (const table of TABLES) {
    const targetColumns = new Set((await target.execute(`PRAGMA table_info(${quote(table)})`)).rows.map(row => String(row.name)));
    let sourceColumns;
    try { sourceColumns = (await snapshot.execute(`SELECT * FROM ${quote(table)} LIMIT 0`)).columns; } catch { continue; }
    const extra = sourceColumns.filter(column => !targetColumns.has(column));
    if (extra.length) throw new Error(`${table}: 소스에만 있는 컬럼이 있습니다(${extra.join(', ')}). 앱 스키마(server/database.mjs의 schema())와 소스 DB가 다릅니다 — 복사를 중단합니다.`);
  }
}

async function run(options, env = process.env) {
  const sourceUrl = String(env.SOURCE_TURSO_DATABASE_URL ?? '').trim();
  const targetUrl = String(env.TARGET_TURSO_DATABASE_URL ?? '').trim();
  const sourceToken = String(env.SOURCE_TURSO_AUTH_TOKEN ?? '').trim();
  const targetToken = String(env.TARGET_TURSO_AUTH_TOKEN ?? '').trim();

  const source = readConnection('SOURCE', sourceUrl, sourceToken, { required: true });
  let target;
  let snapshot;
  try {
    snapshot = await source.transaction('read');
    console.log('소스 DB 연결 및 스키마 확인');
    const existing = await tableNames(snapshot);
    const missing = TABLES.filter(table => !existing.has(table) && !OPTIONAL_TABLES.includes(table));
    if (missing.length) throw new Error(`소스 DB에 다음 테이블이 없습니다: ${missing.join(', ')}`);
    const unexpected = [...existing].filter(table => table.startsWith('djrpg_') && !isRegistered(table));
    if (unexpected.length) throw new Error(`이관 목록에 없는 DJRPG 테이블이 있습니다: ${unexpected.join(', ')}\n표 등록부(server/tables.mjs)에 없는 표입니다 — 새 표라면 등록부에 추가하고 migrate 정책을 정하세요.`);

    const sourceCounts = {};
    for (const table of TABLES) sourceCounts[table] = existing.has(table) ? await countRows(snapshot, table) : 0;
    const guests = await guestCount(snapshot);

    if (options.dryRun) {
      console.log('\n[소스 djrpg_* 테이블 행 수]');
      for (const table of TABLES) console.log(`  ${table.padEnd(30)} ${number(sourceCounts[table]).padStart(12)}`);
      console.log(`  ${'합계'.padEnd(30)} ${number(totalOf(sourceCounts)).padStart(12)}`);
      console.log(`\n게스트 계정: ${number(guests)}개 (게스트는 토큰이 없으면 다시 로그인할 수 없습니다)`);
      console.log('\n--dry-run: 소스만 읽었고 아무 것도 쓰지 않았습니다.');
      return 0;
    }

    if (targetUrl.replace(/\/+$/, '') === sourceUrl.replace(/\/+$/, '')) {
      throw new Error('소스와 타겟 URL이 같습니다. 새 DJRPG 전용 DB의 URL을 TARGET_TURSO_DATABASE_URL로 지정하세요.');
    }
    target = readConnection('TARGET', targetUrl, targetToken, { required: true });
    console.log('타겟 DB 연결 및 스키마 생성');
    await schema(target, { TURSO_DATABASE_URL: targetUrl });
    await worldBossSchema(target, targetUrl);
    await assertColumns(snapshot, target);

    const occupied = [];
    for (const table of TABLES) {
      const rows = await countRows(target, table);
      if (rows > 0) occupied.push(`${table}(${number(rows)})`);
    }
    if (occupied.length && !options.force) {
      throw new Error(`타겟 DB에 이미 행이 있습니다: ${occupied.join(', ')}\n빈 DB를 쓰거나, 정말 덮어쓰려면 --force를 붙여 다시 실행하세요. (--force는 타겟의 djrpg_* ${TABLES.length}개 테이블 행을 지우고 다시 복사합니다)`);
    }
    if (occupied.length) {
      console.log(`\n--force: 타겟의 djrpg_* ${TABLES.length}개 테이블 행을 지우고 다시 복사합니다 (${occupied.join(', ')})`);
      await target.batch(TABLES.map(table => ({ sql: `DELETE FROM ${quote(table)}` })), 'write');
    }

    console.log(`\n[복사] ${TABLES.length}개 테이블, ${number(totalOf(sourceCounts))}행`);
    const started = Date.now();
    for (const table of TABLES) {
      const copied = existing.has(table) ? await copyTable(snapshot, target, table, options.chunk) : 0;
      console.log(`  ${table.padEnd(30)} ${number(copied).padStart(12)}행 복사${existing.has(table) ? '' : ' (소스에 없음 — 건너뜀)'}`);
    }
    for (const table of SEQUENCE_TABLES) {
      const seq = await syncSequence(snapshot, target, table);
      console.log(`  ${table} NEXT seq = ${number(seq)}`);
    }

    console.log('\n[검증] COUNT(*) 소스 / 타겟');
    const mismatches = [];
    for (const table of TABLES) {
      const sourceRows = sourceCounts[table];
      const targetRows = await countRows(target, table);
      const ok = sourceRows === targetRows;
      if (!ok) mismatches.push(`${table}: 소스 ${sourceRows} ≠ 타겟 ${targetRows}`);
      console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${table.padEnd(30)} ${number(sourceRows).padStart(10)} / ${number(targetRows).padStart(10)}`);
    }
    if (mismatches.length) throw new Error(`행 수가 일치하지 않습니다:\n${mismatches.join('\n')}`);

    console.log(`\n이관 완료: ${TABLES.length}개 테이블, ${number(totalOf(sourceCounts))}행, ${((Date.now() - started) / 1000).toFixed(1)}초`);
    console.log('소스 DB는 읽기만 했습니다(puzzle-mates 테이블 무변경). 다음 단계는 docs/TURSO_DB_GUIDE.md 3단계(환경변수·재배포)입니다.');
    return 0;
  } finally {
    if (snapshot && !snapshot.closed) { try { await snapshot.rollback(); } catch {} }
    try { await source.close(); } catch {}
    if (target) { try { await target.close(); } catch {} }
  }
}

if (import.meta.url === pathToFileURL(String(process.argv[1] ?? '.')).href) {
  let options;
  try {
    options = parseOptions(process.argv.slice(2));
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
  if (options.help) {
    console.log(HELP);
    process.exit(0);
  }
  run(options)
    .then(code => { process.exitCode = code ?? 0; })
    .catch(error => {
      console.error(`\n✗ 이관 실패: ${error instanceof UsageError ? error.message : error?.message ?? error}`);
      if (!(error instanceof UsageError)) console.error('  타겟이 새 빈 DB면 그대로 다시 실행할 수 있고, 일부만 복사된 상태면 --force로 다시 실행하세요.');
      process.exitCode = 1;
    });
}
