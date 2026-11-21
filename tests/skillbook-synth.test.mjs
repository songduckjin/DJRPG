import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import './ts-loader.mjs';

const { freshSave } = await import('../src/game/store.ts');
const items = await import('../src/game/items.ts');
const pouch = await import('../src/game/pouch.ts');
const synth = await import('../src/game/skillSynth.ts');
const { isPreviewHostname } = await import('../src/game/previewOnly.ts');
const skills = await import('../src/game/skills.ts');
const { openSynthWindow } = await import('../src/ui/modals/synthModal.ts');
const { schema, account, transaction, reconcileItems } = await import('../server/database.mjs');
const { skillBookJobOf } = await import('../server/skill-ids.mjs');
const css = readFileSync(new URL('../src/styles/modals.css', import.meta.url), 'utf8');
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** 작업 251 — 가방 `합성`(타직업 스킬북 5권 → 내 직업 1권)과 미리보기 전용 보물 주머니 정리. */

const book = (id, skillId, name = '스킬북') => ({ id, name: `[스킬북] ${name}`, slot: 'skillbook', kind: 'skillbook', skillId, rarity: 'rare', stats: {} });
const gear = id => ({ id, name: '강철 쯔바이핸드', slot: 'weapon', rarity: 'rare', stats: { attack: 25 } });
const pouchItem = id => ({ id, name: '무작위 보물 주머니', slot: 'pouch', kind: 'pouch', rarity: 'unique', stats: {} });
/** 궁수(내 직업이 아님) 액티브 — 합성 재료. */
const foreign = (id) => book(id, 'doubleShot', '더블 샷');
/** 마법사(내 직업이 아님) 패시브 — 합성 재료. */
const foreignMage = (id) => book(id, 'staffMastery', '지팡이 숙련');
/** 전사(내 직업) 액티브 — 재료가 아니다. */
const mine = id => book(id, 'spin', '드래곤 트위스터');
/** 결정적 난수. */
function seeded(seed = 7) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const warriorSave = (bag) => { const save = freshSave('male', 'warrior'); save.bag = bag; return save; };

test('합성 재료는 가방의 타직업 스킬북만 — 내 직업 책·장비·주머니·잠긴 책은 뺀다', () => {
  const locked = { ...foreignMage('locked'), locked: true };
  const save = warriorSave([foreign('a'), mine('b'), gear('c'), pouchItem('d'), foreignMage('e'), locked]);
  assert.deepEqual(synth.synthMaterials(save).map(entry => entry.id), ['a', 'e']);
  assert.equal(synth.synthCapacity(warriorSave([foreign('1'), foreign('2'), foreign('3'), foreign('4')])), 0, '4권이면 아직 0회');
  assert.equal(synth.synthCapacity(warriorSave([foreign('1'), foreign('2'), foreign('3'), foreign('4'), foreignMage('5')])), 1);
  assert.equal(synth.synthCapacity(warriorSave([foreign('1'), foreign('2'), foreign('3'), foreign('4'), foreignMage('5'), foreign('6'), mine('7')])), 1, '내 직업 책은 세지 않는다');
});

test('5권 미만이면 합성하지 않고 가방을 그대로 둔다', () => {
  const save = warriorSave([foreign('a'), foreign('b'), foreign('c'), foreign('d')]);
  const outcome = synth.synthesizeSkillBooks(save, ['a', 'b', 'c', 'd']);
  assert.equal(outcome.ok, false);
  assert.match(outcome.message, /5권/);
  assert.equal(save.bag.length, 4);
  assert.equal(synth.synthesizeAllAvailable(save).ok, false);
  assert.equal(save.bag.length, 4);
});

test('5권을 소모해 내 직업 스킬북 1권이 나오고, 가방은 4칸 줄어든다', () => {
  const save = warriorSave([foreign('a'), foreign('b'), foreignMage('c'), foreign('d'), foreignMage('e'), gear('keep')]);
  const outcome = synth.synthesizeSkillBooks(save, ['a', 'b', 'c', 'd', 'e'], seeded(3));
  assert.equal(outcome.ok, true);
  assert.equal(outcome.consumed.length, 5);
  assert.equal(outcome.books.length, 1);
  const made = outcome.books[0];
  assert.equal(items.isSkillBook(made), true);
  assert.equal(items.skillBookJob(made), 'warrior', '내 직업(전사) 책이 나온다');
  assert.deepEqual(save.bag.map(item => item.id).sort(), ['keep', made.id].sort());
  assert.equal(save.bag.length, 2, '6칸 - 5 + 1 = 2칸');
});

