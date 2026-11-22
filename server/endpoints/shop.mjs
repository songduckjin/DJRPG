import { randomUUID } from 'node:crypto';
import { client, schema, transaction, account, assertSession, fail } from '../database.mjs';
import { tokenPayload } from '../auth.mjs';
import { runtimeEnv } from '../env.mjs';
import { json, readBody, errorResponse, versionGuard } from '../http.mjs';

export const diamondPacks = [100, 300, 500, 1000, 2000, 5000, 10000, 20000].map(count => ({ id: `diamond_${count}`, diamonds: count, price: count * 11 }));
const slotPrice = 500;
const allIdlePrice = 1500;
const allIdleDuration = 30 * 24 * 60 * 60 * 1000;
// 캐릭터 슬롯은 기본 3칸에서 구매로 **최대 8칸**까지. 이 상한은 판매 상한이고,
// 이미 9칸을 산 계정의 기존 캐릭터는 그대로 둔다(`server/endpoints/account.mjs`의 절대 상한 9).
const maxSlots = 8;
const walletFor = async (db, id) => {
  await db.execute({ sql: 'INSERT OR IGNORE INTO djrpg_shop_wallet(account_id,customer_key) VALUES (?,?)', args: [id, randomUUID()] });
  return (await db.execute({ sql: 'SELECT diamonds,max_slots,customer_key FROM djrpg_shop_wallet WHERE account_id=?', args: [id] })).rows[0];
};
const publicWallet = wallet => ({ diamonds: Number(wallet.diamonds), maxSlots: Number(wallet.max_slots) });

