import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave, parseSave, totalStats } = await import('../src/game/store.ts');
const { migrateItem, isStatBook, isEquipment, itemJob } = await import('../src/game/items.ts');
const {
  STAT_BOOKS, STAT_BOOK_ORDER, STAT_BOOK_LIMIT, STAT_BOOK_DROP_RATES, statBookItem, rollStatBook,
  statBookCounts, statBookBonus, statBookRemaining, statBookStatusText, useStatBook, rollStatBookDrop
} = await import('../src/game/statBooks.ts');
const { countedInBag, equipmentCount } = await import('../src/game/bagCapacity.ts');

/**
 * 영구 스탯북 4종 (2026-11-22 스킬 개편 파트 B + 같은 날 지시 `#23788`).
 * `공격의 서` +5 · `방어의 서` +3 · `체력의 서` +30 · `스킬의 서` SP +1, 캐릭터당 종류별 최대 30권.
 */

test('네 종류의 이름·상승량·상한이 확정 스펙 그대로다', () => {
  assert.deepEqual([...STAT_BOOK_ORDER], ['attack', 'defense', 'health', 'skill']);
  assert.deepEqual(STAT_BOOKS.attack, { name: '공격의 서', stat: 'attack', perBook: 5, max: 30, description: STAT_BOOKS.attack.description });
  assert.equal(STAT_BOOKS.defense.name, '방어의 서');
  assert.equal(STAT_BOOKS.defense.perBook, 3);
  assert.equal(STAT_BOOKS.health.name, '체력의 서');
  assert.equal(STAT_BOOKS.health.perBook, 30);
  // 스킬의 서 — 레벨과 상관없이 영구 SP +1, 상한은 다른 책과 같은 30권.
  assert.equal(STAT_BOOKS.skill.name, '스킬의 서');
  assert.equal(STAT_BOOKS.skill.sp, 1);
  assert.equal(STAT_BOOKS.skill.stat, undefined, '능력치 책이 아니다');
  assert.equal(STAT_BOOKS.skill.perBook, 1);
  assert.match(STAT_BOOKS.skill.description, /스킬포인트\(SP\) \+1/);
  assert.equal(STAT_BOOK_LIMIT, 30);
  for (const kind of STAT_BOOK_ORDER) assert.equal(STAT_BOOKS[kind].max, 30, `${kind}: 캐릭터당 30권`);
  // 최대까지 쓰면 세 종류 합계가 공격 +150 · 방어 +90 · 체력 +900이다.
  assert.equal(30 * STAT_BOOKS.attack.perBook + 30 * STAT_BOOKS.defense.perBook + 30 * STAT_BOOKS.health.perBook, 1140);
});

test('스탯북은 세 직업 공용 소모품이고 장비가 아니다', () => {
  for (const kind of STAT_BOOK_ORDER) {
    const item = statBookItem(kind, `id-${kind}`);
    assert.equal(item.kind, 'statbook');
    assert.equal(item.slot, 'statbook');
    assert.equal(item.book, kind);
    assert.equal(item.name, STAT_BOOKS[kind].name);
    assert.deepEqual(item.stats, {});
    assert.equal(isStatBook(item), true);
    assert.equal(isEquipment(item), false, '장비 아님 — 분해·장착·도감 대상이 아니다');
    assert.equal(itemJob(item), undefined, '직업 구분 없음(세 직업 공용)');
    assert.equal(countedInBag(item, 'warrior'), true, '가방 1칸을 쓴다');
  }
  assert.equal(equipmentCount([statBookItem('attack', 'a'), statBookItem('health', 'b')], 'mage'), 2);
});

