/**
 * 무작위 보물 주머니의 그림 (작업 207 → 210 4단계 → 212 6단계 → 214 9컷).
 *
 * 사용자가 **1번 클래식 가죽 보물 주머니**를 확정했고(`downloads/pouch-option1-leather.png`),
 * "당연히 부드럽게 열어야지"(`#4404`) 지시로 개봉을 단계 그림으로 나눴다.
 * 작업 212(`#4973`·`#4984`)에서 **흘러내림 2장**을 더해 6단계가 되었고,
 * 작업 214(`#5222`·`#5241`)에서 사용자 지시 "이미지를 흔들지 말고 프레임을 더 넣어서 모션으로"에 따라
 * 기존 컷 **사이를 잇는 중간 그림 4장**을 더해 **9컷**으로 늘렸다 —
 * 닫힘 → 끈이 당겨지며 부푸는 → 끈 헐거워짐 → 입구가 틈새처럼 벌어짐 → 빛이 새어 나옴
 * → 반쯤 활짝(빛이 비침) → 활짝 열림(절정) → 무너지며 풀리기 시작 → 바닥에 납작하게 접힘.
 *
 * 아홉 장 모두 어두운 `#171315` 배경을 **투명(RGBA)** 으로 지운 512×512 PNG다
 * (`work/pouch_alpha.py`: 배경색 거리 기반 soft alpha + 테두리 flood-fill 외곽 제거,
 * 모든 컷의 몸통 폭·아래끝·가로 중심을 1단계에 맞춰 그림이 바뀔 때 주머니가 튀지 않는다).
 * 중간 4장은 `work/pouch_mid.py`가 같은 파이프라인으로 만들었다.
 * `/assets/*`는 immutable 캐시라 새 파일은 `_v3` 이름을 쓴다(기존 6장은 `_v2` 그대로).
 *
 * **크로스페이드**: `createPouchArt`가 만드는 무대에는 같은 크기의 `<img class="pouch-art">`가
 * **두 장 겹쳐** 있고, `setPouchFrame`이 뒤 장에 다음 그림을 넣은 뒤 `is-front`를 넘긴다.
 * CSS `opacity` transition이 둘을 겹쳐 서서히 바꿔 주므로 단계가 뚝 끊기지 않는다.
 *
 * 가방 칸·상세 아이콘은 1단계(닫힌 주머니)를 쓴다.
 */
export const POUCH_FRAME_URLS = [
  '/assets/icons/treasure_pouch_v2.png',          // 1 닫힘
  '/assets/icons/treasure_pouch_step1b_v3.png',   // 2 끈이 당겨지며 부푸는
  '/assets/icons/treasure_pouch_step2_v2.png',    // 3 끈 헐거워짐
  '/assets/icons/treasure_pouch_step2b_v3.png',   // 4 입구가 틈새처럼 살짝 벌어짐
  '/assets/icons/treasure_pouch_step3_v2.png',    // 5 끈 풀리고 빛이 새어 나옴
  '/assets/icons/treasure_pouch_step3b_v3.png',   // 6 반쯤 활짝 열리며 빛이 비침
  '/assets/icons/treasure_pouch_open_v2.png',     // 7 활짝 열림(절정)
  '/assets/icons/treasure_pouch_slump0_v3.png',   // 8 무너지며 풀리기 시작
  '/assets/icons/treasure_pouch_slump2_v2.png',   // 9 바닥에 납작하게 접힘
] as const;

/** 금화 당첨 보상 카드의 금화 뭉치 그림(우리 게임 금화 무늬). */
export const POUCH_GOLD_PILE_URL = '/assets/icons/pouch_gold_pile_v2.png';

/** 개봉 창이 시작할 때의 그림(닫힌 주머니). */
export const POUCH_ART_URL = POUCH_FRAME_URLS[0];
/** 가방 칸·상세의 작은 아이콘(닫힌 주머니). */
export const POUCH_ICON_URL = POUCH_FRAME_URLS[0];

