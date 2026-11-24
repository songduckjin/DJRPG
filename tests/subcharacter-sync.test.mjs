import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { removeTempDbDirectory } from './helpers/temp-db.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { schema } from '../server/database.mjs';
import accountHandler from '../api/account.mjs';
import warehouseHandler from '../api/warehouse.mjs';
import { initialSave } from '../server/save-seed.mjs';
import { hashPassword } from '../server/auth.mjs';

/**
 * 부캐릭(슬롯 2 이상) 방치 정산·전환·저장 회귀 (2026-11-24 관우·sim 장애).
 *
 * 실제 운영 데이터에서 확인된 두 가지 막힘을 고정한다:
 *  ① `djrpg_character_item_owners` 슬롯 매핑만 빠진 정상 아이템(창고 왕복·구세이브) → 저장이 영구 409.
 *  ② 저장된 2차 스탯(치명·공속)과 화면의 재계산 값이 어긋난 장비 → `409 아이템 정보가 서버 기록과 다릅니다`.
 * 두 경우 모두 **부캐릭에서만** 막히던 것이 사용자 제보의 모양이다.
 */

const weapon = id => ({ id, name: '기존 검', slot: 'weapon', rarity: 'rare', stats: { attack: 10 } });
const belt = crit => ({ id: 'belt-1', name: '황혼의 용가죽 벨트', slot: 'belt', rarity: 'rare', stats: { attack: 4, defense: 28, health: 124, crit, speed: 1 }, plus: 1, sec: 2 });

async function harness({ activeSlot = 2, characters = 2 } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-characters-subchar-'));
  const url = `file:${join(directory, 'subchar.db')}`;
  process.env.TURSO_DATABASE_URL = url;
  process.env.TURSO_AUTH_TOKEN = 'local-subchar-test';
  const db = createClient({ url });
  await schema(db);
  const base = initialSave('gwanu', 'male', '관우', 'warrior');
  base.gold = 0;
  await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: ['gwanu', 'test-hash', JSON.stringify(base), new Date().toISOString()] });
  await db.execute({ sql: 'INSERT INTO djrpg_account_profiles(account_id,shared_gold,active_slot) VALUES (?,?,?)', args: ['gwanu', 0, activeSlot] });
  for (let slot = 1; slot <= characters; slot++) {
    const save = { ...initialSave('gwanu', 'male', slot === 1 ? '관우' : '부캐', 'warrior'), gold: undefined };
    save.bag = [];
    await db.execute({
      sql: 'INSERT INTO djrpg_characters(account_id,slot,save_json,updated_at) VALUES (?,?,?,?)',
      args: ['gwanu', slot, JSON.stringify(save), new Date(Date.now() - 3600_000).toISOString()]
    });
  }
  const signed = Buffer.from(JSON.stringify({ id: 'gwanu', exp: Date.now() + 600_000 })).toString('base64url');
  const token = `${signed}.${createHmac('sha256', process.env.TURSO_AUTH_TOKEN).update(signed).digest('base64url')}`;
  const call = async (handler, body, useToken = token) => {
    const result = {};
    const res = { status(code) { result.status = code; return this; }, json(data) { result.body = data; return this; } };
    await handler({ method: 'POST', headers: { authorization: `Bearer ${useToken}` }, body }, res);
    return result;
  };
  const account = (body, useToken = token) => call(accountHandler, body, useToken);
  const setSave = async (slot, save) => db.execute({ sql: 'UPDATE djrpg_characters SET save_json=? WHERE account_id=? AND slot=?', args: [JSON.stringify({ ...save, gold: undefined }), 'gwanu', slot] });
  const getSave = async slot => JSON.parse((await db.execute({ sql: 'SELECT save_json FROM djrpg_characters WHERE account_id=? AND slot=?', args: ['gwanu', slot] })).rows[0].save_json);
  const own = async item => db.execute({ sql: 'INSERT INTO djrpg_item_owners VALUES (?,?,?,?)', args: [item.id, 'gwanu', 'inventory', JSON.stringify(item)] });
  const mappings = async () => (await db.execute({ sql: 'SELECT item_id,slot FROM djrpg_character_item_owners WHERE account_id=? ORDER BY item_id', args: ['gwanu'] })).rows;
  const close = async () => { await db.close(); delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN; await removeTempDbDirectory(directory); };
  return { db, account, call, setSave, getSave, own, mappings, close, url };
}

