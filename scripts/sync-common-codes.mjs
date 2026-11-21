#!/usr/bin/env node
/**
 * 공통코드 시드 동기화 (작업 260 — `work/djrpg_db_schema_plan.md` §7-4).
 *
 * `server/core/commonCodes.seed.mjs`(사전 원본)를 DB의 `common_code_majors`/`common_code_minors`에
 * **UPSERT**한다. 삭제는 하지 않는다 — 단종은 `status_code='DEPRECATED'`/`REPLACED`로 남기고, 이미 지급된
 * 원장·보유 아이템이 코드를 계속 참조할 수 있어야 한다.
 *
 * 바뀐 것이 하나라도 있으면 `djrpg_meta.code_version`을 1 올린다. 서버는 이 값을 최대 60초에 한 번만 읽고
 * 코드 사전을 메모리에 캐시하므로(`server/core/commonCodes.mjs` `ensureCommonCodes`), 요청당 코드 관련
 * DB 읽기는 0행이다.
 *
 * 사용법
 *   TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… node scripts/sync-common-codes.mjs
 *   … --dry-run     아무 것도 쓰지 않고 무엇이 바뀔지만 출력
 *   … --force       바뀐 것이 없어도 code_version을 올린다(캐시를 강제로 비울 때)
 *
 * 1단계에서는 이 스크립트를 **돌려도 게임 동작이 바뀌지 않는다** — 엔드포인트가 아직 코드 상수를 쓴다.
 */
import { createClient } from '@libsql/client';
import { pathToFileURL } from 'node:url';
import { SEED_VERSION } from '../server/core/commonCodes.seed.mjs';
import { CODE_VERSION_KEY, seedHash, syncCommonCodes } from '../server/core/commonCodes.mjs';

const HELP = `DJRPG 공통코드 시드 동기화

사용법:
  node scripts/sync-common-codes.mjs [--dry-run] [--force]

환경변수:
  TURSO_DATABASE_URL     대상 DB URL (로컬은 file:경로)
  TURSO_AUTH_TOKEN       대상 DB 토큰 (file: URL이면 생략 가능)

옵션:
  --dry-run              아무 것도 쓰지 않고 바뀔 목록만 출력
  --force                바뀐 것이 없어도 code_version을 올린다
  -h, --help             이 도움말

안전 규칙:
  - 코드 행을 **지우지 않는다**(UPSERT만). 단종은 status_code(DEPRECATED/REPLACED)로 남긴다.
  - 표가 없으면 추가형 DDL(CREATE TABLE IF NOT EXISTS)로 만든 뒤 채운다 — 기존 27표는 건드리지 않는다.
  - 두 번째 실행부터는 바뀐 것이 없으면 code_version을 올리지 않는다(멱등).
`;

const isLocalUrl = url => /^file:/i.test(url);

function parseOptions(argv) {
  const options = { dryRun: false, force: false, help: false };
  for (const arg of argv) {
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`알 수 없는 옵션입니다: ${arg}`);
  }
  return options;
}

async function run(options, env = process.env) {
  const url = String(env.TURSO_DATABASE_URL ?? '').trim();
  const token = String(env.TURSO_AUTH_TOKEN ?? '').trim();
  if (!url) throw new Error('TURSO_DATABASE_URL이 없습니다.');
  if (!isLocalUrl(url) && !token) throw new Error('TURSO_AUTH_TOKEN이 없습니다 (file: URL이면 생략 가능).');
  const db = token ? createClient({ url, authToken: token }) : createClient({ url });
  try {
    console.log(`공통코드 시드 v${SEED_VERSION} · hash ${seedHash().slice(0, 12)}…`);
    if (options.dryRun) {
      const result = await syncCommonCodes(db, { dryRun: true });
      console.log(`\n[--dry-run] 메이저 ${result.majors} · 코드 ${result.minors} · 바뀔 항목 ${result.changed.length}`);
      for (const item of result.changed.slice(0, 40)) console.log(`  ~ ${item}`);
      if (result.changed.length > 40) console.log(`  … 외 ${result.changed.length - 40}건`);
      console.log('\n--dry-run: 아무 것도 쓰지 않았습니다.');
      return 0;
    }
    const result = await syncCommonCodes(db);
    const bumped = result.changed.length > 0;
    if (options.force && !bumped) {
      await db.execute({
        sql: "INSERT INTO djrpg_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        args: [CODE_VERSION_KEY, String(result.version + 1)]
      });
      console.log(`\n--force: 바뀐 것이 없지만 ${CODE_VERSION_KEY}를 ${result.version + 1}로 올렸습니다.`);
    }
    console.log(`\n[동기화] 메이저 ${result.majors} · 코드 ${result.minors} · 변경 ${result.changed.length}건 · ${CODE_VERSION_KEY}=${bumped || options.force ? (bumped ? result.version : result.version + 1) : result.version}`);
    if (bumped) for (const item of result.changed.slice(0, 40)) console.log(`  ~ ${item}`);
    if (bumped && result.changed.length > 40) console.log(`  … 외 ${result.changed.length - 40}건`);
    return 0;
  } finally {
    try { await db.close(); } catch {}
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
      console.error(`\n✗ 동기화 실패: ${error?.message ?? error}`);
      process.exitCode = 1;
    });
}
