import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { freshSave } = await import('../src/game/store.ts');
const { autoEquipRecommendedSkills, recommendedSkillOrder } = await import('../src/game/loadout.ts');
const { passiveOrderFor, archerSkillOrder, mageSkillOrder, skillOrder } = await import('../src/game/skills.ts');
const { renderSkills } = await import('../src/ui/modals/skillModal.ts');
const { resetModalDefaults } = await import('../src/ui/modalDefaults.ts');

const styles = readFileSync(new URL('../src/styles/modals.css', import.meta.url), 'utf8');
const modalDefaults = readFileSync(new URL('../src/ui/modalDefaults.ts', import.meta.url), 'utf8');

/** 작업 240 — 스킬 창 추천 자동 장착·패시브 노출. */
function warrior(learned = [...skillOrder]) { const save = freshSave('male', 'warrior'); save.learned = learned; return save; }

// ── ① 추천 자동 장착 ────────────────────────────────────────────────────────
test('직업별로 핵심 버프 1개와 주력 공격 2개를 3칸에 채운다', () => {
  const cases = [
    { job: 'warrior', learned: [...skillOrder], slots: ['warcry', 'hell', 'power'] },
    { job: 'archer', learned: [...archerSkillOrder], slots: ['hawkEye', 'stormVolley', 'arrowRain'] },
    { job: 'mage', learned: [...mageSkillOrder], slots: ['arcaneShield', 'arcaneOverlord', 'meteorStrike'] }
  ];
  for (const { job, learned, slots } of cases) {
    const save = freshSave('female', job); save.learned = learned;
    const result = autoEquipRecommendedSkills(save);
    assert.equal(result.changed, true, job);
    assert.deepEqual(save.quickSlots, slots, job);
    assert.deepEqual(result.equipped, slots.filter(Boolean), job);
    assert.match(result.message, /추천 조합으로 장착했습니다/);
  }
});

test('미습득 스킬과 다른 직업 스킬은 절대 넣지 않는다', () => {
  const save = warrior(['slam', 'slash2', 'hawkEye', 'stormVolley', 'warcry']);
  autoEquipRecommendedSkills(save);
  // 궁수 스킬(hawkEye·stormVolley)은 전사 퀵슬롯 대상이 아니고, 습득하지 않은 hell·power도 빠진다.
  assert.deepEqual(save.quickSlots, ['warcry', 'slam', 'slash2']);
  const onlyForeign = warrior(['hawkEye', 'stormVolley']);
  const result = autoEquipRecommendedSkills(onlyForeign);
  assert.equal(result.changed, false);
  assert.deepEqual(onlyForeign.quickSlots, [null, null, null]);
  assert.match(result.message, /보유한 액티브 스킬이 없습니다/);
});

test('보유가 3개 미만이면 채운 만큼만 앞 칸에 넣고 남은 칸은 비운다', () => {
  const save = warrior(['warcry', 'destroy']);
  const result = autoEquipRecommendedSkills(save);
  assert.deepEqual(save.quickSlots, ['warcry', 'destroy', null]);
  assert.match(result.message, /보유한 2개만 채우고 남은 칸은 비웁니다/);
  const one = warrior(['power']);
  autoEquipRecommendedSkills(one);
  assert.deepEqual(one.quickSlots, ['power', null, null]);
});

test('보유 스킬이 0개면 세이브를 건드리지 않고 안내만 돌려준다', () => {
  const save = freshSave('male', 'warrior'); save.quickSlots = [null, null, null];
  const result = autoEquipRecommendedSkills(save);
  assert.equal(result.changed, false);
  assert.deepEqual(result.equipped, []);
  assert.deepEqual(save.quickSlots, [null, null, null]);
  assert.match(result.message, /스킬북으로 스킬을 습득하면 추천 장착을 쓸 수 있습니다/);
});

test('스킬 레벨이 높은 스킬은 추천 순위에서 가산점을 받는다', () => {
  const low = warrior(['slash2', 'destroy']);
  assert.deepEqual(recommendedSkillOrder(low).slice(0, 2), ['destroy', 'slash2']);
  const leveled = warrior(['slash2', 'destroy']);
  leveled.skillLevels = { slash2: 21, destroy: 1 };
  // 레벨 21이면 피해 배율 3.0배 — 6순위slash2(4 × 3.0 = 12)가 3순위 destroy(8 × 1 = 8)를 앞선다.
  assert.deepEqual(recommendedSkillOrder(leveled).slice(0, 2), ['slash2', 'destroy']);
});

test('이미 같은 조합이면 changed=false, 순서만 다르면 다시 채운다', () => {
  const save = warrior(['warcry', 'hell', 'power']);
  save.quickSlots = ['warcry', 'hell', 'power'];
  const same = autoEquipRecommendedSkills(save);
  assert.equal(same.changed, false);
  assert.match(same.message, /이미 추천 조합이 장착되어 있습니다/);
  save.quickSlots = ['power', 'hell', 'warcry'];
  const reordered = autoEquipRecommendedSkills(save);
  assert.equal(reordered.changed, true);
  assert.deepEqual(save.quickSlots, ['warcry', 'hell', 'power']);
});

