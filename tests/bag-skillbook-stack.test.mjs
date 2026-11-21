import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave, useSkillBook } = await import('../src/game/store.ts');
const { bagStacks } = await import('../src/ui/bagStacks.ts');
const { renderInventory } = await import('../src/ui/modals/equipModal.ts');

/** 작업 246 — 가방에서 같은 스킬북을 한 칸 `×N`으로 모아 보여 준다(사용자 제보). */
const gear = (id, plus = 0) => ({ id, name: `강철 검 ${id}`, slot: 'weapon', rarity: 'common', stats: { attack: 2 + plus }, plus });
const book = (id, skillId, name = skillId) => ({ id, name: `[스킬북] ${name}`, slot: 'skillbook', kind: 'skillbook', skillId, rarity: 'rare', stats: {} });
const pouch = id => ({ id, name: '무작위 보물 주머니', slot: 'pouch', kind: 'pouch', rarity: 'unique', stats: {} });

test('bagStacks: 같은 스킬북·같은 주머니는 묶고, 장비는 하나씩 센다', () => {
  const items = [gear('g1'), book('b1', 'doubleShot'), book('b2', 'doubleShot'), pouch('p1'), gear('g2'), book('b3', 'doubleShot'), book('b4', 'fireBolt'), pouch('p2')];
  const stacks = bagStacks(items);
  assert.equal(stacks.length, 5, '장비 2 + 더블샷 묶음 + 파이어볼트 + 주머니 묶음');
  assert.deepEqual(stacks.map(stack => stack.count), [1, 3, 2, 1, 1]);
  // 칸이 들고 있는 id는 묶음의 **첫 아이템**이다 — 개별 id는 목록에 그대로 남아 있다.
  assert.equal(stacks[1].item.id, 'b1');
  assert.equal(stacks[1].key, 'book:doubleShot');
  assert.equal(stacks[2].item.id, 'p1');
  assert.equal(stacks[2].key, 'pouch');
  assert.deepEqual(stacks[1].item.skillId, 'doubleShot');
  // 순서는 처음 나온 차례를 지킨다.
  assert.deepEqual(stacks.map(stack => stack.item.id), ['g1', 'b1', 'p1', 'g2', 'b4']);
  assert.deepEqual(bagStacks([]), []);
  // 같은 이름이라도 skillId가 다르면 다른 칸이다.
  assert.equal(bagStacks([book('x', 'doubleShot', '같은이름'), book('y', 'fireBolt', '같은이름')]).length, 2);
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
  Object.defineProperty(node, 'childElementCount', { get() { return node.children.length; } });
  return node;
}
function find(node, test) { if (!node || typeof node !== 'object') return undefined; if (test(node)) return node; for (const child of node.children ?? []) { const hit = find(child, test); if (hit) return hit; } return undefined; }
function all(node, test, out = []) { if (!node || typeof node !== 'object') return out; if (test(node)) out.push(node); for (const child of node.children ?? []) all(child, test, out); return out; }
function bagOf(dialog) { const grid = find(dialog, node => node.className?.includes('bag-grid')); return grid.children.filter(node => node.className?.includes('bag-item')); }

function render(save) {
  const ui = { world: { save, onChange() {} }, selected: undefined, bagFilter: 'all', bagRaritySort: false, bagJobOnly: false, salvageRarity: 'common', autoSalvage: false, salvagePlus: 4, openModal: 'equipment', modal: element(), renderModal() {}, message() {}, iconPath() { return ''; } };
  const dialog = element();
  renderInventory.call(ui, dialog);
  return { ui, dialog };
}

test('가방은 같은 스킬북 세 권을 한 칸 `×3`으로 그린다(작업 246)', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = freshSave('male', 'warrior');
    // 전사 가방에는 **다른 직업 전용 스킬북**이 보인다(내 직업 책은 스킬 창에서 쓴다).
    save.bag = [book('a1', 'doubleShot', '더블 샷'), book('a2', 'doubleShot', '더블 샷'), book('a3', 'doubleShot', '더블 샷'), gear('g1')];
    const { dialog } = render(save);
    const cells = bagOf(dialog);
    const books = cells.filter(cell => cell.className.includes('skillbook-item'));
    assert.equal(books.length, 1, '같은 책 세 권은 한 칸');
    assert.equal(books[0].dataset.itemId, 'a1', '칸은 묶음의 첫 아이템 id로 연결된다');
    const count = find(books[0], node => node.className === 'skillbook-count');
    assert.equal(count.textContent, '×3');
    assert.match(books[0].attrs['aria-label'], /더블 샷 · 3권/, '낭독기는 3권으로 읽는다');
    assert(cells.some(cell => cell.dataset.itemId === 'g1'), '장비는 그대로 한 칸');
    // 셋 다 가방 목록에는 남아 있다 — 합친 것은 보기뿐이다.
    assert.equal(save.bag.length, 4);
    // 개별 id로 사용하면 그 책만 소모되고, 남은 권수가 다시 그려진다.
    const used = useSkillBook(save, 'a1');
    assert.equal(used.ok, false, '전사에게 궁수 책은 사용 불가');
    assert.equal(save.bag.length, 4);
  } finally { globalThis.document = previous; }
});

test('내 직업 스킬북을 개별 id로 쓰면 묶음 권수가 줄고 칸은 남은 첫 책으로 다시 연결된다', () => {
  const save = freshSave('male', 'warrior');
  save.bag = [book('m1', 'power', '파워 스트라이크'), book('m2', 'power', '파워 스트라이크'), book('m3', 'power', '파워 스트라이크')];
  const before = bagStacks(save.bag);
  assert.equal(before.length, 1);
  assert.equal(before[0].count, 3);
  const result = useSkillBook(save, before[0].item.id);
  assert.equal(result.ok, true);
  assert.equal(save.skillLevels.power, 1);
  const after = bagStacks(save.bag);
  assert.equal(after.length, 1);
  assert.equal(after[0].count, 2, '한 권이 사라져 ×2');
  assert.equal(after[0].item.id, 'm2', '다음 책 id로 연결된다');
});
