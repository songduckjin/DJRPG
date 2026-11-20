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
    openModal: null, messages: [], salvageIds: undefined,
    open(kind) { this.openModal = kind; },
    message(text) { this.messages.push(text); },
    modal: { querySelector: () => null, querySelectorAll: () => [] },
  };
  return ui;
}
function node(tag = 'div') {
  return { tag, children: [], className: '', textContent: '', attrs: {}, dataset: {}, style: {},
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(key, value) { this.attrs[key] = value; },
    classList: { add() {}, toggle() {} } };
}
function withDocument(work) {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => node(tag) };
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

test('bulk salvage stops at the confirmation when the selection holds a better piece', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 10);
  save.bag = [gear('better', 'weapon', 30), gear('junk', 'helmet', 1)];
  const gold = save.gold, ui = popup(save);
  requestSalvage.call(ui, ['better', 'junk']);
  assert.equal(ui.openModal, 'salvage', 'the confirmation opens instead of salvaging');
  assert.deepEqual(ui.salvageIds, ['better', 'junk'], 'with the selection kept for the confirmation');
  assert.equal(save.bag.length, 2, 'and nothing is destroyed yet');
  assert.equal(save.gold, gold, 'no gold is paid out yet');
});

test('the confirmation names the better piece, its slot and what is worn there', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 10);
  save.bag = [gear('better', 'weapon', 30, 'epic'), gear('junk', 'helmet', 1)];
  const ui = popup(save); ui.salvageIds = ['better', 'junk'];
  const dialog = withDocument(() => { const box = node(); renderSalvage.call(ui, box); return box; });
  const warning = findByClass(dialog, 'salvage-warning');
  assert(warning && warning.textContent.includes('좋은 장비'), 'the popup warns first');
  assert.equal(warning.attrs.role, 'alert', 'and reads as an alert');
  const list = findByClass(dialog, 'salvage-upgrade-list');
  assert(list, 'the better pieces are listed');
  assert.equal(list.children.length, 1, 'one card for the one better piece');
  const card = texts(list.children[0]).join(' ');
  assert(card.includes('두손검'), `the slot is named (got "${card}")`);
  assert(card.includes('better'), 'the piece is named');
  assert(card.includes('장착 중: worn'), 'and what it would replace');
  // The whole selection is still listed, so the player sees what else goes with it.
  const items = findByClass(dialog, 'salvage-confirm-list');
  assert.deepEqual(items.children.map(line => line.textContent), ['better', 'junk']);
  const actions = findByClass(dialog, 'salvage-confirm-actions');
  assert.deepEqual(actions.children.map(button => button.textContent), ['취소하고 보관', '2개 분해']);
});

test('cancelling keeps the gear; confirming salvages exactly what was listed', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 10);
  save.bag = [gear('better', 'weapon', 30), gear('junk', 'helmet', 1)];
  // Cancelling: the selection is dropped and the popup goes back to the bag, gear untouched.
  const cancelled = popup(save); cancelled.salvageIds = ['better', 'junk'];
  withDocument(() => renderSalvage.call(cancelled, node()));
  assert.equal(save.bag.length, 2, 'cancelling changes nothing');
  // Confirming: the same list is what gets salvaged, and the reward is the usual one.
  const gold = save.gold;
  const ui = popup(save);
  finishSalvage.call(ui, ['better', 'junk']);
  assert.equal(save.bag.length, 0, 'the confirmed pieces are gone');
  assert(save.gold > gold, 'and the salvage pays out');
  assert.equal(ui.openModal, 'equipment', 'back to the bag');
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
