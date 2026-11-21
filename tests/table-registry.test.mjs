import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { schema } from '../server/database.mjs';
import { dungeonSchema } from '../server/dungeon-schema.mjs';
import { worldBossSchema } from '../server/world-boss-schema.mjs';
import { ACCOUNT_TABLES } from '../server/account-delete.mjs';
import { RESET_TABLES } from '../server/season.mjs';
import { TABLES as MIGRATE_TABLES, OPTIONAL_TABLES as MIGRATE_OPTIONAL } from '../scripts/migrate-turso-db.mjs';
import { removeTempDbDirectory } from './helpers/temp-db.mjs';
import * as registry from '../server/tables.mjs';

/**
 * 표 등록부(작업 260).
 *
 * 이 검사가 막으려는 사고는 두 가지다.
 *  ① 새 표를 만들고 **탈퇴 목록**에 넣지 않아 같은 아이디 재가입자가 이전 주인의 데이터를 물려받는다.
 *  ② 새 표를 만들고 **이관 목록**에서 빼 새 DB가 빈 표로 시작한다(상점 5표가 실제로 이랬다).
 * 그래서 ①DDL이 만드는 표 = 등록부 ②등록부에서 파생한 목록 = 기존 네 곳의 목록(집합 동일) ③정책 필드가
 * 빠진 표가 없음 을 함께 고정한다.
 */

const root = fileURLToPath(new URL('..', import.meta.url));

/** DDL 파일들에서 `djrpg_*` 표 이름을 뽑는다. */
function ddlTables(...files) {
  const names = new Set();
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const match of text.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(djrpg_[a-z0-9_]+)/g)) names.add(match[1]);
  }
  return names;
}

/**
 * 분리 전 네 곳에 있던 목록을 **그대로 옮겨 적은** 기준값이다.
 * 여기 값이 바뀌면 정책이 바뀐 것이므로, 바꾸는 사람이 이유를 남겨야 한다(테스트는 집합만 본다).
 */
const LEGACY_ACCOUNT_TABLES = [
  'djrpg_account_profiles', 'djrpg_characters', 'djrpg_character_item_owners', 'djrpg_item_owners',
  'djrpg_warehouse', 'djrpg_warehouse_requests', 'djrpg_journey', 'djrpg_save_versions', 'djrpg_save_requests',
  'djrpg_market_inbox', 'djrpg_market_requests', 'djrpg_journey_requests', 'djrpg_dungeon_records', 'djrpg_dungeon_attempts',
  'djrpg_boss_attempts', 'djrpg_boss_scores', 'djrpg_boss_rewards', 'djrpg_announcements',
  'djrpg_shop_wallet', 'djrpg_shop_orders', 'djrpg_shop_ledger', 'djrpg_shop_entitlements', 'djrpg_shop_requests'
];
const LEGACY_RESET_TABLES = [
  'djrpg_market', 'djrpg_market_events', 'djrpg_market_inbox', 'djrpg_market_requests', 'djrpg_journey_requests',
  'djrpg_warehouse', 'djrpg_warehouse_requests', 'djrpg_item_owners', 'djrpg_character_item_owners',
  'djrpg_dungeon_records', 'djrpg_boss_days', 'djrpg_boss_attempts', 'djrpg_boss_scores', 'djrpg_boss_rewards',
  'djrpg_journey', 'djrpg_save_requests', 'djrpg_save_versions', 'djrpg_announcements'
];
/** 이관 목록은 **6개월 전 목록(22표)** 에 빠져 있던 상점 5표를 더한 27표다(작업 260에서 바로잡음). */
const LEGACY_MIGRATE_TABLES = [
  'djrpg_accounts', 'djrpg_journey', 'djrpg_save_requests', 'djrpg_save_versions', 'djrpg_market',
  'djrpg_market_inbox', 'djrpg_item_owners', 'djrpg_market_events', 'djrpg_market_requests', 'djrpg_journey_requests',
  'djrpg_account_profiles', 'djrpg_characters', 'djrpg_character_item_owners', 'djrpg_warehouse',
  'djrpg_warehouse_requests', 'djrpg_boss_days', 'djrpg_boss_attempts', 'djrpg_boss_scores', 'djrpg_boss_rewards',
  'djrpg_meta', 'djrpg_announcements', 'djrpg_dungeon_records', 'djrpg_dungeon_attempts',
  'djrpg_shop_wallet', 'djrpg_shop_orders', 'djrpg_shop_ledger', 'djrpg_shop_entitlements', 'djrpg_shop_requests'
];

