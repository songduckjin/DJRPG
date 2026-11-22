import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BAG_SLOT_LIMIT, RewardGrantError, bagSlotCount, diamondGrantOperations, grantRewardsToSave,
  itemTakesSlot, normalizeRewardEntry, planRewards, rewardSlotNeed, rewardTotals,
} from '../server/core/rewardGrant.mjs';

// 작업 256 — 재화·아이템 지급의 단일 창구. 우편·여정·거래소·공용창고가 각자 적던
// 가방 40칸 규칙과 수량 방어를 이 파일 하나로 모았다. 여기서 그 규칙을 고정한다.

const gear = (id) => ({ id, name: '강철 쯔바이핸드', slot: 'weapon', rarity: 'rare', stats: { attack: 25 } });
const statBook = (id, kind = 'attack') => ({ id, name: { attack: '공격의 서', defense: '방어의 서', health: '체력의 서' }[kind] ?? '공격의 서', slot: 'statbook', kind: 'statbook', book: kind, rarity: 'unique', stats: {} });
const pouch = (id) => ({ id, name: '무작위 보물 주머니', slot: 'pouch', kind: 'pouch', rarity: 'unique', stats: {} });
const blank = (bag = [], job = 'warrior', gold = 0) => ({ job, gold, bag });


test('수량은 0 이상의 정수만 인정한다 — 음수·소수·문자열·NaN은 0', () => {
  assert.deepEqual(normalizeRewardEntry({ gold: -50, books: -1, pouches: -3, diamonds: -100 }), { gold: 0, books: 0, pouches: 0, diamonds: 0, item: undefined });
  assert.deepEqual(normalizeRewardEntry({ gold: 12.9, books: '2', pouches: 'abc', diamonds: NaN }), { gold: 12, books: 2, pouches: 0, diamonds: 0, item: undefined });
  assert.deepEqual(normalizeRewardEntry(undefined), { gold: 0, books: 0, pouches: 0, diamonds: 0, item: undefined });
  assert.deepEqual(rewardTotals([{ gold: 100, books: 1 }, { gold: -30, pouches: 2 }, { gold: 5.7 }]), { gold: 105, books: 1, pouches: 2, diamonds: 0 });
});

test('가방 40칸은 모든 아이템 1개 = 1칸이다(파트 B — 스킬북 폐지로 직업 예외가 사라졌다)', () => {
  const save = blank([gear('a'), pouch('p'), statBook('b')]);
  assert.equal(itemTakesSlot(statBook('b'), 'warrior'), true, '영구 스탯북도 한 칸');
  assert.equal(itemTakesSlot(pouch('p'), 'warrior'), true, '보물 주머니도 한 칸');
  assert.equal(bagSlotCount(save), 3, '장비 1 + 주머니 1 + 스탯북 1');
});

test('지급 계획은 40칸 경계에서 정확히 갈린다', () => {
  const almost = blank(Array.from({ length: BAG_SLOT_LIMIT - 1 }, (_, index) => gear(`g${index}`)));
  assert.equal(planRewards(almost, [{ pouches: 1 }]).fits, true, '마지막 한 칸은 들어간다');
  assert.equal(planRewards(almost, [{ pouches: 2 }]).fits, false, '두 칸은 넘친다');
  // 파트 B: `books`는 지급하지 않으므로 칸도 세지 않는다(옛 우편 값은 무시).
  assert.equal(planRewards(almost, [{ books: 5 }]).fits, true, '스킬북 수량은 자리를 쓰지 않는다');
  assert.equal(planRewards(almost, [{ gold: 5000 }]).fits, true, '금화만 주는 보상은 자리를 쓰지 않는다');
  // 이미 40칸을 넘긴 예전 세이브라도 금화 보상은 받을 수 있다.
  const over = blank(Array.from({ length: BAG_SLOT_LIMIT + 3 }, (_, index) => gear(`o${index}`)));
  assert.equal(planRewards(over, [{ gold: 1000 }]).fits, true);
  assert.equal(planRewards(over, [{ pouches: 1 }]).fits, false);
});

test('자리가 없으면 아무것도 넣지 않고 BAG_FULL로 거절한다(원자적)', () => {
  const save = blank(Array.from({ length: BAG_SLOT_LIMIT }, (_, index) => gear(`g${index}`)), 'warrior', 100);
  assert.throws(
    () => grantRewardsToSave(save, [{ gold: 3000, pouches: 2 }]),
    (error) => error instanceof RewardGrantError && error.code === 'BAG_FULL',
  );
  assert.equal(save.gold, 100, '금화도 들어가지 않는다');
  assert.equal(save.bag.length, BAG_SLOT_LIMIT, '가방도 그대로다');
});

