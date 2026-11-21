import { randomUUID } from 'node:crypto';
import { decodeAccount, assertRevision, fail, reconcileItems, inventoryOwnerQuery, transaction, validateSave, writeSave, marketStatExpression } from './database.mjs';
import { journeyState, journeyOperation } from './journey-state.mjs';
import { countedInBag } from './skill-ids.mjs';
import { elapsedSince } from './save-guard.mjs';
/**
 * 거래소 규칙. `price`는 **개당** 가격이고 `maxBundle`은 한 매물에 묶을 수 있는 최대 수량이다(작업 249,
 * 사용자 확정 "묶음판매는 한번에 10개까지"). `maxListings`(동시 등록)와 `maxInbox`(수령함)는 묶음도 한 건/한 줄씩 센다.
 */
export const rules = { fee: .05, maxListings: 30, durationHours: 72, maxPrice: 1_000_000_000, minPrice: 1, pageSize: 20, maxInbox: 30, maxBundle: 10 };
export const maxBundleMessage = `묶음 판매는 한 번에 최대 ${rules.maxBundle}개까지 등록할 수 있습니다.`;
/** 수령함 상한 안내 문구(작업 247) — 구매·판매 등록 화면과 서버가 같은 말을 쓴다. */
export const inboxFullMessage = `수령함이 가득 찼습니다(최대 ${rules.maxInbox}건). 수령함에서 먼저 받아 주세요.`;
const deliveryOperation = (listing, owner, kind, item, gold, reason) => {
  const delivery = { id: randomUUID(), item, gold, reason, createdAt: Date.now() };
  return { owner, delivery, operation: { sql: 'INSERT OR IGNORE INTO djrpg_market_inbox VALUES (?,?,?,?,?,?,?,?,NULL)', args: [delivery.id, owner, listing.id, kind, item ? JSON.stringify(item) : null, gold, reason, delivery.createdAt] } };
};
const eventOperation = (kind, id) => ({ sql: 'INSERT INTO djrpg_market_events(kind,listing_id,created_at) VALUES (?,?,?)', args: [kind, id, Date.now()] });
/** 등록할 수 있는 물건인가 — 미장착 장비와 미사용 스킬북만. 보물 주머니(소모품)는 예전부터 화면에 없었다. */
const sellable = item => ['weapon','offhand','helmet','armor','necklace','gloves','belt','boots','ring1','ring2','skillbook'].includes(item?.slot);
/**
 * 묶음 기준 — 스킬북은 같은 `skillId`, 나머지는 아이템 id(장비는 한 개씩).
 * 화면의 가방 칸(`src/ui/bagStacks.ts` `stackKey`)과 같은 규칙이라 `×N` 칸 하나가 그대로 한 묶음이 된다.
 */
const bundleKey = item => item?.slot === 'skillbook' ? `book:${item.skillId ?? item.name}` : `item:${item?.id}`;
/**
 * 매물의 남은 아이템들 — `items_json`(작업 249)이 없으면 대표 `item_json` 한 개짜리 단건 매물이다.
 */
const parseItems = row => {
  if (typeof row.items_json === 'string' && row.items_json) {
    try {
      const parsed = JSON.parse(row.items_json);
      if (Array.isArray(parsed) && parsed.length && parsed.every(item => item && typeof item.id === 'string')) return parsed;
    } catch { /* 깨진 사본은 대표 아이템으로 본다 */ }
  }
  return [JSON.parse(row.item_json)];
};
/**
 * 수령함 한 행의 종류(작업 249). 수령함은 `UNIQUE(listing_id, kind)`로 중복 배달을 막는데, 묶음 매물은
 * **부분 구매·남은 수량 반환**으로 같은 매물에서 배달이 여러 번 생긴다. 그래서 묶음 매물은 아이템 id를 붙여
 * (`purchase:<id>`·`return:<id>`) 아이템마다 한 줄이 되게 하고, 단건 매물은 종전 그대로(`purchase`·`return`) 둔다
 * — 기존 행·화면·테스트 계약을 바꾸지 않으면서 중복 배달은 그대로 막힌다.
 */
