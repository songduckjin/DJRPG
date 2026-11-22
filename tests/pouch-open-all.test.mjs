import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './ts-loader.mjs';
import { createClient } from '@libsql/client';
import { modalStyles } from './helpers/modal-styles.mjs';

const items = await import('../src/game/items.ts');
const pouch = await import('../src/game/pouch.ts');
const batch = await import('../src/game/pouchBatch.ts');
const { freshSave } = await import('../src/game/store.ts');
const { equipmentCount } = await import('../src/game/bagCapacity.ts');
const { openPouchWindow } = await import('../src/ui/modals/pouchModal.ts');
const { pouchBatchPanel } = await import('../src/ui/pouchBatch.ts');
const { POUCH_MAX_GOLD } = await import('../server/save-guard.mjs');
const { clampSaveProgress } = await import('../server/save-guard.mjs');
const { schema, transaction, reconcileItems } = await import('../server/database.mjs');
const css = modalStyles();

/**
 * 보물 주머니 **한 번에 열기** (2026-11-22).
 *
 * ① 규칙: 보유 주머니를 모두 열고 집계한다 — 1개 열기와 같은 확률·지급, 가방 칸은 늘지 않는다.
 * ② 서버: 한 저장에 몰린 개봉 금화가 사냥 시간 상한에 잘리지 않는다(소모된 주머니 수 × 5,000G).
 * ③ 화면: `전부 열기 (N개)` 버튼과 결과 요약(합계·등급·×N 목록).
 */

/** 결정적인 난수 — 같은 순서면 같은 결과. */
function seeded(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function constant(values) { let index = 0; return () => values[Math.min(index++, values.length - 1)]; }
function withPouches(count, gold = 0, maxFloor = 20) {
  const save = freshSave();
  save.maxFloor = maxFloor; save.floor = maxFloor; save.gold = gold;
  save.bag = Array.from({ length: count }, (_, index) => items.pouchItem(`p${index + 1}`));
  return save;
}

test('한 번에 열기 — 보유한 주머니를 모두 까고 금화·수량을 집계한다', () => {
  const save = withPouches(5);
  // 금화 1,500G(분류 .10 → 금화, 세부 .10 → 1,500G)만 나오는 난수.
  const opened = batch.openPouches(save, { random: constant([.10, .10]) });
  assert.equal(opened.ok, true);
  assert.equal(opened.summary.opened, 5, '5개를 모두 연다');
  assert.equal(opened.summary.gold, 7500, '1,500G × 5');
  assert.equal(opened.summary.rows.length, 0, '금화만 나오면 목록이 비어 있다');
  assert.equal(opened.summary.remaining, 0);
  assert.equal(pouch.pouchCount(save), 0, '가방에 주머니가 남지 않는다');
  assert.equal(save.gold, 7500, '세이브 금화에 그대로 반영');
  // 주머니가 없으면 열 것이 없다.
  assert.equal(batch.openPouches(save).ok, false);
});

test('한 번에 열기 — 장비·스탯북 결과가 가방에 들어가고 등급·종류별 수량이 결과와 같다', () => {
  const save = withPouches(12);
  const before = save.gold;
  const opened = batch.openPouches(save, { random: seeded(31) });
  const summary = opened.summary;
  assert.equal(summary.opened, 12);
  assert.equal(summary.equipmentCount + summary.bookTotal, save.bag.length, '가방에 든 결과 수 = 장비 + 스탯북');
  assert.equal(summary.equipmentCount, Object.values(summary.rarityCounts).reduce((total, count) => total + count, 0));
  assert.equal(summary.bookTotal, summary.bookCounts.attack + summary.bookCounts.defense + summary.bookCounts.health);
  assert.equal(save.gold, before + summary.gold, '금화는 합계만큼 증가');
  // 묶음(rows)의 수량 합 = 획득 아이템 수, 키는 유일하다.
  const rowTotal = summary.rows.reduce((total, row) => total + row.count, 0);
  assert.equal(rowTotal, summary.equipmentCount + summary.bookTotal);
  assert.equal(new Set(summary.rows.map(row => row.key)).size, summary.rows.length, '같은 이름·등급은 한 줄');
  // 전설 → 일반 순서.
  const order = ['legendary', 'unique', 'epic', 'rare', 'magic', 'common'];
  const ranks = summary.rows.map(row => order.indexOf(row.rarity));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), '전설이 위로');
  // 레전드 장비는 전광판 몫으로 따로 모인다.
  assert.equal(summary.legendary.length, summary.rarityCounts.legendary);
  assert(summary.legendary.every(item => item.rarity === 'legendary'));
  // 1개 열기와 같은 결과 규칙 — 장비는 `+N`·티어 상한 안, 스탯북은 종류가 셋 중 하나.
  for (const item of save.bag) {
    if (item.kind === 'statbook') assert(['attack', 'defense', 'health'].includes(item.book));
    else assert(item.plus <= items.maxPlusFor(save.maxFloor));
  }
});

