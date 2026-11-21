import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { schema, account, transaction, reconcileItems } from '../server/database.mjs';
import accountHandler from '../api/account.mjs';
import warehouseHandler from '../api/warehouse.mjs';
import './ts-loader.mjs';
const { freshSave } = await import('../src/game/store.ts');
const { renderWarehouse, warehouseState, resetWarehouse, loadWarehouse } = await import('../src/ui/modals/warehouseModal.ts');

const sword = (id, plus = 0, rarity = 'rare') => ({ id, name: `강철 쯔바이핸드${id}`, slot: 'weapon', rarity, stats: { attack: 20 + plus }, plus });
const helmet = id => ({ id, name: `강철 투구${id}`, slot: 'helmet', rarity: 'magic', stats: { defense: 8 } });
const book = (id, skillId = 'spin') => ({ id, name: '[스킬북] 회오리 베기', slot: 'skillbook', kind: 'skillbook', skillId, rarity: 'rare', stats: {} });
const pouch = id => ({ id, name: '무작위 보물 주머니', slot: 'pouch', kind: 'pouch', rarity: 'unique', stats: {} });
const save0 = items => ({ version: 1, accountId: 'hero', name: '전사', gender: 'male', auto: true, autoClimb: true, level: 9, exp: 25, gold: 500, floor: 4, maxFloor: 4, floorKills: 3, kills: 50, health: 80, equipment: {}, equipmentCollection: [], bag: items, tutorial: 3, stones: 0, skillPoints: 7, lastActiveAt: Date.now(), learned: [], passives: [], quickSlots: [null, null, null], skillLevels: {} });

/** 창고·계정 테스트용 임시 DB + 로그인 토큰 + API 호출기. */
async function harness(items) {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-warehouse-grid-'));
  const url = `file:${join(directory, 'warehouse.db')}`;
  process.env.TURSO_DATABASE_URL = url; process.env.TURSO_AUTH_TOKEN = 'local-warehouse-test';
  const db = createClient({ url });
  await schema(db);
  await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: ['hero', 'test-hash', JSON.stringify(save0(items)), new Date().toISOString()] });
  const signed = Buffer.from(JSON.stringify({ id: 'hero', exp: Date.now() + 60_000 })).toString('base64url');
  const token = `${signed}.${createHmac('sha256', process.env.TURSO_AUTH_TOKEN).update(signed).digest('base64url')}`;
  const call = async (handler, body) => {
    const result = {};
    const res = { status(code) { result.status = code; return this; }, json(data) { result.body = data; return this; } };
    await handler({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body }, res);
    return result;
  };
  // 캐릭터 행을 먼저 만들어 둔다(창 warehouse는 `writeSave`가 캐릭터 행을 쓴다).
  await transaction(db, async tx => { const row = await account(tx, 'hero'); await reconcileItems(tx, 'hero', row.save, row.save); });
  const owned = async (item, location = 'inventory', slot = 1, accountId = 'hero') => {
    await db.execute({ sql: 'INSERT OR REPLACE INTO djrpg_item_owners VALUES (?,?,?,?)', args: [item.id, accountId, location, JSON.stringify(item)] });
    await db.execute({ sql: 'INSERT OR REPLACE INTO djrpg_character_item_owners VALUES (?,?,?)', args: [item.id, accountId, slot] });
  };
  const saveNow = async () => call(accountHandler, { action: 'save', save: (await call(accountHandler, { action: 'load' })).body.save, revision: (await call(accountHandler, { action: 'load' })).body.revision, requestId: randomUUID(), characterSlot: 1 });
  const loaded = async () => (await call(accountHandler, { action: 'load' })).body;
  const close = async () => { await db.close(); delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN; };
  return { db, call, owned, loaded, saveNow, close, directory };
}

