import type { Gender, Save } from '../store';
import { baseItemIndex } from '../items';
import { pilotSheet } from './pilotAssets';

/**
 * 궁수 전용 투구 10종 외형 (작업 200).
 *
 * `baseItems.helmet` 0~9번(가죽 두건 ~ 불멸의 왕관)을 궁수가 착용하면 전사용 판금 투구 대신
 * **궁수용 모자·투구**가 나온다. 파츠 20장(남녀 × 10종)은 서기 셀 362×362 좌표계의 **전체 셀
 * PNG**이고, 그 위에 `archerHelmPlacement` 의 자세 값(좌상단 이동·배율)만 주면 서기·걷기 4프레임·
 * 사격 4프레임 어디든 같은 자리에 앉는다.
 *
 * 파츠에는 투구·모자만이 아니라 **얼굴·머리카락까지** 함께 들어 있다. 본체 시트는 투구를 쓸 때
 * 머리 영역을 지운 `archer_headless/` 판으로 갈아 끼우고(전사 작업 152와 같은 방식), 파츠가 그
 * 구멍을 그대로 덮는다. 파츠와 구멍이 **같은 도형**(빌더의 `HEAD_POLYGON`)이라 이음매가 남지 않고,
 * 여성의 높은 포니테일도 투구와 한 덩어리로 그려져 본체 머리카락이 비치지 않는다.
 *
 * 파츠·머리 없는 시트는 `scripts/build-archer-helm-parts.py` 가 승인 시안
 * (`downloads/archer_helm_preview/`)에서 만든다. 갑옷 10종(`archerArmors`)·활 10종(`bows`)과
 * 셀 좌표계가 같아 셋을 자유롭게 조합해도 앵커를 다시 잴 필요가 없다.
 */
export type ArcherHelmMotion = 'idle' | 'walk' | 'attack';

/** 궁수 투구 기본형 개수(`baseItems.helmet`). */
export const ARCHER_HELM_COUNT = 10;

export const archerHelmMotionList: readonly ArcherHelmMotion[] = ['idle', 'walk', 'attack'];

const ARCHER_HELM_ROOT = '/assets/pilot-25d/archer_helms';
const ARCHER_HEADLESS_ROOT = '/assets/pilot-25d/archer_headless';

/** 파츠 PNG 파일명. 인덱스가 범위를 벗어나면 `undefined`(호출부는 투구를 그리지 않는다). */
export function archerHelmPartPath(gender: Gender, index: number): string | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= ARCHER_HELM_COUNT) return undefined;
  return pilotSheet(`${ARCHER_HELM_ROOT}/${gender}_${index}_v1.png`);
}

/** 부팅 프리로드용 20장 목록. */
export const archerHelmPartPaths: readonly string[] = ['male', 'female'].flatMap(gender =>
  Array.from({ length: ARCHER_HELM_COUNT }, (_, index) => pilotSheet(`${ARCHER_HELM_ROOT}/${gender}_${index}_v1.png`)));

/**
 * 궁수 투구 발광 마스크 경로 (작업 248).
 *
 * 파츠와 같은 파일명·같은 362×362 크기의 알파 마스크를 `archer_helms_glow/` 아래 둔다
 * (`scripts/build-helm-glow-masks.py`). 파츠 경로의 디렉터리 이름만 바꾸므로 `?v=` 버전도 따라간다.
 */
export const ARCHER_HELM_GLOW_DIR = 'archer_helms_glow';

export function archerHelmGlowMaskPath(gender: Gender, index: number): string | undefined {
  const part = archerHelmPartPath(gender, index);
  return part ? part.replace('/archer_helms/', `/${ARCHER_HELM_GLOW_DIR}/`) : undefined;
}

/** 발광 마스크 20장 목록(검수·테스트용). */
export const archerHelmGlowMaskPaths: readonly string[] = (['male', 'female'] as const).flatMap(gender =>
  Array.from({ length: ARCHER_HELM_COUNT }, (_, index) => archerHelmGlowMaskPath(gender, index) ?? ''));

