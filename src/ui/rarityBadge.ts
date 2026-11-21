/**
 * 아이템 등급 배지 `L`·`U`·`E` — 전설(Legendary)·유니크(Unique)·에픽(Epic).
 *
 * 사용자 요청(2026-11-21): "템 오른쪽 상단에 초록색 화살표 뜨니까 왼쪽 위에는 같은 규격으로
 * 레전드는 L, 유니크는 U, 에픽은 E 이렇게 표시를 해줘". 두 시안 중 **[B안 필 배지]** 를 골랐다
 * (`downloads/rarity_badge_preview/opt2_pill_badge.png`) — 어두운 알약 바탕(`#120f14cc`) +
 * 1px 등급색 테두리 + 등급색 굵은 글자. 왼쪽 아래 `+N`(plusBadge.ts)과 같은 바탕·같은 radius라
 * 작은 칸에서도 한 세트로 읽힌다.
 *
 * **색은 새로 적지 않는다** — `.rarity-legendary`(`#f87171`)·`.rarity-unique`(`#fb923c`)·
 * `.rarity-epic`(`#c084fc`)은 이미 `styles/market.css`가 전역으로 두고 있고, 배지는 그 색을
 * `color` 로 물려받아 테두리(`border: 1px solid currentColor`)와 글자를 같은 색으로 칠한다.
 *
 * **어디에 붙는가**: 가방·장비창 장착 칸·공용창고·거래소 카드·판매 등록 칸의 **왼쪽 위**.
 * 왼쪽 위를 쓰던 타직업 배지(`.job-badge`)는 그 칸들에서 오른쪽 아래로 비킨다(좁은 칸) 또는
 * 등급 배지 아래에 쌓인다(넓은 카드) — 자리는 CSS 한 곳(`styles/modals/equip.css`·`market.css`)이 정한다.
 *
 * **등급은 장비에만 있다**: 일반·매직·레어는 배지를 달지 않고, 스킬북·보물 주머니도 달지 않는다
 * (`isEquipment`가 아니면 `rarity`가 있어도 등급 표시 대상이 아니다).
 */
import { isEquipment, rarityNames, type Item, type Rarity } from '../game/items';

/** 배지 클래스 — CSS(`styles/modals/equip.css`)와 테스트가 같은 이름을 본다. */
export const RARITY_BADGE_CLASS = 'rarity-badge';
/** 칸 안에서 왼쪽 위에 붙는 자리(테스트·문서용 값). */
export const RARITY_BADGE_POSITION = { left: '2px', top: '2px' } as const;
/** 배지를 다는 세 등급의 글자 — 나머지 등급은 배지가 없다. */
export const RARITY_BADGE_LETTERS: Partial<Record<Rarity, string>> = { legendary: 'L', unique: 'U', epic: 'E' };

/** 이 아이템에 등급 배지가 붙는가(장비 + 전설·유니크·에픽). */
export function hasRarityBadge(item: Item | undefined): boolean {
  return !!item && isEquipment(item) && RARITY_BADGE_LETTERS[item.rarity] !== undefined;
}

/** 배지 글자(`L`·`U`·`E`) — 배지가 없는 아이템은 `undefined`. */
export function rarityBadgeLetter(item: Item): string | undefined {
  return hasRarityBadge(item) ? RARITY_BADGE_LETTERS[item.rarity] : undefined;
}

/** 화면 낭독기·툴팁 문구 — `전설 등급`(칸의 `aria-label`에는 등급 이름이 이미 들어간다). */
export function rarityBadgeLabel(item: Item): string {
  return `${rarityNames[item.rarity]} 등급`;
}

/** 클래스 문자열 — 등급색은 기존 `.rarity-*` 유틸리티 색을 그대로 쓴다. */
function rarityBadgeClass(item: Item): string {
  return `${RARITY_BADGE_CLASS} rarity-${item.rarity}`;
}

/** `innerHTML`로 칸을 만드는 곳(장착 칸·가방·공용창고)에 붙일 문자열. 배지가 없으면 빈 문자열. */
export function rarityBadgeMarkup(item: Item | undefined): string {
  if (!item || !hasRarityBadge(item)) return '';
  return `<span class="${rarityBadgeClass(item)}" aria-hidden="true" title="${rarityBadgeLabel(item)}">${RARITY_BADGE_LETTERS[item.rarity]}</span>`;
}

/** `document.createElement`로 칸을 만드는 곳(거래소 카드·판매 등록 칸)에 붙일 요소. 배지가 없으면 `null`. */
export function rarityBadgeNode(item: Item | undefined): HTMLSpanElement | null {
  if (!item || !hasRarityBadge(item)) return null;
  const badge = document.createElement('span');
  badge.className = rarityBadgeClass(item);
  badge.textContent = RARITY_BADGE_LETTERS[item.rarity] ?? '';
  badge.title = rarityBadgeLabel(item);
  badge.setAttribute('aria-hidden', 'true');
  return badge;
}

/** 칸(버튼·카드)에 배지를 붙인다. 붙였으면 `true`. */
export function appendRarityBadge(host: HTMLElement, item: Item | undefined): boolean {
  const badge = rarityBadgeNode(item);
  if (!badge) return false;
  host.append(badge);
  return true;
}