test('한 요청으로 여러 개를 보관·꺼내고, 같은 requestId는 한 번만 처리한다(작업 225)', async () => {
  const blade = sword('w1', 3), head = helmet('h1'), book1 = book('b1'), book2 = book('b2');
  const h = await harness([blade, head, book1, book2]);
  try {
    const { call, owned, loaded } = h;
    await owned(blade); await owned(head); await owned(book1); await owned(book2);
    const start = await loaded();
    const requestId = randomUUID();
    const deposited = await call(warehouseHandler, { action: 'deposit', itemIds: [blade.id, head.id, book1.id], requestId, revision: start.revision, characterSlot: 1 });
    assert.equal(deposited.status, 200);
    assert.deepEqual(deposited.body.moved, [blade.id, head.id, book1.id]);
    assert.equal(deposited.body.items.length, 3, '응답에 창고 목록이 함께 온다(다시 list를 부르지 않는다)');
    assert.equal(deposited.body.save.bag.length, 1, '가방에는 남은 책 한 권만');
    assert.equal(deposited.body.revision, start.revision + 1, '세 번 옮겨도 저장은 한 번');
    // 같은 requestId 재생 — 응답만 돌려주고 같은 revision, 창고도 3개 그대로.
    const replay = await call(warehouseHandler, { action: 'deposit', itemIds: [blade.id, head.id, book1.id], requestId, revision: start.revision, characterSlot: 1 });
    assert.equal(replay.status, 200); assert.equal(replay.body.revision, deposited.body.revision);
    const listed = await call(warehouseHandler, { action: 'list' });
    assert.equal(listed.body.items.length, 3);
    // 일괄 꺼내기 — 두 개를 한 요청으로.
    const withdrawn = await call(warehouseHandler, { action: 'withdraw', itemIds: [blade.id, head.id], requestId: randomUUID(), revision: deposited.body.revision, characterSlot: 1 });
    assert.equal(withdrawn.status, 200);
    assert.equal(withdrawn.body.items.length, 1);
    assert.deepEqual(withdrawn.body.save.bag.map(item => item.id).sort(), [blade.id, book2.id, head.id].sort());
    // 단건 `itemId` 요청은 예전 그대로다(응답 문구 유지).
    const single = await call(warehouseHandler, { action: 'withdraw', itemId: book1.id, requestId: randomUUID(), revision: withdrawn.body.revision, characterSlot: 1 });
    assert.equal(single.status, 200); assert.equal(single.body.message, '가방으로 가져왔습니다.');
  } finally { await h.close(); }
});

