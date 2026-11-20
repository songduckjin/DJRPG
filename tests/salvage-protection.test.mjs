// Bulk salvage protection (작업 196): 일괄 분해 sweeps a whole grade at once, so it used to eat a drop
// that is better than the gear the character has on — the very piece 자동 장착 would have taken. Now a
// selection that contains such a piece stops at the confirmation popup and names it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave } = await import('../src/game/store.ts');
const { itemPower } = await import('../src/game/items.ts');
const { salvagePlan, salvageUpgrades, salvageItems } = await import('../src/game/inventory.ts');
const { requestSalvage, renderSalvage, finishSalvage } = await import('../src/ui/modals/salvageModal.ts');

const gear = (id, slot, attack, rarity = 'common') => ({ id, name: id, slot, rarity, stats: { attack } });

/** A popup stub: enough of `Interface` for the salvage flow, with the dialog nodes recorded. */
function popup(save) {
  const ui = {
    world: { save, paused: false, onChange() {} },
    openModal: 'equipment', messages: [], salvageIds: undefined,
    root: node('main'), modal: { hidden: false },
    open(kind) { this.openModal = kind; },
    message(text) { this.messages.push(text); },
  };
  return ui;
}
function node(tag = 'div') {
  return { tag, children: [], className: '', textContent: '', attrs: {}, dataset: {}, style: { setProperty() {} },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(key, value) { this.attrs[key] = value; },
    classList: { add() {}, toggle() {} } };
}
function withDocument(work) {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => node(tag), createTextNode: text => ({ textContent: text, children: [] }), body: node('body') };
  try { return work(); } finally { globalThis.document = previous; }
}
const findByClass = (root, name) => {
  if (root.className?.split(' ').includes(name)) return root;
  for (const child of root.children ?? []) { const found = findByClass(child, name); if (found) return found; }
  return undefined;
};
const texts = root => root.textContent ? [root.textContent] : (root.children ?? []).flatMap(texts);

test('a piece that beats the worn one is reported as an upgrade, a weaker piece is not', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 10);
  save.bag = [gear('better', 'weapon', 30), gear('weaker', 'weapon', 2)];
  const plan = salvagePlan(save, ['better', 'weaker']);
  assert.equal(plan.items.length, 2, 'both pieces are still in the selection');
  assert.equal(plan.emptySlots.length, 0, 'the weapon slot is filled');
  assert.deepEqual(plan.upgrades.map(upgrade => upgrade.item.id), ['better'], 'only the piece above the worn one is an upgrade');
  const upgrade = plan.upgrades[0];
  assert.equal(upgrade.equipped.id, 'worn', 'the worn piece is named');
  assert.equal(upgrade.gain, itemPower(gear('better', 'weapon', 30)) - itemPower(gear('worn', 'weapon', 10)), 'and the power it gains');
  // A slot with nothing worn is the empty-slot warning, not an upgrade warning.
  save.equipment.helmet = undefined;
  save.bag.push(gear('helm', 'helmet', 999));
  const roomy = salvagePlan(save, ['helm']);
  assert.deepEqual(roomy.upgrades, [], 'an empty slot has nothing to beat');
  assert.deepEqual(roomy.emptySlots, ['helmet'], 'that case keeps its own warning');
});

test('a ring is an upgrade only when it beats the weaker of the two worn rings', () => {
  const save = freshSave();
  save.equipment.ring1 = gear('ring-weak', 'ring1', 5);
  save.equipment.ring2 = gear('ring-strong', 'ring2', 20);
  save.bag = [gear('ring-up', 'ring1', 10), gear('ring-low', 'ring1', 1), gear('ring-top', 'ring2', 40)];
  const upgrades = salvageUpgrades(save, save.bag);
  assert.deepEqual(upgrades.map(upgrade => upgrade.item.id), ['ring-up', 'ring-top'], 'the rings above the weaker worn ring are upgrades');
  assert(upgrades.every(upgrade => upgrade.equipped.id === 'ring-weak'), 'each is compared with the ring it would replace');
  // With a ring slot free there is nothing to replace: the empty-slot warning covers it instead.
  save.equipment.ring2 = undefined;
  assert.deepEqual(salvageUpgrades(save, save.bag), [], 'a free ring slot is not an upgrade warning');
  assert(salvagePlan(save, ['ring-top']).emptySlots.includes('ring2'), 'it is the empty-slot case');
});

test('a better piece opens a small popup over the bag instead of replacing it', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 10);
  save.bag = [gear('better', 'weapon', 30, 'epic'), gear('junk', 'helmet', 1)];
  const gold = save.gold, ui = popup(save);
  withDocument(() => requestSalvage.call(ui, ['better', 'junk']));
  // 장비창은 그대로 열려 있고, 그 위에 작은 팝업이 하나 얹힌다.
  assert.equal(ui.openModal, 'equipment', 'the bag stays where it was');
  const overlay = findByClass(ui.root, 'salvage-protect');
  assert(overlay, 'one small popup is layered over the bag');
  assert.equal(overlay.attrs.role, 'dialog');
  assert.equal(overlay.attrs['aria-label'], '분해 보호');
  assert.equal(save.bag.length, 2, 'nothing is destroyed yet');
  assert.equal(save.gold, gold, 'no gold is paid out yet');
});