const deliveryItemKind = (kind, listing, item) => Number(listing.quantity ?? 1) > 1 ? `${kind}:${item.id}` : kind;
/**
 * 거래 완료 업적 카운터 (작업 224, 사용자 확정 `#6289`·`#6294`).
 *
 * 성사된 거래만 세도록 구매자·판매자 양쪽 장부(`djrpg_journey.state_json.marketTrades`)를 1씩 올린다.
 * 세이브(`save_json`)가 아니라 계정 장부에 두는 이유: 판매자의 세이브는 다른 기기·다른 세션의 클라이언트가
 * 들고 있어 서버가 값을 고쳐도 다음 저장에 덮어써진다. `json_set`이라 일일·주간·우편 등 다른 장부 항목은
 * 그대로 두고, 장부 행이 없으면(오래된 계정) 새로 만들어 1부터 센다. `advanceJourney`가 빈 항목을 채운다.
 */
const tradeCountOperation = owner => ({
  sql: "INSERT INTO djrpg_journey(account_id,state_json) VALUES (?, json_set('{}','$.marketTrades',1)) ON CONFLICT(account_id) DO UPDATE SET state_json=json_set(state_json,'$.marketTrades',COALESCE(json_extract(state_json,'$.marketTrades'),0)+1)",
  args: [owner]
});
export async function expire(tx, owner) {
  const rows = (await tx.execute({ sql: "SELECT * FROM djrpg_market WHERE state='active' AND expires_at<=?" + (owner ? " AND seller=?" : ""), args: owner ? [Date.now(), owner] : [Date.now()] })).rows;
  const operations = [];
  for (const row of rows) {
    // 묶음 매물은 남은 아이템을 **모두** 판매자에게 돌려준다(작업 249) — 하나라도 잃으면 안 된다.
    operations.push({ sql: "UPDATE djrpg_market SET state='expired' WHERE id=? AND state='active'", args: [row.id] });
    for (const item of parseItems(row)) operations.push(
      deliveryOperation(row, row.seller, deliveryItemKind('return', row, item), item, 0, '등록 기간 만료').operation,
      { sql: "UPDATE djrpg_item_owners SET location='inbox' WHERE item_id=?", args: [item.id] }
    );
    operations.push(eventOperation('expired', row.id));
  }
  if (operations.length) await tx.batch(operations);
}

/**
 * 매물 한 건의 화면 표현. `price`는 **개당 가격**(기존 계약과 호환), `quantity`는 남은 수량
 * (판매 완료 행은 **팔린 수량**), `totalPrice`는 개당 × 수량이다(작업 249).
 */
