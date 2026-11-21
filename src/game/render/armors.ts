import type { Gender, Save } from '../store';
import { baseItemIndex } from '../items';
import { PILOT_ASSET_VERSION, pilotSheet } from './pilotAssets';

/**
 * 착용 갑옷 10종의 전신 시트 (작업 155).
 *
 * `baseItems.armor` 0~9번(가죽 조끼 ~ 패왕의 전갈)마다 서기 1장·걷기 4프레임·공격 4프레임을
 * 남녀 각각 만들었고, 투구를 쓸 때 그대로 쓰는 **머리 없는 시트**(`armors/headless/`)도 같은
 * 구성으로 둔다. 모든 PNG 는 기준 시트(`pilot-25d/warrior_{성별}_{동작}_v1.png`)와 **같은 셀
 * 좌표계**(`idle` 362×362, `walk`·`attack` 1448×362 = 362px 셀 4개)다. 그래서 투구 앵커·
 * 무기 소켓·발 피벗·`heroBodyPx` 배율표를 갑옷마다 새로 잴 필요가 없다.
 *
 * 갑옷을 벗은 상태(`armorIndex < 0`)는 예전처럼 기준 시트를 쓴다.
 */
export type ArmorMotion = 'idle' | 'walk' | 'attack';

/** 갑옷 기본형 개수(`baseItems.armor`). */
export const ARMOR_COUNT = 10;

export const armorMotionList: readonly ArmorMotion[] = ['idle', 'walk', 'attack'];

const ARMOR_ROOT = '/assets/pilot-25d/armors';
/** 기본 검을 지운 같은 시트(작업 156). 셀 좌표계·파일명 규칙이 같고 폴더만 다르다. */
const SWORDLESS_ARMOR_ROOT = '/assets/pilot-25d/noweapon/armors';

/**
 * pilot-25d 시트 배포본 버전 (작업 222 → 227).
 *
 * `/assets/*`가 1년 불변(`immutable`) 캐시라 URL 를 바꾸지 않으면 브라우저가 옛 그림을 계속 쓴다.
 * 작업 222는 서기 시트만 다시 구워 서기(`idle`) 경로에만 버전을 붙였고, 작업 227은 알파 채널을
 * 고치며 걷기·공격·파츠까지 모두 바뀌었으므로 **모든 pilot-25d 경로**에 버전을 붙인다
 * (`render/pilotAssets.ts`의 `PILOT_ASSET_VERSION` 하나가 기준 — `render.ts`·`weapons.ts`·
 * `helmets.ts`·`equipmentPortrait.ts`도 같은 값을 쓴다).
 */
export const WARRIOR_IDLE_ASSET_VERSION = PILOT_ASSET_VERSION;


/**
 * 갑옷 시트 경로. 인덱스가 범위를 벗어나면 `undefined`(호출부는 기준 시트로 폴백).
 *
 * 파일명은 `warrior_{성별}_armor_{인덱스}_{동작}_v1.png` 이고, 투구용 머리 없는 시트만
 * `headless/` 아래 같은 이름으로 들어간다(작업 152의 `headless/` 규칙과 같다).
 */
export function armorSheetPath(
  gender: Gender, index: number, motion: ArmorMotion, headless = false, swordless = false
): string | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= ARMOR_COUNT) return undefined;
  if (!armorMotionList.includes(motion)) return undefined;
  const root = swordless ? SWORDLESS_ARMOR_ROOT : ARMOR_ROOT;
  const directory = headless ? `${root}/headless` : root;
  return pilotSheet(`${directory}/warrior_${gender}_armor_${index}_${motion}_v1.png`);
}

/** 한 티어의 시트 6장(서기·걷기·공격 × 전신·머리 없음). 장비를 바꿀 때 미리 받는다. */
export function armorSheetPaths(gender: Gender, index: number, swordless = false): string[] {
  const paths: string[] = [];
  for (const motion of armorMotionList) {
    for (const headless of [false, true]) {
      const path = armorSheetPath(gender, index, motion, headless, swordless);
      if (path) paths.push(path);
    }
  }
  return paths;
}

/** 장비창·필드가 쓰는 착용 갑옷 인덱스. 갑옷이 없으면 -1(기준 시트). */
export function armorIndexFor(save: Save): number {
  const item = save.equipment.armor;
  if (!item) return -1;
  const index = baseItemIndex(item);
  return Number.isInteger(index) && index >= 0 && index < ARMOR_COUNT ? index : -1;
}

/** 시트 안에서 쓸 프레임. 서기는 1장, 걷기·공격은 4프레임을 8프레임 재생에 맞춰 돌려 쓴다. */
export function armorFrameIndex(motion: ArmorMotion, frame: number): number {
  if (motion === 'idle') return 0;
  return Number.isFinite(frame) ? ((Math.trunc(frame) % 4) + 4) % 4 : 0;
}

/** 텍스처 캐시 키(성별·인덱스·동작·머리 없음). */
export function armorSheetKey(gender: Gender, index: number, motion: ArmorMotion, headless: boolean): string {
  return `${gender}:${index}:${motion}${headless ? ':headless' : ''}`;
}
