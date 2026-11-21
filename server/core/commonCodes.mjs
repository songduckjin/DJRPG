/**
 * 공통코드(메이저/마이너) 기반 — 표·시드·메모리 캐시·검증 유틸 (작업 260, 1단계).
 *
 * `work/djrpg_db_schema_plan.md` §2.4·§7-4의 1단계다. 목표는 **동작을 바꾸지 않고 기반만 놓는 것**이다.
 *  - 표: `common_code_majors`(대분류 1행) ──< `common_code_minors`(코드값 1행). `CREATE TABLE IF NOT EXISTS`만
 *    쓰는 추가형 DDL이라 기존 27표와 데이터에는 아무 영향이 없다(표 이름에 `djrpg_` 접두어를 쓰지 않는 것도
 *    의도다 — 목표 v2 스키마의 이름과 같게 두어 나중에 이름을 바꾸지 않게 한다).
 *  - 시드: `server/core/commonCodes.seed.mjs`가 원본이고, `scripts/sync-common-codes.mjs`가 DB에 UPSERT한다.
 *  - 캐시: isolate마다 한 번 적재해 요청당 코드 관련 DB 읽기를 0행으로 유지한다. `code_version`이 바뀌면
 *    다시 적재한다(최대 60초에 한 번만 버전을 확인한다).
 *  - 검증: `assertCode(major, code)`가 캐시만 보고 판정하고, 실패하면 `400 INVALID_CODE`를 던진다.
 *
 * **1단계에서는 어떤 엔드포인트도 이 모듈을 호출하지 않는다.** 지금 서버는 여전히 코드 상수
 * (`server/skill-ids.mjs` 등)로 검증하고, 이 모듈은 표·시드·캐시·검증 수단을 준비만 해 둔다.
 * 실제 검증 연결(dual-write → 읽기 역전)은 다음 단계에서 한다 — 그래야 지금 배포가 게임 동작을 바꾸지 않는다.
 */
import { createHash } from 'node:crypto';
import { fail } from '../db/errors.mjs';
import { COMMON_CODE_MAJORS, SEED_VERSION, seededCodes } from './commonCodes.seed.mjs';

/** 메이저 표 이름. */
export const CODE_MAJOR_TABLE = 'common_code_majors';
/** 마이너 표 이름. */
export const CODE_MINOR_TABLE = 'common_code_minors';
/**
 * 코드 사전 버전을 적는 키.
 * 목표 v2 스키마는 `server_meta`로 옮기지만, 1단계에서는 기존 전역 키/값 표(`djrpg_meta`)를 그대로 쓴다 —
 * 표를 새로 만들면 시즌 epoch 같은 기존 값과 두 곳으로 갈라지기 때문이다. `server_meta`로 옮길 때
 * 이 키 하나만 복사하면 된다.
 */
export const CODE_VERSION_KEY = 'code_version';
/** 코드 버전 확인 주기 — 요청마다 읽지 않기 위한 상한(계획 §7-4). */
export const CODE_VERSION_TTL_MS = 60_000;

/**
 * 공통코드 2표의 DDL(추가형). v2 스키마 원문(`work/djrpg_db_schema_v2.sql` A절)과 같은 정의를 쓰되
 * `IF NOT EXISTS`만 더했다. CHECK은 단종 코드에 후속 코드를 강제한다.
 */
