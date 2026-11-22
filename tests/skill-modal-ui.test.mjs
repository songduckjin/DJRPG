import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';
import { element, query, walk, byClass, one, textOf, withClasses } from './helpers/dom.mjs';
const { freshSave } = await import('../src/game/store.ts');
const { skillOrderFor, passiveOrderFor, skills, passives } = await import('../src/game/skills.ts');
const { skillTreeFor, skillValueRows, TIER_GATE } = await import('../src/game/skillTree.ts');
const { spLedger } = await import('../src/game/skillPoints.ts');
const { renderSkills } = await import('../src/ui/modals/skillModal.ts');
const { resolveSkillSelection } = await import('../src/ui/skillTreeView.ts');
const { resetModalDefaults } = await import('../src/ui/modalDefaults.ts');

/**
 * 4단계 스킬 트리 창(2026-11-22 스펙, 파트 A).
 *
 * 화면은 ① `.skill-top-bar`(`SP N`·`초기화 (무료)`) ② `.skill-tree`(티어 4줄) ③ `.skill-detail`
 * (고른 스킬의 선행 조건·현재/다음 수치·장착·`SP 1 투자`) 순서이고, 스크롤은 트리만 갖는다.
 */

function uiFixture(job = 'warrior', level = 10) {
  const save = freshSave('male', job);
  save.level = level;
  save.learned = []; save.passives = []; save.skillLevels = {}; save.skillPoints = 0;
  const messages = [], renders = [];
  let dialog = element('div');
  const ui = {
    world: { save, paused: false, player: { hp: 100 }, onChange() { ui.changes++; } },
    market: { busy: false, sync: { locked: false } },
    changes: 0, messages, renders, skillScroll: 0,
    message(text) { messages.push(text); },
    chooseSkill(id) { ui.chosen = id; },
    renderModal() { renders.push(ui.skillSelected); dialog = element('div'); renderSkills.call(ui, dialog); return dialog; },
    get dialog() { return dialog; },
    render() { dialog = element('div'); renderSkills.call(ui, dialog); return dialog; }
  };
  return ui;
}
/** 습득 상태를 직접 만들어 둔다(스킬북 시절 세이브처럼) — 화면 규칙만 보기 위한 준비. */
function learn(save, id, level = 1) {
  if ((passives[id])) save.passives.push(id); else save.learned.push(id);
  save.skillLevels[id] = level;
}

// ── ① 창 구조 ────────────────────────────────────────────────────────────────
test('창은 상단 바 → 트리 → 상세 패널 세 칸이고, 스크롤은 트리만 갖는다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture(), dialog = ui.render();
    assert.deepEqual(dialog.children.map(child => child.className.split(' ')[0]), ['skill-top-bar', 'skill-tree', 'skill-detail']);
    const [bar, tree, detail] = dialog.children;
    assert.equal(query(tree, '.skill-detail'), undefined, '상세 패널은 트리 안에 없다');
    assert(!walk(tree).includes(detail), '상세 패널은 스크롤 밖');
    assert.equal(typeof tree.onscroll, 'function', '트리만 스크롤을 기억한다');
    assert.equal(textOf(bar, 'skill-sp-label').join(''), 'SP');
    assert.equal(one(bar, 'skill-sp-value').textContent, String(spLedger(ui.world.save).available));
    assert.equal(one(bar, 'skill-reset').textContent, '초기화 (무료)', '테스트 서버 기간은 무료');
  } finally { delete globalThis.document; }
});

