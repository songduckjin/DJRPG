// Live auto-salvage (작업 196): a switch that turns recovered pieces at or below the chosen grade into
// gold and stones while the player is hunting — and never touches offline rewards, locked gear, an
// empty slot, or a piece better than what is worn.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { World } = await import('../src/game/world.ts');
const { freshSave } = await import('../src/game/store.ts');
const { salvageGold, salvageStones } = await import('../src/game/items.ts');
const { autoSalvageBlock, autoSalvageRecovered, sweepBagOnFull, bagEquipmentCount } = await import('../src/game/inventory.ts');
const { readAutoSalvage, saveAutoSalvage, AUTO_SALVAGE_KEY, AUTO_SALVAGE_ON_NOTICE, AUTO_SALVAGE_HINT } = await import('../src/ui/autoSalvage.ts');

const gear = (id, slot, attack, rarity = 'common', locked = false) => ({ id, name: id, slot, rarity, stats: { attack }, locked });
const book = () => ({ id: 'book', kind: 'skillbook', slot: 'skillbook', rarity: 'epic', stats: {}, skillId: 'slash2' });

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
function hunting({ grade, save = freshSave() } = {}) {
  const world = new World(save);
  world.save.tutorial = 3; world.enemies = []; world.spawnTimer = 999;
  if (grade) world.autoSalvage = () => grade;
  return world;
}
const drop = (item, x = 60, y = 0) => ({ x, y, item, age: 0, warned: false });
function settle(world, seconds = 2.2) { for (let time = 0; time < seconds; time += .02) world.update(.02); }

test('the switch is off until the player turns it on, and stays where they left it', () => {
  const empty = withStorage();
  try {
    assert.equal(readAutoSalvage(), false, 'a fresh device has auto-salvage off');
    saveAutoSalvage(true);
    assert.equal(empty.store.get(AUTO_SALVAGE_KEY), 'on', 'the choice is stored');
    assert.equal(readAutoSalvage(), true, 'and read back on the next visit');
    saveAutoSalvage(false);
    assert.equal(readAutoSalvage(), false);
  } finally { empty.restore(); }
  // Storage that refuses to be read (private mode) leaves the switch off instead of throwing.
  const blocked = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} } });
  try {
    assert.equal(readAutoSalvage(), false);
    assert.doesNotThrow(() => saveAutoSalvage(true));
  } finally { if (blocked) Object.defineProperty(globalThis, 'localStorage', blocked); else delete globalThis.localStorage; }
});

test('turning it on says it only works while connected, and the popup says so under the switch', () => {
  assert.equal(AUTO_SALVAGE_ON_NOTICE, '자동 분해가 켜졌습니다. 접속 중에만 적용됩니다.');
  assert.match(AUTO_SALVAGE_HINT, /접속 중/);
  assert.match(AUTO_SALVAGE_HINT, /오프라인/);
  const equip = readFileSync(new URL('../src/ui/modals/equipModal.ts', import.meta.url), 'utf8');
  const utility = readFileSync(new URL('../src/ui/modals/utilityModal.ts', import.meta.url), 'utf8');
  const iface = readFileSync(new URL('../src/ui/interface.ts', import.meta.url), 'utf8');
  assert.match(equip, /this\.setAutoSalvage\(!this\.autoSalvage\)/, 'the equipment popup has the switch beside the threshold');
  assert.match(equip, /AUTO_SALVAGE_HINT/, 'and the hint under it');
  assert.match(utility, /ui\.setAutoSalvage\(autoToggle\.checked\)/, 'settings has the same switch');
  assert.match(iface, /saveAutoSalvage\(on\)/, 'the choice is stored');
  assert.match(iface, /on \? AUTO_SALVAGE_ON_NOTICE : AUTO_SALVAGE_OFF_NOTICE/, 'and turning it on shows the connected-only notice');
});

