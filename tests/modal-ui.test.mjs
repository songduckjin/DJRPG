import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave } = await import('../src/game/store.ts');
const { codexVariants } = await import('../src/game/codex.ts');
const { rarityOrder, rarityRanks } = await import('../src/game/items.ts');
const { compareEquipment } = await import('../src/game/itemComparison.ts');
const { detailPosition, dismissBagDetail } = await import('../src/ui/bagDetail.ts');
const { Interface } = await import('../src/ui/interface.ts');
const { Market } = await import('../src/game/market.ts');
const equipment = (slot, stats) => ({ id: slot, name: slot, slot, rarity: 'rare', stats });

test('codex groups all six grades in ascending order, retaining filters', () => {
  const save = freshSave(), variants = codexVariants(save);
  assert.equal(variants.length, 450);
  assert.deepEqual([...new Set(variants.map(v => v.rarity))], rarityOrder);
  for (let i = 1; i < variants.length; i++) assert(rarityRanks[variants[i-1].rarity] <= rarityRanks[variants[i].rarity]);
  const filtered = codexVariants(save, '', 'helmet', 'all', 'epic');
  assert.equal(filtered.length, 10);
  assert(filtered.every(v => v.rarity === 'epic' && v.entry.slot === 'helmet'));
});
test('purchase comparison includes current values, gains, unchanged stats and lost options for the same slot', () => {
  const save = freshSave();
  save.equipment.weapon = equipment('weapon', { attack: 10, health: 20, crit: 3 });
  save.equipment.helmet = equipment('helmet', { defense: 999 });
  const result = compareEquipment(save, equipment('weapon', { attack: 15, crit: 3, speed: 2 }));
  assert.equal(result.equipped, save.equipment.weapon);
  assert.deepEqual(Object.fromEntries(result.stats.map(s => [s.stat, [s.current, s.candidate, s.difference]])), {
    attack: [10, 15, 5], health: [20, 0, -20], crit: [3, 3, 0], speed: [0, 2, 2]
  });
});
test('empty equipment slot compares to zero; skillbooks have no equipment comparison', () => {
  const save = freshSave(); save.equipment = {};
  assert.deepEqual(compareEquipment(save, equipment('ring2', { attack: 5 })).stats, [{ stat: 'attack', current: 0, candidate: 5, difference: 5 }]);
  assert.equal(compareEquipment(save, { kind: 'skillbook', slot: 'skillbook', stats: {} }), undefined);
});
function uiFixture() {
  const market = new Market({ locked: false }); market.open = () => {}; market.close = () => {};
  const bag = { scrollTop: 60 }, dialog = { scrollTop: 80, querySelector: () => bag };
  return { market, modal: { querySelector: selector => selector === '.modal-dialog' ? dialog : null, querySelectorAll: () => [] }, openModal: null,
    selected: 'old', bagFilter: 'weapon', salvageRarity: 'unique', codexQuery: '검', codexSlot: 'weapon', codexRarity: 'rare', codexState: 'owned', codexSelected: 'old',
    newItems: new Set(), renderBagBadge() {}, renderModal() { this.renders = (this.renders || 0) + 1; }, dialog, bag };
}
test('closing and reopening popups restores defaults and scroll without changing saved game data', () => {
  const ui = uiFixture(); Interface.prototype.open.call(ui, 'equipment');
  assert.equal(ui.selected, undefined); assert.equal(ui.bagFilter, 'all'); assert.equal(ui.salvageRarity, 'common');
  assert.equal(ui.dialog.scrollTop, 0); assert.equal(ui.bag.scrollTop, 0);
  ui.bagFilter = 'armor'; ui.salvageRarity = 'epic'; ui.selected = 'new';
  Interface.prototype.open.call(ui, null); Interface.prototype.open.call(ui, 'codex');
  assert.equal(ui.codexQuery, ''); assert.equal(ui.codexSlot, ''); assert.equal(ui.codexState, 'all'); assert.equal(ui.codexRarity, ''); assert.equal(ui.codexSelected, undefined);
  // Explicit field-slot and dismantling confirmation flows retain their payload.
  ui.skillTarget = 2; Interface.prototype.open.call(ui, 'skills'); assert.equal(ui.skillTarget, 2);
  ui.salvageIds = ['item']; Interface.prototype.open.call(ui, 'salvage'); assert.deepEqual(ui.salvageIds, ['item']);
});
test('reopening market restores sale list, filters and registration form, preserving pending operations', () => {
  const ui = uiFixture(), market = ui.market;
  market.view = 'register'; market.price = '500'; market.selectedItem = 'item'; market.filters.minPrice = 200; market.filters.page = 3; market.selected = { id: 'sale' };
  Interface.prototype.open.call(ui, 'market');
  assert.equal(market.view, 'active'); assert.equal(market.selectedItem, ''); assert.equal(market.price, ''); assert.equal(market.selected, undefined);
  assert.deepEqual(market.filters, { query: '', category: '', slot: '', rarity: '', sort: 'newest', page: 0 });
  market.sync.pendingMarket = { action: 'buy' }; Interface.prototype.open.call(ui, null);
  assert.equal(ui.openModal, 'market'); assert.deepEqual(market.sync.pendingMarket, { action: 'buy' });
});
test('reset market view rejects stale in-flight list results', async () => {
  const original = globalThis.fetch; let resolve;
  globalThis.fetch = () => new Promise(r => { resolve = r; });
  try {
    const market = new Market({ session: { token: 'test' } });
    const request = market.load(true); market.resetView();
    resolve({ ok: true, json: async () => ({ inbox: [], listings: [{ id: 'old' }] }) });
    await request; assert.equal(market.data, undefined); assert.equal(market.loading, false);
  } finally { globalThis.fetch = original; }
});
test('bag detail stays inside small popup bounds at upper and lower edges', () => {
  const bounds = { left: 8, right: 328, top: 20, bottom: 420 };
  for (const anchor of [{ top: 60, bottom: 114 }, { top: 350, bottom: 404 }]) {
    for (const height of [100, 700]) {
      const p = detailPosition(bounds, anchor, height);
      assert(p.top >= 28); assert(p.top + Math.min(height, p.maxHeight) <= 412);
      assert.equal(p.left, 16); assert.equal(p.width, 304);
    }
  }
});
test('dismissing bag details removes overlay and selection without rebuilding the bag', () => {
  let removed = false, highlighted = true, expanded;
  const ui = { selected: 'item', modal: {
    querySelector: () => ({ remove() { removed = true; } }),
    querySelectorAll: () => [{ classList: { remove() { highlighted = false; } }, setAttribute(key, value) { expanded = value; } }]
  }};
  dismissBagDetail(ui); assert.equal(ui.selected, undefined); assert(removed); assert(!highlighted); assert.equal(expanded, 'false');
});
