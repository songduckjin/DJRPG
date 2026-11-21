import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { freshSave } = await import('../src/game/store.ts');
const { advanceTutorialOnEquip } = await import('../src/game/items.ts');
const { World } = await import('../src/game/world.ts');
const { tutorialGuide, pendingGearSlots, activeSkillEquipped, skillReadyToEquip, objectParticle, OPENING_LEVEL } = await import('../src/game/tutorial.ts');
const { renderStatus } = await import('../src/ui/hud.ts');
const { renderInventory } = await import('../src/ui/modals/equipModal.ts');

const helmet = (job = 'warrior') => ({ id: 'h1', name: '매직 가죽 두건', slot: 'helmet', rarity: 'magic', job, stats: { defense: 3 }, plus: 0 });
const armor = (job = 'warrior') => ({ id: 'a1', name: '매직 가죽 조끼', slot: 'armor', rarity: 'magic', job, stats: { defense: 3 }, plus: 0 });
const weapon = () => ({ id: 'w1', name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 }, plus: 0 });

/** 무기까지 끝난 새 캐릭터 — 입문 안내의 방어구·스킬 단계만 본다. */
function afterWeapon(job = 'warrior') {
  const save = freshSave('male', job);
  save.tutorial = 3; save.equipment.weapon = weapon();
  return save;
}

test('첫 세 단계는 예전 그대로 — 첫 처치·무기 드랍·무기 장착 안내', () => {
  const save = freshSave('male', 'warrior');
  assert.equal(tutorialGuide(save).stage, 'kill');
  save.tutorial = 1;
  assert.equal(tutorialGuide(save).stage, 'loot');
  assert.match(tutorialGuide(save).message, /낡은 두손검/);
  save.tutorial = 2;
  const step = tutorialGuide(save);
  assert.equal(step.stage, 'weapon');
  assert.equal(step.nav, 'equipment');
  assert.match(step.message, /하단 갑옷 아이콘을 눌러 가방의 낡은 두손검을 장착하세요/);
});

test('직업별 시작 무기 이름과 목적격 조사가 문장에 맞게 붙는다', () => {
  const archer = freshSave('female', 'archer'); archer.tutorial = 2;
  assert.match(tutorialGuide(archer).message, /낡은 사냥꾼의 활을 장착하세요/);
  const mage = freshSave('female', 'mage'); mage.tutorial = 2;
  assert.match(tutorialGuide(mage).message, /낡은 견습생의 지팡이를 장착하세요/);
  assert.equal(objectParticle('투구'), '투구를');
  assert.equal(objectParticle('갑옷'), '갑옷을');
  assert.equal(objectParticle('투구·갑옷'), '투구·갑옷을');
});

test('첫 무기 장착은 세 직업 모두 3단계로 넘어간다(예전엔 두손검만 넘어갔다)', () => {
  for (const job of ['warrior', 'archer', 'mage']) {
    const save = freshSave('female', job); save.tutorial = 2;
    assert.equal(advanceTutorialOnEquip(save), false, '무기가 아직 없으면 그대로');
    assert.equal(save.tutorial, 2);
    save.equipment.weapon = { ...weapon(), job };
    assert.equal(advanceTutorialOnEquip(save), true);
    assert.equal(save.tutorial, 3);
    assert.equal(advanceTutorialOnEquip(save), false, '한 번만 넘어간다');
  }
});

test('가방에 방어구가 있고 그 칸이 비면 방어구를 먼저 안내한다 — 장비 메뉴와 그 칸을 가리킨다', () => {
  const save = afterWeapon();
  save.bag = [helmet()];
  assert.deepEqual(pendingGearSlots(save), ['helmet']);
  const step = tutorialGuide(save);
  assert.equal(step.stage, 'gear');
  assert.equal(step.nav, 'equipment');
  assert.deepEqual(step.slots, ['helmet']);
  assert.match(step.message, /하단 갑옷 아이콘을 눌러 가방의 투구를 장착하세요\./);
  // 투구를 끼면 갑옷만 남고, 둘 다 끼면 방어구 안내가 끝난다
  save.equipment.helmet = save.bag.shift();
  save.bag.push(armor());
  assert.deepEqual(tutorialGuide(save).slots, ['armor']);
  save.equipment.armor = save.bag.shift();
  assert.equal(tutorialGuide(save).stage, 'skill', '방어구를 다 챙기면 다음은 첫 스킬');
});

