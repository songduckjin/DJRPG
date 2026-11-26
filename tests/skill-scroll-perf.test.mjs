/**
 * 스킬 창 트리 스크롤 버벅임 개선 — 2026-11-25 대장님·송덕진 님 최종 승인 1안의 계약 테스트.
 *
 * 창이 사냥 중에 통째로 다시 그려지면 스크롤 중이던 `.skill-tree`가 교체되어 iOS 관성 스크롤이 그 자리에서
 * 죽는다. 이 파일은 그 방지책 네 가지를 고정한다:
 *   ① `MODALS.skills.quietWhileHunting`                     — 사냥 진행으로는 다시 그리지 않는다
 *   ② A-2 창 자체 버튼 5곳의 `renderModal()`                — 내 조작은 즉시 반영한다
 *   ③ A-3 `patchSkillLive`                                  — 레벨업으로 바뀌는 숫자만 부분 갱신
 *   ④ A-4 스크롤 140ms 홀드 · D 레이아웃 확정 뒤 스크롤 복원 · CSS 계약(터치·페인트·높이 상한)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';
import { element, installDocument, one, byClass, textOf } from './helpers/dom.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { skills, passiveOrderFor } = await import('../src/game/skills.ts');
const { renderSkills } = await import('../src/ui/modals/skillModal.ts');
const { patchSkillLive } = await import('../src/ui/skillTreeView.ts');
const { ModalRenderGate, bindModalInteraction } = await import('../src/ui/modalInteraction.ts');
const { MODALS, refreshesOnWorldChange } = await import('../src/ui/modalRegistry.ts');

/** 창틀(머리글 + 닫기 버튼)까지 갖춘 가짜 다이얼로그 — `⚡ 추천 장착`이 머리글에 끼워지는 자리까지 본다. */
function shell() {
  const dialog = element('div');
  dialog.className = 'modal-dialog skills-modal';
  const header = element('header');
  const close = element('button');
  close.className = 'modal-close';
  header.append(close);
  dialog.append(header);
  return dialog;
}

function uiFixture(job = 'warrior', level = 10) {
  const save = freshSave('male', job);
  save.level = level;
  save.learned = []; save.passives = []; save.skillLevels = {}; save.skillPoints = 0;
  const messages = [], renders = [];
  let dialog = shell();
  const ui = {
    world: { save, paused: false, player: { hp: 100 }, onChange() { ui.changes++; } },
    market: { busy: false, sync: { locked: false } },
    openModal: 'skills',
    modal: { querySelector: selector => (selector === '.modal-dialog' ? dialog : undefined) },
    changes: 0, messages, renders, skillScroll: 0,
    message(text) { messages.push(text); },
    chooseSkill(id) { ui.chosen = id; },
    renderModal() { renders.push(ui.skillSelected); dialog = shell(); renderSkills.call(ui, dialog); },
    get dialog() { return dialog; },
    render() { dialog = shell(); renderSkills.call(ui, dialog); return dialog; }
  };
  return ui;
}

/** 습득 상태를 직접 만든다 — 화면 규칙만 보기 위한 준비. */
function learn(save, id, level = 1) {
  if (passiveOrderFor(save.job).includes(id)) save.passives.push(id); else save.learned.push(id);
  save.skillLevels[id] = level;
}

// ── ① 사냥 중 재렌더 차단 ────────────────────────────────────────────────────
test('스킬 창은 사냥 진행으로 다시 그리지 않고, 다른 창의 규칙은 그대로다', () => {
  assert.equal(MODALS.skills.quietWhileHunting, true, '처치·드랍마다 137개 엘리먼트를 갈아 치우지 않는다');
  assert.equal(refreshesOnWorldChange('skills'), false);
  assert.equal(refreshesOnWorldChange('equipment'), true, '가방·내 정보는 지금처럼 사냥 중에 갱신된다');
  assert.equal(refreshesOnWorldChange(null), true);
});