test('확률표 — 개극악 확률 한 곳, 네 종류는 같은 확률(1/4)', () => {
  // 송덕진 님 확정(2026-11-22): 일반 몹 0.01%, 보스 0.05~0.1%.
  assert.equal(STAT_BOOK_DROP_RATES.hunt, .0001, '접속 사냥 일반·정예 0.01%');
  assert.equal(STAT_BOOK_DROP_RATES.offline, .0001, '방치 사냥 0.01%');
  assert.equal(STAT_BOOK_DROP_RATES.boss, .0005, '필드 보스 0.05%');
  assert.equal(STAT_BOOK_DROP_RATES.dungeonBoss, .001, '던전 보스 0.1%');
  assert.equal(STAT_BOOK_DROP_RATES.pouch, .01, '보물 주머니 1%');
  // 판정: 경계 아래만 당첨.
  assert.equal(rollStatBookDrop('hunt', () => .00005)?.kind, 'statbook');
  assert.equal(rollStatBookDrop('hunt', () => .0002), undefined);
  // 네 종류는 같은 확률 — 0/.25/.5/.75 구간이 각각 공격/방어/체력/스킬.
  assert.equal(rollStatBook(() => 0).book, 'attack');
  assert.equal(rollStatBook(() => .4).book, 'defense');
  assert.equal(rollStatBook(() => .6).book, 'health');
  assert.equal(rollStatBook(() => .9).book, 'skill', '스킬의 서도 같은 풀에 든다');
  const counts = { attack: 0, defense: 0, health: 0, skill: 0 };
  let seed = 99;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let index = 0; index < 3000; index++) counts[rollStatBook(random).book]++;
  for (const kind of STAT_BOOK_ORDER) assert(Math.abs(counts[kind] / 3000 - 1 / 4) < .04, `${kind} 비중 ${counts[kind] / 30}%`);
});

test('사용하면 책 한 권이 사라지고 그 종류가 1 오른다 — 30권에서 막힌다', () => {
  const save = freshSave();
  save.bag = [statBookItem('attack', 'a1'), statBookItem('attack', 'a2'), statBookItem('health', 'h1')];
  assert.deepEqual(statBookCounts(save), { attack: 0, defense: 0, health: 0, skill: 0 });
  const first = useStatBook(save, 'a1');
  assert.equal(first.ok, true);
  assert.match(first.message, /영구 공격력 \+5/);
  assert.match(first.message, /1\/30권/);
  assert.deepEqual(save.statBooks, { attack: 1, defense: 0, health: 0, skill: 0 });
  assert.deepEqual(save.bag.map(item => item.id), ['a2', 'h1'], '쓴 책만 소모된다');
  assert.equal(useStatBook(save, 'h1').ok, true);
  assert.equal(statBookRemaining(save, 'health'), 29);
  assert.equal(statBookStatusText(save, 'health'), '영구 체력 +30 · 사용 1/30권');
  // 상한: 30권을 다 쓰면 더 못 쓴다(책은 그대로 남는다).
  save.bag = [statBookItem('attack', 'full')];
  save.statBooks = { attack: 30, defense: 0, health: 1 };
  const capped = useStatBook(save, 'full');
  assert.equal(capped.ok, false);
  assert.match(capped.message, /최대 30권/);
  assert.deepEqual(save.bag.map(item => item.id), ['full'], '상한에서는 소모하지 않는다');
  // 옛 세이브의 깨진 값은 0으로 다듬고 30을 넘지 않는다.
  assert.deepEqual(statBookCounts({ statBooks: { attack: 999, defense: -3, health: 'x' } }), { attack: 30, defense: 0, health: 0, skill: 0 });
});

test('스킬의 서를 쓰면 가용 SP가 1 늘고 저장 필드도 같은 값이 된다 — 상한 30권', async () => {
  const { spLedger } = await import('../src/game/skillPoints.ts');
  const save = freshSave();
  const before = spLedger(save).available;
  save.bag = [statBookItem('skill', 's1'), statBookItem('skill', 's2')];
  const first = useStatBook(save, 's1');
  assert.equal(first.ok, true);
  assert.match(first.message, /영구 스킬포인트\(SP\) \+1/);
  assert.equal(spLedger(save).available, before + 1, '레벨과 무관하게 SP +1');
  assert.equal(save.skillPoints, before + 1, '저장 필드 동기화');
  assert.equal(statBookStatusText(save, 'skill'), '영구 스킬포인트(SP) +1 · 사용 1/30권');
  // 능력치에는 영향이 없다(총합은 그대로).
  const stats = totalStats(save);
  assert.equal(stats.attack, totalStats(freshSave()).attack);
  // 30권 상한.
  save.statBooks = { attack: 0, defense: 0, health: 0, skill: 30 };
  const capped = useStatBook(save, 's2');
  assert.equal(capped.ok, false);
  assert.match(capped.message, /최대 30권/);
});

