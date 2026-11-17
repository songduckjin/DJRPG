import { journeyState, journeyOperation } from './journey-state.mjs';
import { databaseFactory } from './database-config.mjs';
import { runtimeEnv } from './env.mjs';

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new ApiError(status, code, message); };
export const client = (env = runtimeEnv()) => {
  const createClient = databaseFactory();
  if (!createClient || !env?.TURSO_DATABASE_URL || !env?.TURSO_AUTH_TOKEN) fail(503, 'DB_NOT_CONFIGURED', '서버 DB가 설정되지 않았습니다.');
  return createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
};
const initializedSchemas = new Map();
export async function schema(db, env = runtimeEnv()) {
  const key = db.url ?? env?.TURSO_DATABASE_URL ?? db;
  if (initializedSchemas.has(key)) return initializedSchemas.get(key);
  const initialized = db.batch([
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
    , 'CREATE TABLE IF NOT EXISTS djrpg_characters (account_id TEXT NOT NULL COLLATE NOCASE, slot INTEGER NOT NULL, save_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(account_id, slot))'
    , 'CREATE TABLE IF NOT EXISTS djrpg_character_item_owners (item_id TEXT PRIMARY KEY, account_id TEXT NOT NULL COLLATE NOCASE, slot INTEGER NOT NULL)'
    , 'CREATE TABLE IF NOT EXISTS djrpg_warehouse (account_id TEXT NOT NULL COLLATE NOCASE, item_id TEXT PRIMARY KEY, item_json TEXT NOT NULL)'
    , 'CREATE TABLE IF NOT EXISTS djrpg_warehouse_requests (account_id TEXT NOT NULL COLLATE NOCASE, request_id TEXT NOT NULL, response_json TEXT NOT NULL, PRIMARY KEY(account_id,request_id))'
    , "INSERT OR IGNORE INTO djrpg_account_profiles(account_id,shared_gold,active_slot) SELECT id, COALESCE(CAST(json_extract(save_json,'$.gold') AS INTEGER),0),1 FROM djrpg_accounts WHERE json_valid(save_json)"
    , "INSERT OR IGNORE INTO djrpg_characters(account_id,slot,save_json,updated_at) SELECT id,1,json_remove(save_json,'$.gold'),updated_at FROM djrpg_accounts WHERE json_valid(save_json)"
    , `INSERT OR IGNORE INTO djrpg_character_item_owners(item_id,account_id,slot)
       SELECT o.item_id,o.account_id,1 FROM djrpg_item_owners o JOIN djrpg_accounts a ON a.id=o.account_id
       WHERE json_valid(a.save_json) AND o.location='inventory' AND o.item_id IN (
         SELECT json_extract(j.value,'$.id') FROM json_each(a.save_json,'$.bag') j
         UNION SELECT json_extract(j.value,'$.id') FROM json_each(a.save_json,'$.equipment') j
       )`
  ], 'write').catch(error => { initializedSchemas.delete(key); throw error; });
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
  const query = { sql: `SELECT a.*, p.shared_gold, p.active_slot, c.save_json AS character_json, c.updated_at AS character_updated_at, COALESCE(v.revision,0) AS revision
    FROM djrpg_accounts a JOIN djrpg_account_profiles p ON p.account_id=a.id
    JOIN djrpg_characters c ON c.account_id=a.id AND c.slot=p.active_slot
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
export function assertRevision(row, revision) {
  if (!Number.isSafeInteger(revision) || revision !== row.revision) fail(409, 'SAVE_CONFLICT', '다른 탭이나 기기에서 진행 상황이 변경되었습니다. 새로고침하여 최신 데이터를 불러오세요.');
}
const itemsOf = save => [...(save.bag ?? []), ...Object.values(save.equipment ?? {}).filter(Boolean)];
// Fetch both persisted and incoming inventory owners alongside the trade's other reads.
export function inventoryOwnerQuery(id, incoming) {
  const bag = Array.isArray(incoming?.bag) ? incoming.bag : [];
  const equipment = incoming?.equipment && typeof incoming.equipment === 'object' ? Object.values(incoming.equipment) : [];
  if (incoming !== undefined) validateSave(incoming);
  if (bag.filter(item=>item?.slot!=='skillbook').length > 40 || equipment.length > 10) fail(400, 'INVALID_SAVE', '가방 또는 장비 데이터가 올바르지 않습니다.');
  const ids = [...bag, ...equipment].map(item => item?.id).filter(value => typeof value === 'string');
  return { sql: `SELECT o.*, m.slot AS character_slot FROM djrpg_item_owners o LEFT JOIN djrpg_character_item_owners m ON m.item_id=o.item_id WHERE o.item_id IN (
    SELECT json_extract(j.value,'$.id') FROM djrpg_characters c, json_each(c.save_json,'$.bag') j WHERE c.account_id=?
    UNION SELECT json_extract(j.value,'$.id') FROM djrpg_characters c, json_each(c.save_json,'$.equipment') j WHERE c.account_id=?
    UNION SELECT value FROM json_each(?)
  )`, args: [id, id, JSON.stringify(ids)] };
}
function itemValid(item) {
  const slots = ['weapon','offhand','helmet','armor','necklace','gloves','belt','boots','ring1','ring2','skillbook'];
  return item && (item.locked === undefined || typeof item.locked === 'boolean') && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 100 && typeof item.name === 'string' && item.name.length <= 100 && slots.includes(item.slot) && ['common','magic','rare','epic','unique','legendary'].includes(item.rarity) && item.stats && typeof item.stats === 'object' && !Array.isArray(item.stats) && Object.entries(item.stats).every(([key, value]) => ['attack','defense','health','crit','speed'].includes(key) && Number.isFinite(value) && value >= 0 && value <= 100000) && (item.slot !== 'skillbook' || (item.kind === 'skillbook' && ['slash2','spin','crushing','slam','warcry','power','destroy','hell','mastery','body','instinct'].includes(item.skillId)));
}
const identity = item => JSON.stringify([item.name, item.slot.startsWith('ring') ? 'ring' : item.slot, item.rarity, item.kind ?? 'equipment', item.skillId ?? '', ...['attack','defense','health','crit','speed'].map(key => item.stats[key] ?? 0)]);
export async function reconcileItems(tx, id, before, after, options = {}) {
  const next = itemsOf(after), previous = itemsOf(before), ids = new Set();
  if (!Array.isArray(after.bag) || after.bag.filter(item=>item?.slot!=='skillbook').length > 40 || Object.values(after.equipment??{}).length > 10 || !after.equipment || typeof after.equipment !== 'object') fail(400, 'INVALID_SAVE', '가방 또는 장비 데이터가 올바르지 않습니다.');
  const previousValid = previous.filter(itemValid);
  const allIds = [...new Set([...previousValid, ...next].map(item => item?.id).filter(id => typeof id === 'string'))];
  const owned = options.owned ?? (allIds.length ? (await tx.execute({ sql: `SELECT * FROM djrpg_item_owners WHERE item_id IN (${allIds.map(() => '?').join(',')})`, args: allIds })).rows : []);
  const owners = new Map(owned.map(owner => [owner.item_id, owner]));
  const slot = Number(options.slot ?? 1);
  const mapped = options.owned ? options.owned.filter(row => row.character_slot !== null && row.character_slot !== undefined).map(row => ({ item_id: row.item_id, slot: row.character_slot }))
    : allIds.length ? (await tx.execute({ sql: `SELECT item_id,slot FROM djrpg_character_item_owners WHERE account_id=? AND item_id IN (${allIds.map(() => '?').join(',')})`, args: [id, ...allIds] })).rows : [];
  const slotsByItem = new Map(mapped.map(row => [row.item_id, Number(row.slot)]));
  const writes = [];
  for (const item of next) {
    if (!itemValid(item) || ids.has(item.id)) fail(400, 'INVALID_ITEM', '중복되었거나 잘못된 아이템입니다.');
    ids.add(item.id);
    const owner = owners.get(item.id);
    if (owner && (String(owner.account_id).toLowerCase() !== id.toLowerCase() || owner.location !== 'inventory' || identity(JSON.parse(owner.item_json)) !== identity(item))) fail(409, 'ITEM_CONFLICT', '아이템 소유권이 변경되었습니다. 최신 데이터를 다시 불러오세요.');
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
export async function writeSave(tx, row, save, operations = [], preserveCollection = true) {
  for (const field of ['bossKills','playSeconds']) {
    if (save[field] !== undefined && (typeof save[field] !== 'number' || !Number.isFinite(save[field]) || save[field] < 0)) fail(400,'INVALID_SAVE','활동 통계 형식이 올바르지 않습니다.');
    save[field] = preserveCollection ? Math.max(row.save[field] ?? 0, save[field] ?? 0) : save[field] ?? 0;
  }
  save.accountId = row.id; save.lastActiveAt = Date.now();
  // Older clients may omit discovery history; never erase already-recorded entries.
  const previousCollection = preserveCollection && Array.isArray(row.save.equipmentCollection) ? row.save.equipmentCollection : [];
  const incomingCollection = Array.isArray(save.equipmentCollection) ? save.equipmentCollection : [];
  save.equipmentCollection = [...new Set([...previousCollection, ...incomingCollection].filter(key => typeof key === 'string' && /^(weapon|offhand|helmet|armor|necklace|gloves|belt|boots|ring):[0-9]$/.test(key)))].slice(0, 75);
  if (!Number.isSafeInteger(save.gold) || save.gold < 0 || save.gold > 9_000_000_000_000) fail(400, 'INVALID_GOLD', '금화 값이 올바르지 않습니다.');
  if (Number(row.slot) < 1 || Number(row.slot) > 3) fail(409, 'CHARACTER_CONFLICT', '현재 캐릭터를 다시 불러오세요.');
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
