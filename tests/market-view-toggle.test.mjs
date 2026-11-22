import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
import { readFileSync } from 'node:fs';
const { renderMarket, loadListingView, saveListingView, setListingView, currentListingView, resetListingView, MARKET_LISTING_VIEW_KEY } = await import('../src/ui/modals/marketModal.ts');
const { Market } = await import('../src/game/market.ts');
const { freshSave } = await import('../src/game/store.ts');

// 작업 248 — 거래소 상단 헤더(제목 왼쪽·금화는 닫기 왼쪽), 인덱스 탭, 판매 중 탭 간편/상세 보기.

const sword = (id, rarity = 'rare') => ({ id, name: id, slot: 'weapon', rarity, stats: { attack: 10 } });
const listing = (id, item, price = 1000) => ({ id, item, price, sellerName: '상인', state: 'active', expiresAt: Date.now() + 3_600_000, mine: false, purchased: false });
const snapshot = overrides => ({
  inbox: [], listings: [], watched: [], seq: 0, total: 0, page: 0, myActive: 0, revision: 0,
  rules: { fee: .05, maxListings: 30, durationHours: 72, maxPrice: 1_000_000_000, minPrice: 1, pageSize: 20, maxInbox: 30 },
  ...overrides
});
function element(tag = 'div') {
  const node = {
    tag, children: [], dataset: {}, style: {}, className: '', textContent: '', attrs: {}, value: '', hidden: false, disabled: false, title: '',
    append(...children) { this.children.push(...children); },
    prepend(...children) { this.children.unshift(...children); },
    insertBefore(child, before) { const index = this.children.indexOf(before); if (index < 0) this.children.push(child); else this.children.splice(index, 0, child); },
    appendChild(child) { this.append(child); return child; },
    replaceChildren(...children) { this.children = children; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  Object.defineProperty(node, 'lastElementChild', { get() { return this.children.at(-1); } });
  node.classList = { add(name) { node.className += ` ${name}`; }, toggle(name, on) { if (on) this.add(name); } };
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

function uiFor(market, save = freshSave()) {
  return { market, session: { guest: false }, world: { save }, root: { querySelector: () => null }, renderModal() {} };
}
function render(market, save, dialog = element()) {
  const previous = globalThis.document, previousCss = globalThis.CSS;
  globalThis.document = { createElement: tag => element(tag) };
  globalThis.CSS = { escape: value => String(value) };
  try { renderMarket.call(uiFor(market, save), dialog); return dialog; } finally { globalThis.document = previous; globalThis.CSS = previousCss; }
}
const activeMarket = () => {
  const market = new Market({ conflicted: false });
  market.view = 'active';
  market.data = snapshot({ listings: [listing('l1', sword('강철 쯔바이핸드'), 1200), listing('l2', sword('낡은 검', 'common'), 300)], total: 2 });
  return market;
};

test('판매 중 탭은 간편/상세 보기 아이콘 토글을 보여 주고 선택은 기기에 남긴다(작업 248)', () => {
  const writes = [];
  const storage = { getItem: key => (key === MARKET_LISTING_VIEW_KEY ? writes.at(-1) ?? null : null), setItem: (key, value) => writes.push(value) };
  assert.equal(loadListingView({ getItem: () => null }), 'detail', '기본은 상세 보기');
  assert.equal(loadListingView({ getItem: () => 'compact' }), 'compact');
  assert.equal(loadListingView({ getItem: () => '이상한 값' }), 'detail');
  assert.equal(loadListingView({ getItem() { throw new Error('blocked'); } }), 'detail', '저장소가 막혀도 상세 보기');
  saveListingView('compact', storage);
  assert.deepEqual(writes, ['compact']);
  assert.equal(loadListingView(storage), 'compact');
  assert.doesNotThrow(() => saveListingView('detail', { setItem() { throw new Error('blocked'); } }));

  resetListingView();
  setListingView('detail');
  const bar = find(render(activeMarket()), node => hasClass(node, 'market-view-toggle'));
  assert(bar, '토글이 있다');
  const buttons = bar.children;
  assert.deepEqual(buttons.map(button => button.getAttribute('aria-label')), ['간편 보기', '상세 보기']);
  assert.equal(buttons[0].children.find(child => child.tag === 'img').src, '/assets/icons/market-view-compact.png');
  assert.equal(buttons[1].children.find(child => child.tag === 'img').src, '/assets/icons/market-view-detail.png');
  assert.deepEqual(buttons.map(button => button.getAttribute('aria-pressed')), ['false', 'true'], '상세 보기가 켜져 있다');
  assert(hasClass(buttons[1], 'is-on'));
  buttons[0].onclick();
  assert.equal(currentListingView(), 'compact');
  assert.deepEqual(writes.at(-1), 'compact', '누르면 localStorage에 남긴다');
  resetListingView();
  setListingView('detail');
});

test('간편 보기는 아이콘·가격만 있는 카드 그리드이고 카드를 누르면 상세 팝업이 뜬다(작업 248→257)', () => {
  setListingView('detail');
  const detailDialog = render(activeMarket());
  const detailRows = all(detailDialog, node => hasClass(node, 'market-row'));
  assert.equal(detailRows.length, 2);
  assert(detailRows.every(row => !hasClass(row, 'market-card')));
  assert(find(detailRows[0], node => hasClass(node, 'market-item-info')), '상세 보기는 능력치 줄을 보여 준다');

  setListingView('compact');
  const market = activeMarket();
  const compactDialog = render(market);
  const grid = find(compactDialog, node => hasClass(node, 'market-compact-grid'));
  assert(grid, '간편 보기는 카드 그리드');
  assert.equal(grid.children.length, 2, '매물마다 카드 한 장');
  const first = grid.children[0];
  assert.equal(first.dataset.listing, 'l1');
  assert(hasClass(first, 'market-card'));
  assert(hasClass(first, 'rarity-rare'), '등급 테두리');
  assert(find(first, node => hasClass(node, 'market-card-art')), '정사각형 아이콘 칸');
  assert(find(first, node => hasClass(node, 'market-icon')), '아이콘');
  assert(find(first, node => hasClass(node, 'market-card-price')), '가격만');
  assert(!find(first, node => hasClass(node, 'market-buy')), '카드에 상세/구매 버튼이 없다');
  assert(!find(first, node => hasClass(node, 'market-compact-name')), '이름 글자도 카드에 없다(툴팁·팝업)');
  assert(!find(first, node => hasClass(node, 'market-item-info')), '간편 보기 카드에는 능력치·추가옵션이 없다');

  // 카드를 누르면 그 매물의 상세 팝업이 즉시 뜬다(구매 확정은 여기서).
  first.onclick();
  assert.equal(market.selected?.id, 'l1');
  const expanded = render(market);
  const sheet = find(expanded, node => hasClass(node, 'market-sheet'));
  assert(sheet, '카드를 누르면 상세 팝업');
  assert(find(sheet, node => hasClass(node, 'market-sheet-head')), '팝업 머리(아이콘·이름·판매자·가격)');
  assert.match(find(sheet, node => hasClass(node, 'market-sheet-sub')).textContent, /판매자 상인/);
  const detail = find(sheet, node => hasClass(node, 'market-detail'));
  assert(detail, '상세 본문');
  assert(find(detail, node => String(node.textContent).includes('구매 확정')));
  assert.equal(all(expanded, node => hasClass(node, 'market-detail')).length, 1, '고른 매물 하나만');
  // 닫기를 누르면 팝업이 사라진다.
  find(sheet, node => hasClass(node, 'market-sheet-close')).onclick();
  assert.equal(market.selected, undefined);
  setListingView('detail');
});

test('거래소 머리는 제목을 왼쪽에, 금화를 닫기(×) 바로 왼쪽에 두고 탭은 인덱스 탭이다(작업 248)', () => {
  const market = activeMarket();
  const dialog = element();
  const head = element('header'), title = element('h2'), close = element('button');
  title.textContent = '거래소'; close.className = 'modal-close';
  head.append(title, close);
  head.querySelector = selector => (selector === 'h2' ? title : selector === '.modal-close' ? close : null);
  dialog.append(head);
  dialog.querySelector = selector => (selector === ':scope > header' ? head : null);
  render(market, freshSave(), dialog);

  assert.equal(title.textContent, '황야의 거래소', '제목은 모달 왼쪽 위');
  assert(hasClass(head, 'market-head'));
  const gold = head.children.find(child => hasClass(child, 'market-head-gold'));
  assert(gold, '보유 금화가 머리 줄에 있다');
  assert.equal(head.children.indexOf(gold), head.children.indexOf(close) - 1, '금화는 닫기 바로 왼쪽');
  assert.equal(head.children[0], title, '제목이 맨 왼쪽');

  const tabs = find(dialog, node => hasClass(node, 'market-index-tabs'));
  assert(tabs, '인덱스 탭');
  assert(hasClass(tabs, 'market-tabs'), '옛 클래스도 유지(다른 화면·테스트 계약)');
  assert.equal(tabs.children.length, 5);
  assert(tabs.children.every(tab => hasClass(tab, 'market-index-tab')));
  assert.deepEqual(tabs.children.map(tab => tab.getAttribute('aria-selected')), ['true', 'false', 'false', 'false', 'false']);
  assert(hasClass(tabs.children[0], 'active'));
  // 탭은 제목(머리) 바로 뒤, 본문보다 먼저 온다.
  assert.equal(dialog.children.indexOf(tabs), dialog.children.indexOf(head) + 1);
});

test('간편 보기는 판매 중 탭에만 적용된다 — 내 거래·수령함은 그대로(작업 248)', () => {
  setListingView('compact');
  const mine = new Market({ conflicted: false });
  mine.view = 'mine';
  mine.data = snapshot({ listings: [{ ...listing('m1', sword('내 검')), mine: true }], total: 1, myActive: 1 });
  const dialog = render(mine);
  assert.equal(all(dialog, node => hasClass(node, 'market-card')).length, 0, '내 거래는 상세 카드');
  assert(!find(dialog, node => hasClass(node, 'market-view-toggle')), '토글도 판매 중 탭에만');
  setListingView('detail');
});

test('판매 등록 칸은 가방처럼 정사각형 아이콘 칸이고 배지는 절대 위치다(작업 248)', () => {
  const css = readFileSync(new URL('../src/styles/market.css', import.meta.url), 'utf8');
  const rule = selector => { const spaced = css.indexOf(`${selector} {`), tight = css.indexOf(`${selector}{`); const index = spaced >= 0 ? spaced : tight; return index < 0 ? '' : css.slice(index, css.indexOf('}', index)); };
  assert.match(rule('.market-modal .market-pick'), /aspect-ratio: 1/, '정사각형 칸');
  assert.match(rule('.market-modal .market-pick'), /position: relative/);
  assert.equal(css.includes('.market-pick-name'), false, '이름 글자 규칙 자체가 없다');
  assert.match(rule('.market-pick .job-badge'), /position: absolute/);
  // 작업 249: 한 줄 8칸으로 늘리면서 배지·화살표를 칸 모서리에 더 바짝 붙이고 조금 줄였다.
  // 등급 배지 `L`·`U`·`E`가 왼쪽 위를 차지하므로(2026-11-21) 직업 배지는 **오른쪽 아래 한 글자**로 비켰다.
  assert.match(rule('.market-pick .job-badge'), /right: 1px/);
  assert.match(rule('.market-pick .job-badge'), /bottom: 1px/);
  assert.match(rule('.market-pick .upgrade-arrow'), /top: 1px/);
  assert.match(rule('.market-pick .upgrade-arrow'), /right: 2px/);
  assert.match(rule('.market-pick .upgrade-arrow'), /width: 8px/);
  assert.match(rule('.market-pick .upgrade-arrow'), /height: 8px/, '원본 크기에 끌려 커지지 않는다');
  assert.match(rule('.market-pick-count'), /position: absolute/);
  // 묶음 수량도 오른쪽 위로 — 오른쪽 아래는 직업 배지 자리다.
  assert.match(rule('.market-pick-count'), /top: 1px/);
  assert.match(rule('.market-pick-count'), /bottom: auto/);
  assert.match(rule('.market-pick-count'), /right: 2px/);
  assert.match(rule('.market-pick .lock-icon'), /position: absolute/);

  // 실제 칸: 이름 노드 없이 아이콘·배지만, 이름은 툴팁에.
  const save = freshSave();
  save.bag = [
    { id: 'book-1', name: '공격의 서', slot: 'statbook', kind: 'statbook', book: 'attack', rarity: 'unique', stats: {} },
    { id: 'book-2', name: '공격의 서', slot: 'statbook', kind: 'statbook', book: 'attack', rarity: 'unique', stats: {} },
    { id: 'gear-1', name: '강철 쯔바이핸드', slot: 'weapon', rarity: 'epic', stats: { attack: 40 }, plus: 3 }
  ];
  const market = new Market({ conflicted: false });
  market.view = 'register'; market.data = snapshot();
  market.selectItem = async () => {};
  const dialog = render(market, save);
  const grid = find(dialog, node => hasClass(node, 'market-register-grid'));
  assert(grid);
  const cells = grid.children;
  assert.equal(cells.length, 2, '같은 책 2권은 한 칸, 장비 한 칸');
  for (const cell of cells) {
    assert.equal(String(cell.textContent).includes('공격의 서'), false, '책 이름 글자 라벨이 없다');
    assert.equal(String(cell.textContent).includes('강철 쯔바이핸드'), false, '이름 글자가 없다');
    assert(cell.title.includes('전용') || cell.title.includes('유니크') || cell.title.includes('에픽'), '툴팁으로 알린다');
    assert(find(cell, node => hasClass(node, 'market-icon')), '아이콘만');
  }
  const gearCell = cells.find(cell => cell.dataset.itemId === 'gear-1');
  assert(find(gearCell, node => hasClass(node, 'item-plus-badge')), '+N 배지');
  assert(find(gearCell, node => hasClass(node, 'upgrade-arrow')), '추천 화살표는 칸에 붙는다');
  const bookCell = cells.find(cell => cell.dataset.itemId === 'book-1');
  assert(find(bookCell, node => hasClass(node, 'market-pick-count')), '×N 배지');
});