test('what it will never take: skill books, locks, higher grades, empty slots and better gear', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 10);
  const epic = gear('epic', 'weapon', 2, 'epic');
  assert.equal(autoSalvageBlock(save, epic, 'epic'), undefined, 'a worse epic weapon is swept');
  assert.equal(autoSalvageBlock(save, book(), 'unique'), 'skillbook', 'a skill book is never swept');
  assert.equal(autoSalvageBlock(save, gear('lock', 'weapon', 2, 'epic', true), 'epic'), 'locked', 'a locked piece is the player’s mark');
  assert.equal(autoSalvageBlock(save, gear('up', 'weapon', 2, 'unique'), 'epic'), 'grade', 'above the chosen grade stays');
  assert.equal(autoSalvageBlock(save, gear('helm', 'helmet', 2, 'epic'), 'epic'), 'empty-slot', 'an empty slot needs something to wear');
  assert.equal(autoSalvageBlock(save, gear('better', 'weapon', 40, 'epic'), 'epic'), 'upgrade', 'a piece better than the worn one stays — same protection as 일괄 분해');
  // A ring only counts as an upgrade against the weaker of the two worn rings.
  save.equipment.ring1 = gear('ring-a', 'ring1', 5); save.equipment.ring2 = gear('ring-b', 'ring2', 20);
  assert.equal(autoSalvageBlock(save, gear('ring-low', 'ring1', 1, 'epic'), 'epic'), undefined, 'a ring weaker than both worn rings is swept');
  assert.equal(autoSalvageBlock(save, gear('ring-up', 'ring1', 10, 'epic'), 'epic'), 'upgrade', 'a ring that beats the weaker worn ring stays');
});

test('a recovered piece is swept into gold and stones without reaching the bag', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 10);
  save.bag = [];
  const world = hunting({ grade: 'epic', save });
  const gold = save.gold, stones = save.stones;
  world.drops = [drop(gear('epic', 'weapon', 2, 'epic'))];
  settle(world);
  assert.equal(world.drops.length, 0, 'the drop was collected');
  assert.equal(save.bag.length, 0, 'and never entered the bag');
  assert.equal(save.gold, gold + salvageGold.epic, 'its gold was paid');
  assert.equal(save.stones, stones + salvageStones.epic, 'and its stones');
});

test('everything it protects stays in the bag', () => {
  for (const [why, item, grade] of [
    ['a piece better than the worn one', gear('better', 'weapon', 40, 'epic'), 'epic'],
    ['a locked piece', gear('lock', 'weapon', 2, 'epic', true), 'epic'],
    ['a grade above the threshold', gear('up', 'weapon', 2, 'unique'), 'epic'],
    ['a piece for an empty slot', gear('helm', 'helmet', 2, 'epic'), 'epic'],
    ['a skill book', book(), 'unique'],
  ]) {
    const save = freshSave();
    save.equipment.weapon = gear('worn', 'weapon', 10);
    const world = hunting({ grade, save });
    const gold = save.gold;
    world.drops = [drop(item)];
    settle(world);
    assert.equal(save.bag.length, 1, `${why} is kept in the bag`);
    assert.equal(save.bag[0].id, item.id);
    assert.equal(save.gold, gold, `${why} pays no gold`);
  }
});

test('with the switch off every piece is kept exactly as before', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 10);
  const world = hunting({ save });
  const gold = save.gold;
  world.drops = [drop(gear('epic', 'weapon', 2, 'epic'))];
  settle(world);
  assert.equal(save.bag.length, 1, 'the piece is in the bag');
  assert.equal(save.gold, gold, 'and nothing was paid');
});

test('a full bag still takes a piece the switch will sweep', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 10);
  // The bag is full of equipment the player keeps.
  save.bag = Array.from({ length: 40 }, (_, index) => gear(`keep-${index}`, 'weapon', 100, 'legendary'));
  const world = hunting({ grade: 'epic', save });
  const gold = save.gold;
  world.drops = [drop(gear('epic', 'weapon', 2, 'epic'))];
  settle(world);
  assert.equal(save.bag.length, 40, 'the bag stays as full as it was');
  assert.equal(save.gold, gold + salvageGold.epic, 'and the swept piece still paid out');
});

