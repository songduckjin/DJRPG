/**
 * 가방 칸 묶음 (작업 246) — 같은 스킬북·같은 보물 주머니는 **한 칸에 `×N`**으로 보여 준다.
 *
 * 예전 `equipModal`은 보물 주머니만 묶고 스킬북은 `count: 1`로 하나씩 늘어놓아, 같은 책이 세 권
 * 있어도 `×1` 칸 세 개로 보였다(사용자 제보). 공용창고는 이미 `warehouseModal`의 `stacksOf`가
 * 같은 규칙으로 묶고 있으므로 **두 화면의 묶는 기준을 여기 한 곳에 맞춘다**.
 *
 * 묶음은 **보기만** 묶는다 — 칸이 들고 있는 `item.id`는 그 묶음의 첫 아이템이고, 사용·판매·창고
 * 이동·저장 동기화는 지금처럼 개별 `item.id`로 처리된다(`useSkillBook`은 같은 `skillId` 책을
 * 필요한 권수만큼 한 번에 소모한다).
 */
import { isPouch, isSkillBook, type Item } from '../game/items';

export type BagStack = {
  /** 같은 묶음의 첫 아이템 — 칸(`data-item-id`)·상세 보기가 이 id를 쓴다. */
  item: Item;
  /** 그 칸에 모인 개수(1이면 배지를 달지 않는다). */
  count: number;
  /** 묶음 키 — 주머니는 하나, 스킬북은 `skillId`, 장비는 아이템 id. */
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

function stackKey(item: Item): string {
  if (isPouch(item)) return 'pouch';
  if (isSkillBook(item)) return `book:${item.skillId ?? item.name}`;
  return `item:${item.id}`;
}
