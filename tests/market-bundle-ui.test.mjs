import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { renderMarket } = await import('../src/ui/modals/marketModal.ts');
const { Market } = await import('../src/game/market.ts');
const { freshSave } = await import('../src/game/store.ts');

// 작업 249 — 판매 등록 스크롤 제거 · 묶음 등록(수량·개당 가격, 최대 10개) · 전체/개당 구매.
/** 영구 스탯북(파트 B) — 스킬북 대신 묶음 판매 대상이 된 소모품. 같은 `book`이 한 묶음이다. */
const book = (id, kind = 'attack', rarity = 'unique') => ({ id, name: { attack: '공격의 서', defense: '방어의 서', health: '체력의 서' }[kind], slot: 'statbook', kind: 'statbook', book: kind, rarity, stats: {} });
const snapshot = overrides => ({
  inbox: [], listings: [], watched: [], seq: 0, total: 0, page: 0, myActive: 0, revision: 0,
  rules: { fee: .05, maxListings: 30, durationHours: 72, maxPrice: 1_000_000_000, minPrice: 1, pageSize: 20, maxInbox: 30, maxBundle: 10 },
  ...overrides
});
function element(tag = 'div') {
  const node = {
    tag, children: [], dataset: {}, style: {}, className: '', textContent: '', attrs: {}, value: '', hidden: false, disabled: false, title: '',
    append(...children) { this.children.push(...children); },
    prepend(...children) { this.children.unshift(...children); },
    appendChild(child) { this.append(child); return child; },
    replaceChildren(...children) { this.children = children; },
    setAttribute(k, v) { this.attrs[k] = v; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    scrollIntoView() {}
  };
  Object.defineProperty(node, 'lastElementChild', { get() { return this.children.at(-1); } });
  node.classList = {
    add(name) { node.className += ` ${name}`; },
    toggle(name, on = !String(node.className).split(' ').includes(name)) { if (on) this.add(name); else node.className = String(node.className).split(' ').filter(entry => entry && entry !== name).join(' '); }
  };
  return node;
}
function all(node, predicate, found = []) {
  if (node && typeof node === 'object') {
    if (predicate(node)) found.push(node);
    for (const child of node.children ?? []) all(child, predicate, found);
  }
  return found;
}
const find = (node, predicate) => all(node, predicate)[0];
const hasClass = (node, name) => String(node.className ?? '').split(' ').includes(name);
// 화면 코드는 `document.createElement`·`CSS.escape`를 쓴다 — 테스트가 도는 동안만 가짜 DOM을 세운다.
globalThis.CSS ??= { escape: value => String(value) };
function withDoc(run) {
  const previous = globalThis.document; globalThis.document = { createElement: tag => element(tag) };
  try { return run(); } finally { globalThis.document = previous; }
}
function render(market, save = freshSave()) {
  return withDoc(() => {
    const dialog = element();
    renderMarket.call({ market, session: { guest: false }, world: { save }, root: { querySelector: () => null } }, dialog);
    return dialog;
  });
}
const listing = (overrides = {}) => ({
  id: 'l1', sellerName: '전사', item: book('b1'), price: 100, quantity: 3, state: 'active',
  createdAt: 1, expiresAt: Date.now() + 3600_000, soldAt: null, mine: false, purchased: false, ...overrides
});

test('판매 등록 화면만 모달을 고정 flex로 바꿔 아이템을 골라도 스크롤이 새로 생기지 않는다(작업 249)', () => {
  const save = freshSave();
  save.gold = 1000;
  save.bag = [book('b1'), book('b2'), book('b3')];
  const market = new Market({ conflicted: false });
  market.view = 'register'; market.data = snapshot();
  const dialog = render(market, save);
  assert(hasClass(dialog, 'market-registering'), '판매 등록 중에는 `.market-registering`');
  assert(find(dialog, node => hasClass(node, 'market-register-grid')), '물품 그리드가 있고');
  assert(!find(dialog, node => hasClass(node, 'market-register-detail')), '처음에는 선택 카드가 없다(그리드가 전체 높이)');

  // 다른 탭에서는 클래스가 붙지 않는다 — 목록·수령함은 지금처럼 모달이 스크롤된다.
  const active = new Market({ conflicted: false });
  active.view = 'active'; active.data = snapshot();
  assert(!hasClass(render(active, save), 'market-registering'));

  const css = readFileSync(new URL('../src/styles/market.css', import.meta.url), 'utf8');
  assert.match(css, /\.modal-dialog\.market-modal\.market-registering\s*\{[^}]*display:\s*flex[^}]*overflow:\s*hidden/);
  assert.match(css, /\.market-register \.market-register-grid\s*\{[^}]*flex:\s*1 1 auto[^}]*max-height:\s*none[^}]*overflow-y:\s*auto[^}]*align-content:\s*start/);
  assert.match(css, /\.market-register-detail\s*\{[^}]*flex:\s*0 0 auto[^}]*max-height:\s*60%[^}]*overflow-y:\s*auto/);
  // 사용자 확정(11-21): 판매 등록 칸은 한 줄에 **8칸**이다(간격은 4px로 좁혔다).
  assert.match(css, /\.market-register-grid\s*\{[^}]*grid-template-columns:\s*repeat\(8,/, '한 줄 8칸');
  assert.match(css, /\.market-register-grid\s*\{[^}]*gap:\s*4px/);
});