test('트리는 티어 4줄(3-3-3-2)과 노드 11개를 그리고, 연결선은 뒤에 깔린다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    for (const job of ['warrior', 'archer', 'mage']) {
      const ui = uiFixture(job), tree = ui.render().children[1];
      const tiers = byClass(tree, 'skill-tier');
      assert.equal(tiers.length, 4, `${job}: 네 티어`);
      assert.deepEqual(tiers.map(tier => tier.dataset.tier), ['1', '2', '3', '4']);
      assert.deepEqual(tiers.map(tier => byClass(tier, 'skill-node').length), [3, 3, 3, 2]);
      assert.equal(byClass(tree, 'skill-node').length, 11);
      assert.deepEqual(textOf(tree, 'skill-tier-name'), ['TIER 1', 'TIER 2', 'TIER 3', 'TIER 4']);
      assert.deepEqual(textOf(tree, 'skill-tier-count'), ['0/3', '0/3', '0/3', '0/2'], '아직 아무것도 습득하지 않았다');
      const edgeBox = one(tree, 'skill-tree-edges');
      assert(edgeBox, '연결선 상자');
      assert.equal(edgeBox.attrs['aria-hidden'], 'true');
      assert.match(edgeBox.innerHTML, /<svg viewBox="0 0 100 100"/);
      assert.equal((edgeBox.innerHTML.match(/class="skill-edge/g) ?? []).length, 8, '2·3티어 각 3 + 궁극 2');
      // 노드 순서는 티어·자리 순서(스킬 트리의 배치 그대로).
      assert.deepEqual(byClass(tree, 'skill-node').map(node => node.dataset.skill), skillTreeFor(job).map(node => node.id));
    }
  } finally { delete globalThis.document; }
});

// ── ② 노드 상태 ──────────────────────────────────────────────────────────────
test('노드는 잠김·습득·장착·최대를 클래스와 `N/10` 배지로 보여 준다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture('warrior', 12), save = ui.world.save;
    learn(save, 'slash2', 3); learn(save, 'mastery', 10); save.quickSlots = ['slash2', null, null];
    const tree = ui.render().children[1];
    const node = id => byClass(tree, 'skill-node').find(item => item.dataset.skill === id);

    assert(node('slash2').classList.contains('is-learned'));
    assert(node('slash2').classList.contains('is-equipped'), '장착 중 표시');
    assert.equal(one(node('slash2'), 'skill-node-level').textContent, '3/10');
    assert.equal(one(node('slash2'), 'skill-node-equipped').textContent, '장착');

    assert(node('mastery').classList.contains('is-maxed'), 'Lv.10은 최대');
    assert.equal(one(node('mastery'), 'skill-node-level').textContent, '10/10');

    assert(node('slam').classList.contains('is-open'), '습득만 안 한 1티어는 열려 있다');
    assert.equal(one(node('slam'), 'skill-node-lock'), undefined, '열린 노드에는 자물쇠가 없다');
    assert(node('hell').classList.contains('is-locked'), '선행·SP가 모자란 3티어');
    assert.equal(one(node('hell'), 'skill-node-lock').textContent, '🔒');
    assert.equal(one(node('hell'), 'skill-node-level').textContent, '0/10');
    assert.equal(node('hell').attrs['aria-label'].includes('잠김'), true);

    for (const id of skillTreeFor('warrior').filter(item => item.ultimate)) {
      assert(node(id.id).classList.contains('is-ultimate'), `${id.id} 궁극`);
    }
  } finally { delete globalThis.document; }
});

