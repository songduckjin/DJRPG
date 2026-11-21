import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';
const { freshSave, totalStats } = await import('../src/game/store.ts');
const { skillOrder, passiveOrder } = await import('../src/game/skills.ts');
const { renderSkills, skillActions, skillChips, skillMeta, resolveSkillSelection } = await import('../src/ui/modals/skillModal.ts');
const { resetModalDefaults } = await import('../src/ui/modalDefaults.ts');

/** 작업 266 — 스킬 창 B안(2열 타일 + 하단 고정 액션 바). */
const book = (id, skillId) => ({ id, name: `[스킬북] ${skillId}`, slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId, stats: {} });

function element(tag = 'div') {
  const node = {
    tag, className: '', textContent: '', attrs: {}, dataset: {}, style: {}, title: '', disabled: false, hidden: false,
    children: [], parentNode: null,
    classList: {
      add(name) { if (!node.className.split(/\s+/).includes(name)) node.className = `${node.className} ${name}`.trim(); },
      remove(name) { node.className = node.className.split(/\s+/).filter(token => token && token !== name).join(' '); },
      contains: name => node.className.split(/\s+/).includes(name),
      toggle(name, on) { if (on === undefined ? !node.classList.contains(name) : on) node.classList.add(name); else node.classList.remove(name); }
    },
    append(...kids) { for (const kid of kids) node.appendChild(kid); },
    appendChild(kid) { if (kid && typeof kid === 'object') { kid.parentNode = node; node.children.push(kid); } return kid; },
    setAttribute(key, value) { node.attrs[key] = value; if (key === 'aria-expanded') node['aria-expanded'] = value; },
    remove() { if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node); },
    focus() {},
    querySelector(selector) { return query(node, selector); }
  };
  Object.defineProperty(node, 'innerHTML', { get() { return ''; }, set() {} });
  return node;
}
/** `.class` 선택자만 다루는 최소 querySelector — 화면 코드가 쓰는 만큼만. */
function query(root, selector) {
  const token = selector.replace(/^\./, '').split(/[ >]/)[0];
  for (const child of root.children ?? []) {
    if (String(child.className).split(/\s+/).includes(token)) return child;
    const found = query(child, selector);
    if (found) return found;
  }
  return null;
}
function walk(root, out = []) { for (const child of root.children ?? []) { out.push(child); walk(child, out); } return out; }

function uiFixture(job = 'warrior') {
  const save = freshSave('male', job), messages = [], renders = [];
  // 밸런스 v2(PR #307)부터 새 캐릭터가 첫 액티브를 습득한 채로 시작할 수 있다 — 이 파일은 화면 규칙만 보므로 비운다.
  save.learned = []; save.skillLevels = {};
  let dialog = element('div');
  const ui = {
    world: { save, paused: false, player: { hp: 100 }, onChange() { ui.changes++; } },
    market: { busy: false, sync: { locked: false } },
    changes: 0, messages, renders, skillFilter: 'all', skillInfoOpen: false, skillScroll: 0,
    message(text) { messages.push(text); },
    chooseSkill(id) { ui.chosen = id; },
    renderModal() { renders.push(ui.skillSelected); dialog = element('div'); renderSkills.call(ui, dialog); return dialog; },
    get dialog() { return dialog; },
    render() { dialog = element('div'); renderSkills.call(ui, dialog); return dialog; }
  };
  return ui;
}
const byClass = (root, token) => walk(root).filter(node => String(node.className).split(/\s+/).includes(token));
const textOf = (root, token) => byClass(root, token).map(node => node.textContent);

// ── ① 타일 상태 칩 ──────────────────────────────────────────────────────────
test('타일 칩은 장착중·강화!·고정·미습득 네 가지이고 한 타일이 여럿을 가질 수 있다', () => {
  const save = freshSave('male', 'warrior');
  save.learned = []; save.skillLevels = {};
  assert.deepEqual(skillChips(save, 'attack'), ['fixed'], '기본 공격은 고정 슬롯');
  assert.deepEqual(skillChips(save, 'spin'), ['unlearned'], '미습득');
  save.learned = ['spin', 'slam'];
  assert.deepEqual(skillChips(save, 'spin'), [], '습득만 하고 책이 없으면 칩이 없다');
  save.bag = [book('b1', 'spin')];
  assert.deepEqual(skillChips(save, 'spin'), ['upgrade'], '바로 강화할 책이 있으면 강화!');
  assert.deepEqual(skillChips(save, 'slam'), [], '다른 스킬 책은 그 스킬에 붙지 않는다');
  save.quickSlots = ['spin', null, null];
  assert.deepEqual(skillChips(save, 'spin'), ['equipped', 'upgrade'], '장착중 + 강화!를 함께');
  save.passives = ['mastery'];
  assert.deepEqual(skillChips(save, 'mastery'), [], '패시브는 장착이 없어 장착중 칩이 없다');
});

