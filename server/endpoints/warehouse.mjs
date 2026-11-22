import { account, accountQuery, assertRevision, assertSession, assertSessionId, decodeAccount, inventoryOwnerQuery, reconcileItems, schema, transaction, validateSave, writeSave, fail } from '../database.mjs';
import { tokenPayload } from '../auth.mjs';
import { sharedConnection } from '../connection.mjs';
import { createTrace, logRequest } from '../metrics.mjs';
import { runtimeEnv } from '../env.mjs';
import { json, readBody, errorResponse, versionGuard } from '../http.mjs';
import { normalizeExtraOptions } from '../extra-options.mjs';
import { elapsedSince } from '../save-guard.mjs';
import { advanceSlotState, bagSlotState, itemSlotNeed } from '../core/rewardGrant.mjs';

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

/** `IN (?,?,…)` 자리 — 한 번에 40개까지라 SQLite 인자 상한(999)에 한참 못 미친다. */
const marks = count => Array.from({ length: count }, () => '?').join(',');
/**
 * 옮길 아이템들의 소유 기록을 **한 번에** 읽는다(작업 249·253).
 *
 * 예전에는 아이템마다 `SELECT … WHERE o.item_id=?`를 따로 보냈다 — Turso 호스팅 DB에서는 그 한 번이
 * 곧 HTTP 왕복 한 번이라, 40개를 옮기면 조회만으로 40번을 기다렸다. `IN (...)` 하나면 개수와 상관없이 1번이고,
 * 지금은 이 문장도 아래 읽기 묶음(`tx.batch`)에 함께 실려 다른 읽기와 **같은 왕복**을 쓴다(작업 258).
 */
const ownerQuery = (id, ids) => ({
  sql: `SELECT o.item_id,o.location,m.slot FROM djrpg_item_owners o
    LEFT JOIN djrpg_character_item_owners m ON m.item_id=o.item_id
    WHERE o.account_id=? AND o.item_id IN (${marks(ids.length)})`,
  args: [id, ...ids]
});

