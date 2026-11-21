import type { Item } from './items';
import type { Job } from './skills';

export const EQUIPMENT_BAG_LIMIT = 40;

/**
 * 가방 40칸에 세는 아이템 (작업 248, 사용자 확정 11-21).
 *
 * **가방 안의 모든 아이템 1개 = 1칸**이다. 장비·내 직업 스킬북·다른 직업 스킬북·보물 주머니를
 * 구분하지 않는다 — 사용자 지시 "안되 스킬북 보물주머니도 가방 40개에 포함하고 그 이상 받아지면 안 되고
 * 가방 꽉 차거나 넘어가면 우편도 안 받아져야 해"(작업 210의 '내 직업 책·주머니는 세지 않는다'를 대체).
 *
 * `job` 인자는 예전 호출부와의 호환을 위해서만 남긴다(판정에 쓰지 않는다).
 */
export function countedInBag(item: Item, job: Job = 'warrior'): boolean {
  void job;
  return Boolean(item);
}

/** 가방 40칸에 세는 개수 — 가방의 모든 아이템. */
export function equipmentCount(items: Item[], job: Job = 'warrior'): number {
  return items.filter(item => countedInBag(item, job)).length;
}

/** 이 아이템을 가방에 넣을 자리가 있는가 — 가방이 40개 미만이면 모든 아이템이 들어간다. */
export function canStoreItem(items: Item[], item: Item, job: Job = 'warrior'): boolean {
  return !countedInBag(item, job) || equipmentCount(items, job) < EQUIPMENT_BAG_LIMIT;
}