/**
 * 머리 없는 궁수 본체 시트 (작업 200).
 *
 * 기본 시트(`archer_*`)와 1번 이상 활을 찬 궁수의 기본 활 지운 시트(`nobow/archer_*`) 각각에
 * 머리를 지운 판을 둔다. 셀 좌표계가 같아 배율·앵커·무기 소켓을 다시 재지 않는다.
 */
export function archerHeadlessBodyPath(gender: Gender, motion: ArcherHelmMotion, bowless = false): string {
  const directory = bowless ? `${ARCHER_HEADLESS_ROOT}/nobow` : ARCHER_HEADLESS_ROOT;
  return pilotSheet(`${directory}/archer_${gender}_${motion}_v1.png`);
}

/** 머리 없는 시트 6장(서기·걷기·사격 × 기본·활 지움). 장비를 바꿀 때 미리 받는다. */
export function archerHeadlessBodyPaths(gender: Gender, bowless = false): string[] {
  return archerHelmMotionList.map(motion => archerHeadlessBodyPath(gender, motion, bowless));
}

/** 착용 투구 인덱스. 투구가 없으면 -1. `낡은 투구` 같은 레거시 이름은 `baseItemIndex`가 접는다. */
export function archerHelmIndexFor(save: Save): number {
  const item = save.equipment.helmet;
  if (!item) return -1;
  const index = baseItemIndex(item);
  return Number.isInteger(index) && index >= 0 && index < ARCHER_HELM_COUNT ? index : -1;
}

/**
 * 자세별 파츠 배치 — 파츠 PNG의 **좌상단**을 셀 좌표 (x, y)에 두고 `scale` 배로 그린다.
 *
 * 값은 `scripts/build-archer-helm-parts.py`가 서기 얼굴을 각 프레임에서 템플릿 매칭해 찾은
 * 배율·이동을 그대로 옮긴 것이다(스크립트를 다시 돌리면 표를 다시 출력한다). 서기는 파츠 PNG
 * 자체의 자세(1, 0, 0)이고, 걷기·사격은 인물이 작게 그려져 배율이 1보다 작다.
 */
export type ArcherHelmPlacement = { x: number; y: number; scale: number };

const idlePlacement: ArcherHelmPlacement = { x: 0, y: 0, scale: 1 };

const archerHelmFrames: Record<Gender, Record<'walk' | 'attack', readonly ArcherHelmPlacement[]>> = {
  male: {
    walk: [
      { x: 27, y: 13, scale: 0.9 },
      { x: 22, y: 15, scale: 0.9 },
      { x: 12, y: 14, scale: 0.9 },
      { x: 11, y: 14, scale: 0.93 }
    ],
    attack: [
      { x: 66, y: 97, scale: 0.72 },
      { x: 60, y: 104, scale: 0.66 },
      { x: 60, y: 102, scale: 0.66 },
      { x: 64, y: 101, scale: 0.67 }
    ]
  },
  female: {
    walk: [
      { x: 28, y: 14, scale: 0.93 },
      { x: 36, y: 14, scale: 0.92 },
      { x: 30, y: 14, scale: 0.92 },
      { x: 31, y: 14, scale: 0.93 }
    ],
    attack: [
      { x: 65, y: 98, scale: 0.7 },
      { x: 74, y: 102, scale: 0.65 },
      { x: 62, y: 104, scale: 0.66 },
      { x: 66, y: 106, scale: 0.65 }
    ]
  }
};

/** 프레임 번호를 표 길이 안으로 접는다(음수·소수·큰 값 방어). */
const wrapFrame = (frame: number, length: number): number =>
  Number.isFinite(frame) ? ((Math.trunc(frame) % length) + length) % length : 0;

export function archerHelmPlacement(gender: Gender, motion: ArcherHelmMotion, frame = 0): ArcherHelmPlacement {
  if (motion === 'idle') return idlePlacement;
  const list = archerHelmFrames[gender][motion];
  return list[wrapFrame(frame, list.length)];
}

/** 장비창(내 정보) 초상화는 서기 한 장만 쓴다. */
export const archerHelmIdlePlacement = idlePlacement;
