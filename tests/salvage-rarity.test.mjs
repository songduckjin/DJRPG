// The bulk-salvage threshold the user set must stay theirs (작업 196): closing the equipment popup,
// switching to another popup or reloading the app may not quietly put it back to "일반만", because
// that button decides which gear 일괄 분해 destroys.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { readSalvageRarity, saveSalvageRarity, nextSalvageRarity, isSalvageRarity, salvageRarities, SALVAGE_RARITY_KEY, SALVAGE_RARITY_DEFAULT } = await import('../src/ui/salvageRarity.ts');
const { resetModalDefaults } = await import('../src/ui/modalDefaults.ts');

/** A device storage with one device's worth of entries behind it, like the browser's localStorage. */
function withStorage(entries = {}) {
  const store = new Map(Object.entries(entries));
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: key => { store.delete(key); },
  } });
  return { store, restore: () => { if (saved) Object.defineProperty(globalThis, 'localStorage', saved); else delete globalThis.localStorage; } };
}

test('the salvage threshold starts at the default and then stays what the user picked', () => {
  assert.equal(SALVAGE_RARITY_DEFAULT, 'common', 'the very first run opens on 일반만');
  const device = withStorage();
  try {
    assert.equal(readSalvageRarity(), 'common', 'nothing stored yet: the default');
    saveSalvageRarity('epic');
    assert.equal(device.store.get(SALVAGE_RARITY_KEY), 'epic', 'the choice is written under the device key');
    // Reading it again is what the next popup and the next session do.
    assert.equal(readSalvageRarity(), 'epic', '에픽 이하 survives closing the popup and reloading');
  } finally { device.restore(); }
  // A device that already holds the choice opens on it straight away, without touching the default.
  const stored = withStorage({ [SALVAGE_RARITY_KEY]: 'rare' });
  try { assert.equal(readSalvageRarity(), 'rare', 'a stored choice is read at startup'); } finally { stored.restore(); }
});

test('a damaged or unreadable threshold falls back instead of throwing', () => {
  for (const broken of ['', 'legendary', 'EPIC', 'nonsense']) {
    const device = withStorage({ [SALVAGE_RARITY_KEY]: broken });
    try { assert.equal(readSalvageRarity(), 'common', `"${broken}" is not a threshold a bulk salvage may take`); } finally { device.restore(); }
  }
  // Storage that refuses to be read (private mode) must not take the popup down with it.
  const blocked = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {},
  } });
  try {
    assert.equal(readSalvageRarity(), 'common', 'a refused read is the default, not an error');
    assert.doesNotThrow(() => saveSalvageRarity('unique'), 'a refused write keeps the choice for this session only');
  } finally { if (blocked) Object.defineProperty(globalThis, 'localStorage', blocked); else delete globalThis.localStorage; }
});

test('the threshold button steps through every grade a bulk salvage may take', () => {
  assert.deepEqual([...salvageRarities], ['common', 'magic', 'rare', 'epic', 'unique'], 'legendary is never swept up');
  const walked = [];
  let value = SALVAGE_RARITY_DEFAULT;
  for (let step = 0; step < salvageRarities.length; step++) { walked.push(value); value = nextSalvageRarity(value); }
  assert.deepEqual(walked, ['common', 'magic', 'rare', 'epic', 'unique'], '일반 → 매직 → 레어 → 에픽 → 유니크');
  assert.equal(value, 'common', 'and back to the start');
  for (const rarity of salvageRarities) assert(isSalvageRarity(rarity));
  assert.equal(isSalvageRarity('legendary'), false);
  assert.equal(isSalvageRarity(undefined), false);
});

test('the popup keeps the threshold instead of resetting it when it reopens', () => {
  const defaults = readFileSync(new URL('../src/ui/modalDefaults.ts', import.meta.url), 'utf8');
  const equip = readFileSync(new URL('../src/ui/modals/equipModal.ts', import.meta.url), 'utf8');
  const iface = readFileSync(new URL('../src/ui/interface.ts', import.meta.url), 'utf8');
  // Reopening a popup resets view state only; the salvage threshold is not view state.
  assert.equal(defaults.includes('ui.salvageRarity'), false, 'closing the popup no longer puts the threshold back');
  assert(iface.includes('salvageRarity: SalvageRarity = readSalvageRarity()'), 'the popup opens on the stored choice');
  assert(equip.includes('this.salvageRarity = nextSalvageRarity(this.salvageRarity)'), 'the button steps the threshold');
  assert(equip.includes('saveSalvageRarity(this.salvageRarity)'), 'and stores every change as it is made');
  // The threshold is what 일괄 분해 actually sweeps, so the stored value must be the one used.
  assert(equip.includes('rarityRanks[item.rarity] <= rarityRanks[this.salvageRarity]'), '일괄 분해 uses the kept threshold');
});

test('a reopened popup shows the stored threshold on its button', () => {
  const device = withStorage({ [SALVAGE_RARITY_KEY]: 'epic' });
  try { assert.equal(readSalvageRarity(), 'epic'); } finally { device.restore(); }
  // `resetModalDefaults` must leave the chosen value exactly as it is, whatever it is.
  for (const rarity of salvageRarities) {
    const ui = { salvageRarity: rarity, bagFilter: 'weapon', bagRaritySort: true, modal: { querySelector: () => null, querySelectorAll: () => [] } };
    resetModalDefaults(ui);
    assert.equal(ui.salvageRarity, rarity, `reopening keeps ${rarity}`);
    assert.equal(ui.bagFilter, 'all', 'while the bag filter still resets as before');
  }
});
