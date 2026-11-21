import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { schema, account, transaction, reconcileItems } from '../server/database.mjs';
import accountHandler from '../api/account.mjs';
import warehouseHandler from '../api/warehouse.mjs';
import './ts-loader.mjs';
const { freshSave, parseSave } = await import('../src/game/store.ts');
const { migrateItem, skillBookItem } = await import('../src/game/items.ts');
const { allSkillIds, allPassiveIds } = await import('../src/game/skills.ts');

/**
 * 작업 255 — **패시브 스킬북이 세이브를 읽을 때 사라지던 문제**(사용자 제보 `#8898`).
 *
 * 방치 보상으로 받은 스킬북 2권이 창고에서 여러 개 꺼낸 직후 가방에서 사라졌고, 새로고침해도 없었다.
 * 원인은 `migrateItem`이 스킬북 `skillId`를 **액티브 24종(`allSkillIds`)으로만** 대조한 것이다 —
 * 패시브 책은 `parseSave`에서 `undefined`가 되어 가방에서 빠지고, 그 세이브가 서버로 가면
 * `reconcileItems`가 소유 기록을 `consumed`로 바꿔 되돌릴 수 없게 된다.
 */

test('migrateItem·parseSave는 액티브·패시브 스킬북 33종을 모두 가방에 남긴다', () => {
  for (const skillId of [...allSkillIds, ...allPassiveIds]) {
    const book = skillBookItem(skillId);
    assert.deepEqual(migrateItem(book), book, `${skillId} 스킬북이 읽기에서 살아남아야 한다`);
  }
  assert.equal(migrateItem({ id: 'x', name: '이상한 책', slot: 'skillbook', kind: 'skillbook', skillId: '없는스킬', rarity: 'rare', stats: {} }), undefined, '없는 스킬 id는 예전처럼 버린다');

  const books = [...allSkillIds, ...allPassiveIds].map(skillId => skillBookItem(skillId));
  const save = freshSave('male', 'archer');
  save.bag = [...books, { id: 'belt1', name: '강철 벨트', slot: 'belt', rarity: 'rare', stats: { defense: 8 } }];
  const parsed = parseSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(parsed.bag.map(item => item.id).sort(), save.bag.map(item => item.id).sort(), '33권 모두 남는다');
});

/** 창고·계정 엔드포인트용 임시 DB 하네스 — `tests/warehouse-grid.test.mjs`와 같은 방식. */
async function harness(job, bagItems, storedItems) {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-skillbook-roundtrip-'));
  const url = `file:${join(directory, 'roundtrip.db')}`;
  process.env.TURSO_DATABASE_URL = url; process.env.TURSO_AUTH_TOKEN = 'local-roundtrip-test';
  const db = createClient({ url });
  await schema(db);
  const base = freshSave('male', job);
  base.accountId = 'hero'; base.name = 'hero'; base.tutorial = 3; base.level = 9; base.gold = 1_254_385;
  base.bag = bagItems;
  await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: ['hero', 'test-hash', JSON.stringify(base), new Date().toISOString()] });
  const signed = Buffer.from(JSON.stringify({ id: 'hero', exp: Date.now() + 60_000 })).toString('base64url');
  const token = `${signed}.${createHmac('sha256', process.env.TURSO_AUTH_TOKEN).update(signed).digest('base64url')}`;
  const call = async (handler, body) => {
    const result = {};
    const res = { status(code) { result.status = code; return this; }, json(data) { result.body = data; return this; } };
    await handler({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body }, res);
    return result;
  };
  await transaction(db, async tx => { const row = await account(tx, 'hero'); await reconcileItems(tx, 'hero', row.save, row.save); });
  for (const item of bagItems) {
    await db.execute({ sql: 'INSERT OR REPLACE INTO djrpg_item_owners VALUES (?,?,?,?)', args: [item.id, 'hero', 'inventory', JSON.stringify(item)] });
    await db.execute({ sql: 'INSERT OR REPLACE INTO djrpg_character_item_owners VALUES (?,?,?)', args: [item.id, 'hero', 1] });
  }
  for (const item of storedItems) {
    await db.execute({ sql: 'INSERT OR REPLACE INTO djrpg_item_owners VALUES (?,?,?,?)', args: [item.id, 'hero', 'warehouse', JSON.stringify(item)] });
    await db.execute({ sql: 'INSERT OR REPLACE INTO djrpg_character_item_owners VALUES (?,?,?)', args: [item.id, 'hero', 0] });
    await db.execute({ sql: 'INSERT OR REPLACE INTO djrpg_warehouse(account_id,item_id,item_json) VALUES (?,?,?)', args: ['hero', item.id, JSON.stringify(item)] });
  }
  const loaded = async () => (await call(accountHandler, { action: 'load' })).body;
  const close = async () => { await db.close(); delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN; };
  return { db, call, loaded, close, base };
}

