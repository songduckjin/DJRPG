import type { Item } from './items';
import type { Job } from './skills';

export const EQUIPMENT_BAG_LIMIT = 40;

/**
 * 가방 40칸에 세는 아이템 (파트 B 2026-11-22).
 *
 * **장비·영구 스탯북·보물 주머니 모두 1개 = 1칸**이다. 스킬북이 폐지되면서 \"내 직업 책은 칸을 쓰지
 * 않는다\"(작업 253)는 예외도 함께 사라졌다 — 이제 예외 없이 가방에 보이는 모든 것이 한 칸이다.
 *
 * `job` 인자는 호출부·서버 계약(작업 248~253)을 그대로 두기 위한 것이고, 이제 판정에 쓰이지 않는다.
 */
export function countedInBag(item: Item, _job?: Job): boolean {
  return Boolean(item);
}

/** 가방 40칸에 세는 개수 — 가방에 든 모든 아이템. */
export function equipmentCount(items: Item[], job: Job = 'warrior'): number {
  return items.filter(item => countedInBag(item, job)).length;
}

/** 이 아이템을 가방에 넣을 자리가 있는가 — 40칸 미만이면 들어간다. */
export function canStoreItem(items: Item[], item: Item, job: Job = 'warrior'): boolean {
  return !countedInBag(item, job) || equipmentCount(items, job) < EQUIPMENT_BAG_LIMIT;
}
