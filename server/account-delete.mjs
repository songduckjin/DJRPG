/**
 * 계정 탈퇴(아이디 삭제)가 지우는 표와 삭제 한 벌 — 작업 223.
 *
 * 계정 id가 들어가는 표를 **하나도 남기지 않는다**. 하나라도 남으면 같은 아이디로 다시 가입한
 * 사람이 이전 주인의 캐릭터(그리고 그 안의 `account()` 자기 복구 경로) · 창고 · 우편 · 결제 기록을
 * 그대로 물려받는다. 아이디를 즉시 다시 쓸 수 있어야 한다는 요구도 같은 이유다.
 *
 * 던전 · 월드보스 · 전광판 표는 처음 쓰일 때 만들어지므로(`server/dungeon-schema.mjs`·
 * `world-boss-schema.mjs`), 실제 삭제는 `sqlite_master`에 있는 표만 골라 한다(시즌 초기화와 같은 방식).
 */

/** `account_id` 열로 계정에 매달린 표 — 새 계정 종속 표를 만들면 여기에 반드시 함께 적는다. */
export const ACCOUNT_TABLES = [
  'djrpg_account_profiles',
  'djrpg_characters',
  'djrpg_character_item_owners',
  'djrpg_item_owners',
  'djrpg_warehouse',
  'djrpg_warehouse_requests',
  'djrpg_journey',
  'djrpg_save_versions',
  'djrpg_save_requests',
  'djrpg_market_inbox',
  'djrpg_market_requests',
  // 여정(우편·보상) 멱등 표 — 거래소 표와 분리했다(작업 260). 계정 id가 들어가므로 탈퇴 때 함께 지운다.
  'djrpg_journey_requests',
  'djrpg_dungeon_records',
  'djrpg_dungeon_attempts',
  'djrpg_boss_attempts',
  'djrpg_boss_scores',
  'djrpg_boss_rewards',
  'djrpg_announcements',
  'djrpg_shop_wallet',
  'djrpg_shop_orders',
  'djrpg_shop_ledger',
  'djrpg_shop_entitlements',
  'djrpg_shop_requests'
];

/** `account_id`가 아니라 `seller`/`buyer`로 계정을 가리키는 표는 따로 지운다. */
export const MARKET_TABLE = 'djrpg_market';

const existingTables = async (tx, tables) => new Set((await tx.execute({
  sql: `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${tables.map(() => '?').join(',')})`,
  args: tables
})).rows.map(row => String(row.name)));

/**
 * 탈퇴 계정의 모든 행을 지운다. 반드시 `transaction(db, ...)` 안에서 부른다.
 *
 * 판매 중인 매물은 **자동으로 취소**한다 — 판매자가 사라진 매물을 남겨 두면 사는 사람이 실패하는
 * 유령 매물이 되고, 탈퇴하는 사람에게 "먼저 거래소를 정리하세요"를 요구하면 아이디를 지울 수 없다.
 * 돌려주는 값은 화면 안내에 쓰는 개수다.
 */
export async function deleteAccountData(tx, id) {
  // 매물 알림(`djrpg_market_events`)은 계정이 아니라 매물 id로 붙는다 — 확인만 하고 아래에서 매물별로 지운다.
  const existing = await existingTables(tx, [...ACCOUNT_TABLES, MARKET_TABLE, 'djrpg_market_events']);
  const countOf = async (table, where, args) => existing.has(table)
    ? Number((await tx.execute({ sql: `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, args })).rows[0].n)
    : 0;

  const characters = await countOf('djrpg_characters', 'account_id=?', [id]);
  const listings = await countOf(MARKET_TABLE, "seller=? AND state='active' AND expires_at>?", [id, Date.now()]);
  const wallet = existing.has('djrpg_shop_wallet')
    ? (await tx.execute({ sql: 'SELECT diamonds FROM djrpg_shop_wallet WHERE account_id=?', args: [id] })).rows[0]
    : undefined;

  const statements = ACCOUNT_TABLES
    .filter(table => existing.has(table))
    .map(table => ({ sql: `DELETE FROM ${table} WHERE account_id=?`, args: [id] }));

  if (existing.has(MARKET_TABLE)) {
    // 산 매물·판 기록·진행 중 매물을 모두 지운다. 다른 사용자의 판매 대금·물건은 거래 시점에
    // 이미 각자의 `djrpg_market_inbox`로 배달되므로 여기서 지우는 것은 이 계정의 몫뿐이다.
    const owned = (await tx.execute({ sql: 'SELECT id FROM djrpg_market WHERE seller=? OR buyer=?', args: [id, id] })).rows;
    statements.push({ sql: 'DELETE FROM djrpg_market WHERE seller=? OR buyer=?', args: [id, id] });
    if (existing.has('djrpg_market_events')) {
      for (const row of owned) statements.push({ sql: 'DELETE FROM djrpg_market_events WHERE listing_id=?', args: [String(row.id)] });
    }
  }

  // 아이디 행은 맨 마지막 — 이 행이 남아 있으면 재가입이 409로 막힌다.
  statements.push({ sql: 'DELETE FROM djrpg_accounts WHERE id=?', args: [id] });
  await tx.batch(statements);
  return { characters, listings, diamonds: Number(wallet?.diamonds ?? 0) };
}
