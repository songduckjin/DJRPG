/**
 * 업그레이드 초록 화살표 (작업 241, 사용자 확정 A안 `downloads/upgrade_arrow/opt_a.jpg`).
 *
 * 가방(내 정보)·공용창고·거래소 카드에서 **내 직업이 낄 수 있는 장비 중 지금 낀 것보다 좋은 것**의
 * 아이콘 우측 상단(`top: 2px; right: 2px`)에 선명한 초록색 위쪽 화살표(`▲`)를 띄운다.
 *
 * 판정은 `isUpgradeForHero`(game/items.ts) 한 곳에서만 하고, 이 파일은 그 판정을 **그림**으로
 * 옮기는 일만 한다. 그래서 화면이 셋이어도 조건이 갈리지 않는다.
 *
 * 겹침 규칙: 좌상단은 타직업 배지(`.job-badge`), 우하단은 `+N`(강화)와 잠금 배지가 쓰므로
 * 화살표는 우측 상단에만 둔다(`.bag-item.has-upgrade .bag-lock-badge`는 CSS가 아래로 내린다).
 */
import { isUpgradeForHero, type Item } from '../game/items';
import type { Save } from '../game/store';

/** 화살표 요소의 클래스 — CSS(`styles/modals.css`)와 테스트가 같은 이름을 본다. */
export const UPGRADE_ARROW_CLASS = 'upgrade-arrow';
/** 화면에 그리는 글자. 외곽선은 CSS `text-shadow`로 어둡게 두른다. */
export const UPGRADE_ARROW_TEXT = '▲';
/** 확정 색(초록). */
export const UPGRADE_ARROW_COLOR = '#34eb6e';
/** 화면 낭독기·툴팁 문구. */
export const UPGRADE_ARROW_LABEL = '지금 장착한 장비보다 좋은 장비';

/** `innerHTML`로 카드를 만드는 곳(가방·공용창고)에 붙일 문자열. 업그레이드가 아니면 빈 문자열. */
export function upgradeArrowMarkup(save: Save, item: Item): string {
  return isUpgradeForHero(save, item)
    ? `<span class="${UPGRADE_ARROW_CLASS}" aria-hidden="true" title="${UPGRADE_ARROW_LABEL}">${UPGRADE_ARROW_TEXT}</span>`
    : '';
}

/** `document.createElement`로 카드를 만드는 곳(거래소)에 붙일 요소. */
export function upgradeArrowNode(): HTMLSpanElement {
  const arrow = document.createElement('span');
  arrow.className = UPGRADE_ARROW_CLASS;
  arrow.textContent = UPGRADE_ARROW_TEXT;
  arrow.title = UPGRADE_ARROW_LABEL;
  arrow.setAttribute('aria-hidden', 'true');
  return arrow;
}

/** 아이콘 상자(또는 카드)에 화살표를 붙인다. 붙였으면 `true` — 카드 클래스·낭독기 문구에 쓴다. */
export function appendUpgradeArrow(host: HTMLElement, save: Save, item: Item): boolean {
  if (!isUpgradeForHero(save, item)) return false;
  host.append(upgradeArrowNode());
  return true;
}
