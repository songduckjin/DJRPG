import { isEquipment, isSkillBook, skillBookJob, type Item } from './items';
import { jobOrDefault, type Job } from './skills';

export const EQUIPMENT_BAG_LIMIT = 40;

/**
 * 가방 40칸에 세는 아이템 (작업 210, 사용자 지시 `#4617`).
 *
 * - **장비**: 센다(예전 그대로).
 * - **다른 직업 전용 스킬북**: **센다** — 가방에서 보이고 경매장 판매·공용창고 보관으로 처리해야 하므로
 *   자리도 차지한다(장비와 구분 없이 함께 센다).
 * - **내 직업 스킬북**: 세지 않는다. 스킬 창에서 쓰는 재료이고 가방 목록에도 뜨지 않는다.
 * - **보물 주머니**(작업 207): 세지 않는다.
 */
export function countedInBag(item: Item, job: Job = 'warrior'): boolean {
  if (isEquipment(item)) return true;
  if (!isSkillBook(item)) return false;
  const owner = skillBookJob(item);
  return Boolean(owner) && owner !== jobOrDefault(job);
}

/** 가방 40칸에 세는 개수 — 장비 + 다른 직업 전용 스킬북. */
export function equipmentCount(items: Item[], job: Job = 'warrior'): number {
  return items.filter(item => countedInBag(item, job)).length;
}

/** 이 아이템을 가방에 넣을 자리가 있는가 — 세지 않는 아이템(내 직업 스킬북·주머니)은 늘 들어간다. */
export function canStoreItem(items: Item[], item: Item, job: Job = 'warrior'): boolean {
  return !countedInBag(item, job) || equipmentCount(items, job) < EQUIPMENT_BAG_LIMIT;
}