// ── ② 기본 선택 ─────────────────────────────────────────────────────────────
test('창을 열면 장착 중인 스킬 → 습득한 스킬 → 첫 타일 순으로 액션 바 대상을 고른다', () => {
  const save = freshSave('male', 'warrior');
  save.learned = []; save.skillLevels = {};
  assert.equal(resolveSkillSelection(save, 'warrior', 'all'), 'attack', '아무것도 없으면 기본 공격');
  save.learned = ['power', 'hell'];
  assert.equal(resolveSkillSelection(save, 'warrior', 'all'), 'power', '습득한 첫 스킬');
  save.quickSlots = [null, 'hell', null];
  assert.equal(resolveSkillSelection(save, 'warrior', 'all'), 'hell', '장착 중인 스킬 우선');
  assert.equal(resolveSkillSelection(save, 'warrior', 'all', 'power'), 'power', '고른 타일은 그대로 유지');
  assert.equal(resolveSkillSelection(save, 'warrior', 'passive', 'power'), passiveOrder[0], '탭에 없으면 그 탭의 첫 타일로');
  assert.equal(resolveSkillSelection(save, 'warrior', 'active', 'mastery'), 'hell', '장착 중인 액티브로 돌아온다');
});

// ── ③ 액션 바 버튼 ──────────────────────────────────────────────────────────
test('액션 바 버튼은 액티브 [장착·강화·정보], 장착 중이면 [해제·강화·정보], 패시브는 [강화·정보]다', () => {
  const ui = uiFixture(), save = ui.world.save;
  save.learned = ['spin', 'slam'];
  let actions = skillActions(ui, 'spin');
  assert.deepEqual(actions.map(action => action.id), ['equip', 'upgrade', 'info']);
  assert.equal(actions[0].label, '장착');
  assert.equal(actions[0].disabled, false);
  assert.equal(actions[1].label, '강화');
  assert.equal(actions[1].disabled, true, '책이 없으면 강화가 잠긴다');
  save.quickSlots = ['spin', null, null];
  actions = skillActions(ui, 'spin');
  assert.equal(actions[0].label, '해제', '장착 중이면 같은 자리가 해제');
  assert.equal(actions[0].disabled, false);
  actions = skillActions(ui, 'slam');
  assert.equal(actions[0].label, '장착');
  actions = skillActions(ui, 'power');
  assert.equal(actions[0].label, '장착');
  assert.equal(actions[0].disabled, true, '미습득은 장착할 수 없다');
  assert.equal(actions[1].label, '습득', '미습득은 강화 대신 습득');
  actions = skillActions(ui, 'mastery');
  assert.deepEqual(actions.map(action => action.id), ['upgrade', 'info'], '패시브는 장착 버튼이 없다');
  assert.equal(actions[0].label, '습득');
  actions = skillActions(ui, 'attack');
  assert.deepEqual(actions.map(action => action.label), ['고정', '강화', '정보']);
  assert.equal(actions[0].disabled, true);
  assert.equal(actions[1].disabled, true);
});

// ── ④ 능력치 줄 ─────────────────────────────────────────────────────────────
test('정보 줄은 쿨·지속·범위·위력 순서이고 패시브는 영구 적용 수치를 쓴다', () => {
  const save = freshSave('male', 'warrior');
  save.learned = []; save.skillLevels = {};
  save.learned = ['hell']; save.skillLevels = { hell: 3 };
  assert.equal(skillMeta(save, 'warrior', 'hell').stats, '쿨 16초 · 지속 1.1초 · 범위 193 · 위력 +20%');
  assert.equal(skillMeta(save, 'warrior', 'hell').level, 3);
  save.passives = ['mastery']; save.skillLevels.mastery = 3;
  assert.equal(skillMeta(save, 'warrior', 'mastery').stats, '영구 적용 · 공격 +19%');
  assert.equal(skillMeta(save, 'warrior', 'attack').name, '대검 베기');
  const archer = freshSave('male', 'archer'); archer.learned = []; archer.skillLevels = {};
  assert.equal(skillMeta(archer, 'archer', 'attack').stats, '쿨 0.48초 · 위력 × 1.6 · 고정 슬롯');
  assert.equal(skillMeta(save, 'warrior', 'spin').learned, false, '미습득 표시');
});

