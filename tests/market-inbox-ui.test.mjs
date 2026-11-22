import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { renderMarket, updateMarketNavDot } = await import('../src/ui/modals/marketModal.ts');
const { Market, MARKET_VIEWS } = await import('../src/game/market.ts');
const { freshSave } = await import('../src/game/store.ts');

const sword = (id, rarity = 'rare') => ({ id, name: id, slot: 'weapon', rarity, stats: { attack: 10 } });
const book = (id, kind = 'attack', rarity = 'unique') => ({ id, name: { attack: '공격의 서', defense: '방어의 서', health: '체력의 서' }[kind], slot: 'statbook', kind: 'statbook', book: kind, rarity, stats: {} });
const pouch = id => ({ id, name: '무작위 보물 주머니', slot: 'pouch', kind: 'pouch', rarity: 'unique', stats: {} });
const snapshot = overrides => ({
  inbox: [], listings: [], watched: [], seq: 0, total: 0, page: 0, myActive: 0, revision: 0,
  rules: { fee: .05, maxListings: 30, durationHours: 72, maxPrice: 1_000_000_000, minPrice: 1, pageSize: 20, maxInbox: 30 },
  ...overrides
});
function element(tag = 'div') {
  const node = {
    tag, children: [], dataset: {}, style: {}, className: '', textContent: '', attrs: {}, value: '', hidden: false,
    append(...children) { this.children.push(...children); },
    prepend(...children) { this.children.unshift(...children); },
    appendChild(child) { this.append(child); return child; },
    replaceChildren(...children) { this.children = children; },
    setAttribute(k, v) { this.attrs[k] = v; },
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
  return { market, session: { guest: false }, world: { save }, root: { querySelector: () => null } };
}
function render(market, save) {
  const previous = globalThis.document; globalThis.document = { createElement: tag => element(tag) };
  try {
    const dialog = element();
    renderMarket.call(uiFor(market, save), dialog);
    return dialog;
  } finally { globalThis.document = previous; }
}

test('거래소 상단 탭에서 `거래 완료`가 사라지고 수령함이 `N/30`과 빨간 점으로 표시된다(작업 247)', () => {
  const market = new Market({ conflicted: false, pendingMarket: undefined });
  market.data = snapshot({ inbox: [{ id: 'd1', item: null, gold: 100, reason: '판매대금', createdAt: 1 }] });
  const tabs = find(render(market), node => hasClass(node, 'market-tabs'));
  const labels = tabs.children.map(tab => find(tab, node => hasClass(node, 'market-tab-label'))?.textContent);
  assert.deepEqual(labels, ['판매 중', '최근 거래', '내 거래', '판매 등록', '수령함 1/30']);
  assert(!labels.includes('거래 완료'), '거래 완료 탭은 없다');
  const inboxTab = tabs.children.at(-1);
  assert.equal(inboxTab.dataset.marketView, 'inbox');
  assert.equal(find(inboxTab, node => hasClass(node, 'market-inbox-dot')).hidden, false, '받을 것이 있으면 빨간 점');
  // 수령함이 비면 점도 꺼지고 라벨이 0/30이 된다.
  const empty = new Market({ conflicted: false });
  empty.data = snapshot();
  const emptyTabs = find(render(empty), node => hasClass(node, 'market-tabs'));
  const emptyInbox = emptyTabs.children.at(-1);
  assert.equal(find(emptyInbox, node => hasClass(node, 'market-tab-label')).textContent, '수령함 0/30');
  assert.equal(find(emptyInbox, node => hasClass(node, 'market-inbox-dot')).hidden, true);
});

test('옛 `sold` 탭 상태는 `active`로 안전 폴백한다(작업 247)', () => {
  assert(!MARKET_VIEWS.includes('sold'));
  const market = new Market({ conflicted: false });
  let loads = 0; market.load = () => { loads++; };
  market.switch('sold');
  assert.equal(market.view, 'active');
  assert.equal(loads, 1);
  market.switch('recent');
  assert.equal(market.view, 'recent');
});

test('`내 거래`의 `판매 중인 물건만 보기`는 오른쪽 줄에 붙고 켜면 필터가 갱신된다(작업 247)', () => {
  const market = new Market({ conflicted: false });
  market.view = 'mine'; market.data = snapshot({ myActive: 2 });
  let refreshed = 0; market.refresh = () => { refreshed++; };
  const dialog = render(market);
  const bar = find(dialog, node => hasClass(node, 'market-mine-bar'));
  assert(bar, '오른쪽 정렬 줄(`.market-mine-bar`)');
  const label = find(bar, node => hasClass(node, 'market-mine-filter'));
  assert.equal(label.textContent, '판매 중인 물건만 보기');
  const check = label.children[0];
  assert.equal(check.checked, false);
  check.checked = true; check.onchange();
  assert.equal(market.mineActiveOnly, true);
  assert.equal(refreshed, 1);
  // 다른 탭에는 이 토글이 없다.
  const active = new Market({ conflicted: false });
  active.view = 'active'; active.data = snapshot();
  assert(!find(render(active), node => hasClass(node, 'market-mine-filter')));
});

test('판매 등록 칸은 작은 그리드로 그려지고 같은 영구 스탯북은 한 칸 `×N`으로 묶인다(작업 247 → 파트 B)', () => {
  const save = freshSave();
  save.bag = [book('b1', 'attack'), book('b2', 'attack'), sword('w1'), pouch('p1')];
  const market = new Market({ conflicted: false });
  market.view = 'register'; market.data = snapshot();
  const picked = []; market.selectItem = async item => { picked.push(item.id); };
  const dialog = render(market, save);
  const grid = find(dialog, node => hasClass(node, 'market-register-grid'));
  assert(grid, '판매 등록 그리드');
  assert.equal(grid.children.length, 2, '같은 책 2권은 한 칸, 장비 1칸(주머니는 팔 수 없다)');
  const badges = grid.children.flatMap(cell => all(cell, node => hasClass(node, 'market-pick-count')));
  assert.deepEqual(badges.map(node => node.textContent), ['×2']);
  // 칸을 누르면 그 묶음의 첫 아이템으로 가격 입력 폼이 열린다(등록은 1개씩).
  const bookCell = grid.children.find(cell => cell.dataset.itemId === 'b1');
  bookCell.onclick();
  assert.deepEqual(picked, ['b1']);
  // [작업 248] 칸에는 이름 글자가 없다 — 이름·등급은 툴팁으로만 알린다(가방처럼 정사각형 아이콘 칸).
  assert(!find(bookCell, node => hasClass(node, 'market-pick-name')));
  assert.match(bookCell.title ?? '', /2개/);
  assert.equal(bookCell.attrs['aria-label'], '공격의 서 · 유니크 · 2개 판매 선택');
  assert(find(bookCell, node => hasClass(node, 'market-pick-count')), '×2는 절대 위치 배지');
});

test('거래소 아이콘 빨간 점은 더 최근에 확인한 수령함 값을 쓴다(작업 247)', () => {
  const dot = { hidden: true };
  const ui = { market: { inboxCount: undefined, inboxAt: 0 }, journey: { data: { marketInbox: 2 }, inboxAt: 1 }, root: { querySelector: () => dot } };
  updateMarketNavDot(ui);
  assert.equal(dot.hidden, false, '거래소 창을 열기 전에는 여정 폴링 값으로 켠다');
  // 거래소가 더 최근에 확인했고 비어 있으면(수령 직후) 바로 끈다.
  ui.market = { inboxCount: 0, inboxAt: 2 };
  updateMarketNavDot(ui);
  assert.equal(dot.hidden, true);
  // 다시 여정 폴링이 새 배달을 알리면 켠다.
  ui.journey.inboxAt = 3;
  updateMarketNavDot(ui);
  assert.equal(dot.hidden, false);
  // 0건이면 꺼진 채로 남는다.
  ui.journey.data.marketInbox = 0;
  updateMarketNavDot(ui);
  assert.equal(dot.hidden, true);
});