// 작업 253 — 판매 등록 그리드가 `flex: 1 1 auto`로 모달 높이를 채우면서, CSS Grid 기본값(`align-content: stretch`)이
// 자동 행을 늘려 줄 사이가 모달 높이만큼 벌어지던 문제. `align-content: start`가 없으면 회귀다.
test('판매 등록 물품 그리드는 줄(row)이 모달 높이만큼 늘어나지 않는다 — `align-content: start`(작업 253)', () => {
  const css = readFileSync(new URL('../src/styles/market.css', import.meta.url), 'utf8');
  const registerGrid = /\.market-register \.market-register-grid\s*\{([^}]*)\}/.exec(css);
  assert(registerGrid, '판매 등록 그리드 규칙이 있다');
  assert.match(registerGrid[1], /flex:\s*1 1 auto/, '모달 남은 높이를 채운다');
  assert.match(registerGrid[1], /align-content:\s*start/, '행을 위에서부터 쌓고 늘리지 않는다(`stretch` 아님)');
  assert.doesNotMatch(registerGrid[1], /align-content:\s*(stretch|normal)/, '`stretch`/`normal`로 돌아가면 줄 간격이 다시 벌어진다');
});

test('묶음 칸을 고르면 수량(최대 10개)·개당 가격 카드가 열리고 고른 수량만큼 itemIds로 등록한다(작업 249)', () => withDoc(() => {
  const save = freshSave();
  save.gold = 1000;
  save.bag = [book('b1'), book('b2'), book('b3')];
  const market = new Market({ conflicted: false });
  market.view = 'register'; market.data = snapshot();
  market.selectedItem = 'b1';
  let registered;
  market.act = async (action, data) => { registered = { action, data }; };
  const dialog = render(market, save);
  const detail = find(dialog, node => hasClass(node, 'market-register-detail'));
  assert(detail, '선택 카드는 그리드 아래 고정 바');
  assert.equal(find(detail, node => hasClass(node, 'market-pick-count-inline')).textContent, '보유 ×3');
  const inputs = find(detail, node => hasClass(node, 'market-register-inputs'));
  const quantity = find(inputs, node => node.tag === 'input' && node.max === '3');
  assert(quantity, '수량 입력 상한은 보유 3개');
  assert(find(detail, node => node.className === 'market-max-button'), '`최대` 버튼');
  assert(find(detail, node => node.textContent === '개당 가격 (금화)'), '개당 가격 입력');
  // 수량 2 + 개당 100 → 총액 200, 버튼 라벨이 `2개 묶음 등록`
  const price = find(inputs, node => node.tag === 'input' && node.max === '1000000000');
  price.value = '100'; price.oninput();
  quantity.value = '2'; quantity.oninput();
  const proceeds = find(detail, node => hasClass(node, 'market-proceeds'));
  assert.match(proceeds.children.join(' '), /총 2개/);
  assert.equal(market.quantity, '2');
  assert(find(detail, node => node.tag === 'button' && node.textContent === '2개 묶음 등록'), '묶음 등록 버튼');
  find(dialog, node => hasClass(node, 'market-register')).onsubmit({ preventDefault() {} });
  assert.equal(registered.action, 'register');
  assert.deepEqual(registered.data.itemIds, ['b1', 'b2'], '고른 2권만 보낸다');
  assert.equal(registered.data.price, 100, '개당 가격');
}));