/** 단계 번호(0~8)를 그림 경로로. 범위를 벗어나면 양끝으로 붙인다. */
export function pouchFrameUrl(index: number): string {
  return POUCH_FRAME_URLS[Math.max(0, Math.min(POUCH_FRAME_URLS.length - 1, index))];
}

/** 층 하나에 `is-front`를 켜고 끈다(이미 그 상태면 건드리지 않는다 — 클래스가 겹치지 않게). */
function markFront(layer: HTMLElement, on: boolean): void {
  const has = String(layer.className).split(/\s+/).includes('is-front');
  if (on && !has) layer.classList.add('is-front');
  if (!on && has) layer.classList.remove('is-front');
}

/** 두 장을 겹쳐 크로스페이드하는 무대(주머니 그림 자체)를 만든다. */
export function createPouchArt(): HTMLElement {
  const stack = document.createElement('span');
  stack.className = 'pouch-art-stack';
  stack.setAttribute('aria-hidden', 'true');
  stack.dataset.pouchFrame = '0';
  stack.dataset.pouchFront = '0';
  for (let layer = 0; layer < 2; layer++) {
    const image = document.createElement('img');
    image.className = layer === 0 ? 'pouch-art is-front' : 'pouch-art';
    image.src = POUCH_ART_URL;
    image.alt = '';
    image.draggable = false;
    image.dataset.pouchLayer = String(layer);
    image.dataset.pouchFrame = '0';
    stack.append(image);
  }
  return stack;
}

/**
 * 다음 단계로 **겹쳐서** 넘긴다 — 뒤 장에 새 그림을 넣고 `is-front`를 넘기면
 * CSS opacity transition이 두 장을 서로 겹쳐 서서히 바꾼다(뚝 끊김 없음).
 */
export function setPouchFrame(stack: HTMLElement, index: number): void {
  const clamped = Math.max(0, Math.min(POUCH_FRAME_URLS.length - 1, index));
  stack.dataset.pouchFrame = String(clamped);
  const layers = Array.from(stack.children) as HTMLImageElement[];
  if (layers.length < 2) {
    for (const layer of layers) { layer.src = pouchFrameUrl(clamped); layer.dataset.pouchFrame = String(clamped); }
    return;
  }
  const front = Number(stack.dataset.pouchFront ?? '0') === 1 ? 1 : 0;
  const next = 1 - front;
  const incoming = layers[next], outgoing = layers[front];
  incoming.src = pouchFrameUrl(clamped);
  incoming.dataset.pouchFrame = String(clamped);
  // 같은 프레임을 다시 넘겨도 전환이 다시 시작되도록 리플로를 한 번 강제한다.
  void incoming.offsetWidth;
  markFront(incoming, true);
  markFront(outgoing, false);
  stack.dataset.pouchFront = String(next);
}

/** `한 번 더 열기`·`1개 더 열기`·모션 감소 — 연출 없이 곧바로 1단계(닫힌 주머니)로 되돌린다. */
export function resetPouchArt(stack: HTMLElement): void {
  const layers = Array.from(stack.children) as HTMLImageElement[];
  stack.dataset.pouchFrame = '0';
  stack.dataset.pouchFront = '0';
  // 되돌리는 순간에는 opacity transition을 꺼서 앞 컷의 잔상이 겹쳐 보이지 않게 한다.
  stack.classList.add('is-resetting');
  for (let index = 0; index < layers.length; index++) {
    const layer = layers[index];
    layer.src = POUCH_ART_URL;
    layer.dataset.pouchFrame = '0';
    markFront(layer, index === 0);
  }
  void stack.offsetWidth;
  stack.classList.remove('is-resetting');
}

/** 개봉 창을 열기 전에 아홉 장을 미리 받아 둔다 — 단계가 바뀔 때 깜빡이지 않게. */
let framesPreloaded = false;
export function preloadPouchFrames(): void {
  if (framesPreloaded) return;
  framesPreloaded = true;
  if (typeof Image === 'undefined') return;
  for (const url of [...POUCH_FRAME_URLS, POUCH_GOLD_PILE_URL]) {
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
