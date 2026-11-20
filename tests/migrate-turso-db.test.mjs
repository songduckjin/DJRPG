import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { schema } from '../server/database.mjs';
import { worldBossSchema } from '../server/world-boss-schema.mjs';
import { TABLES } from '../scripts/migrate-turso-db.mjs';
import { removeTempDbDirectory } from './helpers/temp-db.mjs';

const script = fileURLToPath(new URL('../scripts/migrate-turso-db.mjs', import.meta.url));
const save = name => JSON.stringify({ version: 1, name, gold: 120, floor: 3, bag: [], equipment: {} });

// 공용 DB를 흉내 낸 소스: djrpg_* 19개 테이블(작업 206의 djrpg_meta 포함) + puzzle-mates용 users 테이블.
async function prepared() {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-migrate-'));
  const source = `file:${join(directory, 'shared.db')}`;
  const target = `file:${join(directory, 'djrpg.db')}`;
  const db = createClient({ url: source });
  await schema(db, { TURSO_DATABASE_URL: source });
  await worldBossSchema(db, source);
  // 이관 대상은 상점 도입 전 공용 DB다. 현재 스키마가 만든 신규 테이블은 제외한다.
  await db.batch([
    { sql: 'DROP TABLE IF EXISTS djrpg_shop_requests' },
    { sql: 'DROP TABLE IF EXISTS djrpg_shop_entitlements' },
    { sql: 'DROP TABLE IF EXISTS djrpg_shop_ledger' },
    { sql: 'DROP TABLE IF EXISTS djrpg_shop_orders' },
    { sql: 'DROP TABLE IF EXISTS djrpg_shop_wallet' }
  ], 'write');
  await db.batch([
    { sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, nickname TEXT NOT NULL)' },
    { sql: "INSERT INTO users (id,nickname) VALUES (1,'puzzle-a'),(2,'puzzle-b'),(3,'puzzle-c')" },
    { sql: 'INSERT OR REPLACE INTO djrpg_accounts (id,password_hash,save_json,updated_at,session_id) VALUES (?,?,?,?,?)', args: ['hero', 'hash', save('전사'), '2026-11-18T01:00:00.000Z', 'sid-1'] },
    { sql: 'INSERT OR REPLACE INTO djrpg_accounts (id,password_hash,save_json,updated_at,session_id) VALUES (?,?,?,?,?)', args: ['guest_1', 'guest', save('모험가'), '2026-11-18T02:00:00.000Z', 'sid-2'] },
    { sql: 'INSERT OR REPLACE INTO djrpg_account_profiles (account_id,shared_gold,active_slot) VALUES (?,?,?)', args: ['hero', 120, 1] },
    { sql: 'INSERT OR REPLACE INTO djrpg_characters (account_id,slot,save_json,updated_at) VALUES (?,?,?,?)', args: ['hero', 1, save('전사'), '2026-11-18T01:00:00.000Z'] },
    { sql: 'INSERT OR REPLACE INTO djrpg_journey (account_id,state_json) VALUES (?,?)', args: ['hero', '{"daily":{}}'] },
    { sql: 'INSERT OR REPLACE INTO djrpg_save_requests (account_id,request_id,revision) VALUES (?,?,?)', args: ['hero', 'req-1', 4] },
    { sql: 'INSERT OR REPLACE INTO djrpg_save_versions (account_id,revision) VALUES (?,?)', args: ['hero', 4] },
    { sql: 'INSERT OR REPLACE INTO djrpg_market (id,seller,seller_name,buyer,item_json,name,slot,rarity,price,state,created_at,expires_at,sold_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', args: ['m-1', 'hero', 'hero', null, '{"id":"i-1"}', '검', 'weapon', 'rare', 500, 'open', 1, 2, null] },
    { sql: 'INSERT OR REPLACE INTO djrpg_market_inbox (id,account_id,listing_id,kind,item_json,gold,reason,created_at,claimed_at) VALUES (?,?,?,?,?,?,?,?,?)', args: ['in-1', 'hero', 'm-1', 'sold', null, 475, '판매', 1, null] },
    { sql: 'INSERT OR REPLACE INTO djrpg_item_owners (item_id,account_id,location,item_json) VALUES (?,?,?,?)', args: ['i-1', 'hero', 'inventory', '{"id":"i-1"}'] },
    { sql: 'INSERT OR REPLACE INTO djrpg_market_requests (account_id,request_id,response_json) VALUES (?,?,?)', args: ['hero', 'req-m', '{}'] },
    { sql: 'INSERT OR REPLACE INTO djrpg_character_item_owners (item_id,account_id,slot) VALUES (?,?,?)', args: ['i-1', 'hero', 1] },
    { sql: 'INSERT OR REPLACE INTO djrpg_warehouse (account_id,item_id,item_json) VALUES (?,?,?)', args: ['hero', 'i-2', '{"id":"i-2"}'] },
    { sql: 'INSERT OR REPLACE INTO djrpg_warehouse_requests (account_id,request_id,response_json) VALUES (?,?,?)', args: ['hero', 'req-w', '{}'] },
    { sql: 'INSERT INTO djrpg_boss_days (day,max_hp,hp,ends_at) VALUES (?,?,?,?)', args: ['2026-11-18', 10000000, 9000000, 100] },
    { sql: 'INSERT INTO djrpg_boss_attempts (id,account_id,day,request_id,save_json,started_at,dodges_json) VALUES (?,?,?,?,?,?,?)', args: ['boss-1', 'hero', '2026-11-18', 'boss-req-1', save('전사'), 1, '[]'] },
    { sql: 'INSERT INTO djrpg_boss_scores (day,account_id,name,damage,joined_at) VALUES (?,?,?,?,?)', args: ['2026-11-18', 'hero', '전사', 1000000, 1] },
    { sql: 'INSERT INTO djrpg_boss_rewards (day,account_id,kind) VALUES (?,?,?)', args: ['2026-11-18', 'hero', 'rank'] }
  ], 'write');
  for (let index = 1; index <= 7; index += 1) {
    await db.execute({ sql: 'INSERT INTO djrpg_market_events (kind,listing_id,created_at) VALUES (?,?,?)', args: [`kind-${index}`, 'm-1', index] });
  }
  // AUTOINCREMENT 시퀀스는 실제 최대 seq보다 클 수 있다(지난 이벤트 삭제). 이관 후에도 재사용되지 않아야 한다.
  await db.batch([
    { sql: "DELETE FROM djrpg_market_events WHERE kind='kind-7'" },
    { sql: "UPDATE sqlite_sequence SET seq=42 WHERE name='djrpg_market_events'" }
  ], 'write');
  await db.close();
  return { directory, source, target };
}