/** 창고 목록 정렬 — 서버 `SELECT … ORDER BY item_id`(문자열 BINARY)와 같은 순서로 맞춘다. */
const byItemId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

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
    const progress = input.progress;
    const result = await context.trace.step('tx', () => transaction(db, async tx => {
      // 읽기는 **한 묶음**으로 보낸다(작업 258): 계정 행 · 재요청 확인 · 창고 목록 · 옮길 아이템 소유 기록 ·
      // (진행 세이브를 함께 보냈으면) 그 세이브의 소유 기록 · 여정 상태. `tx.batch`는 문장이 몇 개든
      // Turso 왕복 1번이다. 창고 목록은 보관할 때 잔여 칸(40칸 검사)으로, 꺼낼 때 아이템 본문으로 쓰며,
      // 여정 상태를 미리 실어 두면 `writeSave`가 같은 표를 다시 읽지 않는다(`row.journeyRecord`).
      // 그래서 이 요청은 **읽기 1 + 쓰기 1**, 아이템이 1개든 40개든 DB 왕복이 늘지 않는다.
      const queries = [
        accountQuery(id),
        { sql: 'SELECT response_json FROM djrpg_warehouse_requests WHERE account_id=? AND request_id=?', args: [id, input.requestId] },
        { sql: 'SELECT item_id,item_json FROM djrpg_warehouse WHERE account_id=? ORDER BY item_id', args: [id] },
        ownerQuery(id, ids)
      ];
      // `inventoryOwnerQuery`는 세이브 형식 검사(`validateSave`)도 함께 한다 — 잘못된 진행 세이브는 배치 전에 400.
      if (progress !== undefined) queries.push(inventoryOwnerQuery(id, progress));
      queries.push({ sql: 'SELECT state_json FROM djrpg_journey WHERE account_id=?', args: [id] });
      const reads = await tx.batch(queries);
      // 계정 행이 아직 없는 예전 계정은 `account()`가 프로필·캐릭터 행을 만들어 준다(그때만 왕복 2번).
      const row = reads[0].rows[0] ? decodeAccount(reads[0].rows[0]) : await account(tx, id);
      assertSession(row, signed.sid);
      if (Number(input.characterSlot ?? 1) !== row.slot) fail(409, 'CHARACTER_CONFLICT', '다른 캐릭터가 선택되었습니다. 새로고침해 주세요.');
      const replay = reads[1].rows[0];
      // 같은 `requestId` 재전송 — 이미 처리된 요청이면 아무것도 다시 옮기지 않고 그 응답만 돌려준다.
      // 응답을 잃은 클라이언트가 진행 세이브를 다시 실어 보내도 두 번 저장되지 않는다(작업 249).
      if (replay) return { ...JSON.parse(replay.response_json), save: row.save, revision: row.revision };
      row.journeyRecord = reads[reads.length - 1].rows[0] ?? null;
      assertRevision(row, input.revision);
      // 진행 세이브 병합(작업 249): 화면 세이브를 이 요청에 함께 실어 보내면 **저장 1회 + 이동 1회**로
      // 두 번 왕복하던 것을 한 번으로 줄인다. 실린 세이브는 거래소와 같은 규칙으로 검증한다 —
      // 소유 기록이 없는 아이템·능력치 변조·가방 40칸 초과는 `reconcileItems`가 막고, 금화·경험치·층은
      // `writeSave`가 마지막 저장 이후 흐른 시간으로 상한을 계산한다. `progress`가 없으면(구클라이언트)
      // 예전 그대로 서버 세이브를 옮긴다.
      if (progress !== undefined) validateSave(progress);
      const save = structuredClone(progress ?? row.save), operations = [];
      const storedRows = reads[2].rows, ownerRows = reads[3].rows;
      const inventoryRows = progress !== undefined ? reads[4].rows : undefined;
      if (progress !== undefined) await reconcileItems(tx, id, row.save, save, { owned: inventoryRows, operations, slot: row.slot, elapsedSeconds: elapsedSince(row.character_updated_at) });
      // 일괄 요청에서 한 개라도 조건이 어긋나면 **아무것도 옮기지 않는다** — 트랜잭션이 통째로 되돌아간다.
      // 단건 요청의 에러 코드·문구는 예전 그대로 두고, 일괄일 때만 무엇이 문제였는지 개수와 함께 알린다.
      const reject = (code, single, batched) => fail(409, code, batch ? batched : single);
      const owners = new Map(ownerRows.map(entry => [entry.item_id, entry]));
      const storedItems = new Map(storedRows.map(entry => [entry.item_id, entry.item_json]));
      /** 이번 요청으로 실제로 옮긴 아이템 — 쓰기는 아이템 수와 상관없이 3문장으로 끝낸다(아래). */
      const moved = [];
      if (input.action === 'deposit') {
        // 창고 잔여 칸은 단건·일괄 모두 **루프 전에 한 번**만 센다 — 이미 읽어 둔 창고 목록의 길이다.
        let stored = storedRows.length;
        for (const itemId of ids) {
          const index = save.bag.findIndex(item => item.id === itemId);
          if (index < 0) reject('ITEM_NOT_AVAILABLE', '가방에 있는 아이템만 창고에 넣을 수 있습니다.', '가방에 없는 아이템이 있어 아무것도 보관하지 않았습니다. 새로고침 후 다시 시도하세요.');
          const item = save.bag[index];
          // 추가옵션(작업 238)은 `id`에서 다시 계산해 저장한다 — 창고로 들어가는 사본도 서버가 정한다.
          normalizeExtraOptions(item);
          // 진행 세이브를 함께 받았으면 그 세이브의 아이템 소유는 `reconcileItems`가 이미 맞춰 두었다
          // (서버가 처음 보는 아이템은 소유 기록을 이 트랜잭션에서 넣는다). 그래서 기록이 **없는** 아이템은
          // 그 검증을 믿고, 기록이 있는데 위치·캐릭터가 어긋나는 경우만 거절한다 — 방금 주운 아이템을
          // 곧바로 보관할 때 "소유 상태가 달라졌습니다"로 막히던 자리다.
          const owner = owners.get(item.id);
          const conflict = progress !== undefined
            ? Boolean(owner) && (owner.location !== 'inventory' || Number(owner.slot) !== row.slot)
            : !owner || owner.location !== 'inventory' || Number(owner.slot) !== row.slot;
          if (conflict) reject('ITEM_CONFLICT', '아이템 소유 상태가 달라졌습니다. 다시 불러오세요.', '소유 상태가 달라진 아이템이 있어 아무것도 보관하지 않았습니다. 새로고침 후 다시 시도하세요.');
          if (stored >= WAREHOUSE_LIMIT) reject('WAREHOUSE_FULL', '공용창고가 가득 찼습니다.', `공용창고가 가득 차 ${ids.length}개를 보관하지 못했습니다.`);
          stored++;
          save.bag.splice(index, 1);
          moved.push(item);
        }
        if (moved.length) {
          const movedIds = moved.map(item => item.id), slots = marks(moved.length);
          operations.push({
            sql: `INSERT INTO djrpg_warehouse(account_id,item_id,item_json) VALUES ${moved.map(() => '(?,?,?)').join(',')}`,
            args: moved.flatMap(item => [id, item.id, JSON.stringify(item)])
          });
          operations.push({ sql: `UPDATE djrpg_item_owners SET location='warehouse' WHERE account_id=? AND item_id IN (${slots})`, args: [id, ...movedIds] });
          operations.push({ sql: `UPDATE djrpg_character_item_owners SET slot=0 WHERE account_id=? AND item_id IN (${slots})`, args: [id, ...movedIds] });
        }
      } else {
        // 가방 40칸은 장비 1개=1칸, 보물 주머니는 **수량 무관 1칸**, 영구 스탯북은 종류당 1칸(주머니 스택형).
        // 칸 규칙은 `server/core/rewardGrant.mjs` 한 곳에 있다.
        const bagState = bagSlotState(save);
        for (const itemId of ids) {
          const raw = storedItems.get(itemId), owner = owners.get(itemId);
          if (raw === undefined || !owner || owner.location !== 'warehouse' || Number(owner.slot) !== 0) reject('ITEM_NOT_AVAILABLE', '창고 아이템 상태가 달라졌습니다. 다시 불러오세요.', '창고에 없는 아이템이 있어 아무것도 꺼내지 않았습니다. 새로고침 후 다시 시도하세요.');
          const item = JSON.parse(raw);
          normalizeExtraOptions(item);
          // 이동 중인 다중 요청에서도 같은 판정이 되도록 아이템마다 먼저 본다 — 이미 같은 묶음(주머니·같은 종류의 콕)이
          // 있으면 0칸이므로 가방이 40칸이어도 꺼낼 수 있다.
          const need = itemSlotNeed(bagState, item);
          if (bagState.slots + need > WAREHOUSE_LIMIT) reject('BAG_FULL', '가방이 가득 찼습니다.', `가방이 가득 차 ${ids.length}개를 꺼내지 못했습니다.`);
          advanceSlotState(bagState, item);
          save.bag.push(item);
          moved.push(item);
        }
        if (moved.length) {
          const movedIds = moved.map(item => item.id), slots = marks(moved.length);
          operations.push({ sql: `DELETE FROM djrpg_warehouse WHERE account_id=? AND item_id IN (${slots})`, args: [id, ...movedIds] });
          operations.push({ sql: `UPDATE djrpg_item_owners SET location='inventory' WHERE account_id=? AND item_id IN (${slots})`, args: [id, ...movedIds] });
          operations.push({ sql: `UPDATE djrpg_character_item_owners SET slot=? WHERE account_id=? AND item_id IN (${slots})`, args: [row.slot, id, ...movedIds] });
        }
      }
      const message = input.action === 'deposit'
        ? (batch && ids.length > 1 ? `${ids.length}개를 공용창고에 보관했습니다.` : '공용창고에 보관했습니다.')
        : (batch && ids.length > 1 ? `${ids.length}개를 가방으로 가져왔습니다.` : '가방으로 가져왔습니다.');
      // 응답의 창고 목록은 **다시 읽지 않고** 방금 읽은 행에 이번 이동을 반영해 만든다(작업 258 — 왕복 1회 절약).
      // 정렬은 서버 `ORDER BY item_id`와 같게 맞춘다.
      const itemsById = new Map(storedRows.map(entry => [entry.item_id, JSON.parse(entry.item_json)]));
      for (const item of moved) {
        if (input.action === 'deposit') itemsById.set(item.id, item);
        else itemsById.delete(item.id);
      }
      const response = { ok: true, message, moved: ids, items: [...itemsById.values()].sort(byItemId) };
      // 멱등 기록도 같은 쓰기 묶음에 넣는다 — 이동·저장·요청 기록이 한 트랜잭션에서 함께 확정된다.
      operations.push({ sql: 'INSERT INTO djrpg_warehouse_requests(account_id,request_id,response_json) VALUES (?,?,?)', args: [id, input.requestId, JSON.stringify(response)] });
      const saved = await writeSave(tx, row, save, operations);
      if (saved.clamped?.length) context.clamped = saved.clamped.length;
      return { ...response, ...saved };
    }));
    return res.status(200).json(result);
  } catch (error) { context.code = error?.code ?? error?.name ?? ''; return errorResponse(error); }
  finally { if (createDbClient) await db?.close(); }
}
