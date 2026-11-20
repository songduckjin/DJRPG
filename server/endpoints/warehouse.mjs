import { client, schema, transaction, account, assertRevision, assertSession, assertSessionId, writeSave, fail } from '../database.mjs';
import { tokenPayload } from '../auth.mjs';
import { sharedConnection } from '../connection.mjs';
import { createTrace, logRequest } from '../metrics.mjs';
import { runtimeEnv } from '../env.mjs';
import { json, readBody, errorResponse, versionGuard } from '../http.mjs';
import { normalizeExtraOptions } from '../extra-options.mjs';

/** 창고 40칸 · 한 번에 옮길 수 있는 최대 개수(가방 40칸과 같은 상한). */
const WAREHOUSE_LIMIT = 40;
const BATCH_LIMIT = 40;

export async function warehouseEndpoint(request, options = {}) {
  const context = { trace: createTrace(), action: '', code: '', clamped: 0 };
  const response = await handle(request, options, context);
  try { response?.headers?.set('Server-Timing', context.trace.header()); } catch { /* 헤더 실패는 응답을 막지 않는다 */ }
  logRequest({ path: '/api/warehouse', action: context.action, status: response?.status, trace: context.trace, code: context.code, clamped: context.clamped });
  return response;
}

/** 지금 창고에 있는 아이템 목록 — 이동 응답에 그대로 실어 보내, 화면이 목록을 다시 부르지 않고 그리드만 다시 그린다. */
async function warehouseItems(tx, id) {
  const rows = (await tx.execute({ sql: 'SELECT item_json FROM djrpg_warehouse WHERE account_id=? ORDER BY item_id', args: [id] })).rows;
  return rows.map(row => JSON.parse(row.item_json));
}

