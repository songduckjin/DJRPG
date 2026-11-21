/**
 * `+N` 강화 단계 배지 (작업 246).
 *
 * 사용자 피드백: 가방·장비창 장착 칸·공용창고마다 `+1` 표시가 **어떤 칸에는 없고 어떤 칸은
 * 위치가 달라** 강화된 장비가 한눈에 안 보인다. 그래서 세 화면이 같은 함수 하나로 배지를
 * 붙이고, 자리는 CSS 한 곳(`.item-plus-badge`)에서 **왼쪽 아래**로 고정한다.
 *
 * 겹침 규칙(작업 241·246): 좌상단 = 타직업 배지(`.job-badge`), 우상단 = 추천 화살표
 * (`.upgrade-arrow`), 우하단 = 수량 `×N`(`.skillbook-count`)·잠금(`.bag-lock-badge`).
 * 비어 있는 곳은 **왼쪽 아래** 하나뿐이라 `+N`은 늘 여기 온다.
 *
 * `+N`은 장비에만 있다(`plusOf`가 스킬북·주머니에 0을 돌려준다) — 이름(`item.name`)은
 * 서버가 소유권 대조에 쓰므로 절대 바꾸지 않고, 표시용 문자열만 만든다.
 */
import { PLUS_STAT_BONUS, plusOf, type Item } from '../game/items';

/** 배지 클래스 — CSS(`styles/modals.css`)와 테스트가 같은 이름을 본다. */
export const PLUS_BADGE_CLASS = 'item-plus item-plus-badge';
/** 칸 안에서 왼쪽 아래에 붙는 자리(테스트·문서용 값). */
export const PLUS_BADGE_POSITION = { bottom: '2px', left: '3px' } as const;

/** `innerHTML`로 카드를 만드는 곳(가방·공용창고·장착 칸)에 붙일 문자열. 강화 0이면 빈 문자열. */
export function plusBadgeMarkup(item: Item): string {
  const plus = plusOf(item);
  if (plus <= 0) return '';
  const percent = Math.round(plus * PLUS_STAT_BONUS * 100);
  return `<span class="${PLUS_BADGE_CLASS}" aria-hidden="true" title="강화 +${plus} · 능력치 +${percent}%">+${plus}</span>`;
}

/** `document.createElement`로 칸을 만드는 곳에 붙일 요소. 강화 0이면 `null`. */
export function plusBadgeNode(item: Item): HTMLSpanElement | null {
  const plus = plusOf(item);
  if (plus <= 0) return null;
  const badge = document.createElement('span');
  badge.className = PLUS_BADGE_CLASS;
  badge.textContent = `+${plus}`;
  badge.title = `강화 +${plus} · 능력치 +${Math.round(plus * PLUS_STAT_BONUS * 100)}%`;
  badge.setAttribute('aria-hidden', 'true');
  return badge;
}

/** 칸(버튼)에 배지를 붙인다. 붙였으면 `true` — 칸 클래스·낭독기 문구에 쓴다. */
export function appendPlusBadge(host: HTMLElement, item: Item): boolean {
  const badge = plusBadgeNode(item);
  if (!badge) return false;
  host.append(badge);
  return true;
}
