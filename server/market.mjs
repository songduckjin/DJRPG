import { randomUUID } from 'node:crypto';
import { decodeAccount, assertRevision, fail, reconcileItems, inventoryOwnerQuery, transaction, validateSave, writeSave } from './database.mjs';
export const rules = { fee: .05, maxListings: 10, durationHours: 72, maxPrice: 1_000_000_000, pageSize: 20 };
const deliveryOperation = (listing, owner, kind, item, gold, reason) => {
  const delivery = { id: randomUUID(), item, gold, reason, createdAt: Date.now() };
  return { owner, delivery, operation: { sql: 'INSERT OR IGNORE INTO djrpg_market_inbox VALUES (?,?,?,?,?,?,?,?,NULL)', args: [delivery.id, owner, listing.id, kind, item ? JSON.stringify(item) : null, gold, reason, delivery.createdAt] } };
};
const eventOperation = (kind, id) => ({ sql: 'INSERT INTO djrpg_market_events(kind,listing_id,created_at) VALUES (?,?,?)', args: [kind, id, Date.now()] });
export async function expire(tx) {
  const rows = (await tx.execute({ sql: "SELECT * FROM djrpg_market WHERE state='active' AND expires_at<=?", args: [Date.now()] })).rows;
  const operations = [];
  for (const row of rows) {
    const item = JSON.parse(row.item_json);
    operations.push(
      { sql: "UPDATE djrpg_market SET state='expired' WHERE id=? AND state='active'", args: [row.id] },
      deliveryOperation(row, row.seller, 'return', item, 0, '등록 기간 만료').operation,
      { sql: "UPDATE djrpg_item_owners SET location='inbox' WHERE item_id=?", args: [item.id] },
      eventOperation('expired', row.id)
    );
  }
  if (operations.length) await tx.batch(operations);
}

