#!/usr/bin/env node
/**
 * 거래소 검색 실행 계획·실측 (작업 209 → 210).
 *
 * 운영 DB를 건드리지 않고 **임시 로컬 SQLite**에 매물 N건을 채운 뒤, `server/market.mjs` `snapshot()`이
 * 실제로 만드는 WHERE/ORDER BY 형태를 `EXPLAIN QUERY PLAN`으로 확인하고 같은 쿼리를 잰다.
 *
 * 작업 211에서는 스탯 정렬용 표현식 인덱스(`server/database.mjs` `marketSortIndexStatements`)를 넣었으므로,
 * **인덱스 없음(개선 전) / 인덱스 있음(개선 후)**을 같은 DB에서 차례로 재서 나란히 보여 준다.
 *
 *   node scripts/explain-market-query.mjs                    # 20,000건, 개선 전/후 비교
 *   node scripts/explain-market-query.mjs --rows=100000      # 100,000건
 *   node scripts/explain-market-query.mjs --rows=100000 --reps=7
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { schema, marketStatExpression, marketSortIndexStatements, MARKET_SORT_STATS } from '../server/database.mjs';
import { rules } from '../server/market.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const [key, value] = argument.replace(/^--/, '').split('=');
  return [key, value ?? 'true'];
}));
const rows = Math.max(100, Math.min(500_000, Number(args.rows ?? 20000)));
const reps = Math.max(1, Math.min(15, Number(args.reps ?? 5)));
const directory = await mkdtemp(join(tmpdir(), 'djrpg-market-plan-'));
const url = `file:${join(directory, 'plan.db')}`;
const db = createClient({ url });
await schema(db, { TURSO_DATABASE_URL: url });

const slots = ['weapon', 'offhand', 'helmet', 'armor', 'necklace', 'gloves', 'belt', 'boots', 'ring1', 'ring2'];
const rarities = ['common', 'magic', 'rare', 'epic', 'unique', 'legendary'];
const names = ['낡은 두손검', '황혼의 클레이모어', '비전의 사슬 갑옷', '영원의 패왕의 전갑', '서리의 가죽 두건', '고대의 미스릴 벨트'];
const now = Date.now();
const seedBatch = async from => {
  const statements = [];
  for (let index = from; index < Math.min(rows, from + 500); index++) {
    const slot = slots[index % slots.length], rarity = rarities[index % rarities.length];
    const item = { id: `i-${index}`, name: names[index % names.length], slot, rarity, stats: { attack: index % 400, defense: index % 200, health: index % 50 }, plus: index % 8 };
    statements.push({ sql: 'INSERT INTO djrpg_market VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,NULL)', args: [`m-${index}`, `seller${index % 4000}`, '전사', JSON.stringify(item), item.name, slot, rarity, 100 + (index % 90000), 'active', now - index * 1000, now + 72 * 3600_000] });
  }
  if (statements.length) await db.batch(statements, 'write');
};
for (let index = 0; index < rows; index += 500) await seedBatch(index);
await db.execute({ sql: "UPDATE djrpg_market SET state='sold', sold_at=? WHERE id IN (SELECT id FROM djrpg_market LIMIT ?)", args: [now, Math.floor(rows / 5)] });

const plan = async (sql, values) => (await db.execute({ sql: `EXPLAIN QUERY PLAN ${sql}`, args: values })).rows.map(row => `${row.detail}`);
const time = async (sql, values) => {
  const samples = [];
  let returned = 0;
  for (let round = 0; round < reps; round++) {
    const started = performance.now();
    const result = await db.execute({ sql, args: values });
    samples.push(performance.now() - started);
    returned = result.rows.length;
  }
  samples.sort((a, b) => a - b);
  return { ms: samples[Math.floor(samples.length / 2)], rows: returned };
};
const statCase = stat => ({
  name: `스탯 필터·정렬(${stat})`,
  sql: `SELECT * FROM djrpg_market WHERE state=? AND expires_at>? AND ${marketStatExpression(stat)}>=? ORDER BY ${marketStatExpression(stat)} DESC,created_at DESC,id ASC LIMIT ${rules.pageSize} OFFSET 0`,
  args: ['active', now, 1]
});
const cases = [
  {
    name: '기본 목록(판매 중, 최신순)',
    sql: `SELECT * FROM djrpg_market WHERE state=? AND expires_at>? ORDER BY created_at DESC,id ASC LIMIT ${rules.pageSize} OFFSET 0`,
    args: ['active', now]
  },
  {
    name: '기본 목록 2페이지 이후',
    sql: `SELECT * FROM djrpg_market WHERE state=? AND expires_at>? ORDER BY created_at DESC,id ASC LIMIT ${rules.pageSize} OFFSET 400`,
    args: ['active', now]
  },
  {
    name: '가격 오름차순',
    sql: `SELECT * FROM djrpg_market WHERE state=? AND expires_at>? ORDER BY price ASC,created_at DESC,id ASC LIMIT ${rules.pageSize} OFFSET 0`,
    args: ['active', now]
  },
  {
    name: '가격 내림차순 + 가격 범위',
    sql: `SELECT * FROM djrpg_market WHERE state=? AND expires_at>? AND price>=? AND price<=? ORDER BY price DESC,created_at DESC,id ASC LIMIT ${rules.pageSize} OFFSET 0`,
    args: ['active', now, 1000, 50000]
  },
  ...MARKET_SORT_STATS.map(statCase),
  {
    name: '스탯 필터 + 무기 카테고리 + 정렬',
    sql: `SELECT * FROM djrpg_market WHERE state=? AND expires_at>? AND ${marketStatExpression('attack')}>=? AND slot IN (?,?) ORDER BY ${marketStatExpression('attack')} DESC,created_at DESC,id ASC LIMIT ${rules.pageSize} OFFSET 0`,
    args: ['active', now, 1, 'weapon', 'offhand']
  },
  {
    name: '이름 검색(instr) + 무기 카테고리',
    sql: `SELECT * FROM djrpg_market WHERE state=? AND expires_at>? AND instr(name,?)>0 AND slot IN (?,?) ORDER BY created_at DESC,id ASC LIMIT ${rules.pageSize} OFFSET 0`,
    args: ['active', now, '클레이', 'weapon', 'offhand']
  },
  {
    name: '내 매물(판매자)',
    sql: "SELECT * FROM djrpg_market WHERE seller=? AND state='active' AND expires_at>?",
    args: ['seller7', now]
  },
  {
    name: '시세(최근 체결 10건)',
    sql: "SELECT price,sold_at FROM djrpg_market WHERE state='sold' AND name=? AND rarity=? AND slot=? ORDER BY sold_at DESC,id DESC LIMIT 10",
    args: ['낡은 두손검', 'rare', 'weapon']
  }
];

const measure = async () => {
  const results = [];
  for (const item of cases) results.push({ ...item, plan: await plan(item.sql, item.args), ...await time(item.sql, item.args) });
  return results;
};
const indexSize = async () => {
  try { const row = (await db.execute("SELECT SUM(pgsize) AS n FROM dbstat WHERE name LIKE 'djrpg_market_sort_%'")).rows[0]; return Number(row?.n ?? 0); }
  catch { return 0; }
};
try {
  console.log(`[거래소 실행 계획] 매물 ${rows.toLocaleString('ko-KR')}건(그중 판매 완료 ${Math.floor(rows / 5).toLocaleString('ko-KR')}건) · 임시 파일 DB · ${reps}회 중앙값`);
  // 개선 전: 정렬 인덱스를 지운 상태에서 잰다.
  for (const statement of marketSortIndexStatements()) {
    const name = /INDEX IF NOT EXISTS (\w+)/.exec(statement)?.[1];
    if (name) await db.execute(`DROP INDEX IF EXISTS ${name}`);
  }
  const before = await measure();
  // 개선 후: 스키마와 같은 DDL로 만든다.
  const created = performance.now();
  await db.batch(marketSortIndexStatements(), 'write');
  const indexMs = performance.now() - created;
  const after = await measure();
  console.log(`\n정렬 인덱스 ${marketSortIndexStatements().length}개 생성 ${indexMs.toFixed(0)}ms · 크기 ${(await indexSize() / 1024 / 1024).toFixed(1)}MB\n`);
  let gained = 0;
  for (const [index, item] of cases.entries()) {
    const old = before[index], now2 = after[index];
    const ratio = old.ms > 0 ? old.ms / Math.max(.01, now2.ms) : 1;
    if (/스탯/.test(item.name) || /가격/.test(item.name)) gained += Math.max(0, old.ms - now2.ms);
    console.log(`■ ${item.name}`);
    console.log(`   개선 전 ${old.ms.toFixed(2)}ms  →  개선 후 ${now2.ms.toFixed(2)}ms  (${ratio.toFixed(1)}×)`);
    console.log(`   계획(전) ${old.plan.join(' | ')}`);
    if (old.plan.join(' | ') !== now2.plan.join(' | ')) console.log(`   계획(후) ${now2.plan.join(' | ')}`);
    if (now2.rows !== old.rows) console.log(`   ! 반환 행 수가 다릅니다: ${old.rows} → ${now2.rows}`);
  }
  console.log('\n해석: 스탯·가격 정렬은 인덱스로 `USE TEMP B-TREE FOR ORDER BY`가 사라지고 상위 20행에서 멈춘다.');
  console.log('이름 검색(instr)·카테고리 필터는 여전히 판매 중 매물을 훑지만 결과 페이지가 20행이라 수 ms다.');
} finally {
  await db.close();
  await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
}
