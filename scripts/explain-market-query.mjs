#!/usr/bin/env node
/**
 * 거래소 검색 실행 계획·실측 (작업 209 우선순위 6).
 *
 * 운영 DB를 건드리지 않고 **임시 로컬 SQLite**에 매물 N건을 채운 뒤, `server/market.mjs` `snapshot()`이
 * 실제로 만드는 WHERE/ORDER BY 형태를 `EXPLAIN QUERY PLAN`으로 확인하고 같은 쿼리를 재서 인덱스가
 * 필요한지 판단한다. 병목이 확인되지 않으면 스키마를 바꾸지 않는다(보고서에 근거만 남긴다).
 *
 *   node scripts/explain-market-query.mjs                 # 20,000건
 *   node scripts/explain-market-query.mjs --rows=200000
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { schema } from '../server/database.mjs';
import { rules } from '../server/market.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const [key, value] = argument.replace(/^--/, '').split('=');
  return [key, value ?? 'true'];
}));
const rows = Math.max(100, Math.min(500_000, Number(args.rows ?? 20000)));
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
    const item = { id: `i-${index}`, name: names[index % names.length], slot, rarity, stats: { attack: index % 400, defense: index % 200 }, plus: index % 8 };
    statements.push({ sql: 'INSERT INTO djrpg_market VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,NULL)', args: [`m-${index}`, `seller${index % 4000}`, '전사', JSON.stringify(item), item.name, slot, rarity, 100 + (index % 90000), 'active', now - index * 1000, now + 72 * 3600_000] });
  }
  if (statements.length) await db.batch(statements, 'write');
};
for (let index = 0; index < rows; index += 500) await seedBatch(index);
await db.execute({ sql: "UPDATE djrpg_market SET state='sold', sold_at=? WHERE id IN (SELECT id FROM djrpg_market LIMIT ?)", args: [now, Math.floor(rows / 5)] });

const plan = async sql => (await db.execute(`EXPLAIN QUERY PLAN ${sql}`)).rows.map(row => `${row.detail}`);
const time = async sql => {
  const started = performance.now();
  const result = await db.execute(sql);
  return { ms: performance.now() - started, rows: result.rows.length };
};
const cases = [
  {
    name: '기본 목록(판매 중, 최신순)',
    sql: `SELECT * FROM djrpg_market WHERE state='active' AND expires_at>${now} ORDER BY created_at DESC,id ASC LIMIT ${rules.pageSize} OFFSET 0`
  },
  {
    name: '기본 목록 2페이지 이후',
    sql: `SELECT * FROM djrpg_market WHERE state='active' AND expires_at>${now} ORDER BY created_at DESC,id ASC LIMIT ${rules.pageSize} OFFSET 400`
  },
  {
    name: '가격 오름차순',
    sql: `SELECT * FROM djrpg_market WHERE state='active' AND expires_at>${now} ORDER BY price ASC,created_at DESC,id ASC LIMIT ${rules.pageSize} OFFSET 0`
  },
  {
    name: '가격 내림차순 + 가격 범위',
    sql: `SELECT * FROM djrpg_market WHERE state='active' AND expires_at>${now} AND price>=1000 AND price<=50000 ORDER BY price DESC,created_at DESC,id ASC LIMIT ${rules.pageSize} OFFSET 0`
  },
  {
    name: '이름 검색(instr) + 무기 카테고리',
    sql: `SELECT * FROM djrpg_market WHERE state='active' AND expires_at>${now} AND instr(name,'클레이')>0 AND slot IN ('weapon','offhand') ORDER BY created_at DESC,id ASC LIMIT ${rules.pageSize} OFFSET 0`
  },
  {
    name: '스탯 필터(json_extract) + 정렬',
    sql: `SELECT * FROM djrpg_market WHERE state='active' AND expires_at>${now} AND COALESCE(json_extract(item_json,'$.stats.attack'),0)>=300 ORDER BY COALESCE(json_extract(item_json,'$.stats.attack'),0) DESC,created_at DESC,id ASC LIMIT ${rules.pageSize} OFFSET 0`
  },
  {
    name: '내 매물(판매자)',
    sql: `SELECT * FROM djrpg_market WHERE seller='seller7' AND state='active' AND expires_at>${now}`
  },
  {
    name: '시세(최근 체결 10건)',
    sql: `SELECT price,sold_at FROM djrpg_market WHERE state='sold' AND name='낡은 두손검' AND rarity='rare' AND slot='weapon' ORDER BY sold_at DESC,id DESC LIMIT 10`
  }
];
try {
  console.log(`[거래소 실행 계획] 매물 ${rows.toLocaleString('ko-KR')}건(그중 판매 완료 ${Math.floor(rows / 5).toLocaleString('ko-KR')}건) · 임시 파일 DB`);
  for (const item of cases) {
    const measured = await time(item.sql);
    console.log(`\n■ ${item.name}`);
    for (const detail of await plan(item.sql)) console.log(`   ${detail}`);
    console.log(`   실측 ${measured.ms.toFixed(2)}ms · 반환 ${measured.rows}행`);
  }
  console.log('\n해석: `SEARCH ... USING INDEX`가 나오고 실측이 수 ms 안쪽이면 병목이 아니다. `SCAN`+`USE TEMP B-TREE`가');
  console.log('나오더라도 결과가 페이지 크기(20행)로 잘리고 실측이 충분히 빠르면 인덱스를 늘리지 않는다 — 쓰기 비용과');
  console.log('저장 공간이 늘고, 정렬 기준(가격·스탯)이 여러 개라 인덱스로 모두 덮을 수 없다.');
} finally {
  await db.close();
  await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {});
}
