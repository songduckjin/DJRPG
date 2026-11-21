import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { renderStatus } = await import('../src/ui/hud.ts');
const { World } = await import('../src/game/world.ts');
const { freshSave } = await import('../src/game/store.ts');

const node = () => ({
  handlers: {},
  dataset: {},
  style: { setProperty() {} },
  classList: { toggle() {}, add() {}, remove() {} },
  textContent: '', hidden: false,
  addEventListener(type, handler) { this.handlers[type] = handler; },
  setAttribute() {}, prepend() {}, replaceChildren() {}
});
/** `renderStatus`만 돌리는 최소 UI — 실제 DOM 대신 마크업 문자열과 클릭 핸들러를 붙잡는다. */
function fixture(save) {
  const world = new World(save);
  const messages = [];
  const children = new Map();
  const top = {
    html: '',
    set innerHTML(value) { this.html = value; },
    get innerHTML() { return this.html; },
    querySelector(selector) {
      if (!/boss-retry|floor-return/.test(selector)) return null;
      if (!children.has(selector)) children.set(selector, node());
      return children.get(selector);
    }
  };
  const root = { querySelector: selector => { if (!children.has(selector)) children.set(selector, node()); return children.get(selector); } };
  return { ui: { world, top, root, banner: node(), message: text => messages.push(text), get(selector) { return root.querySelector(selector); } }, children, messages };
}

test('최고층에서 2층 이상 내려왔을 때만 ▲ 최고층 버튼이 층 배지 옆에 붙는다 (작업 224 `#6215`)', () => {
  const save = freshSave(); save.floor = 12; save.maxFloor = 13;
  const { ui } = fixture(save);
  renderStatus.call(ui);
  assert.equal(ui.top.html.includes('▲ 최고층'), false, '한 층 아래는 층 선택 창으로 충분하다');
  save.floor = 12; save.maxFloor = 15;
  const second = fixture(save);
  renderStatus.call(second.ui);
  assert.equal(second.ui.top.html.includes('▲ 최고층'), true);
  assert.match(second.ui.top.html, /class="floor-return"[^>]*aria-label="최고층 15층으로 이동"/);
  // 층 배지(`.status-floor`) 안, 층 버튼 바로 뒤에 붙는다 — 화면 위쪽 한 줄.
  assert.match(second.ui.top.html, /class="status-floor"[\s\S]*class="floor-return"[\s\S]*<\/span><span class="gold"/);
});

test('▲ 최고층을 누르면 최고층으로 바로 이동하고 안내를 띄운다', () => {
  const save = freshSave(); save.floor = 3; save.maxFloor = 9; save.floorKills = 4;
  const { ui, children, messages } = fixture(save);
  renderStatus.call(ui);
  const button = children.get('.floor-return');
  assert.equal(typeof button.handlers.click, 'function');
  button.handlers.click();
  assert.equal(ui.world.save.floor, 9, '최고층으로 이동');
  assert.equal(ui.world.save.floorKills, 0, '층 카운터 초기화');
  assert(messages.some(text => text.includes('9층으로 이동했습니다')), '이동 안내');
});

test('▲ 최고층 스타일은 금빛 테두리이고 좁은 화면에서 글자가 작아진다', () => {
  const css = readFileSync(new URL('../src/styles/hud.css', import.meta.url), 'utf8');
  assert(/\.floor-return\s*\{[^}]*border:\s*1px solid #c9a46a/.test(css));
  assert(/@media \(max-width: 399px\)[\s\S]{0,200}\.floor-return/.test(css));
});
