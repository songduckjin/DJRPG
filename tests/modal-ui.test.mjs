import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { freshSave } = await import('../src/game/store.ts');
const { codexVariants } = await import('../src/game/codex.ts');
const { rarityOrder, rarityRanks } = await import('../src/game/items.ts');
const { compareEquipment } = await import('../src/game/itemComparison.ts');
const { detailPosition, dismissBagDetail } = await import('../src/ui/bagDetail.ts');
const { Interface } = await import('../src/ui/interface.ts');
const { renderCharacters, renderCreateCharacter, openDeleteCharacter } = await import('../src/ui/modals/charactersModal.ts');
const { Market } = await import('../src/game/market.ts');
const equipment = (slot, stats) => ({ id: slot, name: slot, slot, rarity: 'rare', stats });

test('codex groups all six grades in ascending order, retaining filters', () => {
  const save = freshSave(), variants = codexVariants(save);
  assert.equal(variants.length, 570);
  assert.deepEqual([...new Set(variants.map(v => v.rarity))], rarityOrder);
  for (let i = 1; i < variants.length; i++) assert(rarityRanks[variants[i-1].rarity] <= rarityRanks[variants[i].rarity]);
  const filtered = codexVariants(save, '', 'helmet', 'all', 'epic');
  assert.equal(filtered.length, 10);
  assert(filtered.every(v => v.rarity === 'epic' && v.entry.slot === 'helmet'));
});
test('purchase comparison includes current values, gains, unchanged stats and lost options for the same slot', () => {
  const save = freshSave();
  save.equipment.weapon = equipment('weapon', { attack: 10, health: 20, crit: 3 });
  save.equipment.helmet = equipment('helmet', { defense: 999 });
  const result = compareEquipment(save, equipment('weapon', { attack: 15, crit: 3, speed: 2 }));
  assert.equal(result.equipped, save.equipment.weapon);
  assert.deepEqual(Object.fromEntries(result.stats.map(s => [s.stat, [s.current, s.candidate, s.difference]])), {
    attack: [10, 15, 5], health: [20, 0, -20], crit: [3, 3, 0], speed: [0, 2, 2]
  });
});
test('empty equipment slot compares to zero; skillbooks have no equipment comparison', () => {
  const save = freshSave(); save.equipment = {};
  assert.deepEqual(compareEquipment(save, equipment('ring2', { attack: 5 })).stats, [{ stat: 'attack', current: 0, candidate: 5, difference: 5 }]);
  assert.equal(compareEquipment(save, { kind: 'skillbook', slot: 'skillbook', stats: {} }), undefined);
});
function uiFixture() {
  const market = new Market({ locked: false }); market.open = () => {}; market.close = () => {};
  const bag = { scrollTop: 60 }, dialog = { scrollTop: 80, querySelector: () => bag };
  return { market, modal: { querySelector: selector => selector === '.modal-dialog' ? dialog : null, querySelectorAll: () => [] }, openModal: null,
    selected: 'old', bagFilter: 'weapon', salvageRarity: 'unique', codexQuery: '검', codexSlot: 'weapon', codexRarity: 'rare', codexState: 'owned', codexSelected: 'old',
    newItems: new Set(), renderBagBadge() {}, renderModal() { this.renders = (this.renders || 0) + 1; }, dialog, bag };
}
test('closing and reopening popups restores defaults and scroll without changing saved game data', () => {
  const ui = uiFixture(); Interface.prototype.open.call(ui, 'equipment');
  assert.equal(ui.selected, undefined); assert.equal(ui.bagFilter, 'all');
  // The bulk-salvage threshold is the user's own setting, not a view filter (작업 196): it survives
  // closing the popup.
  assert.equal(ui.salvageRarity, 'unique');
  assert.equal(ui.dialog.scrollTop, 0); assert.equal(ui.bag.scrollTop, 0);
  ui.bagFilter = 'armor'; ui.salvageRarity = 'epic'; ui.selected = 'new';
  Interface.prototype.open.call(ui, null); Interface.prototype.open.call(ui, 'codex');
  assert.equal(ui.codexQuery, ''); assert.equal(ui.codexSlot, ''); assert.equal(ui.codexState, 'all'); assert.equal(ui.codexRarity, ''); assert.equal(ui.codexSelected, undefined);
  // Explicit field-slot and dismantling confirmation flows retain their payload.
  ui.skillTarget = 2; Interface.prototype.open.call(ui, 'skills'); assert.equal(ui.skillTarget, 2);
  ui.salvageIds = ['item']; Interface.prototype.open.call(ui, 'salvage'); assert.deepEqual(ui.salvageIds, ['item']);
});
test('reopening market restores sale list, filters and registration form, preserving pending operations', () => {
  const ui = uiFixture(), market = ui.market;
  market.view = 'register'; market.price = '500'; market.selectedItem = 'item'; market.filters.minPrice = 200; market.filters.page = 3; market.selected = { id: 'sale' };
  Interface.prototype.open.call(ui, 'market');
  assert.equal(market.view, 'active'); assert.equal(market.selectedItem, ''); assert.equal(market.price, ''); assert.equal(market.selected, undefined);
  assert.deepEqual(market.filters, { query: '', category: '', slot: '', rarity: '', sort: 'newest', page: 0 });
  market.sync.pendingMarket = { action: 'buy' }; Interface.prototype.open.call(ui, null);
  assert.equal(ui.openModal, 'market'); assert.deepEqual(market.sync.pendingMarket, { action: 'buy' });
});
test('reset market view rejects stale in-flight list results', async () => {
  const original = globalThis.fetch; let resolve;
  globalThis.fetch = () => new Promise(r => { resolve = r; });
  try {
    const market = new Market({ session: { token: 'test' } });
    const request = market.load(true); market.resetView();
    resolve({ ok: true, json: async () => ({ inbox: [], listings: [{ id: 'old' }] }) });
    await request; assert.equal(market.data, undefined); assert.equal(market.loading, false);
  } finally { globalThis.fetch = original; }
});
test('bag detail stays inside small popup bounds at upper and lower edges', () => {
  const bounds = { left: 8, right: 328, top: 20, bottom: 420 };
  for (const anchor of [{ top: 60, bottom: 114 }, { top: 350, bottom: 404 }]) {
    for (const height of [100, 700]) {
      const p = detailPosition(bounds, anchor, height);
      assert(p.top >= 28); assert(p.top + Math.min(height, p.maxHeight) <= 412);
      assert.equal(p.left, 16); assert.equal(p.width, 304);
    }
  }
});
test('dismissing bag details removes overlay and selection without rebuilding the bag', () => {
  let removed = false, highlighted = true, expanded;
  const ui = { selected: 'item', modal: {
    querySelector: () => ({ remove() { removed = true; } }),
    querySelectorAll: () => [{ classList: { remove() { highlighted = false; } }, setAttribute(key, value) { expanded = value; } }]
  }};
  dismissBagDetail(ui); assert.equal(ui.selected, undefined); assert(removed); assert(!highlighted); assert.equal(expanded, 'false');
});