function migrate({ source, target }, args = [], extraEnv = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SOURCE_TURSO_DATABASE_URL: source,
      TARGET_TURSO_DATABASE_URL: target,
      ...extraEnv
    }
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

const counts = async (url, tables = TABLES) => {
  const db = createClient({ url });
  try {
    const result = {};
    for (const table of tables) result[table] = Number((await db.execute(`SELECT COUNT(*) AS n FROM "${table}"`)).rows[0].n);
    return result;
  } finally {
    await db.close();
  }
};

test('dry-run은 소스 djrpg_* 행 수만 출력하고 타겟을 만들지 않는다', async () => {
  const paths = await prepared();
  try {
    const result = migrate(paths, ['--dry-run']);
    assert.equal(result.status, 0, result.stderr);
    for (const table of TABLES) assert.match(result.stdout, new RegExp(`${table}\\s`), `${table} 행 수 누락`);
    assert.match(result.stdout, /djrpg_accounts\s+2/);
    assert.match(result.stdout, /djrpg_market_events\s+6/);
    assert.match(result.stdout, /게스트 계정: 1개/);
    assert.match(result.stdout, /아무 것도 쓰지 않았습니다/);
    assert.equal(existsSync(paths.target.replace('file:', '')), false);
  } finally {
    await removeTempDbDirectory(paths.directory);
  }
});

