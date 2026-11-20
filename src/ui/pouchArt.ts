/**
 * 무작위 보물 주머니의 그림 (작업 207).
 *
 * 사용자가 **1번 클래식 가죽 보물 주머니**를 확정했다(`downloads/pouch-option1-leather.png`).
 * 그 그림을 `public/assets/icons/treasure_pouch.png`로 넣고 아래 두 경로로 연결한다 — 가방 칸·상세·
 * 개봉 창이 같은 파일을 쓴다. 배경(짙은 갈흑색 #171315)은 게임 UI의 어두운 배경과 거의 같아 그대로 쓴다.
 * (배경 제거·크롭 없이 해상도만 512px로 줄였다. 원본은 사용자 `downloads/`에 그대로 있다.)
 */
export const POUCH_ART_URL = '/assets/icons/treasure_pouch.png';
export const POUCH_ICON_URL = '/assets/icons/treasure_pouch.png';

/** 가방 칸·상세가 쓰는 작은 아이콘 마크업(문자열). */
export function pouchIconMarkup(className = 'item-icon'): string {
  if (POUCH_ICON_URL) return `<img class="${className} pouch-icon" src="${POUCH_ICON_URL}" alt="">`;
  return `<span class="${className} pouch-icon" aria-hidden="true"><i class="pouch-icon-body"></i><i class="pouch-icon-tie"></i></span>`;
}

/** 개봉 창 가운데의 큰 주머니. */
export function pouchArt(className = 'pouch-art'): HTMLElement {
  if (POUCH_ART_URL) {
    const image = document.createElement('img');
    image.className = className; image.src = POUCH_ART_URL; image.alt = ''; image.draggable = false;
    return image;
  }
  const art = document.createElement('span');
  art.className = className;
  art.setAttribute('aria-hidden', 'true');
  const glow = document.createElement('i'); glow.className = 'pouch-art-glow';
  const body = document.createElement('i'); body.className = 'pouch-art-body';
  const tie = document.createElement('i'); tie.className = 'pouch-art-tie';
  const knot = document.createElement('i'); knot.className = 'pouch-art-knot';
  const mark = document.createElement('i'); mark.className = 'pouch-art-mark';
  art.append(glow, body, tie, knot, mark);
  return art;
}
