import type { Gender, Save } from '../store';
import { baseItemIndex } from '../items';

/**
 * 마법사 전용 모자·투구 10종 외형 (작업 204).
 *
 * `baseItems.helmet` 0~9번(가죽 두건 ~ 불멸의 왕관)을 마법사가 착용하면 전사용 판금 투구 대신
 * **마법사용 모자·투구**가 나온다. 파츠 20장(남녀 × 10종)은 서기 셀 좌표계의 PNG이고, 그 위에
 * `mageHelmPlacement` 의 자세 값(좌상단 이동·배율)만 주면 서기·걷기 4프레임·공격 4프레임 어디든
 * 같은 자리에 앉는다.
 *
 * 파츠에는 모자·투구만이 아니라 **얼굴·머리카락·목덜미까지** 함께 들어 있다. 본체 시트는 투구를
 * 쓸 때 머리 영역을 지운 `mage_headless/` 판으로 갈아 끼우고(궁수 투구 작업 200과 같은 방식),
 * 파츠가 그 구멍을 그대로 덮는다. 기본 지팡이를 지운 판(`mage_nostaff`)에도 같은 구멍을 뚫어
 * 두어, 지팡이(작업 201)·로브(작업 203)와 함께 써도 셀 좌표계가 같다.
 *
 * 고깔모·후광·날개·뿔은 셀 위로 솟는다. 그래서 파츠 PNG는 **셀보다 `MAGE_HELM_EXTRA_TOP` 행 큰
 * 362×406**이고, 그리기 좌표는 그만큼 위로 올린다(서기 -44). 본체 셀(362)은 그대로라 다른 직업·
 * 로브 시트·지팡이 파츠와 좌표가 어긋나지 않는다.
 *
 * 파츠·머리 없는 시트는 `scripts/build-mage-helm-parts.py` 가 승인 시안(`downloads/mage_helm_v2/`)
 * 에서 만든다.
 */
export type MageHelmMotion = 'idle' | 'walk' | 'attack';

/** 마법사 모자·투구 기본형 개수(`baseItems.helmet`). */
export const MAGE_HELM_COUNT = 10;

export const mageHelmMotionList: readonly MageHelmMotion[] = ['idle', 'walk', 'attack'];

/**
 * 파츠 PNG가 셀 위로 더 가진 행 수 — `scripts/build-mage-helm-parts.py` 의 `EXTRA_TOP` 과 같아야 한다.
 * 파츠 좌상단을 셀 좌표 `-MAGE_HELM_EXTRA_TOP` 에 놓으면 파츠 안의 셀 (0,0)이 본체 셀 (0,0)과 맞는다.
 */
export const MAGE_HELM_EXTRA_TOP = 44;

const MAGE_HELM_ROOT = '/assets/pilot-25d/mage_helms';
const MAGE_HEADLESS_ROOT = '/assets/pilot-25d/mage_headless';

/** 파츠 PNG 파일명. 인덱스가 범위를 벗어나면 `undefined`(호출부는 투구를 그리지 않는다). */
export function mageHelmPartPath(gender: Gender, index: number): string | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= MAGE_HELM_COUNT) return undefined;
  return `${MAGE_HELM_ROOT}/${gender}_${index}_v1.png`;
}

/** 부팅 프리로드용 20장 목록(장당 9~19KB). */
export const mageHelmPartPaths: readonly string[] = ['male', 'female'].flatMap(gender =>
  Array.from({ length: MAGE_HELM_COUNT }, (_, index) => `${MAGE_HELM_ROOT}/${gender}_${index}_v1.png`));

/**
 * 머리 없는 마법사 본체 시트 (작업 204).
 *
 * 기본 시트(`mage_*`)와 기본 지팡이를 지운 시트(`mage_nostaff/`, 작업 201) 각각에 머리를 지운
 * 판을 둔다. 셀 좌표계가 같아 배율·앵커·무기 소켓을 다시 재지 않는다.
 */
