import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { renderMarket, setListingView, resetListingView } = await import('../src/ui/modals/marketModal.ts');
const { Market } = await import('../src/game/market.ts');
const { freshSave } = await import('../src/game/store.ts');

// 작업 257 — 판매 중 목록의 `전체`·`장비`·`스킬북` 서브 필터 탭과 4~5열 간편 보기 카드 그리드.
// 사용자 지시(`#8958`): "간편보기는 간편하지가 않아. 한 줄에 4~5개 표시돼도 되고 이미지를 크게 한 화면에
// 여러 개 볼 수 있게 해야 간편보기지" / "간편보기일 때 +1 표시가 이미지를 다 가려".

const gear = (id, overrides = {}) => ({ id, name: id, slot: 'weapon', rarity: 'rare', kind: 'equipment', stats: { attack: 10 }, ...overrides });
const book = (id, skillId = 'spin') => ({ id, name: `[스킬북] ${skillId}`, slot: 'skillbook', kind: 'skillbook', skillId, rarity: 'rare', stats: {} });
const listing = (id, item, overrides = {}) => ({
  id, item, price: 1000, quantity: 1, sellerName: '상인', state: 'active',
  createdAt: 1, expiresAt: Date.now() + 3_600_000, soldAt: null, mine: false, purchased: false, ...overrides
});
const snapshot = overrides => ({
  inbox: [], listings: [], watched: [], seq: 0, total: 0, page: 0, myActive: 0, revision: 0,
  rules: { fee: .05, maxListings: 30, durationHours: 72, maxPrice: 1_000_000_000, minPrice: 1, pageSize: 20, maxInbox: 30, maxBundle: 10 },
  ...overrides
});
function element(tag = 'div') {
  const node = {
    tag, children: [], dataset: {}, style: {}, className: '', textContent: '', attrs: {}, value: '', hidden: false, disabled: false, title: '', innerHTML: '',
    append(...children) { this.children.push(...children); },
    prepend(...children) { this.children.unshift(...children); },
    appendChild(child) { this.append(child); return child; },
    insertBefore(child, before) { const index = this.children.indexOf(before); if (index < 0) this.children.push(child); else this.children.splice(index, 0, child); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    scrollIntoView() {}
  };
  Object.defineProperty(node, 'lastElementChild', { get() { return this.children.at(-1); } });
  node.classList = {
    add(name) { if (!String(node.className).split(' ').includes(name)) node.className += ` ${name}`; },
    remove(name) { node.className = String(node.className).split(' ').filter(entry => entry && entry !== name).join(' '); },
    toggle(name, on = !String(node.className).split(' ').includes(name)) { if (on) this.add(name); else this.remove(name); }
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
const text = node => String(node.textContent ?? '') + (node.children ?? []).map(child => text(child)).join(' ');
globalThis.CSS ??= { escape: value => String(value) };
function withDoc(run) {
  const previous = globalThis.document; globalThis.document = { createElement: tag => element(tag) };
  try { return run(); } finally { globalThis.document = previous; }
}
function render(market, save = freshSave()) {
  return withDoc(() => {
    const dialog = element();
    renderMarket.call({ market, session: { guest: false }, world: { save }, root: { querySelector: () => null }, renderModal() {} }, dialog);
    return dialog;
  });
}
const activeMarket = (listings = [
  listing('gear-1', gear('강철 쯔바이핸드')),
  listing('book-1', book('b1', 'spin')),
  listing('gear-2', gear('룬 검', { rarity: 'epic', plus: 2 }), { price: 2500 })
]) => {
  const market = new Market({ conflicted: false });
  market.view = 'active';
  market.data = snapshot({ listings, total: listings.length });
  return market;
};

test('판매 중 목록 위에 전체·장비·스킬북 서브 필터 탭이 있고 고른 종류만 걸러 보여 준다(작업 257)', () => {
  resetListingView(); setListingView('detail');
  const market = activeMarket();
  const dialog = render(market);
  const bar = find(dialog, node => hasClass(node, 'market-kind-tabs'));
  assert(bar, '서브 필터 탭');
  assert.equal(bar.getAttribute('role'), 'tablist');
  const tabs = bar.children;
  assert.deepEqual(tabs.map(tab => tab.dataset.kind), ['all', 'equipment', 'skillbook']);
  assert.deepEqual(tabs.map(tab => find(tab, node => hasClass(node, 'market-kind-label')).textContent), ['전체', '장비', '스킬북']);
  assert.deepEqual(tabs.map(tab => find(tab, node => hasClass(node, 'market-kind-count')).textContent), ['3', '2', '1'], '이 페이지 건수');
  assert.deepEqual(tabs.map(tab => tab.getAttribute('aria-selected')), ['true', 'false', 'false']);
  assert(hasClass(tabs[0], 'active'));
  // 탭은 목록 본문(검색 폼·결과)보다 먼저 온다.
  const search = find(dialog, node => hasClass(node, 'market-search'));
  assert(dialog.children.indexOf(bar) < dialog.children.indexOf(search));

  // 장비만: 스킬북 매물이 목록에서 빠지고, 숨긴 수를 결과 줄에 알린다.
  tabs[1].onclick();
  assert.equal(market.kind, 'equipment');
  const gearDialog = render(market);
  const rows = all(gearDialog, node => hasClass(node, 'market-row')).filter(row => row.dataset.listing);
  assert.deepEqual(rows.map(row => row.dataset.listing), ['gear-1', 'gear-2']);
  assert.match(text(find(gearDialog, node => hasClass(node, 'market-result'))), /장비 필터로 1개 숨김/);
  assert.equal(find(gearDialog, node => hasClass(node, 'market-kind-tabs')).children[1].getAttribute('aria-selected'), 'true');

  // 스킬북만: 장비가 빠지고 스킬북 한 건만 남는다.
  market.kind = 'skillbook';
  const bookDialog = render(market);
  const bookRows = all(bookDialog, node => hasClass(node, 'market-row')).filter(row => row.dataset.listing);
  assert.deepEqual(bookRows.map(row => row.dataset.listing), ['book-1']);

  // `전체`로 돌아오면 모두 보인다.
  market.kind = 'all';
  assert.equal(all(render(market), node => hasClass(node, 'market-row')).filter(row => row.dataset.listing).length, 3);
  resetListingView();
});

test('필터로 걸러 이 페이지에 그 종류가 없으면 안내하고, 거래 완료·내 거래 탭에는 탭이 없다(작업 257)', () => {
  resetListingView(); setListingView('detail');
  const market = activeMarket([listing('gear-1', gear('강철 쯔바이핸드'))]);
  market.kind = 'skillbook';
  const dialog = render(market);
  assert.equal(all(dialog, node => hasClass(node, 'market-row')).filter(row => row.dataset.listing).length, 0);
  const empty = all(dialog, node => hasClass(node, 'empty')).find(node => /스킬북 매물이 없습니다/.test(text(node)));
  assert(empty, '스킬북이 없다는 안내와 전체로 돌아가는 방법');
  assert.match(text(empty), /전체/);

  for (const view of ['mine', 'recent', 'inbox']) {
    const other = new Market({ conflicted: false });
    other.view = view;
    other.data = snapshot({ listings: view === 'inbox' ? [] : [listing('x1', gear('내 검'), { mine: true })], myActive: 1 });
    assert(!find(render(other), node => hasClass(node, 'market-kind-tabs')), `${view} 탭에는 서브 필터가 없다`);
  }
  resetListingView();
});

test('간편 보기는 한 줄 4~5열 정사각형 아이콘 카드 그리드이고 가격만 남긴다(작업 257)', () => {
  resetListingView(); setListingView('compact');
  const market = activeMarket();
  const dialog = render(market);
  const grid = find(dialog, node => hasClass(node, 'market-compact-grid'));
  assert(grid, '카드 그리드');
  assert.equal(grid.children.length, 3);
  for (const card of grid.children) {
    assert(hasClass(card, 'market-card'), '카드는 버튼이다');
    assert.equal(card.tag, 'button');
    const art = find(card, node => hasClass(node, 'market-card-art'));
    assert(art, '아이콘 칸');
    const pic = find(art, node => hasClass(node, 'market-icon'));
    assert(pic, '아이콘은 아이콘 칸 안에');
    assert(find(card, node => hasClass(node, 'market-card-price')), '아래에 가격');
    assert(!find(card, node => hasClass(node, 'market-buy')), '상세/구매 버튼 없음');
    assert(!find(card, node => hasClass(node, 'market-compact-name')), '이름 글자 없음');
    assert(!find(card, node => hasClass(node, 'market-item-info')), '능력치 줄 없음');
  }

  // 묶음은 카드에 `×N`, 내 매물은 표시가 남는다.
  const bundled = activeMarket([listing('bundle', book('b2'), { quantity: 4, mine: true })]);
  const bundleCard = find(render(bundled), node => hasClass(node, 'market-card'));
  assert.equal(find(bundleCard, node => hasClass(node, 'market-card-count')).textContent, '×4');
  assert(hasClass(bundleCard, 'is-mine'));
  assert(find(bundleCard, node => hasClass(node, 'market-card-mine')), '내 매물 표시');

  // `+N`은 카드 아이콘 칸 모서리에 작게 붙고, 아이콘 요소 안에는 들어가지 않는다(이미지를 가리지 않게).
  const upgraded = activeMarket([listing('plus', gear('강철 쯔바이핸드', { plus: 3 }))]);
  const plusCard = find(render(upgraded), node => hasClass(node, 'market-card'));
  const art = find(plusCard, node => hasClass(node, 'market-card-art'));
  const badge = find(art, node => hasClass(node, 'item-plus-badge'));
  assert(badge, '카드 아이콘 칸에 +N 배지');
  assert.equal(badge.textContent, '+3');
  assert(!find(art, node => hasClass(node, 'market-icon') && find(node, child => child === badge)), '배지는 아이콘 안이 아니라 아이콘 칸에');
  resetListingView();
});

test('간편 보기 카드를 누르면 능력치·판매자·개당/총 수량과 구매 버튼이 있는 상세 팝업이 바로 뜬다(작업 257)', () => {
  resetListingView(); setListingView('compact');
  const save = freshSave();
  save.gold = 100_000;
  const market = activeMarket([listing('bundle', book('b2', 'spin'), { quantity: 3, price: 700 })]);
  const calls = [];
  market.act = async (action, data) => { calls.push({ action, data }); };
  const before = render(market);
  find(before, node => hasClass(node, 'market-card')).onclick();

  const dialog = render(market, save);
  const sheet = find(dialog, node => hasClass(node, 'market-sheet'));
  assert(sheet, '상세 팝업');
  assert.equal(sheet.getAttribute('role'), 'dialog');
  const head = find(sheet, node => hasClass(node, 'market-sheet-head'));
  assert(find(head, node => hasClass(node, 'market-icon')), '팝업 아이콘');
  assert.match(text(find(head, node => hasClass(node, 'market-sheet-sub'))), /판매자 상인/);
  const price = find(head, node => hasClass(node, 'market-sheet-price'));
  assert.match(text(price), /개당/);
  assert.match(text(price), /총 3개/);
  // 묶음 구매는 팝업 안에서 전체/선택 수량으로 바로 고른다.
  const box = find(sheet, node => hasClass(node, 'market-buy-quantity'));
  assert(box, '전체/선택 수량 구매');
  find(box, node => node.dataset.marketBuy === 'whole').onclick();
  assert.deepEqual(calls.at(-1), { action: 'buy', data: { listingId: 'bundle', quantity: 3 } });

  // 바깥을 누르면 닫힌다.
  sheet.onclick({ target: sheet });
  assert.equal(market.selected, undefined);
  resetListingView();
});

test('카드 그리드·서브 필터·`+N` 배지 CSS 계약(작업 257)', () => {
  const css = readFileSync(new URL('../src/styles/market.css', import.meta.url), 'utf8');
  const rule = selector => { const spaced = css.indexOf(`${selector} {`), tight = css.indexOf(`${selector}{`); const index = spaced >= 0 ? spaced : tight; return index < 0 ? '' : css.slice(index, css.indexOf('}', index)); };
  assert.match(rule('.market-compact-grid'), /grid-template-columns: repeat\(auto-fill, minmax\(76px, 1fr\)\)/, '한 줄에 폭에 따라 4~5칸');
  assert.match(rule('.market-card-art'), /aspect-ratio: 1/, '정사각형 아이콘 칸');
  assert.match(rule('.market-card .market-icon'), /inset: 6px/, '아이콘을 칸에 꽉 차게 크게');
  assert.match(rule('.market-card .item-plus-badge'), /font-size: 7\.5px/, '+N은 작게');
  assert.match(rule('.market-card .item-plus-badge'), /padding: 0 1px/);
  assert.match(rule('.market-card .item-plus-badge'), /left: 1px/);
  assert.match(rule('.market-card .item-plus-badge'), /bottom: 1px/, '왼쪽 아래 모서리');
  assert.match(rule('.market-card-price'), /font-size: 10px/, '카드에는 가격만');
  assert.match(rule('.market-kind-tabs'), /display: flex/);
  assert.match(rule('.market-sheet'), /position: fixed/, '상세 팝업은 모달 위에 고정');
  assert.match(rule('.market-sheet'), /z-index: 60/);
  assert.equal(css.includes('.market-row-compact'), false, '옛 한 줄 간편 보기 규칙은 남기지 않는다');
  assert.equal(css.includes('.market-compact-name'), false);
});