// ── ⑤ 그리기 ────────────────────────────────────────────────────────────────
test('창은 머리글·상단 바·스크롤 목록·액션 바 순서로 서고 액션 바는 목록 밖에 있다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture(), dialog = ui.render();
    const order = dialog.children.map(child => child.className);
    assert.deepEqual(order, ['skill-top-bar', 'skill-list', 'skill-action-bar']);
    const list = dialog.children[1], bar = dialog.children[2];
    assert.equal(query(bar, '.skill-list'), null, '액션 바 안에 목록이 없다');
    assert.ok(!walk(list).includes(bar), '액션 바는 스크롤 목록의 자식이 아니다');
    assert.equal(textOf(dialog, 'skill-filter-tab').join(','), '전체,액티브,패시브');
    assert.equal(byClass(dialog, 'skill-tile').length, 12, '패시브 3 + 기본 공격 1 + 액티브 8');
    assert.equal(byClass(list, 'skill-tile-grid').length, 2, '패시브·액티브 두 그리드');
  } finally { delete globalThis.document; }
});

test('타일에는 이름·Lv·칩만 있고 설명은 정보를 눌렀을 때 액션 바 안에서 펼쳐진다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture(), save = ui.world.save;
    save.learned = ['hell']; save.quickSlots = ['hell', null, null]; save.skillLevels = { hell: 3 };
    let dialog = ui.render();
    const tile = walk(dialog).find(node => node.dataset.skill === 'hell');
    assert.ok(tile, '회전참격 타일');
    assert.equal(query(tile, '.skill-tile-name').textContent, '회전참격');
    assert.equal(query(tile, '.skill-level').textContent, 'Lv.3');
    assert.equal(query(tile, '.skill-chip-equipped').textContent, '장착중');
    assert.equal(walk(tile).filter(node => node.tag === 'p').length, 0, '타일에 설명 문단이 없다');
    // 접힌 상태: 설명·능력치 줄이 없고 정보 버튼은 aria-expanded=false
    assert.equal(textOf(dialog, 'skill-action-desc').length, 0);
    const info = query(dialog, '.skill-action-info');
    assert.equal(info.attrs['aria-expanded'], 'false');
    info.onclick();
    assert.equal(ui.skillInfoOpen, true);
    dialog = ui.dialog;
    const desc = query(dialog, '.skill-action-desc');
    assert.ok(desc.textContent.startsWith('대검을 크게 휘둘러'), '설명이 액션 바 안에 펼쳐진다');
    assert.match(query(dialog, '.skill-action-stats').textContent, /^쿨 16초 · 지속 1\.1초 · 범위 193 · 위력 \+20%$/);
    assert.match(query(dialog, '.skill-action-cost').textContent, /^보유 0 \/ 필요 \d권$/);
    assert.equal(query(dialog, '.skill-action-info').attrs['aria-expanded'], 'true');
    assert.equal(query(dialog, '.skill-action-info').textContent, '정보 ▴');
    query(dialog, '.skill-action-info').onclick();
    assert.equal(ui.skillInfoOpen, false, '다시 누르면 접힌다');
    assert.equal(textOf(ui.dialog, 'skill-action-desc').length, 0);
  } finally { delete globalThis.document; }
});

test('미습득 타일은 `미습득`을 한 번만 보여 주고 칩을 겹쳐 붙이지 않는다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture();
    const dialog = ui.render();
    const tile = walk(dialog).find(node => node.dataset.skill === 'spin');
    const button = query(tile, '.skill-tile-button');
    assert.equal(query(tile, '.skill-level').textContent, '미습득');
    assert.equal(query(tile, '.skill-chip-unlearned'), null, 'Lv 자리가 이미 미습득이다');
    assert.ok(!String(button.attrs['aria-label']).includes('미습득 · 미습득'), '읽기 이름도 한 번만');
    assert.ok(String(button.attrs['aria-label']).endsWith('미습득'));
  } finally { delete globalThis.document; }
});

