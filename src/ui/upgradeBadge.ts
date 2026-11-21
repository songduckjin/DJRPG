/**
 * 업그레이드 화살표 (작업 241 → 246에서 3번 시안 슬림 더블 셰브론으로 교체).
 *
 * 가방(내 정보)·장비창 장착 칸·공용창고·거래소 카드에서 **내 직업이 낄 수 있는 장비 중 지금 낀
 * 것보다 좋은 것**의 아이콘 우측 상단(`top: 2px; right: 2px`)에 초록 화살표를 띄운다.
 *
 * [작업 246] 사용자 피드백 "화살표가 크고 투박해 아이템을 가린다" → 글자(`▲`) 대신 사용자가
 * 고른 **3번 슬림 더블 셰브론 PNG**(`public/assets/icons/upgrade-arrow-slim.png`, 원본
 * `downloads/djrpg_upgrade_arrow_slim_64.png`)를 쓰고, 크기를 9px 이하로 줄이며 주변에
 * 은은한 녹색 발광(`drop-shadow`)만 남긴다. 판정 로직은 그대로 `isUpgradeForHero` 한 곳이다.
 *
 * 겹침 규칙: 좌상단은 타직업 배지(`.job-badge`)·아이템 등급 배지(`L`·`U`·`E`, PR #305), 왼쪽 아래는
 * `+N` 강화 배지(작업 246), 오른쪽 아래는 수량 `×N`·잠금 배지가 쓰므로 화살표는 우측 상단에만 둔다
 * (`.bag-item.has-upgrade .bag-lock-badge`는 CSS가 아래로 내린다).
 *
 * [빨간 아래 화살표] 사용자 요청 "장비창에 내꺼보다 수치 낮은 거는 빨간색으로 화살표 아래 표시" — 같은
 * 슬림 더블 셰브론을 180° 뒤집어 빨갛게 구운 `downgrade-arrow-slim.png`를 **같은 우측 상단**에 얹는다.
 * `isUpgradeForHero`와 `isDowngradeForHero`가 서로 배타적이라(같은 `itemPower`면 둘 다 아니다) 한 칸에 두
 * 화살표가 함께 붙지 않는다.
 */
import { isDowngradeForHero, isUpgradeForHero, type Item } from '../game/items';
import type { Save } from '../game/store';

/** 화살표 요소의 클래스 — CSS(`styles/modals.css`)와 테스트가 같은 이름을 본다. */
export const UPGRADE_ARROW_CLASS = 'upgrade-arrow';
/** 사용자가 고른 3번 슬림 더블 셰브론 투명 PNG(64×64). */
export const UPGRADE_ARROW_ART = '/assets/icons/upgrade-arrow-slim.png';
/** 발광에 쓰는 색(= 원본 PNG의 초록). */
export const UPGRADE_ARROW_COLOR = '#34d399';
/** 화면 낭독기·툴팁 문구. */
export const UPGRADE_ARROW_LABEL = '지금 장착한 장비보다 좋은 장비';

/** `innerHTML`로 카드를 만드는 곳(가방·공용창고·장착 칸)에 붙일 문자열. 업그레이드가 아니면 빈 문자열. */
export function upgradeArrowMarkup(save: Save, item: Item): string {
  return isUpgradeForHero(save, item)
    ? `<img class="${UPGRADE_ARROW_CLASS}" src="${UPGRADE_ARROW_ART}" alt="" aria-hidden="true" title="${UPGRADE_ARROW_LABEL}" draggable="false">`
    : '';
}

/** `document.createElement`로 카드를 만드는 곳(거래소)에 붙일 요소. */
export function upgradeArrowNode(): HTMLImageElement {
  const arrow = document.createElement('img');
  arrow.className = UPGRADE_ARROW_CLASS;
  arrow.src = UPGRADE_ARROW_ART;
  arrow.alt = '';
  arrow.title = UPGRADE_ARROW_LABEL;
  arrow.draggable = false;
  arrow.setAttribute('aria-hidden', 'true');
  return arrow;
}

/** 아이콘 상자(또는 카드)에 화살표를 붙인다. 붙였으면 `true` — 카드 클래스·낭독기 문구에 쓴다. */
export function appendUpgradeArrow(host: HTMLElement, save: Save, item: Item): boolean {
  if (!isUpgradeForHero(save, item)) return false;
  host.append(upgradeArrowNode());
  return true;
}

/** 다운그레이드(빨간 아래) 화살표 클래스 — CSS(`styles/modals/equip.css`)와 테스트가 같은 이름을 본다. */
export const DOWNGRADE_ARROW_CLASS = 'downgrade-arrow';
/** 같은 3번 슬림 더블 셰브론을 180° 뒤집어 빨갛게 구운 64×64 투명 PNG. */
export const DOWNGRADE_ARROW_ART = '/assets/icons/downgrade-arrow-slim.png';
/** 발광에 쓰는 색(= 원본 PNG를 빨갛게 구운 색, `#f87171` 계열). */
export const DOWNGRADE_ARROW_COLOR = '#f87171';
/** 화면 낭독기·툴팁 문구. */
export const DOWNGRADE_ARROW_LABEL = '지금 장착한 장비보다 약한 장비';

/** `innerHTML`로 카드를 만드는 곳(가방·공용창고)에 붙일 문자열. 다운그레이드가 아니면 빈 문자열. */
export function downgradeArrowMarkup(save: Save, item: Item): string {
  return isDowngradeForHero(save, item)
    ? `<img class="${DOWNGRADE_ARROW_CLASS}" src="${DOWNGRADE_ARROW_ART}" alt="" aria-hidden="true" title="${DOWNGRADE_ARROW_LABEL}" draggable="false">`
    : '';
}

/** `document.createElement`로 카드를 만드는 곳에 붙일 요소. */
export function downgradeArrowNode(): HTMLImageElement {
  const arrow = document.createElement('img');
  arrow.className = DOWNGRADE_ARROW_CLASS;
  arrow.src = DOWNGRADE_ARROW_ART;
  arrow.alt = '';
  arrow.title = DOWNGRADE_ARROW_LABEL;
  arrow.draggable = false;
  arrow.setAttribute('aria-hidden', 'true');
  return arrow;
}

/** 아이콘 상자(또는 카드)에 빨간 아래 화살표를 붙인다. 붙였으면 `true`. */
export function appendDowngradeArrow(host: HTMLElement, save: Save, item: Item): boolean {
  if (!isDowngradeForHero(save, item)) return false;
  host.append(downgradeArrowNode());
  return true;
}