test('the popup shows only the piece worth keeping, with its art and the power it would add', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 10);
  save.bag = [gear('better', 'weapon', 30, 'epic'), gear('junk', 'helmet', 1)];
  const ui = popup(save);
  withDocument(() => requestSalvage.call(ui, ['better', 'junk']));
  const overlay = findByClass(ui.root, 'salvage-protect');
  const cards = findByClass(overlay, 'salvage-protect-list').children;
  assert.equal(cards.length, 1, 'only the protected piece is listed');
  const card = cards[0];
  const text = texts(card).join(' ');
  assert(text.includes('better'), `the piece is named (got "${text}")`);
  assert(text.includes('두손검'), 'its slot is named');
  assert(text.includes('에픽'), 'and its grade');
  assert(text.includes('장착 중 worn'), 'what it would replace');
  const gain = Math.round(itemPower(gear('better', 'weapon', 30, 'epic')) - itemPower(gear('worn', 'weapon', 10)));
  assert(text.includes('현재 투력'), 'the worn power is shown');
  assert(text.includes(`+${gain}`), `and the power this piece adds (got "${text}")`);
  assert(findByClass(card, 'salvage-protect-art'), 'the piece has its own picture');
  assert(!text.includes('junk'), 'the rest of the selection is not listed');
});

test('the big button keeps only the protected piece and salvages the rest', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 10);
  // The rest of the selection leaves no empty slot, so the rest goes straight to the bin.
  save.equipment.boots = gear('worn-boots', 'boots', 5);
  save.bag = [gear('better', 'weapon', 30), gear('junk', 'boots', 1)];
  const gold = save.gold, ui = popup(save);
  withDocument(() => requestSalvage.call(ui, ['better', 'junk']));
  const buttons = findByClass(ui.root, 'salvage-protect-actions').children;
  assert.equal(buttons[0].textContent, '이 아이템 분해 제외', 'the protected piece is the main button');
  assert.deepEqual(buttons.slice(1).map(button => button.textContent), ['그대로 분해', '취소'], 'the rest are secondary');
  buttons[0].onclick();
  assert.deepEqual(save.bag.map(item => item.id), ['better'], 'the better piece is kept');
  assert(save.gold > gold, 'and the rest is salvaged for its usual reward');
  assert.equal(ui.openModal, 'equipment', 'back to the bag');
});

test('그대로 분해 salvages the whole selection, 취소 keeps it', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 10);
  save.bag = [gear('better', 'weapon', 30), gear('junk', 'helmet', 1)];
  // 취소: 아무것도 지우지 않고 장비창으로 돌아간다.
  const quiet = popup(save);
  withDocument(() => requestSalvage.call(quiet, ['better', 'junk']));
  findByClass(quiet.root, 'salvage-protect-actions').children[2].onclick();
  assert.equal(save.bag.length, 2, 'cancelling changes nothing');
  assert.equal(quiet.openModal, 'equipment');
  // 그대로 분해: 선택한 장비가 전부 분해된다.
  const gold = save.gold, ui = popup(save);
  withDocument(() => requestSalvage.call(ui, ['better', 'junk']));
  findByClass(ui.root, 'salvage-protect-actions').children[1].onclick();
  assert.equal(save.bag.length, 0, 'the whole selection is gone');
  assert(save.gold > gold, 'and pays out');
});

test('the popup names how many pieces it protects when there are several', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 10);
  save.equipment.helmet = gear('worn-helm', 'helmet', 5);
  save.bag = [gear('better', 'weapon', 30), gear('helm', 'helmet', 20), gear('junk', 'boots', 1)];
  const ui = popup(save);
  withDocument(() => requestSalvage.call(ui, ['better', 'helm', 'junk']));
  const overlay = findByClass(ui.root, 'salvage-protect');
  assert.equal(findByClass(overlay, 'salvage-protect-list').children.length, 2, 'both protected pieces are shown');
  assert.equal(findByClass(overlay, 'salvage-protect-actions').children[0].textContent, '보호할 장비 2개 빼고 분해');
});

test('a selection with nothing better is still salvaged in one tap', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 40);
  save.bag = [gear('junk', 'weapon', 1)];
  const ui = popup(save), gold = save.gold;
  requestSalvage.call(ui, ['junk']);
  assert.notEqual(ui.openModal, 'salvage', 'no confirmation for a piece that is no better than what is worn');
  assert.equal(ui.openModal, 'equipment', 'it goes straight back to the bag after salvaging');
  assert.equal(save.bag.length, 0, 'it is salvaged straight away');
  assert(save.gold > gold);
  assert(salvageItems(save, ['junk']).count === 0, 'and it is not paid twice');
});