test('offline rewards never pass through live auto-salvage', () => {
  const offline = readFileSync(new URL('../src/game/offline.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(offline, /autoSalvage/, 'offline settlement knows nothing about the switch');
  // The sweep only exists on the live field pickup path.
  const world = readFileSync(new URL('../src/game/world.ts', import.meta.url), 'utf8');
  assert.match(world, /const sweep = this\.sweeps\(drop\.item\)/, 'the field picks up through the switch');
  assert.equal(world.includes('autoSalvageRecovered'), true);
});

// ── 가방 40칸 만석이면 옛 장비를 즉시 분해한다(작업 209, 사용자 확정 #4286) ──────────────────────
test('a full bag sweeps only the pieces auto-salvage may take, and pays like a manual salvage', () => {
  const save = freshSave();
  save.maxFloor = 45; // +N까지 상한이 살아나는 층(작업 203)
  save.equipment.weapon = gear('worn', 'weapon', 100);
  save.equipment.armor = gear('worn-armor', 'armor', 100);
  const plusHigh = { ...gear('plus', 'weapon', 6, 'rare'), plus: 5 };
  save.bag = [
    gear('junk-a', 'weapon', 5), gear('junk-b', 'armor', 5),
    gear('locked', 'weapon', 5, 'common', true), plusHigh,
    gear('high', 'weapon', 5, 'unique'), gear('better', 'weapon', 500, 'rare'),
    book(),
    ...Array.from({ length: 34 }, (_, index) => gear(`keep-${index}`, 'weapon', 5, 'unique')),
  ];
  // 작업 248: 스킬북도 한 칸을 쓴다 — 장비 39 + 스킬북 1 = 40칸.
  assert.equal(bagEquipmentCount(save), 41, '가방 41개(장비 40 + 스킬북 1) — 40칸을 넘은 상태');
  const gold = save.gold, stones = save.stones, salvaged = save.salvageCount ?? 0;
  const swept = sweepBagOnFull(save, 'rare', 3);
  assert.deepEqual(swept, { count: 2, gold: salvageGold.common * 2, stones: salvageStones.common * 2 }, '설정 등급 이하 두 벌만');
  assert.equal(bagEquipmentCount(save), 39, '두 칸이 비었다');
  assert.deepEqual(save.bag.map(item => item.id).filter(id => id.startsWith('junk')), [], '분해한 장비는 가방에서 사라진다');
  for (const id of ['locked', 'plus', 'high', 'better', 'book']) assert(save.bag.some(item => item.id === id), `${id}는 보호된다`);
  assert.equal(save.gold, gold + swept.gold); assert.equal(save.stones, stones + swept.stones);
  assert.equal(save.salvageCount, salvaged + 2, '분해 미션에 2회로 센다');
});

test('nothing happens when the bag is not full or everything in it is protected', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 100);
  save.bag = [gear('junk', 'weapon', 5)];
  const gold = save.gold;
  assert.equal(sweepBagOnFull(save, 'rare', 3), undefined, '덜 찼으면 그대로');
  save.bag = Array.from({ length: 40 }, (_, index) => gear(`keep-${index}`, 'weapon', 5, 'unique'));
  assert.equal(sweepBagOnFull(save, 'rare', 3), undefined, '남길 장비밖에 없으면 그대로');
  save.bag = Array.from({ length: 40 }, (_, index) => gear(`lock-${index}`, 'weapon', 5, 'common', true));
  assert.equal(sweepBagOnFull(save, 'rare', 3), undefined, '잠근 장비는 채워도 남긴다');
  assert.equal(save.gold, gold, '아무것도 지급되지 않는다');
});

test('with a full bag the field frees room first, then stores the drop and says what it swept', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 100);
  save.bag = Array.from({ length: 40 }, (_, index) => gear(`junk-${index}`, 'weapon', 5));
  const world = hunting({ grade: 'rare', save });
  const messages = []; world.onMessage = text => messages.push(text);
  const gold = save.gold, stones = save.stones;
  // The drop itself is above the threshold(unique), so only the old bag gear decides whether it fits.
  world.drops = [drop(gear('new', 'weapon', 6, 'unique'))];
  settle(world);
  assert.equal(bagEquipmentCount(save), 1, '가방이 비고 새 장비가 들어왔다');
  assert.equal(save.bag[0].id, 'new');
  assert.equal(save.gold, gold + salvageGold.common * 40, '분해한 40벌의 금화');
  assert.equal(save.stones, stones + salvageStones.common * 40);
  assert.equal(save.salvageCount, 40, '장비 분해 미션에 40회');
  assert(messages.some(text => /가방이 가득 차 설정 이하 장비 40개를 자동 분해했습니다/.test(text)), messages.join(' / '));
});

test('with only protected gear in a full bag the drop still waits on the ground', () => {
  const save = freshSave();
  save.equipment.weapon = gear('worn', 'weapon', 100);
  save.bag = Array.from({ length: 40 }, (_, index) => gear(`keep-${index}`, 'weapon', 5, 'unique'));
  const world = hunting({ grade: 'rare', save });
  const messages = []; world.onMessage = text => messages.push(text);
  const gold = save.gold;
  world.drops = [drop(gear('new', 'weapon', 6, 'unique'))];
  settle(world);
  assert.equal(bagEquipmentCount(save), 40, '가방은 그대로');
  assert.equal(save.gold, gold, '분해도 없다');
  assert.equal(world.drops.length, 1, '드롭은 바닥에 남아 있다');
  assert(messages.some(text => text.includes('가방이 가득 찼습니다')), messages.join(' / '));
});