test('액션 바 강화는 책을 쓰고, 해제는 스킬 원을 비우고, 장착은 스킬 고르기로 넘긴다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture(), save = ui.world.save;
    save.learned = ['hell']; save.quickSlots = ['hell', null, null]; save.skillLevels = { hell: 2 };
    save.bag = [book('h1', 'hell'), book('h2', 'hell')];
    let dialog = ui.render();
    query(dialog, '.skill-action-upgrade').onclick();
    assert.equal(save.skillLevels.hell, 3, '액션 바 강화가 스킬북을 쓴다');
    assert.equal(save.bag.length, 1);
    assert.equal(ui.changes, 1, 'world.onChange로 저장·HUD 갱신');

    query(ui.dialog, '.skill-action-equip').onclick();
    assert.deepEqual(save.quickSlots, [null, null, null], '해제는 그 스킬 원을 비운다');
    assert.match(ui.messages.at(-1), /1번 스킬 원에서 해제/);

    query(ui.dialog, '.skill-action-equip').onclick();
    assert.equal(ui.chosen, 'hell', '장착은 기존 스킬 고르기 흐름으로 넘긴다');
  } finally { delete globalThis.document; }
});

test('패시브 타일에는 장착 버튼이 없고 정보 줄은 영구 적용 수치를 보여 준다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture(), save = ui.world.save;
    save.passives = ['mastery', 'body']; save.skillLevels = { mastery: 2 };
    ui.skillFilter = 'passive'; ui.skillInfoOpen = true;
    const dialog = ui.render();
    assert.equal(textOf(dialog, 'skill-action-button').join(','), '강화,정보 ▴');
    assert.equal(query(dialog, '.skill-action-stats').textContent, '영구 적용 · 공격 +17%');
    assert.equal(query(dialog, '.skill-action-label').textContent, '상시 적용');
    assert.equal(byClass(dialog, 'skill-tile').length, 3, '패시브 3장은 습득 여부와 무관하게 모두');
  } finally { delete globalThis.document; }
});

test('창을 닫으면 고른 타일·정보 펼침·스크롤 자리가 보기 상태로 돌아간다', () => {
  const ui = { skillFilter: 'passive', skillSelected: 'body', skillInfoOpen: true, skillScroll: 120, codexSelected: 'x',
    modal: { querySelector: () => null, querySelectorAll: () => [] } };
  resetModalDefaults(ui);
  assert.equal(ui.skillFilter, 'all');
  assert.equal(ui.skillSelected, undefined);
  assert.equal(ui.skillInfoOpen, false);
  assert.equal(ui.skillScroll, 0);
});

// ── ⑥ CSS 계약 ──────────────────────────────────────────────────────────────
test('CSS에 2열 그리드·스크롤 목록·고정 액션 바·상태 칩 규칙이 있다', () => {
  const css = modalStyles();
  const rule = selector => { const index = css.indexOf(`${selector} {`); assert.notEqual(index, -1, `${selector} 규칙이 없다`); return css.slice(index, css.indexOf('}', index) + 1); };
  assert.match(rule('.skill-tile-grid'), /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, '2열 타일');
  const dialog = rule('.modal-dialog.skills-modal');
  assert.match(dialog, /display: flex/);
  assert.match(dialog, /flex-direction: column/);
  assert.match(dialog, /overflow: hidden/, '창 자체는 스크롤하지 않는다');
  const list = rule('.skill-list');
  assert.match(list, /overflow-y: auto/, '목록만 스크롤');
  assert.match(list, /flex: 1 1 auto/);
  const bar = rule('.skill-action-bar');
  assert.match(bar, /flex: 0 0 auto/, '액션 바는 줄어들지 않는 고정 줄');
  assert.match(rule('.skill-action-button'), /flex: 1 1 0/, '버튼은 같은 폭');
  for (const chip of ['skill-chip-equipped', 'skill-chip-upgrade', 'skill-chip-fixed', 'skill-chip-unlearned']) {
    assert.ok(css.includes(`.${chip}`), `${chip} 규칙이 없다`);
  }
  assert.ok(css.includes('.skill-action-bar.is-info-open .skill-action-detail'), '정보 펼침 규칙');
});