test('다른 직업 전용 방어구는 안내하지 않는다', () => {
  const save = afterWeapon('warrior');
  save.bag = [helmet('archer')];
  assert.deepEqual(pendingGearSlots(save), []);
  assert.equal(tutorialGuide(save).stage, 'skill');
});

test('첫 스킬 안내 — 필드 스킬 아이콘과 빈 원(`+`)을 가리키고, 하나라도 끼면 사라진다', () => {
  const save = afterWeapon();
  assert.equal(activeSkillEquipped(save), false);
  assert.equal(skillReadyToEquip(save), true, '새 캐릭터는 첫 액티브 스킬을 습득한 상태로 시작한다');
  const step = tutorialGuide(save);
  assert.equal(step.stage, 'skill');
  assert.equal(step.nav, 'skills');
  assert.equal(step.skillSlot, 0);
  assert.equal(step.message, '스킬 아이콘 또는 빈 슬롯을 눌러 첫 스킬을 장착하세요');
  save.quickSlots = [null, 'slash2', null];
  assert.equal(activeSkillEquipped(save), true);
  assert.equal(tutorialGuide(save), null, '스킬을 끼는 순간 안내가 스스로 끝난다');
});

test('습득한 액티브 스킬이 없으면 스킬 안내를 띄우지 않는다(막다른 안내 금지)', () => {
  const save = afterWeapon();
  save.learned = []; save.skillLevels = {};
  assert.equal(skillReadyToEquip(save), false);
  assert.equal(tutorialGuide(save), null);
});

test('입문 구간을 지난 캐릭터에게는 다시 안내하지 않는다(레벨 상한)', () => {
  const save = afterWeapon();
  save.level = OPENING_LEVEL + 1;
  save.quickSlots = [null, null, null];
  save.bag = [helmet()];
  assert.equal(tutorialGuide(save), null);
  // 무기까지의 세 단계는 레벨과 무관하게 예전 그대로다
  save.tutorial = 2;
  assert.equal(tutorialGuide(save).stage, 'weapon');
});

// ── 화면: 안내 띠 문구와 강조 ──
const node = () => ({
  style: { setProperty() {} },
  classList: { classes: new Set(), toggle(key, on) { if (on) this.classes.add(key); else this.classes.delete(key); }, contains(key) { return this.classes.has(key); }, add(key) { this.classes.add(key); } },
  textContent: '', hidden: false, addEventListener() {}, setAttribute() {}, querySelector() { return node(); }
});
function hud(save) {
  const world = new World(save), children = new Map();
  const root = { querySelector: selector => { if (!children.has(selector)) children.set(selector, node()); return children.get(selector); } };
  return { ui: { world, top: node(), root, banner: node(), slotButtons: [node(), node(), node()], message() {}, get: selector => root.querySelector(selector) }, children };
}

test('안내 띠는 지금 할 일만 보여 주고, 끝나면 숨긴다', () => {
  const save = afterWeapon();
  save.bag = [helmet()];
  const { ui, children } = hud(save);
  renderStatus.call(ui);
  assert.match(ui.banner.textContent, /투구를 장착하세요/);
  assert.equal(ui.banner.hidden, false);
  assert.equal(children.get('.bottom-nav [data-modal="equipment"]').classList.contains('tutorial-target'), true, '장비 메뉴 강조');
  assert.equal(children.get('.bottom-nav [data-modal="skills"]').classList.contains('tutorial-target'), false);
  assert.equal(ui.slotButtons.some(button => button.classList.contains('tutorial-target')), false, '방어구 단계에서는 스킬 원을 강조하지 않는다');

  save.equipment.helmet = save.bag.shift();
  renderStatus.call(ui);
  assert.equal(ui.banner.textContent, '스킬 아이콘 또는 빈 슬롯을 눌러 첫 스킬을 장착하세요');
  assert.equal(children.get('.bottom-nav [data-modal="skills"]').classList.contains('tutorial-target'), true, '스킬 메뉴 강조');
  assert.equal(children.get('.bottom-nav [data-modal="equipment"]').classList.contains('tutorial-target'), false);
  assert.equal(ui.slotButtons[0].classList.contains('tutorial-target'), true, '빈 1번 원만 숨쉰다');
  assert.equal(ui.slotButtons[1].classList.contains('tutorial-target'), false);

  save.quickSlots[0] = 'slash2';
  renderStatus.call(ui);
  assert.equal(ui.banner.hidden, true);
  assert.equal(ui.banner.textContent, '');
  assert.equal(ui.slotButtons.some(button => button.classList.contains('tutorial-target')), false);
  assert.equal(children.get('.bottom-nav [data-modal="skills"]').classList.contains('tutorial-target'), false);
});

