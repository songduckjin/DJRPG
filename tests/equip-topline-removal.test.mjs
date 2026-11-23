import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
import { modalStyles as readModalStyles } from './helpers/modal-styles.mjs';

/**
 * `내 정보`(장비창) topline 제거 — 2026-11-23 대장님·송덕진 님 양측 최종 승인 **1안**
 * (`downloads/djrpg_equip_topline/after-390.png`, 제거 전 `before-390.png`).
 *
 * 26px짜리 요약 한 줄(`LV · 층 · EXP · 금화` + `⚔ 전투력` 알약)을 없애고, 그 세로를 장착 쇼케이스
 * (+16px)와 가방(+10px)이 나눠 가진다. 가방 칸은 10열(29px) → **8열**(37px)로 커진다.
 */
const { renderEquipment } = await import('../src/ui/modals/equipModal.ts');
const { freshSave } = await import('../src/game/store.ts');

const equipSource = readFileSync(new URL('../src/ui/modals/equipModal.ts', import.meta.url), 'utf8');
const equipCss = readFileSync(new URL('../src/styles/modals/equip.css', import.meta.url), 'utf8');
const modalCss = readModalStyles();

function rule(source, selector) {
  const index = source.indexOf(`${selector} {`);
  assert.notEqual(index, -1, `${selector} 규칙이 없다`);
  return source.slice(index, source.indexOf('}', index) + 1);
}

test('1안 — 요약 한 줄(equip-topline·equipment-summary·equip-powerpill)은 코드·CSS 양쪽에서 사라졌다', () => {
  for (const selector of ['.equip-topline', '.equipment-summary', '.equip-powerpill', '.equipment-summary > span', '.equip-powerpill i']) {
    assert.equal(equipCss.includes(`${selector} {`), false, `${selector} 규칙이 남아 있다`);
    assert.equal(modalCss.includes(`${selector} {`), false, `${selector} 규칙이 남아 있다(모달 CSS 전체)`);
  }
  assert.equal(equipSource.includes('equip-topline'), false, 'topline 요소를 만들지 않는다');
  assert.equal(equipSource.includes('equip-powerpill'), false, '전투력 알약을 만들지 않는다');
  assert.equal(equipSource.includes('equipment-summary'), false, '요약 표를 만들지 않는다');
  // 값(전투력·EXP%)을 계산하던 호출부도 함께 빠져야 한다 — 화면에 없는 숫자를 계산하지 않는다.
  assert.equal(equipSource.includes('combatPower'), false);
  assert.equal(equipSource.includes('goldMarkup'), false);
  assert.equal(equipSource.includes('expToNext'), false);
});