test('보유 수량이 10개를 넘어도 한 번에 묶을 수 있는 수량은 10개까지다(작업 249)', () => withDoc(() => {
  const save = freshSave();
  save.gold = 1000;
  save.bag = Array.from({ length: 12 }, (unused, index) => book(`b${index}`));
  const market = new Market({ conflicted: false });
  market.view = 'register'; market.data = snapshot();
  market.selectedItem = 'b0';
  const dialog = render(market, save);
  const quantity = find(dialog, node => node.tag === 'input' && node.max !== '1000000000' && /^\d+$/.test(String(node.max ?? '')));
  assert.equal(quantity.max, '10', '입력 상한·`최대` 버튼 모두 min(보유, 10)');
  find(dialog, node => node.className === 'market-max-button').onclick();
  assert.equal(market.quantity, '10');
  assert.match(find(dialog, node => hasClass(node, 'market-notice')).textContent, /최대 10개/);
}));

test('묶음 매물은 `개당 N 골드 (총 N개)`로 보이고 상세에서 전체 구매·수량 구매를 고른다(작업 249)', () => withDoc(() => {
  const save = freshSave();
  save.gold = 1000;
  const sale = listing();
  const market = new Market({ conflicted: false });
  market.view = 'active'; market.data = snapshot({ listings: [sale], total: 1 });
  market.selected = sale;
  const calls = [];
  market.act = async (action, data) => { calls.push({ action, data }); };
  const dialog = render(market, save);
  const meta = find(dialog, node => hasClass(node, 'market-meta'));
  assert(find(meta, node => hasClass(node, 'market-unit-label')), '`개당` 라벨');
  assert.equal(find(meta, node => hasClass(node, 'market-bundle-count')).textContent, '총 3개');
  const box = find(dialog, node => hasClass(node, 'market-buy-quantity'));
  assert(box, '묶음 매물 상세에는 수량 상자가 있다');
  const whole = find(box, node => node.dataset.marketBuy === 'whole');
  const selected = find(box, node => node.dataset.marketBuy === 'selected');
  assert.match(whole.children.join(' '), /전체 구매 \(3개\)/);
  whole.onclick();
  assert.deepEqual(calls.at(-1), { action: 'buy', data: { listingId: 'l1', quantity: 3 } });
  const input = find(box, node => node.tag === 'input');
  input.value = '2'; input.oninput();
  assert.match(selected.children.join(' '), /선택 수량 구매 \(2개\)/);
  selected.onclick();
  assert.deepEqual(calls.at(-1), { action: 'buy', data: { listingId: 'l1', quantity: 2 } });

  // 수량 1짜리 단건 매물은 예전처럼 `구매 확정` 하나다.
  const single = new Market({ conflicted: false });
  const one = listing({ id: 'l2', quantity: 1 });
  single.view = 'active'; single.data = snapshot({ listings: [one], total: 1 });
  single.selected = one;
  single.act = async () => {};
  const singleDialog = render(single, save);
  assert(!find(singleDialog, node => hasClass(node, 'market-buy-quantity')), '단건 매물에는 수량 상자가 없다');
  assert(find(singleDialog, node => node.tag === 'button' && /구매 확정/.test(node.textContent)), '기존 구매 확정 버튼');
}));
