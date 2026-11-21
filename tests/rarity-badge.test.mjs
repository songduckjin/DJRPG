import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { jobShortNames, jobNames } = await import('../src/game/skills.ts');
const { rarityBadgeMarkup, rarityBadgeNode, appendRarityBadge, hasRarityBadge, rarityBadgeLetter, RARITY_BADGE_CLASS, RARITY_BADGE_POSITION } = await import('../src/ui/rarityBadge.ts');
const { renderInventory } = await import('../src/ui/modals/equipModal.ts');

/**
 * 등급 배지 `L`·`U`·`E` (2026-11-21 사용자 확정 B안 '필 배지').
 *
 * 사용자 요청: "템 오른쪽 상단에 초록색 화살표 뜨니까 왼쪽 위에는 같은 규격으로 레전드는 L,
 * 유니크는 U, 에픽은 E 이렇게 표시를 해줘". 두 번째 요구는 **좌상단 타직업 배지(`.job-badge`)와
 * 절대 겹치지 않게** 하는 것 — 좁은 칸에서는 직업 배지가 오른쪽 아래로 비키고 한 글자가 된다.
 */
const gear = (id, rarity, slot = 'weapon', extra = {}) => ({ id, name: `시험 장비 ${id}`, slot, rarity, stats: { attack: 10 }, plus: 0, ...extra });
const book = id => ({ id, name: '[스킬북] 더블 샷', slot: 'skillbook', kind: 'skillbook', skillId: 'doubleShot', rarity: 'rare', stats: {} });
const pouch = id => ({ id, name: '보물 주머니', slot: 'pouch', kind: 'pouch', rarity: 'rare', count: 1, stats: {} });

test('전설·유니크·에픽 장비에만 L·U·E — 일반·매직·레어·스킬북·주머니는 배지가 없다', () => {
  assert.equal(rarityBadgeLetter(gear('l', 'legendary')), 'L');
  assert.equal(rarityBadgeLetter(gear('u', 'unique')), 'U');
  assert.equal(rarityBadgeLetter(gear('e', 'epic')), 'E');
  assert.equal(rarityBadgeLetter(gear('c', 'common')), undefined);
  assert.equal(rarityBadgeLetter(gear('m', 'magic')), undefined);
  assert.equal(rarityBadgeLetter(gear('r', 'rare')), undefined);
  assert.equal(hasRarityBadge(book('b')), false, '스킬북은 등급 배지를 달지 않는다');
  assert.equal(hasRarityBadge(pouch('p')), false, '보물 주머니도 달지 않는다');
  assert.equal(rarityBadgeMarkup(undefined), '');
  assert.equal(rarityBadgeMarkup(gear('c', 'common')), '');
  assert.equal(RARITY_BADGE_POSITION.left, '2px');
  assert.equal(RARITY_BADGE_POSITION.top, '2px');
});

test('배지 마크업은 등급 글자·등급색 클래스·툴팁을 함께 낸다', () => {
  const legendary = rarityBadgeMarkup(gear('l', 'legendary'));
  assert.match(legendary, new RegExp(`class="${RARITY_BADGE_CLASS} rarity-legendary"`));
  assert.match(legendary, />L</);
  assert.match(legendary, /title="레전드 등급"/);
  assert.match(legendary, /aria-hidden="true"/);
  assert.match(rarityBadgeMarkup(gear('u', 'unique')), /rarity-unique/);
  assert.match(rarityBadgeMarkup(gear('e', 'epic')), /rarity-epic/);
});

test('rarityBadgeNode·appendRarityBadge — 요소로 붙이고 배지 없는 아이템에는 붙이지 않는다', () => {
  const previous = globalThis.document;
  try {
    globalThis.document = { createElement: () => ({ className: '', textContent: '', title: '', attrs: {}, setAttribute(name, value) { this.attrs[name] = value; } }) };
    const node = rarityBadgeNode(gear('u', 'unique'));
    assert.equal(node.className, `${RARITY_BADGE_CLASS} rarity-unique`);
    assert.equal(node.textContent, 'U');
    assert.equal(node.attrs['aria-hidden'], 'true');
    assert.equal(rarityBadgeNode(gear('r', 'rare')), null);
    const host = { children: [], append(child) { this.children.push(child); } };
    assert.equal(appendRarityBadge(host, gear('e', 'epic')), true);
    assert.equal(host.children.length, 1);
    assert.equal(appendRarityBadge(host, gear('r', 'rare')), false);
    assert.equal(host.children.length, 1);
  } finally { globalThis.document = previous; }
});