export async function shopEndpoint(request, { env = runtimeEnv(), createDbClient, providerFetch = fetch } = {}) {
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED', error: 'POST 요청만 허용합니다.' }, 405);
  const outdated = versionGuard(request);
  if (outdated) return outdated;
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return json({ code: 'DB_NOT_CONFIGURED', error: '서버 DB가 설정되지 않았습니다.' }, 503);
  let db;
  try {
    db = createDbClient ? createDbClient(env) : client(env);
    await schema(db, env);
    const signed = tokenPayload(request, env);
    if (!signed) fail(401, 'INVALID_TOKEN', '다시 로그인하세요.');
    const id = signed.id;
    const row = await account(db, id);
    assertSession(row, signed.sid);
    const body = await readBody(request) ?? {};
    if (body.action === 'catalog') {
      const wallet = await walletFor(db, id);
      const entitlement = (await db.execute({ sql: "SELECT expires_at FROM djrpg_shop_entitlements WHERE account_id=? AND entitlement_key='all_idle_30d'", args: [id] })).rows[0];
      return json({ wallet: publicWallet(wallet), diamondPacks, packages: [
        { id: 'slot', name: '캐릭터 슬롯 추가', diamonds: slotPrice, available: Number(wallet.max_slots) < maxSlots },
        { id: 'all_idle_30d', name: '전 슬롯 방치 30일', diamonds: allIdlePrice, available: row.password_hash !== 'guest', expiresAt: Number(entitlement?.expires_at ?? 0) },
        { id: 'ad_free', name: '광고 제거', diamonds: 1000, available: false }
      ], paymentReady: !!(env.TOSS_CLIENT_KEY && env.TOSS_SECRET_KEY) });
    }
    if (body.action === 'buySlot') {
      if (row.password_hash === 'guest') fail(403, 'GUEST_PURCHASE_DISABLED', '정식 계정에서 구매할 수 있습니다.');
      const requestId = String(body.requestId ?? '');
      if (!/^[\w-]{8,80}$/.test(requestId)) fail(400, 'INVALID_REQUEST', '구매 요청을 다시 시도하세요.');
      const result = await transaction(db, async tx => {
        const current = await account(tx, id);
        assertSession(current, signed.sid);
        const replay = (await tx.execute({ sql: 'SELECT response_json FROM djrpg_shop_requests WHERE account_id=? AND request_id=?', args: [id, requestId] })).rows[0];
        if (replay) {
          const previous = JSON.parse(replay.response_json);
          if (previous.type && previous.type !== 'slot') fail(409, 'REQUEST_CONFLICT', '다른 상품의 구매 요청 ID입니다.');
          return previous;
        }
        const wallet = await walletFor(tx, id);
        if (Number(wallet.max_slots) >= maxSlots) fail(409, 'MAX_SLOTS', '모든 캐릭터 슬롯이 열려 있습니다.');
        if (Number(wallet.diamonds) < slotPrice) fail(400, 'INSUFFICIENT_DIAMONDS', '다이아가 부족합니다.');
        await tx.execute({ sql: 'UPDATE djrpg_shop_wallet SET diamonds=diamonds-?,max_slots=max_slots+1 WHERE account_id=?', args: [slotPrice, id] });
        await tx.execute({ sql: 'INSERT INTO djrpg_shop_ledger(account_id,source_type,source_id,diamonds_delta,created_at) VALUES (?,?,?,?,?)', args: [id, 'slot', requestId, -slotPrice, Date.now()] });
        const updated = await walletFor(tx, id);
        const response = { type: 'slot', wallet: publicWallet(updated) };
        await tx.execute({ sql: 'INSERT INTO djrpg_shop_requests(account_id,request_id,response_json) VALUES (?,?,?)', args: [id, requestId, JSON.stringify(response)] });
        return response;
      });
      return json(result);
    }
    if (body.action === 'buyAllIdle') {
      if (row.password_hash === 'guest') fail(403, 'GUEST_PURCHASE_DISABLED', '정식 계정에서 구매할 수 있습니다.');
      const requestId = String(body.requestId ?? '');
      if (!/^[\w-]{8,80}$/.test(requestId)) fail(400, 'INVALID_REQUEST', '구매 요청을 다시 시도하세요.');
      const result = await transaction(db, async tx => {
        const current = await account(tx, id);
        assertSession(current, signed.sid);
        const replay = (await tx.execute({ sql: 'SELECT response_json FROM djrpg_shop_requests WHERE account_id=? AND request_id=?', args: [id, requestId] })).rows[0];
        if (replay) {
          const previous = JSON.parse(replay.response_json);
          if (previous.type !== 'all_idle_30d') fail(409, 'REQUEST_CONFLICT', '다른 상품의 구매 요청 ID입니다.');
          return previous;
        }
        const wallet = await walletFor(tx, id);
        if (Number(wallet.diamonds) < allIdlePrice) fail(400, 'INSUFFICIENT_DIAMONDS', '다이아가 부족합니다.');
        const now = Date.now();
        const previous = (await tx.execute({ sql: "SELECT expires_at FROM djrpg_shop_entitlements WHERE account_id=? AND entitlement_key='all_idle_30d'", args: [id] })).rows[0];
        const wasActive = Number(previous?.expires_at ?? 0) > now;
        const expiresAt = Math.max(now, Number(previous?.expires_at ?? 0)) + allIdleDuration;
        await tx.execute({ sql: 'UPDATE djrpg_shop_wallet SET diamonds=diamonds-? WHERE account_id=?', args: [allIdlePrice, id] });
        await tx.execute({ sql: 'INSERT INTO djrpg_shop_ledger(account_id,source_type,source_id,diamonds_delta,created_at) VALUES (?,?,?,?,?)', args: [id, 'all_idle_30d', requestId, -allIdlePrice, now] });
        await tx.execute({ sql: "INSERT INTO djrpg_shop_entitlements(account_id,entitlement_key,quantity,expires_at,updated_at) VALUES (?,'all_idle_30d',1,?,?) ON CONFLICT(account_id,entitlement_key) DO UPDATE SET quantity=1,expires_at=excluded.expires_at,updated_at=excluded.updated_at", args: [id, expiresAt, now] });
        if (!wasActive) {
          const idleSlots = (await tx.execute({ sql: 'SELECT slot,updated_at FROM djrpg_characters WHERE account_id=? AND slot<>?', args: [id, current.slot] })).rows;
          const oldExpiry = Number(previous?.expires_at ?? 0);
          for (const slot of idleSlots) {
            const earned = oldExpiry > Date.parse(String(slot.updated_at)) ? Math.min(43_200, Math.max(0, Math.floor((oldExpiry-Date.parse(String(slot.updated_at)))/1000))) : 0;
            if (earned >= 60) await tx.execute({ sql: `INSERT INTO djrpg_shop_entitlements(account_id,entitlement_key,quantity,expires_at,updated_at) VALUES (?,?,?,NULL,?)
              ON CONFLICT(account_id,entitlement_key) DO UPDATE SET quantity=MIN(43200,quantity+excluded.quantity),updated_at=excluded.updated_at`, args: [id, `idle_claim_${slot.slot}`, earned, now] });
          }
          await tx.execute({ sql: 'UPDATE djrpg_characters SET updated_at=? WHERE account_id=? AND slot<>?', args: [new Date(now).toISOString(), id, current.slot] });
        }
        const response = { type: 'all_idle_30d', wallet: publicWallet(await walletFor(tx, id)), expiresAt };
        await tx.execute({ sql: 'INSERT INTO djrpg_shop_requests(account_id,request_id,response_json) VALUES (?,?,?)', args: [id, requestId, JSON.stringify(response)] });
        return response;
      });
      return json(result);
    }
    if (body.action === 'createOrder') {
      if (row.password_hash === 'guest') fail(403, 'GUEST_PURCHASE_DISABLED', '정식 계정에서 구매할 수 있습니다.');
      if (!env.TOSS_CLIENT_KEY || !env.TOSS_SECRET_KEY) fail(503, 'PAYMENT_NOT_CONFIGURED', '결제 준비 중입니다.');
      const pack = diamondPacks.find(item => item.id === body.packId);
      if (!pack) fail(400, 'INVALID_PRODUCT', '판매하지 않는 상품입니다.');
      const wallet = await walletFor(db, id);
      const orderId = randomUUID();
      await db.execute({ sql: 'INSERT INTO djrpg_shop_orders(order_id,account_id,product_id,amount,currency,provider,grant_json,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)', args: [orderId, id, pack.id, pack.price, 'KRW', 'toss', JSON.stringify({ diamonds: pack.diamonds }), 'pending', Date.now()] });
      return json({ orderId, orderName: `다이아 ${pack.diamonds}개`, amount: pack.price, customerKey: wallet.customer_key, clientKey: env.TOSS_CLIENT_KEY });
    }
    if (body.action === 'confirmOrder') {
      const orderId = String(body.orderId ?? ''), paymentKey = String(body.paymentKey ?? '');
      if (!/^[a-f0-9-]{36}$/.test(orderId) || !paymentKey || paymentKey.length > 200) fail(400, 'INVALID_PAYMENT', '결제 정보가 올바르지 않습니다.');
      const order = (await db.execute({ sql: 'SELECT * FROM djrpg_shop_orders WHERE order_id=? AND account_id=?', args: [orderId, id] })).rows[0];
      if (!order) fail(404, 'ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.');
      if (Number(body.amount) !== Number(order.amount)) fail(400, 'AMOUNT_MISMATCH', '결제 금액이 일치하지 않습니다.');
      if (order.status === 'done') {
        if (order.payment_key !== paymentKey) fail(409, 'PAYMENT_CONFLICT', '다른 결제 번호입니다.');
        return json({ wallet: publicWallet(await walletFor(db, id)), alreadyApplied: true });
      }
      if (!env.TOSS_SECRET_KEY) fail(503, 'PAYMENT_NOT_CONFIGURED', '결제 준비 중입니다.');
      const auth = `Basic ${btoa(`${env.TOSS_SECRET_KEY}:`)}`;
      let response = await providerFetch('https://api.tosspayments.com/v1/payments/confirm', { method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentKey, orderId, amount: Number(order.amount) }) });
      if (!response.ok) response = await providerFetch(`https://api.tosspayments.com/v1/payments/${encodeURIComponent(paymentKey)}`, { headers: { Authorization: auth } });
      const payment = await response.json();
      if (!response.ok || payment.status !== 'DONE' || payment.orderId !== orderId || Number(payment.totalAmount) !== Number(order.amount) || payment.paymentKey !== paymentKey) fail(502, 'PAYMENT_UNCONFIRMED', '결제 승인을 확인하지 못했습니다.');
      const grant = JSON.parse(order.grant_json);
      if (!Number.isSafeInteger(grant.diamonds) || grant.diamonds <= 0 || order.currency !== 'KRW' || order.provider !== 'toss') fail(409, 'INVALID_GRANT', '주문 지급 정보가 올바르지 않습니다.');
      const result = await transaction(db, async tx => {
        const current = (await tx.execute({ sql: 'SELECT * FROM djrpg_shop_orders WHERE order_id=? AND account_id=?', args: [orderId, id] })).rows[0];
        if (current.status === 'done') return { wallet: publicWallet(await walletFor(tx, id)), alreadyApplied: true };
        if (current.status !== 'pending') fail(409, 'ORDER_CONFLICT', '주문 상태를 다시 확인하세요.');
        await tx.execute({ sql: "UPDATE djrpg_shop_orders SET status='done',payment_key=?,confirmed_at=? WHERE order_id=? AND account_id=?", args: [paymentKey, Date.now(), orderId, id] });
        await tx.execute({ sql: 'INSERT INTO djrpg_shop_ledger(account_id,source_type,source_id,diamonds_delta,created_at) VALUES (?,?,?,?,?)', args: [id, 'order', orderId, grant.diamonds, Date.now()] });
        await tx.execute({ sql: 'UPDATE djrpg_shop_wallet SET diamonds=diamonds+? WHERE account_id=?', args: [grant.diamonds, id] });
        return { wallet: publicWallet(await walletFor(tx, id)), alreadyApplied: false };
      });
      return json(result);
    }
    fail(400, 'INVALID_ACTION', '지원하지 않는 요청입니다.');
  } catch (error) { return errorResponse(error); }
  finally { await db?.close(); }
}