// ── ② 창 자체 버튼은 즉시 반영(A-2) ──────────────────────────────────────────
test('`SP 1 투자`는 창을 다시 그려 결과를 바로 보여 준다', () => {
  installDocument();
  try {
    const ui = uiFixture('warrior', 10);
    learn(ui.world.save, 'slash2', 1);
    const dialog = ui.render();
    const invest = one(dialog, 'skill-detail-invest');
    assert.equal(invest.disabled, false, 'SP가 남아 있으면 열려 있다');
    invest.onclick();
    assert.equal(ui.world.save.skillLevels.slash2, 2, '랭크가 하나 올랐다');
    assert.equal(ui.changes, 1, '저장·HUD 갱신은 그대로');
    assert.equal(ui.renders.length, 1, 'quiet 상태에서는 창이 스스로 갱신되지 않으므로 직접 다시 그린다');
    assert.equal(one(ui.dialog, 'skill-detail-sub').textContent, 'Lv.2 / 10');
  } finally { delete globalThis.document; }
});

test('`초기화 (무료)`와 `장착 해제`도 창을 직접 다시 그린다', () => {
  installDocument();
  try {
    const reset = uiFixture('warrior', 10);
    learn(reset.world.save, 'slash2', 3);
    reset.render();
    one(reset.dialog, 'skill-reset').onclick();
    assert.equal(reset.renders.length, 1, '초기화 결과(SP 반환·잠금)를 바로 보여 준다');

    const unequip = uiFixture('warrior', 10);
    learn(unequip.world.save, 'slash2', 1);
    unequip.world.save.quickSlots = ['slash2', null, null];
    unequip.render();
    const equip = one(unequip.dialog, 'skill-detail-equip');
    assert.equal(equip.textContent, '장착 해제');
    equip.onclick();
    assert.equal(unequip.world.save.quickSlots[0], null);
    assert.equal(unequip.renders.length, 1, '해제 결과(장착 배지·버튼 문구)를 바로 보여 준다');
  } finally { delete globalThis.document; }
});

test('머리글 `⚡ 추천 장착`도 창을 직접 다시 그린다', () => {
  installDocument();
  try {
    const ui = uiFixture('warrior', 20);
    learn(ui.world.save, 'slash2', 1);
    learn(ui.world.save, 'crushing', 1);
    ui.render();
    const suggest = one(ui.dialog, 'skill-suggest-btn');
    assert(suggest, '머리글 오른쪽에 추천 장착 버튼');
    suggest.onclick();
    assert(ui.world.save.quickSlots.some(Boolean), '추천 조합이 스킬 원에 들어갔다');
    assert.equal(ui.renders.length, 1, '트리의 `장착` 배지를 바로 갱신한다');
  } finally { delete globalThis.document; }
});

// ── ③ 레벨업은 숫자만 부분 갱신(A-3) ─────────────────────────────────────────
test('창을 열어 둔 채 레벨이 올라도 SP·투자 가능 상태가 따라오고, 트리는 교체되지 않는다', () => {
  installDocument();
  try {
    const ui = uiFixture('warrior', 1), save = ui.world.save;
    learn(save, 'slash2', 4); // Lv.1 총량 4 = 사용 4 → 보유 0
    ui.skillScroll = 120;
    const dialog = ui.render();
    const tree = one(dialog, 'skill-tree');
    tree.scrollTop = 120;
    const invest = one(dialog, 'skill-detail-invest');
    assert.equal(invest.disabled, true, 'SP가 없으면 투자 버튼이 잠겨 있다');

    save.level = 2; // +3 SP
    patchSkillLive(ui);

    assert.equal(ui.renders.length, 0, '부분 갱신은 창 전체를 다시 그리지 않는다');
    assert.equal(one(ui.dialog, 'skill-tree'), tree, '스크롤 중이던 트리 엘리먼트가 그대로다');
    assert.equal(tree.scrollTop, 120, '스크롤 자리도 그대로다');
    assert.equal(one(ui.dialog, 'skill-sp-value').textContent, '3', '`SP 3`이 낡은 0으로 남지 않는다');
    assert.equal(ui.dialog.querySelector('.skill-sp').title, '남은 스킬 포인트 3 · 사용 3 / 6');
    assert.equal(one(ui.dialog, 'skill-detail-invest').disabled, false, '보유 SP가 생기면 투자 버튼이 열린다');
  } finally { delete globalThis.document; }
});