// ── ③ 상세 패널 ──────────────────────────────────────────────────────────────
test('상세 패널은 아이콘·이름·`Lv.N/10`·설명·선행 조건·현재/다음 수치를 보여 준다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture('warrior', 14), save = ui.world.save;
    learn(save, 'slash2', 2); learn(save, 'warcry', 1);
    ui.skillSelected = 'warcry';
    const detail = ui.render().children[2];
    assert.equal(detail.dataset.skill, 'warcry');
    assert.equal(one(detail, 'skill-detail-name').textContent, '블러드 레이지');
    assert.equal(one(detail, 'skill-detail-sub').textContent, 'Lv.1 / 10');
    assert.equal(one(detail, 'skill-detail-desc').textContent, skills.warcry.description, '설명은 `skills.ts` 그대로');
    // 선행 조건: 같은 줄기 1티어(Lv.1) + 누적 투자 SP 3.
    const rows = byClass(detail, 'skill-req-row');
    assert.equal(rows.length, 2, '스킬 선행 1줄 + 누적 SP 1줄');
    assert.equal(one(rows[0], 'skill-req-name').textContent, '이단참');
    assert.equal(one(rows[0], 'skill-req-value').textContent, '1/1');
    assert.equal(one(rows[0], 'skill-req-check').textContent, '✓');
    assert.equal(one(rows[1], 'skill-req-name').textContent, '누적 투자 SP');
    assert.equal(one(rows[1], 'skill-req-value').textContent, `3/${TIER_GATE[2].minInvestedSp}`);
    // 현재/다음 — 같은 함수가 두 열을 채운다.
    assert.deepEqual(textOf(withClasses(detail, 'skill-compare', 'is-current'), 'skill-compare-value'), skillValueRows('warcry', 1).map(row => row.value));
    assert.deepEqual(textOf(withClasses(detail, 'skill-compare', 'is-next'), 'skill-compare-value'), skillValueRows('warcry', 2).map(row => row.value));
    assert.notDeepEqual(skillValueRows('warcry', 1), skillValueRows('warcry', 2), '다음 레벨 수치는 달라진다');
    assert.deepEqual(textOf(detail, 'skill-compare-title'), ['현재', '다음 레벨']);
    // 버튼 두 개 — 장착과 `SP 1 투자`.
    assert.deepEqual(textOf(detail, 'skill-detail-equip'), ['장착']);
    assert.deepEqual(textOf(detail, 'skill-detail-invest'), ['SP 1 투자']);
  } finally { delete globalThis.document; }
});

test('미습득 스킬의 현재 칸은 `미습득`, 잠긴 스킬은 투자 버튼이 잠기고 이유를 단다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture('warrior', 10);
    ui.skillSelected = 'hell';
    const detail = ui.render().children[2];
    assert.deepEqual(textOf(withClasses(detail, 'skill-compare', 'is-current'), 'skill-compare-empty'), ['미습득']);
    assert.equal(textOf(withClasses(detail, 'skill-compare', 'is-current'), 'skill-compare-value').length, 0, '현재 수치는 없다');
    assert.equal(one(detail, 'skill-detail-sub').textContent, '미습득 / 10');
    const invest = one(detail, 'skill-detail-invest');
    assert.equal(invest.disabled, true);
    assert.equal(invest.attrs['aria-disabled'], 'true');
    assert.match(invest.title, /선행 스킬|누적 투자 SP/);
    assert.equal(one(detail, 'skill-detail-equip').disabled, true, '미습득은 장착할 수 없다');
  } finally { delete globalThis.document; }
});

test('패시브는 장착 버튼이 없고 영구 적용 수치를 보여 준다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture('warrior', 10), save = ui.world.save;
    learn(save, 'mastery', 3);
    ui.skillSelected = 'mastery';
    const detail = ui.render().children[2];
    assert.equal(one(detail, 'skill-detail-equip'), undefined, '패시브에는 장착이 없다');
    assert.deepEqual(textOf(detail, 'skill-compare-value'), ['+19%', '+21%']);
    assert.equal(one(detail, 'skill-detail-desc').textContent, passives.mastery.description);
    assert.deepEqual(textOf(detail, 'skill-detail-tag'), ['패시브']);
  } finally { delete globalThis.document; }
});

