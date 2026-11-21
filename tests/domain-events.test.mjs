import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { clearDomainEvents, domainListenerCount, emitDomainEvent, onDomainEvent } = await import('../src/core/domainEvents.ts');
const { wireDomainEvents } = await import('../src/game/domainWiring.ts');
const { World } = await import('../src/game/world.ts');
const { freshSave, rollItem } = await import('../src/game/store.ts');
const { autoEquipBest } = await import('../src/game/items.ts');
const { unequipItem } = await import('../src/game/appearance.ts');
const { discoverEquipment } = await import('../src/game/codex.ts');

// 작업 256 — 도메인 사이의 얇은 이벤트 통로. 사냥·가방·장비·층이 내는 신호를 여기서 고정한다.
const save = () => { const state = freshSave(); state.tutorial = 3; return state; };
const quiet = () => { const world = new World(save()); world.enemies = []; world.spawnTimer = 999; return world; };
const gear = (id, slot = 'weapon', attack = 5) => ({ id, name: '대검', slot, rarity: 'rare', stats: { attack } });

beforeEach(() => clearDomainEvents());
afterEach(() => clearDomainEvents());

test('구독·발행·해제 — 등록 순서대로 부르고 해제하면 더 부르지 않는다', () => {
  const seen = [];
  const offA = onDomainEvent('itemGranted', () => seen.push('a'));
  const offB = onDomainEvent('itemGranted', () => seen.push('b'));
  assert.equal(domainListenerCount('itemGranted'), 2);
  emitDomainEvent('itemGranted', { save: save(), item: gear('x'), source: 'field' });
  assert.deepEqual(seen, ['a', 'b']);
  offA(); offA(); // 두 번 해제해도 안전하다
  assert.equal(domainListenerCount('itemGranted'), 1);
  emitDomainEvent('itemGranted', { save: save(), item: gear('y'), source: 'field' });
  assert.deepEqual(seen, ['a', 'b', 'b']);
  offB();
  assert.equal(domainListenerCount('itemGranted'), 0);
});

test('한 구독자가 던진 예외는 다른 구독자와 발행자를 멈추지 않는다', () => {
  const calls = [];
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    onDomainEvent('monsterKilled', () => { throw new Error('구독자 고장'); });
    onDomainEvent('monsterKilled', () => calls.push('ok'));
    const called = emitDomainEvent('monsterKilled', { save: save(), floor: 1, boss: false, elite: false, gold: 4, x: 0, y: 0 });
    assert.equal(called, 2, '둘 다 호출 대상이다');
    assert.deepEqual(calls, ['ok'], '뒤 구독자는 그대로 돈다');
    assert.equal(errors.length, 1, '조용히 삼키지 않고 콘솔에 남긴다');
  } finally { console.error = originalError; }
});

test('몬스터 처치는 금화·경험치가 반영된 뒤 monsterKilled로 나온다', () => {
  const world = quiet();
  const events = [];
  onDomainEvent('monsterKilled', (event) => events.push({ ...event, goldAtEvent: world.save.gold }));
  world.save.gold = 0;
  world.kill({ x: 12, y: 34, hp: 0, maxHp: 10, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
  assert.equal(events.length, 1);
  const [event] = events;
  assert.equal(event.floor, world.save.floor);
  assert.equal(event.boss, false);
  assert.equal(event.x, 12);
  assert.equal(event.gold, 3 + world.save.floor, '일반 몹 금화 = 3 + 층');
  assert.equal(event.goldAtEvent, event.gold, '이벤트 시점에 이미 금화가 들어가 있다');
  assert.equal(world.save.kills, 1);
});

test('보스 처치는 boss=true로 나오고, 자동 등반이면 floorAdvanced(boss)가 뒤따른다', () => {
  const world = quiet();
  world.save.autoClimb = true;
  const kills = [], floors = [];
  onDomainEvent('monsterKilled', (event) => kills.push(event.boss));
  onDomainEvent('floorAdvanced', (event) => floors.push(event));
  const from = world.save.floor;
  world.kill({ x: 0, y: 0, hp: 0, maxHp: 10, boss: true, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
  assert.deepEqual(kills, [true]);
  assert.equal(world.save.bossKills, 1);
  assert.deepEqual(floors, [{ save: world.save, from, to: from + 1, reason: 'boss' }]);
});

test('층 이동은 floorAdvanced(travel)를 낸다 — 같은 층이면 나오지 않는다', () => {
  const world = quiet();
  world.save.maxFloor = 5;
  const floors = [];
  onDomainEvent('floorAdvanced', (event) => floors.push([event.from, event.to, event.reason]));
  world.travelToFloor(world.save.floor);
  assert.deepEqual(floors, []);
  world.travelToFloor(4);
  assert.deepEqual(floors, [[1, 4, 'travel']]);
});

test('필드 드롭이 가방에 들어가면 itemGranted(field)가 난다', () => {
  const world = quiet();
  const granted = [];
  onDomainEvent('itemGranted', (event) => granted.push([event.item.id, event.source]));
  world.drops = [{ x: 90, y: 0, item: gear('drop-1'), age: 0, warned: false }];
  for (let time = 0; time < 2.4; time += .02) world.update(.02);
  assert.deepEqual(granted, [['drop-1', 'field']]);
  assert.ok(world.save.bag.some((item) => item.id === 'drop-1'));
});

test('장착·해제·자동 장착이 equipmentChanged를 낸다', () => {
  const events = [];
  onDomainEvent('equipmentChanged', (event) => events.push([event.slot, event.item?.id, event.previous?.id, event.source]));

  const state = save();
  state.equipment.weapon = gear('worn');
  const unequipped = unequipItem(state, 'weapon');
  assert.equal(unequipped.ok, true);
  assert.deepEqual(events.at(-1), ['weapon', undefined, 'worn', 'unequip']);

  state.bag.push(gear('better', 'weapon', 50));
  autoEquipBest(state);
  assert.deepEqual(events.at(-1), ['weapon', 'better', undefined, 'auto']);
  assert.equal(state.equipment.weapon.id, 'better');
});

test('도감 구독자는 아이템이 들어오거나 장착이 바뀌면 발견 기록을 갱신한다', () => {
  const off = wireDomainEvents();
  assert.equal(domainListenerCount('itemGranted'), 1);
  const stale = save();
  stale.equipmentCollection = [];
  const item = rollItem(3, false, false, 'warrior');
  stale.bag.push(item);
  emitDomainEvent('itemGranted', { save: stale, item, source: 'pouch' });
  assert.ok(stale.equipmentCollection.length > 0, '장비가 들어오면 도감 칸이 생긴다');
  off();
  assert.equal(domainListenerCount('itemGranted'), 0, '해제하면 구독이 사라진다');
  assert.equal(discoverEquipment(save()), false, '도감 기록이 없는 새 세이브는 바뀔 것이 없다');
});