test('부캐릭 슬롯 매핑이 빠진 정상 아이템은 저장이 409로 막히지 않고 지금 슬롯으로 복구된다', async () => {
  const env = await harness();
  try {
    const item = weapon('subchar-sword-1');
    const save = await env.getSave(2);
    save.bag = [item];
    await env.setSave(2, save);
    await env.own(item); // 소유 기록은 있는데 슬롯 매핑은 없다(창고 왕복·구세이브)

    const switched = await env.account({ action: 'selectCharacter', slot: 2, revision: 0 });
    assert.equal(switched.status, 200, JSON.stringify(switched.body));
    assert.deepEqual(switched.body.save.bag.map(entry => entry.id), [item.id], '전환 응답에서 아이템을 잃지 않는다');
    assert.deepEqual((await env.mappings()).map(row => [row.item_id, Number(row.slot)]), [[item.id, 2]], '전환할 때 슬롯 매핑을 복구한다');

    const saved = await env.account({ action: 'save', save: { ...switched.body.save, gold: 0 }, revision: switched.body.revision, characterSlot: 2, requestId: randomUUID() });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual((await env.getSave(2)).bag.map(entry => entry.id), [item.id], '저장 뒤에도 아이템이 남는다');
  } finally { await env.close(); }
});

test('load는 매핑만 복구하고 가방을 비우지 않는다(예전에는 부캐릭 아이템을 지웠다)', async () => {
  const env = await harness();
  try {
    const first = weapon('subchar-sword-1'), second = { id: 'subchar-ring-1', name: '부캐 반지', slot: 'ring1', rarity: 'common', stats: { attack: 2 } };
    const save = await env.getSave(2);
    save.bag = [first, second];
    await env.setSave(2, save);
    await env.own(first); await env.own(second);

    const loaded = await env.account({ action: 'load' });
    assert.equal(loaded.status, 200);
    assert.deepEqual(loaded.body.save.bag.map(entry => entry.id).sort(), [first.id, second.id].sort(), '응답 가방이 그대로다');
    assert.deepEqual((await env.getSave(2)).bag.map(entry => entry.id).sort(), [first.id, second.id].sort(), '서버 세이브도 지우지 않는다');
    assert.equal((await env.mappings()).length, 2, '두 아이템의 슬롯 매핑을 복구한다');
  } finally { await env.close(); }
});

test('비밀번호 로그인도 부캐릭 소유 기록을 복구한 세이브를 내려준다', async () => {
  const env = await harness({ activeSlot: 2 });
  try {
    const item = weapon('subchar-sword-1');
    const save = await env.getSave(2);
    save.bag = [item];
    await env.setSave(2, save);
    await env.own(item);
    await env.db.execute({ sql: 'UPDATE djrpg_accounts SET password_hash=? WHERE id=?', args: [await hashPassword('password123'), 'gwanu'] });

    const login = await env.account({ action: 'login', loginId: 'gwanu', password: 'password123' });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.deepEqual(login.body.save.bag.map(entry => entry.id), [item.id]);
    assert(login.body.offlineSeconds >= 60, '전환·로그인 직후 정산할 초를 함께 준다');
    // 로그인은 새 세션을 발급한다 — 이후 요청은 그 토큰을 쓴다.
    const saved = await env.account({ action: 'save', save: { ...login.body.save, gold: 0 }, revision: login.body.revision, characterSlot: 2, requestId: randomUUID() }, login.body.token);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
  } finally { await env.close(); }
});

test('다른 캐릭터가 가진 아이템은 부캐릭 저장에서 계속 거절한다', async () => {
  const env = await harness();
  try {
    const item = weapon('slot-one-sword');
    const slotTwo = await env.getSave(2);
    slotTwo.bag = [item];
    await env.setSave(2, slotTwo);
    await env.own(item);
    // 1번 캐릭터가 들고 있다고 서버가 알고 있는 상태
    await env.db.execute({ sql: 'INSERT INTO djrpg_character_item_owners(item_id,account_id,slot) VALUES (?,?,1)', args: [item.id, 'gwanu'] });

    const loaded = await env.account({ action: 'load' });
    // 그 아이템을 슬롯 2 세이브에 그대로 실어 보내면 서버가 거절한다(복구가 아니라 중복 소유이므로).
    const crossed = await env.account({ action: 'save', save: { ...loaded.body.save, bag: [item] }, revision: loaded.body.revision, characterSlot: 2, requestId: randomUUID() });
    assert.equal(crossed.status, 409, JSON.stringify(crossed.body));
    assert.equal(crossed.body.code, 'ITEM_CONFLICT');
    assert.deepEqual((await env.mappings()).filter(row => row.item_id === item.id).map(row => Number(row.slot)), [1], '남의 슬롯 매핑을 빼앗지 않는다');
    // `load`의 정리(repairedSave)는 중복 사본을 지우고 남의 슬롯 매핑은 그대로 둔다.
    assert.deepEqual(loaded.body.save.bag.map(entry => entry.id), [], '중복 사본은 내려보내지 않는다');
  } finally { await env.close(); }
});

