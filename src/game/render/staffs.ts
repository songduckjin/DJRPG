import type { Gender, Save } from '../store';
import { isStaff, staffIndex } from '../items';

/**
 * 착용 지팡이 10종 외형 파츠 (작업 201).
 *
 * `staffBases` 0~9번(견습생의 지팡이 ~ 대현자의 성지팡이)을 **본체 시트와 분리된 파츠 PNG**로 그린다.
 * 파츠는 기준 시트의 362px 셀 좌표계를 그대로 쓰고, 손이 지팡이를 쥔 그립 점을 축으로 자세마다
 * 회전·이동만 준다. 그래서 걷기 4프레임·공격 4프레임에서도 지팡이가 손에서 떨어지거나 길이가
 * 줄지 않는다(강체).
 *
 * 마법사 기본 시트에는 기본 지팡이(긴 고목 지팡이)가 그려져 있어, 1번 이상을 장착하면 본체는
 * 기본 지팡이를 지운 시트(`mage_nostaff/`)로 갈아 끼우고 그 위에 파츠를 얹는다. 두 시트는 셀
 * 좌표계가 같아 배율·앵커를 다시 잴 필요가 없다. 0번(견습생의 지팡이)도 같은 파츠를 쓰므로,
 * 짧은 완드를 들었을 때 뒤로 기본 긴 지팡이가 삐져나오지 않는다.
 *
 * 파츠는 `scripts/build-staff-parts.py`가 승인 시안(`tools/staff-src/`)에서 뜬다.
 * 전사 대검(`weapons.ts`)·궁수 활(`bows.ts`)과 같은 구조이며, 마법사 로브가 붙을 때도
 * `mage_nostaff/` 시트 위에 얹으면 된다.
 */
export type StaffMotion = 'idle' | 'walk' | 'attack';

/** 지팡이 기본형 개수(`staffBases`). */
export const STAFF_COUNT = 10;

export const staffMotionList: readonly StaffMotion[] = ['idle', 'walk', 'attack'];

const STAFF_ROOT = '/assets/pilot-25d/staffs';
const NOSTAFF_ROOT = '/assets/pilot-25d/mage_nostaff';

/** 지팡이 파츠·본체 시트는 이번에 새로 만든 파일이라 캐시 버스터 없이 그대로 캐시된다. */
export const STAFF_ASSET_VERSION = 1;

/**
 * 파츠 PNG 안에서 손이 지팡이를 쥔 그립 점. 모든 파츠가 같은 자리에 그립을 두고 그려졌으므로
 * 앵커는 하나이고, 자세마다 이 점의 셀 좌표와 회전각만 바뀐다(빌더 `REF_GRIP`).
 */
export const STAFF_GRIP = { x: 92, y: 114 } as const;

export type StaffPose = {
  /** 그립 점의 셀 좌표. */
  x: number;
  y: number;
  /** idle 대비 회전각(도). 화면 좌표(y 아래)에서 양수가 시계방향이다. */
  rot: number;
};

/**
 * 자세별 파츠 배치 — `scripts/build-staff-parts.py`의 `POSES`(머리·자루 끝·그립)에서 계산한 표를
 * 그대로 옮겼다(빌더 `--preview` 검수 이미지로 확인). `idle0` 은 파츠 PNG 자체의 자세라 회전 0이다.
 */
export const STAFF_POSES: Record<Gender, Record<string, StaffPose>> = {
  male: {
    idle0: { x: 93, y: 114, rot: -0.1 },
    walk0: { x: 116, y: 150, rot: 4.2 },
    walk1: { x: 121, y: 144, rot: 4.4 },
    walk2: { x: 116, y: 147, rot: 2.9 },
    walk3: { x: 120, y: 143, rot: 2.9 },
    attack0: { x: 201, y: 124, rot: 56.4 },
    attack1: { x: 186, y: 146, rot: 66.2 },
    attack2: { x: 147, y: 129, rot: 92.6 },
    attack3: { x: 256, y: 146, rot: 81.7 }
  },
  female: {
    idle0: { x: 113, y: 120, rot: -0.1 },
    walk0: { x: 128, y: 121, rot: -0.5 },
    walk1: { x: 128, y: 121, rot: 0.4 },
    walk2: { x: 127, y: 121, rot: 0.1 },
    walk3: { x: 126, y: 117, rot: -1.5 },
    attack0: { x: 227, y: 114, rot: 32.9 },
    attack1: { x: 105, y: 78, rot: 38.3 },
    attack2: { x: 83, y: 147, rot: 82.3 },
    attack3: { x: 268, y: 180, rot: -97.5 }
  }
};

/** 자세 키(`walk0`~`walk3`, `attack0`~`attack3`, `idle0`). */
export function staffPoseKey(motion: StaffMotion, frame: number): string {
  if (motion === 'idle') return 'idle0';
  const index = Number.isFinite(frame) ? ((Math.trunc(frame) % 4) + 4) % 4 : 0;
  return `${motion}${index}`;
}

/** 자세별 파츠 배치. 표에 없는 키는 idle 로 폴백한다. */
export function staffPose(gender: Gender, motion: StaffMotion, frame: number): StaffPose {
  const table = STAFF_POSES[gender] ?? STAFF_POSES.male;
  return table[staffPoseKey(motion, frame)] ?? table.idle0;
}

/** 파츠 PNG 경로. 0~9 밖이면 undefined. */
export function staffPartPath(index: number): string | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= STAFF_COUNT) return undefined;
  return `${STAFF_ROOT}/staff_${index}_v1.png`;
}

/** 장비를 바꿀 때 미리 받을 파츠. 티어당 1장이다. */
export function staffPartPaths(index: number): string[] {
  const path = staffPartPath(index);
  return path ? [path] : [];
}

/** 파츠 캐시에 남겨 두는 티어 수. */
export const staffTierCacheLimit = 3;

/** 장비창·필드가 쓰는 착용 지팡이 인덱스. 지팡이가 아니면 -1(파츠 없음). */
export function staffIndexFor(save: Save): number {
  const item = save.equipment.weapon;
  if (!item || !isStaff(item)) return -1;
  const index = staffIndex(item);
  return Number.isInteger(index) && index >= 0 && index < STAFF_COUNT ? index : -1;
}

/** 기본 지팡이를 지운 본체 시트를 써야 하는가(= 지팡이를 찼는가). */
export function usesStafflessBody(save: Save): boolean {
  return staffIndexFor(save) >= 0;
}

/** 기본 지팡이를 지운 마법사 본체 시트 경로. */
export function stafflessBodyPath(gender: Gender, motion: StaffMotion): string {
  return `${NOSTAFF_ROOT}/mage_${gender}_${motion}_v1.png`;
}

/** 본체 시트 6장(서기·걷기·공격). */
export function stafflessBodyPaths(gender: Gender): string[] {
  return staffMotionList.map(motion => stafflessBodyPath(gender, motion));
}
