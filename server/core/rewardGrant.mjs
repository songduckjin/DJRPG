// 재화·아이템 지급의 **단일 창구**.
//
// 예전에는 우편·여정 보상(`server/journey.mjs`)과 거래소 수령함(`server/market.mjs`),
// 공용창고 꺼내기(`server/endpoints/warehouse.mjs`)가 각자 `save.bag.push()`와 `save.gold +=`를
// 쓰고 가방 40칸 규칙도 각자 적었다. 규칙이 세 벌이 되면서 한 곳만 고치면 다른 경로가 어긋났다.
// 이제 지급은 이 파일을 지난다.
//
// 규칙(사용자 확정, 작업 248 → 253)
//  - 가방 40칸 = **장비 1개 = 1칸, 보물 주머니는 수량 무관 1칸, 영구 스탯북은 종류당 1칸**
//    (파트 B 2026-11-22 → 주머니 스택형: 주머니 30개가 30칸을 차지해 우편이 `BAG_FULL`로 막히던 것을 고쳤다).
//    판정은 이 파일의 `bagSlotState`·`itemSlotNeed`·`bagSlotCount` 하나에 있다.
//  - 수량은 **0 이상의 정수**만 인정한다(음수·소수·NaN·문자열은 0으로 본다). 다이아는 금액이라
//    안전한 정수가 아니면 지급 자체를 거절한다(원장 금액이 깨지면 되돌리기 어렵다).
//  - 반영은 **원자적**이다 — 자리가 없으면 일부만 넣고 끝내지 않고, 아무것도 넣지 않고 던진다.
//  - 아이템은 같은 id가 이미 가방에 있으면 다시 넣지 않는다(수령 직후 저장·재시도에서 두 번 들어가지 않게).
import { randomUUID } from 'node:crypto';
import { pouchItem } from '../journey-state.mjs';

/** 가방 상한 — 클라이언트 `EQUIPMENT_BAG_LIMIT`과 같은 값이다. */
export const BAG_SLOT_LIMIT = 40;

/** 보상 지급이 규칙에 걸렸을 때 던지는 오류 — 호출부가 HTTP 코드로 바꿔 응답한다. */
export class RewardGrantError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RewardGrantError';
    this.code = code;
  }
}

/** 보물 주머니인가 — 장비도 스탯북도 아닌 소모품(작업 207·275). */
const isPouchItem = (item) => Boolean(item && typeof item === 'object' && (item.kind === 'pouch' || item.slot === 'pouch'));
/** 영구 스탯북의 **종류 키** — 같은 종류의 책은 가방 한 칸에 묶인다(파트 B). */
const statBookKey = (item) => item && typeof item === 'object' && (item.kind === 'statbook' || item.slot === 'statbook')
  ? String(item.book ?? item.name ?? 'statbook') : undefined;

/**
 * 가방이 지금 쓰는 **칸** 상태 (주머니 스택형, 사용자 지시 "1칸에 쌓이게해서 수량상관없이하자").
 *
 * 칸 규칙(클라이언트 `src/game/bagCapacity.ts`와 같은 규칙):
 *  - 장비 1개 = 1칸
 *  - **보물 주머니는 수량과 상관없이 1칸** — 30개를 들고 있어도 한 칸이고, 더 받아도 칸이 늘지 않는다
 *  - **영구 스탯북은 종류(공격·방어·체력)당 1칸** — 화면의 `×N` 묶음과 같은 셈이다
 *
 * `slots`는 칸 수, `pouch`는 주머니 묶음이 이미 있는지, `books`는 이미 칸을 차지한 책 종류다.
 * 보상 지급은 이 상태를 넘겨받아 **순서대로** 물어보면 된다(`itemSlotNeed`·`advanceSlotState`).
 */
export function bagSlotState(save) {
  const bag = Array.isArray(save?.bag) ? save.bag : [];
  let equipment = 0, pouch = false;
  const books = new Set();
  for (const item of bag) {
    if (!item || typeof item !== 'object') continue;
    if (isPouchItem(item)) { pouch = true; continue; }
    const book = statBookKey(item);
    if (book !== undefined) { books.add(book); continue; }
    equipment++;
  }
  return { slots: equipment + (pouch ? 1 : 0) + books.size, pouch, books };
}

/** 세이브 또는 이미 계산한 칸 상태를 **독립된 복사본**으로 — 물어보기만 하고 상태를 바꾸지 않는다. */
export function slotStateOf(saveOrState) {
  if (saveOrState && typeof saveOrState === 'object' && typeof saveOrState.slots === 'number' && saveOrState.books instanceof Set) {
    return { slots: saveOrState.slots, pouch: Boolean(saveOrState.pouch), books: new Set(saveOrState.books) };
  }
  return bagSlotState(saveOrState);
}

/** 가방 40칸에 지금 차 있는 칸 수 — 장비 1개=1칸, 주머니 1칸(수량 무관), 책 종류당 1칸. */
export function bagSlotCount(save) {
  return bagSlotState(save).slots;
}

