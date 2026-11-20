import type { Gender, Save } from '../store';
import { baseItemIndex, isArcher } from '../items';
import { pilotSheet } from './pilotAssets';

/**
 * 궁수 갑옷 10종의 전신 시트 (작업 160).
 *
 * `baseItems.armor` 0~9번(가죽 조끼 ~ 패왕의 전갑)을 **궁수 몸**으로 다시 그린 시트다.
 * 0번(가죽 조끼)은 궁수 스타터 시트(`pilot-25d/archer_{성별}_{동작}_v1.png`)가 이미 그 차림이라
 * 새 파일을 두지 않고, 1~9번만 `pilot-25d/archer_armors/` 아래에 둔다.
 *
 * 규격은 전사 갑옷(작업 155)과 같다 — 기준 시트(`archer_{성별}_{동작}_v1.png`)와 **같은 셀
 * 좌표계**(서기 362×362, 걷기·사격 1448×362 = 362px 셀 4개)라서 발 피벗·`heroBodyPx` 배율표·
 * 활 파츠 앵커를 갑옷마다 다시 잴 필요가 없다. 모든 PNG 는 256색 팔레트 + 투명 인덱스 0 이다.
 *
 * 전사 갑옷·투구·대검과는 폴더·함수를 완전히 나눠 두어, 궁수가 전사 외형을 절대 물려받지 않게 한다.
 */
export type ArcherArmorMotion = 'idle' | 'walk' | 'attack';

/** 갑옷 기본형 개수(`baseItems.armor`). */
export const ARCHER_ARMOR_COUNT = 10;

export const archerArmorMotionList: readonly ArcherArmorMotion[] = ['idle', 'walk', 'attack'];

const ARCHER_ARMOR_ROOT = '/assets/pilot-25d/archer_armors';
/** 기본 활대를 지운 같은 시트(활 10종 작업과 호환). 셀 좌표계·파일명 규칙이 같고 폴더만 다르다. */
const BOWLESS_ARCHER_ARMOR_ROOT = '/assets/pilot-25d/archer_armors/nobow';

/**
 * 궁수 갑옷 시트 경로. 0번(스타터 가죽 조끼)·범위 밖은 `undefined` 이고, 그때는 스타터 시트
 * (`/assets/pilot-25d/archer_{성별}_{동작}_v1.png`)를 쓴다.
 *
 * - `bowless`: 1번 이상 활(파츠)을 찼을 때 쓰는 **기본 활대를 지운 판**(`archer_armors/nobow/`).
 *   궁수 갑옷 시트에는 0번 기본 활이 그려져 있어, 고급 활 파츠를 얹으면 뒤에 기본 활이 겹쳐 보인다.
 * - `headless`: 궁수 투구(작업 200)를 썼을 때 쓰는 **머리·머리카락을 지운 판**(`headless/`).
 *   투구 파츠가 얼굴·머리카락까지 함께 그려져 있어, 그 자리를 비워야 머리카락이 비치지 않는다.
 *
 * 두 판은 겹칠 수 있다(`nobow/headless/`). 셋 다 셀 좌표계가 같아 앵커를 다시 재지 않는다.
 */
export function archerArmorSheetPath(
  gender: Gender, index: number, motion: ArcherArmorMotion, bowless = false, headless = false
): string | undefined {
  if (!Number.isInteger(index) || index < 1 || index >= ARCHER_ARMOR_COUNT) return undefined;
  if (!archerArmorMotionList.includes(motion)) return undefined;
  const root = bowless ? BOWLESS_ARCHER_ARMOR_ROOT : ARCHER_ARMOR_ROOT;
  const directory = headless ? `${root}/headless` : root;
  return pilotSheet(`${directory}/archer_${gender}_armor_${index}_${motion}_v1.png`);
}

/** 한 티어의 시트 3장(서기·걷기·사격). 장비를 바꿀 때 미리 받는다. */
export function archerArmorSheetPaths(
  gender: Gender, index: number, bowless = false, headless = false
): string[] {
  const paths: string[] = [];
  for (const motion of archerArmorMotionList) {
    const path = archerArmorSheetPath(gender, index, motion, bowless, headless);
    if (path) paths.push(path);
  }
  return paths;
}

/** 한 티어의 네 가지 판(전신·머리 지움 × 활 그림·활 지움). 캐시에서 함께 내린다. */
export function archerArmorTierSheets(gender: Gender, index: number): string[] {
  return [
    ...archerArmorSheetPaths(gender, index),
    ...archerArmorSheetPaths(gender, index, true),
    ...archerArmorSheetPaths(gender, index, false, true),
    ...archerArmorSheetPaths(gender, index, true, true)
  ];
}

/**
 * 필드·장비창이 쓰는 궁수 갑옷 인덱스.
 * 궁수가 아니거나 갑옷이 없으면 -1(스타터 시트), 0번은 0(역시 스타터 시트)이며 1~9만 시트가 있다.
 */
export function archerArmorIndexFor(save: Save): number {
  if (!isArcher(save)) return -1;
  const item = save.equipment.armor;
  if (!item) return -1;
  const index = baseItemIndex(item);
  return Number.isInteger(index) && index >= 0 && index < ARCHER_ARMOR_COUNT ? index : -1;
}

/** 시트 안에서 쓸 프레임. 서기는 1장, 걷기·사격은 4프레임을 8프레임 재생에 맞춰 돌려 쓴다. */
export function archerArmorFrameIndex(motion: ArcherArmorMotion, frame: number): number {
  if (motion === 'idle') return 0;
  return Number.isFinite(frame) ? ((Math.trunc(frame) % 4) + 4) % 4 : 0;
}

/** 텍스처 캐시 키(성별·인덱스·동작). */
export function archerArmorSheetKey(
  gender: Gender, index: number, motion: ArcherArmorMotion, bowless = false, headless = false
): string {
  return `archer:${gender}:${index}:${motion}${bowless ? ':nobow' : ''}${headless ? ':headless' : ''}`;
}