test('창고에서 꺼낸 아이템도 부캐릭 저장을 막지 않는다', async () => {
  const env = await harness({ activeSlot: 2 });
  try {
    const item = { id: 'warehouse-sword-1', name: '창고 검', slot: 'weapon', rarity: 'rare', stats: { attack: 10 } };
    // 창고에 있고 소유 기록만 있는 아이템(슬롯 매핑 없음) — 예전에는 꺼낸 뒤 다음 저장이 409였다.
    await env.db.execute({ sql: 'INSERT INTO djrpg_warehouse(account_id,item_id,item_json) VALUES (?,?,?)', args: ['gwanu', item.id, JSON.stringify(item)] });
    await env.db.execute({ sql: 'INSERT INTO djrpg_item_owners VALUES (?,?,?,?)', args: [item.id, 'gwanu', 'warehouse', JSON.stringify(item)] });

    const loaded = await env.account({ action: 'load' });
    const withdrawn = await env.call(warehouseHandler, { action: 'withdraw', itemId: item.id, requestId: randomUUID(), revision: loaded.body.revision, characterSlot: 2 });
    assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.body));
    assert.deepEqual((await env.mappings()).map(row => [row.item_id, Number(row.slot)]), [[item.id, 2]], '꺼낼 때 슬롯 매핑을 만든다');

    const saved = await env.account({ action: 'save', save: { ...withdrawn.body.save, gold: 0 }, revision: withdrawn.body.revision, characterSlot: 2, requestId: randomUUID() });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
  } finally { await env.close(); }
});

test('저장된 2차 스탯과 화면 값이 어긋난 장비는 내려가는 방향만 받아 준다', async () => {
  const env = await harness();
  try {
    const stored = belt(2);
    await sshSave(env, stored);
    const loaded = await env.account({ action: 'load' });
    assert.equal(loaded.status, 200);
    // ① 화면이 다시 계산하며 깎인 값(강화·쯔바이핸드 보너스 누락) — 저장을 통과시키고 서버 사본을 새 값으로.
    const lowered = { ...loaded.body.save, bag: [{ ...belt(1) }] };
    const accepted = await env.account({ action: 'save', save: lowered, revision: loaded.body.revision, characterSlot: 2, requestId: randomUUID() });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    const owner = (await env.db.execute({ sql: 'SELECT item_json FROM djrpg_item_owners WHERE item_id=?', args: [stored.id] })).rows[0];
    assert.equal(JSON.parse(owner.item_json).stats.crit, 1, '서버 사본이 확정된 값으로 바뀐다');

    // ② 올리는 값은 드롭 공식만 만들 수 있다 — 변조로 보고 막는다.
    const raised = { ...loaded.body.save, bag: [{ ...belt(7) }] };
    const rejected = await env.account({ action: 'save', save: raised, revision: accepted.body.revision, characterSlot: 2, requestId: randomUUID() });
    assert.equal(rejected.status, 409, JSON.stringify(rejected.body));
    assert.equal(rejected.body.code, 'ITEM_CONFLICT');
  } finally { await env.close(); }
});

/** 부캐릭(슬롯 2)에 장비 하나를 들려 두고, 그 장비를 서버 소유 기록에도 넣는다. */
async function sshSave(env, item) {
  const save = await env.getSave(2);
  save.bag = [{ ...item }];
  await env.setSave(2, save);
  await env.own(item);
  await env.db.execute({ sql: 'UPDATE djrpg_account_profiles SET active_slot=2 WHERE account_id=?', args: ['gwanu'] });
  return save;
}
