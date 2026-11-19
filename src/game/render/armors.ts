import type { Gender, Save } from '../store';
import { baseItemIndex } from '../items';

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

/**
 * 갑옷 시트 경로. 인덱스가 범위를 벗어나면 `undefined`(호출부는 기준 시트로 폴백).
 *
 * 파일명은 `warrior_{성별}_armor_{인덱스}_{동작}_v1.png` 이고, 투구용 머리 없는 시트만
 * `headless/` 아래 같은 이름으로 들어간다(작업 152의 `headless/` 규칙과 같다).
 */
export function armorSheetPath(
  gender: Gender, index: number, motion: ArmorMotion, headless = false
): string | undefined {
  if (!Number.isInteger(index) || index < 0 || index >= ARMOR_COUNT) return undefined;
  if (!armorMotionList.includes(motion)) return undefined;
  const directory = headless ? `${ARMOR_ROOT}/headless` : ARMOR_ROOT;
  return `${directory}/warrior_${gender}_armor_${index}_${motion}_v1.png`;
}

/** 한 티어의 시트 6장(서기·걷기·공격 × 전신·머리 없음). 장비를 바꿀 때 미리 받는다. */
export function armorSheetPaths(gender: Gender, index: number): string[] {
  const paths: string[] = [];
  for (const motion of armorMotionList) {
    for (const headless of [false, true]) {
      const path = armorSheetPath(gender, index, motion, headless);
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
