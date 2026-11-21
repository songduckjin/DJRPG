import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave, totalStats } = await import('../src/game/store.ts');
const { useAllReadySkillBooks } = await import('../src/ui/skillBooks.ts');
const { renderSkills } = await import('../src/ui/modals/skillModal.ts');

const book = (id, skillId) => ({ id, name: `[스킬북] ${skillId}`, slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId, stats: {} });
/** 작업 245 — 스킬북 `자동 강화`. */

test('내 직업 스킬북으로 가능한 만큼 연속 습득·강화한다', () => {
  const save = freshSave('male', 'warrior');
  save.bag = [book('d1', 'destroy'), book('d2', 'destroy'), book('d3', 'destroy'), book('d4', 'destroy')];
  const result = useAllReadySkillBooks(save);
  // 필요 권수가 1권인 구간(레벨 0→4)이라 네 번 연속 오른다.
  assert.equal(result.used, 4);
  assert.equal(save.skillLevels.destroy, 4);
  assert(save.learned.includes('destroy'), '미습득 스킬은 습득부터');
  assert.equal(save.bag.length, 0, '쓴 책은 사라진다');
  assert.deepEqual(result.upgrades.map(entry => entry.level), [1, 2, 3, 4]);
  assert.equal(result.upgrades[0].name, '디스트로이 스윙');
});

test('다른 직업 스킬북·권수 부족·최대 레벨 스킬은 건드리지 않는다', () => {
  const save = freshSave('male', 'warrior');
  save.skillLevels = { slam: 5, hell: 30 };
  save.learned = ['slam', 'hell'];
  save.bag = [
    book('own', 'power'),
    book('foreign-archer', 'doubleShot'),
    book('foreign-mage', 'fireBolt'),
    book('short', 'slam'),            // 레벨 5 → 다음 레벨 필요 2권인데 1권뿐
    book('maxed', 'hell'), book('maxed2', 'hell')
  ];
  const result = useAllReadySkillBooks(save);
  assert.equal(result.used, 1, '내 직업이면서 바로 쓸 수 있는 책만');
  assert.equal(save.skillLevels.power, 1);
  const left = save.bag.map(item => item.id).sort();
  assert.deepEqual(left, ['foreign-archer', 'foreign-mage', 'maxed', 'maxed2', 'short']);
  assert.equal(save.skillLevels.slam, 5);
  assert.equal(save.skillLevels.hell, 30);
  assert.equal(save.learned.includes('doubleShot'), false);
  assert.equal(save.learned.includes('fireBolt'), false);
});

test('쓸 수 있는 책이 없으면 아무것도 바꾸지 않는다', () => {
  const save = freshSave('male', 'mage');
  save.bag = [book('foreign', 'slash2')];
  const before = JSON.stringify(save);
  const result = useAllReadySkillBooks(save);
  assert.equal(result.used, 0);
  assert.deepEqual(result.upgrades, []);
  assert.equal(JSON.stringify(save), before);
});

test('패시브 스킬북도 자동 강화 대상이다(최대 체력 +15%)', () => {
  const save = freshSave('male', 'warrior');
  save.bag = [book('body1', 'body')];
  const before = totalStats(save).health;
  const result = useAllReadySkillBooks(save);
  assert.equal(result.used, 1);
  assert(save.passives.includes('body'));
  assert(totalStats(save).health > before, '강인한 육체 Lv.1은 최대 HP를 올린다');
});

// ── 스킬 창 상단 `자동 강화` 버튼 ───────────────────────────────────────────
function element(tag = 'div') {
  const node = { tag, children: [], dataset: {}, style: {}, className: '', textContent: '', attrs: {}, disabled: false,
    append(...children) { this.children.push(...children); }, appendChild(child) { this.append(child); return child; },
    setAttribute(key, value) { this.attrs[key] = value; }, remove() {}, focus() {},
    classList: { add(name) { node.className = `${node.className} ${name}`.trim(); }, contains: name => node.className.includes(name), toggle() {} },
    querySelector(selector) { return element(selector.startsWith('.') ? selector.slice(1) : selector); } };
  Object.defineProperty(node, 'innerHTML', { get() { return ''; }, set() {} });
  return node;
}
function walk(node, out = []) { for (const child of node.children) { out.push(child); walk(child, out); } return out; }
function uiFixture(job = 'warrior') {
  const save = freshSave('male', job), messages = []; let changes = 0;
  const ui = {
    world: { save, paused: false, player: { hp: 100 }, onChange: () => { changes++; } },
    market: { busy: false, sync: { locked: false } }, messages, changes: () => changes,
    message(text) { messages.push(text); }, chooseSkill() {}, renderModal() {}, skillFilter: 'all'
  };
  return ui;
}
function render(ui) { const dialog = element('div'); renderSkills.call(ui, dialog); return walk(dialog); }

test('자동 강화 버튼 한 번으로 내 직업 책을 모두 쓰고 저장·안내를 부른다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture('warrior');
    ui.world.save.bag = [book('p1', 'power'), book('p2', 'power')];
    const button = render(ui).find(node => node.textContent === '자동 강화');
    assert(button, '스킬 창 상단 바에 자동 강화 버튼이 없다');
    assert(button.className.includes('skill-auto-upgrade'));
    button.onclick();
    assert.equal(ui.world.save.skillLevels.power, 2);
    assert.equal(ui.changes(), 1, 'world.onChange가 저장·HUD를 갱신한다');
    assert.match(ui.messages.at(-1), /스킬 1종 자동 강화 완료 \(총 2회\)/);
    // 남은 책이 없으면 안내만.
    button.onclick();
    assert.match(ui.messages.at(-1), /습득하거나 강화할 수 있는 내 직업 스킬북이 없습니다/);

    // 동기화 중에는 아무것도 쓰지 않는다.
    const blocked = uiFixture('warrior');
    blocked.world.paused = true;
    blocked.world.save.bag = [book('b1', 'body')];
    const bar = render(blocked).find(node => node.textContent === '자동 강화');
    bar.onclick();
    assert.equal(blocked.world.save.bag.length, 1);
    assert.equal(blocked.changes(), 0);
    assert.match(blocked.messages.at(-1), /동기화 중에는 스킬을 강화할 수 없습니다/);
  } finally { delete globalThis.document; }
});

test('자동 강화로 최대 체력이 오르면 지금 체력도 같이 올린다', () => {
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const ui = uiFixture('warrior');
    ui.world.save.bag = [book('body1', 'body')];
    ui.world.player.hp = 90; ui.world.save.health = 90;
    const before = totalStats(ui.world.save).health;
    render(ui).find(node => node.textContent === '자동 강화').onclick();
    const gained = totalStats(ui.world.save).health - before;
    assert(gained > 0);
    assert.equal(ui.world.player.hp, 90 + gained);
    assert.equal(ui.world.save.health, 90 + gained);
  } finally { delete globalThis.document; }
});