test('일괄 요청은 전부 아니면 전무 — 소유권·40칸·가방이 어긋나면 아무것도 옮기지 않는다(작업 225)', async () => {
  const blade = sword('w1'), head = helmet('h1');
  const h = await harness([blade, head]);
  try {
    const { call, owned, db } = h;
    await owned(blade); await owned(head);
    // 다른 계정 소유로 기록된 아이템을 이 캐릭터 가방에 끼워 넣는다(소유권 무결성 방어 확인용).
    // `load`는 이 유령 아이템을 걷어 내므로, 이후로는 revision·세이브를 DB에서 바로 읽는다.
    const rival = sword('rival');
    await db.execute({ sql: 'INSERT OR REPLACE INTO djrpg_item_owners VALUES (?,?,?,?)', args: [rival.id, 'rival', 'inventory', JSON.stringify(rival)] });
    const row = (await db.execute({ sql: 'SELECT save_json FROM djrpg_characters WHERE account_id=? AND slot=1', args: ['hero'] })).rows[0];
    const stored = JSON.parse(row.save_json); stored.bag.push(rival);
    await db.execute({ sql: 'UPDATE djrpg_characters SET save_json=? WHERE account_id=? AND slot=1', args: [JSON.stringify(stored), 'hero'] });
    const revision = async () => Number(((await db.execute({ sql: 'SELECT revision FROM djrpg_save_versions WHERE account_id=?', args: ['hero'] })).rows[0] ?? { revision: 0 }).revision ?? 0);
    const bagLength = async () => JSON.parse((await db.execute({ sql: 'SELECT save_json FROM djrpg_characters WHERE account_id=? AND slot=1', args: ['hero'] })).rows[0].save_json).bag.length;
    assert.equal(await bagLength(), 3);
    // 소유권이 어긋난 아이템이 섞이면 통째로 실패(보관된 것 없음).
    const conflict = await call(warehouseHandler, { action: 'deposit', itemIds: [blade.id, rival.id], requestId: randomUUID(), revision: await revision(), characterSlot: 1 });
    assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'ITEM_CONFLICT');
    assert.equal((await call(warehouseHandler, { action: 'list' })).body.items.length, 0, '하나도 보관되지 않았다');
    assert.equal(await bagLength(), 3, '가방도 그대로');
    // 가방에 없는 id는 단건 문구가 아니라 일괄 문구로 알린다.
    const missing = await call(warehouseHandler, { action: 'deposit', itemIds: [blade.id, 'no-such-item'], requestId: randomUUID(), revision: await revision(), characterSlot: 1 });
    assert.equal(missing.status, 409); assert.equal(missing.body.code, 'ITEM_NOT_AVAILABLE');
    assert.match(missing.body.error, /아무것도 보관하지 않았습니다/);
    // 창고 40칸이 차면 1개도 더 들어가지 않는다(가득 참은 통째로 거절).
    for (let index = 0; index < 40; index++) {
      const filler = sword(`full-${index}`);
      await db.execute({ sql: 'INSERT INTO djrpg_warehouse(account_id,item_id,item_json) VALUES (?,?,?)', args: ['hero', filler.id, JSON.stringify(filler)] });
      await db.execute({ sql: 'INSERT OR REPLACE INTO djrpg_item_owners VALUES (?,?,?,?)', args: [filler.id, 'hero', 'warehouse', JSON.stringify(filler)] });
      await db.execute({ sql: 'INSERT OR REPLACE INTO djrpg_character_item_owners VALUES (?,?,?)', args: [filler.id, 'hero', 0] });
    }
    const full = await call(warehouseHandler, { action: 'deposit', itemIds: [blade.id, head.id], requestId: randomUUID(), revision: await revision(), characterSlot: 1 });
    assert.equal(full.status, 409); assert.equal(full.body.code, 'WAREHOUSE_FULL');
    assert.equal(await bagLength(), 3, '가득 찼으면 가방도 그대로');
    // 가방 40칸이 찬 상태에서 꺼내기도 통째로 거절된다.
    const tight = Array.from({ length: 40 }, (_, index) => sword(`tight-${index}`));
    await db.execute({ sql: 'UPDATE djrpg_characters SET save_json=? WHERE account_id=? AND slot=1', args: [JSON.stringify({ ...save0(tight) }), 'hero'] });
    const bagFull = await call(warehouseHandler, { action: 'withdraw', itemIds: ['full-0'], requestId: randomUUID(), revision: await revision(), characterSlot: 1 });
    assert.equal(bagFull.status, 409); assert.equal(bagFull.body.code, 'BAG_FULL');
    assert.equal((await call(warehouseHandler, { action: 'list' })).body.items.length, 40, '창고도 그대로');
  } finally { await h.close(); }
});

test('일괄 요청 형식이 틀리면 400으로 막는다(작업 225)', async () => {
  const h = await harness([sword('w1')]);
  try {
    const { call, loaded } = h; const state = await loaded();
    const empty = await call(warehouseHandler, { action: 'deposit', itemIds: [], requestId: randomUUID(), revision: state.revision, characterSlot: 1 });
    assert.equal(empty.status, 400); assert.equal(empty.body.code, 'INVALID_REQUEST');
    const tooMany = await call(warehouseHandler, { action: 'deposit', itemIds: Array.from({ length: 41 }, (_, index) => `id-${index}`), requestId: randomUUID(), revision: state.revision, characterSlot: 1 });
    assert.equal(tooMany.status, 400);
    const noRequest = await call(warehouseHandler, { action: 'deposit', itemIds: ['a'], revision: state.revision, characterSlot: 1 });
    assert.equal(noRequest.status, 400);
    const otherCharacter = await call(warehouseHandler, { action: 'deposit', itemIds: ['a'], requestId: randomUUID(), revision: state.revision, characterSlot: 2 });
    assert.equal(otherCharacter.status, 409); assert.equal(otherCharacter.body.code, 'CHARACTER_CONFLICT');
  } finally { await h.close(); }
});