// ── ④ 동작 ───────────────────────────────────────────────────────────────────
test('`SP 1 투자`는 랭크를 올리고 저장·HUD를 부른다(패시브면 최대 체력도 함께)', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture('warrior', 10), save = ui.world.save;
    learn(save, 'slash2', 1); save.health = 100; ui.world.player.hp = 100;
    ui.skillSelected = 'slash2';
    let detail = ui.render().children[2];
    assert.equal(one(detail, 'skill-detail-invest').disabled, false);
    one(detail, 'skill-detail-invest').onclick();
    assert.equal(save.skillLevels.slash2, 2);
    assert.equal(ui.changes, 1, 'world.onChange로 저장·HUD 갱신');
    assert.match(ui.messages.at(-1), /이단참 Lv\.2 — SP 1 투자/);
    assert.equal(save.skillPoints, spLedger(save).available);

    // 강인한 육체를 습득하면 최대 체력이 오르고 지금 체력도 같이 오른다.
    save.level = 20; // 58pt — 2티어 게이트를 열고 패시브까지 간다.
    learn(save, 'slam', 1); learn(save, 'mastery', 1);
    const before = ui.world.player.hp;
    ui.skillSelected = 'body';
    detail = ui.render().children[2];
    one(detail, 'skill-detail-invest').onclick();
    assert(save.passives.includes('body'));
    assert(ui.world.player.hp > before, '최대 체력 증가분이 지금 체력에도 붙는다');
    assert.equal(save.health, ui.world.player.hp);
  } finally { delete globalThis.document; }
});

test('동기화 중에는 투자하지 않고 안내만 한다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture('warrior', 10), save = ui.world.save;
    learn(save, 'slash2', 1);
    ui.world.paused = true;
    ui.skillSelected = 'slash2';
    one(ui.render().children[2], 'skill-detail-invest').onclick();
    assert.equal(save.skillLevels.slash2, 1);
    assert.equal(ui.changes, 0);
    assert.match(ui.messages.at(-1), /동기화 중에는 스킬에 투자할 수 없습니다/);
  } finally { delete globalThis.document; }
});

test('장착 버튼은 스킬 고르기로 넘기고, 장착 중이면 그 자리에서 해제한다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture('warrior', 10), save = ui.world.save;
    learn(save, 'slash2', 1); learn(save, 'slam', 1);
    ui.skillSelected = 'slam';
    let detail = ui.render().children[2];
    assert.equal(one(detail, 'skill-detail-equip').textContent, '장착');
    one(detail, 'skill-detail-equip').onclick();
    assert.equal(ui.chosen, 'slam', '장착은 기존 스킬 고르기 흐름으로 넘긴다');

    save.quickSlots = ['slam', null, null];
    detail = ui.render().children[2];
    assert.equal(one(detail, 'skill-detail-equip').textContent, '장착 해제');
    assert.deepEqual(textOf(detail, 'skill-detail-tag'), ['장착중']);
    one(detail, 'skill-detail-equip').onclick();
    assert.deepEqual(save.quickSlots, [null, null, null]);
    assert.equal(ui.changes, 1);
    assert.match(ui.messages.at(-1), /1번 스킬 원에서 해제/);
  } finally { delete globalThis.document; }
});

test('초기화 버튼은 무료이고, 투자한 SP를 전부 돌려준 뒤 다시 그린다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture('warrior', 20), save = ui.world.save;
    for (const id of ['slash2', 'slam', 'mastery', 'warcry']) learn(save, id, 1);
    save.quickSlots = ['warcry', 'slam', null];
    const before = spLedger(save).available;
    const button = one(ui.render().children[0], 'skill-reset');
    assert.equal(button.disabled, false);
    button.onclick();
    assert.deepEqual(save.learned, ['slash2'], '첫 스킬 1랭크만 남는다');
    assert.deepEqual(save.passives, []);
    assert.deepEqual(save.quickSlots, [null, null, null]);
    assert(spLedger(save).available > before);
    assert.equal(ui.changes, 1);
    assert.match(ui.messages.at(-1), /스킬을 초기화했습니다 — SP \d+pt를 돌려받았습니다/);
  } finally { delete globalThis.document; }
});