test('합성 결과는 내 직업 11종(액티브 8 + 패시브 3)에서만 나온다', () => {
  const draw = seeded(11), seen = new Set();
  const save = warriorSave([]);
  for (let round = 0; round < 400; round++) {
    const made = items.rollSkillBookFor('warrior', draw);
    assert.equal(items.skillBookJob(made), 'warrior');
    seen.add(made.skillId);
  }
  const warriorIds = [...skills.skillOrderFor('warrior'), ...skills.passiveOrderFor('warrior')];
  assert.deepEqual([...seen].sort(), [...warriorIds].sort(), '11종이 모두 나온다(1/11)');
  assert.equal(save.bag.length, 0);
});

test('`자동 합성`은 12권에서 10권을 소모해 2권을 만들고 2권을 남긴다', () => {
  const bag = Array.from({ length: 12 }, (_, index) => index % 2 ? foreign(`f${index}`) : foreignMage(`f${index}`));
  const save = warriorSave([...bag, mine('my'), gear('g')]);
  const outcome = synth.synthesizeAllAvailable(save, seeded(5));
  assert.equal(outcome.ok, true);
  assert.equal(outcome.consumed.length, 10, '5×2권 소모');
  assert.equal(outcome.books.length, 2, '내 직업 책 2권');
  const left = save.bag.filter(items.isSkillBook).map(item => item.id);
  assert.equal(left.length, 5, '남은 타직업 2권 + 새 책 2권 + 내 직업 책 1권');
  assert.deepEqual([...left].sort(), ['f10', 'f11', 'my', ...outcome.books.map(entry => entry.id)].sort(), '앞의 10권이 소모되고 뒤 2권이 남는다');
  assert.equal(save.bag.filter(item => item.id === 'g').length, 1, '장비는 그대로');
  assert.equal(save.bag.filter(item => item.id === 'my').length, 1, '내 직업 책도 그대로');
  // 같은 책이 여러 권이면 결과 화면은 `×N` 하나로 묶는다.
  const stacks = synth.stackSynthBooks([outcome.books[0], outcome.books[0], outcome.books[1]]);
  assert.equal(stacks.reduce((sum, stack) => sum + stack.count, 0), 3);
});

test('잠긴 책·내 직업 책은 수동 합성에서도 거절된다', () => {
  const save = warriorSave([foreign('a'), foreign('b'), foreign('c'), foreign('d'), { ...foreignMage('e'), locked: true }]);
  const locked = synth.synthesizeSkillBooks(save, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(locked.ok, false);
  assert.match(locked.message, /잠긴/);
  save.bag[4] = mine('e');
  const own = synth.synthesizeSkillBooks(save, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(own.ok, false);
  assert.match(own.message, /합성 재료로 쓸 수 없습니다/);
  assert.equal(save.bag.length, 5, '실패하면 아무것도 소모하지 않는다');
});

// ── 서버 저장 통과: 40칸을 넘긴 세이브에서 5권 제거 + 1권 생성(순감 -4) ──────────────
let db, directory;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'synth-'));
  db = createClient({ url: `file:${join(directory, 'test.db')}` });
  await schema(db);
});
after(async () => { await db?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });

test('40칸을 넘긴 세이브도 5권 제거+1권 생성(순감 -4)이면 서버 reconcileItems를 통과한다', async () => {
  const id = 'synth-overflow';
  const foreignIds = Array.from({ length: 5 }, () => randomUUID());
  const bag = [...Array.from({ length: 40 }, (_, index) => gear(randomUUID())), ...foreignIds.map(value => ({ id: value, name: '[스킬북] 더블 샷', slot: 'skillbook', kind: 'skillbook', skillId: 'doubleShot', rarity: 'rare', stats: {} }))];
  const seed = { version: 1, name: '전사', gender: 'male', job: 'warrior', gold: 0, bag, equipment: {}, equipmentCollection: [], kills: 0, bossKills: 0, playSeconds: 0, level: 1, floor: 1, maxFloor: 1, learned: [], passives: [], skillLevels: {} };
  await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: [id, 'test-password-hash', JSON.stringify(seed), new Date().toISOString()] });
  const row = await account(db, id);
  assert.equal(row.save.bag.length, 45, '45칸(넘긴 상태)에서 시작');
  const after = structuredClone(row.save);
  const outcome = synth.synthesizeSkillBooks(after, foreignIds, seeded(9));
  assert.equal(outcome.ok, true);
  assert.equal(after.bag.length, 41, '45 - 5 + 1 = 41');
  await transaction(db, tx => reconcileItems(tx, id, row.save, after, { slot: 1 }));
  const made = outcome.books[0];
  const owner = (await db.execute({ sql: 'SELECT * FROM djrpg_item_owners WHERE item_id=?', args: [made.id] })).rows[0];
  assert(owner, '새 책의 소유 기록이 생긴다');
  assert.equal(owner.location, 'inventory');
  assert.equal(skillBookJobOf(made.skillId), 'warrior');
});