// ── 화면 ────────────────────────────────────────────────────────────────────
function element(tag = 'div') {
  const node = {
    tag, children: [], dataset: {}, className: '', textContent: '', innerHTML: '', attrs: {}, hidden: false, disabled: false, title: '', type: '',
    append(...kids) { for (const kid of kids) { if (kid && typeof kid === 'object') { kid.parent = this; this.children.push(kid); } } },
    appendChild(kid) { this.append(kid); return kid; },
    replaceChildren(...kids) { for (const kid of this.children) kid.parent = undefined; this.children = []; this.append(...kids); },
    setAttribute(key, value) { this.attrs[key] = String(value); },
    getAttribute(key) { return this.attrs[key]; },
    remove() { const parent = this.parent; if (!parent) return; const index = parent.children.indexOf(this); if (index >= 0) parent.children.splice(index, 1); this.parent = undefined; },
    addEventListener() {}, querySelector() { return undefined; }, querySelectorAll() { return []; }
  };
  node.classList = {
    contains(name) { return node.className.split(/\s+/).includes(name); },
    add(name) { if (!this.contains(name)) node.className = `${node.className} ${name}`.trim(); },
    remove(name) { node.className = node.className.split(/\s+/).filter(entry => entry && entry !== name).join(' '); },
    toggle(name, on) { const want = on === undefined ? !this.contains(name) : !!on; if (want) this.add(name); else this.remove(name); }
  };
  return node;
}
function all(node, test, out = []) { if (!node || typeof node !== 'object') return out; if (test(node)) out.push(node); for (const child of node.children ?? []) all(child, test, out); return out; }
function text(node) { if (!node || typeof node !== 'object') return String(node ?? ''); return (node.textContent ?? '') + (node.innerHTML ?? '') + (node.children ?? []).map(text).join(''); }
const cellsIn = grid => all(grid, node => node.classList.contains('warehouse-slot'));

function uiFixture(save, items) {
  const calls = [];
  const ui = {
    world: { save }, warehouseItems: items, openModal: 'warehouse', session: { token: 'token' },
    message(text) { ui.messages.push(text); }, messages: [],
    renderStatus() {}, renderBagBadge() {}, renderModal() { ui.renders++; }, renders: 0,
    iconPath() { return '/assets/icons/weapon.png'; },
    market: { sync: { transferWarehouse: async (action, ids) => { calls.push({ action, ids }); return { ok: true, message: '옮겼습니다.', items: ui.warehouseItems, save }; } } }
  };
  return { ui, calls };
}