test('부분 갱신은 노드의 잠금·습득 표시도 값이 다를 때만 고친다', () => {
  installDocument();
  try {
    const ui = uiFixture('warrior', 1), save = ui.world.save;
    learn(save, 'slash2', 3);
    const dialog = ui.render();
    const tier2 = byClass(dialog, 'skill-tier')[1];
    const gate = one(tier2, 'skill-tier-sp');
    assert.equal(gate.textContent, '투자 3/3 SP');
    assert.equal(gate.classList.contains('is-met'), true, '누적 3 SP를 채워 2티어가 열렸다');
    const nodes = byClass(tier2, 'skill-node');
    // 2티어 첫 노드는 선행(이단참 Lv.1)·누적 3 SP를 채워 열린 상태다.
    assert.equal(nodes[0].classList.contains('is-open'), true);

    save.skillLevels.slash2 = 1; // 세이브가 바뀐 상황(초기화 등)을 흉내 낸다
    patchSkillLive(ui);
    assert.equal(one(byClass(ui.dialog, 'skill-tier')[1], 'skill-tier-sp').textContent, '투자 1/3 SP');
    assert.equal(one(byClass(ui.dialog, 'skill-tier')[1], 'skill-tier-sp').classList.contains('is-met'), false);
    assert.equal(byClass(byClass(ui.dialog, 'skill-tier')[1], 'skill-node')[0].classList.contains('is-open'), false);
    assert.equal(one(ui.dialog, 'skill-tier-count').textContent, '1/3', '티어 요약도 다시 센다');
  } finally { delete globalThis.document; }
});

// ── ④ 스크롤 홀드(A-4) ───────────────────────────────────────────────────────
test('스크롤이 살아 있는 동안은 창을 다시 그리지 않고, 멈춘 뒤 한 번만 그린다', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let redraws = 0;
  const gate = new ModalRenderGate(() => redraws++);
  gate.holdScroll();
  assert(gate.defer(), '스크롤 중 들어온 갱신은 미룬다');
  t.mock.timers.tick(139);
  assert.equal(redraws, 0);
  assert(gate.defer(), '아직 관성 구간이다');
  gate.holdScroll(); // 관성 스크롤의 다음 프레임
  t.mock.timers.tick(139);
  assert.equal(redraws, 0, '스크롤이 이어지는 동안에는 계속 붙잡는다');
  t.mock.timers.tick(1); // 마지막 스크롤 + 140ms
  t.mock.timers.tick(0); // flush
  assert.equal(redraws, 1, '멈춘 뒤 한 번만 다시 그린다');
  assert.equal(gate.defer(), false);
});

test('창 안 어느 스크롤 영역이 움직여도 캡처로 잡는다', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const handlers = {};
  const modal = { addEventListener(type, run, capture) { handlers[`m:${type}`] = { run, capture }; } };
  const surface = { addEventListener(type, run) { handlers[`w:${type}`] = { run }; } };
  const gate = bindModalInteraction(modal, surface, () => {});
  assert.equal(handlers['m:scroll'].capture, true, '`scroll`은 버블링하지 않아 캡처로 받아야 한다');
  gate.defer();
  handlers['m:scroll'].run();
  assert(gate.defer(), '트리·상세 어느 쪽 스크롤이든 렌더를 미룬다');
  t.mock.timers.tick(140);
  assert.equal(gate.defer(), false);
});

// ── ⑤ 스크롤 복원 순서(D) ────────────────────────────────────────────────────
test('스크롤 위치는 레이아웃을 확정한 뒤에 되돌린다', () => {
  const order = [];
  globalThis.document = { createElement: tag => {
    const node = element(tag);
    let top = 0;
    Object.defineProperty(node, 'scrollTop', { get: () => top, set(value) { order.push(`scroll:${node.className}`); top = value; } });
    Object.defineProperty(node, 'offsetHeight', { get() { order.push(`layout:${node.className}`); return 308; } });
    return node;
  } };
  try {
    const ui = uiFixture('warrior', 10);
    ui.skillScroll = 200;
    const tree = ui.render().querySelector('.skill-tree');
    const layout = order.indexOf('layout:skill-tree'), scroll = order.indexOf('scroll:skill-tree');
    assert.notEqual(layout, -1, '레이아웃을 먼저 읽어 확정한다');
    assert.notEqual(scroll, -1);
    assert(layout < scroll, '레이아웃 전에 scrollTop을 쓰면 브라우저가 0으로 잘라 버린다');
    assert.equal(tree.scrollTop, 200, '보던 자리로 돌아온다');
  } finally { delete globalThis.document; }
});

