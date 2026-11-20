import type { Gender, Save } from '../store';
import { baseItemIndex, isBow } from '../items';

/**
 * 착용 대검 10종 외형 파츠 (작업 156).
 *
 * `baseItems.weapon` 0~9번(두손검 ~ 패왕의 성검)을 **본체 시트와 분리된 파츠 PNG**로 그린다.
 * 파츠는 기준 시트의 362px 셀 좌표계를 그대로 쓰고, 손잡이(가드) 점을 축으로 자세마다
 * 회전·이동만 준다. 그래서 걷기 4프레임·공격 4프레임에서도 칼이 손에서 떨어지거나 길이가
 * 줄지 않는다(강체).
 *
 * 0번(기본 두손검)은 본체 시트에 이미 그려져 있으므로 파츠를 쓰지 않는다. 1번 이상을 장착하면
 * 본체는 기본 검을 지운 시트(`noweapon/`)로 갈아 끼우고 그 위에 파츠를 얹는다. 두 시트는
 * 셀 좌표계가 같아 배율·앵커·무기 소켓·투구 앵커를 다시 잴 필요가 없다.
 *
 * 파츠는 `scripts/build-weapon-parts.py`가 승인 시안(`tools/weapon-src/`)에서 뜬다.
 */
export type WeaponMotion = 'idle' | 'walk' | 'attack';

/** 무기 기본형 개수(`baseItems.weapon`). */
export const WEAPON_COUNT = 10;

export const weaponMotionList: readonly WeaponMotion[] = ['idle', 'walk', 'attack'];

const WEAPON_ROOT = '/assets/pilot-25d/weapons';
const NOWEAPON_ROOT = '/assets/pilot-25d/noweapon';

/**
 * 파츠 PNG 안에서 손잡이(가드) 점. 모든 파츠가 같은 자리에 손잡이를 두고 그려졌으므로
 * 앵커는 하나이고, 자세마다 이 점의 셀 좌표와 회전각만 바뀐다(빌더 `MALE_POSE`의 idle0).
 */
export const WEAPON_GUARD = { x: 197.2, y: 220.7 } as const;

export type WeaponPose = {
  /** 가드 점의 셀 좌표. */
  x: number;
  y: number;
  /** idle 대비 회전각(도). 화면 좌표(y 아래)에서 양수가 시계방향이다. */
  rot: number;
};

/**
 * 자세별 파츠 배치 — `scripts/build-weapon-parts.py`가 기준 시트에서 측정해 만든 표를 그대로
 * 옮겼다(빌더 `--preview` 검수 이미지로 확인). `idle0` 은 파츠 PNG 자체의 자세라 회전 0이다.
 */
export const WEAPON_POSES: Record<Gender, Record<string, WeaponPose>> = {
  male: {
    idle0: { x: 197.2, y: 220.7, rot: 0 },
    walk0: { x: 192.2, y: 208.1, rot: 1.5 },
    walk1: { x: 192.8, y: 206.2, rot: 2 },
    walk2: { x: 196.7, y: 208.6, rot: 3.49 },
    walk3: { x: 198.7, y: 204.6, rot: 3.49 },
    attack0: { x: 133, y: 117, rot: -2.06 },
    attack1: { x: 160, y: 62, rot: 12.39 },
    attack2: { x: 247, y: 207, rot: -93.12 },
    attack3: { x: 240, y: 272, rot: -99.9 }
  },
  female: {
    idle0: { x: 198, y: 219.6, rot: -0.31 },
    walk0: { x: 201.3, y: 207.8, rot: 3.17 },
    walk1: { x: 200.5, y: 207.7, rot: 3.94 },
    walk2: { x: 198.3, y: 209.1, rot: 4.03 },
    walk3: { x: 201.8, y: 212.5, rot: 5.99 },
    attack0: { x: 129.3, y: 113.4, rot: -7.98 },
    attack1: { x: 148.5, y: 38.1, rot: -1.32 },
    attack2: { x: 243.2, y: 191.4, rot: -90.39 },
    attack3: { x: 232.7, y: 267.4, rot: -100.46 }
  }
};

/** 자세 키(`walk0`~`walk3`, `attack0`~`attack3`, `idle0`). */
export function weaponPoseKey(motion: WeaponMotion, frame: number): string {
  if (motion === 'idle') return 'idle0';
  const index = Number.isFinite(frame) ? ((Math.trunc(frame) % 4) + 4) % 4 : 0;
  return `${motion}${index}`;
}

/** 자세별 파츠 배치. 표에 없는 키는 idle 로 폴백한다. */
export function weaponPose(gender: Gender, motion: WeaponMotion, frame: number): WeaponPose {
  const table = WEAPON_POSES[gender] ?? WEAPON_POSES.male;
  return table[weaponPoseKey(motion, frame)] ?? table.idle0;
}

/** 파츠 PNG 경로. 인덱스가 1~9 밖이면 undefined(0번은 본체 시트에 그려져 있다). */
export function weaponPartPath(index: number): string | undefined {
  if (!Number.isInteger(index) || index < 1 || index >= WEAPON_COUNT) return undefined;
  return `${WEAPON_ROOT}/weapon_${index}_v1.png`;
}

/** 장비를 바꿀 때 미리 받을 파츠. 티어당 1장이다. */
export function weaponPartPaths(index: number): string[] {
  const path = weaponPartPath(index);
  return path ? [path] : [];
}

/** 파츠 캐시에 남겨 두는 티어 수. */
export const weaponTierCacheLimit = 3;

/** 장비창·필드가 쓰는 착용 무기 인덱스. 파츠가 없는 0번·미착용은 0. */
export function weaponIndexFor(save: Save): number {
  const item = save.equipment.weapon;
  if (!item) return 0;
  // 활은 대검 파츠가 없다 — 이번 단게에서 궁수는 기본 시트만 그린다(작업 157).
  if (isBow(item)) return 0;
  const index = baseItemIndex(item);
  return Number.isInteger(index) && index >= 0 && index < WEAPON_COUNT ? index : 0;
}

/** 기본 검을 지운 본체 시트를 써야 하는가(= 0번이 아닌 검을 찼는가). */
export function usesSwordlessBody(save: Save): boolean {
  return weaponIndexFor(save) >= 1;
}

/**
 * 기본 검을 지운 본체 시트 경로(갑옷을 입지 않은 상태). 갑옷 시트의 같은 판은
 * `armorSheetPath(..., swordless)` 가 `noweapon/armors/` 아래에서 찾는다.
 */
export function swordlessBodyPath(gender: Gender, motion: WeaponMotion, headless = false): string {
  const sub = headless ? 'headless/' : '';
  return `${NOWEAPON_ROOT}/${sub}warrior_${gender}_${motion}_v1.png`;
}

/** 갑옷 없이 쓰는 noweapon 시트 6장(서기·걷기·공격 × 전신·머리 없음). */
export function swordlessBodyPaths(gender: Gender): string[] {
  const paths: string[] = [];
  for (const motion of weaponMotionList) {
    for (const headless of [false, true]) paths.push(swordlessBodyPath(gender, motion, headless));
  }
  return paths;
}
