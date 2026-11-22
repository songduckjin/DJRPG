#!/usr/bin/env node
/**
 * 테스트 서버 초기화 & 보상 우편 일괄 지급 (2026-11-22 스킬 개편 파트 B, 송덕진 님 확정).
 *
 * 패치가 운영 DB에 반영될 때 **덕진 님 측에서** 이 스크립트를 한 번 돌린다. 우리 쪽에는 운영
 * `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` 접근 권한이 없으므로, 여기에는 실행 순서·범위·건수를
 * 그대로 확인할 수 있는 계획(dry-run)만 만들고 실제 실행은 `--apply`로 넘긴다.
 *
 * **초기화 범위** — 계정(아이디·비밀번호)만 남기고 전부 비운다.
 *   · 캐릭터(레벨·경험치·장비·가방·스킬·진행)
 *   · 아이템: 가방·장착·공용창고·거래소 매물·수령함·아이템 소유 기록
 *   · 스테이지: 일반 층수(`floor`/`maxFloor`)·끝없는 던전(`dungeonFloor`)·던전 순위·월드보스 기록
 *   · 계정 공용 금화·다이아 지갑(잔액 0)·캐릭터 슬롯(3)
 *   · 여정(일일·주간·업적·우편함)
 *   · 결제 **기록**(주문·원장·영수증)은 지우지 않는다 — 금전 기록은 초기화 대상이 아니다.
 *
 * **보상** — 기존 전체 계정(게스트 제외) 우편함에 **다이아 5,000개 + 무작위 보물 주머니 30개** 1통.
 * 다이아는 우편에서 받는 순간 `djrpg_shop_wallet`에 들어가고, 지급 이력은 `djrpg_shop_ledger`의
 * `(account_id, 'mail', 우편 id)` UNIQUE로 **한 계정에 한 번만** 남는다(재실행해도 두 번 들어가지 않는다).
 *
 * **사용법**
 *   1) 계획만 보기(기본, 아무것도 쓰지 않는다)
 *        TURSO_DATABASE_URL='libsql://…' TURSO_AUTH_TOKEN='…' node scripts/reset-server-test.mjs --dry-run
 *   2) 실제 실행
 *        TURSO_DATABASE_URL='libsql://…' TURSO_AUTH_TOKEN='…' node scripts/reset-server-test.mjs --apply
 *   3) 로컬 파일 DB로 리허설
 *        node scripts/reset-server-test.mjs --url file:./local.db --apply
 *
 * `--apply` 없이 부르면 `--dry-run`과 같다(기본이 안전한 쪽). 한 트랜잭션으로 끝나며, 중간에 실패하면
 * 아무것도 반영되지 않는다.
 */
import { createClient } from '@libsql/client';
import { pathToFileURL } from 'node:url';
import { seasonResetSave } from '../server/save-seed.mjs';
import {
  APOLOGY_MAIL_ID, DIAMOND_MAIL_ID, LEGACY_DIAMOND_MAIL_ID, SEASON_NOTICE_ID,
  UPDATE_NOTICE_2_ID, UPDATE_NOTICE_ID
} from '../server/journey-state.mjs';

/** 이번 초기화 우편의 id — 새 ID라야 옛 원장 행과 부딪히지 않는다(시즌 안내 우편 핫픽스 220과 같은 이유). */
export const RESET_MAIL_ID = 'test-reset-2026-11-22-reward';
/** 보상 수량(송덕진 님 확정). */
export const RESET_DIAMONDS = 5000;
export const RESET_POUCHES = 30;
/** 초기화 뒤에도 다시 붙지 않아야 하는 지난 안내·보상 우편 id — 지급 이력으로 미리 채운다. */
export const HISTORICAL_NOTICE_IDS = [UPDATE_NOTICE_ID, SEASON_NOTICE_ID, APOLOGY_MAIL_ID, UPDATE_NOTICE_2_ID, LEGACY_DIAMOND_MAIL_ID, DIAMOND_MAIL_ID];

/**
 * 비우는 표 — `server/season.mjs`의 `RESET_TABLES`와 같은 목록에 캐릭터·던전 시도 표를 더한다.
 * (`djrpg_characters`는 시즌 초기화가 따로 지우므로 season.mjs 목록에는 없다.)
 */
export const RESET_TABLES = [
  'djrpg_market', 'djrpg_market_events', 'djrpg_market_inbox', 'djrpg_market_requests',
  'djrpg_warehouse', 'djrpg_warehouse_requests',
  'djrpg_item_owners', 'djrpg_character_item_owners',
  'djrpg_characters',
  'djrpg_dungeon_records', 'djrpg_dungeon_attempts',
  'djrpg_boss_days', 'djrpg_boss_attempts', 'djrpg_boss_scores', 'djrpg_boss_rewards',
  'djrpg_journey', 'djrpg_save_requests', 'djrpg_save_versions',
  'djrpg_announcements'
];

