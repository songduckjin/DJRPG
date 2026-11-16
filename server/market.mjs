import { randomUUID } from 'node:crypto';
import { account, assertRevision, fail, reconcileItems, transaction, writeSave } from './database.mjs';
export const rules = { fee: .05, maxListings: 10, durationHours: 72, maxPrice: 1_000_000_000, pageSize: 20 };
const inbox = async (tx, listing, owner, kind, item, gold, reason) => tx.execute({ sql: 'INSERT OR IGNORE INTO djrpg_market_inbox VALUES (?,?,?,?,?,?,?,?,NULL)', args: [randomUUID(), owner, listing.id, kind, item ? JSON.stringify(item) : null, gold, reason, Date.now()] });
const event = async (tx, kind, id) => tx.execute({ sql: 'INSERT INTO djrpg_market_events(kind,listing_id,created_at) VALUES (?,?,?)', args: [kind, id, Date.now()] });
export async function expire(tx) {
  const rows = (await tx.execute({ sql: "SELECT * FROM djrpg_market WHERE state='active' AND expires_at<=?", args: [Date.now()] })).rows;
  for (const row of rows) {
    await tx.execute({ sql: "UPDATE djrpg_market SET state='expired' WHERE id=? AND state='active'", args: [row.id] });
    const item = JSON.parse(row.item_json);
    await inbox(tx, row, row.seller, 'return', item, 0, '등록 기간 만료');
    await tx.execute({ sql: "UPDATE djrpg_item_owners SET location='inbox' WHERE item_id=?", args: [item.id] });
    await event(tx, 'expired', row.id);
  }
}
const listing = row => ({ id: row.id, sellerName: row.seller_name, item: JSON.parse(row.item_json), price: Number(row.price), state: row.state, createdAt: Number(row.created_at), expiresAt: Number(row.expires_at), soldAt: row.sold_at ? Number(row.sold_at) : null });
export async function snapshot(db, id, input) {
  return transaction(db, async tx => {
    await expire(tx);
    const row = await account(tx, id);
    const view = ['active','sold','mine'].includes(input.view) ? input.view : 'active';
    const where = [], args = [];
    if (view === 'mine') { where.push('(seller=? OR buyer=?)'); args.push(id, id); }
    else { where.push('state=?'); args.push(view); }
    const query = typeof input.query === 'string' ? input.query.trim().slice(0, 80) : '';
    if (query) { where.push('instr(name,?)>0'); args.push(query); }
    const groups = { weapon: ['weapon','offhand'], armor: ['armor','helmet','gloves','belt','boots'], accessory: ['necklace','ring1','ring2'], skillbook: ['skillbook'] };
    if (Object.hasOwn(groups, input.category)) { const slots = groups[input.category]; where.push(`slot IN (${slots.map(() => '?').join(',')})`); args.push(...slots); }
    if (['weapon','offhand','armor','helmet','gloves','belt','boots','necklace','ring1','ring2','skillbook'].includes(input.slot)) { where.push('slot=?'); args.push(input.slot); }
    if (['common','magic','rare','legendary'].includes(input.rarity)) { where.push('rarity=?'); args.push(input.rarity); }
    for (const [key, comparison] of [['minPrice','>='],['maxPrice','<=']]) if (Number.isSafeInteger(input[key]) && input[key] >= 0) { where.push(`price${comparison}?`); args.push(input[key]); }
    if (['attack','defense','health','crit','speed'].includes(input.stat)) {
      where.push(`COALESCE(json_extract(item_json,'$.stats.${input.stat}'),0)>=?`);
      args.push(Number.isFinite(input.minStat) && input.minStat > 0 ? input.minStat : 1);
    }
    const filter = where.join(' AND ');
    const total = Number((await tx.execute({ sql: `SELECT COUNT(*) AS n FROM djrpg_market WHERE ${filter}`, args })).rows[0].n);
    const page = Math.max(0, Math.min(10000, Number.isSafeInteger(input.page) ? input.page : 0));
    const order = input.sort === 'priceAsc' ? 'price ASC,created_at DESC,id ASC' : input.sort === 'priceDesc' ? 'price DESC,created_at DESC,id ASC' : view === 'sold' ? 'sold_at DESC,id ASC' : 'created_at DESC,id ASC';
    const rows = (await tx.execute({ sql: `SELECT * FROM djrpg_market WHERE ${filter} ORDER BY ${order} LIMIT ? OFFSET ?`, args: [...args, rules.pageSize, page * rules.pageSize] })).rows;
    const deliveries = (await tx.execute({ sql: 'SELECT * FROM djrpg_market_inbox WHERE account_id=? AND claimed_at IS NULL ORDER BY created_at DESC', args: [id] })).rows;
    const seq = Number((await tx.execute('SELECT COALESCE(MAX(seq),0) AS seq FROM djrpg_market_events')).rows[0].seq);
    const myActive = Number((await tx.execute({ sql: "SELECT COUNT(*) AS n FROM djrpg_market WHERE seller=? AND state='active'", args: [id] })).rows[0].n);
    const watchIds = Array.isArray(input.watchIds) ? input.watchIds.filter(value => typeof value === 'string' && value.length <= 100).slice(0, 20) : [];
    const watched = watchIds.length ? (await tx.execute({ sql: `SELECT id,state FROM djrpg_market WHERE id IN (${watchIds.map(() => '?').join(',')})`, args: watchIds })).rows.map(r => ({ id: r.id, state: r.state })) : [];
    return { watched, listings: rows.map(r => ({ ...listing(r), mine: String(r.seller).toLowerCase() === id.toLowerCase(), purchased: String(r.buyer).toLowerCase() === id.toLowerCase() })), total, page, seq, myActive, rules, revision: row.revision,
      inbox: deliveries.map(r => ({ id: r.id, item: r.item_json ? JSON.parse(r.item_json) : null, gold: Number(r.gold), reason: r.reason, createdAt: Number(r.created_at) })) };
  });
}
export async function mutate(db, id, input) {
  if (typeof input.requestId !== 'string' || !/^[\w-]{16,80}$/.test(input.requestId)) fail(400, 'INVALID_REQUEST', '거래 요청 번호가 올바르지 않습니다.');
  return transaction(db, async tx => {
    const replay = (await tx.execute({ sql: 'SELECT response_json FROM djrpg_market_requests WHERE account_id=? AND request_id=?', args: [id, input.requestId] })).rows[0];
    if (replay) {
      const latest = await account(tx, id);
      return { ...JSON.parse(replay.response_json), save: latest.save, revision: latest.revision };
    }
    await expire(tx);
    const row = await account(tx, id);
    if (row.password_hash === 'guest') fail(403, 'GUEST_READ_ONLY', '게스트는 조회만 가능합니다. 정식 계정으로 로그인하면 거래할 수 있습니다.');
    assertRevision(row, input.revision);
    const save = structuredClone(row.save);
    // Register existing inventory before it enters escrow, preserving old saves.
    await reconcileItems(tx, id, row.save, save);
    let message = '';
    if (input.action === 'register') {
      const price = input.price;
      if (!Number.isSafeInteger(price) || price < 1 || price > rules.maxPrice) fail(400, 'INVALID_PRICE', '가격은 1~1,000,000,000 골드의 정수로 입력하세요.');
      const count = Number((await tx.execute({ sql: "SELECT COUNT(*) AS n FROM djrpg_market WHERE seller=? AND state='active'", args: [id] })).rows[0].n);
      if (count >= rules.maxListings) fail(409, 'LISTING_LIMIT', '동시에 10개까지 등록할 수 있습니다.');
      const index = save.bag.findIndex(item => item.id === input.itemId);
      if (index < 0) fail(409, 'ITEM_NOT_AVAILABLE', '가방에 있는 미장착 아이템만 등록할 수 있습니다.');
      const [item] = save.bag.splice(index, 1), now = Date.now(), listingId = randomUUID();
      await tx.execute({ sql: 'INSERT INTO djrpg_market VALUES (?,?,?,NULL,?,?,?,?,?,?,?, ?,NULL)', args: [listingId, id, String(save.name || '모험가').slice(0, 20), JSON.stringify(item), item.name, item.slot, item.rarity, price, 'active', now, now + rules.durationHours * 3600_000] });
      await tx.execute({ sql: "UPDATE djrpg_item_owners SET location='escrow' WHERE item_id=?", args: [item.id] });
      await event(tx, 'registered', listingId);
      message = '판매 등록 완료 · 72시간 동안 공개됩니다.';
    } else if (input.action === 'buy' || input.action === 'cancel') {
      const sale = (await tx.execute({ sql: 'SELECT * FROM djrpg_market WHERE id=?', args: [typeof input.listingId === 'string' ? input.listingId : ''] })).rows[0];
      if (!sale || sale.state !== 'active' || Number(sale.expires_at) <= Date.now()) fail(409, 'NOT_AVAILABLE', '이미 판매되었거나 취소·만료된 매물입니다.');
      const mine = String(sale.seller).toLowerCase() === id.toLowerCase(), item = JSON.parse(sale.item_json);
      if (input.action === 'cancel') {
        if (!mine) fail(403, 'NOT_OWNER', '본인이 등록한 매물만 취소할 수 있습니다.');
        await tx.execute({ sql: "UPDATE djrpg_market SET state='cancelled' WHERE id=?", args: [sale.id] });
        await inbox(tx, sale, id, 'return', item, 0, '판매 등록 취소');
        await tx.execute({ sql: "UPDATE djrpg_item_owners SET location='inbox' WHERE item_id=?", args: [item.id] });
        await event(tx, 'cancelled', sale.id);
        message = '등록을 취소했습니다. 아이템은 수령함에 보관됩니다.';
      } else {
        if (mine) fail(400, 'OWN_LISTING', '본인 매물은 구매할 수 없습니다.');
        if (save.gold < Number(sale.price)) fail(400, 'INSUFFICIENT_GOLD', '골드가 부족합니다.');
        save.gold -= Number(sale.price);
        await tx.execute({ sql: "UPDATE djrpg_market SET state='sold', buyer=?, sold_at=? WHERE id=? AND state='active'", args: [id, Date.now(), sale.id] });
        await inbox(tx, sale, id, 'purchase', item, 0, '구매한 아이템');
        const proceeds = Number(sale.price) - Math.ceil(Number(sale.price) * 5 / 100);
        await inbox(tx, sale, sale.seller, 'proceeds', null, proceeds, `${item.name} 판매대금 (수수료 5% 차감)`);
        await tx.execute({ sql: "UPDATE djrpg_item_owners SET account_id=?,location='inbox' WHERE item_id=?", args: [id, item.id] });
        await event(tx, 'sold', sale.id);
        message = '구매 완료! 수령함에서 아이템을 받아주세요.';
      }
    } else if (input.action === 'claim') {
      const delivery = (await tx.execute({ sql: 'SELECT * FROM djrpg_market_inbox WHERE id=? AND account_id=? AND claimed_at IS NULL', args: [typeof input.deliveryId === 'string' ? input.deliveryId : '', id] })).rows[0];
      if (!delivery) fail(409, 'ALREADY_CLAIMED', '이미 수령했거나 존재하지 않는 항목입니다.');
      if (delivery.item_json) {
        if (save.bag.length >= 40) fail(409, 'BAG_FULL', '가방이 가득 찼습니다. 수령함에 안전하게 보관되므로 공간을 비운 뒤 받아주세요.');
        const item = JSON.parse(delivery.item_json); save.bag.push(item);
        await tx.execute({ sql: "UPDATE djrpg_item_owners SET location='inventory' WHERE item_id=? AND account_id=?", args: [item.id, id] });
      }
      save.gold += Number(delivery.gold);
      await tx.execute({ sql: 'UPDATE djrpg_market_inbox SET claimed_at=? WHERE id=? AND claimed_at IS NULL', args: [Date.now(), delivery.id] });
      message = delivery.item_json ? '아이템을 가방으로 받았습니다.' : `${Number(delivery.gold).toLocaleString('ko-KR')} 골드를 받았습니다.`;
    } else fail(400, 'INVALID_ACTION', '지원하지 않는 거래 요청입니다.');
    const result = { ok: true, message, ...await writeSave(tx, row, save) };
    await tx.execute({ sql: 'INSERT INTO djrpg_market_requests VALUES (?,?,?)', args: [id, input.requestId, JSON.stringify({ ok: true, message })] });
    return result;
  });
}