test('한 번에 열기 — 가방 40칸은 절대 늘지 않는다(딱 40칸·40칸 초과 세이브도 전부 열린다)', () => {
  const gear = index => ({ id: `g${index}`, name: '두손검', slot: 'weapon', rarity: 'common', stats: { attack: 1 }, plus: 0 });
  // 38칸 + 주머니 2 = 40칸. 장비 결과만 나와도 40칸 그대로(주머니 1칸 → 결과 1칸).
  const full = freshSave(); full.maxFloor = 20; full.floor = 20;
  full.bag = [...Array.from({ length: 38 }, (_, index) => gear(index)), items.pouchItem('p1'), items.pouchItem('p2')];
  assert.equal(equipmentCount(full.bag), 40);
  const openedFull = batch.openPouches(full, { random: () => .60 });  // 항상 장비(분류 .60 ≥ 59%)
  assert.equal(openedFull.ok, true);
  assert.equal(pouch.pouchCount(full), 0, '40칸이어도 전부 열린다');
  assert.equal(equipmentCount(full.bag), 40, '칸 수는 그대로(늘지 않는다)');
  // 40칸을 넘긴 세이브(예전 규칙)도 같다 — 금화 결과면 칸이 줄어든다.
  const over = freshSave(); over.maxFloor = 20; over.floor = 20;
  over.bag = [...Array.from({ length: 40 }, (_, index) => gear(index)), items.pouchItem('q1'), items.pouchItem('q2')];
  const beforeOver = equipmentCount(over.bag);
  const openedOver = batch.openPouches(over, { random: () => .10 });  // 항상 금화
  assert.equal(openedOver.ok, true);
  assert.equal(equipmentCount(over.bag), beforeOver - 2, '금화 2개 = 2칸 감소');
});

test('한 번에 열기 — 결과 요약은 장비·스탯북을 `×N`으로 묶고 토스트 한 줄을 만든다', () => {
  const sword = { id: 's1', name: '황혼의 두손검', slot: 'weapon', rarity: 'rare', stats: { attack: 9 }, plus: 0 };
  const bookA = { id: 'b1', name: '공격의 서', slot: 'statbook', kind: 'statbook', book: 'attack', rarity: 'unique', stats: {} };
  const bookB = { id: 'b2', name: '공격의 서', slot: 'statbook', kind: 'statbook', book: 'attack', rarity: 'unique', stats: {} };
  const summary = batch.summarizePouchResults([
    { kind: 'gold', gold: 3000 },
    { kind: 'equipment', item: sword },
    { kind: 'equipment', item: { ...sword, id: 's2' } },
    { kind: 'statbook', item: bookA },
    { kind: 'statbook', item: bookB }
  ], 0);
  assert.equal(summary.opened, 5);
  assert.equal(summary.gold, 3000);
  assert.equal(summary.equipmentCount, 2);
  assert.equal(summary.bookTotal, 2);
  assert.deepEqual(summary.rarityCounts, { common: 0, magic: 0, rare: 2, epic: 0, unique: 0, legendary: 0 });
  assert.deepEqual(summary.bookCounts, { attack: 2, defense: 0, health: 0 });
  assert.deepEqual(summary.rows.map(row => [row.name, row.count]), [['공격의 서', 2], ['황혼의 두손검', 2]]);
  assert.equal(batch.pouchBatchText(summary), '금화 3,000 · 장비 2개 · 영구 스탯북 2권');
  assert.equal(batch.pouchBatchText({ gold: 0, equipmentCount: 0, bookTotal: 0 }), '획득 없음');
});

test('서버 계약 — 주머니 최대 금화는 확률표의 최댓값과 같다', () => {
  const top = Math.max(...pouch.POUCH_GOLD_TIERS.map(tier => tier.gold));
  assert.equal(POUCH_MAX_GOLD, top, 'src/game/pouch.ts POUCH_GOLD_TIERS 최댓값');
});

