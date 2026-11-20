import './ts-loader.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { schema, account, marketSortIndexStatements, marketStatExpression, MARKET_SORT_STATS } from '../server/database.mjs';
import { snapshot, rules } from '../server/market.mjs';
import { removeTempDbDirectory } from './helpers/temp-db.mjs';
const { parseSave, freshSave } = await import('../src/game/store.ts');

/**
 * 거래소 정렬 인덱스 (작업 211).
 *
 * 계약: ① 스키마가 스탯 5종·가격 정렬 인덱스를 만든다. ② `snapshot()`이 만드는 **바인딩 값** 형태의
 * 스탯 정렬 쿼리가 그 인덱스를 타고 `USE TEMP B-TREE FOR ORDER BY`가 사라진다. ③ 인덱스가 결과의 순서·개수를
 * 바꾸지 않는다(전체를 JS로 정렬한 기대값과 같은 20행·같은 순서).
 * 운영 DB는 쓰지 않고 이 파일에서만 임시 SQLite 파일을 만든다.
 */
let db, directory, url;
const env = () => ({ TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: 'market-index-key' });
const slots = ['weapon', 'offhand', 'helmet', 'armor', 'necklace', 'gloves', 'belt', 'boots', 'ring1', 'ring2'];
const rarities = ['common', 'magic', 'rare', 'epic', 'unique', 'legendary'];
const rows = 3000;
let now = 0;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'djrpg-market-index-'));
  url = `file:${join(directory, 'index.db')}`;
  db = createClient({ url });
  await schema(db, env());
  now = Date.now();
  const save = parseSave({ ...freshSave('male'), name: '보는이', gold: 100 }, 'viewer');
  await db.execute({ sql: 'INSERT INTO djrpg_accounts(id,password_hash,save_json,updated_at,session_id) VALUES(?,?,?,?,?)', args: ['viewer', 'hash', JSON.stringify(save), new Date().toISOString(), 'sid-viewer'] });
  await account(db, 'viewer');
  for (let start = 0; start < rows; start += 500) {
    const statements = [];
    for (let index = start; index < Math.min(rows, start + 500); index++) {
      const item = { id: `i-${index}`, name: '황혼의 두손검', slot: slots[index % slots.length], rarity: rarities[index % rarities.length], stats: { attack: index % 97, defense: index % 13, health: index % 7 } };
      statements.push({ sql: 'INSERT INTO djrpg_market VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,NULL)', args: [`m-${index}`, `seller${index % 50}`, '전사', JSON.stringify(item), item.name, item.slot, item.rarity, 100 + index, 'active', now - index * 1000, now + 72 * 3600_000] });
    }
    await db.batch(statements, 'write');
  }
});
after(async () => { await db.close(); await removeTempDbDirectory(directory).catch(() => {}); });

test('스키마가 스탯 5종·가격 정렬 인덱스를 만든다', async () => {
  const names = (await db.execute("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'djrpg_market_sort_%' ORDER BY name")).rows.map(row => row.name);
  assert.deepEqual(names, ['djrpg_market_sort_attack', 'djrpg_market_sort_crit', 'djrpg_market_sort_defense', 'djrpg_market_sort_health', 'djrpg_market_sort_price', 'djrpg_market_sort_speed']);
  assert.equal(marketSortIndexStatements().length, MARKET_SORT_STATS.length + 1);
});

test('바인딩 값(state=?)을 쓰는 스탯 정렬 쿼리가 정렬 인덱스를 탄다', async () => {
  for (const stat of MARKET_SORT_STATS) {
    // `snapshot()`이 실제로 만드는 SQL과 같은 모양(식은 한 곳에서 만든다).
    const sql = `SELECT * FROM djrpg_market WHERE state=? AND expires_at>? AND ${marketStatExpression(stat)}>=? ORDER BY ${marketStatExpression(stat)} DESC,created_at DESC,id ASC LIMIT ${rules.pageSize} OFFSET 0`;
    const plan = (await db.execute({ sql: `EXPLAIN QUERY PLAN ${sql}`, args: ['active', now, 1] })).rows.map(row => row.detail).join(' | ');
    assert.match(plan, new RegExp(`djrpg_market_sort_${stat}`), `${stat} 인덱스를 타야 한다: ${plan}`);
    assert.doesNotMatch(plan, /TEMP B-TREE FOR ORDER BY/, `${stat} 정렬은 인덱스 순서로 끝나야 한다: ${plan}`);
  }
  // 가격 정렬도 같은 방식으로 확인한다.
  const price = (await db.execute({ sql: `EXPLAIN QUERY PLAN SELECT * FROM djrpg_market WHERE state=? AND expires_at>? ORDER BY price ASC,created_at DESC,id ASC LIMIT ${rules.pageSize} OFFSET 0`, args: ['active', now] })).rows.map(row => row.detail).join(' | ');
  assert.match(price, /djrpg_market_sort_price/);
  assert.doesNotMatch(price, /TEMP B-TREE FOR ORDER BY/);
});

test('인덱스는 결과 순서·개수를 바꾸지 않는다(스탯 내림차순)', async () => {
  const page = await snapshot(db, 'viewer', { view: 'active', stat: 'attack', minStat: 1 });
  const all = (await db.execute({ sql: "SELECT * FROM djrpg_market WHERE state='active' AND expires_at>?", args: [now] })).rows;
  const expected = all
    .filter(row => (Number(JSON.parse(row.item_json).stats?.attack) || 0) >= 1)
    .sort((a, b) => (Number(JSON.parse(b.item_json).stats?.attack) || 0) - (Number(JSON.parse(a.item_json).stats?.attack) || 0)
      || Number(b.created_at) - Number(a.created_at)
      || String(a.id).localeCompare(String(b.id)))
    .slice(0, rules.pageSize)
    .map(row => row.id);
  assert.equal(page.total, all.filter(row => (Number(JSON.parse(row.item_json).stats?.attack) || 0) >= 1).length);
  assert.deepEqual(page.listings.map(listing => listing.id), expected);
});

test('최소 스탯 필터도 인덱스 범위로 처리된다(2페이지)', async () => {
  const page = await snapshot(db, 'viewer', { view: 'active', stat: 'defense', minStat: 5, page: 1 });
  assert.equal(page.page, 1);
  for (const listing of page.listings) assert((listing.item.stats?.defense ?? 0) >= 5);
  const attacks = page.listings.map(listing => Number(listing.item.stats?.defense ?? 0));
  assert.deepEqual(attacks, [...attacks].sort((a, b) => b - a), '내림차순이 유지된다');
});
