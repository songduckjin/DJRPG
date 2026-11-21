import { canStoreItem } from './bagCapacity';
import { jobOrDefault } from './skills';
import type { Item } from './items';
import type { Save } from './store';
import { emitDomainEvent, type ItemGrantSource } from '../core/domainEvents';

/**
 * 가방에 아이템을 넣는 **클라이언트 쪽 단일 창구**.
 *
 * 필드 드롭·방치 정산·던전 보상·스킬북 합성·주머니 개봉이 각자 `save.bag.push(...)`를 쓰던 것을
 * 한 곳으로 모았다. 여기서 두 가지를 함께 한다.
 *  ① 자리 검사 — 가방 40칸 규칙은 `bagCapacity.ts`의 `canStoreItem` 하나에 있다
 *     (장비·타직업 스킬북·보물 주머니 1칸, 내 직업 스킬북은 세지 않는다).
 *  ② `itemGranted` 신호 — 도감·배지 같은 다른 도메인이 그 사건을 듣는다.
 *
 * `enforceCapacity: false`는 **자리를 쓰지 않는 교환**에만 쓴다. 보물 주머니 개봉은 주머니 1개를
 * 빼고 결과 1개를 넣는 자리 바꿈이라 칸 수가 늘지 않는다(작업 251) — 40칸이 찬 세이브에서도 열 수 있다.
 *
 * 서버 쪽 같은 규칙은 `server/core/rewardGrant.mjs`에 있다(우편·여정·거래소·창고).
 */
export function addItemToBag(save: Save, item: Item, source: ItemGrantSource, options: { enforceCapacity?: boolean } = {}): boolean {
  const enforceCapacity = options.enforceCapacity ?? true;
  if (enforceCapacity && !canStoreItem(save.bag, item, jobOrDefault(save.job))) return false;
  save.bag.push(item);
  emitDomainEvent('itemGranted', { save, item, source });
  return true;
}