test('공용창고는 아이콘 슬롯 그리드로 그려지고, 모드 전환 없이 바로 다중 선택해 한 요청으로 옮긴다(작업 246)', async () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const blade = sword('w1', 5), head = helmet('h1');
    const save = freshSave(); save.job = 'warrior'; save.gold = 1234;
    save.bag = [blade, head, book('b1'), book('b2'), pouch('p1'), pouch('p2')];
    const stored = [{ id: 's1', name: '창고 검', slot: 'weapon', rarity: 'epic', stats: { attack: 30 } }];
    const { ui, calls } = uiFixture(save, stored.slice());
    const dialog = element();
    renderWarehouse(ui, dialog);

    const grids = all(dialog, node => node.classList.contains('warehouse-grid'));
    assert.equal(grids.length, 2, '공용창고·내 가방 두 그리드');
    const [storageGrid, bagGrid] = grids;
    assert.equal(cellsIn(storageGrid).length, 1);
    // 가방: 장비 2 + 스킬북 한 칸(×2) + 주머니 한 칸(×2) = 4칸
    assert.equal(cellsIn(bagGrid).length, 4);
    assert.equal(cellsIn(bagGrid).filter(cell => all(cell, node => node.className === 'skillbook-count').some(node => node.textContent === '×2')).length, 2, '같은 책·같은 주머니는 ×2로 모은다');
    assert(all(dialog, node => node.className.includes('item-plus-badge')).length >= 1, '+N 배지');
    assert(text(dialog).includes('계정 공용 금화 1,234'));
    assert(text(dialog).includes('공용창고 1/40'));
    assert(text(dialog).includes('가방 4/40'), '가방은 장비 2·보물 주머니 2를 세고, 내 직업 스킬북 2권은 세지 않는다(작업 253)');
    assert(!text(dialog).includes('불러오는 중'), '목록이 있으면 로딩 문구가 없다');
    // `선택 끔/켬`·`빠른 이동` 모드 버튼은 없어졌다(작업 246).
    assert.equal(all(dialog, node => node.classList.contains('warehouse-quick')).length, 0, '빠른 이동 없음');
    assert.equal(all(dialog, node => node.classList.contains('warehouse-select')).length, 0, '선택 모드 버튼 없음');
    assert.equal(all(dialog, node => node.classList.contains('warehouse-mode')).length, 0, '모드 버튼 없음');

    const batch = all(dialog, node => node.classList.contains('warehouse-deposit-picked'))[0];
    const withdraw = all(dialog, node => node.classList.contains('warehouse-withdraw-picked'))[0];
    const detail = all(dialog, node => node.classList.contains('warehouse-detail'))[0];
    assert.equal(batch.hidden, true, '아무것도 안 고르면 숨김');
    assert.equal(withdraw.hidden, true);

    // 탭 = 바로 선택. 모드 버튼이 없고, 고른 칸에 맞는 액션 버튼만 보인다.
    // 첫 칸은 **보물 주머니 묶음**(작업 247 순서) — 한 칸을 고르면 그 묶음의 2개가 함께 선택된다.
    const bagCells = cellsIn(bagGrid);
    const cellOf = id => bagCells.find(cell => cell.dataset.itemId === id);
    assert.equal(bagCells[0].dataset.itemId, 'p1', '보물 주머니가 첫 칸');
    bagCells[0].onclick();
    assert.equal(warehouseState(ui).picked.size, 1, '주머니는 한 칸(묶음)으로 고른다');
    assert.equal(batch.textContent, '선택 보관 (2)', '고른 칸의 물건 수는 2개');
    assert.equal(batch.hidden, false);
    assert.equal(batch.textContent, '선택 보관 (2)');
    assert.equal(withdraw.hidden, true, '가방을 고르면 꺼내기는 숨김');
    assert.equal(detail.hidden, false, '고른 칸은 상세 바에도 띄운다');
    assert.equal(calls.length, 0, '탭만으로는 옮기지 않는다');

    cellOf('w1').onclick();
    assert.equal(batch.textContent, '선택 보관 (3)');
    cellOf('w1').onclick();
    assert.equal(batch.textContent, '선택 보관 (2)', '다시 탭하면 선택이 풀린다');
    cellOf('h1').onclick();
    assert.equal(warehouseState(ui).picked.size, 2);

    // 선택은 한 쪽만 — 창고 칸을 고르면 가방 선택은 지워지고 꺼내기 버튼으로 바뀐다.
    cellsIn(storageGrid)[0].onclick();
    assert.equal(batch.hidden, true);
    assert.equal(withdraw.hidden, false);
    assert.equal(withdraw.textContent, '선택 꺼내기 (1)');
    assert.equal(warehouseState(ui).picked.size, 1);
    withdraw.onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls.at(-1), { action: 'withdraw', ids: ['s1'] });
    assert.equal(warehouseState(ui).picked.size, 0, '옮긴 뒤 선택은 비운다');

    // 가방 쪽 장비 칸 두 개를 다시 골라 한 요청으로 보관한다.
    cellOf('w1').onclick(); cellOf('h1').onclick();
    const before = calls.length;
    batch.onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, before + 1);
    assert.deepEqual(calls.at(-1).action, 'deposit');
    assert.equal(calls.at(-1).ids.length, 2);
  } finally { globalThis.document = previous; }
});

test('슬롯을 탭하면 상세 바가 뜨고 [보관하기]/[꺼내기]로 옮긴다(작업 225)', async () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const blade = sword('w1', 2);
    const save = freshSave(); save.job = 'warrior'; save.bag = [blade];
    const stored = [{ id: 's1', name: '창고 검', slot: 'weapon', rarity: 'epic', stats: { attack: 30 } }];
    const { ui, calls } = uiFixture(save, stored.slice());
    const dialog = element();
    renderWarehouse(ui, dialog);
    const detail = all(dialog, node => node.classList.contains('warehouse-detail'))[0];
    assert.equal(detail.hidden, true);
    cellsIn(all(dialog, node => node.classList.contains('warehouse-grid'))[1])[0].onclick();
    assert.equal(detail.hidden, false);
    const shown = text(detail);
    assert(shown.includes('강철 쯔바이핸드w1') && shown.includes('+2'), '이름과 강화 단계');
    assert(shown.includes('레어') && shown.includes('두손검'), '등급·부위');
    assert(shown.includes('공격 +22') || shown.includes('공격 +2'), '스탯');
    const move = all(detail, node => node.classList.contains('warehouse-move'))[0];
    assert.equal(move.textContent, '보관하기');
    move.onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls[0], { action: 'deposit', ids: [blade.id] });
    // 창고 칸은 [꺼내기]
    const storageView = element();
    renderWarehouse(ui, storageView);
    cellsIn(all(storageView, node => node.classList.contains('warehouse-grid'))[0])[0].onclick();
    const storageMove = all(storageView, node => node.classList.contains('warehouse-move'))[0];
    assert.equal(storageMove.textContent, '꺼내기');
    storageMove.onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls.at(-1), { action: 'withdraw', ids: ['s1'] });
  } finally { globalThis.document = previous; }
});