async function handle(request, { env = runtimeEnv(), createDbClient } = {}, context) {
  const res = { status: status => ({ json: body => json(body, status) }) };
  const req = { method: request.method, body: await readBody(request) };
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', error: 'POST 요청만 허용합니다.' });
  const outdated = versionGuard(request);
  if (outdated) return outdated;
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return res.status(503).json({ code: 'DB_NOT_CONFIGURED', error: '서버 DB가 설정되지 않았습니다.' });
  const signed = tokenPayload(request, env);
  if (!signed) return res.status(401).json({ code: 'INVALID_TOKEN', error: '인증이 만료되었습니다. 다시 로그인하세요.' });
  const id = signed.id;
  let db;
  try {
    db = createDbClient ? createDbClient(env) : await sharedConnection(env);
    if (createDbClient) await context.trace.step('schema', () => schema(db, env));
    const input = req.body ?? {};
    context.action = typeof input.action === 'string' ? input.action : '';
    if (input.action === 'list') {
      await assertSessionId(db, id, signed.sid);
      return res.status(200).json({ items: await warehouseItems(db, id) });
    }
    // 일괄 이동(작업 225): `itemIds` 배열을 주면 한 트랜잭션에서 여러 개를 옮긴다.
    // 예전 클라이언트의 `itemId` 한 개 요청은 아래 단건 경로 그대로 동작한다(응답·에러 코드·문구 동일).
    const batch = Array.isArray(input.itemIds);
    if (!['deposit', 'withdraw'].includes(input.action)) fail(400, 'INVALID_ACTION', '지원하지 않는 창고 요청입니다.');
    if (typeof input.requestId !== 'string' || !/^[\w-]{16,80}$/.test(input.requestId)) fail(400, 'INVALID_REQUEST', '창고 요청 번호 또는 아이템 정보가 올바르지 않습니다.');
    let ids = [];
    if (batch) {
      if (!input.itemIds.length || input.itemIds.length > BATCH_LIMIT) fail(400, 'INVALID_REQUEST', `한 번에 1~${BATCH_LIMIT}개까지 옮길 수 있습니다.`);
      if (input.itemIds.some(itemId => typeof itemId !== 'string' || !itemId || itemId.length > 80)) fail(400, 'INVALID_REQUEST', '아이템 정보가 올바르지 않습니다.');
      ids = [...new Set(input.itemIds)];
      if (!ids.length) fail(400, 'INVALID_REQUEST', '옮길 아이템이 없습니다.');
    } else if (typeof input.itemId !== 'string') {
      fail(400, 'INVALID_REQUEST', '창고 요청 번호 또는 아이템 정보가 올바르지 않습니다.');
    } else {
      ids = [input.itemId];
    }
    const result = await context.trace.step('tx', () => transaction(db, async tx => {
      const row = await account(tx, id);
      assertSession(row, signed.sid);
      if (Number(input.characterSlot ?? 1) !== row.slot) fail(409, 'CHARACTER_CONFLICT', '다른 캐릭터가 선택되었습니다. 새로고침해 주세요.');
      const replay = (await tx.execute({ sql: 'SELECT response_json FROM djrpg_warehouse_requests WHERE account_id=? AND request_id=?', args: [id, input.requestId] })).rows[0];
      if (replay) return { ...JSON.parse(replay.response_json), save: row.save, revision: row.revision };
      assertRevision(row, input.revision);
      const save = structuredClone(row.save), operations = [];
      // 일괄 요청에서 한 개라도 조건이 어긋나면 **아무것도 옮기지 않는다** — 트랜잭션이 통째로 되돌아간다.
      // 단건 요청의 에러 코드·문구는 예전 그대로 두고, 일괄일 때만 무엇이 문제였는지 개수와 함께 알린다.
      const reject = (code, single, batched) => fail(409, code, batch ? batched : single);
      if (input.action === 'deposit') {
        let stored = batch
          ? Number((await tx.execute({ sql: 'SELECT COUNT(*) AS n FROM djrpg_warehouse WHERE account_id=?', args: [id] })).rows[0].n)
          : 0;
        for (const itemId of ids) {
          const index = save.bag.findIndex(item => item.id === itemId);
          if (index < 0) reject('ITEM_NOT_AVAILABLE', '가방에 있는 아이템만 창고에 넣을 수 있습니다.', '가방에 없는 아이템이 있어 아무것도 보관하지 않았습니다. 새로고침 후 다시 시도하세요.');
          const item = save.bag[index];
          // 추가옵션(작업 238)은 `id`에서 다시 계산해 저장한다 — 창고로 들어가는 사본도 서버가 정한다.
          normalizeExtraOptions(item);
          const owner = (await tx.execute({ sql: 'SELECT o.location,m.slot FROM djrpg_item_owners o LEFT JOIN djrpg_character_item_owners m ON m.item_id=o.item_id WHERE o.item_id=? AND o.account_id=?', args: [item.id, id] })).rows[0];
          if (!owner || owner.location !== 'inventory' || Number(owner.slot) !== row.slot) reject('ITEM_CONFLICT', '아이템 소유 상태가 달라졌습니다. 다시 불러오세요.', '소유 상태가 달라진 아이템이 있어 아무것도 보관하지 않았습니다. 새로고침 후 다시 시도하세요.');
          if (!batch) stored = Number((await tx.execute({ sql: 'SELECT COUNT(*) AS n FROM djrpg_warehouse WHERE account_id=?', args: [id] })).rows[0].n);
          if (stored >= WAREHOUSE_LIMIT) reject('WAREHOUSE_FULL', '공용창고가 가득 찼습니다.', `공용창고가 가득 차 ${ids.length}개를 보관하지 못했습니다.`);
          stored++;
          save.bag.splice(index, 1);
          operations.push({ sql: 'INSERT INTO djrpg_warehouse(account_id,item_id,item_json) VALUES (?,?,?)', args: [id, item.id, JSON.stringify(item)] });
          operations.push({ sql: "UPDATE djrpg_item_owners SET location='warehouse' WHERE item_id=? AND account_id=?", args: [item.id, id] });
          operations.push({ sql: 'UPDATE djrpg_character_item_owners SET slot=0 WHERE item_id=? AND account_id=?', args: [item.id, id] });
        }
      } else {
        const equipment = () => save.bag.filter(entry => entry.slot !== 'skillbook' && entry.slot !== 'pouch').length;
        let bagCount = batch ? equipment() : 0;
        for (const itemId of ids) {
          const stored = (await tx.execute({ sql: `SELECT w.item_json,o.location,m.slot FROM djrpg_warehouse w
            JOIN djrpg_item_owners o ON o.item_id=w.item_id AND o.account_id=w.account_id
            JOIN djrpg_character_item_owners m ON m.item_id=w.item_id AND m.account_id=w.account_id
            WHERE w.account_id=? AND w.item_id=?`, args: [id, itemId] })).rows[0];
          if (!stored || stored.location !== 'warehouse' || Number(stored.slot) !== 0) reject('ITEM_NOT_AVAILABLE', '창고 아이템 상태가 달라졌습니다. 다시 불러오세요.', '창고에 없는 아이템이 있어 아무것도 꺼내지 않았습니다. 새로고침 후 다시 시도하세요.');
          const item = JSON.parse(stored.item_json);
          normalizeExtraOptions(item);
          if (!batch) bagCount = equipment();
          if (item.slot !== 'skillbook' && item.slot !== 'pouch') {
            if (bagCount >= WAREHOUSE_LIMIT) reject('BAG_FULL', '가방이 가득 찼습니다.', `가방이 가득 차 ${ids.length}개를 꺼내지 못했습니다.`);
            bagCount++;
          }
          save.bag.push(item);
          operations.push({ sql: 'DELETE FROM djrpg_warehouse WHERE account_id=? AND item_id=?', args: [id, item.id] });
          operations.push({ sql: "UPDATE djrpg_item_owners SET location='inventory' WHERE item_id=? AND account_id=?", args: [item.id, id] });
          operations.push({ sql: 'UPDATE djrpg_character_item_owners SET slot=? WHERE item_id=? AND account_id=?', args: [row.slot, item.id, id] });
        }
      }
      const saved = await writeSave(tx, row, save, operations);
      if (saved.clamped?.length) context.clamped = saved.clamped.length;
      const message = input.action === 'deposit'
        ? (batch && ids.length > 1 ? `${ids.length}개를 공용창고에 보관했습니다.` : '공용창고에 보관했습니다.')
        : (batch && ids.length > 1 ? `${ids.length}개를 가방으로 가져왔습니다.` : '가방으로 가져왔습니다.');
      const response = { ok: true, message, moved: ids, items: await warehouseItems(tx, id) };
      await tx.execute({ sql: 'INSERT INTO djrpg_warehouse_requests(account_id,request_id,response_json) VALUES (?,?,?)', args: [id, input.requestId, JSON.stringify(response)] });
      return { ...response, ...saved };
    }));
    return res.status(200).json(result);
  } catch (error) { context.code = error?.code ?? error?.name ?? ''; return errorResponse(error); }
  finally { if (createDbClient) await db?.close(); }
}