test('world boss reopens on challenge while in-popup ranking and reward choices survive redraw',()=>{
 const ui=uiFixture();ui.worldBoss={tab:'ranking'};
 Interface.prototype.open.call(ui,'worldBoss');assert.equal(ui.worldBoss.tab,'challenge');
 ui.worldBoss.tab='rewards';Interface.prototype.open.call(ui,'worldBoss');assert.equal(ui.worldBoss.tab,'rewards');
 Interface.prototype.open.call(ui,null);Interface.prototype.open.call(ui,'worldBoss');assert.equal(ui.worldBoss.tab,'challenge');
});

test('character selection shows one idle button for every created character only', () => {
  const originalDocument = globalThis.document;
  class Element {
    children = []; attributes = {}; className = ''; textContent = ''; type = ''; onclick = null;
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(name, value) { this.attributes[name] = value; }
  }
  globalThis.document = { createElement: () => new Element(), createTextNode: text => ({ textContent: text }) };
  try {
    const dialog = new Element();
    const ui = { characterList: { characters: [
      { slot: 1, name: '첫째', gender: 'male', level: 4, floor: 3 },
      { slot: 3, name: '셋째', gender: 'female', level: 2, floor: 1 }
    ], activeSlot: 1, maxSlots: 3 }, characterPage: 0, session: { characterSlot: 1 }, world: { save: { autoClimb: false }, onChange() { this.changed = true; } }, messages: [], message(value) { this.messages.push(value); }, open() {}, renderModal() {} };
    renderCharacters(ui, dialog);
    const visit = node => [node, ...(node.children || []).filter(child => child && typeof child === 'object').flatMap(visit)];
    const idleButtons = visit(dialog).filter(node => node.textContent === '방치');
    assert.equal(idleButtons.length, 2);
    assert.deepEqual(idleButtons.map(node => node.attributes['aria-label']), ['첫째 방치 사냥 시작', '셋째 방치 사냥 시작']);
    idleButtons[0].onclick();
    assert.equal(ui.world.save.autoClimb, true);
    assert.equal(ui.world.changed, true);
    ui.characterList.allIdleExpiresAt = Date.now() + 86400000;
    ui.characterList.characters[1].idleSeconds = 3660;
    const packageDialog = new Element(); renderCharacters(ui, packageDialog);
    const packageNodes = visit(packageDialog);
    assert(packageNodes.filter(node => node.textContent === '방치').every(node => node.disabled));
    assert(packageNodes.some(node => node.textContent === '방치 시간 01:01'));
  } finally { globalThis.document = originalDocument; }
});