test('방치 보상으로 받은 패시브 스킬북은 창고 다중 꺼내기·다음 저장·새로고침에도 남는다', async () => {
  const gear = slot => ({ id: `${slot}1`, name: `장비 ${slot}`, slot, rarity: 'rare', stats: slot === 'weapon' ? { attack: 20 } : { defense: 8 } });
  // 화면: 벨트·목걸이·반지 + 방치 보상으로 받은 전사(타직업) 패시브 책 2권
  const bag = [gear('belt'), gear('necklace'), gear('ring1'), skillBookItem('mastery'), skillBookItem('instinct')];
  const stored = [gear('weapon'), gear('helmet'), gear('armor'), gear('gloves'), gear('boots')]; // 창고에서 꺼낼 5개
  const h = await harness('archer', bag, stored);
  try {
    const bookIds = bag.slice(3).map(item => item.id);
    const start = await h.loaded();
    // ① 로그인 방치 보상과 같은 저장 (main.ts `void flush()`)
    const first = await h.call(accountHandler, { action: 'save', save: JSON.parse(JSON.stringify(h.base)), revision: start.revision, requestId: randomUUID(), characterSlot: 1 });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.deepEqual(first.body.save.bag.map(item => item.skillId ?? item.slot), ['belt', 'necklace', 'ring1', 'mastery', 'instinct'], '서버 세이브에 책 2권이 들어간다');
    // ② 창고에서 장비 5개 일괄 꺼내기 (사용자가 누른 그 동작)
    const withdrawn = await h.call(warehouseHandler, { action: 'withdraw', itemIds: stored.map(item => item.id), requestId: randomUUID(), revision: first.body.revision, characterSlot: 1 });
    assert.equal(withdrawn.status, 200, JSON.stringify(withdrawn.body));
    const serverBag = withdrawn.body.save.bag.map(item => item.skillId ?? item.slot);
    assert.deepEqual(serverBag.slice(0, 5), ['belt', 'necklace', 'ring1', 'mastery', 'instinct'], '응답 세이브에 기존 책이 그대로 있다');
    const client = parseSave(withdrawn.body.save, 'hero');
    assert.deepEqual(client.bag.filter(item => item.kind === 'skillbook').map(item => item.id).sort(), [...bookIds].sort(), '클라이언트 가방에도 책 2권이 남는다(작업 255 이전에는 여기서 사라졌다)');
    // ③ 사냥으로 세이브가 한 번 더 나간 뒤 새로고침(load) — 소유 기록이 consumed 로 바뀌지 않아야 한다.
    client.gold += 849; client.kills += 7;
    const next = await h.call(accountHandler, { action: 'save', save: JSON.parse(JSON.stringify(client)), revision: withdrawn.body.revision, requestId: randomUUID(), characterSlot: 1 });
    assert.equal(next.status, 200, JSON.stringify(next.body));
    const reloaded = await h.loaded();
    assert.deepEqual(reloaded.save.bag.filter(item => item.kind === 'skillbook').map(item => item.id).sort(), [...bookIds].sort(), '새로고침해도 책이 남는다');
    const owners = await h.db.execute({ sql: 'SELECT location FROM djrpg_item_owners WHERE account_id=? AND item_id IN (?,?)', args: ['hero', ...bookIds] });
    assert.deepEqual(owners.rows.map(row => row.location), ['inventory', 'inventory'], '소유 기록이 consumed 로 바뀌지 않는다');
  } finally { await h.close(); }
});
