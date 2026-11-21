import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { plusBadgeMarkup, plusBadgeNode, appendPlusBadge, PLUS_BADGE_CLASS, PLUS_BADGE_POSITION } = await import('../src/ui/plusBadge.ts');
const { renderInventory } = await import('../src/ui/modals/equipModal.ts');

/**
 * 작업 246 — `+N` 강화 배지를 **가방·장비창 장착 칸·공용창고의 왼쪽 아래** 한 자리에 통일한다.
 * 예전에는 장착 칸에 아예 없고, 공용창고는 `left: 1px`이라 화면마다 달랐다.
 */
const gear = (id, plus = 0, slot = 'weapon') => ({ id, name: `강철 장비 ${id}`, slot, rarity: 'rare', stats: { attack: 10 }, plus });
const book = id => ({ id, name: '[스킬북] 더블 샷', slot: 'skillbook', kind: 'skillbook', skillId: 'doubleShot', rarity: 'rare', stats: {} });

test('plusBadgeMarkup은 강화 0이면 빈 문자열, 1 이상이면 `+N` 배지', () => {
  assert.equal(plusBadgeMarkup(gear('a', 0)), '');
  assert.equal(plusBadgeMarkup(book('b')), '', '스킬북은 강화 단계가 없다');
  const one = plusBadgeMarkup(gear('a', 1));
  assert.match(one, new RegExp(`class="${PLUS_BADGE_CLASS}"`));
  assert.match(one, />\+1</);
  assert.match(one, /title="강화 \+1 · 능력치 \+8%"/, '1단계 = 8%');
  assert.match(one, /aria-hidden="true"/);
  const seven = plusBadgeMarkup(gear('a', 7));
  assert.match(seven, />\+7</);
  assert.match(seven, /능력치 \+56%/);
  assert.equal(PLUS_BADGE_POSITION.left, '3px');
  assert.equal(PLUS_BADGE_POSITION.bottom, '2px');
});

test('plusBadgeNode·appendPlusBadge는 요소로 붙이고, 강화 0이면 붙이지 않는다', () => {
  const previous = globalThis.document;
  try {
    globalThis.document = { createElement: () => ({ className: '', textContent: '', title: '', attrs: {}, setAttribute(name, value) { this.attrs[name] = value; } }) };
    const node = plusBadgeNode(gear('a', 4));
    assert.equal(node.className, PLUS_BADGE_CLASS);
    assert.equal(node.textContent, '+4');
    assert.equal(node.attrs['aria-hidden'], 'true');
    assert.equal(plusBadgeNode(gear('a', 0)), null);
    const host = { children: [], append(child) { this.children.push(child); } };
    assert.equal(appendPlusBadge(host, gear('a', 2)), true);
    assert.equal(host.children.length, 1);
    assert.equal(appendPlusBadge(host, gear('a', 0)), false);
    assert.equal(host.children.length, 1);
  } finally { globalThis.document = previous; }
});

// ── 화면 ────────────────────────────────────────────────────────────────────
function element(tag = 'div') {
  const node = {
    tag, children: [], dataset: {}, style: { vars: {}, setProperty(key, value) { this.vars[key] = value; } }, className: '', textContent: '', innerHTML: '', attrs: {}, hidden: false, disabled: false, offsetWidth: 1,
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

test('가방 칸에도 `+N` 배지가 붙는다(장비만, 스킬북·주머니는 제외)', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = freshSave('male', 'warrior');
    save.bag = [gear('plus3', 3), gear('plain', 0), book('b1')];
    const ui = { world: { save, onChange() {} }, selected: undefined, bagFilter: 'all', bagRaritySort: false, bagJobOnly: false, salvageRarity: 'common', autoSalvage: false, salvagePlus: 4, openModal: 'equipment', modal: element(), renderModal() {}, message() {}, iconPath() { return ''; } };
    const dialog = element();
    renderInventory.call(ui, dialog);
    const grid = find(dialog, node => node.className?.includes('bag-grid'));
    const cell = id => grid.children.find(node => node.dataset?.itemId === id);
    assert.match(cell('plus3').innerHTML, /class="item-plus item-plus-badge"/, '+3 배지');
    assert.match(cell('plus3').innerHTML, />\+3</);
    assert.doesNotMatch(cell('plain').innerHTML, /item-plus-badge/, '0강은 배지 없음');
    assert.doesNotMatch(cell('b1').innerHTML, /item-plus-badge/, '스킬북은 배지 없음');
  } finally { globalThis.document = previous; }
});

test('장착 칸·공용창고도 같은 `plusBadge` 헬퍼를 쓰고 CSS 자리는 왼쪽 아래다', () => {
  const equipSource = readFileSync(new URL('../src/ui/modals/equipModal.ts', import.meta.url), 'utf8');
  const warehouseSource = readFileSync(new URL('../src/ui/modals/warehouseModal.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles/modals.css', import.meta.url), 'utf8');
  // 장착 10칸 — 아이콘·부위 이름 뒤에 `+N`을 붙인다.
  assert.match(equipSource, /<small class="slot-part">\$\{slotLabel\}<\/small>\$\{item \? plusBadgeMarkup\(item\) : ''\}/);
  // 가방 칸 — 아이콘 + 추천 화살표 + `+N`.
  assert.match(equipSource, /cell\.innerHTML = itemIcon\.call\(this, item\.slot, item, 'item-icon'\) \+ upgrade \+ plus;/);
  // 공용창고 칸.
  assert.match(warehouseSource, /import \{ appendPlusBadge \} from '\.\.\/plusBadge'/);
  assert.match(warehouseSource, /appendPlusBadge\(cell, item\);/);
  // CSS: 한 규칙으로 세 화면 모두 왼쪽 아래 2px/3px.
  // 작업 247: 거래소 판매 등록 칸도 같은 자리를 쓰도록 같은 규칙에 들어간다.
  const index = css.indexOf('.bag-item .item-plus-badge, .equipment-slot .item-plus-badge, .market-pick .item-plus-badge {');
  assert.notEqual(index, -1, '공통 배지 규칙이 없다');
  const badge = css.slice(index, css.indexOf('}', index) + 1);
  assert.match(badge, /position: absolute/);
  assert.match(badge, /left: 3px/);
  assert.match(badge, /bottom: 2px/);
  assert.match(badge, /pointer-events: none/);
  // 장착 칸은 기준 상자가 있어야 절대 위치가 칸 안에 잡힌다 + 부위 이름이 배지와 겹치지 않게 왼쪽을 비운다.
  assert.match(css, /\.equipment-slot \{[^}]*position: relative/);
  assert.match(css, /\.equipment-slot \.slot-part \{[^}]*padding-left: 13px/);
  // 공용창고 전용 규칙(`left: 1px`)은 없어졌다 — 자리가 하나로 통일됐다.
  assert.doesNotMatch(css, /\.warehouse-plus\s*\{/);
});
