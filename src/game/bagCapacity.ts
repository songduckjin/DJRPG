import { isSkillBook, skillBookJob, type Item } from './items';
import { jobOrDefault, type Job } from './skills';

export const EQUIPMENT_BAG_LIMIT = 40;

/**
 * 가방 40칸에 세는 아이템 (작업 248 → 253, 사용자 확정 11-21).
 *
 * **장비·다른 직업 스킬북·보물 주머니는 1개 = 1칸**이고, **내 직업 스킬북만 세지 않는다**.
 * 사용자 지시가 두 번 바뀐 끝의 최종 규칙이다 — 작업 248에서 "스킬북 보물주머니도 가방 40개에 포함"
 * (전부 센다)으로 통일했다가, 작업 253에서 "가방에 내 직업 스킬북 수량도 더하지 말라(별개로 빼라)"로
 * **내 직업 책만** 다시 칸에서 뺐다. 내 직업 책은 배우는 재료라 칸을 차지하지 않고, 합성 재료인
 * **타직업 책**은 그대로 한 칸을 쓴다.
 *
 * 직업을 알 수 없는 스킬북(`skillBookJob` === `undefined`)은 내 직업 책으로 볼 수 없으므로 칸을 쓴다.
 */
export function countedInBag(item: Item, job: Job = 'warrior'): boolean {
  if (!item) return false;
  if (isSkillBook(item)) return skillBookJob(item) !== jobOrDefault(job);
  return true;
}

/** 가방 40칸에 세는 개수 — 장비·타직업 스킬북·보물 주머니(내 직업 스킬북 제외). */
export function equipmentCount(items: Item[], job: Job = 'warrior'): number {
  return items.filter(item => countedInBag(item, job)).length;
}

/** 이 아이템을 가방에 넣을 자리가 있는가 — 내 직업 스킬북은 늘 들어가고, 나머지는 40칸 미만이면 들어간다. */
export function canStoreItem(items: Item[], item: Item, job: Job = 'warrior'): boolean {
  return !countedInBag(item, job) || equipmentCount(items, job) < EQUIPMENT_BAG_LIMIT;
}