test('character creation shows a full-screen loading state and restores retry on save failure', async () => {
  const originalDocument = globalThis.document;
  class Element {
    children = []; classList = { toggle() {} }; hidden = false; textContent = '';
    append(...nodes) { this.children.push(...nodes); }
    setAttribute() {}
  }
  globalThis.document = { createElement: () => new Element() };
  try {
    let resolveFlush;
    const ui = { characterCreateSlot: 2, market: { sync: { flush: () => new Promise(resolve => { resolveFlush = resolve; }) } }, open() {} };
    const dialog = new Element();
    renderCreateCharacter(ui, dialog);
    const form = dialog.children[0], loading = form.children.at(-1), submit = form.children.at(-2), error = form.children.at(-3);
    form.children[0].children[0].value = '새전사';
    const pending = form.onsubmit({ preventDefault() {} });
    assert.equal(loading.hidden, false); assert.equal(submit.disabled, true);
    resolveFlush(false); await pending;
    assert.equal(loading.hidden, true); assert.equal(submit.disabled, false);
    assert.match(error.textContent, /저장 결과/);
  } finally { globalThis.document = originalDocument; }
});

test('selecting another character immediately shows loading while save confirmation is pending', async () => {
  const originalDocument = globalThis.document;
  class Element {
    children = []; className = ''; textContent = ''; removed = false;
    append(...nodes) { this.children.push(...nodes); }
    setAttribute() {}
    remove() { this.removed = true; }
  }
  const body = new Element();
  globalThis.document = { createElement: () => new Element(), createTextNode: text => ({ textContent: text }), body };
  try {
    let resolveFlush;
    const ui = { characterList: { characters: [{slot:1,name:'첫째',gender:'male',level:1,floor:1},{slot:2,name:'둘째',gender:'female',level:1,floor:1}], activeSlot:1,maxSlots:3 }, characterPage:0,
      session:{characterSlot:1}, market:{sync:{flush:()=>new Promise(resolve=>{resolveFlush=resolve;})}}, message(){}, renderModal(){} };
    const dialog = new Element(); renderCharacters(ui, dialog);
    const visit = node => [node, ...(node.children||[]).filter(child=>child&&typeof child==='object').flatMap(visit)];
    const selects = visit(dialog).filter(node=>node.className==='character-select');
    // [작업 216] 카드를 누르면 그 카드가 펼쳐지기만 하고, 펼친 카드의 `선택`을 눌러야 접속한다.
    selects[1].onclick();
    assert.equal(ui.characterFocus, 2);
    assert.equal(body.children.length, 0, '카드 탭만으로는 접속하지 않는다');
    const expanded = new Element(); renderCharacters(ui, expanded);
    const connects = visit(expanded).filter(node=>node.className==='character-connect');
    connects[1].onclick();
    assert.equal(body.children[0].className, 'character-create-loading');
    assert.equal(typeof resolveFlush, 'function');
    resolveFlush(false); await new Promise(resolve=>setImmediate(resolve));
    assert.equal(body.children[0].removed, true);
  } finally { globalThis.document = originalDocument; }
});