const MAIL_TITLE = '[테스트 시즌 초기화] 보상 안내';
const MAIL_BODY = `안녕하세요, 모험가님!

스킬 개편과 함께 테스트 서버가 새로 시작되었습니다.
지난 시즌의 레벨·장비·가방·창고·거래소·층수·던전 기록은 모두 정리되었고, **아이디와 비밀번호는 그대로**입니다.

로그인하면 먼저 직업과 성별을 새로 고르는 화면이 나옵니다. 고른 직업의 무기를 받고 1층부터 다시 모험을 시작해 주세요!

다시 달려 주시는 마음에 보상으로 **다이아 5,000개**와 **무작위 보물 주머니 30개**를 보내드립니다.
보물 주머니에서는 금화·장비·영구 스탯북이 나옵니다(영구 스탯북은 공격의 서·방어의 서·체력의 서 3종).

새 시즌에서도 즐거운 모험 되시길 바랍니다.`;

const now = () => Date.now();

/** 이번 초기화 뒤 처음 로그인한 계정에 붙는 여정 상태 — 보상 우편 1통 + 지난 안내 지급 이력. */
export function seededJourneyState(createdAt = now()) {
  return {
    achievements: [],
    notices: [...HISTORICAL_NOTICE_IDS],
    mail: [{
      id: RESET_MAIL_ID, title: MAIL_TITLE, sender: '운영팀', body: MAIL_BODY,
      createdAt, expiresAt: null, gold: 0, books: 0, pouches: RESET_POUCHES, diamonds: RESET_DIAMONDS,
      claimedAt: null, read: false
    }]
  };
}

/** 표가 있는지 — 처음 쓰일 때 만들어지는 표(던전·월드보스·상점)는 없을 수 있다.
 *  `RESET_TABLES`뿐 아니라 지갑·프로필·원장 표까지 봐야 하므로 **DB의 모든 표**를 읽는다. */
async function existingTables(db) {
  const rows = (await db.execute({ sql: "SELECT name FROM sqlite_master WHERE type='table'", args: [] })).rows;
  return new Set(rows.map(row => String(row.name)));
}

/** 지금 상태를 읽어 계획을 만든다(쓰기 없음). */
export async function planReset(db) {
  const tables = await existingTables(db);
  // 빈 파일 DB(로컬 리허설 오타 등)에는 표가 없다 — 스택 대신 이 한 줄로 알린다.
  if (!tables.has('djrpg_accounts')) return { tables: {}, accounts: 0, guestAccounts: 0, rewardAccounts: 0, missingTables: true };
  const counts = {};
  for (const table of RESET_TABLES) {
    if (!tables.has(table)) continue;
    const row = (await db.execute({ sql: `SELECT COUNT(*) AS n FROM ${table}`, args: [] })).rows[0];
    counts[table] = Number(row?.n ?? 0);
  }
  const accounts = (await db.execute({ sql: 'SELECT id, password_hash FROM djrpg_accounts ORDER BY id', args: [] })).rows;
  return {
    tables: counts,
    accounts: accounts.length,
    guestAccounts: accounts.filter(row => row.password_hash === 'guest').length,
    rewardAccounts: accounts.filter(row => row.password_hash !== 'guest').length
  };
}

/**
 * 초기화를 실행한다. `apply`가 false면 아무것도 쓰지 않고 계획만 돌려준다.
 * 한 트랜잭션이므로 중간에 실패하면 전부 되돌아간다.
 */
