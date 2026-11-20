import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { configureDatabase } from '../server/database-config.mjs';
import { schema } from '../server/database.mjs';
import { worldBossSchema } from '../server/world-boss-schema.mjs';
import { ACCOUNT_TABLES, MARKET_TABLE } from '../server/account-delete.mjs';
import { accountEndpoint } from '../server/endpoints/account.mjs';

// Functions 어댑터(`api/account.mjs`)가 하는 일과 같다 — DB 클라이언트 공장을 등록해야 엔드포인트가 DB를 연다.
configureDatabase(createClient);
import './ts-loader.mjs';
const { freshSave } = await import('../src/game/store.ts');
const { renderAccount } = await import('../src/ui/modals/accountModal.ts');
const { openDeleteAccount } = await import('../src/ui/modals/accountDelete.ts');
const { renderCharacters } = await import('../src/ui/modals/charactersModal.ts');

const PASSWORD = 'password123';

async function openDatabase(name) {
  const directory = await mkdtemp(join(tmpdir(), `djrpg-${name}-`));
  const url = `file:${join(directory, `${name}.db`)}`;
  process.env.TURSO_DATABASE_URL = url;
  process.env.TURSO_AUTH_TOKEN = `local-${name}-token`;
  const db = createClient({ url });
  await schema(db);
  return db;
}

/** 실제 Pages Functions와 같은 입구로 부른다(버전 헤더가 없으면 통과, 본문은 JSON 요청 본문). */
function endpoint() {
  return async (body, token) => {
    const request = new Request('https://djrpg.pages.dev/api/account', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    });
    const response = await accountEndpoint(request, { env: process.env });
    return { status: response.status, body: await response.json() };
  };
}

/** 계정 하나에 실제로 붙는 표 전부에 행을 하나씩 심는다 — 삭제가 한 표라도 빠지면 여기서 걸린다. */
async function seedAccountRows(db, id) {
  const save = { ...freshSave('male', 'warrior'), accountId: id, name: id };
  const item = { id: `${id}-sword`, name: '기존 검', slot: 'weapon', rarity: 'rare', stats: { attack: 10 } };
  const now = Date.now(), stamp = new Date(now).toISOString();
  await db.batch([
    { sql: 'INSERT INTO djrpg_characters(account_id,slot,save_json,updated_at) VALUES (?,?,?,?)', args: [id, 1, JSON.stringify({ ...save, gold: undefined }), stamp] },
    { sql: 'INSERT INTO djrpg_character_item_owners(item_id,account_id,slot) VALUES (?,?,?)', args: [item.id, id, 1] },
    { sql: 'INSERT INTO djrpg_item_owners(item_id,account_id,location,item_json) VALUES (?,?,?,?)', args: [item.id, id, 'inventory', JSON.stringify(item)] },
    { sql: 'INSERT INTO djrpg_warehouse(account_id,item_id,item_json) VALUES (?,?,?)', args: [id, `${id}-box`, JSON.stringify({ ...item, id: `${id}-box` })] },
    { sql: 'INSERT INTO djrpg_warehouse_requests(account_id,request_id,response_json) VALUES (?,?,?)', args: [id, 'w1', '{}'] },
    { sql: 'INSERT INTO djrpg_journey(account_id,state_json) VALUES (?,?)', args: [id, '{}'] },
    { sql: 'INSERT INTO djrpg_save_versions(account_id,revision) VALUES (?,?)', args: [id, 4] },
    { sql: 'INSERT INTO djrpg_save_requests(account_id,request_id,revision) VALUES (?,?,?)', args: [id, 's1', 4] },
    { sql: 'INSERT INTO djrpg_market_inbox(id,account_id,listing_id,kind,item_json,gold,reason,created_at,claimed_at) VALUES (?,?,?,?,?,?,?,?,NULL)', args: [`${id}-inbox`, id, `${id}-listing`, 'return', null, 120, '등록 기간 만료', now] },
    { sql: 'INSERT INTO djrpg_market_requests(account_id,request_id,response_json) VALUES (?,?,?)', args: [id, 'm1', '{}'] },
    { sql: 'INSERT INTO djrpg_dungeon_records(account_id,name,cleared_floor,cleared_at,updated_at) VALUES (?,?,?,?,?)', args: [id, id, 3, now, now] },
    { sql: 'INSERT INTO djrpg_dungeon_attempts(account_id,floor,started_at,updated_at,seed) VALUES (?,?,?,?,?)', args: [id, 4, now, now, 7] },
    { sql: 'INSERT INTO djrpg_boss_attempts(id,account_id,day,request_id,save_json,started_at,dodges_json,credited,ended_at) VALUES (?,?,?,?,?,?,?,?,NULL)', args: [`${id}-attempt`, id, '2026-11-20', 'r1', '{}', now, '[]', 1] },
    { sql: 'INSERT INTO djrpg_boss_scores(day,account_id,name,damage,joined_at) VALUES (?,?,?,?,?)', args: ['2026-11-20', id, id, 1000, now] },
    { sql: 'INSERT INTO djrpg_boss_rewards(day,account_id,kind) VALUES (?,?,?)', args: ['2026-11-20', id, 'participation'] },
    { sql: 'INSERT INTO djrpg_announcements(id,account_id,character,item,created_at) VALUES (?,?,?,?,?)', args: [`${id}-legend`, id, id, '전설 검', now] },
    { sql: 'INSERT INTO djrpg_shop_orders(order_id,account_id,product_id,amount,currency,provider,grant_json,status,payment_key,created_at,confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', args: [`${id}-order`, id, 'diamonds_500', 5500, 'KRW', 'test', '{}', 'paid', `${id}-pay`, now, now] },
    { sql: 'INSERT INTO djrpg_shop_ledger(account_id,source_type,source_id,diamonds_delta,created_at) VALUES (?,?,?,?,?)', args: [id, 'order', `${id}-order`, 500, now] },
    { sql: 'INSERT INTO djrpg_shop_entitlements(account_id,entitlement_key,quantity,expires_at,updated_at) VALUES (?,?,?,NULL,?)', args: [id, 'all_idle_30d', 0, now] },
    { sql: 'INSERT INTO djrpg_shop_requests(account_id,request_id,response_json) VALUES (?,?,?)', args: [id, 'p1', '{}'] },
    { sql: 'UPDATE djrpg_shop_wallet SET diamonds=500 WHERE account_id=?', args: [id] },
    { sql: 'INSERT INTO djrpg_market(id,seller,seller_name,buyer,item_json,name,slot,rarity,price,state,created_at,expires_at,sold_at) VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,NULL)', args: [`${id}-listing`, id, id, JSON.stringify(item), item.name, item.slot, item.rarity, 500, 'active', now, now + 60_000] },
    { sql: 'INSERT INTO djrpg_market_events(kind,listing_id,created_at) VALUES (?,?,?)', args: ['listed', `${id}-listing`, now] }
  ]);
}