// ── [미리보기 전용] 보물 주머니 버리지·40칸 초과 개봉 ─────────────────────────────
test('보물 주머니는 40칸을 넘은 가방에서도 열린다(칸이 늘지 않는다)', () => {
  const bag = [...Array.from({ length: 45 }, (_, index) => pouchItem(`p${index}`))];
  const save = warriorSave(bag);
  const opened = pouch.openPouch(save, 'p0', () => .99); // 스킬북(5%) — 1개 나와도 칸 수는 그대로
  assert.equal(opened.ok, true);
  assert.equal(save.bag.length, 45, '주머니 -1, 결과 +1 = 그대로');
  const gold = pouch.openPouch(save, 'p1', () => 0); // 금화 1,500
  assert.equal(gold.ok, true);
  assert.equal(save.bag.length, 44, '금화면 1칸 줄어든다');
});

test('[미리보기 전용] 주머니 버리기 1개·모두 버리기가 가방에서 지운다', () => {
  const save = warriorSave([pouchItem('a'), pouchItem('b'), pouchItem('c'), gear('g')]);
  const one = pouch.discardPouch(save, 'b');
  assert.equal(one.ok, true);
  assert.equal(one.removed, 1);
  assert.deepEqual(save.bag.map(item => item.id), ['a', 'c', 'g']);
  const all = pouch.discardAllPouches(save);
  assert.equal(all.ok, true);
  assert.equal(all.removed, 2);
  assert.deepEqual(save.bag.map(item => item.id), ['g'], '장비는 남는다');
  assert.equal(pouch.discardAllPouches(save).ok, false, '없으면 실패');
});

test('미리보기 호스트 판정 — preview가 들어간 호스트만, 운영 djrpg.pages.dev는 아니다', () => {
  assert.equal(isPreviewHostname('preview-gravel-background-fk.djrpg.pages.dev'), true);
  assert.equal(isPreviewHostname('djrpg.pages.dev'), false);
  assert.equal(isPreviewHostname('example.com'), false);
  assert.equal(isPreviewHostname(''), false);
});

// ── 팝업: 빈칸 5개·자동 채우기·합성하기·자동 합성 ────────────────────────────────
class FakeClassList {
  values = new Set();
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    const next = force === undefined ? !this.values.has(name) : Boolean(force);
    if (next) this.values.add(name); else this.values.delete(name);
    return next;
  }
}
class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.dataset = {};
    this.classList = new FakeClassList(); this.className = ''; this.textContent = ''; this.style = { setProperty() {}, removeProperty() {} };
    this.disabled = false; this.hidden = false; this.removed = false;
  }
  get firstElementChild() { return this.children.find(child => child && typeof child === 'object' && child.tagName) ?? null; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 30, height: 30, right: 30, bottom: 30 }; }
  remove() { this.removed = true; }
}
const walk = node => [node, ...((node.children || []).filter(child => child && typeof child === 'object')).flatMap(walk)];

function installDom() {
  const original = globalThis.document;
  const body = new FakeElement('body');
  globalThis.document = { createElement: tag => new FakeElement(tag), createTextNode: text => ({ textContent: text }), body };
  return () => { globalThis.document = original; };
}

function synthFixture(bag) {
  const root = new FakeElement('main');
  const save = warriorSave(bag);
  const ui = {
    root, openModal: 'equipment', world: { save, onChange() { this.changed = (this.changed || 0) + 1; } },
    modal: { hidden: false, querySelector: () => null }, messages: [], message(text) { this.messages.push(text); },
    renderModal() { this.rendered = true; }
  };
  return { ui, save, root };
}

test('합성 팝업은 빈칸 5개를 늘 보여 주고, 자동 채우기·합성하기·자동 합성 (N회)을 그린다', () => {
  const restore = installDom();
  try {
    const { ui } = synthFixture([foreign('a'), foreign('b'), foreign('c'), foreign('d'), foreign('e'), foreign('f'), foreign('g')]);
    const windowApi = openSynthWindow(ui, { delay: 0 });
    const nodes = walk(windowApi.overlay);
    const slots = walk(windowApi.slots).filter(node => node.className === 'synth-slot');
    assert.equal(slots.length, 5, '빈칸은 늘 5개');
    assert(slots.every(slot => !slot.classList.contains('is-filled')), '열면 비어 있다');
    const texts = nodes.map(node => node.textContent);
    assert(texts.includes('자동 채우기'));
    assert(texts.includes('합성하기 (0/5)'));
    assert(texts.includes('자동 합성 (1회)'), '7권이면 1회');
    assert.equal(nodes.filter(node => node.className === 'synth-material').length, 7, '타직업 책 7권이 목록에');
    windowApi.close();
    assert.equal(windowApi.overlay.removed, true);
  } finally { restore(); }
});