/**
 * 기본 스키마 DDL을 들고 있는 파일들 — `server/db/schema.mjs`(대부분)와
 * `server/journey-requests.mjs`(여정 요청 표는 도메인 모듈이 DDL을 소유한다, 작업 260 · PR-5).
 */
const SCHEMA_DDL_FILES = ['server/db/schema.mjs', 'server/journey-requests.mjs'];

test('DDL이 만드는 djrpg_* 표와 등록부가 정확히 같다', () => {
  const ddl = ddlTables(...SCHEMA_DDL_FILES, 'server/dungeon-schema.mjs', 'server/world-boss-schema.mjs');
  assert.deepEqual([...ddl].sort(), [...registry.TABLE_NAMES].sort(),
    '표를 새로 만들었는데 등록부(server/tables.mjs)에 없거나, 등록부에만 있는 이름이 있다.');
  assert.equal(new Set(registry.TABLE_NAMES).size, registry.TABLE_NAMES.length, '등록부에 같은 표가 두 번 있다.');
});

test('DDL 모듈별 목록이 실제 DDL과 맞는다', () => {
  // 기본 스키마 파일은 자기 표 + 던전 2표(같은 DDL을 두 곳에서 다시 쓴다 — 등록부 `DDL_TABLES.duplicated`)를 만든다.
  const schemaTables = [...registry.DDL_TABLES.schema, ...registry.DDL_TABLES.duplicated].sort();
  assert.deepEqual([...ddlTables(...SCHEMA_DDL_FILES)].sort(), schemaTables);
  assert.deepEqual([...ddlTables('server/dungeon-schema.mjs')].sort(), [...registry.DDL_TABLES.duplicated].sort());
  assert.deepEqual([...ddlTables('server/world-boss-schema.mjs')].sort(), [...registry.DDL_TABLES['world-boss']].sort());
  for (const table of registry.DDL_TABLES.duplicated) assert.equal(registry.tableSpec(table).ddl, 'dungeon');
});

test('탈퇴 목록은 종전 22표와 집합이 같다', () => {
  assert.deepEqual([...registry.ACCOUNT_TABLES].sort(), [...LEGACY_ACCOUNT_TABLES].sort());
  assert.deepEqual([...ACCOUNT_TABLES].sort(), [...LEGACY_ACCOUNT_TABLES].sort(), 'server/account-delete.mjs가 등록부에서 파생하지 않는다');
});

test('시즌 초기화 목록은 종전 17표와 집합이 같다', () => {
  assert.deepEqual([...registry.RESET_TABLES].sort(), [...LEGACY_RESET_TABLES].sort());
  assert.deepEqual([...RESET_TABLES].sort(), [...LEGACY_RESET_TABLES].sort(), 'server/season.mjs가 등록부에서 파생하지 않는다');
  // 이용권은 목록이 아니라 별도 문장으로 비운다(결제 기록이 아니라 목록에서 분리해 둔 것 — 현행 동작).
  assert.deepEqual(registry.SEASON_CLEAR_TABLES, ['djrpg_shop_entitlements']);
  // 결제 원장·주문·계정 행은 절대 시즌 초기화로 지우지 않는다.
  for (const table of ['djrpg_accounts', 'djrpg_shop_orders', 'djrpg_shop_ledger', 'djrpg_shop_requests', 'djrpg_shop_wallet', 'djrpg_characters', 'djrpg_account_profiles', 'djrpg_meta', 'djrpg_dungeon_attempts']) {
    assert.ok(!registry.RESET_TABLES.includes(table), `${table}은(는) 시즌 초기화 대상이 아니다`);
  }
});