test('되돌릴 것이 없으면(첫 스킬 1랭크뿐) 초기화 버튼이 잠긴다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture('warrior', 1);
    learn(ui.world.save, 'slash2', 1);
    const button = one(ui.render().children[0], 'skill-reset');
    assert.equal(button.disabled, true);
    assert.match(button.title, /초기화할 스킬이 없습니다/);
  } finally { delete globalThis.document; }
});

// ── ⑤ 선택·보기 상태 ─────────────────────────────────────────────────────────
test('창을 열면 장착 중인 스킬 → 습득한 스킬 → 첫 노드 순으로 고른다', () => {
  const save = freshSave('male', 'warrior');
  save.learned = []; save.passives = []; save.skillLevels = {}; save.quickSlots = [null, null, null];
  assert.equal(resolveSkillSelection(save, 'warrior'), skillOrderFor('warrior')[0], '아무것도 없으면 첫 노드');
  save.learned = ['power', 'hell'];
  assert.equal(resolveSkillSelection(save, 'warrior'), 'power', '습득한 첫 스킬');
  save.quickSlots = [null, 'hell', null];
  assert.equal(resolveSkillSelection(save, 'warrior'), 'hell', '장착 중인 스킬 우선');
  assert.equal(resolveSkillSelection(save, 'warrior', 'power'), 'power', '고른 노드는 그대로');
  assert.equal(resolveSkillSelection(save, 'warrior', 'doubleShot'), 'hell', '다른 직업 스킬이면 다시 고른다');
});

test('창을 닫으면 고른 스킬·스크롤 자리가 보기 상태로 돌아간다', () => {
  const ui = { skillSelected: 'body', skillScroll: 120, codexSelected: 'x', modal: { querySelector: () => null, querySelectorAll: () => [] } };
  resetModalDefaults(ui);
  assert.equal(ui.skillSelected, undefined);
  assert.equal(ui.skillScroll, 0);
  assert.equal(ui.codexSelected, undefined);
});

// ── ⑥ CSS 계약 ──────────────────────────────────────────────────────────────
test('CSS는 3단 창틀·트리 스크롤·잠금/선택/궁극 노드·고정 상세 패널을 정의한다', () => {
  const css = modalStyles();
  const rule = selector => { const index = css.indexOf(`${selector} {`); assert.notEqual(index, -1, `${selector} 규칙이 없다`); return css.slice(index, css.indexOf('}', index) + 1); };
  const dialog = rule('.modal-dialog.skills-modal');
  assert.match(dialog, /display: flex/);
  assert.match(dialog, /flex-direction: column/);
  assert.match(dialog, /overflow: hidden/, '창 자체는 스크롤하지 않는다');
  const tree = rule('.skill-tree');
  assert.match(tree, /overflow-y: auto/, '트리만 스크롤');
  assert.match(tree, /flex: 1 1 auto/);
  const detail = rule('.skill-detail');
  assert.match(detail, /flex: 0 0 auto/, '상세 패널은 줄어들지 않는 고정 줄');
  assert.match(rule('.skill-tree-edges'), /position: absolute/);
  assert.match(rule('.skill-tier-nodes'), /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/, '티어 3열');
  assert.match(rule('.skill-tier[data-tier="4"] .skill-tier-nodes'), /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, '궁극 티어는 2열');
  for (const token of ['.skill-sp {', '.skill-reset {', '.skill-node {', '.skill-node.is-locked .skill-node-frame', '.skill-node.is-selected .skill-node-frame', '.skill-node.is-ultimate .skill-node-frame',
    '.skill-detail-compare {', '.skill-detail-actions {', '.skill-detail-invest {', '.skill-req-row {', '.skill-edge {', '.skill-edge.is-open {']) {
    assert(css.includes(token), `${token} 규칙이 없다`);
  }
  assert.match(css, /@media \(max-width: 380px\)/, '좁은 화면 대응');
  assert.match(css, /\.skill-node-frame \{ width: 50px; height: 50px; \}/, '380px 이하에서 노드를 줄인다');
});