test('자동 채우기는 빈칸을 5권으로 채우고, 합성하기는 1권 결과를 보여 준다', () => {
  const restore = installDom();
  try {
    const { ui, save } = synthFixture([foreign('a'), foreign('b'), foreign('c'), foreign('d'), foreign('e'), gear('g')]);
    const windowApi = openSynthWindow(ui, { delay: 0 });
    const nodes = walk(windowApi.overlay);
    const fill = nodes.find(node => node.textContent === '자동 채우기');
    fill.onclick();
    const slots = walk(windowApi.slots).filter(node => node.className === 'synth-slot');
    assert(slots.every(slot => slot.classList.contains('is-filled')), '5칸이 모두 찼다');
    const craft = nodes.find(node => String(node.textContent).startsWith('합성하기'));
    assert.equal(craft.disabled, false);
    craft.onclick();
    assert.equal(save.bag.filter(items.isSkillBook).length, 1, '5권 → 1권');
    assert.equal(save.bag.length, 2, '장비 1 + 새 책 1');
    assert.equal(ui.world.changed, 1, '바로 저장한다');
    const result = walk(windowApi.result);
    assert.equal(windowApi.result.dataset.count, '1');
    assert(result.some(node => String(node.className) === 'synth-result-title'));
  } finally { restore(); }
});

test('연출 중에는 이미 소모된 5권이 칸에 남아 모여들고, 연출이 끝나면 결과가 뜬다', async () => {
  const restore = installDom();
  try {
    const { ui, save } = synthFixture([foreign('a'), foreign('b'), foreign('c'), foreign('d'), foreign('e')]);
    const windowApi = openSynthWindow(ui, { delay: 40 });
    const nodes = walk(windowApi.overlay);
    nodes.find(node => node.textContent === '자동 채우기').onclick();
    nodes.find(node => String(node.textContent).startsWith('합성하기')).onclick();
    assert.equal(save.bag.filter(items.isSkillBook).length, 1, '누르는 순간 5권이 차감된다');
    const during = walk(windowApi.slots).filter(node => node.className === 'synth-slot');
    assert(during.every(slot => slot.classList.contains('is-filled')), '차감된 5권이 칸에 남아 연출된다');
    assert(windowApi.overlay.children.some(child => child.className === 'synth-window-card'));
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(windowApi.result.dataset.count, '1', '연출이 끝나면 결과 1권');
    const after = walk(windowApi.slots).filter(node => node.className === 'synth-slot');
    assert(after.every(slot => !slot.classList.contains('is-filled')), '칸은 다시 빈다');
  } finally { restore(); }
});

test('자동 합성은 남은 만큼(12권 → 2회) 한 번에 소모하고 결과 2권을 한 화면에 나열한다', () => {
  const restore = installDom();
  try {
    const bag = Array.from({ length: 12 }, (_, index) => index % 2 ? foreign(`f${index}`) : foreignMage(`f${index}`));
    const { ui, save } = synthFixture([...bag, gear('g')]);
    const windowApi = openSynthWindow(ui, { delay: 0 });
    const auto = walk(windowApi.overlay).find(node => String(node.textContent).startsWith('자동 합성'));
    assert.equal(auto.textContent, '자동 합성 (2회)');
    auto.onclick();
    assert.equal(save.bag.filter(item => String(item.kind) === 'skillbook').length, 4, '남은 재료 2권 + 결과 2권');
    assert.equal(save.bag.filter(items.isSkillBook).filter(item => items.skillBookJob(item) === 'warrior').length, 2, '내 직업 책 2권');
    assert.equal(windowApi.result.dataset.count, '2');
    const resultNodes = walk(windowApi.result).filter(node => node.className === 'synth-result-item');
    assert.equal(resultNodes.reduce((sum, node) => sum + Number((walk(node).find(child => child.className === 'synth-result-count')?.textContent ?? '×1').slice(1)), 0), 2, '결과 2권이 모두 보인다');
  } finally { restore(); }
});

test('합성 CSS는 모임·섬광·허물·결과 등장과 모션 감소 규칙을 갖는다', () => {
  for (const rule of ['is-gathering', 'is-charging', 'is-burst', 'synth-husk', 'synth-flash', 'synth-result-item', 'prefers-reduced-motion']) {
    assert(rules.includes(rule), `${rule} 규칙이 있다`);
  }
  assert(rules.includes('--synth-dx'), '가운데로 모이는 거리는 변수로 넘긴다');
});