const listing = row => ({ id: row.id, sellerName: row.seller_name, item: JSON.parse(row.item_json), price: Number(row.price), state: row.state, createdAt: Number(row.created_at), expiresAt: Number(row.expires_at), soldAt: row.sold_at ? Number(row.sold_at) : null });
export async function snapshot(db, id, input, expirationChecked = false) {
  const view = ['active','sold','mine'].includes(input.view) ? input.view : 'active';
  const where = [], args = [];
  if (view === 'mine') { where.push('(seller=? OR buyer=?)'); args.push(id, id); }
  else { where.push('state=?'); args.push(view); }
  if (view === 'active') { where.push('expires_at>?'); args.push(Date.now()); }
  const query = typeof input.query === 'string' ? input.query.trim().slice(0, 80) : '';
  if (query) { where.push('instr(name,?)>0'); args.push(query); }
  const groups = { weapon: ['weapon','offhand'], armor: ['armor','helmet','gloves','belt','boots'], accessory: ['necklace','ring1','ring2'], skillbook: ['skillbook'] };
  if (Object.hasOwn(groups, input.category)) { const slots = groups[input.category]; where.push(`slot IN (${slots.map(() => '?').join(',')})`); args.push(...slots); }
  if (['weapon','offhand','armor','helmet','gloves','belt','boots','necklace','ring1','ring2','skillbook'].includes(input.slot)) { where.push('slot=?'); args.push(input.slot); }
  if (['common','magic','rare','epic','unique','legendary'].includes(input.rarity)) { where.push('rarity=?'); args.push(input.rarity); }
  for (const [key, comparison] of [['minPrice','>='],['maxPrice','<=']]) if (Number.isSafeInteger(input[key]) && input[key] >= 0) { where.push(`price${comparison}?`); args.push(input[key]); }
  const selectedStat = ['attack','defense','health','crit','speed'].includes(input.stat) ? input.stat : undefined;
  if (selectedStat) {
    where.push(`COALESCE(json_extract(item_json,'$.stats.${input.stat}'),0)>=?`);
    args.push(Number.isFinite(input.minStat) && input.minStat > 0 ? input.minStat : 1);
  }
  const filter = where.join(' AND ');
  const page = Math.max(0, Math.min(10000, Number.isSafeInteger(input.page) ? input.page : 0));
  const order = selectedStat ? `COALESCE(json_extract(item_json,'$.stats.${selectedStat}'),0) DESC,created_at DESC,id ASC` : input.sort === 'priceAsc' ? 'price ASC,created_at DESC,id ASC' : input.sort === 'priceDesc' ? 'price DESC,created_at DESC,id ASC' : view === 'sold' ? 'sold_at DESC,id ASC' : 'created_at DESC,id ASC';
  const watchIds = Array.isArray(input.watchIds) ? input.watchIds.filter(value => typeof value === 'string' && value.length <= 100).slice(0, 20) : [];
  // A single read batch does not contend with purchases for the writer lock.
  const results = await db.batch([
    { sql: 'SELECT a.id, COALESCE(v.revision,0) AS revision FROM djrpg_accounts a LEFT JOIN djrpg_save_versions v ON v.account_id=a.id WHERE a.id=?', args: [id] },
    { sql: `SELECT COUNT(*) AS n FROM djrpg_market WHERE ${filter}`, args },
    { sql: `SELECT * FROM djrpg_market WHERE ${filter} ORDER BY ${order} LIMIT ? OFFSET ?`, args: [...args, rules.pageSize, page * rules.pageSize] },
    { sql: 'SELECT * FROM djrpg_market_inbox WHERE account_id=? AND claimed_at IS NULL ORDER BY created_at DESC', args: [id] },
    'SELECT COALESCE(MAX(seq),0) AS seq FROM djrpg_market_events',
    { sql: "SELECT COUNT(*) AS n FROM djrpg_market WHERE seller=? AND state='active' AND expires_at>?", args: [id, Date.now()] },
    watchIds.length ? { sql: `SELECT id,state FROM djrpg_market WHERE id IN (${watchIds.map(() => '?').join(',')})`, args: watchIds } : 'SELECT id,state FROM djrpg_market WHERE 0',
    { sql: "SELECT id FROM djrpg_market WHERE state='active' AND expires_at<=? LIMIT 1", args: [Date.now()] }
  ], 'read');
  if (!results[0].rows[0]) fail(401, 'INVALID_TOKEN', '계정을 찾을 수 없습니다. 다시 로그인하세요.');
  if (results[7].rows.length && !expirationChecked) {
    await transaction(db, expire);
    return snapshot(db, id, input, true);
  }
  const total = Number(results[1].rows[0].n), rows = results[2].rows, deliveries = results[3].rows;
  const seq = Number(results[4].rows[0].seq), myActive = Number(results[5].rows[0].n);
  const watched = results[6].rows.map(r => ({ id: r.id, state: r.state }));
  return { watched, listings: rows.map(r => ({ ...listing(r), mine: String(r.seller).toLowerCase() === id.toLowerCase(), purchased: String(r.buyer).toLowerCase() === id.toLowerCase() })), total, page, seq, myActive, rules, revision: Number(results[0].rows[0].revision),
    inbox: deliveries.map(r => ({ id: r.id, item: r.item_json ? JSON.parse(r.item_json) : null, gold: Number(r.gold), reason: r.reason, createdAt: Number(r.created_at) })) };
}
export async function mutate(db, id, input) {
  if (typeof input.requestId !== 'string' || !/^[\w-]{16,80}$/.test(input.requestId)) fail(400, 'INVALID_REQUEST', '거래 요청 번호가 올바르지 않습니다.');
  return transaction(db, async tx => {
    // All input-dependent reads share one DB round trip inside the writer transaction.
    const reads = await tx.batch([
      { sql: 'SELECT a.*, COALESCE(v.revision,0) AS revision FROM djrpg_accounts a LEFT JOIN djrpg_save_versions v ON v.account_id=a.id WHERE a.id=?', args: [id] },
      { sql: 'SELECT response_json FROM djrpg_market_requests WHERE account_id=? AND request_id=?', args: [id, input.requestId] },
      input.action === 'buy' || input.action === 'cancel'
        ? { sql: 'SELECT * FROM djrpg_market WHERE id=?', args: [typeof input.listingId === 'string' ? input.listingId : ''] }
        : input.action === 'claim'
          ? { sql: 'SELECT * FROM djrpg_market_inbox WHERE id=? AND account_id=? AND claimed_at IS NULL', args: [typeof input.deliveryId === 'string' ? input.deliveryId : '', id] }
          : { sql: "SELECT COUNT(*) AS n FROM djrpg_market WHERE seller=? AND state='active' AND expires_at>?", args: [id, Date.now()] },
      inventoryOwnerQuery(id, input.progress)
    ]);
    const row = decodeAccount(reads[0].rows[0]), replay = reads[1].rows[0];
    if (replay) {
      const result = JSON.parse(replay.response_json);
      if (result.revision !== undefined && result.revision !== row.revision) delete result.effect;
      return { ...result, save: row.save, revision: row.revision };
    }
    if (row.password_hash === 'guest') fail(403, 'GUEST_READ_ONLY', '게스트는 조회만 가능합니다. 정식 계정으로 로그인하면 거래할 수 있습니다.');
    assertRevision(row, input.revision);
    if (input.progress !== undefined) validateSave(input.progress);
    const save = structuredClone(input.progress ?? row.save);
    const operations = [], effect = { deliveries: [] };
    // Validate ownership from the initial read batch, then persist it with the trade.
    if (input.action === 'register' || JSON.stringify([row.save.bag, row.save.equipment]) !== JSON.stringify([save.bag, save.equipment])) await reconcileItems(tx, id, row.save, save, { owned: reads[3].rows, operations });
    let message = '';
    const inbox = (sale, owner, kind, item, gold, reason) => {
      const entry = deliveryOperation(sale, owner, kind, item, gold, reason);
      operations.push(entry.operation);
      if (owner.toLowerCase() === id.toLowerCase()) effect.deliveries.push(entry.delivery);
    };
    const write = operation => operations.push(operation);
    const event = (kind, id) => write(eventOperation(kind, id));
    if (input.action === 'register') {
      const price = input.price;
      if (!Number.isSafeInteger(price) || price < 1 || price > rules.maxPrice) fail(400, 'INVALID_PRICE', '가격은 1~1,000,000,000 금화의 정수로 입력하세요.');
      const count = Number(reads[2].rows[0].n);
      if (count >= rules.maxListings) fail(409, 'LISTING_LIMIT', '동시에 10개까지 등록할 수 있습니다.');
      const index = save.bag.findIndex(item => item.id === input.itemId);
      if (index < 0) fail(409, 'ITEM_NOT_AVAILABLE', '가방에 있는 미장착 아이템만 등록할 수 있습니다.');
      const selected = save.bag[index];
      if (selected.locked === true && input.unlockItem !== true) fail(409, 'ITEM_LOCKED', '잠긴 장비입니다. 잠금을 해제한 뒤 판매 등록하세요.');
      if (selected.locked === true) selected.locked = false;
      const [item] = save.bag.splice(index, 1), now = Date.now(), listingId = randomUUID();
      write({ sql: 'INSERT INTO djrpg_market VALUES (?,?,?,NULL,?,?,?,?,?,?,?, ?,NULL)', args: [listingId, id, String(save.name || '모험가').slice(0, 20), JSON.stringify(item), item.name, item.slot, item.rarity, price, 'active', now, now + rules.durationHours * 3600_000] });
      write({ sql: "UPDATE djrpg_item_owners SET location='escrow' WHERE item_id=?", args: [item.id] });
      event('registered', listingId);
      effect.listing = { id: listingId, state: 'active' };
      message = '판매 등록 완료 · 72시간 동안 공개됩니다.';
    } else if (input.action === 'buy' || input.action === 'cancel') {
      const sale = reads[2].rows[0];
      if (!sale || sale.state !== 'active' || Number(sale.expires_at) <= Date.now()) fail(409, 'NOT_AVAILABLE', '이미 판매되었거나 취소·만료된 매물입니다.');
      const mine = String(sale.seller).toLowerCase() === id.toLowerCase(), item = JSON.parse(sale.item_json);
      if (input.action === 'cancel') {
        if (!mine) fail(403, 'NOT_OWNER', '본인이 등록한 매물만 취소할 수 있습니다.');
        write({ sql: "UPDATE djrpg_market SET state='cancelled' WHERE id=?", args: [sale.id] });
        inbox(sale, id, 'return', item, 0, '판매 등록 취소');
        write({ sql: "UPDATE djrpg_item_owners SET location='inbox' WHERE item_id=?", args: [item.id] });
        event('cancelled', sale.id);
        effect.listing = { id: sale.id, state: 'cancelled' };
        message = '등록을 취소했습니다. 아이템은 수령함에 보관됩니다.';
      } else {
        if (mine) fail(400, 'OWN_LISTING', '본인 매물은 구매할 수 없습니다.');
        if (save.gold < Number(sale.price)) fail(400, 'INSUFFICIENT_GOLD', '금화가 부족합니다.');
        save.gold -= Number(sale.price);
        write({ sql: "UPDATE djrpg_market SET state='sold', buyer=?, sold_at=? WHERE id=? AND state='active'", args: [id, Date.now(), sale.id] });
        inbox(sale, id, 'purchase', item, 0, '구매한 아이템');
        const proceeds = Number(sale.price) - Math.ceil(Number(sale.price) * 5 / 100);
        inbox(sale, sale.seller, 'proceeds', null, proceeds, `${item.name} 판매대금 (수수료 5% 차감)`);
        write({ sql: "UPDATE djrpg_item_owners SET account_id=?,location='inbox' WHERE item_id=?", args: [id, item.id] });
        event('sold', sale.id);
        effect.listing = { id: sale.id, state: 'sold', soldAt: Date.now() };
        message = '구매 완료! 수령함에서 아이템을 받아주세요.';
      }
    } else if (input.action === 'claim') {
      const delivery = reads[2].rows[0];
      if (!delivery) fail(409, 'ALREADY_CLAIMED', '이미 수령했거나 존재하지 않는 항목입니다.');
      if (delivery.item_json) {
        if (save.bag.length >= 40) fail(409, 'BAG_FULL', '가방이 가득 찼습니다. 수령함에 안전하게 보관되므로 공간을 비운 뒤 받아주세요.');
        const item = JSON.parse(delivery.item_json); save.bag.push(item);
        write({ sql: "UPDATE djrpg_item_owners SET location='inventory' WHERE item_id=? AND account_id=?", args: [item.id, id] });
      }
      save.gold += Number(delivery.gold);
      effect.claimedId = delivery.id;
      write({ sql: 'UPDATE djrpg_market_inbox SET claimed_at=? WHERE id=? AND claimed_at IS NULL', args: [Date.now(), delivery.id] });
      message = delivery.item_json ? '아이템을 가방으로 받았습니다.' : `${Number(delivery.gold).toLocaleString('ko-KR')} 금화를 받았습니다.`;
    } else fail(400, 'INVALID_ACTION', '지원하지 않는 거래 요청입니다.');
    write({ sql: 'INSERT INTO djrpg_market_requests VALUES (?,?,?)', args: [id, input.requestId, JSON.stringify({ ok: true, message, effect, revision: row.revision + 1 })] });
    const result = { ok: true, message, effect, ...await writeSave(tx, row, save, operations) };
    return result;
  });
}