export function mageHeadlessBodyPath(gender: Gender, motion: MageHelmMotion, staffless = false): string {
  const directory = staffless ? `${MAGE_HEADLESS_ROOT}/nostaff` : MAGE_HEADLESS_ROOT;
  return `${directory}/mage_${gender}_${motion}_v1.png`;
}

/** 머리 없는 시트 3장(서기·걷기·공격). 지팡이 착용 여부에 따라 판이 다르다. */
export function mageHeadlessBodyPaths(gender: Gender, staffless = false): string[] {
  return mageHelmMotionList.map(motion => mageHeadlessBodyPath(gender, motion, staffless));
}

/** 착용 투구 인덱스. 투구가 없으면 -1. `낡은 투구` 같은 레거시 이름은 `baseItemIndex`가 접는다. */
export function mageHelmIndexFor(save: Save): number {
  const item = save.equipment.helmet;
  if (!item) return -1;
  const index = baseItemIndex(item);
  return Number.isInteger(index) && index >= 0 && index < MAGE_HELM_COUNT ? index : -1;
}

/**
 * 자세별 파츠 배치 — 파츠 PNG의 **좌상단**을 셀 좌표 (x, y)에 두고 `scale` 배로 그린다.
 *
 * 값은 `scripts/build-mage-helm-parts.py` 가 서기 얼굴을 각 프레임에서 템플릿 매칭해 찾은
 * 배율·이동에서 파츠 높이(44행)만큼 위로 올린 값이다(스크립트를 다시 돌리면 표를 다시 출력한다).
 * 서기는 파츠 PNG 자체의 자세(0, -44, 1)이고, 걷기·공격은 인물이 작게 그려져 배율이 1 이하다.
 */
export type MageHelmPlacement = { x: number; y: number; scale: number };

/** 서기: 파츠 PNG의 (0, 0)이 곧 셀의 (0, 44)다 — 44행만큼 위로 올린다. */
const idlePlacement: MageHelmPlacement = { x: 0, y: -MAGE_HELM_EXTRA_TOP, scale: 1 };

const mageHelmFrames: Record<Gender, Record<'walk' | 'attack', readonly MageHelmPlacement[]>> = {
  male: {
    walk: [
      { x: 3, y: -38, scale: 0.95 },
      { x: -11, y: -40, scale: 0.98 },
      { x: -4, y: -37, scale: 0.96 },
      { x: -7, y: -41, scale: 0.98 }
    ],
    attack: [
      { x: -11, y: -5, scale: 0.94 },
      { x: -30, y: -1, scale: 0.95 },
      { x: -66, y: 5, scale: 0.95 },
      { x: -22, y: 15, scale: 0.94 }
    ]
  },
  female: {
    walk: [
      { x: 20, y: -45, scale: 0.98 },
      { x: 20, y: -44, scale: 1 },
      { x: 17, y: -40, scale: 0.98 },
      { x: 24, y: -43, scale: 0.98 }
    ],
    attack: [
      { x: -3, y: -7, scale: 0.98 },
      { x: 34, y: 5, scale: 0.94 },
      { x: -64, y: 22, scale: 0.89 },
      { x: 30, y: 0, scale: 0.94 }
    ]
  }
};

/** 프레임 번호를 표 길이 안으로 접는다(음수·소수·큰 값 방어). */
const wrapFrame = (frame: number, length: number): number =>
  Number.isFinite(frame) ? ((Math.trunc(frame) % length) + length) % length : 0;

export function mageHelmPlacement(gender: Gender, motion: MageHelmMotion, frame = 0): MageHelmPlacement {
  if (motion === 'idle') return idlePlacement;
  const list = mageHelmFrames[gender][motion];
  return list[wrapFrame(frame, list.length)];
}

/** 장비창(내 정보) 초상화는 서기 한 장만 쓴다. */
export const mageHelmIdlePlacement = idlePlacement;
