import { client, schema, transaction, account, assertRevision, writeSave, fail } from '../database.mjs';
import { tokenId } from '../auth.mjs';
import { runtimeEnv } from '../env.mjs';
import { json, readBody, errorResponse } from '../http.mjs';

export async function warehouseEndpoint(request, { env = runtimeEnv(), createDbClient } = {}) {
  const res = { status: status => ({ json: body => json(body, status) }) };
  const req = { method: request.method, body: await readBody(request) };
  if (req.method !== 'POST') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', error: 'POST 요청만 허용합니다.' });
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return res.status(503).json({ code: 'DB_NOT_CONFIGURED', error: '서버 DB가 설정되지 않았습니다.' });
  const id = tokenId(request, env);
  if (!id) return res.status(401).json({ code: 'INVALID_TOKEN', error: '인증이 만료되었습니다. 다시 로그인하세요.' });
  let db;
  try {
    db = createDbClient ? createDbClient(env) : client(env); await schema(db, env);
    const input = req.body ?? {};
    if (input.action === 'list') {
      const rows = (await db.execute({ sql: 'SELECT item_json FROM djrpg_warehouse WHERE account_id=? ORDER BY item_id', args: [id] })).rows;
      return res.status(200).json({ items: rows.map(row => JSON.parse(row.item_json)) });
    }
    if (!['deposit', 'withdraw'].includes(input.action)) fail(400, 'INVALID_ACTION', '지원하지 않는 창고 요청입니다.');
    if (typeof input.requestId !== 'string' || !/^[\w-]{16,80}$/.test(input.requestId) || typeof input.itemId !== 'string') fail(400, 'INVALID_REQUEST', '창고 요청 번호 또는 아이템 정보가 올바르지 않습니다.');
    const result = await transaction(db, async tx => {
      const row = await account(tx, id);
      if (Number(input.characterSlot ?? 1) !== row.slot) fail(409, 'CHARACTER_CONFLICT', '다른 캐릭터가 선택되었습니다. 새로고침해 주세요.');
      const replay = (await tx.execute({ sql: 'SELECT response_json FROM djrpg_warehouse_requests WHERE account_id=? AND request_id=?', args: [id, input.requestId] })).rows[0];
      if (replay) return { ...JSON.parse(replay.response_json), save: row.save, revision: row.revision };
      assertRevision(row, input.revision);
      const save = structuredClone(row.save), operations = [];
      if (input.action === 'deposit') {
        const index = save.bag.findIndex(item => item.id === input.itemId);
        if (index < 0) fail(409, 'ITEM_NOT_AVAILABLE', '가방에 있는 아이템만 창고에 넣을 수 있습니다.');
        const item = save.bag[index];
        const owner = (await tx.execute({ sql: 'SELECT o.location,m.slot FROM djrpg_item_owners o LEFT JOIN djrpg_character_item_owners m ON m.item_id=o.item_id WHERE o.item_id=? AND o.account_id=?', args: [item.id, id] })).rows[0];
        if (!owner || owner.location !== 'inventory' || Number(owner.slot) !== row.slot) fail(409, 'ITEM_CONFLICT', '아이템 소유 상태가 달라졌습니다. 다시 불러오세요.');
        const count = (await tx.execute({ sql: 'SELECT COUNT(*) AS n FROM djrpg_warehouse WHERE account_id=?', args: [id] })).rows[0];
        if (Number(count.n) >= 40) fail(409, 'WAREHOUSE_FULL', '공용창고가 가득 찼습니다.');
        save.bag.splice(index, 1);
        operations.push({ sql: 'INSERT INTO djrpg_warehouse(account_id,item_id,item_json) VALUES (?,?,?)', args: [id, item.id, JSON.stringify(item)] });
        operations.push({ sql: "UPDATE djrpg_item_owners SET location='warehouse' WHERE item_id=? AND account_id=?", args: [item.id, id] });
        operations.push({ sql: 'UPDATE djrpg_character_item_owners SET slot=0 WHERE item_id=? AND account_id=?', args: [item.id, id] });
      } else {
        const stored = (await tx.execute({ sql: `SELECT w.item_json,o.location,m.slot FROM djrpg_warehouse w
          JOIN djrpg_item_owners o ON o.item_id=w.item_id AND o.account_id=w.account_id
          JOIN djrpg_character_item_owners m ON m.item_id=w.item_id AND m.account_id=w.account_id
          WHERE w.account_id=? AND w.item_id=?`, args: [id, input.itemId] })).rows[0];
        if (!stored || stored.location !== 'warehouse' || Number(stored.slot) !== 0) fail(409, 'ITEM_NOT_AVAILABLE', '창고 아이템 상태가 달라졌습니다. 다시 불러오세요.');
        const item = JSON.parse(stored.item_json);
        if (item.slot !== 'skillbook' && save.bag.filter(entry => entry.slot !== 'skillbook').length >= 40) fail(409, 'BAG_FULL', '가방이 가득 찼습니다.');
        save.bag.push(item);
        operations.push({ sql: 'DELETE FROM djrpg_warehouse WHERE account_id=? AND item_id=?', args: [id, item.id] });
        operations.push({ sql: "UPDATE djrpg_item_owners SET location='inventory' WHERE item_id=? AND account_id=?", args: [item.id, id] });
        operations.push({ sql: 'UPDATE djrpg_character_item_owners SET slot=? WHERE item_id=? AND account_id=?', args: [row.slot, item.id, id] });
      }
      const saved = await writeSave(tx, row, save, operations);
      const response = { ok: true, message: input.action === 'deposit' ? '공용창고에 보관했습니다.' : '가방으로 가져왔습니다.' };
      await tx.execute({ sql: 'INSERT INTO djrpg_warehouse_requests(account_id,request_id,response_json) VALUES (?,?,?)', args: [id, input.requestId, JSON.stringify(response)] });
      return { ...response, ...saved };
    });
    return res.status(200).json(result);
  } catch (error) { return errorResponse(error); }
  finally { db?.close(); }
}