test('창고를 다시 열면 선택·상세는 비고, 이동 응답의 창고 목록으로 그리드가 갱신된다(작업 225·246)', async () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = freshSave(); save.bag = [sword('w1'), sword('w2')];
    const { ui } = uiFixture(save, []);
    const dialog = element();
    renderWarehouse(ui, dialog);
    cellsIn(all(dialog, node => node.classList.contains('warehouse-grid'))[1])[0].onclick();
    assert.equal(warehouseState(ui).picked.size, 1);
    resetWarehouse(ui);
    assert.equal(warehouseState(ui).picked.size, 0);
    assert.equal(warehouseState(ui).focus, undefined, '다시 열면 상세도 비운다');

    // 이동 응답에 실린 창고 목록으로 다시 그린다 — 로딩 문구로 돌아가지 않는다.
    ui.market.sync.transferWarehouse = async () => ({ ok: true, message: '보관했습니다.', items: [{ id: 'new', name: '새 검', slot: 'weapon', rarity: 'common', stats: {} }] });
    const view = element();
    renderWarehouse(ui, view);
    cellsIn(all(view, node => node.classList.contains('warehouse-grid'))[1])[0].onclick();
    all(view, node => node.classList.contains('warehouse-move'))[0].onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ui.warehouseItems.length, 1);
    assert(!text(view).includes('불러오는 중') && !text(view).includes('공용창고를 불러오는 중'), '깜빡임 없음');
  } finally { globalThis.document = previous; }
});

test('창고 목록을 못 읽으면 안내와 다시 불러오기 버튼을 둔다(작업 225)', async () => {
  const previous = globalThis.document;
  const fetchBefore = globalThis.fetch;
  globalThis.document = { createElement: tag => element(tag) };
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: '일시적인 오류입니다.' }) });
  try {
    const save = freshSave(); save.bag = [];
    const { ui } = uiFixture(save, undefined);
    await loadWarehouse(ui);
    const dialog = element();
    renderWarehouse(ui, dialog);
    assert(text(dialog).includes('일시적인 오류입니다.'));
    const retry = all(dialog, node => node.classList.contains('warehouse-retry'))[0];
    assert.equal(retry.textContent, '다시 불러오기');
    assert.equal(ui.messages.at(-1), '일시적인 오류입니다.');
  } finally { globalThis.document = previous; globalThis.fetch = fetchBefore; }
});

test('공용창고·가방 목록은 부위별로 모으고 같은 부위 안에서 전투력 높은 순이다(작업 245)', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = freshSave(); save.job = 'warrior';
    // 서버가 준 순서는 뒤죽박죽(스킬북·주머니가 먼저)이지만 화면은 부위 → 전투력 순이어야 한다.
    save.bag = [book('b1'), pouch('p1'), sword('weak', 0, 'rare'), helmet('h1'), sword('strong', 7, 'unique'), helmet('h2')];
    const stored = [pouch('s-p'), helmet('s-h'), sword('s-weak', 0, 'common'), sword('s-strong', 5, 'legendary')];
    const { ui } = uiFixture(save, stored.slice());
    const dialog = element();
    renderWarehouse(ui, dialog);
    const [storageGrid, bagGrid] = all(dialog, node => node.classList.contains('warehouse-grid'));
    const order = grid => cellsIn(grid).map(cell => cell.dataset.itemId);
    // 보물 주머니(첫 칸, 작업 247) → 무기 → 투구 → 스킬북, 같은 부위는 전투력(공격/방어) 높은 순.
    assert.deepEqual(order(bagGrid), ['p1', 'strong', 'weak', 'h1', 'h2', 'b1']);
    assert.deepEqual(order(storageGrid), ['s-p', 's-strong', 's-weak', 's-h']);
    // 나가는 목록도 같은 칸 순서를 그대로 쓴다(포커스 상세는 첫 칸).
    const firstCell = cellsIn(bagGrid)[0];
    assert.equal(firstCell.dataset.itemId, 'p1');
  } finally { globalThis.document = previous; }
});