// ── ② 스킬 창 UI ───────────────────────────────────────────────────────────
function element(tag = 'div') {
  const node = { tag, children: [], dataset: {}, style: {}, className: '', textContent: '', attrs: {}, disabled: false,
    append(...children) { this.children.push(...children); }, appendChild(child) { this.append(child); return child; },
    setAttribute(key, value) { this.attrs[key] = value; }, remove() {}, focus() {},
    classList: { add(name) { node.className = `${node.className} ${name}`.trim(); }, toggle(name, on) { if (on) this.add(name); }, contains: name => node.className.includes(name) },
    querySelector(selector) {
      // `innerHTML`로 만든 카드 내부는 이 스텁에서 자식이 없다 — 실제 DOM처럼 새 노드를 돌려준다.
      return element(selector.startsWith('.') ? selector.slice(1) : selector);
    }
  };
  Object.defineProperty(node, 'innerHTML', { set() {}, get() { return ''; } });
  return node;
}
function walk(node, out = []) { for (const child of node.children) { out.push(child); walk(child, out); } return out; }
function uiFixture(job = 'warrior') {
  const save = freshSave('male', job), messages = [], renders = [];
  let changes = 0;
  const ui = {
    world: { save, paused: false, onChange: () => { changes++; } },
    market: { busy: false, sync: { locked: false } },
    messages, changes: () => changes,
    message(text) { messages.push(text); }, chooseSkill() {},
    renderModal() { renders.push(ui.skillFilter); }, renders, skillFilter: 'all'
  };
  return ui;
}
function render(ui) {
  const dialog = element('div');
  renderSkills.call(ui, dialog);
  return { dialog, nodes: walk(dialog) };
}
const hasClass = (node, token) => node.className.split(/\s+/).includes(token);

test('전체 탭에서도 패시브 3종이 스킬북·액티브보다 위에 그려진다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    for (const job of ['warrior', 'archer', 'mage']) {
      const ui = uiFixture(job);
      const { nodes } = render(ui);
      const passiveCards = nodes.filter(node => hasClass(node, 'passive-skill-card'));
      assert.deepEqual(passiveCards.map(card => card.dataset.skill), passiveOrderFor(job), job);
      const passiveSection = nodes.findIndex(node => hasClass(node, 'skill-passive-section'));
      const firstActive = nodes.findIndex(node => hasClass(node, 'active-skill-card'));
      const books = nodes.findIndex(node => hasClass(node, 'skill-books'));
      assert(passiveSection >= 0 && passiveSection < firstActive, `${job}: 패시브가 액티브보다 아래에 있다`);
      assert(books > firstActive, `${job}: 스킬북은 맨 아래`);
      assert.equal(nodes.filter(node => hasClass(node, 'skill-book-card')).length, 0, '스킬북이 없으면 빈 안내만');
    }
  } finally { delete globalThis.document; }
});

test('패시브·액티브 탭은 그 종류만 보여 주고 탭을 누르면 다시 그린다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture('mage');
    const all = render(ui);
    const tabs = all.nodes.filter(node => node.dataset.filter);
    assert.deepEqual(tabs.map(tab => tab.dataset.filter), ['all', 'active', 'passive']);
    assert.equal(tabs[0].attrs['aria-selected'], 'true');
    tabs[2].onclick();
    assert.equal(ui.skillFilter, 'passive');
    assert.deepEqual(ui.renders, ['passive']);

    const passiveOnly = render(ui);
    assert.equal(passiveOnly.nodes.filter(node => hasClass(node, 'passive-skill-card')).length, 3);
    assert.equal(passiveOnly.nodes.filter(node => hasClass(node, 'active-skill-card')).length, 0);
    assert(!passiveOnly.nodes.some(node => node.className === 'skill-card'), '기본 공격 카드도 숨긴다');

    ui.skillFilter = 'active';
    const activeOnly = render(ui);
    assert.equal(activeOnly.nodes.filter(node => hasClass(node, 'passive-skill-card')).length, 0);
    assert.equal(activeOnly.nodes.filter(node => hasClass(node, 'active-skill-card')).length, 8);
    assert(activeOnly.nodes.some(node => hasClass(node, 'skill-books')));
  } finally { delete globalThis.document; }
});

test('추천 자동 장착 버튼 한 번으로 3칸을 채우고 저장·HUD·안내를 부른다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture('warrior');
    ui.world.save.learned = ['slash2', 'slam', 'warcry', 'power'];
    const { nodes } = render(ui);
    const auto = nodes.find(node => node.textContent === '추천 자동 장착');
    assert(auto, '추천 자동 장착 버튼이 상단 바에 없다');
    assert(hasClass(auto, 'skill-auto-equip'));
    auto.onclick();
    assert.deepEqual(ui.world.save.quickSlots, ['warcry', 'power', 'slam']);
    assert.equal(ui.changes(), 1, 'world.onChange가 저장·HUD를 갱신한다');
    assert.match(ui.messages.at(-1), /추천 조합으로 장착했습니다/);

    const blocked = uiFixture('warrior');
    blocked.world.paused = true;
    blocked.world.save.learned = ['warcry'];
    const bar = render(blocked).nodes.find(node => node.textContent === '추천 자동 장착');
    bar.onclick();
    assert.deepEqual(blocked.world.save.quickSlots, [null, null, null], '동기화 중에는 바꾸지 않는다');
    assert.equal(blocked.changes(), 0);
    assert.match(blocked.messages.at(-1), /동기화 중에는 스킬을 장착할 수 없습니다/);
  } finally { delete globalThis.document; }
});

test('창을 닫으면 스킬 탭이 전체로 돌아가고 CSS 규칙이 있다', () => {
  const ui = uiFixture(); ui.skillFilter = 'passive'; ui.selected = 'x'; ui.equippedSlot = 'weapon';
  ui.modal = { querySelector: () => undefined, querySelectorAll: () => [] };
  resetModalDefaults(ui);
  assert.equal(ui.skillFilter, 'all');
  assert.match(modalDefaults, /ui\.skillFilter = 'all'/);
  for (const selector of ['.skill-top-bar {', '.skill-auto-equip {', '.skill-filter {', '.skill-filter-tab {', '.skill-filter-tab[aria-selected="true"] {', '.skill-passive-section {']) {
    assert(styles.includes(selector), `${selector} 규칙이 없다`);
  }
});