/** 이 아이템이 칸을 쓰는 종류인가 — 모든 아이템이 칸을 쓰지만, 주머니·같은 종류의 책은 **이미 있으면 0칸**이다.
 *  `job` 인자는 호출부 계약 유지용이라 받기만 한다. */
export function itemTakesSlot(item, _job) {
  return Boolean(item && typeof item === 'object');
}

/** 이 아이템을 가방에 넣을 때 **새로** 쓰는 칸 수 — 주머니·같은 종류의 책은 이미 있으면 0이다. */
export function itemSlotNeed(state, item) {
  if (!item || typeof item !== 'object') return 0;
  if (isPouchItem(item)) return state.pouch ? 0 : 1;
  const book = statBookKey(item);
  if (book !== undefined) return state.books.has(book) ? 0 : 1;
  return 1;
}

/** 칸 상태에 아이템 하나를 반영한다(넣은 뒤의 상태로 넘긴다). */
export function advanceSlotState(state, item) {
  const need = itemSlotNeed(state, item);
  if (!need) return state;
  state.slots += need;
  if (isPouchItem(item)) state.pouch = true;
  else { const book = statBookKey(item); if (book !== undefined) state.books.add(book); }
  return state;
}

/** 수량 방어 — 0 이상의 정수만 남긴다. */
function count(value) {
  const number = Math.floor(Number(value ?? 0));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * 보상 항목 하나를 정규화한다 — `{gold, books, pouches, diamonds, item?}`.
 * 우편·월드보스 정산처럼 "보상 한 줄"을 만드는 곳은 모두 이 함수를 지나 수량이 깨지지 않는다.
 */
export function normalizeRewardEntry(entry) {
  const source = entry && typeof entry === 'object' ? entry : {};
  return {
    gold: count(source.gold),
    books: count(source.books),
    pouches: count(source.pouches),
    diamonds: count(source.diamonds),
    item: source.item && typeof source.item === 'object' ? source.item : undefined,
  };
}

/** 여러 보상 항목의 합계(합산 뒤에도 방어된 값이다). */
export function rewardTotals(entries = []) {
  const totals = { gold: 0, books: 0, pouches: 0, diamonds: 0 };
  for (const entry of entries) {
    const one = normalizeRewardEntry(entry);
    totals.gold += one.gold;
    totals.books += one.books;
    totals.pouches += one.pouches;
    totals.diamonds += one.diamonds;
  }
  return totals;
}

/**
 * 이 보상들이 가방에서 **새로** 쓸 칸 수 (주머니 스택형).
 *
 * 기준은 지금 가방 상태(`save`) 또는 지급 도중의 칸 상태(앞선 우편을 이미 반영한 상태)다. 그래서
 * - 주머니가 하나도 없는 가방에 주머니 우편 30통을 받으면 **1칸**만 든다(30칸이 아니다),
 * - 이미 주머니를 들고 있으면 **0칸**이라 가방이 40칸이어도 받을 수 있다.
 * `books`(옛 스킬북 수량)는 지급하지 않으므로 칸도 세지 않는다(파트 B).
 */
export function rewardSlotNeed(entries = [], saveOrState) {
  const state = slotStateOf(saveOrState);
  let need = 0;
  for (const entry of entries) {
    const one = normalizeRewardEntry(entry);
    // 주머니는 수량과 상관없이 한 칸(주머니 스택형) — 이미 주머니가 있으면 0칸이다.
    if (one.pouches > 0 && !state.pouch) { need += 1; state.pouch = true; }
    if (one.item) { const add = itemSlotNeed(state, one.item); need += add; if (add) advanceSlotState(state, one.item); }
  }
  return need;
}

/** 보상을 지급한 뒤의 칸 상태로 넘긴다 — 우편을 여러 통 연달아 받을 때 쓴다. */
export function advanceRewardSlotState(state, entries = []) {
  for (const entry of entries) {
    const one = normalizeRewardEntry(entry);
    if (one.pouches > 0 && !state.pouch) { state.slots += 1; state.pouch = true; }
    if (one.item) advanceSlotState(state, one.item);
  }
  return state;
}

/**
 * 지금 세이브에 이 보상을 넣을 자리가 있는가 — 호출부가 거절·건너뛰기를 판단할 때 쓴다.
 *
 * **칸을 쓰지 않는 보상(금화·다이아만)은 가방이 이미 넘친 세이브에서도 들어간다.** 40칸을 넘긴
 * 옛 세이브(작업 248 이전)를 가두지 않으려는 규칙이고, 우편 경로가 원래 그렇게 동작했다.
 * 일일·주간·업적도 같은 규칙을 쓴다(작업 256에서 한 곳으로 모았다).
 */
export function planRewards(save, entries = [], { bagLimit = BAG_SLOT_LIMIT } = {}) {
  const totals = rewardTotals(entries);
  const slots = bagSlotCount(save);
  const need = rewardSlotNeed(entries, save);
  const fits = need === 0 || slots + need <= bagLimit;
  return { totals, slots, need, remaining: Math.max(0, bagLimit - slots), fits };
}

/**
 * 보상을 세이브에 **한 번에** 반영한다.
 *
 *  - 금화는 합계만큼 더한다.
 *  - 보물 주머니는 그 모양 그대로 넣는다(스킬북 지급은 폐지 — `books`는 무시).
 *  - `item`이 붙은 항목은 그 아이템을 넣는다(같은 id가 이미 있으면 건너뛴다).
 *  - 다이아는 세이브가 아니라 지갑(`djrpg_shop_wallet`)에 있으므로 `diamondGrantOperations`가 맡는다.
 *
 * `onOverflow`:
 *   `'throw'`(기본) — 가방 자리가 모자라면 **아무것도 넣지 않고** `RewardGrantError('BAG_FULL')`를 던진다.
 *   `'keep'` — 기존 동작(받을 것을 잃지 않게 자리와 상관없이 넣는다). 호출부가 이미 자리를 확인했거나,
 *   지난 세이브가 40칸을 넘긴 상태를 풀어 주려고 쓰는 경우에만 쓴다.
 */
export function grantRewardsToSave(save, entries = [], { bagLimit = BAG_SLOT_LIMIT, random = Math.random, onOverflow = 'throw' } = {}) {
  if (!save || typeof save !== 'object') throw new RewardGrantError('INVALID_SAVE', '저장 데이터가 없습니다.');
  const plan = planRewards(save, entries, { bagLimit });
  const totals = plan.totals;
  if (!plan.fits && onOverflow !== 'keep') throw new RewardGrantError('BAG_FULL', '가방이 가득 찼습니다.');
  save.bag ??= [];
  const items = [];
  // 1) 넘겨받은 아이템 — 같은 id는 두 번 넣지 않는다(재시도·재수령 방어).
  for (const entry of entries) {
    const item = normalizeRewardEntry(entry).item;
    if (!item || save.bag.some((owned) => owned?.id === item.id)) continue;
    save.bag.push(item);
    items.push(item);
  }
  // 2) 스킬북은 폐지됐다(파트 B) — 옛 우편의 `books` 값은 무시하고 아무것도 지급하지 않는다.
  // 3) 보물 주머니.
  for (let index = 0; index < totals.pouches; index++) {
    const pouch = pouchItem(randomUUID());
    save.bag.push(pouch);
    items.push(pouch);
  }
  // 4) 금화 — 마지막에 한 번만 더한다(중간에 던져도 금화만 들어가는 일이 없게 위에서 먼저 검사했다).
  save.gold = Math.max(0, Math.floor(Number(save.gold ?? 0))) + totals.gold;
  return { gold: totals.gold, books: totals.books, pouches: totals.pouches, diamonds: totals.diamonds, items, slots: bagSlotCount(save) };
}

/**
 * 다이아 보상의 SQL 작업 — 지갑 행 보장 + 원장 기록 + 지갑 증가.
 *
 * 다이아는 세이브가 아니라 `djrpg_shop_wallet`에 있고, `djrpg_shop_ledger`의
 * `UNIQUE(account_id,source_type,source_id)`가 같은 보상을 두 번 기록하지 못하게 막는다.
 * 그래서 금액이 안전한 정수가 아니면 **던진다** — 원장에 깨진 금액이 들어가면 되돌리기 어렵다.
 *
 * @returns {{sql: string, args: unknown[]}[]} 호출부가 자기 배치에 그대로 실어 보낸다.
 */
export function diamondGrantOperations(accountId, entries = [], { now = Date.now(), sourceType = 'mail' } = {}) {
  const amounts = [];
  for (const entry of entries) {
    const raw = Number(entry?.diamonds ?? 0);
    if (!raw) continue;
    if (!Number.isSafeInteger(raw) || raw <= 0) throw new RewardGrantError('INVALID_REWARD', '보상 금액이 올바르지 않습니다.');
    const sourceId = String(entry?.id ?? '');
    if (!sourceId) throw new RewardGrantError('INVALID_REWARD', '보상 항목 ID가 없습니다.');
    amounts.push({ sourceId, amount: raw });
  }
  if (!amounts.length) return [];
  const operations = [{ sql: 'INSERT OR IGNORE INTO djrpg_shop_wallet(account_id,customer_key) VALUES (?,?)', args: [accountId, randomUUID()] }];
  for (const { sourceId, amount } of amounts) {
    operations.push({ sql: 'INSERT INTO djrpg_shop_ledger(account_id,source_type,source_id,diamonds_delta,created_at) VALUES (?,?,?,?,?)', args: [accountId, sourceType, sourceId, amount, now] });
    operations.push({ sql: 'UPDATE djrpg_shop_wallet SET diamonds=diamonds+? WHERE account_id=?', args: [amount, accountId] });
  }
  return operations;
}
