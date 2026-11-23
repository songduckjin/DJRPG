import { onDomainEvent } from '../core/domainEvents';
import type { Interface } from './interface';;

/**
 * 화면 구독 등록 — `Interface`가 만들어진 직후에 한 번 부른다.
 *
 * 화면은 게임 도메인의 사건을 **듣기만** 한다(사냥·가방·장비 코드가 화면을 부르지 않는다).
 * 돌려주는 함수를 부르면 등록이 해제된다.
 */
export function bindDomainEvents(ui: Interface): () => void {
  const subscriptions = [
    // 새로 들어온 아이템 배지 — 지금까지는 `world.onChange`가 가방 전체를 훑어 찾았다.
    // 이제 들어온 그 아이템을 바로 알 수 있고, 사냥 루프 밖(방치 정산·던전 보상·주머니)에서
    // 들어온 것도 같은 순간에 배지가 선다.
    onDomainEvent('itemGranted', ({ item }) => {
      if (ui.knownItems.has(item.id)) return;
      ui.knownItems.add(item.id);
      if (ui.openModal !== 'equipment') ui.newItems.add(item.id);
      ui.renderBagBadge();
      // 유니크·전설 획득 띠(백로그 3번) — 사냥·던전·방치·보물 주머니 어디서 들어와도 같은 자리·문장.
      // 상위 등급이 아니면 `show`가 스스로 걸러 낸다(에픽 이하는 지금처럼 토스트만).
      ui.spotlight.show(item);
    }),
    // 장착이 바뀌면 투력·장착 칸이 달라진다.
    onDomainEvent('equipmentChanged', () => { ui.renderStatus(); }),
    // 층이 바뀌면 화면의 층 표시를 다시 그린다.
    onDomainEvent('floorAdvanced', () => { ui.renderStatus(); }),
  ];
  return () => { for (const off of subscriptions) off(); };
}