test('금화·보물 주머니를 한 번에 반영하고, 스킬북 수량(books)은 지급하지 않는다(파트 B)', () => {
  const save = blank([], 'warrior', 10);
  const granted = grantRewardsToSave(save, [{ gold: 1000, books: 2, pouches: 1 }]);
  assert.equal(save.gold, 1010);
  assert.equal(granted.books, 2, '합계는 그대로 보고한다');
  assert.equal(granted.pouches, 1);
  assert.equal(save.bag.length, 1, '아이템은 보물 주머니 하나뿐');
  assert.equal(save.bag.filter((item) => item.kind === 'skillbook').length, 0, '스킬북은 만들지 않는다');
  const pouches = save.bag.filter((item) => item.kind === 'pouch');
  assert.equal(pouches.length, 1);
  assert.equal(pouches[0].slot, 'pouch');
  assert.equal(pouches[0].name, '무작위 보물 주머니');
});

test('넘겨받은 아이템은 같은 id가 이미 가방에 있으면 다시 넣지 않는다(재시도 방어)', () => {
  const item = gear('dup');
  const save = blank([gear('dup')], 'warrior', 0);
  const granted = grantRewardsToSave(save, [{ item }, { item }]);
  assert.equal(granted.items.length, 0);
  assert.equal(save.bag.length, 1);
  const second = gear('fresh');
  grantRewardsToSave(save, [{ item: second }], { onOverflow: 'keep' });
  assert.equal(save.bag.length, 2);
});

test('onOverflow:"keep"은 자리와 상관없이 넣는다 — 우편이 이미 자리를 확인한 경로', () => {
  const save = blank(Array.from({ length: BAG_SLOT_LIMIT }, (_, index) => gear(`g${index}`)));
  const granted = grantRewardsToSave(save, [{ pouches: 1 }], { onOverflow: 'keep' });
  assert.equal(granted.pouches, 1);
  assert.equal(save.bag.length, BAG_SLOT_LIMIT + 1);
  // `planRewards`의 `need`는 주머니만 센다 — 스킬북 수량(`books`)은 지급이 없어 자리도 쓰지 않는다.
  assert.equal(rewardSlotNeed([{ books: 1, pouches: 2 }], 'warrior'), 2);
});

test('다이아 지급은 지갑 행 보장 → 원장 기록 → 지갑 증가 순서의 SQL로 나온다', () => {
  const ops = diamondGrantOperations('acct-1', [{ id: 'mail-a', diamonds: '4000' }, { id: 'mail-b', diamonds: 0 }, { id: 'mail-c', diamonds: 500 }], { now: 1234 });
  assert.equal(ops.length, 5, '지갑 1 + (원장·지갑) × 2');
  assert.match(ops[0].sql, /INSERT OR IGNORE INTO djrpg_shop_wallet/);
  assert.deepEqual(ops[1].args, ['acct-1', 'mail', 'mail-a', 4000, 1234]);
  assert.match(ops[1].sql, /INSERT INTO djrpg_shop_ledger/);
  assert.deepEqual(ops[2].args, [4000, 'acct-1']);
  assert.deepEqual(ops[4].args, [500, 'acct-1']);
  assert.deepEqual(diamondGrantOperations('acct-1', [{ id: 'x', diamonds: 0 }]), [], '다이아가 없으면 SQL도 없다');
});

test('깨진 다이아 금액은 원장에 넣지 않고 거절한다', () => {
  for (const diamonds of [1.5, -4000, Number.MAX_SAFE_INTEGER + 2]) {
    assert.throws(
      () => diamondGrantOperations('acct-1', [{ id: 'bad', diamonds }]),
      (error) => error instanceof RewardGrantError && error.code === 'INVALID_REWARD',
      `${diamonds}는 거절`,
    );
  }
  assert.throws(() => diamondGrantOperations('acct-1', [{ diamonds: 100 }]), /ID가 없습니다/);
  // 숫자가 아닌 값은 "다이아 보상이 아니다"로 보고 건너뛴다(원래 우편 경로와 같은 판정).
  assert.deepEqual(diamondGrantOperations('acct-1', [{ id: 'skip', diamonds: 'abc' }]), []);
});