test('서버 저장 상한 — 한 번에 열어 금화가 몰리면 상한에 잘리고, 주머니 소모 몫을 더하면 그대로 통과한다', () => {
  // 1층·짧은 창(0초)에서 사냥 시간 기준 금화 상한은 5,000G보다 작다.
  const previous = withPouches(3, 1000, 1);
  const plain = { ...structuredClone(previous), bag: [], gold: 1000 + 15000 };
  const clamped = clampSaveProgress(structuredClone(previous), plain, { elapsedSeconds: 0 });
  assert(clamped.clamped.includes('gold'), '주머니 3개(최대 15,000G)는 사냥 시간 상한에 걸린다');
  assert(plain.gold < 16000, `잘린 금화 ${plain.gold}`);
  // 소모된 주머니 3개 × 5,000G를 정당한 금화로 더하면 그대로다.
  const credited = { ...structuredClone(previous), bag: [], gold: 1000 + 15000 };
  const kept = clampSaveProgress(structuredClone(previous), credited, { elapsedSeconds: 0, goldCredit: 3 * POUCH_MAX_GOLD });
  assert(!kept.clamped.includes('gold'), '주머니 몫은 자르지 않는다');
  assert.equal(credited.gold, 16000);
});

test('서버 소유 기록 — 이번 저장에서 소모된 주머니 수를 금화 크레딧으로 돌려준다(창고로 옮긴 주머니는 세지 않는다)', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-pouch-gold-'));
  const db = createClient({ url: `file:${join(directory, 'pouch.db')}` });
  try {
    await schema(db);
    const owner = (item, location) => db.execute({
      sql: 'INSERT INTO djrpg_item_owners VALUES (?,?,?,?)',
      args: [item.id, 'pouch-gold-acc', location, JSON.stringify(item)]
    });
    // ① 가방의 주머니 2개를 깠다(소유 위치 inventory) → 2 × 5,000G.
    const before = withPouches(2, 0, 10);
    for (const item of before.bag) await owner(item, 'inventory');
    // ② 창고로 옮긴 주머니 1개 — 소모가 아니다.
    const stored = items.pouchItem('warehouse-pouch');
    before.bag.push(stored);
    await db.execute({ sql: 'INSERT INTO djrpg_item_owners VALUES (?,?,?,?)', args: [stored.id, 'pouch-gold-acc', 'warehouse', JSON.stringify(stored)] });
    const after = { ...structuredClone(before), bag: [], gold: 10000 };
    const result = await transaction(db, tx => reconcileItems(tx, 'pouch-gold-acc', before, after));
    assert.equal(result.pouchGold, 2 * POUCH_MAX_GOLD, '소모 2개만 · 창고 1개 제외');
    // ③ 소모된 주머니가 다시 보이지 않으면 다음 저장의 크레딧은 0이다(반복 청구 차단).
    const again = await transaction(db, tx => reconcileItems(tx, 'pouch-gold-acc', after, { ...structuredClone(after), gold: 10000 }));
    assert.equal(again.pouchGold, 0, '이미 소모된 주머니는 다시 세지 않는다');
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('화면 — 보유 2개 이상이면 [전부 열기 (N개)]가 서고, 누르면 결과 요약으로 바뀌고 [확인]으로 닫힌다', async () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = withPouches(3);
    const messages = [];
    let changes = 0;
    const ui = { root: element(), modal: element(), openModal: 'equipment', renderModal() {}, message(text) { messages.push(text); }, sharePouchLegend() {}, world: { save, onChange() { changes++; } } };
    const api = openPouchWindow(ui, undefined, { delay: 0 });
    const button = find(api.overlay, node => node.className === 'pouch-open-all');
    assert(button, '전부 열기 버튼');
    assert.equal(button.textContent, '전부 열기 (3개)');
    assert.equal(api.batch.hidden, true, '요약은 처음에 숨겨져 있다');
    button.onclick();
    assert.equal(pouch.pouchCount(save), 0, '한 번에 모두 연다');
    assert.equal(changes, 1, '세이브 반영은 한 번');
    assert.equal(api.batch.hidden, false, '결과 요약이 무대 자리에 뜬다');
    assert.equal(find(api.overlay, node => node.className === 'pouch-window-stage').hidden, true, '주머니 그림은 숨긴다');
    const panel = api.batch.children[0];
    assert.equal(panel.className, 'pouch-batch');
    assert.equal(find(panel, node => node.className === 'pouch-batch-title').textContent, '보물 주머니 3개를 열었습니다');
    assert(find(panel, node => node.className === 'pouch-batch-followup').textContent.includes('모두 열었습니다'));
    assert(messages.some(text => text.includes('보물 주머니 3개 →')), '토스트는 한 줄');
    const primary = find(api.overlay, node => node.className.includes('pouch-open is-primary'));
    assert.equal(primary.textContent, '확인');
    assert.equal(button.parent.hidden, true, '전부 열기는 요약 뒤에 숨는다');
    primary.onclick();
    assert.equal(ui.root.children.length, 0, '[확인]으로 닫힌다');
  } finally { globalThis.document = previous; }
});

