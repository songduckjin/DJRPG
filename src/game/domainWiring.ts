import { onDomainEvent } from '../core/domainEvents';
import { discoverEquipment } from './codex';

/**
 * 도메인 구독 등록 — 앱이 시작할 때(`main.ts`) **한 번** 부른다.
 *
 * 지금 구독자는 장비 도감(코덱스) 하나다. 도감은 사냥·던전·주머니·합성 어느 경로로 아이템이
 * 들어와도, 어느 칸의 장착이 바뀌어도 "가방·장착에 있는 장비"를 다시 훑어 기록해야 한다.
 * 예전에는 `world.onChange`와 화면 몇 곳이 각자 `discoverEquipment`를 불렀고, 경로에 따라
 * 빠지기도 했다(방치 정산·던전 보상·주머니 개봉). 이제 그 사건들은 모두
 * `itemGranted`/`equipmentChanged`로 나오므로 여기 한 곳에서 받는다.
 *
 * 돌려주는 함수를 부르면 등록이 모두 해제된다(테스트·화면 교체).
 */
export function wireDomainEvents(): () => void {
  const subscriptions = [
    onDomainEvent('itemGranted', ({ save }) => { discoverEquipment(save); }),
    onDomainEvent('equipmentChanged', ({ save }) => { discoverEquipment(save); }),
  ];
  return () => { for (const off of subscriptions) off(); };
}
