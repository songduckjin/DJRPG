/**
 * 무작위 보물 주머니의 그림 (작업 207 → 210 4단계).
 *
 * 사용자가 **1번 클래식 가죽 보물 주머니**를 확정했고(`downloads/pouch-option1-leather.png`),
 * "당연히 부드럽게 열어야지"(`#4404`) 지시로 개봉을 **4단계 그림**으로 나눴다 —
 * 닫힘 → 끈 헐거워짐 → 끈 풀리고 빛이 새어 나옴 → 활짝 열리고 빛 폭발.
 *
 * 네 장 모두 어두운 `#171315` 배경을 **투명(RGBA)** 으로 지운 512×512 PNG다
 * (`work/pouch_alpha.py`: 배경색 거리 기반 soft alpha + 테두리 flood-fill 외곽 제거,
 * 4장의 몸통 폭·아래끝·가로 중심을 1단계에 맞춰 그림이 바뀔 때 주머니가 튀지 않는다).
 * `/assets/*`는 immutable 캐시라 파일 이름에 `_v2`를 붙였다.
 *
 * 가방 칸·상세 아이콘은 1단계(닫힌 주머니)를 쓴다.
 */
export const POUCH_FRAME_URLS = [
  '/assets/icons/treasure_pouch_v2.png',        // 1단계 닫힘
  '/assets/icons/treasure_pouch_step2_v2.png',  // 2단계 끈 헐거워짐
  '/assets/icons/treasure_pouch_step3_v2.png',  // 3단계 끈 풀리고 빛이 새어 나옴
  '/assets/icons/treasure_pouch_open_v2.png',   // 4단계 활짝 열림
] as const;

/** 개봉 창이 시작할 때의 그림(닫힌 주머니). */
export const POUCH_ART_URL = POUCH_FRAME_URLS[0];
/** 가방 칸·상세의 작은 아이콘(닫힌 주머니). */
export const POUCH_ICON_URL = POUCH_FRAME_URLS[0];

/** 단계 번호(0~3)를 그림 경로로. 범위를 벗어나면 양끝으로 붙인다. */
export function pouchFrameUrl(index: number): string {
  return POUCH_FRAME_URLS[Math.max(0, Math.min(POUCH_FRAME_URLS.length - 1, index))];
}

/** 개봉 창의 큰 주머니 그림을 그 단계로 바꾼다. */
export function setPouchFrame(image: HTMLImageElement, index: number): void {
  image.src = pouchFrameUrl(index);
  image.dataset.pouchFrame = String(index);
}

/** 개봉 창을 열기 전에 네 장을 미리 받아 둔다 — 단계가 바뀔 때 깜빡이지 않게. */
let framesPreloaded = false;
export function preloadPouchFrames(): void {
  if (framesPreloaded) return;
  framesPreloaded = true;
  if (typeof Image === 'undefined') return;
  for (const url of POUCH_FRAME_URLS) {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
  }
}

/** 가방 칸·상세가 쓰는 작은 아이콘 마크업(문자열). */
export function pouchIconMarkup(className = 'item-icon'): string {
  if (POUCH_ICON_URL) return `<img class="${className} pouch-icon" src="${POUCH_ICON_URL}" alt="">`;
  return `<span class="${className} pouch-icon" aria-hidden="true"><i class="pouch-icon-body"></i><i class="pouch-icon-tie"></i></span>`;
}

/** 개봉 창 가운데의 큰 주머니 — 1단계(닫힘)로 시작한다. */
export function pouchArt(className = 'pouch-art'): HTMLElement {
  if (POUCH_ART_URL) {
    const image = document.createElement('img');
    image.className = className; image.src = POUCH_ART_URL; image.alt = ''; image.draggable = false;
    image.dataset.pouchFrame = '0';
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
