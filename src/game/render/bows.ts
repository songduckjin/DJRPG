import type { Gender, Save } from '../store';
import { bowIndex, isBow, hasNoWeapon } from '../items';
import { pilotSheet } from './pilotAssets';

/**
 * 착용 활 10종 외형 파츠 (작업 160).
 *
 * `bowBases` 0~9번(사냥꾼의 활 ~ 패왕의 신궁)을 **본체 시트와 분리된 파츠 PNG**로 그린다.
 * 파츠는 기준 시트의 362px 셀 좌표계를 그대로 쓰고, 활을 쥔 그립 점을 축으로 자세마다
 * 회전·이동만 준다. 그래서 걷기 4프레임·사격 4프레임에서도 활이 손에서 떨어지거나 길이가
 * 줄지 않는다(강체).
 *
 * 0번(사냥꾼의 활)은 본체 시트에 이미 그려져 있으므로 파츠를 쓰지 않는다. 1번 이상을 장착하면
 * 본체는 기본 활대를 지운 시트(`nobow/`)로 갈아 끼우고 그 위에 파츠를 얹는다. 두 시트는
 * 셀 좌표계가 같아 배율·앵커를 다시 잴 필요가 없다. 시위(활줄)는 `nobow` 시트에 남겨 두어
 * 사격 프레임에서 얼굴 쪽으로 당겨진 모양이 그대로 살아 있다.
 *
 * 파츠는 `scripts/build-bow-parts.py`가 승인 시안(`tools/bow-src/`)에서 뜬다.
 * 전사 대검(`weapons.ts`)과 같은 구조이며, 궁수 전용 갑옷·후드가 붙을 때도 이 파일만 확장하면 된다.
 */
export type BowMotion = 'idle' | 'walk' | 'attack';

/** 활 기본형 개수(`bowBases`). */
export const BOW_COUNT = 10;

export const bowMotionList: readonly BowMotion[] = ['idle', 'walk', 'attack'];

const BOW_ROOT = '/assets/pilot-25d/bows';
const NOBOW_ROOT = '/assets/pilot-25d/nobow';

/**
 * 파츠 PNG 안에서 손이 활을 쥔 그립 점. 모든 파츠가 같은 자리에 그립을 두고 그려졌으므로
 * 앵커는 하나이고, 자세마다 이 점의 셀 좌표와 회전각만 바뀐다(빌더 `REF_GRIP`).
 */
export const BOW_GRIP = { x: 232, y: 193 } as const;

export type BowPose = {
  /** 그립 점의 셀 좌표. */
  x: number;
  y: number;
  /** idle 대비 회전각(도). 화면 좌표(y 아래)에서 양수가 시계방향이다. */
  rot: number;
};

/**
 * 자세별 파츠 배치 — `scripts/build-bow-parts.py`의 `SEEDS`에서 계산한 표를 그대로 옮겼다
 * (빌더 `--preview` 검수 이미지로 확인). `idle0` 은 파츠 PNG 자체의 자세라 회전 0이다.
 */
export const BOW_POSES: Record<Gender, Record<string, BowPose>> = {
  male: {
    idle0: { x: 232, y: 193, rot: 0 },
    walk0: { x: 219, y: 192, rot: -4.35 },
    walk1: { x: 226, y: 188, rot: -5.02 },
    walk2: { x: 219, y: 194, rot: -6.6 },
    walk3: { x: 224, y: 193, rot: -7.98 },
    attack0: { x: 200, y: 220, rot: 34.3 },
    attack1: { x: 240, y: 157, rot: -51.83 },
    attack2: { x: 239, y: 156, rot: -52.75 },
    attack3: { x: 242, y: 152, rot: -49.93 }
  },
  female: {
    idle0: { x: 238, y: 180, rot: -5.41 },
    walk0: { x: 219, y: 192, rot: -9.33 },
    walk1: { x: 228, y: 190, rot: -9.86 },
    walk2: { x: 217, y: 202, rot: -12.17 },
    walk3: { x: 224, y: 199, rot: -11.81 },
    attack0: { x: 215, y: 212, rot: 32.69 },
    attack1: { x: 238, y: 152, rot: -49.69 },
    attack2: { x: 238, y: 155, rot: -47.43 },
    attack3: { x: 242, y: 155, rot: -43.74 }
  }
};

/** 자세 키(`walk0`~`walk3`, `attack0`~`attack3`, `idle0`). */
export function bowPoseKey(motion: BowMotion, frame: number): string {
  if (motion === 'idle') return 'idle0';
  const index = Number.isFinite(frame) ? ((Math.trunc(frame) % 4) + 4) % 4 : 0;
  return `${motion}${index}`;
}

/** 자세별 파츠 배치. 표에 없는 키는 idle 로 폴백한다. */
export function bowPose(gender: Gender, motion: BowMotion, frame: number): BowPose {
  const table = BOW_POSES[gender] ?? BOW_POSES.male;
  return table[bowPoseKey(motion, frame)] ?? table.idle0;
}

/** 파츠 PNG 경로. 인덱스가 1~9 밖이면 undefined(0번은 본체 시트에 그려져 있다). */
export function bowPartPath(index: number): string | undefined {
  if (!Number.isInteger(index) || index < 1 || index >= BOW_COUNT) return undefined;
  return pilotSheet(`${BOW_ROOT}/bow_${index}_v1.png`);
}

/** 장비를 바꿀 때 미리 받을 파츠. 티어당 1장이다. */
export function bowPartPaths(index: number): string[] {
  const path = bowPartPath(index);
  return path ? [path] : [];
}

/** 파츠 캐시에 남겨 두는 티어 수. */
export const bowTierCacheLimit = 3;

/** 장비창·필드가 쓰는 착용 활 인덱스. 활이 아니거나 미착용이면 0. */
export function bowIndexFor(save: Save): number {
  const item = save.equipment.weapon;
  if (!item || !isBow(item)) return 0;
  const index = bowIndex(item);
  return Number.isInteger(index) && index >= 0 && index < BOW_COUNT ? index : 0;
}

/** 기본 활을 지운 본체 시트를 써야 하는가(= 0번이 아닌 활을 찼는가). */
export function usesBowlessBody(save: Save): boolean {
  // [작업 216] 활을 안 찼어도 기본 활대를 지운 판(`nobow/`)을 쓴다.
  return bowIndexFor(save) >= 1 || hasNoWeapon(save);
}

/** 기본 활대를 지운 궁수 본체 시트 경로. */
export function bowlessBodyPath(gender: Gender, motion: BowMotion): string {
  return pilotSheet(`${NOBOW_ROOT}/archer_${gender}_${motion}_v1.png`);
}

/** 본체 시트 6장(서기·걷기·사격). */
export function bowlessBodyPaths(gender: Gender): string[] {
  return bowMotionList.map(motion => bowlessBodyPath(gender, motion));
}