test('djrpg_* 테이블만 복사하고 users는 넘기지 않으며 건수가 일치한다', async () => {
  const paths = await prepared();
  try {
    const result = migrate(paths, ['--chunk-size=2']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.match(/OK  /g)?.length, TABLES.length);
    const sourceCounts = await counts(paths.source);
    assert.deepEqual(await counts(paths.target), sourceCounts);
    assert.equal(sourceCounts.djrpg_accounts, 2);
    assert.equal(sourceCounts.djrpg_market_events, 6);
    for (const table of ['djrpg_boss_days', 'djrpg_boss_attempts', 'djrpg_boss_scores', 'djrpg_boss_rewards']) assert.equal(sourceCounts[table], 1);

    const target = createClient({ url: paths.target });
    try {
      const objects = (await target.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map(row => row.name);
      assert.equal(objects.includes('users'), false, 'puzzle-mates 테이블이 복사되면 안 된다');
      const rows = (await target.execute('SELECT id,save_json,session_id FROM djrpg_accounts ORDER BY id')).rows;
      assert.deepEqual(rows.map(row => row.id), ['guest_1', 'hero']);
      assert.equal(JSON.parse(rows[1].save_json).name, '전사');
      assert.equal(rows[1].session_id, 'sid-1');
      const buys = (await target.execute("SELECT gold FROM djrpg_market_inbox WHERE id='in-1'")).rows[0];
      assert.equal(Number(buys.gold), 475);
      // 시퀀스는 소스 sqlite_sequence(42)를 이어받아 새 이벤트가 43부터 발급된다.
      await target.execute({ sql: 'INSERT INTO djrpg_market_events (kind,listing_id,created_at) VALUES (?,?,?)', args: ['new', 'm-1', 100] });
      const seq = (await target.execute("SELECT seq FROM sqlite_sequence WHERE name='djrpg_market_events'")).rows[0].seq;
      assert.equal(Number(seq), 43);
    } finally {
      await target.close();
    }

    // 소스(공용 DB)는 읽기만 한다: users·djrpg_* 행 수가 그대로다.
    const source = createClient({ url: paths.source });
    try {
      const users = (await source.execute('SELECT COUNT(*) AS n FROM users')).rows[0];
      assert.equal(Number(users.n), 3);
    } finally {
      await source.close();
    }
  } finally {
    await removeTempDbDirectory(paths.directory);
  }
});

test('타겟에 이미 행이 있으면 --force 없이는 중단하고, --force면 정확히 다시 채운다', async () => {
  const paths = await prepared();
  try {
    const first = migrate(paths);
    assert.equal(first.status, 0, first.stderr);

    const target = createClient({ url: paths.target });
    try {
      await target.execute({ sql: 'DELETE FROM djrpg_market WHERE id=?', args: ['m-1'] });
    } finally {
      await target.close();
    }

    const blocked = migrate(paths);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /이미 행이 있습니다/);
    assert.match(blocked.stderr, /--force/);
    assert.equal((await counts(paths.target)).djrpg_market, 0, '중단됐으면 타겟을 건드리지 않는다');

    const forced = migrate(paths, ['--force']);
    assert.equal(forced.status, 0, forced.stderr);
    assert.match(forced.stdout, /--force/);
    assert.deepEqual(await counts(paths.target), await counts(paths.source));
    assert.equal((await counts(paths.target)).djrpg_market, 1);
  } finally {
    await removeTempDbDirectory(paths.directory);
  }
});

test('소스에만 있는 컬럼(스키마 드리프트)이 있으면 조용히 빼지 않고 중단한다', async () => {
  const paths = await prepared();
  try {
    const source = createClient({ url: paths.source });
    try {
      await source.execute('ALTER TABLE djrpg_accounts ADD COLUMN legacy_flag TEXT');
    } finally {
      await source.close();
    }
    const result = migrate(paths);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /소스에만 있는 컬럼/);
    assert.match(result.stderr, /legacy_flag/);
    assert.equal((await counts(paths.target)).djrpg_accounts, 0);
  } finally {
    await removeTempDbDirectory(paths.directory);
  }
});

test('목록에 없는 DJRPG 테이블이 있으면 이관을 중단한다', async () => {
  const paths = await prepared();
  try {
    const source = createClient({ url: paths.source });
    try {
      await source.execute('CREATE TABLE djrpg_future_data (id TEXT PRIMARY KEY)');
    } finally {
      await source.close();
    }
    const result = migrate(paths, ['--dry-run']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /이관 목록에 없는 DJRPG 테이블/);
    assert.match(result.stderr, /djrpg_future_data/);
    assert.equal(existsSync(paths.target.replace('file:', '')), false);
  } finally {
    await removeTempDbDirectory(paths.directory);
  }
});

test('환경변수가 없거나 소스·타겟이 같은 DB면 명확한 오류로 멈춘다', async () => {
  const paths = await prepared();
  try {
    const missing = spawnSync(process.execPath, [script], { encoding: 'utf8', env: { ...process.env, SOURCE_TURSO_DATABASE_URL: paths.source } });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /TARGET_TURSO_DATABASE_URL/);

    const same = migrate({ source: paths.source, target: paths.source });
    assert.notEqual(same.status, 0);
    assert.match(same.stderr, /소스와 타겟 URL이 같습니다/);
  } finally {
    await removeTempDbDirectory(paths.directory);
  }
});
