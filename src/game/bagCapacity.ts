import { isPouch, isStatBook, type Item } from './items';
import type { Job } from './skills';

export const EQUIPMENT_BAG_LIMIT = 40;

/**
 * 가방 칸 규칙 (주머니 스택형, 사용자 지시 "1칸에 쌓이게해서 수량상관없이하자").
 *
 * 가방 40칸은 **화면에 보이는 칸**을 센다:
 *  - 장비 1개 = 1칸
 *  - **보물 주머니는 수량과 상관없이 1칸** — 30개를 들고 있어도 한 칸이고, 더 받아도 칸이 늘지 않는다.
 *    (파트 B에서 모든 계정에 우편으로 30개가 지급되면서, 1개=1칸 규칙이 가방을 30칸이나 먹어
 *    `BAG_FULL`로 우편·드롭이 막히던 문제를 없앤다.)
 *  - **영구 스탯북은 종류(공격·방어·체력)당 1칸** — 가방이 `×N`으로 묶어 보여 주는 것과 같은 셈이다.
 *
 * 서버의 같은 규칙은 `server/core/rewardGrant.mjs`(`bagSlotState`·`itemSlotNeed`)에 있다.
 */
export type BagSlotState = {
  /** 지금 쓰는 칸 수. */
  slots: number;
  /** 보물 주머니 묶음이 이미 있는가 — 있으면 새 주머니는 0칸. */
  pouch: boolean;
  /** 이미 칸을 차지한 영구 스탯북 종류. */
  books: Set<string>;
};

function statBookKey(item: Item): string {
  if (!isStatBook(item)) return '';
  return String(item.book ?? item.name);
}

/** 가방이 지금 쓰는 칸 상태. */
export function bagSlotState(items: Item[]): BagSlotState {
  let equipment = 0, pouch = false;
  const books = new Set<string>();
  for (const item of items) {
    if (!item) continue;
    if (isPouch(item)) { pouch = true; continue; }
    if (isStatBook(item)) { books.add(statBookKey(item)); continue; }
    equipment++;
  }
  return { slots: equipment + (pouch ? 1 : 0) + books.size, pouch, books };
}

/** 이 아이템이 칸을 쓰는 종류인가 — 모든 아이템이 칸을 쓰지만, 이미 있는 묶음이면 **새 칸은 0**이다. */
export function countedInBag(item: Item, _job?: Job): boolean {
  return Boolean(item);
}

/** 이 아이템을 넣을 때 **새로** 쓰는 칸 수 — 주머니·같은 종류의 책은 이미 있으면 0. */
export function itemSlotNeed(state: BagSlotState, item: Item): number {
  if (!item) return 0;
  if (isPouch(item)) return state.pouch ? 0 : 1;
  if (isStatBook(item)) return state.books.has(statBookKey(item)) ? 0 : 1;
  return 1;
}

/** 이 아이템을 넣은 뒤의 칸 상태로 넘긴다. */
export function advanceSlotState(state: BagSlotState, item: Item): BagSlotState {
  const need = itemSlotNeed(state, item);
  if (!need) return state;
  state.slots += need;
  if (isPouch(item)) state.pouch = true;
  else if (isStatBook(item)) state.books.add(statBookKey(item));
  return state;
}

/** 가방이 쓰는 칸 수 — 화면의 `가방 N/40`과 같은 값. */
export function equipmentCount(items: Item[], _job: Job = 'warrior'): number {
  return bagSlotState(items).slots;
}

/** 이 아이템을 가방에 넣을 자리가 있는가 — 이미 있는 묶음(주머니·같은 종류의 책)은 40칸이어도 들어간다. */
export function canStoreItem(items: Item[], item: Item, _job: Job = 'warrior', limit: number = EQUIPMENT_BAG_LIMIT): boolean {
  if (!item) return false;
  const state = bagSlotState(items);
  return state.slots + itemSlotNeed(state, item) <= limit;
}