// 캐릭터 삭제 확인 모달(작업 206) — window.prompt() 없이, 목록 모달 밖에 한 겹 얹는다.
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
    this.value = ''; this.disabled = false; this.removed = false;
  }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  fire(type, event = {}) { for (const handler of this.listeners[type] || []) handler({ target: this, ...event }); }
  focus() { this.focused = true; }
  remove() { this.removed = true; }
}
function installDeleteDom() {
  const original = globalThis.document;
  const body = new FakeElement('body');
  globalThis.document = { createElement: tag => new FakeElement(tag), createTextNode: text => ({ textContent: text }), body };
  return () => { globalThis.document = original; };
}
const visit = node => [node, ...((node.children || []).filter(child => child && typeof child === 'object')).flatMap(visit)];
function deleteFixture(character = { slot: 2, name: '둘째', gender: 'female', job: 'mage', level: 5, floor: 4, itemCount: 7 }) {
  const root = new FakeElement('main'), dialog = new FakeElement('div');
  dialog.className = 'modal-dialog'; dialog.scrollTop = 0;
  dialog.querySelector = () => null;
  const ui = {
    root, modal: { hidden: false, querySelector: selector => selector === '.modal-dialog' ? dialog : null },
    session: { token: 'token', characterSlot: 1 }, openModal: 'characters', characterPage: 0,
    characterList: { characters: [character], activeSlot: 1, maxSlots: 3, revision: 4 },
    messages: [], message(text) { this.messages.push(text); }, renderModal() { this.renders = (this.renders || 0) + 1; },
    market: { sync: { revision: 4, flush: async () => true } }
  };
  return { ui, root, dialog, character };
}

test('캐릭터 삭제 확인은 window.prompt 대신 경고·이름 입력·취소·영구 삭제를 그린다', () => {
  const restore = installDeleteDom();
  try {
    const { ui, root, dialog, character } = deleteFixture();
    const overlay = openDeleteCharacter(ui, character);
    const nodes = visit(overlay), texts = nodes.map(node => node.textContent).filter(Boolean);
    assert.equal(overlay.className, 'character-delete-overlay');
    assert.equal(overlay.attributes.role, 'dialog');
    assert.equal(overlay.attributes['aria-modal'], 'true');
    assert(texts.includes('둘째 캐릭터와 착용 장비·가방 아이템 7개가 영구 삭제됩니다.'), '경고 문구가 캐릭터 이름·아이템 수를 담는다');
    const input = nodes.find(node => node.tagName === 'INPUT');
    assert(input, '이름 확인 입력창이 있다');
    assert.equal(input.attributes.autocapitalize, 'off'); assert.equal(input.attributes.autocorrect, 'off'); assert.equal(input.attributes.enterkeyhint, 'done');
    const buttons = nodes.filter(node => node.tagName === 'BUTTON');
    const cancel = buttons.find(node => node.textContent === '취소'), confirm = buttons.find(node => node.textContent === '영구 삭제');
    assert(cancel && confirm, '취소·영구 삭제 버튼이 있다');
    assert.equal(cancel.type, 'button'); assert.equal(confirm.type, 'submit');
    assert.equal(confirm.classList.has('ready'), false, '이름을 입력하기 전에는 강조하지 않는다');
    // 목록 모달(world.onChange마다 다시 그려지는 곳)이 아니라 그 위에 얹는다 — 입력 중인 이름이 살아남는다.
    assert(root.children.includes(overlay));
    assert.equal(dialog.children.length, 0);
    // 이름이 맞으면 영구 삭제 버튼이 위험 강조로 바뀐다.
    input.value = '둘째'; input.fire('input');
    assert.equal(confirm.classList.has('ready'), true);
    // 소스에 브라우저 기본 입력창이 남아 있지 않다.
    const source = readFileSync(new URL('../src/ui/modals/charactersModal.ts', import.meta.url), 'utf8');
    assert(!source.includes('window.prompt'), 'window.prompt()를 쓰지 않는다');
    assert(source.includes('openDeleteCharacter(ui, character)'), '목록의 삭제 버튼이 새 확인창을 연다');
  } finally { restore(); }
});