test('이관 목록은 상점 5표를 포함한 27표이고, 옵션 목록은 그 부분집합이다', () => {
  assert.deepEqual([...registry.MIGRATION_TABLES].sort(), [...LEGACY_MIGRATE_TABLES].sort());
  assert.deepEqual([...MIGRATE_TABLES].sort(), [...LEGACY_MIGRATE_TABLES].sort(), 'scripts/migrate-turso-db.mjs가 등록부에서 파생하지 않는다');
  assert.deepEqual([...MIGRATE_OPTIONAL].sort(), [...registry.OPTIONAL_TABLES].sort());
  for (const table of ['djrpg_shop_wallet', 'djrpg_shop_orders', 'djrpg_shop_ledger', 'djrpg_shop_entitlements', 'djrpg_shop_requests']) {
    assert.ok(registry.MIGRATION_TABLES.includes(table), `${table}이(가) 이관 목록에서 빠졌다 — 새 DB가 빈 표로 시작한다`);
  }
  for (const table of registry.OPTIONAL_TABLES) assert.ok(registry.MIGRATION_TABLES.includes(table));
  assert.deepEqual(registry.SEQUENCE_TABLES, ['djrpg_market_events'], 'AUTOINCREMENT 시퀀스를 이어받는 표 목록이 바뀌었다');
});

test('모든 표에 정책이 빠짐없이 적혀 있다', () => {
  const deletePolicy = new Set(['delete', 'market', 'listing', 'keep']);
  const seasonPolicy = new Set(['purge', 'clear', 'reset', 'keep']);
  const migratePolicy = new Set(['required', 'optional']);
  const owners = new Set(['account', 'character', 'item', 'global']);
  for (const table of registry.TABLES) {
    assert.match(table.name, /^djrpg_[a-z0-9_]+$/, `${table.name}: 이름 형식`);
    assert.ok(owners.has(table.owner), `${table.name}: owner`);
    assert.ok(deletePolicy.has(table.onDelete), `${table.name}: onDelete`);
    assert.ok(seasonPolicy.has(table.onSeason), `${table.name}: onSeason`);
    assert.ok(migratePolicy.has(table.migrate), `${table.name}: migrate`);
    assert.ok(['schema', 'dungeon', 'world-boss'].includes(table.ddl), `${table.name}: ddl`);
    // 계정 열이 `account_id`인 표는 반드시 `delete` 정책이어야 한다(빠뜨리면 재가입자가 데이터를 물려받는다).
    if (table.accountColumn === 'account_id') assert.equal(table.onDelete, 'delete', `${table.name}: account_id 표는 탈퇴 때 지운다`);
    if (table.accountColumn === null) assert.notEqual(table.onDelete, 'delete', `${table.name}: 계정 열이 없으면 계정 열로 지울 수 없다`);
  }
  assert.throws(() => registry.tableSpec('djrpg_not_a_table'), /등록부/);
  assert.equal(registry.isRegistered('djrpg_accounts'), true);
  assert.equal(registry.isRegistered('djrpg_future_data'), false);
});

test('schema()가 만드는 표가 등록부와 정확히 같고, 공통코드 표도 함께 생긴다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-table-registry-'));
  const url = `file:${join(directory, 'registry.db')}`;
  const db = createClient({ url });
  try {
    await schema(db, { TURSO_DATABASE_URL: url });
    await dungeonSchema(db);
    await worldBossSchema(db, url);
    const rows = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'djrpg_*'")).rows;
    assert.deepEqual(rows.map(row => String(row.name)).sort(), [...registry.TABLE_NAMES].sort(),
      'DDL은 만들었는데 등록부에 없는 표가 있다(또는 그 반대).');
    const codes = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('common_code_majors','common_code_minors')")).rows;
    assert.equal(codes.length, 2, '공통코드 2표(작업 260)가 schema()에서 만들어지지 않았다');
    assert.deepEqual(codes.map(row => String(row.name)).sort(), [...registry.CODE_TABLES].sort());
    // 공통코드는 **시드가 진실**이다 — DB 행을 복사하는 이관·탈퇴·시즌 대상이 아니다.
    for (const table of registry.CODE_TABLES) {
      assert.ok(!registry.MIGRATION_TABLES.includes(table), `${table}: 이관 목록에 넣지 않는다(시드에서 다시 만든다)`);
      assert.ok(!registry.ACCOUNT_TABLES.includes(table));
      assert.ok(!registry.RESET_TABLES.includes(table));
    }
  } finally {
    await db.close();
    await removeTempDbDirectory(directory);
  }
});
