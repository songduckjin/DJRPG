/**
 * DB 연결·스키마 1회 초기화·트랜잭션 (작업 260 — `server/database.mjs` 5분할).
 *
 * 옮긴 것이 목적이므로 동작은 종전과 같다 — 클라이언트 생성 조건(환경변수 없으면 503 `DB_NOT_CONFIGURED`),
 * 프로세스(정확히는 isolate)마다 한 번만 스키마를 만들고 실패하면 다시 시도하는 규칙, 일시 오류 판정,
 * `transaction()`의 commit/rollback/close 순서 모두 그대로다.
 */
import { databaseFactory } from '../database-config.mjs';
import { runtimeEnv } from '../env.mjs';
import { fail } from './errors.mjs';
import {
  addMarketBundleColumns,
  backfillStatements,
  commonCodeStatements,
  marketSortIndexStatements,
  SESSION_COLUMN_STATEMENT,
  tableStatements
} from './schema.mjs';

export const client = (env = runtimeEnv()) => {
  const createClient = databaseFactory();
  if (!createClient || !env?.TURSO_DATABASE_URL || !env?.TURSO_AUTH_TOKEN) fail(503, 'DB_NOT_CONFIGURED', '서버 DB가 설정되지 않았습니다.');
  return createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_DATABASE_AUTH_TOKEN || env.TURSO_AUTH_TOKEN });
};

const initializedSchemas = new Map();

/** 일시 오류(SQLITE_BUSY·레플리카 재연결·네트워크)인가 — 스키마 초기화 재시도 판단에 쓴다. */
export const transientDatabaseError = error => /SQLITE_BUSY|SQLITE_LOCKED|SERVER_ERROR|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|network|timeout|temporarily unavailable|service unavailable/i.test(String(error?.code ?? '') + ' ' + String(error?.message ?? ''));

export async function schema(db, env = runtimeEnv()) {
  const key = db.url ?? env?.TURSO_DATABASE_URL ?? db;
  if (initializedSchemas.has(key)) return initializedSchemas.get(key);
  const statements = [...tableStatements(), ...backfillStatements()];
  // 공통코드 2표(작업 260) — 추가형 DDL이라 기존 표·데이터를 바꾸지 않는다. 1단계에서는 읽는 요청 경로가 없다.
  const extras = [...marketSortIndexStatements(), ...commonCodeStatements()];
  const initialize = async () => {
    await db.execute(statements[0]);
    const sessionColumns = await db.execute("SELECT name FROM pragma_table_info('djrpg_accounts') WHERE name='session_id'");
    if (!sessionColumns.rows.length) {
      try { await db.execute(SESSION_COLUMN_STATEMENT); }
      catch (error) { if (!/duplicate column name/i.test(String(error?.message ?? error))) throw error; }
    }
    // 정렬 인덱스(작업 211)는 같은 배치에 넣는다 — 스키마는 프로세스마다 한 번이면 충분하다.
    let created;
    try { created = await db.batch([...statements.slice(1), ...extras], 'write'); }
    catch (error) {
      // 전송 오류는 바깥 재시도가 맡는다. 그 밖의 실패(인덱스 표현식을 지원하지 않는 DB 등)에서는 인덱스를
      // 빼고 스키마만 다시 만든다 — 인덱스는 속도만 담당하므로 게임이 멈추면 안 된다.
      if (transientDatabaseError(error)) throw error;
      console.error(JSON.stringify({ event: 'market_index_skipped', name: error?.name ?? 'Error', message: String(error?.message ?? error).slice(0, 120) }));
      created = await db.batch([...statements.slice(1), ...commonCodeStatements()], 'write');
    }
    // 기존 DB에는 없는 묶음 등록 열을 더한다(작업 249) — `ADD COLUMN`은 기존 행을 건드리지 않으므로
    // 이미 올라간 매물은 `quantity=1`·`items_json` NULL인 단건 매물로 그대로 남는다.
    await addMarketBundleColumns(db);
    return created;
  };
  const initialized = (async () => {
    try { return await initialize(); }
    catch (error) {
      if (!transientDatabaseError(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, 200));
      return initialize();
    }
  })().catch(error => { initializedSchemas.delete(key); throw error; });
  initializedSchemas.set(key, initialized);
  return initialized;
}

export async function transaction(db, run) {
  const tx = await db.transaction('write');
  try { const result = await run(tx); await tx.commit(); return result; }
  catch (error) { if (!tx.closed) await tx.rollback(); throw error; }
  finally { tx.close(); }
}