test('삭제 확인은 이름이 다르면 조용히 끝내지 않고 모달 안에 안내를 남긴다', async () => {
  const restore = installDeleteDom();
  const originalFetch = globalThis.fetch;
  try {
    const requests = [];
    globalThis.fetch = async (url, options) => { requests.push(JSON.parse(options.body)); return { ok: true, json: async () => ({}) }; };
    const { ui, character } = deleteFixture();
    let flushed = 0;
    ui.market.sync.flush = async () => { flushed++; return true; };
    const overlay = openDeleteCharacter(ui, character);
    const nodes = visit(overlay);
    const form = nodes.find(node => node.tagName === 'FORM');
    const input = nodes.find(node => node.tagName === 'INPUT');
    const error = nodes.find(node => node.className === 'character-delete-error');
    const confirm = nodes.find(node => node.className === 'character-delete-confirm');
    input.value = '둘쨰';
    form.onsubmit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(error.textContent, '캐릭터 이름을 정확히 입력해 주세요.');
    assert.equal(input.focused, true, '입력창으로 되돌린다');
    assert.equal(flushed, 0); assert.equal(requests.length, 0);
    assert.equal(overlay.removed, false); assert.equal(confirm.disabled, false);
    // 이름을 고치면 안내가 사라진다.
    input.value = '둘째'; input.fire('input');
    assert.equal(error.textContent, '');
  } finally { globalThis.fetch = originalFetch; restore(); }
});

test('삭제 중에는 중복 클릭을 막고 "삭제 중…"을 보여 준 뒤 목록을 갱신한다', async () => {
  const restore = installDeleteDom();
  const originalFetch = globalThis.fetch;
  try {
    const requests = [];
    globalThis.fetch = async (url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ characters: [{ slot: 1, name: '첫째', gender: 'male', level: 9, floor: 6 }], activeSlot: 1, maxSlots: 3, revision: 5 }) };
    };
    const { ui, character } = deleteFixture();
    let release;
    ui.market.sync.flush = () => new Promise(resolve => { release = resolve; });
    const overlay = openDeleteCharacter(ui, character);
    const nodes = visit(overlay);
    const form = nodes.find(node => node.tagName === 'FORM');
    const input = nodes.find(node => node.tagName === 'INPUT');
    const confirm = nodes.find(node => node.className === 'character-delete-confirm');
    const cancel = nodes.find(node => node.className === 'character-delete-cancel');
    input.value = '둘째';
    form.onsubmit({ preventDefault() {} });
    form.onsubmit({ preventDefault() {} });
    assert.equal(confirm.disabled, true); assert.equal(cancel.disabled, true);
    assert.equal(confirm.textContent, '삭제 중…');
    release(true);
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests.filter(request => request.action === 'deleteCharacter').length, 1, '두 번 눌러도 요청은 한 번');
    const deletion = requests.find(request => request.action === 'deleteCharacter');
    assert.deepEqual({ slot: deletion.slot, name: deletion.name, revision: deletion.revision }, { slot: 2, name: '둘째', revision: 4 });
    assert.equal(overlay.removed, true, '완료하면 확인창을 닫는다');
    assert.deepEqual(ui.messages, ['둘째 캐릭터를 삭제했습니다.']);
    assert(requests.some(request => request.action === 'characters'), '삭제 뒤 목록을 다시 읽는다');
    assert.deepEqual(ui.characterList.characters.map(entry => entry.slot), [1]);
  } finally { globalThis.fetch = originalFetch; restore(); }
});

test('삭제 실패는 확인창 안에 서버 메시지를 남기고 다시 시도할 수 있게 둔다', async () => {
  const restore = installDeleteDom();
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 409, json: async () => ({ error: '현재 사용 중인 캐릭터는 다른 캐릭터를 선택한 뒤 삭제하세요.', code: 'ACTIVE_CHARACTER' }) });
    const { ui, character } = deleteFixture();
    const overlay = openDeleteCharacter(ui, character);
    const nodes = visit(overlay);
    const form = nodes.find(node => node.tagName === 'FORM');
    const input = nodes.find(node => node.tagName === 'INPUT');
    const error = nodes.find(node => node.className === 'character-delete-error');
    const confirm = nodes.find(node => node.className === 'character-delete-confirm');
    input.value = '둘째';
    form.onsubmit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.match(error.textContent, /현재 사용 중인 캐릭터/);
    assert.equal(overlay.removed, false);
    assert.equal(confirm.disabled, false); assert.equal(confirm.textContent, '영구 삭제');
    assert.deepEqual(ui.messages, []);
  } finally { globalThis.fetch = originalFetch; restore(); }
});
