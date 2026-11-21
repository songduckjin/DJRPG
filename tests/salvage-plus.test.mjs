// 41층 이후의 자동 분해 `+단계` 필터 (작업 203).
//
// 사용자 확정 스펙: 41층에 닿기 전에는 예전과 완전히 같다(등급 기준만). 41층부터 `+0까지`~`+7까지` 중
// 고른 단계까지(`+0 ~ +N`)만 자동 분해되고, 그 위 단계는 지금 낀 장비보다 약해도 경매장 판매용으로 남는다.
// 기본값은 `+4까지`이고 고른 값은 기기에 남는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { World } = await import('../src/game/world.ts');
const { freshSave } = await import('../src/game/store.ts');
const { salvageGold, salvageStones } = await import('../src/game/items.ts');
const { autoSalvageBlock, autoSalvageRecovered, AUTO_SALVAGE_PLUS_FLOOR, salvagePlan } = await import('../src/game/inventory.ts');
const { SALVAGE_PLUS_KEY, SALVAGE_PLUS_DEFAULT, salvagePlusValues, salvagePlusLabel, salvagePlusUnlocked, readSalvagePlus, saveSalvagePlus, isSalvagePlus } = await import('../src/ui/salvagePlus.ts');
const { renderInventory } = await import('../src/ui/modals/equipModal.ts');

const gear = (id, slot, attack, rarity = 'common', plus = 0, locked = false) => ({ id, name: id, slot, rarity, stats: { attack }, plus, locked });
const drop = (item, x = 60, y = 0) => ({ x, y, item, age: 0, warned: false });

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
/** A field with no mobs, so a test can place one drop and let it fly into the hero. */
function hunting({ grade, plus, save = freshSave() } = {}) {
  const world = new World(save);
  world.save.tutorial = 3; world.enemies = []; world.spawnTimer = 999;
  if (grade) world.autoSalvage = () => grade;
  if (plus !== undefined) world.autoSalvagePlus = () => plus;
  return world;
}
function settle(world, seconds = 2.2) { for (let time = 0; time < seconds; time += .02) world.update(.02); }

test('the cap is +4까지 until the player picks one, and the choice is kept on the device', () => {
  const device = withStorage();
  try {
    assert.equal(readSalvagePlus(), SALVAGE_PLUS_DEFAULT, 'a fresh device sweeps up to +4까지');
    assert.equal(SALVAGE_PLUS_DEFAULT, 4);
    saveSalvagePlus(6);
    assert.equal(device.store.get(SALVAGE_PLUS_KEY), '6', 'the choice is stored under its own key');
    assert.equal(SALVAGE_PLUS_KEY, 'djrpg-auto-salvage-plus');
    assert.equal(readSalvagePlus(), 6, 'and read back on the next visit');
    saveSalvagePlus(0);
    assert.equal(readSalvagePlus(), 0, 'including +0까지 (only plain +0 pieces)');
    saveSalvagePlus(7);
    assert.equal(readSalvagePlus(), 7, 'and +7까지 (every piece)');
  } finally { device.restore(); }
  for (const [stored, expected] of [['', 4], ['abc', 4], ['8', 4], ['-1', 4], ['2.5', 4], ['3', 3]]) {
    const damaged = withStorage(stored === '' ? {} : { [SALVAGE_PLUS_KEY]: stored });
    try { assert.equal(readSalvagePlus(), expected, `a damaged entry (${JSON.stringify(stored)}) falls back to the last good choice`); }
    finally { damaged.restore(); }
  }
  const blocked = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} } });
  try {
    assert.equal(readSalvagePlus(), SALVAGE_PLUS_DEFAULT, 'private mode sweeps up to +4까지');
    assert.doesNotThrow(() => saveSalvagePlus(6));
  } finally { if (blocked) Object.defineProperty(globalThis, 'localStorage', blocked); else delete globalThis.localStorage; }
});