// ── 화면 ────────────────────────────────────────────────────────────────────
function element(tag = 'div') {
  const node = {
    tag, children: [], dataset: {}, style: { vars: {}, setProperty(key, value) { this.vars[key] = value; } }, className: '', textContent: '', innerHTML: '', title: '', attrs: {}, hidden: false, disabled: false, offsetWidth: 1,
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
    appendChild(child) { this.append(child); return child; },
    replaceChildren(...children) { this.children = []; this.append(...children); }, setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) { return this.attrs[key]; },
    remove() { const parent = this.parent; if (!parent) return; const index = parent.children.indexOf(this); if (index >= 0) parent.children.splice(index, 1); this.parent = undefined; },
    addEventListener() {}, querySelectorAll() { return []; }
  };
  node.classList = { add(name) { node.className += ` ${name}`; }, remove(name) { node.className = node.className.replace(new RegExp(`(^|\\s)${name}(?=\\s|$)`), ' '); }, toggle(name, on) { if (on) this.add(name); } };
  return node;
}
function find(node, test) { if (!node || typeof node !== 'object') return undefined; if (test(node)) return node; for (const child of node.children ?? []) { const hit = find(child, test); if (hit) return hit; } return undefined; }

test('가방 칸: 등급 배지는 왼쪽 위에 붙고, 직업 배지는 한 글자로 오른쪽 아래 요소다', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = freshSave('male', 'warrior');
    save.bag = [
      gear('legend', 'legendary', 'weapon', { job: 'warrior' }),
      gear('plain', 'common', 'weapon', { job: 'warrior' }),
      book('b1'),
      pouch('p1')
    ];
    const ui = { world: { save, onChange() {} }, selected: undefined, bagFilter: 'all', bagRaritySort: false, bagJobOnly: false, salvageRarity: 'common', autoSalvage: false, salvagePlus: 4, openModal: 'equipment', modal: element(), renderModal() {}, message() {}, iconPath() { return ''; } };
    const dialog = element();
    renderInventory.call(ui, dialog);
    const grid = find(dialog, node => node.className?.includes('bag-grid'));
    const cell = id => grid.children.find(node => node.dataset?.itemId === id);
    const legendary = cell('legend');
    assert.match(legendary.innerHTML, /class="rarity-badge rarity-legendary"/, '왼쪽 위 등급 배지');
    assert.match(legendary.innerHTML, />L</);
    assert.doesNotMatch(cell('plain').innerHTML, /rarity-badge/, '일반 등급은 배지 없음');
    assert.doesNotMatch(cell('b1').innerHTML, /rarity-badge/, '스킬북은 배지 없음');
    assert.doesNotMatch(cell('p1').innerHTML, /rarity-badge/, '주머니는 배지 없음');
    // 직업 배지 — 좁은 칸에서는 한 글자이고, 전체 이름은 툴팁에 남는다.
    const jobBadge = legendary.children.find(node => String(node.className).startsWith('job-badge'));
    assert.ok(jobBadge, '직업 전용 장비에는 직업 배지가 붙는다');
    assert.equal(jobBadge.textContent, jobShortNames.warrior);
    assert.equal(jobBadge.textContent, '전');
    assert.equal(jobBadge.title, `${jobNames.warrior} 전용`);
    // 읽기 문구는 등급·직업 전체 이름을 그대로 밝힌다.
    assert.match(legendary.attrs['aria-label'], /레전드/);
    assert.match(legendary.attrs['aria-label'], /전사 전용/);
  } finally { globalThis.document = previous; }
});

