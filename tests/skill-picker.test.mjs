import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';
const { freshSave } = await import('../src/game/store.ts');
const { openSkillPicker, pressSkillSlot } = await import('../src/ui/skillLoadout.ts');

const styles = modalStyles();

/** 자식이 이어지는 작은 DOM 스텁 — 팝업 목록·배지·클릭을 그대로 확인한다. */
function element(tag = 'div') {
  const children = [];
  const node = {
    tag, children, dataset: {}, style: {}, className: '', textContent: '', attrs: {}, hidden: false, disabled: false, parent: null,
    append(...kids) { for (const kid of kids) { kid.parent = node; children.push(kid); } },
    appendChild(kid) { node.append(kid); return kid; },
    setAttribute(key, value) { node.attrs[key] = value; },
    remove() { if (node.parent) { const list = node.parent.children; const index = list.indexOf(node); if (index >= 0) list.splice(index, 1); } },
    focus() {},
    classList: {
      add(name) { if (!node.className.split(/\s+/).includes(name)) node.className = `${node.className} ${name}`.trim(); },
      contains: name => node.className.split(/\s+/).includes(name),
      toggle(name, on) { if (on) node.classList.add(name); else node.className = node.className.split(/\s+/).filter(token => token !== name).join(' '); }
    },
    querySelector(selector) {
      const wanted = selector.startsWith('.') ? selector.slice(1) : selector;
      return walk(node).find(child => child.className.split(/\s+/).includes(wanted));
    }
  };
  Object.defineProperty(node, 'innerHTML', { get() { return ''; }, set() {} });
  return node;
}
function walk(node, out = []) { for (const child of node.children) { out.push(child); walk(child, out); } return out; }
const rows = root => walk(root).filter(node => node.className.split(/\s+/).includes('skill-picker-row'));
const badges = root => walk(root).filter(node => node.className.split(/\s+/).includes('skill-recommend-badge'));

function uiFixture(job = 'warrior') {
  // 밸런스 v2: 새 캐릭터는 첫 스킬을 습득한 상태로 시작한다 — 이 파일은 '습득 0' 상태부터 본다.
  const save = freshSave('male', job); save.learned = []; save.skillLevels = {};
  const root = element(); const shell = element(); shell.className = 'game-shell'; root.append(shell);
  const messages = []; let changes = 0;
  const ui = {
    root, messages, world: { save, paused: false, onChange: () => { changes++; }, action() {} },
    market: { busy: false, sync: { locked: false } },
    changes: () => changes,
    message(text) { messages.push(text); }, tick() {}, slotButtons: [element(), element(), element()]
  };
  return ui;
}
const withDocument = run => {
  globalThis.document = { createElement: tag => element(tag) };
  try { return run(); } finally { delete globalThis.document; }
};

test('빈 스킬 원 팝업은 장착 가능한 스킬만 초당 딜량 순으로 보여 준다(작업 245)', () => withDocument(() => {
  const ui = uiFixture('warrior');
  ui.world.save.learned = ['slash2', 'slam', 'warcry', 'power'];
  ui.world.save.quickSlots = ['warcry', null, 'hell'];
  pressSkillSlot.call(ui, 1);
  const list = rows(ui.root);
  // 이미 장착된 warcry·hell, 미습득 스킬, 패시브·스킬북은 목록에 없다.
  assert.deepEqual(list.map(row => row.dataset.skill), ['power', 'slash2', 'slam']);
  assert.deepEqual(list.map(row => row.attrs['aria-label']), [
    '파워 스트라이크 추천 · 2번 원에 장착', '이단참 · 2번 원에 장착', '와일드 스탬프 · 2번 원에 장착'
  ]);
  const badge = badges(ui.root);
  assert.equal(badge.length, 1, '추천 배지는 맨 위 한 줄에만');
  assert.equal(badge[0].textContent, '추천');
  assert(list[0].className.includes('is-recommended'));
  assert(!list[1].className.includes('is-recommended'));
  // 요약 줄에 레벨·위력·쿨타임이 함께 읽힌다.
  const summary = walk(list[0]).find(node => node.tag === 'small');
  assert.match(summary.textContent, /Lv\.1 · 위력 \+0% · 쿨 6초/);
  assert.equal(ui.opened, undefined, '전체 스킬 창은 열지 않는다');
}));