test('the labels read +0까지 ~ +7까지, and only 0~7 is a real cap', () => {
  assert.deepEqual([...salvagePlusValues], [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(salvagePlusValues.map(salvagePlusLabel), ['+0까지', '+1까지', '+2까지', '+3까지', '+4까지', '+5까지', '+6까지', '+7까지']);
  for (const value of salvagePlusValues) assert.equal(isSalvagePlus(value), true);
  for (const value of [-1, 8, 2.5, '4', null, undefined]) assert.equal(isSalvagePlus(value), false, `${value} is not a cap`);
});

test('the filter opens at 41층 and is not there below it', () => {
  assert.equal(AUTO_SALVAGE_PLUS_FLOOR, 41);
  for (let floor = 1; floor <= 40; floor++) assert.equal(salvagePlusUnlocked(floor), false, `${floor}층 has no +단계 yet`);
  for (const floor of [41, 42, 78]) assert.equal(salvagePlusUnlocked(floor), true, `${floor}층 shows the filter`);
});

test('below 41층 the cap is ignored and the old grade rules decide exactly as before', () => {
  const save = freshSave();
  save.maxFloor = 40; save.floor = 40;
  save.equipment.weapon = gear('worn', 'weapon', 10);
  // A +7 piece that is still weaker than the worn weapon is swept: 40층 이하에서는 +단계 필터가 없다.
  assert.equal(autoSalvageBlock(save, gear('weak-plus', 'weapon', 2, 'epic', 7), 'epic', 4), undefined, 'the cap does not protect anything below 41층');
  // And the very same piece at 41층 is kept.
  save.maxFloor = 41;
  assert.equal(autoSalvageBlock(save, gear('weak-plus', 'weapon', 2, 'epic', 7), 'epic', 4), 'plus', '41층부터는 +7이 남는다');
  // Without a chosen cap nothing changes either (the world always passes one, but the rule stays explicit).
  assert.equal(autoSalvageBlock(save, gear('weak-plus', 'weapon', 2, 'epic', 7), 'epic'), undefined);
});

test('from 41층 the default +4까지 keeps +5~+7 and sweeps +0~+4', () => {
  const save = freshSave();
  save.maxFloor = 45; save.floor = 45;
  save.equipment.weapon = gear('worn', 'weapon', 10);
  for (const plus of [0, 1, 2, 3, 4]) {
    assert.equal(autoSalvageBlock(save, gear(`p${plus}`, 'weapon', 2, 'epic', plus), 'epic', SALVAGE_PLUS_DEFAULT), undefined, `+${plus} is swept`);
  }
  for (const plus of [5, 6, 7]) {
    assert.equal(autoSalvageBlock(save, gear(`p${plus}`, 'weapon', 2, 'epic', plus), 'epic', SALVAGE_PLUS_DEFAULT), 'plus', `+${plus} is kept for the auction house`);
  }
  // A missing plus is +0: it is swept like any plain piece.
  assert.equal(autoSalvageBlock(save, gear('plain', 'weapon', 2, 'epic'), 'epic', 4), undefined, 'a piece without a 단계 counts as +0');
});

test('the player’s own cap moves the line, and the other protections still come first', () => {
  const save = freshSave();
  save.maxFloor = 45;
  save.equipment.weapon = gear('worn', 'weapon', 10);
  assert.equal(autoSalvageBlock(save, gear('p6', 'weapon', 2, 'epic', 6), 'epic', 6), undefined, '+6까지 sweeps +6');
  assert.equal(autoSalvageBlock(save, gear('p7', 'weapon', 2, 'epic', 7), 'epic', 6), 'plus', '+7까지로 올려야 +7이 갈린다');
  assert.equal(autoSalvageBlock(save, gear('p1', 'weapon', 2, 'epic', 1), 'epic', 0), 'plus', '+0까지면 +1도 남는다');
  assert.equal(autoSalvageBlock(save, gear('p0', 'weapon', 2, 'epic', 0), 'epic', 0), undefined, 'but +0 still goes');
  // The existing protections are unchanged and still reported first.
  assert.equal(autoSalvageBlock(save, gear('up', 'weapon', 2, 'unique', 2), 'epic', 4), 'grade');
  assert.equal(autoSalvageBlock(save, gear('lock', 'weapon', 2, 'epic', 6, true), 'epic', 4), 'locked');
  assert.equal(autoSalvageBlock(save, { id: 'book', kind: 'skillbook', slot: 'skillbook', rarity: 'epic', stats: {}, skillId: 'slash2' }, 'unique', 4), 'skillbook');
  // A +5 piece weaker than the worn one is kept by the cap, not by the upgrade rule.
  assert.equal(autoSalvageBlock(save, gear('weak5', 'weapon', 4, 'epic', 5), 'epic', 4), 'plus');
  // Still: a +5 piece that beats the worn one is kept too (both rules agree).
  assert.equal(autoSalvageBlock(save, gear('strong5', 'weapon', 60, 'epic', 5), 'epic', 4), 'plus');
  assert.equal(autoSalvageBlock(save, gear('strong2', 'weapon', 60, 'epic', 2), 'epic', 4), 'upgrade');
});

test('a high-단계 piece stays in the bag on the live field, a low one is swept as before', () => {
  const save = freshSave();
  save.maxFloor = 45; save.floor = 45;
  save.equipment.weapon = gear('worn', 'weapon', 10);
  save.bag = [];
  const world = hunting({ grade: 'epic', plus: 4, save });
  const gold = save.gold, stones = save.stones;
  const keep = gear('keep', 'weapon', 2, 'epic', 5);
  world.drops = [drop(keep)];
  settle(world);
  assert.equal(save.bag.length, 1, 'the +5 piece flew into the bag');
  assert.equal(save.bag[0].id, 'keep');
  assert.equal(save.gold, gold, 'and paid nothing');
  assert.equal(save.stones, stones);

  const sweep = gear('sweep', 'weapon', 2, 'epic', 4);
  world.drops = [drop(sweep)];
  settle(world);
  assert.equal(save.bag.length, 1, 'the +4 piece never reached the bag');
  assert.equal(save.gold, gold + salvageGold.epic, 'its gold was paid');
  assert.equal(save.stones, stones + salvageStones.epic, 'and its stones');
  // `autoSalvageRecovered` is the same rule, so a direct call agrees.
  assert.equal(autoSalvageRecovered(save, gear('direct', 'weapon', 2, 'epic', 6), 'epic', 4), undefined);
  assert.deepEqual(autoSalvageRecovered(save, gear('direct2', 'weapon', 2, 'epic', 4), 'epic', 4), {
    gold: salvageGold.epic, stones: salvageStones.epic,
  });
});

test('a full bag still takes a piece the cap allows, and keeps one it protects', () => {
  const save = freshSave();
  save.maxFloor = 45;
  save.equipment.weapon = gear('worn', 'weapon', 10);
  save.bag = Array.from({ length: 40 }, (_, index) => gear(`keep-${index}`, 'weapon', 100, 'legendary'));
  const world = hunting({ grade: 'epic', plus: 4, save });
  const gold = save.gold;
  world.drops = [drop(gear('sweep', 'weapon', 2, 'epic', 3))];
  settle(world);
  assert.equal(save.bag.length, 40, 'the bag stays full — the swept piece needed no room');
  assert.equal(save.gold, gold + salvageGold.epic, 'and it paid out');

  world.drops = [drop(gear('protect', 'weapon', 2, 'epic', 6))];
  settle(world, 2.2);
  assert.equal(save.bag.length, 40, 'a protected piece cannot enter a full bag');
  assert.equal(world.drops.length, 1, 'so it waits on the ground instead of vanishing');
  assert.equal(save.gold, gold + salvageGold.epic, 'and it is not turned into gold');
});

test('일괄 분해 is the player’s own selection and is not limited by the +단계 cap', () => {
  const save = freshSave();
  save.maxFloor = 45;
  save.equipment.weapon = gear('worn', 'weapon', 10);
  save.bag = [gear('p7', 'weapon', 2, 'epic', 7), gear('p1', 'weapon', 2, 'epic', 1), gear('up', 'weapon', 40, 'epic', 0)];
  const plan = salvagePlan(save, ['p7', 'p1', 'up']);
  assert.deepEqual(plan.items.map(item => item.id), ['p7', 'p1', 'up'], 'every selected piece is in the plan');
  assert.deepEqual(plan.upgrades.map(upgrade => upgrade.item.id), ['up'], 'only the real upgrade is flagged, as before');
});

test('the equipment popup shows the picker at 41층 and hides it below', () => {
  withDocument(() => {
    const bag = runRenderInventory(40);
    assert.equal(findByClass(bag, 'salvage-plus'), undefined, '40층: no +단계 picker, exactly the old footer');
    const opened = runRenderInventory(41);
    const select = findByClass(opened, 'salvage-plus');
    assert(select, '41층: the picker sits beside the grade button');
    assert.equal(select.value, '4', 'and opens on +4까지');
    const options = select.children.map(option => [option.value, option.textContent]);
    assert.deepEqual(options, [['0', '자동 분해 +0까지'], ['1', '자동 분해 +1까지'], ['2', '자동 분해 +2까지'], ['3', '자동 분해 +3까지'], ['4', '자동 분해 +4까지'], ['5', '자동 분해 +5까지'], ['6', '자동 분해 +6까지'], ['7', '자동 분해 +7까지']]);
    assert.match(select.attrs['aria-label'], /\+4까지/);
    // Choosing a value goes through the interface setter, which stores it.
    const device = withStorage({ [SALVAGE_PLUS_KEY]: '6' });
    try {
      const remembered = runRenderInventory(41);
      assert.equal(findByClass(remembered, 'salvage-plus').value, '6', 'reopening shows the stored cap');
    } finally { device.restore(); }
  });
});

test('the settings popup has the same picker, and the switch, threshold and cap are wired', () => {
  const utility = readFileSync(new URL('../src/ui/modals/utilityModal.ts', import.meta.url), 'utf8');
  const iface = readFileSync(new URL('../src/ui/interface.ts', import.meta.url), 'utf8');
  const equip = readFileSync(new URL('../src/ui/modals/equipModal.ts', import.meta.url), 'utf8');
  const store = readFileSync(new URL('../src/game/store.ts', import.meta.url), 'utf8');
  const world = readFileSync(new URL('../src/game/fieldProgress.ts', import.meta.url), 'utf8');  // PR-2B: 필드의 킬 보상·드롭·자동 분해 규칙은 `fieldProgress.ts`로 옮겼다(월드는 이름만 남은 껍데기).
  assert.match(utility, /salvagePlusUnlocked\(ui\.world\.save\.maxFloor\)/, 'settings only shows the row from 41층');
  assert.match(utility, /ui\.setSalvagePlus\(Number\(plusSelect\.value\)\)/, 'and stores the choice');
  assert.match(iface, /world\.autoSalvagePlus = \(\) => this\.salvagePlus/, 'the world asks for the latest cap on every pickup');
  assert.match(iface, /saveSalvagePlus\(this\.salvagePlus\)/, 'the choice is stored');
  assert.match(iface, /salvagePlus = readSalvagePlus\(\)/, 'and read back when the app starts');
  assert.match(equip, /salvagePlusUnlocked\(save\.maxFloor\)/, 'the equipment popup gates the picker on the highest floor');
  assert.match(store, /djrpg-auto-salvage-plus/, 'starting over clears the stored cap with the switch and the threshold');
  assert.match(world, /autoSalvageBlock\(this\.save, item, grade, this\.autoSalvagePlus\?\.\(\)\)/, 'the field pickup passes the cap');
  assert.match(world, /autoSalvageRecovered\(this\.save, drop\.item, sweep, this\.autoSalvagePlus\?\.\(\)\)/, 'and so does the sweep');
  const offline = readFileSync(new URL('../src/game/offline.ts', import.meta.url), 'utf8');
  assert.match(offline, /autoSalvageRecovered\(save, item, options\.autoSalvage, options\.autoSalvagePlus\)/, 'offline rewards use the same cap (작업 254)');
});

// ---- a small DOM stub, enough for the bag footer ------------------------------------------------
function node(tag = 'div') {
  const element = { tag, children: [], className: '', textContent: '', value: '', type: '', title: '', disabled: false,
    attrs: {}, dataset: {}, style: { setProperty() {} },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener() {},
    classList: { add() {}, toggle() {} } };
  return element;
}
function withDocument(work) {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => node(tag), createTextNode: text => ({ textContent: text, children: [] }), body: node('body') };
  try { return work(); } finally { globalThis.document = previous; }
}
function findByClass(root, name) {
  if (root?.className?.split(' ').includes(name)) return root;
  for (const child of root?.children ?? []) { const found = findByClass(child, name); if (found) return found; }
  return undefined;
}
/** Renders the bag footer for a save whose highest floor is `maxFloor`, with an empty bag. */
function runRenderInventory(maxFloor) {
  const save = freshSave();
  save.maxFloor = maxFloor; save.floor = maxFloor; save.bag = [];
  const stored = readSalvagePlus();
  const dialog = node('div');
  const ui = {
    world: { save }, bagFilter: 'all', bagRaritySort: false, selected: undefined,
    salvageRarity: 'epic', autoSalvage: true, salvagePlus: stored, renders: 0,
    renderModal() { this.renders++; }, message() {}, salvage() {},
    setAutoSalvage(on) { this.autoSalvage = on; },
    setSalvagePlus(value) { this.salvagePlus = value; saveSalvagePlus(value); },
  };
  renderInventory.call(ui, dialog);
  return dialog;
}
