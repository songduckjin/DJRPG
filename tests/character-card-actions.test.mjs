import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';

const { renderCharacters, renderCreateCharacter } = await import('../src/ui/modals/charactersModal.ts');
const css = modalStyles();

class Node {
  children = []; attributes = {}; className = ''; textContent = ''; type = ''; onclick = null; disabled = false;
  append(...nodes) { this.children.push(...nodes); }
  classList = { toggle() {}, add() {}, remove() {} };
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelectorAll() { return []; }
}
const visit = node => [node, ...(node.children || []).filter(child => child && typeof child === 'object').flatMap(visit)];
const withDocument = (body, run) => {
  const original = globalThis.document;
  globalThis.document = { createElement: () => new Node(), createTextNode: text => ({ textContent: text }), body };
  try { return run(); } finally { globalThis.document = original; }
};

const fixture = () => ({
  characterList: { characters: [
    { slot: 1, name: '첫째', gender: 'male', job: 'warrior', level: 4, floor: 3 },
    { slot: 2, name: '둘째', gender: 'female', job: 'mage', level: 7, floor: 6 }
  ], activeSlot: 1, maxSlots: 3, revision: 3 },
  characterPage: 0,
  session: { characterSlot: 1 },
  world: { save: { autoClimb: false }, onChange() {} },
  messages: [],
  message(value) { this.messages.push(value); },
  opened: [],
  open(kind) { this.opened.push(kind); },
  renderModal() { this.renders = (this.renders ?? 0) + 1; }
});

/**
 * 캐릭터 선택 카드의 `선택`·`방치`·`삭제` 노출(작업 216).
 *
 * 예전에는 카드마다 방치·삭제가 상시 보이고 카드를 누르면 바로 접속했다. 이제는 카드를 누르면
 * 그 카드만 펼쳐져 `선택`(접속)·`방치`·`삭제` 세 버튼이 나타나고, 빈 슬롯은 누르면 생성 화면으로 간다.
 */
test('카드는 기본으로 접혀 있고, 누르면 그 카드에만 선택·방치·삭제가 붙는다', () => withDocument(new Node(), () => {
  const ui = fixture();
  const dialog = new Node(); renderCharacters(ui, dialog);
  const cards = visit(dialog).filter(node => /(^|\s)character-slot(\s|$)/.test(node.className || ''));
  assert.equal(cards.length, 3, '슬롯 3칸');
  assert(cards.every(card => !card.className.includes('focused')), '처음에는 모두 접혀 있다');
  // 접힌 상태에서도 버튼은 카드에 있고 CSS가 숨긴다(다시 그려져도 상태가 유지된다).
  const first = cards[0];
  const labels = visit(first).map(node => node.textContent);
  for (const label of ['선택', '방치', '삭제']) assert(labels.includes(label), `${label} 버튼이 카드에 있다`);
  assert.match(css, /\.character-slot \.character-connect, \.character-slot \.character-idle, \.character-slot \.character-delete \{ display: none; \}/,
    '접힌 카드에서는 세 버튼을 숨긴다');
  assert.match(css, /\.character-slot\.focused \.character-connect[\s\S]*display: block/, '펼친 카드에서만 보인다');

  // 카드를 누르면 펼쳐지고 다시 그린다.
  const select = visit(first).find(node => node.className === 'character-select');
  select.onclick();
  assert.equal(ui.characterFocus, 1);
  assert.equal(ui.renders, 1, '펼침을 반영해 다시 그린다');
  assert.equal(ui.messages.length, 0, '카드 탭만으로는 접속하지 않는다');

  const expanded = new Node(); renderCharacters(ui, expanded);
  const focused = visit(expanded).find(node => /(^|\s)character-slot(\s|$)/.test(node.className || '') && node.className.includes('focused'));
  assert(focused.className.includes('focused'));
  assert.equal(visit(expanded).filter(node => node.className === 'character-connect').length, 2, '캐릭터 카드마다 선택 버튼');

  // 같은 카드를 다시 누르면 접힌다.
  visit(focused).find(node => node.className === 'character-select').onclick();
  assert.equal(ui.characterFocus, undefined);
}));

test('펼친 카드의 선택은 접속, 방치·삭제는 종전 동작 그대로다', () => withDocument(new Node(), () => {
  const ui = fixture();
  ui.characterFocus = 1;
  const dialog = new Node(); renderCharacters(ui, dialog);
  const cards = visit(dialog).filter(node => /(^|\s)character-slot(\s|$)/.test(node.className || ''));
  const first = cards[0];
  visit(first).find(node => node.className === 'character-connect').onclick();
  assert.deepEqual(ui.messages, ['현재 선택된 캐릭터입니다.'], '접속 중인 카드의 선택은 안내만 한다');
  const idle = visit(first).find(node => node.className === 'character-idle');
  idle.onclick();
  assert.equal(ui.world.save.autoClimb, true, '현재 캐릭터의 방치는 자동 등반을 켠다');
  const remove = visit(first).find(node => node.className === 'character-delete');
  assert.equal(remove.disabled, true, '접속 중인 캐릭터는 삭제할 수 없다');
}));

test('빈 슬롯은 누르면 바로 캐릭터 생성 화면으로 간다', () => withDocument(new Node(), () => {
  const ui = fixture();
  const dialog = new Node(); renderCharacters(ui, dialog);
  const cards = visit(dialog).filter(node => /(^|\s)character-slot(\s|$)/.test(node.className || ''));
  const empty = cards[2];
  assert(visit(empty).some(node => String(node.textContent).includes('새 캐릭터 만들기')));
  assert(!visit(empty).some(node => node.className === 'character-connect'), '빈 슬롯에는 선택 버튼이 없다');
  visit(empty).find(node => node.className === 'character-select').onclick();
  assert.equal(ui.characterCreateSlot, 3);
  assert.deepEqual(ui.opened, ['createCharacter']);
}));

test('캐릭터 생성 화면의 성별 버튼은 남·여만, 직업은 그대로 세 개다', () => withDocument(new Node(), () => {
  const ui = { characterCreateSlot: 2, open() {} };
  const dialog = new Node(); renderCreateCharacter(ui, dialog);
  const form = visit(dialog).find(node => node.className === 'character-create');
  const rows = form.children.filter(node => node.className === 'character-gender' || node.className === 'character-gender character-job');
  const jobs = rows[0].children.map(node => node.textContent);
  const genders = rows[1].children.map(node => node.textContent);
  assert.deepEqual(jobs, ['전사', '궁수', '마법사']);
  assert.deepEqual(genders, ['남', '여'], '성별 버튼은 `남`/`여`만 표시한다');
  assert(!genders.some(label => label.includes('전사')), '직업 이름을 붙이지 않는다');
}));