test('장비 창이 열려 있으면(안내 띠가 가려짐) 가방 머리글 밑 같은 안내와 그 칸 강조를 남긴다', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const save = afterWeapon();
    save.bag = [helmet(), { id: 'b1', name: '가죽 벨트', slot: 'belt', rarity: 'common', stats: { defense: 1 }, plus: 0 }];
    const ui = { world: { save, onChange() {} }, selected: undefined, bagFilter: 'all', bagRaritySort: false, bagJobOnly: false, salvageRarity: 'common', autoSalvage: false, salvagePlus: 4, openModal: 'equipment', modal: element(), renderModal() {}, message() {}, iconPath() { return ''; } };
    const dialog = element();
    renderInventory.call(ui, dialog);
    const note = all(dialog, item => item.className === 'tutorial-note')[0];
    assert(note, '가방 안내 한 줄');
    assert.equal(note.textContent, '가방에서 투구를 골라 [장착]을 누르세요.');
    const cells = all(dialog, item => typeof item.className === 'string' && item.className.includes('bag-item'));
    const highlighted = cells.filter(cell => cell.className.includes('tutorial-target')).map(cell => cell.dataset.itemId);
    assert.deepEqual(highlighted, ['h1'], '가리키는 투구 칸만 강조');
    // 방어구를 다 챙기면 안내 줄도 사라진다
    save.equipment.helmet = save.bag.shift();
    const after = element();
    renderInventory.call(ui, after);
    assert.equal(all(after, item => item.className === 'tutorial-note').length, 0);
  } finally { globalThis.document = previous; }
});

test('강조 스타일은 은은한 숨쉬기 한 벌 — 움직임 줄이기 설정에서는 정지', () => {
  const hudCss = readFileSync(new URL('../src/styles/hud.css', import.meta.url), 'utf8');
  assert.match(hudCss, /\.tutorial-target \{ animation: tutorial-target/);
  assert.match(hudCss, /@keyframes tutorial-target/);
  assert.match(hudCss, /@media \(prefers-reduced-motion: reduce\) \{ \.tutorial-target \{ animation: none/);
  const equipCss = readFileSync(new URL('../src/styles/modals/equip.css', import.meta.url), 'utf8');
  assert.match(equipCss, /\.tutorial-note \{/);
});

// ── 가방 렌더 스텁(다른 가방 테스트와 같은 최소 DOM) ──
function element(tag = 'div') {
  const node = {
    tag, children: [], dataset: {}, style: { setProperty() {} }, className: '', textContent: '', innerHTML: '', attrs: {}, hidden: false, disabled: false, offsetWidth: 1,
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
    appendChild(child) { this.append(child); return child; },
    replaceChildren(...children) { this.children = []; this.append(...children); }, setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) { return this.attrs[key]; },
    remove() {}, addEventListener() {}, querySelectorAll() { return []; }
  };
  node.classList = { add(name) { node.className += ` ${name}`; }, remove() {}, toggle(name, on) { if (on) this.add(name); } };
  Object.defineProperty(node, 'childElementCount', { get() { return node.children.length; } });
  return node;
}
function all(node, test, out = []) { if (!node || typeof node !== 'object') return out; if (test(node)) out.push(node); for (const child of node.children ?? []) all(child, test, out); return out; }
