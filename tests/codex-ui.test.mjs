import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { codexEntries } = await import('../src/game/codex.ts');
const { renderCodex } = await import('../src/ui/modals/codexModal.ts');
const { freshSave } = await import('../src/game/store.ts');

// 2026-11-21 사용자 확정: 장비 도감을 **1종 1칸(135) 5열**로 접고, 칸 왼쪽 위에 모은 최고 등급 배지
// `L`·`U`·`E`·`R`, 칸을 누르면 하단 띠에서 6등급 칩으로 층·옵션을 본다. 저장 키(`부위:번호:등급`)는 그대로.

const css = readFileSync(new URL('../src/styles/codex.css', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../src/ui/modals/codexModal.ts', import.meta.url), 'utf8');
const rule = selector => { const spaced = css.indexOf(`${selector} {`), tight = css.indexOf(`${selector}{`); const index = spaced >= 0 ? spaced : tight; return index < 0 ? '' : css.slice(index, css.indexOf('}', index)); };

function node(tag) {
  const item = {
    tag, className: '', textContent: '', dataset: {}, style: {}, attrs: {}, children: [], hidden: false, type: '', title: '', value: '', max: 0,
    append(...children) { item.children.push(...children); },
    replaceChildren(...children) { item.children = children; },
    setAttribute(key, value) { item.attrs[key] = value; },
    getAttribute(key) { return item.attrs[key]; },
    querySelectorAll(selector) {
      const found = [];
      const walk = current => { for (const child of current.children) { if (typeof child === 'string') continue; if (matches(child, selector)) found.push(child); walk(child); } };
      walk(item); return found;
    }
  };
  item.classList = {
    contains: name => item.className.split(' ').includes(name),
    add(name) { if (!item.classList.contains(name)) item.className = `${item.className} ${name}`.trim(); },
    remove(name) { item.className = item.className.split(' ').filter(part => part !== name).join(' '); },
    toggle(name, on) { if (on) item.classList.add(name); else item.classList.remove(name); }
  };
  return item;
}
const matches = (element, selector) => selector.startsWith('.') ? element.className.split(' ').includes(selector.slice(1)) : element.tag === selector;
const text = n => typeof n === 'string' ? n : (n.textContent || '') + n.children.map(text).join('');
// 캔버스 없는 노드 스텁 하나를 파일 전체에서 쓴다 — 클릭(onclick)까지 같은 스텁으로 돌려야 하기 때문.
globalThis.document = { createElement: tag => node(tag), createTextNode: value => value };
function render(save) {
  const dialog = node('div');
  const ui = { world: { save }, codexQuery: '', codexSlot: '', codexState: 'all', codexRarity: '', codexSelected: undefined };
  renderCodex.call(ui, dialog);
  return { dialog, ui };
}
const withClass = (root, name) => root.querySelectorAll(`.${name}`);
const item = (name, slot, rarity) => ({ id: `${name}${slot}${rarity}`, name, slot, rarity, stats: { attack: 5 } });

test('격자는 1종 1칸 135칸 5열이고 810칸 카드를 만들지 않는다', () => {
  const save = freshSave(), { dialog } = render(save);
  const cards = withClass(dialog, 'codex-card');
  assert.equal(cards.length, 135, '135종 = 135칸(810칸 아님)');
  assert.equal(new Set(cards.map(card => card.dataset.codexKey)).size, 135);
  assert.equal(withClass(dialog, 'rarity-badge').length, 0, '아무것도 못 모은 세이브에는 배지가 없다');
  assert.deepEqual(cards.map(card => card.dataset.codexKey), codexEntries.map(entry => entry.key));
  assert.match(rule('.codex-grid'), /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(rule('.codex-grid'), /gap: 5px/);
  assert.match(rule('.codex-art'), /width: 45px/);
});

test('요약은 수집률 N / 810 과 종별 M / 135 를 함께 보여 준다', () => {
  const save = freshSave();
  save.equipmentCollection = ['weapon:3:legendary', 'armor:3:epic', 'ring:1:rare'];
  const { dialog } = render(save);
  const summary = withClass(dialog, 'codex-summary')[0];
  const written = text(summary);
  assert.match(written, /수집률/); assert.match(written, /3 \/ 810/); assert.match(written, /\(0\.4%\)/);
  assert.match(written, /종별/); assert.match(written, /3 \/ 135/);
  assert.equal(summary.querySelectorAll('progress')[0].max, 810);
});

test('탭은 전체 135 · 무기 35 · 방어구 90 · 장신구 10 네 개다', () => {
  const { dialog, ui } = render(freshSave());
  const tabs = withClass(dialog, 'codex-tab');
  assert.equal(tabs.length, 4);
  assert.deepEqual(tabs.map(text), ['전체135', '무기35', '방어구90', '장신구10']);
  assert.equal(tabs[0].attrs['aria-selected'], 'true');
  tabs[2].onclick();
  assert.equal(ui.codexSlot, 'armor');
  assert.equal(tabs[0].classList.contains('is-on'), false);
  assert.equal(tabs[2].classList.contains('is-on'), true);
});

test('칸 왼쪽 위 배지는 모은 최고 등급 하나 — L·U·E·R, 매직·일반만 모으면 없다', () => {
  const save = freshSave();
  save.equipmentCollection = ['weapon:3:legendary', 'weapon:0:rare', 'armor:3:epic', 'armor:0:unique', 'helmet:1:magic', 'helmet:2:common'];
  const { dialog } = render(save);
  const card = key => withClass(dialog, 'codex-card').find(node => node.dataset.codexKey === key);
  const badge = key => card(key).querySelectorAll('.rarity-badge')[0];
  assert.equal(badge('weapon:3').textContent, 'L'); assert.equal(badge('weapon:3').title, '레전드 등급');
  assert.equal(badge('weapon:0').textContent, 'R');
  assert.equal(badge('armor:3').textContent, 'E');
  assert.equal(badge('armor:0').textContent, 'U');
  assert.equal(badge('helmet:1'), undefined, '매직만 모은 종은 배지 없음');
  assert.equal(badge('helmet:2'), undefined, '일반만 모은 종은 배지 없음');
  // 테두리는 최고 등급 색 — 칸에 그 등급 변수 클래스가 붙는다(매직·일반은 기본 테두리).
  assert(card('weapon:3').classList.contains('codex-g-legendary'));
  assert(card('helmet:1').classList.contains('codex-g-magic'));
  assert.match(rule('.codex-card .rarity-badge'), /position: absolute/);
  assert.match(rule('.codex-card .rarity-badge'), /left: 2px/);
  assert.match(rule('.codex-card .rarity-badge'), /top: 2px/);
  assert.match(rule('.codex-card .rarity-badge'), /border: 1px solid currentColor/);
  assert.match(rule('.codex-card .rarity-badge'), /background: #120f14cc/);
  assert.match(rule('.codex-card .rarity-badge'), /border-radius: 3px/);
  assert.match(rule('.codex-card .rarity-badge'), /font-size: 9px/);
  assert.match(rule('.codex-card .rarity-badge'), /font-weight: 800/);
});

test('칸을 누르면 하단 띠가 열려 6등급 칩과 그 등급의 층·옵션을 보여 준다', () => {
  const save = freshSave();
  save.equipmentCollection = ['armor:3:common', 'armor:3:magic', 'armor:3:rare'];
  const { dialog, ui } = render(save);
  const sheet = withClass(dialog, 'codex-sheet')[0];
  assert.equal(sheet.hidden, true, '고르기 전에는 닫혀 있다');
  const card = withClass(dialog, 'codex-card').find(node => node.dataset.codexKey === 'armor:3');
  card.onclick();
  assert.equal(sheet.hidden, false);
  assert.equal(ui.codexSelected, 'armor:3'); assert.equal(ui.codexRarity, 'rare', '가장 높이 모은 등급이 먼저 열린다');
  const chips = withClass(sheet, 'codex-chip');
  assert.deepEqual(chips.map(text), ['✓ 일반', '✓ 매직', '✓ 레어', '에픽', '유니크', '레전드']);
  assert.equal(chips[2].classList.contains('is-on'), true);
  assert.equal(chips[3].classList.contains('is-collected'), false);
  assert.equal(text(sheet.querySelectorAll('.codex-sheet-count')[0]), '3 / 6');
  const line = () => text(sheet.querySelectorAll('.codex-sheet-line')[0]);
  assert.match(line(), /레어 · 수집함 · \d+층부터 등장 가능/);
  const rareLine = line();
  chips[5].onclick();
  assert.equal(ui.codexRarity, 'legendary');
  assert.match(line(), /레전드 · 미발견 · \d+층부터 등장 가능/, '못 모은 등급도 그 등급의 등장 층·옵션을 본다');
  assert.notEqual(line(), rareLine);
  assert.equal(chips[2].classList.contains('is-on'), false);
  assert.equal(chips[5].classList.contains('is-on'), true);
  // 같은 칸을 다시 누르면 닫힌다.
  card.onclick(); assert.equal(sheet.hidden, true); assert.equal(ui.codexSelected, undefined);
  assert.match(rule('.codex-sheet'), /position: sticky/);
  assert.match(rule('.codex-sheet'), /bottom: -14px/);
  assert.match(rule('.codex-chips'), /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.equal((modal.match(/codexRarities/g) ?? []).length >= 2, true, '6칩은 codexRarities(6등급)를 그대로 돈다');
});

test('검색·상태·탭은 810칸이 아니라 135칸을 걸러 낸다', () => {
  const save = freshSave();
  save.bag = [item('황혼의 쯔바이핸드', 'weapon', 'rare')];
  const { dialog, ui } = render(save);
  const cards = withClass(dialog, 'codex-card');
  const search = withClass(dialog, 'codex-search')[0].querySelectorAll('input')[0];
  search.value = '쯔바이핸드'; search.oninput();
  assert.equal(cards.filter(card => !card.hidden).length, 1);
  assert.equal(ui.codexQuery, '쯔바이핸드');
  assert.match(text(withClass(dialog, 'codex-result')[0]), /1종 표시/);
  search.value = ''; search.oninput();
  const stateSelect = withClass(dialog, 'codex-search')[0].querySelectorAll('select')[0];
  stateSelect.value = 'found'; stateSelect.onchange();
  assert.equal(cards.filter(card => !card.hidden).length, 1, '발견한 종 1개(135 기준)');
  stateSelect.value = 'all'; stateSelect.onchange();
  assert.equal(cards.filter(card => !card.hidden).length, 135);
  // 탭도 135칸을 그대로 거른다 — 무기 35 · 방어구 90 · 장신구 10.
  const tabs = withClass(dialog, 'codex-tab');
  for (const [index, count] of [[1, 35], [2, 90], [3, 10], [0, 135]]) {
    tabs[index].onclick();
    assert.equal(cards.filter(card => !card.hidden).length, count);
    assert.match(text(withClass(dialog, 'codex-result')[0]), new RegExp(`${count}종 표시`));
  }
});

test('상세 띠는 810칸 저장 키와 무관하게 읽기만 하고, 모달 소스는 810칸 카드를 만들지 않는다', () => {
  assert.equal(modal.includes('codexVariants('), false, '격자는 135종 상태(codexEntryStates)에서 만든다');
  assert.match(modal, /codexEntryStates\(save\)/);
  assert.match(modal, /codexRarityMarks|view\.badge/, '배지는 최고 등급 글자(L·U·E·R)');
  assert.match(modal, /filterCodexEntryStates/);
  assert.equal(css.includes('.codex-detail'), false, '예전 격자 안 상세 카드는 하단 띠로 대체됐다');
  assert.equal(css.includes('repeat(3, minmax(0, 1fr))'), false, '3열 격자는 없다');
});