export async function resetServer(db, { apply = false } = {}) {
  const plan = await planReset(db);
  if (plan.missingTables) throw new Error('이 DB에는 djrpg_accounts 표가 없습니다 — 운영 DB URL(또는 스키마가 만들어진 파일 DB)을 지정했는지 확인하세요.');
  if (!apply) return { applied: false, plan };
  const createdAt = now();
  const season = JSON.stringify(seasonResetSave(''));
  const journal = JSON.stringify(seededJourneyState(createdAt));
  const statements = [];
  const tables = await existingTables(db);
  for (const table of RESET_TABLES) if (tables.has(table)) statements.push(`DELETE FROM ${table}`);
  // 계정 행: 세이브만 새 시즌 모양으로 되돌린다(아이디·비밀번호·세션은 그대로).
  statements.push({
    sql: `UPDATE djrpg_accounts SET save_json = json_set(?, '$.accountId', id, '$.name', COALESCE(NULLIF(json_extract(save_json, '$.name'), ''), id)), updated_at = ?
          WHERE 1`,
    args: [season, new Date(createdAt).toISOString()]
  });
  if (tables.has('djrpg_account_profiles')) statements.push('UPDATE djrpg_account_profiles SET shared_gold = 0, active_slot = 1');
  if (tables.has('djrpg_shop_wallet')) statements.push('UPDATE djrpg_shop_wallet SET diamonds = 0, max_slots = 3');
  if (tables.has('djrpg_shop_entitlements')) statements.push('DELETE FROM djrpg_shop_entitlements');
  // 이 우편의 다이아 원장 행만 지운다 — 같은 id로 다시 지급해도 UNIQUE에 걸리지 않는다(다른 원장은 보존).
  if (tables.has('djrpg_shop_ledger')) statements.push({ sql: "DELETE FROM djrpg_shop_ledger WHERE source_type='mail' AND source_id=?", args: [RESET_MAIL_ID] });
  // 지갑 행이 없는 계정에도 우편을 받을 수 있게 만들어 둔다(claim 쪽도 INSERT OR IGNORE를 한다).
  if (tables.has('djrpg_shop_wallet')) statements.push('INSERT OR IGNORE INTO djrpg_shop_wallet(account_id, customer_key) SELECT id, lower(hex(randomblob(16))) FROM djrpg_accounts WHERE password_hash <> \'guest\'');
  // 게스트를 뺀 모든 계정에 이번 초기화 여정(보상 우편 1통)을 깔아 둔다.
  if (tables.has('djrpg_journey')) statements.push({
    sql: "INSERT INTO djrpg_journey(account_id, state_json) SELECT id, ? FROM djrpg_accounts WHERE password_hash <> 'guest'",
    args: [journal]
  });
  // 시즌 번호를 맞춰 두어 앱의 자동 시즌 초기화가 다시 돌지 않게 한다.
  if (tables.has('djrpg_meta')) statements.push("INSERT INTO djrpg_meta(key,value) VALUES('season_epoch','2') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  if (statements.length) await db.batch(statements, 'write');
  const after = await planReset(db);
  return { applied: true, plan, after };
}

/** `--url`·`--dry-run`·`--apply` 해석. */
export function parseArgs(argv) {
  const options = { apply: false, url: undefined };
  for (const [index, arg] of argv.entries()) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') options.apply = false;
    else if (arg === '--url') options.url = argv[index + 1];
    else if (arg.startsWith('--url=')) options.url = arg.slice('--url='.length);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const url = options.url ?? process.env.TURSO_DATABASE_URL;
  if (!url) {
    console.error('TURSO_DATABASE_URL(또는 --url)이 없습니다. 운영 DB의 URL·토큰을 넣고 다시 실행하세요.');
    process.exitCode = 1;
    return;
  }
  const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  try {
    if ((await planReset(db)).missingTables) {
      console.error(`이 DB에 DJRPG 표가 없습니다(${url}). 운영 DB URL(또는 스키마가 만들어진 파일 DB)인지 확인하세요.`);
      process.exitCode = 1;
      return;
    }
    const result = await resetServer(db, { apply: options.apply });
    const { tables, accounts, guestAccounts, rewardAccounts } = result.plan;
    console.log(`\n[테스트 서버 초기화] ${options.apply ? '실행' : '계획(dry-run)'} — 계정 ${accounts}개(게스트 ${guestAccounts} · 보상 대상 ${rewardAccounts})`);
    for (const [table, count] of Object.entries(tables)) if (count) console.log(`  비움  ${table}: ${count}행`);
    console.log(`  보상  다이아 ${RESET_DIAMONDS.toLocaleString('ko-KR')}개 + 무작위 보물 주머니 ${RESET_POUCHES}개 → 계정 ${rewardAccounts}개 우편함`);
    if (!options.apply) {
      console.log('\n아무것도 쓰지 않았습니다. 실제로 실행하려면 `--apply`를 붙이세요.');
      return;
    }
    const left = result.after.tables;
    console.log(`\n완료 — 남은 행: ${Object.entries(left).filter(([, n]) => n).map(([table, n]) => `${table} ${n}`).join(' · ') || '없음'}`);
    console.log(`계정 ${result.after.accounts}개는 그대로입니다(아이디·비밀번호 유지). 첫 로그인에서 직업·성별을 고르면 초기화 보상 우편이 보입니다.`);
  } finally {
    await db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