test('화면 — 주머니가 1개면 [전부 열기]를 띄우지 않는다(1개 열기와 같다)', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = { root: element(), modal: element(), openModal: 'equipment', renderModal() {}, message() {}, sharePouchLegend() {}, world: { save: withPouches(1), onChange() {} } };
    const api = openPouchWindow(ui, undefined, { delay: 0 });
    const button = find(api.overlay, node => node.className === 'pouch-open-all');
    assert.equal(button.parent.hidden, true);
    // 1개를 까도 다시 뜨지 않는다.
    find(api.overlay, node => node.textContent === '열기').onclick();
    assert.equal(button.parent.hidden, true);
  } finally { globalThis.document = previous; }
});

test('결과 요약 패널 — 합계·등급·목록을 그리고 CSS가 폰 화면에서 자라지 않게 막는다', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const sword = { id: 's1', name: '황혼의 두손검', slot: 'weapon', rarity: 'legendary', stats: { attack: 9 }, plus: 0 };
    const summary = batch.summarizePouchResults([{ kind: 'gold', gold: 5000 }, { kind: 'equipment', item: sword }], 0);
    const panel = pouchBatchPanel(summary);
    assert.equal(panel.children[0].textContent, '보물 주머니 2개를 열었습니다');
    const totals = find(panel, node => node.className === 'pouch-batch-totals');
    assert(totals.children.some(node => node.className.includes('pouch-batch-gold')), '금화 합계');
    assert(totals.children.some(node => node.textContent === '장비 1개'));
    const grades = find(panel, node => node.className === 'pouch-batch-grades');
    assert.equal(grades.children.length, 1, '0인 등급은 빼고 한 줄');
    assert.equal(grades.children[0].textContent, '전설 1');
    assert.equal(grades.children[0].style.color, pouch.POUCH_RARITY_INK.legendary, '인게임 등급색');
    const row = find(panel, node => node.className.includes('pouch-batch-row'));
    assert(row.className.includes('rarity-legendary'));
    assert(find(row, node => node.className === 'pouch-batch-name').textContent === '황혼의 두손검');
    assert(find(row, node => node.className === 'pouch-batch-count').textContent === '×1');
    // 금화만 나온 경우 빈 목록 대신 한 줄.
    const goldOnly = pouchBatchPanel(batch.summarizePouchResults([{ kind: 'gold', gold: 1500 }], 0));
    assert.equal(find(goldOnly, node => node.className === 'pouch-batch-empty').textContent, '나온 장비·스탯북은 없습니다');
    // CSS — 요약은 카드 안에서만 자라고(46dvh) 스크롤한다. 버튼·숨김 규칙도 있다.
    const rule = css.match(/\.pouch-batch \{([^}]*)\}/);
    assert(rule && /max-height: 46dvh/.test(rule[1]) && /overflow-y: auto/.test(rule[1]), '요약은 46dvh까지');
    assert(css.includes('.pouch-open-all'), '전부 열기 버튼 스타일');
    assert(/\.pouch-window-batch\[hidden\] \{ display: none; \}/.test(css), '숨긴 줄은 자리를 차지하지 않는다');
    assert(/\.pouch-window-stage\[hidden\] \{ display: none; \}/.test(css), 'display:flex 무대도 hidden이면 감춘다');
    assert(/\.pouch-batch-row \{([^}]*)\}/.test(css), '목록 줄');
  } finally { globalThis.document = previous; }
});

// ── helpers ──────────────────────────────────────────────────────────────────
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
