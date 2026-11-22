import './ts-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { schema } from '../server/database.mjs';
import { removeTempDbDirectory } from './helpers/temp-db.mjs';
import {
  CODE_VERSION_KEY, assertCode, codeMeta, codeName, codesOf, codeOf, commonCodeStatements,
  ensureCommonCodes, hasCode, isActiveCode, loadCommonCodes, majors, replacedBy,
  resetCommonCodeCache, seedHash, seedView, syncCommonCodes
} from '../server/core/commonCodes.mjs';
import { COMMON_CODE_MAJORS, COMMON_CODES, SEED_VERSION, seededCodes } from '../server/core/commonCodes.seed.mjs';

/**
 * 공통코드 기반(작업 260, 1단계).
 *
 * 이 단계의 목표는 **동작 불변**이다. 그래서 검사도 "표·시드·캐시·검증이 서로 맞는가"에 집중한다.
 *  - 사전: 메이저마다 코드가 있고, 코드 중복이 없고, 스킬 33종이 `server/skill-ids.mjs`와 같다
 *  - 시드 동기화: UPSERT(삭제 없음), 두 번째 실행은 변경 0·`code_version` 유지
 *  - 캐시: DB를 읽어 적재하고, TTL 안에서는 `code_version`조차 다시 읽지 않는다
 *  - 검증: 없는 코드·단종 코드는 `400 INVALID_CODE`, 단종은 `allowInactive`로만 통과
 */