test('1안 — 렌더는 머리글 다음에 곧바로 장착 쇼케이스를 붙인다(빈 줄·겹침 없음)', () => {
  assert.match(equipSource, /dialog\.append\(showcase\);/);
  assert.equal(/dialog\.append\(topline/.test(equipSource), false);
  // 쇼케이스 아래 안내 줄까지의 순서는 그대로다.
  assert.match(equipSource, /if \(notes\.childElementCount\) dialog\.appendChild\(notes\);/);
});

test('1안 — 장착 쇼케이스 192 → 208px, 가방 칸 10열 → 8열', () => {
  const showcase = rule(equipCss, '.equipment-showcase');
  assert.match(showcase, /height: 208px/);
  assert.match(showcase, /flex: 0 0 208px/);
  assert.equal(showcase.includes('192px'), false, '예전 높이가 남아 있다');
  const grid = rule(equipCss, '.bag-grid');
  assert.match(grid, /grid-template-columns: repeat\(8, minmax\(0, 1fr\)\)/);
  assert.equal(grid.includes('repeat(10'), false, '10열 규칙이 남아 있다');
  // 가방 칸은 공용창고(`.warehouse-grid`)와 같은 8열이 된다 — 같은 물건이 두 창에서 같은 크기다.
  assert.match(modalCss, /\.warehouse-pane \.warehouse-grid \{[^}]*grid-template-columns: repeat\(8, minmax\(0, 1fr\)\)/);
});

test('1안 — 반응형 규칙도 topline이 빠진 높이에 맞춰 함께 올라간다(겹침·찌그러짐 없음)', () => {
  // 360~380px: 기본 208에서 6px만 줄인 202px(예전 186px보다 16px 높다).
  const narrow = equipCss.match(/@media \(max-width: 380px\) \{([\s\S]*?)\}\n/)?.[1] ?? '';
  const showcaseNarrow = narrow.match(/\.equipment-showcase \{([^}]*)\}/)?.[1] ?? '';
  assert.match(showcaseNarrow, /height: 202px/);
  assert.match(showcaseNarrow, /flex-basis: 202px/);
  assert.equal(narrow.includes('equip-topline'), false, '380px 규칙에 topline 예외가 남아 있다');
  assert.equal(narrow.includes('equipment-summary'), false);
  assert.equal(narrow.includes('equip-powerpill'), false);
  // 세로가 짧은 화면: 720px 이하 186px, 620px 이하 176px — 예전(170/160)보다 16px씩 높다.
  assert.match(equipCss, /@media \(max-height: 720px\) \{ \.equipment-showcase \{ height: 186px; flex-basis: 186px; \}/);
  assert.match(equipCss, /@media \(max-height: 620px\) \{[\s\S]*?\.equipment-showcase \{ height: 176px; flex-basis: 176px; \}/);
  // 가방 최소 높이는 그대로 지킨다(짧은 화면에서 가방이 0px로 찌그러지지 않는다).
  assert.match(equipCss, /@media \(max-width: 480px\) \{[\s\S]*?\.equipment-modal \.bag-grid \{ min-height: 135px; \}/);
});

// ── 실제 렌더 ───────────────────────────────────────────────────────────────
function element(tag = 'div') {
  const node = {
    tag, children: [], dataset: {}, style: { vars: {}, setProperty(key, value) { this.vars[key] = value; } }, className: '', textContent: '', innerHTML: '', title: '', attrs: {}, hidden: false, disabled: false, offsetWidth: 1,
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
    appendChild(child) { this.append(child); return child; },
    replaceChildren(...children) { this.children = []; this.append(...children); },
    insertAdjacentHTML() {}, setAttribute(key, value) { this.attrs[key] = value; }, getAttribute(key) { return this.attrs[key]; },
    remove() { const parent = this.parent; if (!parent) return; const index = parent.children.indexOf(this); if (index >= 0) parent.children.splice(index, 1); this.parent = undefined; },
    addEventListener() {}, querySelectorAll() { return []; }
  };
  node.classList = { add(name) { node.className += ` ${name}`; }, remove(name) { node.className = node.className.replace(new RegExp(`(^|\\s)${name}(?=\\s|$)`), ' '); }, toggle(name, on) { if (on) this.add(name); } };
  Object.defineProperty(node, 'childElementCount', { get() { return this.children.length; } });
  return node;
}
function find(node, test) { if (!node || typeof node !== 'object') return undefined; if (test(node)) return node; for (const child of node.children ?? []) { const hit = find(child, test); if (hit) return hit; } return undefined; }

test('1안 — 실제 렌더 결과 창의 첫 요소는 장착 쇼케이스이고 topline 흔적이 없다', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = freshSave('male', 'warrior');
    const ui = { world: { save }, equippedSlot: undefined, equippedPinned: false, modal: element(), renderModal() {}, message() {}, iconPath() { return ''; } };
    const dialog = element();
    renderEquipment.call(ui, dialog);
    const classes = dialog.children.map(child => child.className);
    assert.equal(classes[0], 'equipment-showcase', `첫 요소가 쇼케이스여야 한다: ${classes.join(' | ')}`);
    assert.equal(find(dialog, node => node.className?.includes('equip-topline')), undefined);
    assert.equal(find(dialog, node => node.className?.includes('equipment-summary')), undefined);
    assert.equal(find(dialog, node => node.className?.includes('equip-powerpill')), undefined);
    // 좌 5칸 · 가운데 캐릭터 · 우 5칸 구조는 그대로다.
    const slots = [];
    const collect = node => { for (const child of node.children ?? []) { if (typeof child.dataset?.equippedSlot === 'string') slots.push(child.dataset.equippedSlot); collect(child); } };
    collect(dialog);
    assert.equal(slots.length, 10, '장착 10칸이 모두 그려진다');
  } finally {
    globalThis.document = previous;
  }
});
