/**
 * 가방 칸 묶음 (작업 246 → 파트 B 2026-11-22).
 *
 * 같은 **영구 스탯북**·같은 **보물 주머니**는 **한 칸에 `×N`**으로 보여 준다. 예전에는 이 자리가
 * 스킬북 묶음이었고, 스킬북이 폐지되면서 스탯북 3종(공격·방어·체력)이 그 자리를 이어받았다.
 *
 * 묶음은 **보기만** 묶는다 — 칸이 들고 있는 `item.id`는 그 묶음의 첫 아이템이고, 사용·판매·창고
 * 이동·저장 동기화는 지금처럼 개별 `item.id`로 처리된다.
 *
 * [작업 247] 사용자가 가방 칸 순서를 확정했다 — **보물 주머니(첫 칸) → 장비 → 책(맨 뒤)**.
 * 등급순 정렬을 켜고 꺼도 이 3단은 그대로이고, 등급순은 **같은 묶음 안에서만** 적용된다.
 * 책 구간은 **공격 → 방어 → 체력** 고정 순서다(`STAT_BOOK_ORDER`).
 * 장비창 가방(`equipModal`)과 공용창고 목록(`warehouseModal`)이 같은 비교 함수를 쓴다.
 */
import { isPouch, isStatBook, rarityRanks, type Item } from '../game/items';
import { STAT_BOOK_ORDER } from '../game/statBooks';
import type { Job } from '../game/skills';

export type BagStack = {
  /** 같은 묶음의 첫 아이템 — 칸(`data-item-id`)·상세 보기가 이 id를 쓴다. */
  item: Item;
  /** 그 칸에 모인 개수(1이면 배지를 달지 않는다). */
  count: number;
  /** 묶음 키 — 주머니는 하나, 스탯북은 `book` 종류, 장비는 아이템 id. */
  key: string;
};

/** 아이템 목록을 화면 칸 단위로 묶는다 — 순서는 **처음 나온 차례**를 지킨다. */
export function bagStacks(items: Item[]): BagStack[] {
  const order: string[] = [];
  const map = new Map<string, BagStack>();
  for (const item of items) {
    const key = stackKey(item);
    const stack = map.get(key);
    if (stack) { stack.count++; continue; }
    map.set(key, { item, count: 1, key });
    order.push(key);
  }
  return order.map(key => map.get(key)!);
}

/**
 * 한 묶음 칸에 모인 실제 아이템들(가방 순서, 작업 249).
 *
 * 묶음 판매 등록은 칸의 대표 id 하나가 아니라 **이 아이템들의 id 전부**를 서버로 보낸다
 * (`market.act('register', { itemIds })`) — 서버도 같은 기준(`book`)으로 묶음을 확인한다.
 */
export function stackMembers(items: Item[], stack: BagStack): Item[] {
  return items.filter(item => stackKey(item) === stack.key);
}

/**
 * 가방 3단 순서(작업 247) — 보물 주머니 0 · 장비 1 · 스탯북 2.
 * 받은 주머니는 어디서든 첫 칸에 있어야 열어 볼 수 있고, 책은 장비 뒤로 모은다(사용자 확정).
 */
export function bagKindRank(item: Item): number {
  return isPouch(item) ? 0 : isStatBook(item) ? 2 : 1;
}

/** 스탯북 종류 순서 — `공격 → 방어 → 체력` 고정(정의 표의 순서). */
export function statBookRank(item: Item): number {
  if (!isStatBook(item)) return STAT_BOOK_ORDER.length;
  const index = STAT_BOOK_ORDER.indexOf(item.book);
  return index < 0 ? STAT_BOOK_ORDER.length : index;
}

/**
 * 가방 칸 정렬 비교 함수 — 3단(주머니 → 장비 → 스탯북)이 **항상 먼저**고, 스탯북은 종류별로 묶는다.
 * `raritySort`를 켰을 때만 같은 묶음 안에서 등급 높은 순으로 놓는다(안정 정렬이라 나머지는 원래 차례).
 *
 * `myJob`은 호출부 계약을 그대로 두기 위한 인자다 — 파트 B에서 책의 직업 구분이 사라져 판정에 쓰이지 않는다.
 */
export function compareBagItems(raritySort: boolean, _myJob: Job = 'warrior'): (a: Item, b: Item) => number {
  return (a, b) => {
    const kind = bagKindRank(a) - bagKindRank(b);
    if (kind) return kind;
    if (isStatBook(a) && isStatBook(b)) {
      const order = statBookRank(a) - statBookRank(b);
      if (order) return order;
      return String(a.id).localeCompare(String(b.id));
    }
    return raritySort ? (rarityRanks[b.rarity] ?? 0) - (rarityRanks[a.rarity] ?? 0) : 0;
  };
}

/** 아이템 배열을 가방 화면 순서로 정렬한 **새 배열**을 돌려준다(원본은 건드리지 않는다). */
export function orderedBagItems(items: Item[], raritySort: boolean, myJob: Job = 'warrior'): Item[] {
  return [...items].sort(compareBagItems(raritySort, myJob));
}

function stackKey(item: Item): string {
  if (isPouch(item)) return 'pouch';
  if (isStatBook(item)) return `book:${item.book ?? item.name}`;
  return `item:${item.id}`;
}