test('여러 칸을 고르면 하단 상세 바 버튼도 선택한 칸 전부를 한 요청으로 옮긴다(작업 250)', async () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = freshSave(); save.job = 'warrior';
    save.bag = [sword('w1'), sword('w2'), helmet('h1')];
    const stored = [sword('s1'), helmet('s2')];
    const { ui, calls } = uiFixture(save, stored.slice());
    const dialog = element();
    renderWarehouse(ui, dialog);
    const [storageGrid, bagGrid] = all(dialog, node => node.classList.contains('warehouse-grid'));
    const detail = all(dialog, node => node.classList.contains('warehouse-detail'))[0];
    const moveOf = () => all(detail, node => node.classList.contains('warehouse-move'))[0];

    // 1개만 고르면 예전 문구 그대로 — 상세 바는 그 칸의 이름을 보여 주고 `보관하기`를 쓴다.
    cellsIn(bagGrid).find(cell => cell.dataset.itemId === 'w1').onclick();
    assert.equal(moveOf().textContent, '보관하기');
    assert.equal(warehouseState(ui).picked.size, 1);

    // 2개째를 고르면 버튼이 `선택 보관 (2)`로 바뀐다(마지막 1개가 아니라 고른 칸 전부).
    cellsIn(bagGrid).find(cell => cell.dataset.itemId === 'h1').onclick();
    assert.equal(moveOf().textContent, '선택 보관 (2)');
    assert(text(detail).includes('선택 2개'), '상세 바가 함께 옮길 개수를 밝힌다');
    const before = calls.length;
    moveOf().onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls.length, before + 1, '두 번이 아니라 한 요청');
    assert.deepEqual(calls.at(-1), { action: 'deposit', ids: ['w1', 'h1'] });
    assert.equal(warehouseState(ui).picked.size, 0, '옮기고 나면 선택을 비운다');

    // 창고 쪽도 같다 — 두 칸을 고르면 `선택 꺼내기 (2)`로 전부 꺼낸다.
    const storageCells = cellsIn(all(dialog, node => node.classList.contains('warehouse-grid'))[0]);
    storageCells.find(cell => cell.dataset.itemId === 's1').onclick();
    assert.equal(moveOf().textContent, '꺼내기');
    storageCells.find(cell => cell.dataset.itemId === 's2').onclick();
    assert.equal(moveOf().textContent, '선택 꺼내기 (2)');
    moveOf().onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls.at(-1), { action: 'withdraw', ids: ['s1', 's2'] });
    assert.equal(warehouseState(ui).picked.size, 0);
  } finally { globalThis.document = previous; }
});

test('다중 선택 이동이 실패하면 골라 둔 칸이 그대로 남아 다시 누를 수 있다(작업 250)', async () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = freshSave(); save.bag = [sword('w1'), helmet('h1')];
    const { ui } = uiFixture(save, []);
    ui.market.sync.transferWarehouse = async () => { throw new Error('서버 연결이 불안정합니다.'); };
    const dialog = element();
    renderWarehouse(ui, dialog);
    const bagCells = cellsIn(all(dialog, node => node.classList.contains('warehouse-grid'))[1]);
    bagCells.find(cell => cell.dataset.itemId === 'w1').onclick();
    bagCells.find(cell => cell.dataset.itemId === 'h1').onclick();
    all(dialog, node => node.classList.contains('warehouse-move'))[0].onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ui.messages.at(-1), '서버 연결이 불안정합니다.');
    assert.equal(warehouseState(ui).picked.size, 2, '실패하면 선택은 유지된다');
    const after = cellsIn(all(dialog, node => node.classList.contains('warehouse-grid'))[1]);
    assert.equal(after.filter(cell => cell.disabled).length, 0, '잠긴 칸이 남지 않는다');
    assert.equal(all(dialog, node => node.classList.contains('warehouse-move'))[0].textContent, '선택 보관 (2)');
  } finally { globalThis.document = previous; }
});

