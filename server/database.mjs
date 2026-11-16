import { createClient } from '@libsql/client';

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new ApiError(status, code, message); };
export const client = () => createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
export async function schema(db) {
  await db.batch([
    'CREATE TABLE IF NOT EXISTS djrpg_accounts (id TEXT PRIMARY KEY COLLATE NOCASE, password_hash TEXT NOT NULL, save_json TEXT NOT NULL, updated_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS djrpg_save_requests (account_id TEXT PRIMARY KEY COLLATE NOCASE, request_id TEXT NOT NULL, revision INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS djrpg_save_versions (account_id TEXT PRIMARY KEY COLLATE NOCASE, revision INTEGER NOT NULL DEFAULT 0)',
    `CREATE TABLE IF NOT EXISTS djrpg_market (id TEXT PRIMARY KEY, seller TEXT NOT NULL COLLATE NOCASE, seller_name TEXT NOT NULL, buyer TEXT COLLATE NOCASE, item_json TEXT NOT NULL, name TEXT NOT NULL, slot TEXT NOT NULL, rarity TEXT NOT NULL, price INTEGER NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, sold_at INTEGER)`,
    'CREATE INDEX IF NOT EXISTS djrpg_market_state_time ON djrpg_market(state, created_at)',
    'CREATE INDEX IF NOT EXISTS djrpg_market_seller ON djrpg_market(seller, state)',
    'CREATE INDEX IF NOT EXISTS djrpg_market_buyer ON djrpg_market(buyer, sold_at)',
    'CREATE TABLE IF NOT EXISTS djrpg_market_inbox (id TEXT PRIMARY KEY, account_id TEXT NOT NULL COLLATE NOCASE, listing_id TEXT NOT NULL, kind TEXT NOT NULL, item_json TEXT, gold INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL, created_at INTEGER NOT NULL, claimed_at INTEGER, UNIQUE(listing_id,kind))',
    'CREATE INDEX IF NOT EXISTS djrpg_market_inbox_owner ON djrpg_market_inbox(account_id, claimed_at)',
    'CREATE TABLE IF NOT EXISTS djrpg_item_owners (item_id TEXT PRIMARY KEY, account_id TEXT NOT NULL COLLATE NOCASE, location TEXT NOT NULL, item_json TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS djrpg_market_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, listing_id TEXT NOT NULL, created_at INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS djrpg_market_requests (account_id TEXT NOT NULL COLLATE NOCASE, request_id TEXT NOT NULL, response_json TEXT NOT NULL, PRIMARY KEY(account_id, request_id))'
  ], 'write');
}
export async function transaction(db, run) {
  const tx = await db.transaction('write');
  try { const result = await run(tx); await tx.commit(); return result; }
  catch (error) { if (!tx.closed) await tx.rollback(); throw error; }
  finally { tx.close(); }
}
export async function account(tx, id) {
  const row = (await tx.execute({ sql: 'SELECT a.*, COALESCE(v.revision,0) AS revision FROM djrpg_accounts a LEFT JOIN djrpg_save_versions v ON v.account_id=a.id WHERE a.id=?', args: [id] })).rows[0];
  if (!row) fail(401, 'INVALID_TOKEN', '계정을 찾을 수 없습니다. 다시 로그인하세요.');
  return { ...row, revision: Number(row.revision), save: JSON.parse(row.save_json) };
}
export function assertRevision(row, revision) {
  if (!Number.isSafeInteger(revision) || revision !== row.revision) fail(409, 'SAVE_CONFLICT', '다른 탭이나 기기에서 진행 상황이 변경되었습니다. 새로고침하여 최신 데이터를 불러오세요.');
}
const itemsOf = save => [...(save.bag ?? []), ...Object.values(save.equipment ?? {}).filter(Boolean)];
function itemValid(item) {
  const slots = ['weapon','offhand','helmet','armor','necklace','gloves','belt','boots','ring1','ring2','skillbook'];
  return item && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 100 && typeof item.name === 'string' && item.name.length <= 100 && slots.includes(item.slot) && ['common','magic','rare','legendary'].includes(item.rarity) && item.stats && typeof item.stats === 'object' && !Array.isArray(item.stats) && Object.entries(item.stats).every(([key, value]) => ['attack','defense','health','crit','speed'].includes(key) && Number.isFinite(value) && value >= 0 && value <= 100000) && (item.slot !== 'skillbook' || (item.kind === 'skillbook' && ['slash2','spin','crushing','slam','warcry','power','destroy','hell','mastery','body','instinct'].includes(item.skillId)));
}
const identity = item => JSON.stringify([item.name, item.slot.startsWith('ring') ? 'ring' : item.slot, item.rarity, item.kind ?? 'equipment', item.skillId ?? '', ...['attack','defense','health','crit','speed'].map(key => item.stats[key] ?? 0)]);
export async function reconcileItems(tx, id, before, after) {
  const next = itemsOf(after), previous = itemsOf(before), ids = new Set();
  if (next.length > 50 || !Array.isArray(after.bag) || after.bag.length > 40 || !after.equipment || typeof after.equipment !== 'object') fail(400, 'INVALID_SAVE', '가방 또는 장비 데이터가 올바르지 않습니다.');
  const previousValid = previous.filter(itemValid);
  const allIds = [...new Set([...previousValid, ...next].map(item => item?.id).filter(id => typeof id === 'string'))];
  const owned = allIds.length ? (await tx.execute({ sql: `SELECT * FROM djrpg_item_owners WHERE item_id IN (${allIds.map(() => '?').join(',')})`, args: allIds })).rows : [];
  const owners = new Map(owned.map(owner => [owner.item_id, owner]));
  const writes = [];
  for (const item of next) {
    if (!itemValid(item) || ids.has(item.id)) fail(400, 'INVALID_ITEM', '중복되었거나 잘못된 아이템입니다.');
    ids.add(item.id);
    const owner = owners.get(item.id);
    if (owner && (String(owner.account_id).toLowerCase() !== id.toLowerCase() || owner.location !== 'inventory' || identity(JSON.parse(owner.item_json)) !== identity(item))) fail(409, 'ITEM_CONFLICT', '아이템 소유권이 변경되었습니다. 최신 데이터를 다시 불러오세요.');
  }
  // Include removed legacy items, preventing resurrection after consumption.
  const unregistered = new Map([...previousValid, ...next].filter(item => !owners.has(item.id)).map(item => [item.id, item]));
  for (const item of unregistered.values()) writes.push({ sql: 'INSERT INTO djrpg_item_owners VALUES (?,?,?,?)', args: [item.id, id, ids.has(item.id) ? 'inventory' : 'consumed', JSON.stringify(item)] });
  for (const item of previousValid) if (!ids.has(item.id) && owners.has(item.id)) writes.push({ sql: "UPDATE djrpg_item_owners SET location='consumed' WHERE item_id=? AND account_id=? AND location='inventory'", args: [item.id, id] });
  if (writes.length) await tx.batch(writes);
}
export async function writeSave(tx, row, save) {
  save.accountId = row.id; save.lastActiveAt = Date.now();
  if (!Number.isSafeInteger(save.gold) || save.gold < 0 || save.gold > 9_000_000_000_000) fail(400, 'INVALID_GOLD', '골드 값이 올바르지 않습니다.');
  await tx.execute({ sql: 'UPDATE djrpg_accounts SET save_json=?, updated_at=? WHERE id=?', args: [JSON.stringify(save), new Date().toISOString(), row.id] });
  const revision = row.revision + 1;
  await tx.execute({ sql: 'INSERT INTO djrpg_save_versions VALUES (?,?) ON CONFLICT(account_id) DO UPDATE SET revision=excluded.revision', args: [row.id, revision] });
  return { save, revision };
}
export function respondError(res, error) {
  if (error instanceof ApiError) return res.status(error.status).json({ code: error.code, error: error.message });
  console.error('Database request failed');
  return res.status(503).json({ code: 'DB_UNAVAILABLE', error: '서버 연결이 불안정합니다. 잠시 후 다시 시도하세요.' });
}