const listing = row => { const price = Number(row.price), quantity = Math.max(0, Number(row.quantity ?? 1)); return { id: row.id, sellerName: row.seller_name, item: JSON.parse(row.item_json), price, unitPrice: price, quantity, totalPrice: price * quantity, state: row.state, createdAt: Number(row.created_at), expiresAt: Number(row.expires_at), soldAt: row.sold_at ? Number(row.sold_at) : null }; };
export async function snapshot(db, id, input, expirationChecked = false) {
  const view = ['active','sold','mine','register','inbox'].includes(input.view) ? input.view : 'active';
  const where = [], args = [];
  if (view === 'mine' && input.mineActiveOnly === true) { where.push("seller=? AND state='active' AND expires_at>?"); args.push(id,Date.now()); }
  else if (view === 'mine') { where.push('(seller=? OR buyer=?)'); args.push(id, id); }
  else if (view === 'register' || view === 'inbox') where.push('0');
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
  // 스탯 식은 `server/database.mjs` `marketStatExpression` 한 곳에서 만든다 — 거래소 정렬 인덱스가 같은
  // 문자열로 만들어져야 SQLite가 인덱스를 쓴다(작업 211).
  const statExpression = selectedStat ? marketStatExpression(selectedStat) : undefined;
  if (selectedStat) {
    where.push(`${statExpression}>=?`);
    args.push(Number.isFinite(input.minStat) && input.minStat > 0 ? input.minStat : 1);
  }
  const filter = where.join(' AND ');
  const page = Math.max(0, Math.min(10000, Number.isSafeInteger(input.page) ? input.page : 0));
  const order = selectedStat ? `${statExpression} DESC,created_at DESC,id ASC` : input.sort === 'priceAsc' ? 'price ASC,created_at DESC,id ASC' : input.sort === 'priceDesc' ? 'price DESC,created_at DESC,id ASC' : view === 'sold' ? 'sold_at DESC,id ASC' : 'created_at DESC,id ASC';
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
    { sql: "SELECT id FROM djrpg_market WHERE seller=? AND state='active' AND expires_at<=? LIMIT 1", args: [id, Date.now()] }
  ], 'read');
  if (!results[0].rows[0]) fail(401, 'INVALID_TOKEN', '계정을 찾을 수 없습니다. 다시 로그인하세요.');
  if (results[7].rows.length && !expirationChecked) {
    await transaction(db, tx => expire(tx, id));
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
      { sql: `SELECT a.*, p.shared_gold, p.active_slot, c.save_json AS character_json, c.updated_at AS character_updated_at,
        COALESCE(v.revision,0) AS revision, d.cleared_floor AS dungeon_record_floor, d.cleared_at AS dungeon_record_at FROM djrpg_accounts a
        JOIN djrpg_account_profiles p ON p.account_id=a.id
        JOIN djrpg_characters c ON c.account_id=a.id AND c.slot=p.active_slot
        LEFT JOIN djrpg_save_versions v ON v.account_id=a.id
        LEFT JOIN djrpg_dungeon_records d ON d.account_id=a.id WHERE a.id=?`, args: [id] },
      { sql: 'SELECT response_json FROM djrpg_market_requests WHERE account_id=? AND request_id=?', args: [id, input.requestId] },
      input.action === 'buy' || input.action === 'cancel'
        ? { sql: 'SELECT * FROM djrpg_market WHERE id=?', args: [typeof input.listingId === 'string' ? input.listingId : ''] }
        : input.action === 'claim'
          ? input.deliveryId === 'all'
            ? {sql:'SELECT * FROM djrpg_market_inbox WHERE account_id=? AND claimed_at IS NULL ORDER BY created_at ASC,id ASC',args:[id]}
            : { sql: 'SELECT * FROM djrpg_market_inbox WHERE id=? AND account_id=? AND claimed_at IS NULL', args: [typeof input.deliveryId === 'string' ? input.deliveryId : '', id] }
          : { sql: "SELECT COUNT(*) AS n FROM djrpg_market WHERE seller=? AND state='active' AND expires_at>?", args: [id, Date.now()] },
      inventoryOwnerQuery(id, input.progress),
      { sql: 'SELECT state_json FROM djrpg_journey WHERE account_id=?', args: [id] },
      // 수령함에 남은 건수(작업 247) — 구매·판매 등록이 30건 상한을 넘기지 않게 같은 읽기 배치에서 센다.
      { sql: 'SELECT COUNT(*) AS n FROM djrpg_market_inbox WHERE account_id=? AND claimed_at IS NULL', args: [id] }
    ]);
    const row = decodeAccount(reads[0].rows[0]), replay = reads[1].rows[0];
    if (Number(input.characterSlot ?? 1) !== row.slot) fail(409, 'CHARACTER_CONFLICT', '다른 캐릭터가 선택되었습니다. 새로고침해 주세요.');
    row.journeyRecord = reads[4].rows[0] ?? null;
    const inboxCount = Number(reads[5]?.rows?.[0]?.n ?? 0);
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
    // 거래가 실제로 성사되면 구매자·판매자 양쪽 거래 완료 카운터를 같은 배치에서 올린다(작업 224).
    let tradeParties = null, saveRow = row;
    // 판매대금 수령처럼 서버가 같은 트랜잭션에서 금화를 더해 주는 몫은 세이브 검증 상한에 함께 더한다.
    let goldCredit = 0;
    // Validate ownership from the initial read batch, then persist it with the trade.
    // 작업 222(`#5921`): 수령함에서 받는 아이템은 이 트랜잭션에서 주인 기록을 `location='inbox'`→`'inventory'`로
    // 바꾸는 중인데, 그 UPDATE는 `operations`에 쌓여 있어 아래 reconcile보다 **나중에** 실행된다. 그래서 클라이언트
    // 세이브가 그 아이템을 이미 들고 있으면(받기 직후 저장·재시도) 옛 `inbox` 행을 읽혀
    // `409 ITEM_CONFLICT`로 수령이 막혔다. 이 요청에서 실제로 받을 배달의 아이템만 '가방에 들어간 상태'로
    // 미리 보고 통과시킨다(다른 배달·다른 계정 아이템은 종전대로 막힌다).
    const claimable = input.action === 'claim'
      ? new Set(reads[2].rows.filter(delivery => delivery.item_json).map(delivery => JSON.parse(delivery.item_json).id))
      : new Set();
    const ownedRows = claimable.size
      ? reads[3].rows.map(owner => claimable.has(owner.item_id) ? { ...owner, location: 'inventory', character_slot: row.slot } : owner)
      : reads[3].rows;
    if (input.action === 'register' || JSON.stringify([row.save.bag, row.save.equipment]) !== JSON.stringify([save.bag, save.equipment])) await reconcileItems(tx, id, row.save, save, { owned: ownedRows, operations, slot: row.slot, elapsedSeconds: elapsedSince(row.character_updated_at) });
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
      // 수령함 상한(작업 247): 등록을 취소·만료되면 물건이 돌아갈 자리가 없으므로, 가득 찬 상태에서는
      // **새 판매 등록 자체를 막고** 먼저 받으라고 안내한다.
      if (inboxCount >= rules.maxInbox) fail(409, 'INBOX_FULL', inboxFullMessage);
      const count = Number(reads[2].rows[0].n);
      if (count >= rules.maxListings) fail(409, 'LISTING_LIMIT', `동시에 ${rules.maxListings}개까지 등록할 수 있습니다. 판매 중인 물품을 취소하거나 판매 완료 후 다시 등록하세요.`);
      // ① 요청한 판매 아이템 — UI가 고른 묶음(`itemIds`) 또는 대표 하나(`itemId`) + `quantity`(작업 249).
      const requested = Array.isArray(input.itemIds)
        ? [...new Set(input.itemIds.filter(value => typeof value === 'string'))]
        : typeof input.itemId === 'string' ? [input.itemId] : [];
      if (!requested.length) fail(409, 'ITEM_NOT_AVAILABLE', '가방에 있는 미장착 아이템만 등록할 수 있습니다.');
      const wanted = Number.isSafeInteger(input.quantity) ? input.quantity : requested.length;
      if (Array.isArray(input.itemIds) && wanted !== requested.length) fail(400, 'INVALID_QUANTITY', '묶음 수량과 고른 아이템 수가 다릅니다. 다시 선택해 주세요.');
      if (wanted < 1) fail(400, 'INVALID_QUANTITY', '판매 수량은 1개 이상이어야 합니다.');
      if (wanted > rules.maxBundle) fail(400, 'INVALID_QUANTITY', maxBundleMessage);
      const selected = save.bag.find(item => item.id === requested[0]);
      if (!selected) fail(409, 'ITEM_NOT_AVAILABLE', '가방에 있는 미장착 아이템만 등록할 수 있습니다.');
      if (!sellable(selected)) fail(409, 'ITEM_NOT_AVAILABLE', '미장착 장비와 미사용 스킬북만 등록할 수 있습니다.');
      // ② 실제로 꺼낼 아이템 — 같은 묶음 기준(스킬북은 같은 `skillId`)에서 요청 수량만큼 가방 순서대로.
      const key = bundleKey(selected);
      const picked = Array.isArray(input.itemIds)
        ? requested.map(entry => save.bag.find(item => item.id === entry))
        : save.bag.filter(item => bundleKey(item) === key).slice(0, wanted);
      if (picked.some(item => !item)) fail(409, 'ITEM_NOT_AVAILABLE', '가방에 있는 미장착 아이템만 등록할 수 있습니다.');
      if (!Array.isArray(input.itemIds) && picked.length < wanted) fail(400, 'INVALID_QUANTITY', '보유한 수량보다 많이 등록할 수 없습니다.');
      if (picked.some(item => !sellable(item))) fail(409, 'ITEM_NOT_AVAILABLE', '미장착 장비와 미사용 스킬북만 등록할 수 있습니다.');
      if (picked.some(item => bundleKey(item) !== key)) fail(400, 'INVALID_QUANTITY', '같은 아이템(같은 스킬북)만 한 묶음으로 등록할 수 있습니다.');
      if (picked.some(item => item.locked === true) && input.unlockItem !== true) fail(409, 'ITEM_LOCKED', '잠긴 장비입니다. 잠금을 해제한 뒤 판매 등록하세요.');
      for (const item of picked) if (item.locked === true) item.locked = false;
      if (price * picked.length > rules.maxPrice) fail(400, 'INVALID_PRICE', '총 판매 금액은 1,000,000,000 금화 이하로 입력하세요.');
      const removed = new Set(picked.map(item => item.id)), now = Date.now(), listingId = randomUUID(), quantity = picked.length;
      save.bag = save.bag.filter(item => !removed.has(item.id));
      // 대표 `item_json`은 검색·정렬 인덱스용이고, 실제 아이템 배열은 `items_json`에 보관한다.
      // INSERT는 **예전 열 목록 그대로** 쓴다 — `quantity`(기본 1)·`items_json`(NULL=단건 매물)은 기본값으로 두고,
      // 묶음일 때만 아래 UPDATE로 채운다. 이렇게 하면 (혹시) 열 보정이 안 된 DB에서도 **단건 등록·구매는 종전대로**
      // 동작하고, 묶음 등록만 실패한다(전체 거래가 막히는 것보다 낫다).
      write({ sql: 'INSERT INTO djrpg_market (id,seller,seller_name,buyer,item_json,name,slot,rarity,price,state,created_at,expires_at,sold_at) VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,NULL)', args: [listingId, id, String(save.name || '모험가').slice(0, 20), JSON.stringify(picked[0]), picked[0].name, picked[0].slot, picked[0].rarity, price, 'active', now, now + rules.durationHours * 3600_000] });
      if (quantity > 1) write({ sql: 'UPDATE djrpg_market SET quantity=?, items_json=? WHERE id=?', args: [quantity, JSON.stringify(picked), listingId] });
      for (const item of picked) {
        write({ sql: "UPDATE djrpg_item_owners SET location='escrow' WHERE item_id=?", args: [item.id] });
        write({ sql: 'UPDATE djrpg_character_item_owners SET slot=0 WHERE item_id=? AND account_id=?', args: [item.id, id] });
      }
      event('registered', listingId);
      effect.listing = { id: listingId, state: 'active', quantity, mine: true };
      message = quantity > 1 ? `${quantity}개 묶음 판매 등록 완료 · 72시간 동안 공개됩니다.` : '판매 등록 완료 · 72시간 동안 공개됩니다.';
    } else if (input.action === 'buy' || input.action === 'cancel') {
      const sale = reads[2].rows[0];
      if (!sale || sale.state !== 'active' || Number(sale.expires_at) <= Date.now()) fail(409, 'NOT_AVAILABLE', '이미 판매되었거나 취소·만료된 매물입니다.');
      const mine = String(sale.seller).toLowerCase() === id.toLowerCase(), items = parseItems(sale);
      if (input.action === 'cancel') {
        if (!mine) fail(403, 'NOT_OWNER', '본인이 등록한 매물만 취소할 수 있습니다.');
        write({ sql: "UPDATE djrpg_market SET state='cancelled' WHERE id=?", args: [sale.id] });
        // 묶음 매물은 남은 아이템을 **전부** 돌려준다(작업 249) — 아이템마다 수령함 한 줄(아이템 id로 중복 방지).
        for (const item of items) {
          inbox(sale, id, deliveryItemKind('return', sale, item), item, 0, '판매 등록 취소');
          write({ sql: "UPDATE djrpg_item_owners SET location='inbox' WHERE item_id=?", args: [item.id] });
          write({ sql: 'UPDATE djrpg_character_item_owners SET slot=0 WHERE item_id=? AND account_id=?', args: [item.id, id] });
        }
        event('cancelled', sale.id);
        effect.listing = { id: sale.id, state: 'cancelled' };
        message = items.length > 1 ? `등록을 취소했습니다. 아이템 ${items.length}개는 수령함에 보관됩니다.` : '등록을 취소했습니다. 아이템은 수령함에 보관됩니다.';
      } else {
        // 거래소는 **계정 공용**이라 다른 캐릭터(2·3번)로 올린 매물도 `mine`으로 잡힌다. 예전 문구("본인 매물은
        // 구매할 수 없습니다")는 캐릭터를 바꿔 쓰는 계정에는 "내 매물이 아닌데 막힌다"로 읽혔다(작업 239) —
        // 왜 막히는지와 대신 무엇을 하면 되는지(취소 → 수령함 → 그 캐릭터로 받기)를 함께 알린다.
        if (mine) fail(400, 'OWN_LISTING', '내 계정이 등록한 매물입니다(다른 캐릭터로 올린 매물 포함). 등록을 취소하면 수령함에서 받을 수 있습니다.');
        // ③ 구매 수량(작업 249) — 없으면 매물 전체. `1 <= quantity <= 남은 수량`만 받는다.
        const remaining = Math.max(1, Number(sale.quantity ?? items.length));
        const unitPrice = Number(sale.price);
        const wanted = input.quantity === undefined ? remaining : input.quantity;
        if (!Number.isSafeInteger(wanted) || wanted < 1 || wanted > remaining || wanted > items.length) fail(400, 'INVALID_QUANTITY', `구매 수량은 1~${Math.min(remaining, items.length)}개 사이로 선택하세요.`);
        const total = unitPrice * wanted;
        // 구매 배달도 아이템마다 한 줄이라, 남은 자리가 모자라면 사지 못하게 막는다(작업 247 상한).
        if (inboxCount + wanted > rules.maxInbox) fail(409, 'INBOX_FULL', inboxFullMessage);
        if (save.gold < total) fail(400, 'INSUFFICIENT_GOLD', '금화가 부족합니다.');
        save.gold -= total;
        const bought = items.slice(0, wanted), rest = items.slice(wanted), soldAt = Date.now(), full = rest.length === 0;
        for (const item of bought) {
          inbox(sale, id, deliveryItemKind('purchase', sale, item), item, 0, '구매한 아이템');
          write({ sql: "UPDATE djrpg_item_owners SET account_id=?,location='inbox' WHERE item_id=?", args: [id, item.id] });
          write({ sql: 'UPDATE djrpg_character_item_owners SET account_id=?,slot=0 WHERE item_id=?', args: [id, item.id] });
        }
        // 판매대금은 실제로 팔린 만큼만(개당 × 수량, 수수료 5% 올림). 부분 구매는 대금 배달도 여러 번 생긴다.
        const proceeds = total - Math.ceil(total * 5 / 100);
        inbox(sale, sale.seller, full ? 'proceeds' : `proceeds:${randomUUID().slice(0, 8)}`, null, proceeds, `${bought[0].name} 판매대금 (수수료 5% 차감)`);
        // 판매 완료 행의 `quantity`는 **팔린 수량**이다(화면이 `총 N개`로 보여 준다).
        // 마지막 한 개를 사면 예전 UPDATE(열 추가 이전과 같은 문장)로 닫는다 — 팔린 수량은 이미 1이고
        // `items_json`은 다시 쓰지 않는다. 묶음에서 일부만 남아 있던 경우까지 안전하다(열 보정 실패 DB 포함).
        if (full && items.length > 1) write({ sql: "UPDATE djrpg_market SET state='sold', buyer=?, sold_at=?, quantity=?, items_json=? WHERE id=? AND state='active'", args: [id, soldAt, wanted, JSON.stringify(bought), sale.id] });
        else if (full) write({ sql: "UPDATE djrpg_market SET state='sold', buyer=?, sold_at=? WHERE id=? AND state='active'", args: [id, soldAt, sale.id] });
        else write({ sql: "UPDATE djrpg_market SET quantity=?, items_json=? WHERE id=? AND state='active'", args: [rest.length, JSON.stringify(rest), sale.id] });
        event('sold', sale.id);
        effect.listing = { id: sale.id, state: full ? 'sold' : 'active', quantity: full ? wanted : rest.length, soldAt: full ? soldAt : undefined };
        tradeParties = { buyer: id, seller: sale.seller };
        message = full
          ? (wanted > 1 ? `구매 완료! ${wanted}개를 수령함에서 받아주세요.` : '구매 완료! 수령함에서 아이템을 받아주세요.')
          : `${wanted}개 구매 완료 · ${rest.length}개는 계속 판매 중입니다. 수령함에서 받아주세요.`;
      }
    } else if (input.action === 'claim') {
      const all = input.deliveryId === 'all', deliveries = reads[2].rows;
      if (!deliveries.length) fail(409, 'ALREADY_CLAIMED', '이미 수령했거나 존재하지 않는 항목입니다.');
      const claimed = []; let gold = 0, skipped = 0;
      // 가방 40칸은 장비 + 타직업 전용 스킬북 + 보물 주머니를 센다(내 직업 스킬북 제외, 작업 253).
      let equipmentCount = save.bag.filter(item => countedInBag(item, save.job)).length;
      for (const delivery of deliveries) {
        const item = delivery.item_json ? JSON.parse(delivery.item_json) : null;
        if (item && countedInBag(item, save.job) && equipmentCount >= 40) {
          if (!all) fail(409,'BAG_FULL','가방이 가득 찼습니다. 수령함에 안전하게 보관되므로 공간을 비운 뒤 받아주세요.');
          skipped++;continue;
        }
        if (item) {
          // 클라이언트 세이브가 이미 같은 아이템을 들고 있으면(수령 직후 저장·재시도) 두 번 넣지 않는다(작업 222).
          if (!save.bag.some(entry => entry.id === item.id)) { save.bag.push(item); if (countedInBag(item, save.job)) equipmentCount++; }
          write({sql:"UPDATE djrpg_item_owners SET location='inventory' WHERE item_id=? AND account_id=?",args:[item.id,id]});
          write({sql:'INSERT INTO djrpg_character_item_owners(item_id,account_id,slot) VALUES (?,?,?) ON CONFLICT(item_id) DO UPDATE SET account_id=excluded.account_id,slot=excluded.slot',args:[item.id,id,row.slot]});
        }
        gold += Number(delivery.gold);claimed.push(delivery.id);
        write({sql:'UPDATE djrpg_market_inbox SET claimed_at=? WHERE id=? AND claimed_at IS NULL',args:[Date.now(),delivery.id]});
      }
      if(!claimed.length)fail(409,'BAG_FULL','장비 가방이 가득 찼습니다. 미수령 물품은 수령함에 보관됩니다.');
      save.gold += gold; goldCredit = gold;
      if(all)effect.claimedIds=claimed;else effect.claimedId=claimed[0];
      message=all?`${claimed.length}건 수령 완료${skipped?` · 공간 부족 장비 ${skipped}건은 수령함에 보관`:''}`:deliveries[0].item_json?`아이템을 ${String(save.name || '캐릭터').slice(0, 16)}의 가방으로 받았습니다.`:`${gold.toLocaleString('ko-KR')} 금화를 받았습니다.`;
    } else fail(400, 'INVALID_ACTION', '지원하지 않는 거래 요청입니다.');
    write({ sql: 'INSERT INTO djrpg_market_requests VALUES (?,?,?)', args: [id, input.requestId, JSON.stringify({ ok: true, message, effect, revision: row.revision + 1 })] });
    if (tradeParties) {
      // 구매자 장부는 이 트랜잭션의 장부 쓰기(`journeyOperation`)에 실어 보내고, `writeSave`의 장부 쓰기는
      // 한 번만 남도록 `skipJourney`로 맡긴다 — 추가 DB 배치·실행 없이 같은 배치에 들어간다.
      const state = await journeyState(tx, row, save);
      state.marketTrades = (state.marketTrades ?? 0) + 1;
      operations.push(journeyOperation(id, state), tradeCountOperation(tradeParties.seller));
      saveRow = { ...row, skipJourney: true };
    }
    return { ok: true, message, effect, ...await writeSave(tx, saveRow, save, operations, true, { goldCredit }) };
  });
}

export async function recentPrice(db,input) {
  if(typeof input.name!=='string'||input.name.length>100||!['common','magic','rare','epic','unique','legendary'].includes(input.rarity)||!['weapon','offhand','helmet','armor','necklace','gloves','belt','boots','ring1','ring2','skillbook'].includes(input.slot))fail(400,'INVALID_ITEM','시세 조회 아이템을 확인하세요.');
  const rings=input.slot==='ring1'||input.slot==='ring2';
  const rows=(await db.execute({sql:`SELECT price,sold_at FROM djrpg_market WHERE state='sold' AND name=? AND rarity=? AND ${rings?"slot IN ('ring1','ring2')":'slot=?'} ORDER BY sold_at DESC,id DESC LIMIT 10`,args:rings?[input.name,input.rarity]:[input.name,input.rarity,input.slot]})).rows;
  return {count:rows.length,lastPrice:rows.length?Number(rows[0].price):null,soldAt:rows.length?Number(rows[0].sold_at):null,average:rows.length?Math.round(rows.reduce((sum,row)=>sum+Number(row.price),0)/rows.length):null};
}