const rowCount = async (db, table, where, args) => Number((await db.execute({ sql: `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, args })).rows[0].n);

test('계정 탈퇴는 계정 종속 표를 모두 지우고 같은 아이디로 즉시 재가입할 수 있게 한다', async () => {
  const db = await openDatabase('account-delete');
  try {
    await worldBossSchema(db);
    const call = endpoint();
    const registered = await call({ action: 'register', loginId: 'djsong', password: PASSWORD });
    assert.equal(registered.status, 200);
    const token = registered.body.token;
    await seedAccountRows(db, 'djsong');

    // ① 비밀번호가 틀리면 지우지 않는다.
    const wrongPassword = await call({ action: 'deleteAccount', password: 'wrong-password', confirmId: 'djsong' }, token);
    assert.equal(wrongPassword.status, 401); assert.equal(wrongPassword.body.code, 'INVALID_CREDENTIALS');
    assert.equal(await rowCount(db, 'djrpg_accounts', 'id=?', ['djsong']), 1);

    // ② 아이디를 잘못 적어도(다른 사람 아이디 포함) 지우지 않는다.
    for (const confirmId of ['', 'djsong2', 'DJ']) {
      const rejected = await call({ action: 'deleteAccount', password: PASSWORD, confirmId }, token);
      assert.equal(rejected.status, 400); assert.equal(rejected.body.code, 'ACCOUNT_ID_MISMATCH');
    }
    assert.equal(await rowCount(db, 'djrpg_accounts', 'id=?', ['djsong']), 1);

    // ③ 아이디는 대소문자를 가리지 않는다(`djrpg_accounts`가 NOCASE다).
    const deleted = await call({ action: 'deleteAccount', password: PASSWORD, confirmId: 'DJSong' }, token);
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.body.deleted, { characters: 1, listings: 1, diamonds: 500 });

    // ④ 계정 id가 들어가는 표는 하나도 남지 않는다.
    for (const table of ACCOUNT_TABLES) {
      const left = await rowCount(db, table, 'account_id=?', ['djsong']);
      assert.equal(left, 0, `${table} 잔여 행 ${left}`);
    }
    assert.equal(await rowCount(db, MARKET_TABLE, 'seller=? OR buyer=?', ['djsong', 'djsong']), 0);
    assert.equal(await rowCount(db, 'djrpg_market_events', 'listing_id=?', ['djsong-listing']), 0);
    assert.equal(await rowCount(db, 'djrpg_accounts', 'id=?', ['djsong']), 0);

    // ⑤ 지운 계정의 토큰은 더 이상 통하지 않는다.
    const stale = await call({ action: 'load' }, token);
    assert.equal(stale.status, 401);

    // ⑥ 같은 아이디로 곧바로 다시 가입된다 — 남은 행이 없으므로 409가 아니다.
    const again = await call({ action: 'register', loginId: 'djsong', password: 'newpassword123' });
    assert.equal(again.status, 200);
    assert.equal(again.body.needsCharacter, true);
    const fresh = await call({ action: 'login', loginId: 'djsong', password: 'newpassword123' });
    assert.equal(fresh.status, 200);
    assert.equal(fresh.body.save.level, 1);
    assert.equal(fresh.body.save.gold, 0);
    const characters = await call({ action: 'characters' }, fresh.body.token);
    assert.deepEqual(characters.body.characters, []);
  } finally { await db.close(); }
});

test('계정 탈퇴는 다른 계정의 데이터를 건드리지 않는다', async () => {
  const db = await openDatabase('account-delete-other');
  try {
    await worldBossSchema(db);
    const call = endpoint();
    const mine = (await call({ action: 'register', loginId: 'gonesoon', password: PASSWORD })).body.token;
    const keeper = (await call({ action: 'register', loginId: 'keeper', password: PASSWORD })).body.token;
    await seedAccountRows(db, 'gonesoon');
    await seedAccountRows(db, 'keeper');

    // 내 토큰으로 남의 아이디를 확인란에 적어도 내 계정만 지워진다.
    const deleted = await call({ action: 'deleteAccount', password: PASSWORD, confirmId: 'gonesoon' }, mine);
    assert.equal(deleted.status, 200);
    assert.equal(await rowCount(db, 'djrpg_accounts', 'id=?', ['gonesoon']), 0);
    assert.equal(await rowCount(db, 'djrpg_accounts', 'id=?', ['keeper']), 1);
    for (const table of ACCOUNT_TABLES) assert.equal(await rowCount(db, table, 'account_id=?', ['keeper']), 1, `${table} 유지`);
    assert.equal(await rowCount(db, MARKET_TABLE, 'seller=?', ['keeper']), 1);
    assert.equal((await call({ action: 'load' }, keeper)).status, 200);
    assert.equal((await call({ action: 'login', loginId: 'keeper', password: PASSWORD })).status, 200);
  } finally { await db.close(); }
});

test('게스트 계정은 비밀번호 없이 게스트 확인 문구로 탈퇴한다', async () => {
  const db = await openDatabase('account-delete-guest');
  try {
    const call = endpoint();
    const guest = (await call({ action: 'guest' })).body;
    const wrong = await call({ action: 'deleteAccount', confirmId: '게스트1' }, guest.token);
    assert.equal(wrong.status, 400); assert.equal(wrong.body.code, 'ACCOUNT_ID_MISMATCH');
    const deleted = await call({ action: 'deleteAccount', confirmId: '게스트' }, guest.token);
    assert.equal(deleted.status, 200);
    assert.equal(await rowCount(db, 'djrpg_accounts', 'id=?', [guest.accountId]), 0);
    assert.equal(await rowCount(db, 'djrpg_characters', 'account_id=?', [guest.accountId]), 0);
  } finally { await db.close(); }
});

// ---- 화면: 계정 정보 모달의 탈퇴 버튼과 확인창(캐릭터 삭제 확인창과 같은 방식) ----

class FakeClassList {
  values = new Set();
  toggle(name, force) {
    const next = force === undefined ? !this.values.has(name) : Boolean(force);
    if (next) this.values.add(name); else this.values.delete(name);
    return next;
  }
  has(name) { return this.values.has(name); }
}
class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.listeners = {};
    this.classList = new FakeClassList(); this.className = ''; this.textContent = '';
    this.value = ''; this.disabled = false; this.removed = false; this.dataset = {};
  }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.children.push(node); return node; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  fire(type, event = {}) { for (const handler of this.listeners[type] || []) handler({ target: this, ...event }); }
  querySelector() { return new FakeElement('b'); }
  querySelectorAll() { return []; }
  focus() { this.focused = true; }
  remove() { this.removed = true; }
}
function installDom() {
  const original = globalThis.document;
  const body = new FakeElement('body');
  globalThis.document = { createElement: tag => new FakeElement(tag), createTextNode: text => ({ textContent: text }), body };
  return () => { globalThis.document = original; };
}
const visit = node => [node, ...((node.children || []).filter(child => child && typeof child === 'object')).flatMap(visit)];

function accountFixture(session = { loginId: 'djsong', guest: false, token: 'token', characterSlot: 1 }) {
  const root = new FakeElement('main'), dialog = new FakeElement('div');
  dialog.className = 'modal-dialog'; dialog.scrollTop = 0;
  dialog.querySelector = () => null;
  const ui = {
    root, modal: { hidden: false, querySelector: selector => selector === '.modal-dialog' ? dialog : null, querySelectorAll: () => [] },
    session, openModal: 'account', confirmReset: false, saveStatus: '저장됨',
    world: { save: { ...freshSave(), name: '덕진', accountId: session.loginId }, onChange() {} },
    messages: [], message(text) { this.messages.push(text); }, renderModal() { this.renders = (this.renders || 0) + 1; },
    market: { sync: { revision: 1, flush: async () => true } },
    characterList: { characters: [], activeSlot: 1, maxSlots: 3, revision: 1 }, characterPage: 0
  };
  return { ui, root, dialog };
}

test('계정 정보 모달 하단에 계정 탈퇴 버튼이 있고, 누르면 비밀번호·아이디 확인창이 열린다', () => {
  const restore = installDom();
  try {
    const { ui, dialog } = accountFixture();
    renderAccount.call(ui, dialog);
    const button = visit(dialog).find(node => node.textContent === '계정 탈퇴 (아이디 삭제)');
    assert(button, '탈퇴 버튼이 있다');
    button.onclick();
    const overlay = ui.root.children.at(-1);
    assert.equal(overlay.className, 'account-delete-overlay');
    assert.equal(overlay.attributes.role, 'dialog');
    assert.equal(overlay.attributes['aria-modal'], 'true');
    const nodes = visit(overlay), texts = nodes.map(node => node.textContent).filter(Boolean);
    assert(texts.some(text => text.includes('djsong 계정의 캐릭터·장비·금화·다이아·창고·거래소 매물')), '무엇이 지워지는지 알린다');
    const inputs = nodes.filter(node => node.tagName === 'INPUT');
    assert.equal(inputs.length, 2, '비밀번호·아이디 입력');
    assert.equal(inputs[0].type, 'password');
    assert.equal(inputs[1].attributes.autocapitalize, 'off');
    assert.equal(inputs[1].value, '', '아이디를 미리 채우지 않는다');
    const buttons = nodes.filter(node => node.tagName === 'BUTTON');
    assert(buttons.find(node => node.textContent === '취소'));
    assert(buttons.find(node => node.textContent === '계정 삭제'));
    // 브라우저 기본 입력창은 쓰지 않는다.
    const source = readFileSync(new URL('../src/ui/modals/accountDelete.ts', import.meta.url), 'utf8');
    assert(!source.includes('window.prompt'), 'window.prompt()를 쓰지 않는다');
  } finally { restore(); }
});

test('탈퇴 확인은 틀린 아이디·빈 비밀번호를 확인창 안에서 막는다', async () => {
  const restore = installDom();
  const originalFetch = globalThis.fetch;
  try {
    const requests = [];
    globalThis.fetch = async (url, options) => { requests.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ ok: true }) }; };
    const { ui } = accountFixture();
    const overlay = openDeleteAccount(ui);
    const nodes = visit(overlay);
    const form = nodes.find(node => node.tagName === 'FORM');
    const [password, typed] = nodes.filter(node => node.tagName === 'INPUT');
    const error = nodes.find(node => node.className === 'account-delete-error');
    const confirm = nodes.find(node => node.className === 'account-delete-confirm');

    form.onsubmit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(error.textContent, '비밀번호를 입력해 주세요.');
    assert.equal(password.focused, true);

    password.value = PASSWORD; typed.value = 'djsom';
    form.onsubmit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(error.textContent, '아이디를 정확히 입력해 주세요.');
    assert.equal(typed.focused, true);
    assert.equal(requests.length, 0, '서버로 보내지 않는다');
    assert.equal(overlay.removed, false);
    assert.equal(confirm.classList.has('ready'), false);

    typed.value = 'djsong'; typed.fire('input');
    assert.equal(error.textContent, '');
    assert.equal(confirm.classList.has('ready'), true, '두 칸이 맞으면 위험 강조로 바뀐다');
  } finally { globalThis.fetch = originalFetch; restore(); }
});

test('탈퇴가 끝나면 중복 클릭을 막고 "삭제 중…"을 보여 준 뒤 세션을 지우고 화면을 다시 연다', async () => {
  const restore = installDom();
  const originalFetch = globalThis.fetch;
  const originalLocation = globalThis.location;
  try {
    const requests = [];
    let release;
    globalThis.fetch = (url, options) => {
      requests.push(JSON.parse(options.body));
      return new Promise(resolve => { release = () => resolve({ ok: true, json: async () => ({ ok: true, deleted: { characters: 1, listings: 0, diamonds: 0 } }) }); });
    };
    let reloads = 0;
    globalThis.location = { reload() { reloads++; } };
    const { ui } = accountFixture();
    const overlay = openDeleteAccount(ui);
    const nodes = visit(overlay);
    const form = nodes.find(node => node.tagName === 'FORM');
    const [password, typed] = nodes.filter(node => node.tagName === 'INPUT');
    const error = nodes.find(node => node.className === 'account-delete-error');
    const confirm = nodes.find(node => node.className === 'account-delete-confirm');
    const cancel = nodes.find(node => node.className === 'account-delete-cancel');
    password.value = PASSWORD; typed.value = 'djsong';
    form.onsubmit({ preventDefault() {} });
    form.onsubmit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(confirm.disabled, true); assert.equal(cancel.disabled, true);
    assert.equal(confirm.textContent, '삭제 중…');
    release();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    const calls = requests.filter(request => request.action === 'deleteAccount');
    assert.equal(calls.length, 1, '두 번 눌러도 요청은 한 번');
    assert.deepEqual({ password: calls[0].password, confirmId: calls[0].confirmId }, { password: PASSWORD, confirmId: 'djsong' });
    assert.equal(overlay.removed, true, '완료하면 확인창을 닫는다');
    assert.equal(reloads, 1, '로그인 화면으로 돌아간다');
    assert.equal(error.textContent, '');
  } finally { globalThis.fetch = originalFetch; globalThis.location = originalLocation; restore(); }
});

test('탈퇴 실패는 확인창 안에 서버 메시지를 남기고 다시 시도할 수 있게 둔다', async () => {
  const restore = installDom();
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ code: 'INVALID_CREDENTIALS', error: '비밀번호가 올바르지 않습니다.' }) });
    const { ui } = accountFixture();
    const overlay = openDeleteAccount(ui);
    const nodes = visit(overlay);
    const form = nodes.find(node => node.tagName === 'FORM');
    const [password, typed] = nodes.filter(node => node.tagName === 'INPUT');
    const error = nodes.find(node => node.className === 'account-delete-error');
    const confirm = nodes.find(node => node.className === 'account-delete-confirm');
    password.value = 'wrong-password'; typed.value = 'djsong';
    form.onsubmit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(error.textContent, '비밀번호가 올바르지 않습니다.');
    assert.equal(overlay.removed, false);
    assert.equal(confirm.disabled, false); assert.equal(confirm.textContent, '계정 삭제');
  } finally { globalThis.fetch = originalFetch; restore(); }
});

test('캐릭터 선택 화면에는 공용창고 버튼이 없다(하단 메뉴로 옮겼다)', () => {
  const restore = installDom();
  try {
    const { ui } = accountFixture();
    ui.openModal = 'characters';
    ui.characterList = { characters: [{ slot: 1, name: '첫째', gender: 'male', level: 3, floor: 2 }], activeSlot: 1, maxSlots: 3, revision: 1 };
    const dialog = new FakeElement('div');
    renderCharacters(ui, dialog);
    const texts = visit(dialog).map(node => node.textContent).filter(Boolean);
    assert(!texts.includes('공용창고'), '캐릭터 선택에 공용창고 버튼을 두지 않는다');
    const source = readFileSync(new URL('../src/ui/modals/charactersModal.ts', import.meta.url), 'utf8');
    assert(!source.includes("button('공용창고'"), '소스에도 버튼이 남아 있지 않다');
  } finally { restore(); }
});
