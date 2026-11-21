import type { EquipmentItem, Item, Slot } from '../game/items';
import type { Save } from '../game/store';

/**
 * 도메인 간 얇은 이벤트 통로.
 *
 * 사냥(`world`)·가방(`inventory`)·장비(`items`)·던전·우편 같은 도메인이 서로를 직접 부르지 않고
 * "무슨 일이 일어났다"만 알린다. 구독자는 payload의 `save`로 자기 도메인 상태를 다시 읽는다 —
 * 이벤트는 **상태의 사본이 아니라 신호**다.
 *
 * 규칙
 *  - 한 이벤트에 구독자는 여럿일 수 있고, 등록 순서대로 불린다.
 *  - 한 구독자가 던진 예외는 그 구독자만 실패시킨다(사냥 루프·다른 구독자는 계속 돈다).
 *  - `onDomainEvent`는 해제 함수를 돌려준다. 등록해 둔 채 사라지는 화면은 반드시 해제한다.
 *  - 타입은 `DomainEvents` 하나로 닫혀 있다 — 새 신호는 여기 한 곳에만 추가한다.
 *  - 이 파일은 `import type`만 쓴다. 서버(`server/*.mjs`)가 `src/game/*`를 import해도 실행 부담이 없다.
 */

/** 아이템이 가방에 들어온 경로 — 구독자가 "왜 들어왔는지"로 분기할 때 쓴다. */
export type ItemGrantSource = 'field' | 'offline' | 'dungeon' | 'pouch' | 'craft';

/** 장비가 바뀐 경로. `auto`는 `autoEquipBest`(자동 장착). */
export type EquipmentChangeSource = 'equip' | 'unequip' | 'auto';

/** 층이 바뀐 경로 — `climb`(일반 몹 목표 달성) · `boss`(층 보스 처치) · `travel`(직접 이동). */
export type FloorAdvanceReason = 'climb' | 'boss' | 'travel';

export type DomainEvents = {
  /** 몬스터 한 마리를 처치했다 — 금화·경험치·드롭 판정이 끝난 뒤에 낸다. */
  monsterKilled: { save: Save; floor: number; boss: boolean; elite: boolean; gold: number; x: number; y: number };
  /** 아이템이 가방에 들어왔다 — 필드 드롭·방치 정산·던전 보상·주머니 개봉·스킬북 합성. */
  itemGranted: { save: Save; item: Item; source: ItemGrantSource };
  /** 장착이 바뀌었다 — `item`이 없으면 그 칸이 비었다(해제). */
  equipmentChanged: { save: Save; slot: Slot; item?: EquipmentItem; previous?: EquipmentItem; source: EquipmentChangeSource };
  /** 층이 바뀌었다. */
  floorAdvanced: { save: Save; from: number; to: number; reason: FloorAdvanceReason };
};

export type DomainEventType = keyof DomainEvents;
type StoredHandler = (event: never) => void;

const listeners = new Map<DomainEventType, Set<StoredHandler>>();

/**
 * 이벤트 하나를 구독한다. 돌려주는 함수를 부르면 해제된다(두 번 불러도 안전).
 */
export function onDomainEvent<K extends DomainEventType>(type: K, handler: (event: DomainEvents[K]) => void): () => void {
  let set = listeners.get(type);
  if (!set) { set = new Set(); listeners.set(type, set); }
  const entry = handler as unknown as StoredHandler;
  set.add(entry);
  return () => { listeners.get(type)?.delete(entry); };
}

/**
 * 이벤트를 알린다. 실제로 호출된 구독자 수를 돌려준다(테스트·디버그용).
 *
 * 구독자 하나가 예외를 던져도 나머지는 그대로 돈다 — 이벤트는 부가 기능이고, 사냥·저장 같은
 * 본체 흐름이 구독자 때문에 멈추면 안 된다. 대신 조용히 삼키지 않고 콘솔에 남긴다.
 */
export function emitDomainEvent<K extends DomainEventType>(type: K, event: DomainEvents[K]): number {
  const set = listeners.get(type);
  if (!set || !set.size) return 0;
  let called = 0;
  // 구독 중에 스스로를 해제하는 경우가 있어 사본으로 돈다.
  for (const handler of [...set]) {
    if (!set.has(handler)) continue;
    called++;
    try { (handler as unknown as (value: DomainEvents[K]) => void)(event); }
    catch (error) { console.error(`[domainEvents] ${type} 구독자 오류`, error); }
  }
  return called;
}

/** 이 이벤트에 걸려 있는 구독자 수 — 화면이 사라질 때 해제가 빠지지 않았는지 확인할 때 쓴다. */
export function domainListenerCount(type: DomainEventType): number {
  return listeners.get(type)?.size ?? 0;
}

/** 모든 구독을 지운다 — 테스트가 서로 영향을 주지 않게 할 때만 쓴다. */
export function clearDomainEvents(): void {
  listeners.clear();
}