/** DB 호출을 세는 얇은 프록시 — 캐시가 실제로 DB 읽기를 줄였는지 확인한다. */
function counting(db) {
  const stats = { versionReads: 0, execute: 0, batch: 0 };
  const proxy = new Proxy(db, {
    get(target, property) {
      if (property === 'execute') {
        return query => {
          stats.execute += 1;
          // readVersion만 `djrpg_meta`를 읽는다(값은 인자로 넘어간다).
          const sql = String(typeof query === 'string' ? query : query?.sql ?? '');
          if (sql.includes('djrpg_meta')) stats.versionReads += 1;
          return target.execute(query);
        };
      }
      if (property === 'batch') return (statements, mode) => { stats.batch += 1; return target.batch(statements, mode); };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
  return { proxy, stats };
}

async function freshDb(name) {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-common-codes-'));
  const url = `file:${join(directory, `${name}.db`)}`;
  const db = createClient({ url });
  await schema(db, { TURSO_DATABASE_URL: url });
  return { db, url, directory };
}

test('사전은 메이저마다 코드가 있고 중복이 없다', async () => {
  assert.ok(COMMON_CODE_MAJORS.length >= 30, `메이저 ${COMMON_CODE_MAJORS.length}개`);
  const majorCodes = COMMON_CODE_MAJORS.map(major => major.major);
  assert.equal(new Set(majorCodes).size, majorCodes.length, '메이저 코드 중복');
  for (const major of COMMON_CODE_MAJORS) {
    const codes = COMMON_CODES[major.major] ?? [];
    assert.ok(codes.length > 0, `${major.major}: 코드가 없다`);
    const values = codes.map(code => code.code);
    assert.equal(new Set(values.map(value => value.toLowerCase())).size, values.length, `${major.major}: 코드 중복`);
    for (const code of codes) {
      assert.equal(typeof code.name, 'string', `${major.major}.${code.code}: 표시 이름`);
      assert.ok(code.name.length > 0);
      if (code.status === 'REPLACED') assert.ok(code.replacedBy, `${major.major}.${code.code}: REPLACED는 후속 코드가 필수다`);
      if (code.status && code.status !== 'DEPRECATED' && code.status !== 'REPLACED') assert.fail(`${major.major}.${code.code}: 알 수 없는 상태 ${code.status}`);
    }
  }
  // 스킬은 클라이언트 `src/game/skills.ts`의 목록과 같아야 한다 — 스킬을 더하면 두 곳을 함께 고친다.
  // (파트 B: 스킬북 폐지로 서버 `skill-ids.mjs`가 사라져 사전이 목록을 직접 갖는다.)
  const skillCodes = CODE(COMMON_CODES, 'SKILL').map(code => code.code);
  const catalog = await import('../src/game/skills.ts');
  assert.deepEqual(skillCodes, [...catalog.allSkillIds, ...catalog.allPassiveIds]);
  assert.equal(skillCodes.length, 33);
  for (const skillId of skillCodes) assert.equal(CODE(COMMON_CODES, 'SKILL').find(code => code.code === skillId).name, (catalog.skills[skillId] ?? catalog.passives[skillId]).name);
  // 시드 행은 메이저 순서·코드 순서를 보존한다(정렬이 흔들리면 화면 순서가 바뀐다).
  const rows = seededCodes();
  assert.equal(rows.length, COMMON_CODE_MAJORS.reduce((sum, major) => sum + (COMMON_CODES[major.major] ?? []).length, 0));
  assert.equal(rows[0].majorCode, COMMON_CODE_MAJORS[0].major);
  assert.equal(SEED_VERSION, 1);
  assert.match(seedHash(), /^[0-9a-f]{64}$/);
});

function CODE(dictionary, major) {
  return dictionary[major] ?? [];
}

test('DB 없이도 시드 사전으로 검증한다(기본 캐시)', () => {
  resetCommonCodeCache();
  assert.equal(seedView().source, 'seed');
  assert.equal(hasCode('JOB', 'warrior'), true);
  assert.equal(isActiveCode('JOB', 'warrior'), true);
  assert.equal(codeName('JOB', 'mage'), '마법사');
  assert.equal(codeName('JOB', 'unknown'), 'unknown', '없는 코드는 코드를 그대로 돌려준다');
  assert.equal(assertCode('EQUIP_SLOT', 'weapon'), 'weapon');
  assert.throws(() => assertCode('JOB', 'paladin'), error => error.status === 400 && error.code === 'INVALID_CODE');
  assert.throws(() => assertCode('NOT_A_MAJOR', 'x'), error => error.status === 400 && error.code === 'INVALID_CODE');
  assert.equal(codeMeta('ITEM_GRADE', 'legendary').color, '#ff2d2d');
  assert.deepEqual(codesOf('GENDER').map(code => code.code), ['male', 'female']);
  assert.equal(majors().length, COMMON_CODE_MAJORS.length);
  assert.equal(replacedBy('JOB', 'warrior'), null);
});

test('시드를 DB에 올리고, 두 번째 실행은 아무것도 바꾸지 않는다', async () => {
  resetCommonCodeCache();
  const { db, directory } = await freshDb('sync');
  try {
    const first = await syncCommonCodes(db);
    assert.equal(first.dryRun, false);
    assert.ok(first.changed.length > 0, '첫 실행은 모든 코드가 새로 들어간다');
    assert.equal(first.version, 1, '첫 동기화가 code_version을 1로 올린다');
    assert.equal(first.hash, seedHash());
    const version = (await db.execute({ sql: 'SELECT value FROM djrpg_meta WHERE key=?', args: [CODE_VERSION_KEY] })).rows[0];
    assert.equal(Number(version.value), 1);
    const counts = (await db.execute(`SELECT (SELECT COUNT(*) FROM common_code_majors) AS majors, (SELECT COUNT(*) FROM common_code_minors) AS minors`)).rows[0];
    assert.equal(Number(counts.majors), COMMON_CODE_MAJORS.length);
    assert.equal(Number(counts.minors), seededCodes().length);
    const majorsRow = (await db.execute({ sql: 'SELECT seed_hash, seed_version, synced_at, is_system FROM common_code_majors WHERE major_code=?', args: ['JOB'] })).rows[0];
    assert.equal(majorsRow.seed_hash, seedHash());
    assert.equal(Number(majorsRow.seed_version), SEED_VERSION);
    assert.ok(Number(majorsRow.synced_at) > 0);
    assert.equal(Number(majorsRow.is_system), 1);

    // 멱등: 두 번째 실행은 변경 0, 버전 유지, 행 수 그대로(삭제 없음).
    const second = await syncCommonCodes(db);
    assert.deepEqual(second.changed, []);
    assert.equal(second.version, 1);
    const again = (await db.execute(`SELECT (SELECT COUNT(*) FROM common_code_majors) AS majors, (SELECT COUNT(*) FROM common_code_minors) AS minors`)).rows[0];
    assert.equal(Number(again.majors), COMMON_CODE_MAJORS.length);
    assert.equal(Number(again.minors), seededCodes().length);

    // dry-run은 쓰지 않는다.
    const before = Number((await db.execute({ sql: 'SELECT value FROM djrpg_meta WHERE key=?', args: [CODE_VERSION_KEY] })).rows[0].value);
    const dry = await syncCommonCodes(db, { dryRun: true });
    assert.equal(dry.dryRun, true);
    assert.equal(Number((await db.execute({ sql: 'SELECT value FROM djrpg_meta WHERE key=?', args: [CODE_VERSION_KEY] })).rows[0].value), before);
  } finally {
    await db.close();
    await removeTempDbDirectory(directory);
  }
});

test('적재한 캐시로 검증하고, TTL 안에서는 code_version을 다시 읽지 않는다', async () => {
  resetCommonCodeCache();
  const { db, directory } = await freshDb('cache');
  try {
    await syncCommonCodes(db);
    resetCommonCodeCache();
    const { proxy, stats } = counting(db);
    const view = await ensureCommonCodes(proxy);
    assert.equal(view.source, 'db');
    assert.equal(stats.versionReads, 1, '적재할 때 버전을 한 번 읽는다');
    assert.equal(assertCode('SKILL', 'fireBolt'), 'fireBolt');
    assert.equal(codeName('SKILL', 'fireBolt'), '파이어 볼트');
    assert.equal(codeOf('SKILL', 'fireBolt').parentCode, 'mage', '스킬의 부모는 직업 코드다(2단 계층)');

    // TTL 안(같은 now)에서는 버전도 다시 읽지 않는다 — 요청당 코드 관련 DB 읽기 0행.
    const readsBefore = stats.versionReads;
    await ensureCommonCodes(proxy, { now: Date.now() + 10 });
    await ensureCommonCodes(proxy, { now: Date.now() + 20 });
    assert.equal(stats.versionReads, readsBefore, 'TTL 안에서 버전을 다시 읽었다');

    // TTL이 지나면 한 번만 확인하고, 버전이 같으면 다시 적재하지 않는다.
    const loaded = await ensureCommonCodes(proxy, { now: Date.now() + 120_000 });
    assert.equal(loaded.version, 1);
    assert.equal(stats.versionReads, readsBefore + 1);
  } finally {
    await db.close();
    await removeTempDbDirectory(directory);
  }
});

test('단종·대체 코드는 신규 검증에서 막고, 조회는 허용한다', async () => {
  resetCommonCodeCache();
  const { db, directory } = await freshDb('deprecated');
  try {
    await syncCommonCodes(db);
    // 단종(DEPRECATED)과 대체(REPLACED)를 넣는다 — DB가 CHECK로 후속 코드 없는 REPLACED를 막는다.
    await db.execute({ sql: `INSERT INTO common_code_minors(major_code,minor_code,name,status_code,is_active,created_at,updated_at) VALUES ('JOB','paladin','팔라딘','DEPRECATED',1,?,?)`, args: [Date.now(), Date.now()] });
    await db.execute({ sql: `INSERT INTO common_code_minors(major_code,minor_code,name,status_code,replaced_by_code,is_active,created_at,updated_at) VALUES ('JOB','knight','기사','REPLACED','warrior',1,?,?)`, args: [Date.now(), Date.now()] });
    await assert.rejects(
      () => db.execute({ sql: `INSERT INTO common_code_minors(major_code,minor_code,name,status_code,is_active,created_at,updated_at) VALUES ('JOB','squire','종자','REPLACED',1,?,?)`, args: [Date.now(), Date.now()] }),
      /CHECK|constraint/i, 'REPLACED는 후속 코드가 없으면 INSERT가 막혀야 한다');
    await loadCommonCodes(db);
    assert.equal(hasCode('JOB', 'paladin'), true, '단종 코드도 조회·기존 데이터에는 유효하다');
    assert.equal(isActiveCode('JOB', 'paladin'), false);
    assert.throws(() => assertCode('JOB', 'paladin'), error => error.code === 'INVALID_CODE' && /단종/.test(error.message));
    assert.throws(() => assertCode('JOB', 'knight'), /warrior/, '대체 코드는 후속 코드를 안내한다');
    assert.equal(assertCode('JOB', 'paladin', { allowInactive: true }), 'paladin');
    assert.equal(replacedBy('JOB', 'knight'), 'warrior');
  } finally {
    await db.close();
    await removeTempDbDirectory(directory);
  }
});

test('코드 표 DDL은 추가형이다(두 번 실행해도 오류가 없다)', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-common-codes-ddl-'));
  const url = `file:${join(directory, 'ddl.db')}`;
  const db = createClient({ url });
  try {
    await db.batch(commonCodeStatements(), 'write');
    await db.batch(commonCodeStatements(), 'write');
    const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).rows.map(row => String(row.name));
    assert.ok(tables.includes('common_code_majors'));
    assert.ok(tables.includes('common_code_minors'));
  } finally {
    await db.close();
    await removeTempDbDirectory(directory);
  }
});
