#!/usr/bin/env node
// 작업 255 — **소실된(consumed) 스킬북 조회**. 데이터를 바꾸지 않는 읽기 전용 스크립트다.
//
// 배경: 클라이언트 `migrateItem`이 패시브 스킬북을 세이브에서 버리던 버그로, 방치 보상·드롭으로 받은
// 패시브 책이 `djrpg_item_owners.location='consumed'`로 남았다(아이템 JSON은 지워지지 않는다).
// 복구 여부·범위는 사용자가 정하므로, 이 스크립트는 **후보를 나열만 한다**.
//
// 사용법:
//   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... \
//     node scripts/list-consumed-skillbooks.mjs --login fks3997 [--json]
import { createClient } from '@libsql/client';

const args = process.argv.slice(2);
const login = (() => { const index = args.indexOf('--login'); return index >= 0 ? args[index + 1] : undefined; })();
const asJson = args.includes('--json');
const url = process.env.TURSO_DATABASE_URL, token = process.env.TURSO_AUTH_TOKEN;
if (!url || !token) {
  console.error('TURSO_DATABASE_URL·TURSO_AUTH_TOKEN 환경변수가 필요합니다(운영 값은 Cloudflare Pages 환경변수에 있다).');
  process.exit(2);
}
if (!login) { console.error('--login <로그인 아이디> 가 필요합니다.'); process.exit(2); }

const PASSIVE = new Set(['mastery', 'body', 'instinct', 'bowMastery', 'swiftStep', 'hawkSight', 'staffMastery', 'manaCircuit', 'arcaneSense']);
const client = createClient({ url, authToken: token });
try {
  const rows = (await client.execute({
    sql: `SELECT o.item_id, o.item_json, m.slot FROM djrpg_item_owners o
      LEFT JOIN djrpg_character_item_owners m ON m.item_id=o.item_id
      WHERE o.account_id=? AND o.location='consumed' ORDER BY m.slot, o.item_id`,
    args: [login]
  })).rows;
  const books = [];
  for (const row of rows) {
    let item;
    try { item = JSON.parse(row.item_json); } catch { continue; }
    if (item?.kind !== 'skillbook' || typeof item.skillId !== 'string') continue;
    books.push({ itemId: row.item_id, skillId: item.skillId, name: item.name, slot: row.slot ?? null, passive: PASSIVE.has(item.skillId) });
  }
  if (asJson) { console.log(JSON.stringify({ login, books }, null, 2)); }
  else {
    console.log(`${login} — 소모 처리된 스킬북 ${books.length}권 (그중 패시브 ${books.filter(book => book.passive).length}권)`);
    for (const book of books) console.log(`  ${book.passive ? '패시브' : '액티브'} · ${book.name} (${book.skillId}) · 캐릭터 슬롯 ${book.slot ?? '?'} · ${book.itemId}`);
    console.log('  ※ 스킬 습득·합성으로 정상 소모된 책도 함께 나온다. 복구 대상은 사용자가 고른다.');
  }
} finally { await client.close(); }
