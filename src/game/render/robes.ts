import type { Gender, Save } from '../store';
import { baseItemIndex, isMage } from '../items';

/**
 * 마법사 전용 로브 10종 전신 시트 (작업 201).
 *
 * `baseItems.armor` 0~9번이 마법사에게 장착되면 전사용 판금 갑옷이 아니라 이 로브로 보인다.
 * 0번(가죽 조끼)은 기준 시트(`pilot-25d/mage_{성별}_{동작}_v1.png`, 스타터 천 로브)를 그대로
 * 쓰고, 1~9번만 `robes/` 아래 시트를 둔다. 모든 PNG 는 기준 시트와 **같은 셀 좌표계**
 * (`idle` 362×362, `walk`·`attack` 1448×362 = 362px 셀 4개)라서 배율·앵커·`heroBodyPx`
 * 표를 새로 잴 필요가 없다.
 *
 * 마법사 지팡이는 아직 별도 파츠가 아니라 본체 시트에 그려져 있다(작업 198). 그래서 로브
 * 시트도 기준 시트의 지팡이를 그대로 유지한 채 옷만 바꾼 판본이다 — 지팡이 파츠 구조가
 * 들어오면 이 파일의 경로 규칙만 `nostaff` 쪽으로 바꾸면 된다.
 */
export type RobeMotion = 'idle' | 'walk' | 'attack';

/** 마법사 로브 기본형 개수(`baseItems.armor`와 같다). */
export const ROBE_COUNT = 10;

export const robeMotionList: readonly RobeMotion[] = ['idle', 'walk', 'attack'];

const ROBE_ROOT = '/assets/pilot-25d/robes';

/**
 * 로브 시트 경로. 0번(스타터 천 로브)은 기준 시트를 쓰므로 `undefined`.
 * 범위를 벗어난 인덱스도 `undefined`(호출부는 기준 시트로 폴백).
 */
export function robeSheetPath(gender: Gender, index: number, motion: RobeMotion): string | undefined {
  if (!Number.isInteger(index) || index < 1 || index >= ROBE_COUNT) return undefined;
  if (!robeMotionList.includes(motion)) return undefined;
  return `${ROBE_ROOT}/mage_${gender}_robe_${index}_${motion}_v1.png`;
}

/** 한 티어의 시트 3장(서기·걷기·공격). 장비를 바꿀 때 미리 받는다. */
export function robeSheetPaths(gender: Gender, index: number): string[] {
  const paths: string[] = [];
  for (const motion of robeMotionList) {
    const path = robeSheetPath(gender, index, motion);
    if (path) paths.push(path);
  }
  return paths;
}

/**
 * 마법사가 착용한 갑옷의 로브 인덱스(0~9). 마법사가 아니거나 갑옷이 없으면 -1(기준 시트).
 * 0번은 기준 시트(스타터 로브)와 같은 옷이라 시트를 따로 받지 않는다.
 */
export function mageRobeIndexFor(save: Save): number {
  if (!isMage(save)) return -1;
  const item = save.equipment.armor;
  if (!item) return -1;
  const index = baseItemIndex(item);
  return Number.isInteger(index) && index >= 0 && index < ROBE_COUNT ? index : -1;
}

/** 로브 시트가 따로 있는 티어인지(1~9번). 0번은 기준 시트를 쓴다. */
export function hasRobeSheet(index: number): boolean {
  return Number.isInteger(index) && index >= 1 && index < ROBE_COUNT;
}

/** 시트 안에서 쓸 프레임. 서기는 1장, 걷기·공격은 4프레임을 8프레임 재생에 맞춰 돌려 쓴다. */
export function robeFrameIndex(motion: RobeMotion, frame: number): number {
  if (motion === 'idle') return 0;
  return Number.isFinite(frame) ? ((Math.trunc(frame) % 4) + 4) % 4 : 0;
}

/** 텍스처 캐시 키(성별·인덱스·동작). */
export function robeSheetKey(gender: Gender, index: number, motion: RobeMotion): string {
  return `${gender}:${index}:${motion}`;
}