test('영구 보너스가 전투 스탯에 그대로 더해진다 — 배율이 끝난 뒤 +5/+3/+30', () => {
  const base = freshSave();
  const before = totalStats(base);
  base.statBooks = { attack: 2, defense: 2, health: 2 };
  const after = totalStats(base);
  assert.equal(after.attack - before.attack, 2 * 5, '공격 +5 × 2권');
  assert.equal(after.defense - before.defense, 2 * 3, '방어 +3 × 2권');
  assert.equal(after.health - before.health, 2 * 30, '체력 +30 × 2권');
  // 최대 30권이면 공격 +150 · 방어 +90 · 체력 +900.
  const maxed = freshSave();
  maxed.statBooks = { attack: 30, defense: 30, health: 30 };
  const full = totalStats(maxed);
  assert.equal(full.attack - before.attack, 150);
  assert.equal(full.defense - before.defense, 90);
  assert.equal(full.health - before.health, 900);
  // 추가옵션 %·패시브가 책의 몫을 부풀리지 않는다(배율 뒤에 더한다).
  const boosted = freshSave();
  boosted.statBooks = { attack: 30, defense: 30, health: 30 };
  boosted.equipment.weapon = { id: 'w', name: '황혼의 두손검', slot: 'weapon', rarity: 'epic', stats: { attack: 50, defense: 5, health: 20 }, extraOptions: { attackPct: 3 } };
  const withGear = totalStats(boosted);
  const noBooks = structuredClone(boosted);
  noBooks.statBooks = { attack: 0, defense: 0, health: 0 };
  const gearOnly = totalStats(noBooks);
  assert.equal(withGear.attack - gearOnly.attack, 150, '추가옵션 +3%가 책 몫에 곱해지지 않는다');
});

test('세이브 — 새 캐릭터는 0/0/0/0, 읽을 때 정규화되고 옛 스킬북은 버린다', () => {
  assert.deepEqual(freshSave().statBooks, { attack: 0, defense: 0, health: 0, skill: 0 });
  const loaded = parseSave({ ...freshSave(), statBooks: { attack: 4, defense: 99, health: 'bad' } });
  assert.deepEqual(loaded.statBooks, { attack: 4, defense: 30, health: 0, skill: 0 });
  const missing = parseSave({ ...freshSave(), statBooks: undefined });
  assert.deepEqual(missing.statBooks, { attack: 0, defense: 0, health: 0, skill: 0 }, '옛 세이브는 0부터');
  // 옛 스킬북은 읽기에서 사라지고, 스탯북은 남는다.
  const legacy = parseSave({
    ...freshSave(),
    bag: [
      { id: 'book', name: '[스킬북] 회오리 베기', slot: 'skillbook', kind: 'skillbook', skillId: 'spin', rarity: 'rare', stats: {} },
      { id: 'stat', name: '공격의 서', slot: 'statbook', kind: 'statbook', book: 'attack', rarity: 'unique', stats: {} }
    ]
  });
  assert.deepEqual(legacy.bag.map(item => item.id), ['stat']);
  assert.equal(migrateItem({ id: 'x', kind: 'skillbook', slot: 'skillbook', skillId: 'spin' }), undefined);
  const restored = migrateItem({ id: 'y', kind: 'statbook', slot: 'statbook', book: 'defense' });
  assert.equal(restored.name, '방어의 서');
  assert.equal(migrateItem({ id: 'z', kind: 'statbook', slot: 'statbook', book: 'unknown' }), undefined);
});

test('기존 아이템 이름은 그대로 살린다(서버 소유권 identity 유지)', () => {
  const stored = migrateItem({ id: 'keep', kind: 'statbook', slot: 'statbook', book: 'attack', name: '공격의 서' });
  assert.equal(stored.name, '공격의 서');
  assert.equal(stored.id, 'keep');
});
