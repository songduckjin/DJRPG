import { randomUUID } from 'node:crypto';
import { journeyState, journeyOperation } from './journey-state.mjs';
import { skillBookIdSet, countedInBag } from './skill-ids.mjs';
import { databaseFactory } from './database-config.mjs';
import { runtimeEnv } from './env.mjs';

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new ApiError(status, code, message); };
/** 메인 사냥의 마지막 층 — `src/game/store.ts`의 `MAX_FLOOR`와 같은 값이다(작업 204). */
export const MAX_FLOOR = 20;
export const client = (env = runtimeEnv()) => {
  const createClient = databaseFactory();
  if (!createClient || !env?.TURSO_DATABASE_URL || !env?.TURSO_AUTH_TOKEN) fail(503, 'DB_NOT_CONFIGURED', '서버 DB가 설정되지 않았습니다.');
  return createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_DATABASE_AUTH_TOKEN || env.TURSO_AUTH_TOKEN });
};
const initializedSchemas = new Map();
const sessionColumn = 'ALTER TABLE djrpg_accounts ADD COLUMN session_id TEXT';
const transientDatabaseError = error => /SQLITE_BUSY|SQLITE_LOCKED|SERVER_ERROR|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|network|timeout|temporarily unavailable|service unavailable/i.test(String(error?.code ?? '') + ' ' + String(error?.message ?? ''));
export async function schema(db, env = runtimeEnv()) {
  const key = db.url ?? env?.TURSO_DATABASE_URL ?? db;
  if (initializedSchemas.has(key)) return initializedSchemas.get(key);
  const statements = [
    'CREATE TABLE IF NOT EXISTS djrpg_accounts (id TEXT PRIMARY KEY COLLATE NOCASE, password_hash TEXT NOT NULL, save_json TEXT NOT NULL, updated_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS djrpg_journey (account_id TEXT PRIMARY KEY COLLATE NOCASE, state_json TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS djrpg_save_requests (account_id TEXT PRIMARY KEY COLLATE NOCASE, request_id TEXT NOT NULL, revision INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS djrpg_save_versions (account_id TEXT PRIMARY KEY COLLATE NOCASE, revision INTEGER NOT NULL DEFAULT 0)',
    `CREATE TABLE IF NOT EXISTS djrpg_market (id TEXT PRIMARY KEY, seller TEXT NOT NULL COLLATE NOCASE, seller_name TEXT NOT NULL, buyer TEXT COLLATE NOCASE, item_json TEXT NOT NULL, name TEXT NOT NULL, slot TEXT NOT NULL, rarity TEXT NOT NULL, price INTEGER NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, sold_at INTEGER)`,
    'CREATE INDEX IF NOT EXISTS djrpg_market_state_time ON djrpg_market(state, created_at)',
    'CREATE INDEX IF NOT EXISTS djrpg_market_seller ON djrpg_market(seller, state)',
    'CREATE INDEX IF NOT EXISTS djrpg_market_recent_price ON djrpg_market(state,name,rarity,sold_at)',
    'CREATE INDEX IF NOT EXISTS djrpg_market_buyer ON djrpg_market(buyer, sold_at)',
    'CREATE TABLE IF NOT EXISTS djrpg_market_inbox (id TEXT PRIMARY KEY, account_id TEXT NOT NULL COLLATE NOCASE, listing_id TEXT NOT NULL, kind TEXT NOT NULL, item_json TEXT, gold INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL, created_at INTEGER NOT NULL, claimed_at INTEGER, UNIQUE(listing_id,kind))',
    'CREATE INDEX IF NOT EXISTS djrpg_market_inbox_owner ON djrpg_market_inbox(account_id, claimed_at)',
    'CREATE TABLE IF NOT EXISTS djrpg_item_owners (item_id TEXT PRIMARY KEY, account_id TEXT NOT NULL COLLATE NOCASE, location TEXT NOT NULL, item_json TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS djrpg_market_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, listing_id TEXT NOT NULL, created_at INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS djrpg_market_requests (account_id TEXT NOT NULL COLLATE NOCASE, request_id TEXT NOT NULL, response_json TEXT NOT NULL, PRIMARY KEY(account_id, request_id))'
    , 'CREATE TABLE IF NOT EXISTS djrpg_account_profiles (account_id TEXT PRIMARY KEY COLLATE NOCASE, shared_gold INTEGER NOT NULL, active_slot INTEGER NOT NULL DEFAULT 1)'
    // 서버 전역 표시값(작업 206) — `season_epoch`처럼 한 번만 도는 마이그레이션의 완료 표시를 적는다.
    , 'CREATE TABLE IF NOT EXISTS djrpg_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'
    , 'CREATE TABLE IF NOT EXISTS djrpg_characters (account_id TEXT NOT NULL COLLATE NOCASE, slot INTEGER NOT NULL, save_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(account_id, slot))'
    , 'CREATE TABLE IF NOT EXISTS djrpg_character_item_owners (item_id TEXT PRIMARY KEY, account_id TEXT NOT NULL COLLATE NOCASE, slot INTEGER NOT NULL)'
    , 'CREATE TABLE IF NOT EXISTS djrpg_warehouse (account_id TEXT NOT NULL COLLATE NOCASE, item_id TEXT PRIMARY KEY, item_json TEXT NOT NULL)'
    , 'CREATE TABLE IF NOT EXISTS djrpg_warehouse_requests (account_id TEXT NOT NULL COLLATE NOCASE, request_id TEXT NOT NULL, response_json TEXT NOT NULL, PRIMARY KEY(account_id,request_id))'
    , 'CREATE TABLE IF NOT EXISTS djrpg_shop_wallet (account_id TEXT PRIMARY KEY COLLATE NOCASE, diamonds INTEGER NOT NULL DEFAULT 0, max_slots INTEGER NOT NULL DEFAULT 3, customer_key TEXT NOT NULL)'
    , 'CREATE TABLE IF NOT EXISTS djrpg_shop_orders (order_id TEXT PRIMARY KEY, account_id TEXT NOT NULL COLLATE NOCASE, product_id TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL, provider TEXT NOT NULL, grant_json TEXT NOT NULL, status TEXT NOT NULL, payment_key TEXT UNIQUE, created_at INTEGER NOT NULL, confirmed_at INTEGER)'
    , 'CREATE TABLE IF NOT EXISTS djrpg_shop_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL COLLATE NOCASE, source_type TEXT NOT NULL, source_id TEXT NOT NULL, diamonds_delta INTEGER NOT NULL, created_at INTEGER NOT NULL, UNIQUE(account_id,source_type,source_id))'
    , 'CREATE TABLE IF NOT EXISTS djrpg_shop_entitlements (account_id TEXT NOT NULL COLLATE NOCASE, entitlement_key TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0, expires_at INTEGER, updated_at INTEGER NOT NULL, PRIMARY KEY(account_id,entitlement_key))'
    , 'CREATE TABLE IF NOT EXISTS djrpg_shop_requests (account_id TEXT NOT NULL COLLATE NOCASE, request_id TEXT NOT NULL, response_json TEXT NOT NULL, PRIMARY KEY(account_id,request_id))'
    // 보물 주머니 레전드 전광판(작업 208) — 정식 계정이 테스트한 레전드 획득만 짧게 남는다.
    , 'CREATE TABLE IF NOT EXISTS djrpg_announcements (id TEXT PRIMARY KEY, account_id TEXT NOT NULL COLLATE NOCASE, character TEXT NOT NULL, item TEXT NOT NULL, created_at INTEGER NOT NULL)'
    , 'CREATE INDEX IF NOT EXISTS djrpg_announcements_time ON djrpg_announcements(created_at)'
    , "INSERT OR IGNORE INTO djrpg_account_profiles(account_id,shared_gold,active_slot) SELECT id, COALESCE(CAST(json_extract(save_json,'$.gold') AS INTEGER),0),1 FROM djrpg_accounts WHERE json_valid(save_json)"
    , "INSERT OR IGNORE INTO djrpg_characters(account_id,slot,save_json,updated_at) SELECT id,1,json_remove(save_json,'$.gold'),updated_at FROM djrpg_accounts WHERE json_valid(save_json)"
    , "INSERT OR IGNORE INTO djrpg_shop_wallet(account_id,customer_key) SELECT id,lower(hex(randomblob(16))) FROM djrpg_accounts"
    , `INSERT OR IGNORE INTO djrpg_character_item_owners(item_id,account_id,slot)
       SELECT o.item_id,o.account_id,1 FROM djrpg_item_owners o JOIN djrpg_accounts a ON a.id=o.account_id
       WHERE json_valid(a.save_json) AND o.location='inventory' AND o.item_id IN (
         SELECT json_extract(j.value,'$.id') FROM json_each(a.save_json,'$.bag') j
         UNION SELECT json_extract(j.value,'$.id') FROM json_each(a.save_json,'$.equipment') j
       )`
  ];
  const initialize = async () => {
    await db.execute(statements[0]);
    const sessionColumns = await db.execute("SELECT name FROM pragma_table_info('djrpg_accounts') WHERE name='session_id'");
    if (!sessionColumns.rows.length) {
      try { await db.execute(sessionColumn); }
      catch (error) { if (!/duplicate column name/i.test(String(error?.message ?? error))) throw error; }
    }
    return db.batch(statements.slice(1), 'write');
  };
  const initialized = (async () => {
    try { return await initialize(); }
    catch (error) {
      if (!transientDatabaseError(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, 200));
      return initialize();
    }
  })().catch(error => { initializedSchemas.delete(key); throw error; });
  initializedSchemas.set(key, initialized);
  return initialized;
}
export async function transaction(db, run) {
  const tx = await db.transaction('write');
  try { const result = await run(tx); await tx.commit(); return result; }
  catch (error) { if (!tx.closed) await tx.rollback(); throw error; }
  finally { tx.close(); }
}
export async function account(tx, id) {
  const query = { sql: `SELECT a.*, p.shared_gold, p.active_slot, COALESCE(w.max_slots,3) AS max_slots, c.save_json AS character_json, c.updated_at AS character_updated_at, COALESCE(v.revision,0) AS revision
    FROM djrpg_accounts a JOIN djrpg_account_profiles p ON p.account_id=a.id
    JOIN djrpg_characters c ON c.account_id=a.id AND c.slot=p.active_slot
    LEFT JOIN djrpg_shop_wallet w ON w.account_id=a.id
    LEFT JOIN djrpg_save_versions v ON v.account_id=a.id WHERE a.id=?`, args: [id] };
  let row = (await tx.execute(query)).rows[0];
  if (row) return decodeAccount(row);
  await tx.batch([
    { sql: `INSERT OR IGNORE INTO djrpg_account_profiles(account_id,shared_gold,active_slot)
      SELECT id,COALESCE(CAST(json_extract(save_json,'$.gold') AS INTEGER),0),1 FROM djrpg_accounts WHERE id=? AND json_valid(save_json)`, args: [id] },
    { sql: `INSERT OR IGNORE INTO djrpg_characters(account_id,slot,save_json,updated_at)
      SELECT id,1,json_remove(save_json,'$.gold'),updated_at FROM djrpg_accounts WHERE id=? AND json_valid(save_json)`, args: [id] }
  ]);
  row = (await tx.execute(query)).rows[0];
  return decodeAccount(row);
}
export function decodeAccount(row) {
  if (!row) fail(401, 'INVALID_TOKEN', '계정을 찾을 수 없습니다. 다시 로그인하세요.');
  const save = JSON.parse(row.character_json ?? row.save_json);
  save.gold = Number(row.shared_gold ?? save.gold ?? 0);
  return { ...row, revision: Number(row.revision), slot: Number(row.active_slot ?? 1), save };
}
export const sessionReplaced = () => fail(401, 'SESSION_REPLACED', '다른 기기에서 로그인되어 접속이 해제되었습니다.');
// 세션 번호가 없는 예전 계정・모킹 행은 기존 토큰을 그대로 허용하고, 번호가 있는 계정만 마지막 로그인 토큰을 인정한다.
export function assertSession(row, sid) {
  const current = row?.session_id;
  if (current === undefined || current === null || current === '') return;
  if (typeof sid !== 'string' || sid !== current) sessionReplaced();
}
export async function assertSessionId(db, id, sid) {
  const row = (await db.execute({ sql: 'SELECT session_id FROM djrpg_accounts WHERE id=?', args: [id] })).rows[0];
  if (!row) fail(401, 'INVALID_TOKEN', '계정을 찾을 수 없습니다. 다시 로그인하세요.');
  assertSession(row, sid);
}
// register・guest・login마다 새 세션 번호를 발급해 이전 기기 토큰을 무효화한다.
export async function assignSession(db, id) {
  const sid = randomUUID();
  await db.execute({ sql: 'UPDATE djrpg_accounts SET session_id=? WHERE id=?', args: [sid, id] });
  return sid;
}
export function assertRevision(row, revision) {
  if (!Number.isSafeInteger(revision) || revision !== row.revision) fail(409, 'SAVE_CONFLICT', '다른 탭이나 기기에서 진행 상황이 변경되었습니다. 새로고침하여 최신 데이터를 불러오세요.');
}
const itemsOf = save => [...(save.bag ?? []), ...Object.values(save.equipment ?? {}).filter(Boolean)];
// Fetch both persisted and incoming inventory owners alongside the trade's other reads.
export function inventoryOwnerQuery(id, incoming) {
  const bag = Array.isArray(incoming?.bag) ? incoming.bag : [];
  const equipment = incoming?.equipment && typeof incoming.equipment === 'object' ? Object.values(incoming.equipment) : [];
  if (incoming !== undefined) validateSave(incoming);
  if (bag.filter(item=>item?.slot!=='skillbook' && item?.slot!=='pouch').length > 40 || equipment.length > 10) fail(400, 'INVALID_SAVE', '가방 또는 장비 데이터가 올바르지 않습니다.');
  const ids = [...bag, ...equipment].map(item => item?.id).filter(value => typeof value === 'string');
  return { sql: `SELECT o.*, m.slot AS character_slot FROM djrpg_item_owners o LEFT JOIN djrpg_character_item_owners m ON m.item_id=o.item_id WHERE o.item_id IN (
    SELECT json_extract(j.value,'$.id') FROM djrpg_characters c, json_each(c.save_json,'$.bag') j WHERE c.account_id=?
    UNION SELECT json_extract(j.value,'$.id') FROM djrpg_characters c, json_each(c.save_json,'$.equipment') j WHERE c.account_id=?
    UNION SELECT value FROM json_each(?)
  )`, args: [id, id, JSON.stringify(ids)] };
}
function itemValid(item) {
  // 'pouch' = 무작위 보물 주머니(작업 207) — 장비·스킬북과 같은 이름·등급·stats 형식의 소모품이다.
  const slots = ['weapon','offhand','helmet','armor','necklace','gloves','belt','boots','ring1','ring2','skillbook','pouch'];
  // 스킬북 `skillId`는 **전사·궁수·마법사 33종**(액티브 24·패시브 9)을 모두 허용한다(작업 209).
  // 예전에는 전사 11종만 하드코딩되어 궁수·마법사 스킬북이 저장 때 400 INVALID_ITEM으로 막혔다.
  // 목록은 `server/skill-ids.mjs` 한 곳에 있고 `tests/skillbook-server.test.mjs`가 클라이언트와 같은지 검사한다.
  return item && (item.locked === undefined || typeof item.locked === 'boolean') && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 100 && typeof item.name === 'string' && item.name.length <= 100 && slots.includes(item.slot) && ['common','magic','rare','epic','unique','legendary'].includes(item.rarity) && item.stats && typeof item.stats === 'object' && !Array.isArray(item.stats) && Object.entries(item.stats).every(([key, value]) => ['attack','defense','health','crit','speed'].includes(key) && Number.isFinite(value) && value >= 0 && value <= 100000) && (item.slot !== 'skillbook' || (item.kind === 'skillbook' && skillBookIdSet.has(item.skillId))) && (item.slot !== 'pouch' || item.kind === 'pouch');
}
const ringSlot = item => typeof item?.slot === 'string' && item.slot.startsWith('ring') ? 'ring' : item?.slot;
const itemStats = ['attack','defense','health','crit','speed'];
// 강화 단계(`plus`, 작업 201)는 **표시 전용**이다. 능력치는 이미 각 스탯에 8%씩 반영되어 stats에 들어 있으므로
// identity·sameItemBody는 plus를 보지 않는다 — 옛 장비가 로드 때 보수적으로 역산한 plus를 얻어도, 값이 없는
// 클라이언트가 plus: 0을 보내도 409 ITEM_CONFLICT가 나지 않는다(이름·스탯·등급 검사는 그대로).
const normalizePlus = item => {
  if (item && item.plus !== undefined) {
    const plus = Math.floor(Number(item.plus));
    item.plus = Number.isFinite(plus) ? Math.min(7, Math.max(0, plus)) : 0;
  }
  return item;
};
const identity = item => JSON.stringify([item.name, ringSlot(item), item.rarity, item.kind ?? 'equipment', item.skillId ?? '', ...itemStats.map(key => item.stats?.[key] ?? 0)]);
// 이름만 다른 같은 아이템인지(구버전 클라이언트가 저장 이름을 마이그레이션하며 바꾼 경우) 판정한다.
// stats·rarity·slot·kind·skillId가 달라지면 거짓이므로 능력치·등급 변조 차단은 그대로 유지된다.
const sameItemBody = (a, b) => Boolean(a && b) && a.id === b.id && ringSlot(a) === ringSlot(b) && a.rarity === b.rarity && (a.kind ?? 'equipment') === (b.kind ?? 'equipment') && (a.skillId ?? '') === (b.skillId ?? '') && itemStats.every(key => (a.stats?.[key] ?? 0) === (b.stats?.[key] ?? 0));
// 소유권 테이블의 사본이 깨졌을 수 있으므로 해석 실패는 예외가 아니라 '불일치'로 다룬다.
const ownerItem = owner => { try { const value = JSON.parse(owner.item_json); return value && typeof value === 'object' ? value : undefined; } catch { return undefined; } };
export async function reconcileItems(tx, id, before, after, options = {}) {
  const next = itemsOf(after), previous = itemsOf(before), ids = new Set();
  // 40칸 검사는 장비 + **다른 직업 전용 스킬북**을 함께 센다(작업 210) — 내 직업 책과 보물 주머니는 빼다.
  if (!Array.isArray(after.bag) || after.bag.filter(item => countedInBag(item, after.job)).length > 40 || Object.values(after.equipment??{}).length > 10 || !after.equipment || typeof after.equipment !== 'object') fail(400, 'INVALID_SAVE', '가방 또는 장비 데이터가 올바르지 않습니다.');
  const previousValid = previous.filter(itemValid);
  const previousById = new Map(previousValid.map(item => [item.id, item]));
  const allIds = [...new Set([...previousValid, ...next].map(item => item?.id).filter(id => typeof id === 'string'))];
  const owned = options.owned ?? (allIds.length ? (await tx.execute({ sql: `SELECT * FROM djrpg_item_owners WHERE item_id IN (${allIds.map(() => '?').join(',')})`, args: allIds })).rows : []);
  const owners = new Map(owned.map(owner => [owner.item_id, owner]));
  const slot = Number(options.slot ?? 1);
  const mapped = options.owned ? options.owned.filter(row => row.character_slot !== null && row.character_slot !== undefined).map(row => ({ item_id: row.item_id, slot: row.character_slot }))
    : allIds.length ? (await tx.execute({ sql: `SELECT item_id,slot FROM djrpg_character_item_owners WHERE account_id=? AND item_id IN (${allIds.map(() => '?').join(',')})`, args: [id, ...allIds] })).rows : [];
  const slotsByItem = new Map(mapped.map(row => [row.item_id, Number(row.slot)]));
  const writes = [];
  for (const item of next) {
    normalizePlus(item);
    if (!itemValid(item) || ids.has(item.id)) fail(400, 'INVALID_ITEM', '중복되었거나 잘못된 아이템입니다.');
    ids.add(item.id);
    const owner = owners.get(item.id);
    if (owner) {
      const stored = ownerItem(owner);
      if (String(owner.account_id).toLowerCase() !== id.toLowerCase()) fail(409, 'ITEM_CONFLICT', '다른 계정 소유의 아이템입니다. 최신 데이터를 다시 불러오세요.');
      if (owner.location !== 'inventory') fail(409, 'ITEM_CONFLICT', '창고·거래 중이거나 이미 소모된 아이템입니다. 최신 데이터를 다시 불러오세요.');
      if (!stored || identity(stored) !== identity(item)) {
        // latest.save(before)에 같은 id가 같은 능력치로 이미 있고 이름만 달라졌다면,
        // 구버전 클라이언트의 아이템 이름 마이그레이션으로 보고 서버 세이브 이름으로 되돌려 통과시킨다.
        const known = previousById.get(item.id);
        if (!known || !sameItemBody(known, item)) fail(409, 'ITEM_CONFLICT', '아이템 정보가 서버 기록과 다릅니다. 최신 데이터를 다시 불러오세요.');
        if (item.name !== known.name) item.name = known.name;
        if (!stored || stored.name !== item.name) writes.push({ sql: 'UPDATE djrpg_item_owners SET item_json=? WHERE item_id=?', args: [JSON.stringify(item), item.id] });
      }
    }
    if (slotsByItem.has(item.id) && slotsByItem.get(item.id) !== slot) fail(409, 'ITEM_CONFLICT', '다른 캐릭터의 아이템은 사용할 수 없습니다.');
    if (owner && !slotsByItem.has(item.id) && slot !== 1) fail(409, 'ITEM_CONFLICT', '기존 아이템의 소유 캐릭터를 확인할 수 없습니다.');
    if (!slotsByItem.has(item.id)) writes.push({ sql: 'INSERT INTO djrpg_character_item_owners(item_id,account_id,slot) VALUES (?,?,?)', args: [item.id, id, slot] });
  }
  // Include removed legacy items, preventing resurrection after consumption.
  const unregistered = new Map([...previousValid, ...next].filter(item => !owners.has(item.id)).map(item => [item.id, item]));
  for (const item of unregistered.values()) writes.push({ sql: 'INSERT INTO djrpg_item_owners VALUES (?,?,?,?)', args: [item.id, id, ids.has(item.id) ? 'inventory' : 'consumed', JSON.stringify(item)] });
  for (const item of previousValid) if (!ids.has(item.id) && owners.has(item.id)) writes.push({ sql: "UPDATE djrpg_item_owners SET location='consumed' WHERE item_id=? AND account_id=? AND location='inventory'", args: [item.id, id] });
  if (options.operations) options.operations.push(...writes);
  else if (writes.length) await tx.batch(writes);
}
// load 한 번으로 409 ITEM_CONFLICT 교착에서 빠져나오도록, 다음 save의 reconcileItems가 거부할 조합만 골라 정리한다.
// 소유자가 다른 계정·다른 위치(창고/거래/소모)·다른 캐릭터 슬롯이면 제거하고, 소유자만 다르게 기록된 같은 아이템은 서버 사본으로 복원한다.
const repairedSave = async (tx, row) => {
  const save = row.save;
  if (!save || typeof save !== 'object' || !Array.isArray(save.bag) || !save.equipment || typeof save.equipment !== 'object') return undefined;
  const slot = Number(row.slot ?? 1), account = String(row.id).toLowerCase();
  const equipment = Object.values(save.equipment).filter(Boolean);
  const ids = [...new Set([...save.bag, ...equipment].map(item => item?.id).filter(id => typeof id === 'string'))];
  if (!ids.length) return undefined;
  const placeholders = ids.map(() => '?').join(',');
  const owners = new Map((await tx.execute({ sql: `SELECT * FROM djrpg_item_owners WHERE item_id IN (${placeholders})`, args: ids })).rows.map(owner => [owner.item_id, owner]));
  const slotsByItem = new Map((await tx.execute({ sql: `SELECT item_id,slot FROM djrpg_character_item_owners WHERE account_id=? AND item_id IN (${placeholders})`, args: [row.id, ...ids] })).rows.map(entry => [entry.item_id, Number(entry.slot)]));
  const seen = new Set();
  // 'keep' | 'drop' | { item } — 복원할 서버 사본
  const decide = item => {
    if (!item || typeof item.id !== 'string' || seen.has(item.id)) return 'drop';
    seen.add(item.id);
    const owner = owners.get(item.id), mappedSlot = slotsByItem.get(item.id);
    if (!owner) return mappedSlot !== undefined && mappedSlot !== slot ? 'drop' : 'keep';
    if (String(owner.account_id ?? '').toLowerCase() !== account || owner.location !== 'inventory') return 'drop';
    if (mappedSlot !== undefined ? mappedSlot !== slot : slot !== 1) return 'drop';
    let known;
    try { known = JSON.parse(owner.item_json); } catch { return 'drop'; }
    if (!itemValid(known) || known.id !== item.id) return 'drop';
    return identity(known) === identity(item) ? 'keep' : { item: known };
  };
  let changed = false;
  const bag = [];
  for (const item of save.bag) {
    const decision = decide(item);
    if (decision === 'drop') { changed = true; continue; }
    if (decision !== 'keep') { changed = true; bag.push(decision.item); continue; }
    bag.push(item);
  }
  const equipmentSave = {};
  for (const [key, item] of Object.entries(save.equipment)) {
    if (!item) { equipmentSave[key] = item; continue; }
    const decision = decide(item);
    if (decision === 'drop') { changed = true; continue; }
    if (decision !== 'keep') { changed = true; equipmentSave[key] = decision.item; continue; }
    equipmentSave[key] = item;
  }
  return changed ? { ...save, bag, equipment: equipmentSave } : undefined;
};
// 정리된 세이브는 캐릭터 저장소에도 반영하되, 진행이 아닌 복구이므로 revision·updated_at은 그대로 둔다.
export async function healStaleLoadItems(tx, row) {
  let healed;
  try { healed = await repairedSave(tx, row); } catch (error) { if (error instanceof ApiError) throw error; return row.save; }
  if (!healed) return row.save;
  const characterSave = { ...healed };
  delete characterSave.gold;
  await tx.execute({ sql: 'UPDATE djrpg_characters SET save_json=? WHERE account_id=? AND slot=? AND save_json=?', args: [JSON.stringify(characterSave), row.id, Number(row.slot ?? 1), row.character_json] });
  return healed;
}
export async function writeSave(tx, row, save, operations = [], preserveCollection = true) {
  // `salvageCount`(작업 207)도 누적 통계다 — 줄지 않게 하고, 옛 클라이언트가 값을 빼고 보내도 잃지 않는다.
  for (const field of ['bossKills','playSeconds','salvageCount']) {
    if (save[field] !== undefined && (typeof save[field] !== 'number' || !Number.isFinite(save[field]) || save[field] < 0)) fail(400,'INVALID_SAVE','활동 통계 형식이 올바르지 않습니다.');
    save[field] = preserveCollection ? Math.max(row.save[field] ?? 0, save[field] ?? 0) : save[field] ?? 0;
  }
  // 던전 최고 클리어 층은 순위의 근거다: 0~10의 정수만 받고, 저장된 기록보다 낮아지지 않게 한다
  // (src/game/store.ts의 DUNGEON_MAX_FLOOR). 클리어 시각은 그 층을 처음 기록한 값을 남긴다.
  const previousFloor = Number.isInteger(row.save.dungeonFloor) ? Math.min(10, Math.max(0, row.save.dungeonFloor)) : 0;
  const incomingFloor = save.dungeonFloor === undefined ? previousFloor : save.dungeonFloor;
  if (!Number.isInteger(incomingFloor) || incomingFloor < 0 || incomingFloor > 10) fail(400, 'INVALID_SAVE', '던전 진행 기록 형식이 올바르지 않습니다.');
  const previousAt = Number(row.save.dungeonClearAt) > 0 ? Math.floor(Number(row.save.dungeonClearAt)) : 0;
  const incomingAt = Number(save.dungeonClearAt) > 0 ? Math.floor(Number(save.dungeonClearAt)) : 0;
  save.dungeonFloor = preserveCollection ? Math.max(previousFloor, incomingFloor) : incomingFloor;
  save.dungeonClearAt = save.dungeonFloor === 0 ? 0
    : save.dungeonFloor > incomingFloor ? previousAt
    : previousAt && incomingAt ? Math.min(previousAt, incomingAt)
    : previousAt || incomingAt;
  save.accountId = row.id; save.lastActiveAt = Date.now();
  // 메인 층 상한(작업 204): 1~20의 정수만 저장한다. 21층 이상에 있던 예전 세이브는 20층으로 보정하고
  // 최고 층도 20층을 넘지 않는다 — 장비·아이템·처치 기록은 그대로 둔다.
  const previousMainFloor = Number.isInteger(row.save.floor) ? row.save.floor : 1;
  save.floor = Math.max(1, Math.min(MAX_FLOOR, Number.isInteger(save.floor) ? save.floor : previousMainFloor));
  save.maxFloor = Math.max(save.floor, Math.min(MAX_FLOOR, Number.isInteger(save.maxFloor) ? save.maxFloor : save.floor));
  // Older clients may omit discovery history; never erase already-recorded entries.
  const previousCollection = preserveCollection && Array.isArray(row.save.equipmentCollection) ? row.save.equipmentCollection : [];
  const incomingCollection = Array.isArray(save.equipmentCollection) ? save.equipmentCollection : [];
  // 발견 기록은 **등급별 한 칸**(`부위:번호:등급`)이다(작업 208) — 옛 `부위:번호` 키는 버린다.
  // 무기는 대검 0~9 · 활 10~19 · 지팡이 20~29라 번호가 두 자리까지 온다. 95종 × 6등급 = 570칸.
  save.equipmentCollection = [...new Set([...previousCollection, ...incomingCollection].filter(key => typeof key === 'string' && /^(weapon|offhand|helmet|armor|necklace|gloves|belt|boots|ring):\d{1,2}:(common|magic|rare|epic|unique|legendary)$/.test(key)))].slice(0, 570);
  if (!Number.isSafeInteger(save.gold) || save.gold < 0 || save.gold > 9_000_000_000_000) fail(400, 'INVALID_GOLD', '금화 값이 올바르지 않습니다.');
  if (Number(row.slot) < 1 || Number(row.slot) > Number(row.max_slots ?? 3)) fail(409, 'CHARACTER_CONFLICT', '현재 캐릭터를 다시 불러오세요.');
  if (!row.skipJourney) operations = [...operations, journeyOperation(row.id, await journeyState(tx, row, save))];
  const revision = row.revision + 1;
  const characterSave = structuredClone(save);
  delete characterSave.gold;
  await tx.batch([...operations,
    { sql: 'UPDATE djrpg_characters SET save_json=?,updated_at=? WHERE account_id=? AND slot=?', args: [JSON.stringify(characterSave), new Date().toISOString(), row.id, row.slot] },
    { sql: 'UPDATE djrpg_account_profiles SET shared_gold=? WHERE account_id=?', args: [save.gold, row.id] },
    { sql: 'UPDATE djrpg_accounts SET updated_at=? WHERE id=?', args: [new Date().toISOString(), row.id] },
    { sql: 'INSERT INTO djrpg_save_versions VALUES (?,?) ON CONFLICT(account_id) DO UPDATE SET revision=excluded.revision', args: [row.id, revision] }
  ]);
  return { save, revision };
}
export function validateSave(save) {
  if (!save || typeof save !== 'object' || Array.isArray(save) || save.version !== 1 || JSON.stringify(save).length > 1_000_000) fail(400, 'INVALID_SAVE', '저장 데이터 형식이 올바르지 않습니다.');
}