test('이동하는 동안 그 칸만 잠기고 응답의 세이브·창고 목록으로 화면이 바로 갱신된다(작업 250)', async () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = freshSave(); save.job = 'warrior'; save.bag = [sword('w1'), helmet('h1')];
    const { ui } = uiFixture(save, [{ id: 's9', name: '창고 검', slot: 'weapon', rarity: 'epic', stats: { attack: 30 } }]);
    let release = () => {};
    const gate = new Promise(resolve => { release = resolve; });
    ui.market.sync.transferWarehouse = async (action, ids) => {
      await gate;
      const moved = save.bag.filter(item => ids.includes(item.id));
      save.bag = save.bag.filter(item => !ids.includes(item.id));
      ui.warehouseItems = [...(ui.warehouseItems ?? []), ...moved];
      return { ok: true, message: '보관했습니다.', items: ui.warehouseItems, save };
    };
    const dialog = element();
    renderWarehouse(ui, dialog);
    const bagGrid = () => all(dialog, node => node.classList.contains('warehouse-grid'))[1];
    const bagCell = id => cellsIn(bagGrid()).find(cell => cell.dataset.itemId === id);
    bagCell('w1').onclick();
    all(dialog, node => node.classList.contains('warehouse-move'))[0].onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(bagCell('w1').disabled, true, '옮기는 칸만 잠긴다');
    assert.equal(bagCell('w1').classList.contains('is-busy'), true);
    assert.equal(bagCell('h1').disabled, false, '다른 칸은 그대로 누를 수 있다');
    assert(!text(dialog).includes('불러오는 중'), '로딩 문구로 돌아가지 않는다');
    assert(text(dialog).includes('가방 2/40'));
    release();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(bagCell('w1'), undefined, '응답이 실어 온 세이브로 가방이 바로 갱신된다');
    assert.equal(cellsIn(bagGrid()).filter(cell => cell.disabled).length, 0, '잠금이 모두 풀린다');
    assert(text(dialog).includes('가방 1/40') && text(dialog).includes('공용창고 2/40'));

    // 이동 응답을 잃어 잠금 표시가 남아도, 창고를 다시 열면 모든 칸이 다시 눌린다.
    warehouseState(ui).busy.add('h1');
    const reopened = element();
    renderWarehouse(ui, reopened);
    assert.equal(cellsIn(all(reopened, node => node.classList.contains('warehouse-grid'))[1]).filter(cell => cell.disabled).length, 0);
  } finally { globalThis.document = previous; }
});

// 작업 253 — 사용자 제보(11-21) "공용창고 선택 꺼내기 너무 느리다". 예전에는 아이템마다 `await tx.execute`로
// 소유 기록을 읽어 10개면 10번, 30개면 30번 원격 DB를 왕복했다(수 초~타임아웃). 지금은 `IN (...)` 한 번으로
// 읽어 `Map`으로 검증하고, 쓰기도 `INSERT`(다중 VALUES) 1 + `UPDATE ... IN (...)` 2 / `DELETE` 1 + `UPDATE ... IN (...)` 2로 묶는다.
test('일괄 보관·꺼내기는 아이템 수만큼 DB를 왕복하지 않는다(작업 253)', () => {
  const source = readFileSync(new URL('../server/endpoints/warehouse.mjs', import.meta.url), 'utf8');
  const start = source.indexOf("if (input.action === 'deposit')");
  const end = source.indexOf('const saved = await writeSave');
  assert(start > 0 && end > start, '보관·꺼내기 블록을 찾는다');
  const block = source.slice(start, end);
  const loops = [...block.matchAll(/for \(const itemId of ids\) \{([\s\S]*?)\n        \}/g)].map(match => match[1]);
  assert.equal(loops.length, 2, '보관·꺼내기 각각 하나의 루프');
  for (const body of loops) assert.doesNotMatch(body, /await tx\.execute/, '아이템 루프 안에서 DB를 왕복하지 않는다');
  assert.match(block, /o\.item_id IN \(\$\{placeholders\(ids\)\}\)/, '보관: 소유 기록을 1회 조회');
  assert.match(block, /w\.item_id IN \(\$\{placeholders\(ids\)\}\)/, '꺼내기: 창고+소유 기록을 1회 조회');
  assert.match(block, /UPDATE djrpg_item_owners SET location='warehouse' WHERE account_id=\? AND item_id IN \(\$\{marks\}\)/);
  assert.match(block, /DELETE FROM djrpg_warehouse WHERE account_id=\? AND item_id IN \(\$\{marks\}\)/);
  assert.equal((block.match(/INSERT INTO djrpg_warehouse/g) ?? []).length, 1, '보관 INSERT도 1문장(다중 VALUES)');
});
