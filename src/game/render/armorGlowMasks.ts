import type { Gender, Save } from '../store';
import { jobOrDefault } from '../skills';
import { armorGlowSheetPath, armorIndexFor } from './armors';
import { archerArmorGlowSheetPath, archerArmorIndexFor } from './archerArmors';
import { mageRobeIndexFor, robeGlowSheetPath } from './robes';
import { pilotSheet } from './pilotAssets';

/**
 * 갑옷·로브 발광 마스크 (작업 257).
 *
 * 갑옷은 몸 시트에 **함께** 그려진다(전사 판금·궁수 조끼·마법사 로브, 그리고 0번 갑옷일 때의
 * 스타터 시트). 등급색 발광을 몸 시트에 그대로 얹으면 얼굴·머리카락·맨팔·무기·부츠까지 함께
 * 빛나 사용자가 \"갑옷만 빛나야 한다\"고 정리한 1안과 어긋난다. 그래서 부위별로 **갑옷 픽셀만**
 * 담은 알파 마스크 시트를 따로 굽고(`scripts/build-armor-glow-masks.py`), 필드와 장착 화면이
 * 그 마스크로 발광을 잘라 낸다.
 *
 * 마스크 시트는 원본 시트와 **같은 파일명·같은 셀 좌표계**(서기 362×362, 걷기·공격 1448×362)라
 * 같은 앵커·배율·프레임 번호를 그대로 쓴다.
 */
export type ArmorGlowMotion = 'idle' | 'walk' | 'attack';

/** 스타터 시트(갑옷 0번 = 기본 옷)의 발광 마스크 경로. */
export function starterGlowSheetPath(job: 'archer' | 'mage', gender: Gender, motion: ArmorGlowMotion): string {
  return pilotSheet(`/assets/pilot-25d/starter_glow/${job}_${gender}_${motion}_v1.png`);
}

/**
 * 지금 차림의 몸 시트에 대응하는 발광 마스크 시트 경로.
 *
 * 그리는 차림과 **같은 순서**로 고른다(`entities.drawHero` 와 같은 규칙):
 * 궁수는 1번 이상 갑옷이면 궁수 갑옷 시트, 0번·미착용이면 스타터 시트. 마법사는 1번 이상이면
 * 로브 시트, 0번·미착용이면 스타터 시트. 전사는 갑옷을 입었을 때만 갑옷 시트를 쓴다.
 *
 * 마스크가 없는 차림(전사 미착용 등)은 `undefined` — 그때는 빛날 장비도 없다(등급은 장비가 있다).
 */
export function armorGlowSheetFor(save: Save, motion: ArmorGlowMotion): string | undefined {
  const job = jobOrDefault(save.job);
  if (job === 'archer') {
    const tier = archerArmorIndexFor(save);
    return tier >= 1
      ? archerArmorGlowSheetPath(save.gender, tier, motion)
      : starterGlowSheetPath('archer', save.gender, motion);
  }
  if (job === 'mage') {
    const robe = mageRobeIndexFor(save);
    return robe >= 1
      ? robeGlowSheetPath(save.gender, robe, motion)
      : starterGlowSheetPath('mage', save.gender, motion);
  }
  const armor = armorIndexFor(save);
  return armor >= 0 ? armorGlowSheetPath(save.gender, armor, motion) : undefined;
}
