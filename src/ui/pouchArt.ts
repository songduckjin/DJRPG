/**
 * 무작위 보물 주머니의 그림 (작업 207).
 *
 * 사용자가 아직 **주머니 아이콘·일러스트 시안을 고르지 않았으므로**, 지금은 이미지 파일 없이 CSS로
 * 그린 주머니를 쓴다. 확정 이미지가 오면 아래 두 경로만 채우면 가방 칸·상세·개봉 창이 한꺼번에
 * 그 이미지로 바뀐다(크기·자리 규칙은 그대로).
 */
export const POUCH_ART_URL = '';
export const POUCH_ICON_URL = '';

/** 가방 칸·상세가 쓰는 작은 아이콘 마크업(문자열). */
export function pouchIconMarkup(className = 'item-icon'): string {
  if (POUCH_ICON_URL) return `<img class="${className} pouch-icon" src="${POUCH_ICON_URL}" alt="">`;
  return `<span class="${className} pouch-icon" aria-hidden="true"><i class="pouch-icon-body"></i><i class="pouch-icon-tie"></i></span>`;
}

/** 개봉 창 가운데의 큰 주머니. */
export function pouchArt(className = 'pouch-art'): HTMLElement {
  if (POUCH_ART_URL) {
    const image = document.createElement('img');
    image.className = className; image.src = POUCH_ART_URL; image.alt = '';
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
