import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { countedInBag, canStoreItem, equipmentCount } = await import('../src/game/bagCapacity.ts');
const { countedInBag: serverCountedInBag } = await import('../server/skill-ids.mjs');
const { renderInventory, itemDetail } = await import('../src/ui/modals/equipModal.ts');
const { renderSkillBooks } = await import('../src/ui/skillBooks.ts');
const { World } = await import('../src/game/world.ts');

const gear = id => ({ id, name: '검', slot: 'weapon', rarity: 'common', stats: { attack: 2 } });
const skillbook = (id, skillId, name) => ({ id, name: `[스킬북] ${name}`, slot: 'skillbook', kind: 'skillbook', skillId, rarity: 'rare', stats: {} });
const pouch = id => ({ id, name: '무작위 보물 주머니', slot: 'pouch', kind: 'pouch', rarity: 'unique', stats: {} });
const MINE = skillbook('mine', 'spin', '드래곤 트위스터');            // 전사 액티브
const FOREIGN = skillbook('foreign', 'doubleShot', '더블 샷');        // 궁수 액티브
const PASSIVE = skillbook('passive', 'magePassive', '지팡이 숙련');   // 존재하지 않는 id

test('가방 40칸은 장비·타직업 책·보물 주머니를 세고 내 직업 책은 세지 않는다(작업 253)', () => {
  assert.equal(countedInBag(gear('g'), 'warrior'), true, '장비는 센다');
  assert.equal(countedInBag(MINE, 'warrior'), false, '내 직업 책은 세지 않는다');
  assert.equal(countedInBag(FOREIGN, 'warrior'), true, '다른 직업 책은 센다');
  assert.equal(countedInBag(pouch('p'), 'warrior'), true, '보물 주머니도 센다');
  assert.equal(countedInBag(PASSIVE, 'warrior'), true, '직업을 모르는 책도 칸은 쓴다');
  // 직업이 바뀌면 판정도 바뀐다 — 궁수에게는 FOREIGN(궁수 책)이 내 것이고 MINE(전사 책)이 남의 것이다.
  assert.equal(countedInBag(MINE, 'archer'), true, '궁수에게 전사 책은 칸을 쓴다');
  assert.equal(countedInBag(FOREIGN, 'archer'), false, '궁수에게 궁수 책은 칸을 쓰지 않는다');

  const save = freshSave(); save.job = 'warrior';
  save.bag = [...Array.from({ length: 37 }, (_, index) => gear(`g${index}`)), FOREIGN, MINE, pouch('p1')];
  assert.equal(equipmentCount(save.bag, save.job), 39, '장비 37 + 다른 직업 책 1 + 주머니 1 = 39');
  assert.equal(canStoreItem(save.bag, gear('new'), save.job), true, '39칸이니 새 장비는 들어간다');
  save.bag.push(gear('filler'));
  assert.equal(equipmentCount(save.bag, save.job), 40, '장비를 하나 더 넣어 꽉 참');
  assert.equal(canStoreItem(save.bag, gear('new'), save.job), false, '가득 찼으니 새 장비는 못 들어간다');
  assert.equal(canStoreItem(save.bag, pouch('new'), save.job), false, '보물 주머니도 자리가 없다');
  assert.equal(canStoreItem(save.bag, MINE, save.job), true, '내 직업 책은 40칸이 다 차도 들어간다');
  assert.equal(canStoreItem(save.bag, FOREIGN, save.job), false, '타직업 책은 자리가 없다');
});
test('가득 찬 가방에는 타직업 스킬북이 들어가지 않고, 내 직업 책만 들어간다', () => {
  const save = freshSave(); save.tutorial = 3; save.job = 'warrior';
  save.bag = Array.from({ length: 39 }, (_, index) => gear(`g${index}`));
  save.bag.push(FOREIGN);
  const world = new World(save);
  const point = { x: world.player.x, y: world.player.y, age: 0, warned: false };
  world.drops = [{ ...point, item: skillbook('new-foreign', 'fireBolt', '파이어 볼트') }, { ...point, item: skillbook('new-mine', 'slam', '와일드 스탬프') }];
  for (let index = 0; index < 25; index++) world.update(.1);
  assert(save.bag.some(item => item.id === 'new-mine'), '내 직업 책은 40칸이어도 들어간다(작업 253)');
  assert(!save.bag.some(item => item.id === 'new-foreign'), '다른 직업 책은 못 들어간다');
  assert(world.drops.some(drop => drop.item.id === 'new-foreign'), '못 들어간 책은 바닥에 남는다');
  assert.equal(equipmentCount(save.bag, save.job), 40, '칸 수는 40 그대로(내 직업 책은 세지 않는다)');
});
test('서버 40칸 규칙(countedInBag)이 클라이언트와 같다', () => {
  for (const job of ['warrior', 'archer', 'mage']) {
    for (const item of [gear('g'), MINE, FOREIGN, pouch('p'), skillbook('unknown', 'noSuchSkill', '알 수 없음')]) {
      assert.equal(serverCountedInBag(item, job), countedInBag(item, job), `${job} · ${item.id}`);
    }
  }
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
function toString(node) { if (!node || typeof node !== 'object') return String(node ?? ''); return (node.textContent ?? '') + (node.innerHTML ?? '') + (node.children ?? []).map(toString).join(''); }

test('가방은 내 직업 책을 숨기고 다른 직업 책을 직업 배지와 함께 보여 주며 상세에는 사용 버튼이 없다', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = freshSave(); save.job = 'warrior';
    save.bag = [MINE, FOREIGN, pouch('p1'), gear('g1')];
    const ui = { world: { save, onChange() {} }, selected: undefined, bagFilter: 'all', bagRaritySort: false, bagJobOnly: false, salvageRarity: 'common', autoSalvage: false, salvagePlus: 4, openModal: 'equipment', modal: element(), renderModal() {}, message() {}, iconPath() { return ''; } };
    const dialog = element();
    renderInventory.call(ui, dialog);
    const grid = find(dialog, node => node.className?.includes('bag-grid'));
    const cells = grid.children.filter(node => node.className?.includes('bag-item'));
    const ids = cells.map(cell => cell.dataset.itemId);
    assert(ids.includes('foreign'), '다른 직업 책은 가방에 보인다');
    assert(!ids.includes('mine'), '내 직업 책은 가방에 없다(스킬 창에서 쓴다)');
    assert(ids.includes('p1') && ids.includes('g1'), '주머니·장비 그대로');
    const foreignCell = cells.find(cell => cell.dataset.itemId === 'foreign');
    assert(foreignCell.className.includes('skillbook-item'));
    assert(find(foreignCell, node => node.className?.includes('job-archer')), '궁수 배지');
    // 상세: 다른 직업 전용 안내 + 사용 버튼 없음
    const detail = itemDetail.call(ui, save, FOREIGN);
    const text = toString(detail);
    assert(text.includes('다른 직업 전용 스킬북'), '다른 직업 전용 안내');
    assert(text.includes('경매장 판매') && text.includes('공용창고 보관'), '판매·보관 안내');
    assert(!find(detail, node => node.className === 'skillbook-use'), '사용 버튼 없음');
    // 내 직업 책 상세는 그대로 사용할 수 있다
    const mineDetail = itemDetail.call(ui, save, MINE);
    assert(find(mineDetail, node => node.className === 'skillbook-use'), '내 직업 책은 사용 버튼');
    // 가방 카운팅 문구는 장비·타직업 책·주머니를 칸으로 세고, 내 직업 책은 세지 않는다(작업 253)
    assert(toString(dialog).includes('가방 3/40'), '장비 1 + 다른 직업 책 1 + 주머니 1 = 3 (내 직업 책 제외)');
    // `내 직업만 보기`가 켜지면 다른 직업 책도 가려진다
    ui.bagJobOnly = true; ui.selected = undefined;
    const filteredDialog = element();
    renderInventory.call(ui, filteredDialog);
    const filteredGrid = find(filteredDialog, node => node.className?.includes('bag-grid'));
    assert(!filteredGrid.children.some(cell => cell.dataset.itemId === 'foreign'), '필터를 켜면 숨김');
  } finally { globalThis.document = previous; }
});

test('스킬 창은 내 직업 스킬북만 카드로 보여 준다', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = freshSave(); save.job = 'warrior';
    save.bag = [MINE, { ...MINE, id: 'mine2' }, FOREIGN];
    const ui = { world: { save, paused: false, onChange() {} }, market: { busy: false, sync: { locked: false } }, message() {} };
    const parent = element();
    renderSkillBooks(ui, parent);
    const cards = all(parent, node => node.className === 'skill-book-card');
    assert.equal(cards.length, 1, '내 직업 책 한 종류만');
    assert(toString(cards[0]).includes('드래곤 트위스터'));
    assert(!toString(parent).includes('더블 샷'), '다른 직업 책은 카드가 없다');
    assert(toString(parent).includes('다른 직업 전용 스킬북은 가방에서'), '가방 안내 한 줄');
    const css = modalStyles();
    assert(css.includes('.skill-book-hint'), '안내 스타일');
  } finally { globalThis.document = previous; }
});