export function commonCodeStatements() {
  return [
    // 코드 버전을 적는 기존 전역 키/값 표(`season_epoch`도 여기 있다). 새 DB에서 이 스크립트만 돌려도
    // 버전을 기록할 수 있도록 함께 보장한다 — `CREATE TABLE IF NOT EXISTS`라 기존 표는 그대로다.
    'CREATE TABLE IF NOT EXISTS djrpg_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    `CREATE TABLE IF NOT EXISTS ${CODE_MAJOR_TABLE} (
      major_code     TEXT PRIMARY KEY COLLATE NOCASE,
      name           TEXT NOT NULL,
      description    TEXT,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
      is_system      INTEGER NOT NULL DEFAULT 1 CHECK (is_system IN (0,1)),
      schema_version INTEGER NOT NULL DEFAULT 1,
      seed_version   INTEGER NOT NULL DEFAULT 0,
      seed_hash      TEXT,
      synced_at      INTEGER,
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ${CODE_MINOR_TABLE} (
      major_code       TEXT NOT NULL COLLATE NOCASE REFERENCES ${CODE_MAJOR_TABLE}(major_code) ON UPDATE CASCADE,
      minor_code       TEXT NOT NULL COLLATE NOCASE,
      name             TEXT NOT NULL,
      parent_code      TEXT,
      sort_order       INTEGER NOT NULL DEFAULT 0,
      is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
      is_system        INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
      status_code      TEXT NOT NULL DEFAULT 'ACTIVE',
      replaced_by_code TEXT,
      meta_json        TEXT,
      created_at       INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL,
      PRIMARY KEY (major_code, minor_code),
      CHECK (status_code <> 'REPLACED' OR replaced_by_code IS NOT NULL)
    )`,
    `CREATE INDEX IF NOT EXISTS common_code_minors_active ON ${CODE_MINOR_TABLE}(major_code, is_active, sort_order)`,
    `CREATE INDEX IF NOT EXISTS common_code_minors_parent ON ${CODE_MINOR_TABLE}(major_code, parent_code)`
  ];
}

/** 사전의 결정적 해시 — 시드가 바뀌었는지 비교하는 값(행 순서·키 순서에 흔들리지 않는다). */
export function seedHash() {
  const payload = {
    seedVersion: SEED_VERSION,
    majors: COMMON_CODE_MAJORS.map(major => [major.major, major.name, major.description ?? '']),
    minors: seededCodes().map(row => [row.majorCode, row.minorCode, row.name, row.parentCode ?? '', row.sortOrder, row.status, row.replacedBy ?? '', row.meta ?? null])
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

const key = value => String(value ?? '').toLowerCase();

/** 사전(또는 DB 행)으로 조회용 뷰를 만든다. */
function makeView(rows, majors, { source, version, hash } = {}) {
  const majorMap = new Map();
  for (const major of majors) {
    majorMap.set(key(major.majorCode), {
      code: String(major.majorCode),
      name: major.name,
      description: major.description ?? null,
      sortOrder: Number(major.sortOrder ?? 0),
      isActive: major.isActive === undefined ? true : Boolean(Number(major.isActive))
    });
  }
  const minorMap = new Map();
  for (const row of rows) {
    const majorKey = key(row.majorCode);
    if (!minorMap.has(majorKey)) minorMap.set(majorKey, new Map());
    minorMap.get(majorKey).set(key(row.minorCode), {
      major: String(row.majorCode),
      code: String(row.minorCode),
      name: row.name,
      parentCode: row.parentCode ?? null,
      sortOrder: Number(row.sortOrder ?? 0),
      isActive: row.isActive === undefined ? true : Boolean(Number(row.isActive)),
      status: row.status ?? 'ACTIVE',
      replacedBy: row.replacedBy ?? null,
      meta: row.meta ?? null
    });
  }
  return { source, version: Number(version ?? 0), hash: hash ?? null, majors: majorMap, minors: minorMap };
}

/** 시드만으로 만든 뷰 — DB 없이도 검증 유틸이 동작하게 하는 기본값. */
export function seedView() {
  return makeView(
    seededCodes().map(row => ({ ...row, isActive: row.status === 'ACTIVE' })),
    COMMON_CODE_MAJORS.map(major => ({ majorCode: major.major, name: major.name, description: major.description })),
    { source: 'seed', version: 0, hash: seedHash() }
  );
}

let view = seedView();
let viewLoadedAt = 0;

/** 캐시를 시드 상태로 되돌린다(테스트·시드 동기화 뒤). */
export function resetCommonCodeCache() {
  view = seedView();
  viewLoadedAt = 0;
  return view;
}

/** 지금 캐시(복사본 아님 — 읽기 전용으로만 쓴다). */
export const commonCodeView = () => view;

async function readVersion(db) {
  try {
    const row = (await db.execute({ sql: 'SELECT value FROM djrpg_meta WHERE key=?', args: [CODE_VERSION_KEY] })).rows[0];
    return row ? Number(row.value) || 0 : 0;
  } catch {
    // `djrpg_meta`가 아직 없는 새 DB — 코드 표도 없을 수 있다. 버전 0으로 보고 넘어간다.
    return 0;
  }
}

/** 두 표를 전부 읽어 캐시를 채운다. 반환값은 적재된 뷰.
 *  `version`을 넘기면 `code_version`을 다시 읽지 않는다(호출자가 이미 읽은 경우). */
export async function loadCommonCodes(db, { version: knownVersion } = {}) {
  try { await db.batch(commonCodeStatements(), 'write'); }
  catch (error) {
    // DDL이 일시 오류로 실패해도 표가 이미 있으면 읽기는 계속한다(월드보스 스키마와 같은 정책).
    console.error(JSON.stringify({ event: 'common_code_ddl_skipped', message: String(error?.message ?? error).slice(0, 160) }));
  }
  let majorsResult, minorsResult;
  try {
    [majorsResult, minorsResult] = await Promise.all([
      db.execute(`SELECT major_code, name, description, sort_order, is_active FROM ${CODE_MAJOR_TABLE}`),
      db.execute(`SELECT major_code, minor_code, name, parent_code, sort_order, is_active, status_code, replaced_by_code, meta_json FROM ${CODE_MINOR_TABLE}`)
    ]);
  } catch { return view; } // 코드 표가 없는 DB — 시드 뷰로 검증한다(시드 전 상태).
  const version = knownVersion ?? await readVersion(db);
  if (!majorsResult.rows.length) return view;
  const majors = majorsResult, minors = minorsResult;
  view = makeView(
    minors.rows.map(row => ({
      majorCode: row.major_code, minorCode: row.minor_code, name: row.name, parentCode: row.parent_code,
      sortOrder: row.sort_order, isActive: row.is_active, status: row.status_code, replacedBy: row.replaced_by_code,
      meta: row.meta_json ? safeJson(row.meta_json) : null
    })),
    majors.rows.map(row => ({ majorCode: row.major_code, name: row.name, description: row.description, sortOrder: row.sort_order, isActive: row.is_active })),
    { source: 'db', version }
  );
  viewLoadedAt = Date.now();
  return view;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * 요청 경로에서 부르는 캐시 보장(계획 §7-4). `code_version`을 **최대 60초에 한 번**만 읽고,
 * 같으면 메모리 캐시를 그대로 쓴다. 1단계에서는 엔드포인트가 부르지 않지만, dual-write 단계에서
 * 이 함수 하나를 입구에 걸면 요청당 코드 관련 DB 읽기가 0행으로 유지된다.
 */
export async function ensureCommonCodes(db, { now = Date.now(), ttlMs = CODE_VERSION_TTL_MS, force = false } = {}) {
  if (!force && view.source === 'db' && viewLoadedAt && now - viewLoadedAt < ttlMs) return view;
  const version = await readVersion(db);
  if (!force && view.source === 'db' && version === view.version) { viewLoadedAt = now; return view; }
  return loadCommonCodes(db, { version });
}

/**
 * 시드를 DB에 반영한다(UPSERT, **삭제 없음**). 바뀐 것이 있으면 `code_version`을 올린다.
 * `--dry-run`은 아무 것도 쓰지 않고 무엇이 바뀔지만 돌려준다.
 */
export async function syncCommonCodes(db, { dryRun = false, now = Date.now(), seedVersion = SEED_VERSION } = {}) {
  const rows = seededCodes();
  const hash = seedHash();
  if (!dryRun) await db.batch(commonCodeStatements(), 'write');
  let existingMajors = [];
  let existingMinors = [];
  if (!dryRun) {
    existingMajors = (await db.execute(`SELECT major_code, name, seed_hash FROM ${CODE_MAJOR_TABLE}`)).rows;
    existingMinors = (await db.execute(`SELECT major_code, minor_code, name, parent_code, sort_order, status_code, replaced_by_code, meta_json FROM ${CODE_MINOR_TABLE}`)).rows;
  }
  const majorByCode = new Map(existingMajors.map(row => [key(row.major_code), row]));
  const minorByKey = new Map(existingMinors.map(row => [`${key(row.major_code)}\0${key(row.minor_code)}`, row]));

  const changed = [];
  const writes = [];
  for (const major of COMMON_CODE_MAJORS) {
    const current = majorByCode.get(key(major.major));
    if (!current || current.name !== major.name) changed.push(`major:${major.major}`);
    writes.push({
      sql: `INSERT INTO ${CODE_MAJOR_TABLE}(major_code,name,description,sort_order,is_active,is_system,schema_version,seed_version,seed_hash,synced_at,created_at,updated_at)
            VALUES (?,?,?,?,1,1,1,?,?,?,?,?)
            ON CONFLICT(major_code) DO UPDATE SET name=excluded.name, description=excluded.description, seed_version=excluded.seed_version,
              seed_hash=excluded.seed_hash, synced_at=excluded.synced_at, updated_at=excluded.updated_at`,
      args: [major.major, major.name, major.description ?? null, COMMON_CODE_MAJORS.indexOf(major) * 10 + 10, seedVersion, hash, now, now, now]
    });
  }
  for (const row of rows) {
    const current = minorByKey.get(`${key(row.majorCode)}\0${key(row.minorCode)}`);
    const same = current
      && String(current.name) === String(row.name)
      && String(current.parent_code ?? '') === String(row.parentCode ?? '')
      && Number(current.sort_order) === Number(row.sortOrder)
      && String(current.status_code ?? 'ACTIVE') === String(row.status)
      && String(current.replaced_by_code ?? '') === String(row.replacedBy ?? '')
      && String(current.meta_json ?? '') === String(row.meta ? JSON.stringify(row.meta) : '');
    if (!same) changed.push(`minor:${row.majorCode}.${row.minorCode}`);
    writes.push({
      sql: `INSERT INTO ${CODE_MINOR_TABLE}(major_code,minor_code,name,parent_code,sort_order,is_active,is_system,status_code,replaced_by_code,meta_json,created_at,updated_at)
            VALUES (?,?,?,?,?,?,0,?,?,?,?,?)
            ON CONFLICT(major_code,minor_code) DO UPDATE SET name=excluded.name, parent_code=excluded.parent_code, sort_order=excluded.sort_order,
              is_active=excluded.is_active, status_code=excluded.status_code, replaced_by_code=excluded.replaced_by_code,
              meta_json=excluded.meta_json, updated_at=excluded.updated_at`,
      args: [row.majorCode, row.minorCode, row.name, row.parentCode, row.sortOrder, row.status === 'ACTIVE' ? 1 : 0,
        row.status, row.replacedBy, row.meta ? JSON.stringify(row.meta) : null, now, now]
    });
  }
  if (dryRun) return { dryRun, changed, hash, seedVersion, majors: COMMON_CODE_MAJORS.length, minors: rows.length, version: view.version };
  await db.batch(writes, 'write');
  const version = changed.length ? (await readVersion(db)) + 1 : await readVersion(db);
  if (changed.length) {
    await db.execute({
      sql: "INSERT INTO djrpg_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      args: [CODE_VERSION_KEY, String(version)]
    });
  }
  await loadCommonCodes(db);
  return { dryRun: false, changed, hash, seedVersion, majors: COMMON_CODE_MAJORS.length, minors: rows.length, version };
}

/* ───────────────────────── 조회·검증 ───────────────────────── */

/** 메이저 목록(캐시). */
export function majors() {
  return [...view.majors.values()];
}

/** 한 메이저의 코드 목록(정렬 순서, 단종 포함). */
export function codesOf(major) {
  const bucket = view.minors.get(key(major));
  return bucket ? [...bucket.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)) : [];
}

/** 코드 한 개. 없으면 `undefined`. */
export function codeOf(major, code) {
  return view.minors.get(key(major))?.get(key(code));
}

/** 표시 이름 — 없으면 코드를 그대로 돌려준다(화면이 비지 않게). */
export const codeName = (major, code) => codeOf(major, code)?.name ?? String(code ?? '');

/** 코드가 사전에 있는가(단종 포함). */
export const hasCode = (major, code) => Boolean(codeOf(major, code));

/** 지금도 쓸 수 있는 코드인가 — ACTIVE이면서 활성. 단종·대체된 코드는 false. */
export function isActiveCode(major, code) {
  const entry = codeOf(major, code);
  return Boolean(entry) && entry.status === 'ACTIVE' && entry.isActive;
}

/**
 * 입력 검증 — 캐시만 보므로 DB 읽기가 없다. 실패하면 `400 INVALID_CODE`.
 * `allowInactive: true`는 기존 데이터·조회용(단종 코드도 읽어야 하는 곳).
 */
export function assertCode(major, code, { allowInactive = false, field = major } = {}) {
  const entry = codeOf(major, code);
  if (!entry) {
    const allowed = codesOf(major).filter(item => item.status === 'ACTIVE').map(item => item.code);
    fail(400, 'INVALID_CODE', `${field} 값이 올바르지 않습니다. (허용: ${allowed.join(', ') || '없음'})`);
  }
  if (!allowInactive && (entry.status !== 'ACTIVE' || !entry.isActive)) {
    const hint = entry.status === 'REPLACED' && entry.replacedBy ? ` 대신 ${entry.replacedBy}를 쓰세요.` : ' 지금은 쓸 수 없는 코드입니다.';
    fail(400, 'INVALID_CODE', `${field} 코드 ${entry.code}는 단종되었습니다.${hint}`);
  }
  return entry.code;
}

/** 단종·대체된 코드의 후속 코드(없으면 null). */
export const replacedBy = (major, code) => codeOf(major, code)?.replacedBy ?? null;

/** 코드의 부가속성(색·가격·본문 템플릿 등). */
export const codeMeta = (major, code) => codeOf(major, code)?.meta ?? null;