test('CSS — 등급 배지는 왼쪽 위 2px·9px 굵은 글자·어두운 알약·1px 등급색 테두리', () => {
  const css = modalStyles();
  const market = readFileSync(new URL('../src/styles/market.css', import.meta.url), 'utf8');
  const index = css.indexOf(`.${RARITY_BADGE_CLASS} {`);
  assert.notEqual(index, -1, '등급 배지 규칙이 없다');
  const rule = css.slice(index, css.indexOf('}', index) + 1);
  assert.match(rule, /position: absolute/);
  assert.match(rule, /left: 2px/);
  assert.match(rule, /top: 2px/);
  assert.match(rule, /z-index: 3/);
  assert.match(rule, /font-size: 9px/);
  assert.match(rule, /line-height: 1/);
  assert.match(rule, /font-weight: 800/);
  assert.match(rule, /padding: 0 2px/);
  assert.match(rule, /border-radius: 3px/);
  assert.match(rule, /background: #120f14cc/);
  assert.match(rule, /border: 1px solid currentColor/);
  assert.match(rule, /pointer-events: none/);
  // 등급색은 새로 적지 않고 기존 `.rarity-*` 유틸리티 색을 쓴다.
  assert.match(market, /\.rarity-legendary \{ color: #f87171; \}/);
  assert.match(market, /\.rarity-unique \{ color: #fb923c; \}/);
  assert.match(market, /\.rarity-epic \{ color: #c084fc; \}/);
  // 칸들은 절대 위치의 기준 상자다.
  assert.match(css, /\.bag-item \{[^}]*position: relative/);
  assert.match(css, /\.equipment-slot \{[^}]*position: relative/);
  assert.match(market, /\.market-pick \{ position: relative; \}/);
  assert.match(market, /\.market-card-art \{ position: relative; /);
});

test('CSS — 좁은 칸에서 직업 배지는 오른쪽 아래 한 글자, 스킬북 `×N`은 오른쪽 위로 비켜난다', () => {
  const css = modalStyles();
  const market = readFileSync(new URL('../src/styles/market.css', import.meta.url), 'utf8');
  const bagJob = css.indexOf('.bag-item .job-badge {');
  assert.notEqual(bagJob, -1);
  const rule = css.slice(bagJob, css.indexOf('}', bagJob) + 1);
  assert.match(rule, /right: 1px/);
  assert.match(rule, /bottom: 1px/);
  assert.match(rule, /left: auto/);
  assert.match(rule, /top: auto/);
  assert.match(rule, /font-size: 8px/);
  // 잠금 배지가 오른쪽 아래로 내려오는 칸(추천 + 잠금)에서만 직업 배지를 감춘다 — 겹치지 않게.
  assert.match(css, /\.bag-item\.has-upgrade:has\(\.bag-lock-badge\) \.job-badge \{ display: none; \}/);
  // 거래소 판매 등록 칸도 같은 자리.
  const pickJob = market.indexOf('.market-pick .job-badge {');
  assert.notEqual(pickJob, -1);
  const pickRule = market.slice(pickJob, market.indexOf('}', pickJob) + 1);
  assert.match(pickRule, /right: 1px/);
  assert.match(pickRule, /bottom: 1px/);
  assert.match(pickRule, /font-size: 8px/);
  assert.match(market, /\.market-pick:has\(\.lock-icon\) \.job-badge \{ display: none; \}/);
  // 스킬북 수량은 오른쪽 위(직업 배지가 비켜 준 자리), 판매 등록 묶음 수량도 오른쪽 위.
  assert.match(css, /\.bag-item\.skillbook-item \.skillbook-count \{ top: 2px; bottom: auto; right: 2px; \}/);
  const pickCount = market.indexOf('.market-pick-count {');
  const countRule = market.slice(pickCount, market.indexOf('}', pickCount) + 1);
  assert.match(countRule, /top: 1px/);
  assert.match(countRule, /bottom: auto/);
  // 넓은 거래소 카드에서는 직업 배지가 등급 배지 아래로 쌓인다.
  assert.match(market, /\.market-card-art:has\(\.rarity-badge\) \.job-badge \{ top: 15px; \}/);
});

test('장착 칸·공용창고·거래소 카드가 같은 헬퍼로 등급 배지를 붙인다', () => {
  const equipSource = readFileSync(new URL('../src/ui/modals/equipModal.ts', import.meta.url), 'utf8');
  const warehouseSource = readFileSync(new URL('../src/ui/modals/warehouseModal.ts', import.meta.url), 'utf8');
  const marketSource = readFileSync(new URL('../src/ui/modals/marketModal.ts', import.meta.url), 'utf8');
  // 장착 10칸 — 부위 이름·`+N` 뒤에 등급 배지.
  assert.match(equipSource, /<small class="slot-part">\$\{slotLabel\}<\/small>\$\{item \? plusBadgeMarkup\(item\) : ''\}\$\{rarityBadgeMarkup\(item\)\}/);
  // 가방 칸 — 아이콘 + 화살표 + `+N` + 등급 배지.
  assert.match(equipSource, /const rarity = rarityBadgeMarkup\(item\);/);
  assert.match(equipSource, /cell\.innerHTML = itemIcon\.call\(this, item\.slot, item, 'item-icon'\) \+ upgrade \+ plus \+ rarity;/);
  assert.match(equipSource, /jobBadge\.textContent = jobShortNames\[owner\];/);
  // 공용창고 칸.
  assert.match(warehouseSource, /import \{ appendRarityBadge \} from '\.\.\/rarityBadge'/);
  assert.match(warehouseSource, /appendRarityBadge\(cell, item\);/);
  assert.match(warehouseSource, /badge\.textContent = jobShortNames\[owner\];/);
  // 거래소 — 간편 보기 카드 그림과 판매 등록 칸.
  assert.match(marketSource, /appendRarityBadge\(art, sale\.item\);/);
  assert.match(marketSource, /appendRarityBadge\(pick, item\);/);
  assert.match(marketSource, /el\('span', `job-badge job-\$\{pickOwner\}`, jobShortNames\[pickOwner\]\)/);
  // 카드 안 직업 배지는 전체 이름 그대로(넓은 카드).
  assert.match(marketSource, /if \(owner\) art\.append\(el\('span', `job-badge job-\$\{owner\}`, jobNames\[owner\]\)\);/);
});