test('1번 원은 직업 버프가 추천 1순위다(작업 245)', () => withDocument(() => {
  const ui = uiFixture('mage');
  ui.world.save.learned = ['fireBolt', 'meteorStrike', 'arcaneShield'];
  pressSkillSlot.call(ui, 0);
  const list = rows(ui.root);
  assert.deepEqual(list.map(row => row.dataset.skill), ['arcaneShield', 'fireBolt', 'meteorStrike']);
  assert(list[0].className.includes('is-recommended'));
  assert.equal(badges(ui.root).length, 1);
  assert.match(walk(list[0]).find(node => node.tag === 'small').textContent, /공격 버프/);
}));

test('줄을 누르면 그 원에 바로 장착하고 팝업을 닫는다(작업 245)', () => withDocument(() => {
  const ui = uiFixture('archer');
  ui.world.save.learned = ['doubleShot', 'multiShot', 'hawkEye'];
  openSkillPicker.call(ui, 2);
  const list = rows(ui.root);
  assert.deepEqual(list.map(row => row.dataset.skill), ['multiShot', 'doubleShot', 'hawkEye'], '버프는 공격 뒤');
  list[0].onclick();
  assert.deepEqual(ui.world.save.quickSlots, [null, null, 'multiShot']);
  assert.equal(ui.root.querySelector('.skill-picker'), undefined, '팝업이 닫힌다');
  assert.equal(ui.changes(), 1, '저장·HUD 갱신');
  assert.match(ui.messages.at(-1), /더블 샷|멀티 샷/);
  assert.match(ui.messages.at(-1), /장착했습니다/);
}));

test('닫기 버튼과 바깥 누름으로 팝업이 닫히고 세이브는 그대로다(작업 245)', () => withDocument(() => {
  const ui = uiFixture();
  ui.world.save.learned = ['slash2'];
  openSkillPicker.call(ui, 0);
  const overlay = ui.root.querySelector('.skill-picker');
  const close = walk(overlay).find(node => node.className.split(/\s+/).includes('skill-picker-close'));
  assert.equal(close.textContent, '닫기');
  close.onclick();
  assert.equal(ui.root.querySelector('.skill-picker'), undefined);
  assert.deepEqual(ui.world.save.quickSlots, [null, null, null]);

  openSkillPicker.call(ui, 0);
  const again = ui.root.querySelector('.skill-picker');
  again.onclick({ target: again });
  assert.equal(ui.root.querySelector('.skill-picker'), undefined, '바깥을 누르면 닫힌다');
}));

test('장착 가능한 스킬이 없으면 팝업 대신 안내만 띄운다(작업 245)', () => withDocument(() => {
  const ui = uiFixture();
  pressSkillSlot.call(ui, 0);
  assert.equal(ui.root.querySelector('.skill-picker'), undefined);
  assert.deepEqual(ui.messages, ['스킬 트리에서 SP를 투자해 스킬을 습득하면 장착할 수 있습니다.']);
}));

test('동기화 중에는 팝업을 열지 않는다(작업 245)', () => withDocument(() => {
  for (const blocked of ['paused', 'busy', 'locked']) {
    const ui = uiFixture();
    ui.world.save.learned = ['slash2'];
    if (blocked === 'paused') ui.world.paused = true;
    if (blocked === 'busy') ui.market.busy = true;
    if (blocked === 'locked') ui.market.sync.locked = true;
    pressSkillSlot.call(ui, 0);
    assert.equal(ui.root.querySelector('.skill-picker'), undefined, blocked);
    assert.deepEqual(ui.messages, [], blocked);
  }
}));

test('팝업 스타일이 좁은 화면까지 정의되어 있다(작업 245)', () => {
  for (const selector of ['.skill-picker {', '.skill-picker-card {', '.skill-picker-close {', '.skill-picker-row {', '.skill-picker-row.is-recommended {', '.skill-recommend-badge {']) {
    assert(styles.includes(selector), `${selector} 규칙이 없다`);
  }
  assert(styles.includes('@media (max-width: 380px)'), '좁은 화면 대응');
});