// ── ⑥ 페인트 경량화: 열린 연결선의 번짐은 필터 없는 중복 패스 ────────────────
test('열린 연결선은 필터 대신 같은 `d`의 옅은 선을 한 겹 더 깐다', () => {
  installDocument();
  try {
    const ui = uiFixture('warrior', 20);
    learn(ui.world.save, 'slash2', 3);
    const tree = ui.render().querySelector('.skill-tree');
    const edges = one(tree, 'skill-tree-edges').innerHTML;
    const open = [...edges.matchAll(/<path class="skill-edge is-open(?: is-ultimate)?" d="([^"]+)"/g)].map(match => match[1]);
    const glow = [...edges.matchAll(/<path class="skill-edge-glow" d="([^"]+)"/g)].map(match => match[1]);
    assert(open.length > 0, '2티어로 가는 연결선이 열렸다');
    assert.deepEqual(glow, open, '열린 연결선마다 같은 모양의 번짐 선이 하나씩 깔린다');
    assert.equal((edges.match(/class="skill-edge(?: |")/g) ?? []).length, 8, '본선은 2·3티어 각 3 + 궁극 2 그대로');
  } finally { delete globalThis.document; }
});

// ── ⑦ CSS 계약: 터치·스크롤 체이닝·높이 상한·필터 ───────────────────────────
test('CSS는 터치 스크롤·스크롤 체이닝·짧은 화면 잘림을 막고, 잠금 필터를 한 겹으로 모은다', () => {
  const css = modalStyles();
  const rule = selector => {
    const index = css.indexOf(`${selector} {`);
    assert.notEqual(index, -1, `${selector} 규칙이 없다`);
    return css.slice(index, css.indexOf('}', index) + 1);
  };
  assert.match(rule('.skill-tree'), /touch-action: pan-y/, '세로 팬을 브라우저에 먼저 알린다');
  assert.match(rule('.skill-node'), /touch-action: manipulation/, '노드 버튼의 더블탭 확대 대기를 없앤다');
  assert.match(rule('.skill-detail'), /overscroll-behavior: contain/, '상세의 스크롤이 트리로 넘어가지 않는다');
  assert.match(rule('.modal-dialog.skills-modal'), /max-height: min\(92dvh, 780px\)/, '360×640에서 하단 버튼이 잘리지 않게 상한을 올린다');
  assert.match(rule('.skill-node.is-locked .skill-node-frame'), /filter: grayscale\(1\)/, '잠금 회색은 프레임 한 겹');
  assert.doesNotMatch(css, /\.skill-node\.is-locked \.skill-icon \{[^}]*filter: grayscale\(\.85\)/, '아이콘 필터를 걷어냈다');
  assert.doesNotMatch(css, /\.skill-node-lock \{[^}]*filter: grayscale\(\.35\)/, '자물쇠 필터를 걷어냈다');
  assert.doesNotMatch(rule('.skill-edge.is-open'), /filter:/, '연결선 글로우에 필터를 쓰지 않는다');
  assert.match(rule('.skill-edge-glow'), /stroke: #e0b36e33/, '번짐은 옅은 금빛 선으로');
  assert.match(css, /@media \(max-height: 700px\) \{[^}]*\.skill-tier \{ min-height: 68px; \}[^}]*\.skill-detail \{ max-height: 44vh; \}/,
    '높이 700px 이하 화면은 티어 줄·상세를 압축한다');
  // 폭 규칙보다 뒤에 있어야 360×640에서 44vh가 이긴다.
  assert(css.indexOf('@media (max-height: 700px)') > css.indexOf('@media (max-width: 430px)'),
    '짧은 화면 규칙이 폰 폭 규칙 뒤에 온다');
});

test('스킬 이름 표는 그대로다 — 이 작업은 그림·판정을 바꾸지 않는다', () => {
  assert.equal(skills.slash2.name, '이단참');
});
