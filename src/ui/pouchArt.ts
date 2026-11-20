/**
 * 무작위 보물 주머니의 그림 (작업 207 → 210 4단계 → 212 6단계 → 214 9컷 → 215 **3컷**).
 *
 * 사용자가 **1번 클래식 가죽 보물 주머니**를 확정했고(`downloads/pouch-option1-leather.png`),
 * "당연히 부드럽게 열어야지"(`#4404`) 지시로 개봉을 단계 그림으로 나눴다.
 *
 * **작업 215 (`#5297`: "이미지가 연결이 하나도 안 돼 끈 풀리기까지 더 뚝뚝 끊겨 그리고 모양이 막 변하고")**
 * — 작업 214에서 AI로 만든 중간 컷(`step1b`·`step2`·`step2b`·`step3`·`step3b`·`open`)은 서로
 * **각도·배 둘레·문양 크기**가 조금씩 달라, 9장을 넘길수록 주머니가 **울렁거리며 변해** 오히려 더 끊겨 보였고
 * 6·7번 컷에는 어두운 후광 찌꺼기도 남아 있었다. 그래서 **모양이 한 번도 변형되지 않는 핵심 3장**만 남긴다.
 *
 * - **1 닫힘**: `treasure_pouch_v2.png` — 쪼으는 구간(0~900ms) 내내 이 한 장을 유지하고 CSS 탄성(Squash & Stretch)으로만 산다.
 * - **2 풀리며 무너짐**: `treasure_pouch_slump0_v3.png` — 1번과 각도·문양이 일치하고 누끼가 깨끗하다(920ms 절정의 흰빛 속에서 교체).
 * - **3 바닥에 납작**: `treasure_pouch_slump2_v2.png` — 1080ms에 빠르게 넘어가 아래로 가라앉는다.
 *
 * 세 장 모두 어두운 `#171315` 배경을 **투명(RGBA)** 으로 지운 512×512 PNG다(`work/pouch_alpha.py`).
 * `/assets/*`는 immutable 캐시라 새 파일은 `_v3` 이름을 쓴다(기존 6장은 `_v2` 그대로).
 *
 * **크로스페이드**: `createPouchArt`가 만드는 무대에는 같은 크기의 `<img class="pouch-art">`가
 * **두 장 겹쳐** 있고, `setPouchFrame`이 뒤 장에 다음 그림을 넣은 뒤 `is-front`를 넘긴다.
 * CSS `opacity` transition이 둘을 겹쳐 서서히 바꿔 주므로 단계가 뚝 끊기지 않는다.
 *
 * 가방 칸·상세 아이콘은 1단계(닫힌 주머니)를 쓴다.
 */
export const POUCH_FRAME_URLS = [
  '/assets/icons/treasure_pouch_v2.png',          // 1 닫힘 — 쪼으는 구간(0~900ms) 동안 이 한 장
  '/assets/icons/treasure_pouch_slump0_v3.png',   // 2 끈이 풀리며 무너짐 — 920ms, 흰빛 섬광 속 교체
  '/assets/icons/treasure_pouch_slump2_v2.png',   // 3 바닥에 납작하게 접힘 — 1080ms
] as const;

/** 금화 당첨 보상 카드의 금화 뭉치 그림(우리 게임 금화 무늬). */
export const POUCH_GOLD_PILE_URL = '/assets/icons/pouch_gold_pile_v2.png';

/** 개봉 창이 시작할 때의 그림(닫힌 주머니). */
export const POUCH_ART_URL = POUCH_FRAME_URLS[0];
/** 가방 칸·상세의 작은 아이콘(닫힌 주머니). */
export const POUCH_ICON_URL = POUCH_FRAME_URLS[0];

/** 단계 번호(0~2)를 그림 경로로. 범위를 벗어나면 양끝으로 붙인다. */
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

/** 개봉 창을 열기 전에 세 장(과 금화 뭉치)을 미리 받아 둔다 — 단계가 바뀔 때 깜빡이지 않게. */
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
