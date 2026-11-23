import { preferences } from './preferences';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import type { Effect, Enemy, Coin, Drop, HeroAfterimage } from './world';
import type { CombatEngine } from './combat/engine';
import type { LootView } from './render/drops';
import { wearableAssetPaths, type Slot } from './items';
import { drawRunes, drawTerrain, drawDust, drawLighting, drawVignette } from './render/field';
import { drawHero, updateAfterimages, updateCorpses, drawEntities } from './render/entities';
import { createCostumeHeroState, type CostumeHeroState } from './render/costumeHero';
import { drawSkillVfx, drawDragon, drawHit, drawEnemyStrike, updateDamageLabels, drawDeath, drawEffects } from './render/vfx';
import { drawLoot } from './render/drops';
import type { LootDrop } from './loot';
import { projectArenaPoint } from './arena';
import { createBootProgress } from './bootProgress';
import { helmetArtList, helmetArtPaths, helmetAttackArtList, helmetAttackArtPaths, headlessBodyPaths } from './render/helmets';
import { armorFrameIndex, armorSheetPath, armorSheetPaths, type ArmorMotion } from './render/armors';
import { robeFrameIndex, robeHeadlessSheetPath, robeSheetPath, robeSheetPaths, type RobeMotion } from './render/robes';
import {
  ARCHER_ARMOR_COUNT, archerArmorSheetPath, archerArmorSheetPaths, archerArmorTierSheets, type ArcherArmorMotion
} from './render/archerArmors';
import {
  weaponPartPath, weaponPartPaths, weaponTierCacheLimit, swordlessBodyPath, swordlessBodyPaths
} from './render/weapons';
import { bowPartPath, bowPartPaths, bowTierCacheLimit, bowlessBodyPath, type BowMotion } from './render/bows';
import {
  staffPartPath, staffPartPaths, staffTierCacheLimit, stafflessBodyPath, type StaffMotion
} from './render/staffs';
import { archerHeadlessBodyPath, archerHeadlessBodyPaths, archerHelmPartPaths } from './render/archerHelmets';
import {
  mageHeadlessBodyPath, mageHeadlessBodyPaths, mageHelmPartPaths, type MageHelmMotion
} from './render/mageHelmets';
import type { Gender } from './store';
import { pilotSheet } from './render/pilotAssets';

const paths = {
  floor: '/assets/wasteland-ground.png', terrainProps: '/assets/wasteland-props.png', male: '/assets/warrior_male_base.png',
  pilotMale: pilotSheet('/assets/pilot-25d/warrior_male_idle_v1.png'), pilotFemale: pilotSheet('/assets/pilot-25d/warrior_female_idle_v1.png'),
  // 궁수 기본 시트(작업 157 → 159 스타터 가죽 튜닉) — 같은 362px 셀 좌표계다. 갑옷·투구·활 오버레이는 이번 단계에 없다.
  // `/assets/*`는 immutable 캐시라 시트를 갈면 URL을 바꿔야 브라우저가 즉시 새 그림을 받는다(작업 159).
  archerMale: pilotSheet('/assets/pilot-25d/archer_male_idle_v1.png'), archerFemale: pilotSheet('/assets/pilot-25d/archer_female_idle_v1.png'),
  // 마법사 기본 시트(작업 198) — 같은 362px 셀 좌표계다. 갑옷·투구·지팡이 오버레이는 이번 단계에 없다.
  // 작업 204: 남성 서기 시트를 정수리 잘림 없이 다시 구워 `/assets/*` 불변 캐시를 피하려고 `?v=2`를 쓴다
  // (작업 159 궁수 시트와 같은 규칙 — 여성도 같은 줄에서 함께 올린다).
  mageMale: pilotSheet('/assets/pilot-25d/mage_male_idle_v1.png'), mageFemale: pilotSheet('/assets/pilot-25d/mage_female_idle_v1.png'),
  // 투구 착용 시에만 쓰는 머리 없는 본체(작업 152) — 같은 셀 좌표계라 배율·앵커를 공유한다.
  // [작업 229] 서기 시트를 222 이전 그립으로 되돌렸다 — 버전은 `PILOT_ASSET_VERSION` 하나(현재 4).
  pilotMaleHeadless: headlessBodyPaths.male.idle, pilotFemaleHeadless: headlessBodyPaths.female.idle,
  female: '/assets/warrior_female_base.png', armored: '/assets/warrior_armored_swordless.png',
  armoredNoHelm: '/assets/warrior_armored_nohelm_swordless.png', femaleArmoredNoHelm: '/assets/warrior_female_armored_nohelm_swordless.png',
  femaleArmoredHelm: '/assets/warrior_female_armored_helm_swordless.png',
  femaleBaseHelm: '/assets/warrior_female_base_helm.png', femaleSwordHelm: '/assets/warrior_female_sword_helm.png',
  femaleArmoredOldHelm: '/assets/warrior_female_armored_oldhelm_swordless.png',
  femaleBaseOldHelm: '/assets/warrior_female_base_oldhelm.png', femaleSwordOldHelm: '/assets/warrior_female_sword_oldhelm.png',
  maleBaseHelm: '/assets/warrior_male_base_helm.png', maleSwordHelm: '/assets/warrior_male_sword_helm.png',
  maleSword: '/assets/warrior_male_sword.png', femaleSword: '/assets/warrior_female_sword.png',
  skeleton: '/assets/skeleton_warrior.png', boss: '/assets/skeleton_boss.png',
  fxDragonHead: '/assets/fx_dragon_head.png?v=2', fxDragonBody: '/assets/fx_dragon_body.png?v=2', fxSlam: '/assets/fx_wild_stamp_lava_v2.png', fxCrushing: '/assets/fx_wild_stamp.png',
  fxRage: '/assets/fx_blood_rage.png', fxFlame: '/assets/fx_rage_flame_v1.png', fxRageGlow: '/assets/fx_rage_glow_v1.png',
  fxSlash: '/assets/fx_slash_arc.png',
  fxArcherArrow: '/assets/fx_archer_arrow_v1.png?v=1', fxIceArrow: '/assets/fx_ice_arrow_v1.png?v=1',
  fxMageFireball: '/assets/fx_mage_fireball_v2.png',
  fxHawkEagle: '/assets/fx_hawkeye_eagle_v1.png?v=1',
  fxPower: '/assets/fx_power_strike_cleave_v2.png', fxDestroy: '/assets/fx_destroy_swing.png', fxHell: '/assets/fx_hell_fire.png',
  // [작업 215] 회전참격(`hell`) 혈풍 회오리 — 확정 3번 시안(암흑·진홍)을 위에서 내려다본 한 장.
  // 새 파일명이라 `/assets/*` immutable 캐시에 걸리지 않는다. add 블렌딩용 검정 배경.
  fxWhirl: '/assets/fx_whirl_slash_ring.png',
  // [작업 157] 휘두르기(1번) 확정 시안 — 은빛 검기 + 황금빛 지면 충격파, 검정 배경 add 블렌딩용.
  fxSlash2: '/assets/fx_slash2.png', fxSlash2Ground: '/assets/fx_slash2_ground.png',
  // [작업 213] 이단참(좌우 횡베기 2연격) — 1타 정방향·2타 되받아 베기에 같은 검기를 좌우 반전해 쓴다.
  // `/assets/*`는 immutable 이라 새 파일명으로 배포한다(같은 경로 교체 금지).
  fxSlash2Dual: '/assets/fx_slash2_dual.png'
} as const;
export type Art = keyof typeof paths;
const animationPaths = {
  maleAttack: Array.from({ length: 4 }, (_, i) => `/assets/warrior_male_attack_${i + 1}.png`),
  femaleAttack: Array.from({ length: 4 }, (_, i) => `/assets/warrior_female_attack_${i + 1}.png`),
  armoredAttack: Array.from({ length: 4 }, (_, i) => `/assets/warrior_armored_attack_${i + 1}.png?v=2`),
  armoredNoHelmAttack: Array.from({ length: 4 }, (_, i) => `/assets/warrior_armored_nohelm_attack_${i + 1}.png?v=2`)
};
// One row of four poses, each in its own cell of equal width. The cells are wider than
// 870/4 so no sword tip or foot reaches into the neighbouring frame. The sheet height
// stays 290 px, which is what heroScale.ts measures a body height against.
const attackSheets = {
  pilotMaleAttack: pilotSheet('/assets/pilot-25d/warrior_male_attack_v1.png'),
  pilotFemaleAttack: pilotSheet('/assets/pilot-25d/warrior_female_attack_v1.png'),
  archerMaleAttack: pilotSheet('/assets/pilot-25d/archer_male_attack_v1.png'),
  archerFemaleAttack: pilotSheet('/assets/pilot-25d/archer_female_attack_v1.png'),
  mageMaleAttack: pilotSheet('/assets/pilot-25d/mage_male_attack_v1.png'),
  mageFemaleAttack: pilotSheet('/assets/pilot-25d/mage_female_attack_v1.png'),
  pilotMaleAttackHeadless: headlessBodyPaths.male.attack,
  pilotFemaleAttackHeadless: headlessBodyPaths.female.attack,
  femaleArmoredNoHelmAttack: '/assets/warrior_female_armored_attack.png?v=3',
  femaleArmoredHelmAttack: '/assets/warrior_female_armored_helm_attack.png?v=3',
  femaleHelmAttack: '/assets/warrior_female_helm_attack.png?v=3',
  femaleArmoredOldHelmAttack: '/assets/warrior_female_armored_oldhelm_attack.png?v=3',
  femaleOldHelmAttack: '/assets/warrior_female_oldhelm_attack.png?v=3',
  maleHelmAttack: '/assets/warrior_male_helm_attack.png?v=3'
} as const;
const walkSheets = {
  pilotMaleWalk: pilotSheet('/assets/pilot-25d/warrior_male_walk_v1.png'),
  pilotFemaleWalk: pilotSheet('/assets/pilot-25d/warrior_female_walk_v1.png'),
  archerMaleWalk: pilotSheet('/assets/pilot-25d/archer_male_walk_v1.png'),
  archerFemaleWalk: pilotSheet('/assets/pilot-25d/archer_female_walk_v1.png'),
  mageMaleWalk: pilotSheet('/assets/pilot-25d/mage_male_walk_v1.png'),
  mageFemaleWalk: pilotSheet('/assets/pilot-25d/mage_female_walk_v1.png'),
  pilotMaleWalkHeadless: headlessBodyPaths.male.walk,
  pilotFemaleWalkHeadless: headlessBodyPaths.female.walk,
  maleBaseWalk: '/assets/walk8_male_base.png', femaleBaseWalk: '/assets/walk8_female_base.png',
  maleBaseHelmWalk: '/assets/walk8_male_base_helm.png',
  femaleBaseHelmWalk: '/assets/walk8_female_base_helm.png',
  femaleBaseOldHelmWalk: '/assets/walk8_female_base_oldhelm.png',
  maleWalk: '/assets/walk8_male_sword.png', femaleWalk: '/assets/walk8_female.png',
  maleHelmWalk: '/assets/walk8_male_sword_helm.png',
  femaleHelmWalk: '/assets/walk8_female_sword_helm.png',
  femaleOldHelmWalk: '/assets/walk8_female_sword_oldhelm.png',
  armoredWalk: '/assets/walk8_armored_swordless.png', armoredNoHelmWalk: '/assets/walk8_armored_nohelm_swordless.png',
  femaleArmoredNoHelmWalk: '/assets/walk8_female_armored_nohelm_swordless.png',
  femaleArmoredHelmWalk: '/assets/walk8_female_armored_helm_swordless.png',
  femaleArmoredOldHelmWalk: '/assets/walk8_female_armored_oldhelm_swordless.png',
  skeletonWalk: '/assets/walk8_skeleton.png', bossWalk: '/assets/walk8_boss.png'
} as const;
type Animation = keyof typeof animationPaths | keyof typeof attackSheets | keyof typeof walkSheets;

/**
 * 갑옷 시트를 프레임 텍스처로 자른다(작업 155).
 *
 * 갑옷 시트는 기준 시트와 같은 규격(362px 셀)이라 자르는 규칙도 필드와 같다: `idle` 은 한 장,
 * `walk`·`attack` 은 가로 4칸을 한 줄로 쓴다. 옆 칸 그림자가 섞이지 않도록 칸 경계를 정확히
 * 나누며, 프레임 조회는 `armorFrameIndex`(0~3 반복)로 한다.
 */
function bowsheetPaths(gender: Gender): string[] {
  return [bowlessBodyPath(gender, 'idle'), bowlessBodyPath(gender, 'walk'), bowlessBodyPath(gender, 'attack')];
}

/** 기본 지팡이를 지운 마법사 본체 시트 3장(서기·걷기·공격) — 작업 201. */
function staffSheetPaths(gender: Gender): string[] {
  return [stafflessBodyPath(gender, 'idle'), stafflessBodyPath(gender, 'walk'), stafflessBodyPath(gender, 'attack')];
}

function sliceArmorSheet(sheet: Texture, motion: ArmorMotion): Texture[] {
  if (motion === 'idle') return [sheet];
  const source = sheet.source;
  const columns = source.width / source.height > 2.2 ? 4 : 1;
  return Array.from({ length: columns }, (_, index) => {
    const left = Math.round(index * source.width / columns);
    const right = Math.round((index + 1) * source.width / columns);
    return new Texture({ source, frame: new Rectangle(left, 0, right - left, source.height) });
  });
}

/** 갑옷 시트 캐시에 남겨 두는 티어 수. 티어당 6장이라 3티어면 18장이다. */
export const armorTierCacheLimit = 3;
/** 궁수 갑옷 시트 캐시에 남기는 티어 수(작업 160). 티어당 3장이다. */
export const archerArmorTierCacheLimit = 3;
/** 대검 파츠 캐시에 남기는 티어 수(작업 156). 티어당 1장이다. */
export { weaponTierCacheLimit };
/** 마법사 로브 시트 캐시에 남기는 티어 수(작업 208). 티어당 6장(전신·머리 없음)이다. */
export const robeTierCacheLimit = 3;
/** 갑옷 발광 마스크 시트 캐시 상한(작업 257) — 마스크는 362² 알파 PNG라 가볍지만, 티어를
 *  오갈 때 쌓이지 않게 최근 몇 장만 남긴다. */
export const armorGlowCacheLimit = 6;
export const renderAssetPaths = [
  ...Object.values(paths), ...Object.values(animationPaths).flat(),
  ...Object.values(attackSheets), ...Object.values(walkSheets), ...Object.values(wearableAssetPaths),
  // 착용 투구 머리 파츠(작업 151) — 장비창과 필드가 같은 PNG 를 쓴다.
  ...helmetArtList.map(art => helmetArtPaths[art]),
  // 공격 3/4 옆모습 투구 파츠(작업 154) — 남녀 10종 × 공격 4프레임.
  ...helmetAttackArtList.map(art => helmetAttackArtPaths[art]),
  // 궁수 전용 투구 파츠 20장(작업 200) — 전체 셀 PNG 20장이 장당 ~5KB라 부팅 때 함께 받는다.
  ...archerHelmPartPaths,
  // 마법사 전용 모자·투구 파츠 20장(작업 204) — 장당 9~19KB(고깔모·후광까지 담은 362×406).
  ...mageHelmPartPaths
];
type Dust = { x: number; y: number; vx: number; vy: number; age: number; duration: number; size: number };
type Ghost = { sprites: { sprite: Sprite; dx: number; dy: number }[]; x: number; y: number; age: number; duration: number };
type Fallen = { sprite: Sprite; x: number; y: number; age: number; duration: number; scaleX: number; scaleY: number; rotation: number };

export class GameView {
  app = new Application();
  textures = {} as Record<Art, Texture>;
  animations = {} as Record<Animation, Texture[]>;
  floor!: TilingSprite;
  glow = new Graphics();
  ground = new Graphics();
  terrainLayer = new Container();
  groundVfx = new Container();
  ambientLayer = new Container();
  wastelandPlayer = { x: 0, y: 0 };
  terrainTextures: Texture[] = [];
  terrainSprites: Sprite[] = [];
  /** 블러드 레이지 오라 (작업 214) — 몸 뒤 광휘는 뷰 뒤, 불꽃 혀·불티는 히어로 앞 레이어에 가산으로 그린다. */
  rageBack = new Container();
  rageFront = new Container();
  /** 궁수 호크아이·마법사 아케인 실드가 쓰는 종전의 발밑 마법진(작업 16). 전사 블러드 레이지는 쓰지 않는다. */
  aura!: Sprite;
  dragonBack = new Container();
  /** Ground loot behind the character / in front of him, and the drops they show (see `render/drops`). */
  lootBack = new Container();
  lootFront = new Container();
  lootViews = new Map<Drop | Coin, LootView>();
  lootTaken: LootDrop[] = [];
  lootSheets = new Set<string>();
  lootArtTextures = new Map<string, Texture>();
  lootGlow?: Texture;
  ghosts = new Container();
  actors = new Container();
  fallen = new Container();
  skillVfx = new Container();
  vfxSprites = new Map<Effect, Sprite[]>();
  /** 눌린 지면 컨테이너(회전참격, 작업 215) — 자식 스프라이트를 통째로 눌러 바닥 원근을 만든다. */
  vfxLayers = new Map<Effect, Container[]>();
  effects = new Graphics();
  /**
   * 내 캐릭터 머리 위 초록 체력바(작업 233). 효과 설정(`preferences.effects`)으로 흐려지지 않도록
   * `effects`·`skillVfx` 와 분리한 전용 레이어다 — 투명도·클리어는 `drawHeroHpBar` 가 소유한다.
   */
  heroHpBar = new Graphics();
  labels = new Container();
  shade = new Graphics();
  heroLayer = new Container();
  hero!: Sprite;
  gearTextures = new Map<string, Texture>();
  gearLoading = new Set<string>();
  /** 투구 머리 파츠 텍스처 — 경로를 키로 쓴다(작업 151). */
  helmetTextures = new Map<string, Texture>();
  /** 현재 그려진 투구 스프라이트. 투구를 벗으면 숨긴다. */
  heroHelmet?: Sprite;
  /** 착용 갑옷 시트(경로 → 텍스처)와 프레임 캐시, 로딩 중인 경로 (작업 155). 기본 검을 지운 시트(작업 156)도 같은 지도에 담는다. */
  armorSheets = new Map<string, Texture>();
  armorFrames = new Map<string, Texture[]>();
  /**
   * 갑옷 발광 마스크 시트(작업 257) — 경로 → 시트, 경로 → 자른 프레임.
   *
   * 마스크는 갑옷 시트와 같은 크기·같은 셀 좌표계의 알파 PNG라 같은 방식으로 자른다.
   * 부팅 때 모두 받지 않고 **유니크·전설 갑옷을 입은 순간**에만 그 차림의 3장을 받는다.
   */
  armorGlowSheets = new Map<string, Texture>();
  armorGlowFrames = new Map<string, Texture[]>();
  armorGlowLoading = new Set<string>();
  armorGlowOrder: string[] = [];
  armorLoading = new Set<string>();
  /** 최근에 받은 본체 시트 묶음 키(오래된 것부터 버린다). */
  armorTierOrder: string[] = [];
  /** 마지막으로 본 본체 시트 묶음(성별:갑옷:검없음). 바뀔 때만 미리 받는다. */
  lastBodyTier = '';
  /** 최근에 받은 궁수 갑옷 티어(작업 160) — 전사 갑옷과 따로 센다. */
  archerArmorOrder: string[] = [];
  /** 마지막으로 본 궁수 갑옷 티어(성별:인덱스). 바뀔 때만 미리 받는다. */
  lastArcherArmorTier = '';
  /** 착용 무기 파츠(경로 → 텍스처), 로딩 중인 경로, 최근 티어 (작업 156). */
  weaponSheets = new Map<string, Texture>();
  weaponLoading = new Set<string>();
  weaponTierOrder: number[] = [];
  /** 마지막으로 본 무기 티어. 바뀔 때만 파츠를 미리 받는다. */
  lastWeaponTier = -1;
  /** 최근에 받은 마법사 로브 묶음 키(작업 208)와 마지막으로 본 티어. */
  robeTierOrder: string[] = [];
  lastRobeTier = '';
  /** 지금 그려진 검 파츠 스프라이트(0번·로딩 전이면 숨김). */
  heroWeapon?: Sprite;
  /** 착용 활 파츠(경로 → 텍스처), 로딩 중인 경로, 최근 티어 (작업 160). */
  bowSheets = new Map<string, Texture>();
  bowLoading = new Set<string>();
  bowTierOrder: number[] = [];
  /** 마지막으로 본 활 티어. 바뀔 때만 파츠·본체 시트를 미리 받는다. */
  lastBowTier = -1;
  /** 마지막으로 본 궁수 투구 인덱스와 (투구:활 지움 여부) 키 (작업 200). */
  lastArcherHelm = -1;
  lastArcherHelmBow = '';
  /** 지금 그려진 활 파츠 스프라이트(0번·로딩 전이면 숨김). */
  heroBow?: Sprite;
  /** 착용 지팡이 파츠(경로 → 텍스처), 로딩 중인 경로, 최근 티어 (작업 201). */
  staffSheets = new Map<string, Texture>();
  staffLoading = new Set<string>();
  staffTierOrder: number[] = [];
  /** 마지막으로 본 지팡이 티어. 바뀔 때만 파츠·본체 시트를 미리 받는다. */
  lastStaffTier = -1;
  /** 지금 그려진 지팡이 파츠 스프라이트(로딩 전이면 숨김). */
  heroStaff?: Sprite;
  /** 마지막으로 본 마법사 투구 인덱스와 (투구:지팡이 착용) 키 (작업 204). */
  lastMageHelm = -1;
  lastMageHelmStaff = '';
  /** 지금 그려진 마법사 투구 파츠 스프라이트(로딩 전이면 숨김). */
  heroMageHelm?: Sprite;
  heroGear = new Map<Slot, { path: string; sprite: Sprite }>();
  /** 등급색 발광 복제본(작업 218·231) — 부위 키(armor·helmet·weapon)별 겹 스프라이트 목록.
   *  겹 순서는 `gearGlowLayers`(진한 색 multiply → 가산 빛 → 번지는 후광) 그대로다. */
  heroGlow = new Map<string, Sprite[]>();
  /** 갑옷 발광을 목 아래로 자르는 마스크(작업 218) — 얼굴은 원래 색으로 남긴다. */
  heroGlowMask?: Sprite;
  /**
   * 부위별 발광 마스크 스프라이트(작업 256) — 파츠와 같은 앵커·위치·배율로 놓고 `mask` 로 건다.
   * 투구는 알파 마스크 PNG(얼굴·목·머리카락 제외), 갑옷은 다음 작업에서 같은 방식으로 쓸 자리다.
   */
  heroGlowPartMasks = new Map<string, Sprite>();
  /**
   * 투구 발광 마스크 텍스처(경로 → 텍스처, 작업 256). 유니크·전설 투구를 쓴 순간에만 받는다 —
   * 마스크는 362² 알파 PNG 1~4KB라 부팅 프리로드(113장)에 넣지 않는다.
   */
  helmetGlowMasks = new Map<string, Texture>();
  helmetGlowMaskLoading = new Set<string>();
  /** 이번 프레임에 그린 투구 파츠의 발광 마스크 경로(없으면 마스크 없이 그린다 = 마법사 등). */
  heroHelmetGlowMaskPath?: string;
  /** 독립형 코스튬 렌더러 상태(작업 140). 매니페스트·아틀라스가 없으면 폴백으로 굳는다. */
  costume: CostumeHeroState = createCostumeHeroState();
  enemies = new Map<Enemy, Sprite>();
  /** 보스·정예 이름표(작업 206에서 정예까지 함께 단다). */
  enemyLabels = new Map<Enemy, Text>();
  afterimages: Ghost[] = [];
  /** 딜레이 크러싱 잔상(작업 212) — 월드의 잔상 기록 하나당 본체 복제본 한 별을 대응시킨다. */
  crushTrails = new Map<HeroAfterimage, Container>();
  corpses: Fallen[] = [];
  ghostEmissions = new WeakMap<Effect, number>();
  damageLabels = new Map<Effect, Text>();
  dust: Dust[] = [];
  lastTime = 0;
  lastHeroDust = 0;
  /** 마지막으로 그린 캐릭터 전환 세대(작업 250) — `world.switchEpoch`가 바뀌면 파츠·발광·잔상을 비운다. */
  heroSwitchEpoch = -1;
  heroWalkDistance = 0;
  lastHeroWorld = { x: 0, y: 0 };
  enemyWalkDistance = new Map<Enemy, { x: number; y: number; distance: number }>();

  async mount(host: HTMLElement, onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const progress = createBootProgress(renderAssetPaths, onProgress);
    progress.report();
    await this.app.init({ resizeTo: host, background: '#9b8259', antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
    host.appendChild(this.app.canvas);
    const loadTexture = async (path: string): Promise<Texture> => {
      try {
        const texture = await Assets.load<Texture>(path);
        progress.tick(path);
        return texture;
      } catch (error) {
        throw new Error(`그래픽 리소스 ${path} 로딩 실패: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    const loaded = await Promise.all((Object.keys(paths) as Art[]).map(async key => [key, await loadTexture(paths[key])] as const));
    for (const [key, texture] of loaded) { texture.source.scaleMode = 'linear'; this.textures[key] = texture; }
    const wearable = await Promise.all(Object.values(wearableAssetPaths).map(async path => [path, await loadTexture(path)] as const));
    for (const [path, texture] of wearable) { texture.source.scaleMode = 'linear'; this.gearTextures.set(path, texture); }
    const animated = await Promise.all((Object.keys(animationPaths) as (keyof typeof animationPaths)[]).map(async key => [key, await Promise.all(animationPaths[key].map(loadTexture))] as const));
    for (const [key, textures] of animated) { for (const texture of textures) texture.source.scaleMode = 'linear'; this.animations[key] = textures; }
    const attacks = await Promise.all((Object.keys(attackSheets) as (keyof typeof attackSheets)[]).map(async key => [key, await loadTexture(attackSheets[key])] as const));
    for (const [key, sheet] of attacks) {
      sheet.source.scaleMode = 'linear';
      // Four poses in one row (the sheet is about four cells wide) versus a single pose
      // drawn for one character: a single image cut into four slices left vertical
      // slivers of the character beside itself, so only wide sheets are divided.
      const poses = sheet.source.width / sheet.source.height > 2.2 ? 4 : 1;
      this.animations[key] = Array.from({ length: 4 }, (_, index) => {
        const column = poses === 1 ? 0 : index;
        const left = Math.round(column * sheet.source.width / poses), right = Math.round((column + 1) * sheet.source.width / poses);
        return new Texture({ source: sheet.source, frame: new Rectangle(left, 0, right - left, sheet.source.height) });
      });
    }
    // 정면(서기·걷기) 13장과 공격 3/4 파츠 80장을 함께 받는다 — 필드에서 프레임이 바뀌는
    // 순간에 텍스처가 없어 투구가 한 프레임 사라지는 일이 없도록 부팅 때 모두 올린다.
    const helmetPaths = [
      ...helmetArtList.map(art => helmetArtPaths[art]), ...helmetAttackArtList.map(art => helmetAttackArtPaths[art]),
      ...archerHelmPartPaths, ...mageHelmPartPaths
    ];
    const helmets = await Promise.all(helmetPaths.map(async path => [path, await loadTexture(path)] as const));
    for (const [path, texture] of helmets) { texture.source.scaleMode = 'linear'; this.helmetTextures.set(path, texture); }
    const walking = await Promise.all((Object.keys(walkSheets) as (keyof typeof walkSheets)[]).map(async key => [key, await loadTexture(walkSheets[key])] as const));
    for (const [key, sheet] of walking) {
      sheet.source.scaleMode = 'linear';
      // Some walk sheets keep the sword arm above the head: those are 4 poses in one row
      // (square cells), the rest are 8 poses in 4×2. Cutting every sheet as 4×2 chopped
      // those heroes in half, so the row count follows the sheet's own aspect ratio.
      const rows = sheet.source.width / sheet.source.height > 2.5 ? 1 : 2;
      const poses = rows * 4;
      this.animations[key] = Array.from({ length: 8 }, (_, index) => {
        const pose = index % poses;
        const column = pose % 4, row = Math.floor(pose / 4);
        const left = Math.round(column * sheet.source.width / 4), top = Math.round(row * sheet.source.height / rows);
        const right = Math.round((column + 1) * sheet.source.width / 4), bottom = Math.round((row + 1) * sheet.source.height / rows);
        return new Texture({ source: sheet.source, frame: new Rectangle(left, top, right - left, bottom - top) });
      });
    }
    const propFrames = [[36,285,348,226], [484,229,276,283], [891,303,303,204], [53,855,307,178], [423,791,395,272], [907,822,289,228]];
    this.terrainTextures = propFrames.map(([x, y, width, height]) => new Texture({ source: this.textures.terrainProps.source, frame: new Rectangle(x, y, width, height) }));
    this.floor = new TilingSprite({ texture: this.textures.floor, width: this.app.screen.width, height: this.app.screen.height });
    this.floor.tileScale.set(.65);
    this.hero = new Sprite(this.textures.male);
    this.hero.anchor.set(.5, .97);
    this.heroLayer.addChild(this.hero);
    this.actors.addChild(this.heroLayer);
    this.rageBack.blendMode = 'add';
    this.rageFront.blendMode = 'add';
    this.aura = new Sprite(this.textures.fxRage);
    this.aura.anchor.set(.5);
    this.aura.blendMode = 'add';
    this.aura.alpha = 0;
    this.app.stage.addChild(this.floor, this.glow, this.ground, this.terrainLayer, this.groundVfx, this.aura, this.rageBack, this.dragonBack, this.ghosts, this.lootBack, this.actors, this.lootFront, this.fallen, this.rageFront, this.skillVfx, this.effects, this.heroHpBar, this.labels, this.shade);
    // Loot keeps its own paint order: a coin of a heap stays under an item that fell on it.
    this.lootBack.sortableChildren = true;
    this.lootFront.sortableChildren = true;
    progress.report();
    // 코스튬 매니페스트는 화면을 막지 않고 뒤에서 한 번만 받는다. 없거나 실패하면
    // `fallback` 상태로 굳어 기존 통합 바디 렌더링이 그대로 이어진다(작업 140 §8).
    // Task 149 uses one approved full-body warrior illustration for every gear state;
    // skip costume-manifest loading so old overlays cannot replace or cover that art.
  }

  /**
   * 착용 본체 시트의 프레임 텍스처 (작업 155·156).
   *
   * 시트는 장비를 바꿀 때만 동적으로 받는다(120장 9.2MB 전체를 부팅 때 받지 않는다).
   * `swordless` 면 기본 검을 지운 같은 시트(`noweapon/`)를 쓴다 — 0번이 아닌 검을 찼을 때다.
   * 아직 로딩 전이면 `undefined` 를 돌려주고, `drawHero` 가 기준 시트로 그린다.
   */
  armorFrame(gender: Gender, index: number, motion: ArmorMotion, headless: boolean, frame: number, swordless = false): Texture | undefined {
    const path = armorSheetPath(gender, index, motion, headless, swordless);
    if (!path) return undefined;
    return this.bodySheetFrame(path, motion, frame);
  }

  /**
   * 궁수 갑옷 시트 프레임(작업 160).
   *
   * 전사 갑옷과 같은 `bodySheetFrame` 을 쓰므로 362px 셀 자르기·4프레임 규칙이 같다.
   * 아직 로딩 전이면 `undefined` 를 돌려주고, `drawHero` 가 스타터 시트로 한 프레임 더 그린다.
   */
  archerArmorFrame(
    gender: Gender, index: number, motion: ArcherArmorMotion, frame: number, bowless = false, headless = false
  ): Texture | undefined {
    const path = archerArmorSheetPath(gender, index, motion, bowless, headless);
    if (!path) return undefined;
    const texture = this.bodySheetFrame(path, motion, frame);
    if (texture) return texture;
    // 아직 로딩 전이면 같은 티어의 다른 판으로 한두 프레임 대신 그린다.
    // (머리 지운 판 → 머리 있는 판 → 활 지운 판 → 기본 판 순서)
    for (const [b, h] of [[bowless, false], [bowless, true], [false, false]]) {
      if (b === bowless && h === headless) continue;
      const fallback = archerArmorSheetPath(gender, index, motion, b, h);
      if (!fallback) continue;
      const fallbackTexture = this.bodySheetFrame(fallback, motion, frame);
      if (fallbackTexture) return fallbackTexture;
    }
    return undefined;
  }

  /**
   * 궁수 갑옷 한 티어의 시트 3장을 미리 받고, 최근 3티어 밖은 Pixi 에셋 캐시에서도 내린다(작업 160).
   * 전사 갑옷(`prefetchBody`)과 캐시 목록을 나눠 서로 밀어내지 않게 한다.
   */
  prefetchArcherArmor(gender: Gender, index: number, bowless = false, headless = false): void {
    if (!Number.isInteger(index) || index < 1 || index >= ARCHER_ARMOR_COUNT) return;
    const tier = `${gender}:${index}`;
    if (!this.archerArmorOrder.includes(tier)) this.archerArmorOrder.push(tier);
    for (const path of archerArmorSheetPaths(gender, index, bowless, headless)) this.loadArmorSheet(path);
    while (this.archerArmorOrder.length > archerArmorTierCacheLimit) {
      const oldest = this.archerArmorOrder.shift() as string;
      const [oldGender, oldIndex] = oldest.split(':');
      for (const path of archerArmorTierSheets(oldGender as Gender, Number(oldIndex))) {
        this.armorFrames.delete(path);
        if (this.armorSheets.delete(path)) void Assets.unload(path).catch(() => undefined);
      }
    }
  }

  /**
   * 갑옷을 입지 않은 본체의 기본 검 없는 시트 프레임(작업 156).
   * 셀 규격이 같으므로 자르기·프레임 선택 규칙도 갑옷 시트와 같다.
   */
  swordlessBodyFrame(gender: Gender, motion: ArmorMotion, headless: boolean, frame: number): Texture | undefined {
    return this.bodySheetFrame(swordlessBodyPath(gender, motion, headless), motion, frame);
  }

  /**
   * 착용 로브의 프레임 텍스처 (작업 208). 갑옷 시트와 같은 셀 규격이라 잘라 쓰는 규칙도 같다.
   * 아직 로딩 전이면 `undefined` 를 돌려주고, `drawHero` 가 기준 시트(스타터 로브)로 그린다.
   */
  robeFrame(gender: Gender, index: number, motion: RobeMotion, frame: number, headless = false): Texture | undefined {
    const path = headless ? robeHeadlessSheetPath(gender, index, motion) : robeSheetPath(gender, index, motion);
    if (!path) return undefined;
    let frames = this.armorFrames.get(path);
    if (!frames) {
      const sheet = this.armorSheets.get(path);
      if (!sheet) { this.loadArmorSheet(path); return undefined; }
      frames = sliceArmorSheet(sheet, motion);
      this.armorFrames.set(path, frames);
    }
    return frames[robeFrameIndex(motion, frame) % frames.length];
  }

  /** 로브 티어가 바뀌면 그 티어 3장을 받고, 최근 3티어 밖은 내린다(작업 208). */
  prefetchRobe(gender: Gender, index: number): void {
    const tier = `${gender}:${index}`;
    if (!this.robeTierOrder.includes(tier)) this.robeTierOrder.push(tier);
    for (const path of robeSheetPaths(gender, index)) this.loadArmorSheet(path);
    while (this.robeTierOrder.length > robeTierCacheLimit) {
      const oldest = this.robeTierOrder.shift() as string;
      const [oldGender, oldIndex] = oldest.split(':');
      for (const path of robeSheetPaths(oldGender as Gender, Number(oldIndex))) {
        this.armorFrames.delete(path);
        if (this.armorSheets.delete(path)) void Assets.unload(path).catch(() => undefined);
      }
    }
  }

  /**
   * 갑옷 발광 마스크의 프레임 텍스처 (작업 257).
   *
   * 마스크 시트는 갑옷 시트와 같은 셀 좌표계라 `sliceArmorSheet`·`armorFrameIndex` 를 그대로 쓴다.
   * 아직 로딩 전이면 `undefined` — 그 프레임은 갑옷 발광을 숨긴다(마스크 없이 그리면 얼굴·맨팔까지
   * 물들어 예전 문제로 돌아간다).
   */
  armorGlowFrame(path: string, motion: ArmorMotion, frame: number): Texture | undefined {
    let frames = this.armorGlowFrames.get(path);
    if (!frames) {
      const sheet = this.armorGlowSheets.get(path);
      if (!sheet) { this.loadArmorGlowSheet(path); return undefined; }
      frames = sliceArmorSheet(sheet, motion);
      this.armorGlowFrames.set(path, frames);
    }
    return frames[armorFrameIndex(motion, frame) % frames.length];
  }

  /** 갑옷 발광 마스크 시트 1장을 받아 둔다. 최근 `armorGlowCacheLimit` 장 밖은 내린다. */
  prefetchArmorGlow(path: string | undefined): void {
    if (path) this.loadArmorGlowSheet(path);
  }

  private loadArmorGlowSheet(path: string): void {
    if (!this.armorGlowOrder.includes(path)) this.armorGlowOrder.push(path);
    if (this.armorGlowSheets.has(path) || this.armorGlowLoading.has(path)) return;
    this.armorGlowLoading.add(path);
    void Assets.load<Texture>(path).then(sheet => {
      sheet.source.scaleMode = 'linear';
      this.armorGlowSheets.set(path, sheet);
      this.armorGlowLoading.delete(path);
    }).catch(error => {
      this.armorGlowLoading.delete(path);
      console.error(`갑옷 발광 마스크 로딩 실패: ${path}`, error);
    });
    while (this.armorGlowOrder.length > armorGlowCacheLimit) {
      const oldest = this.armorGlowOrder.shift() as string;
      if (oldest === path) continue;
      this.armorGlowFrames.delete(oldest);
      if (this.armorGlowSheets.delete(oldest)) void Assets.unload(oldest).catch(() => undefined);
    }
  }

  private bodySheetFrame(path: string, motion: ArmorMotion, frame: number): Texture | undefined {
    let frames = this.armorFrames.get(path);
    if (!frames) {
      const sheet = this.armorSheets.get(path);
      if (!sheet) { this.loadArmorSheet(path); return undefined; }
      frames = sliceArmorSheet(sheet, motion);
      this.armorFrames.set(path, frames);
    }
    return frames[armorFrameIndex(motion, frame) % frames.length];
  }

  /**
   * 본체 시트 묶음을 미리 받는다. 갑옷 티어 또는 (기본 검을 지운 시트 여부)가 바뀔 때만 부른다.
   * 최근 3묶음만 남기고 나머지는 Pixi 에셋 캐시에서도 내려 모바일 메모리를 잡아 두지 않는다.
   */
  prefetchBody(gender: Gender, armor: number, swordless: boolean): void {
    const tier = `${gender}:${armor}:${swordless ? 1 : 0}`;
    if (!this.armorTierOrder.includes(tier)) this.armorTierOrder.push(tier);
    for (const path of this.bodySheetPaths(gender, armor, swordless)) this.loadArmorSheet(path);
    while (this.armorTierOrder.length > armorTierCacheLimit) {
      const oldest = this.armorTierOrder.shift() as string;
      const [oldGender, oldArmor, oldSwordless] = oldest.split(':');
      for (const path of this.bodySheetPaths(oldGender as Gender, Number(oldArmor), oldSwordless === '1')) {
        this.armorFrames.delete(path);
        if (this.armorSheets.delete(path)) void Assets.unload(path).catch(() => undefined);
      }
    }
  }

  /** 한 묶음의 시트 6장(서기·걷기·공격 × 전신·머리 없음). 갑옷이 없으면 기본 본체 시트. */
  private bodySheetPaths(gender: Gender, armor: number, swordless: boolean): string[] {
    if (armor >= 0) return armorSheetPaths(gender, armor, swordless);
    return swordless ? swordlessBodyPaths(gender) : [];
  }

  /**
   * 착용 대검 파츠 텍스처 (작업 156). 아직 로딩 전이면 `undefined` — 그 프레임은 기본 검을
   * 가진 본체 시트로 그려진다(부팅 직후·티어를 막 바꿨을 때).
   */
  weaponPart(index: number): Texture | undefined {
    const path = weaponPartPath(index);
    if (!path) return undefined;
    const texture = this.weaponSheets.get(path);
    if (!texture) { this.loadWeaponPart(path); return undefined; }
    return texture;
  }

  /**
   * 투구 발광 마스크 텍스처 (작업 256). 아직 로딩 전이면 `undefined` — 그 프레임은 투구 발광을
   * 숨기고 다음 프레임에 그린다(마스크 없이 그리면 얼굴까지 빛나 예전 문제로 돌아간다).
   */
  helmetGlowMask(path: string): Texture | undefined {
    const texture = this.helmetGlowMasks.get(path);
    if (texture) return texture;
    this.loadHelmetGlowMask(path);
    return undefined;
  }

  /** 투구 발광 마스크 1장을 받아 둔다(유니크·전설 투구를 쓴 순간에만 부른다). */
  prefetchHelmetGlowMask(path: string | undefined): void {
    if (path) this.loadHelmetGlowMask(path);
  }

  private loadHelmetGlowMask(path: string): void {
    if (this.helmetGlowMasks.has(path) || this.helmetGlowMaskLoading.has(path)) return;
    this.helmetGlowMaskLoading.add(path);
    void Assets.load<Texture>(path).then(texture => {
      texture.source.scaleMode = 'linear';
      this.helmetGlowMasks.set(path, texture);
      this.helmetGlowMaskLoading.delete(path);
    }).catch(error => {
      this.helmetGlowMaskLoading.delete(path);
      console.error(`투구 발광 마스크 로딩 실패: ${path}`, error);
    });
  }

  /** 무기 티어가 바뀌면 그 파츠 1장을 받고, 최근 3티어 밖은 내린다. */
  prefetchWeapon(index: number): void {    if (!this.weaponTierOrder.includes(index)) this.weaponTierOrder.push(index);
    for (const path of weaponPartPaths(index)) this.loadWeaponPart(path);
    while (this.weaponTierOrder.length > weaponTierCacheLimit) {
      const oldest = this.weaponTierOrder.shift() as number;
      for (const path of weaponPartPaths(oldest)) {
        if (this.weaponSheets.delete(path)) void Assets.unload(path).catch(() => undefined);
      }
    }
  }

  private loadWeaponPart(path: string): void {
    if (this.weaponSheets.has(path) || this.weaponLoading.has(path)) return;
    this.weaponLoading.add(path);
    void Assets.load<Texture>(path).then(texture => {
      texture.source.scaleMode = 'linear';
      this.weaponSheets.set(path, texture);
      this.weaponLoading.delete(path);
    }).catch(error => {
      this.weaponLoading.delete(path);
      console.error(`무기 파츠 로딩 실패: ${path}`, error);
    });
  }

  /**
   * 착용 활 파츠 텍스처 (작업 160). 아직 로딩 전이면 `undefined` — 그 프레임은 기본 활을
   * 가진 본체 시트로 그려진다(부팅 직후·티어를 막 바꿨을 때).
   */
  bowPart(index: number): Texture | undefined {
    const path = bowPartPath(index);
    if (!path) return undefined;
    const texture = this.bowSheets.get(path);
    if (!texture) { this.loadBowPart(path); return undefined; }
    return texture;
  }

  /** 활 티어가 바뀌면 그 파츠 1장과 기본 활을 지운 본체 시트 6장을 받고, 최근 3티어 밖은 내린다. */
  prefetchBow(index: number, gender: Gender): void {
    if (!this.bowTierOrder.includes(index)) this.bowTierOrder.push(index);
    for (const path of bowPartPaths(index)) this.loadBowPart(path);
    for (const path of bowsheetPaths(gender)) this.loadArmorSheet(path);
    while (this.bowTierOrder.length > bowTierCacheLimit) {
      const oldest = this.bowTierOrder.shift() as number;
      for (const path of bowPartPaths(oldest)) {
        if (this.bowSheets.delete(path)) void Assets.unload(path).catch(() => undefined);
      }
    }
  }

  private loadBowPart(path: string): void {
    if (this.bowSheets.has(path) || this.bowLoading.has(path)) return;
    this.bowLoading.add(path);
    void Assets.load<Texture>(path).then(texture => {
      texture.source.scaleMode = 'linear';
      this.bowSheets.set(path, texture);
      this.bowLoading.delete(path);
    }).catch(error => {
      this.bowLoading.delete(path);
      console.error(`활 파츠 로딩 실패: ${path}`, error);
    });
  }

  /**
   * 착용 지팡이 파츠 텍스처 (작업 201). 아직 로딩 전이면 `undefined` — 그 프레임은 기본 지팡이를
   * 지운 본체 시트만 그려진다(부팅 직후·티어를 막 바꿨을 때).
   */
  staffPart(index: number): Texture | undefined {
    const path = staffPartPath(index);
    if (!path) return undefined;
    const texture = this.staffSheets.get(path);
    if (!texture) { this.loadStaffPart(path); return undefined; }
    return texture;
  }

  /** 지팡이 티어가 바뀌면 그 파츠 1장과 기본 지팡이를 지운 본체 시트 6장을 받고, 최근 3티어 밖은 내린다. */
  prefetchStaff(index: number, gender: Gender): void {
    if (!this.staffTierOrder.includes(index)) this.staffTierOrder.push(index);
    for (const path of staffPartPaths(index)) this.loadStaffPart(path);
    for (const path of staffSheetPaths(gender)) this.loadArmorSheet(path);
    while (this.staffTierOrder.length > staffTierCacheLimit) {
      const oldest = this.staffTierOrder.shift() as number;
      for (const path of staffPartPaths(oldest)) {
        if (this.staffSheets.delete(path)) void Assets.unload(path).catch(() => undefined);
      }
    }
  }

  private loadStaffPart(path: string): void {
    if (this.staffSheets.has(path) || this.staffLoading.has(path)) return;
    this.staffLoading.add(path);
    void Assets.load<Texture>(path).then(texture => {
      texture.source.scaleMode = 'linear';
      this.staffSheets.set(path, texture);
      this.staffLoading.delete(path);
    }).catch(error => {
      this.staffLoading.delete(path);
      console.error(`지팡이 파츠 로딩 실패: ${path}`, error);
    });
  }

  /** 기본 지팡이를 지운 마법사 본체 시트의 프레임 (작업 201). */
  staffBodyFrame(gender: Gender, motion: StaffMotion, frame: number): Texture | undefined {
    return this.bodySheetFrame(stafflessBodyPath(gender, motion), motion, frame);
  }

  /**
   * 기본 활을 지운 궁수 본체 시트의 프레임 (작업 160).
   * 갑옷 시트와 셀 규격이 같으므로 자르기·프레임 선택 규칙도 같다.
   */
  bowBodyFrame(gender: Gender, motion: BowMotion, frame: number): Texture | undefined {
    return this.bodySheetFrame(bowlessBodyPath(gender, motion), motion, frame);
  }

  /**
   * 머리를 지운 궁수 본체 시트의 프레임 (작업 200). 투구를 쓸 때만 부른다.
   * 갑옷·활 시트와 같은 셀 규격이라 자르기·프레임 선택 규칙도 같다.
   */
  archerHeadlessFrame(gender: Gender, motion: BowMotion, frame: number, bowless = false): Texture | undefined {
    return this.bodySheetFrame(archerHeadlessBodyPath(gender, motion, bowless), motion, frame);
  }

  /**
   * 궁수 투구를 쓰기 시작했거나 활 티어(기본 활 지움 여부)가 바뀌면 머리 없는 시트 3장을 미리 받는다.
   * 파츠 20장은 부팅 프리로드라 여기서 받지 않는다(장당 5KB).
   */
  prefetchArcherHeadless(gender: Gender, bowless: boolean): void {
    for (const path of archerHeadlessBodyPaths(gender, bowless)) this.loadArmorSheet(path);
  }

  /**
   * 머리를 지운 마법사 본체 시트의 프레임 (작업 204). 투구를 쓸 때만 부른다.
   * 갑옷·지팡이 시트와 같은 셀 규격이라 자르기·프레임 선택 규칙도 같다.
   */
  mageHeadlessFrame(gender: Gender, motion: MageHelmMotion, frame: number, staffless = false): Texture | undefined {
    return this.bodySheetFrame(mageHeadlessBodyPath(gender, motion, staffless), motion, frame);
  }

  /**
   * 마법사 투구를 쓰기 시작했거나 지팡이 착용이 바뀌면 머리 없는 시트 3장을 미리 받는다.
   * 파츠 20장은 부팅 프리로드라 여기서 받지 않는다.
   */
  prefetchMageHeadless(gender: Gender, staffless: boolean): void {
    for (const path of mageHeadlessBodyPaths(gender, staffless)) this.loadArmorSheet(path);
  }

  private loadArmorSheet(path: string): void {
    if (this.armorSheets.has(path) || this.armorLoading.has(path)) return;
    this.armorLoading.add(path);
    void Assets.load<Texture>(path).then(sheet => {
      sheet.source.scaleMode = 'linear';
      this.armorSheets.set(path, sheet);
      this.armorLoading.delete(path);
    }).catch(error => {
      this.armorLoading.delete(path);
      console.error(`갑옷 시트 로딩 실패: ${path}`, error);
    });
  }

  draw(world: CombatEngine, time: number): void {
    const dt = Math.min(.05, Math.max(0, time - this.lastTime)); this.lastTime = time;
    const w = this.app.screen.width, h = this.app.screen.height;
    const project = (x: number, y: number): [number, number] => projectArenaPoint(x, y, w, h);
    const [hx, hy] = project(world.player.x, world.player.y);
    this.floor.width = w; this.floor.height = h;
    this.floor.tint = 0xffffff;
    this.floor.alpha = 1;
    this.glow.clear(); this.ground.clear(); this.effects.clear(); this.shade.clear();
    this.drawLighting(world, w, h, time);
    this.drawTerrain(world, project, time);
    this.drawDust(world, project, time, dt);
    this.drawRunes(world, hx, hy, time);
    const slam = world.effects.find(effect => effect.kind === 'slam' || effect.kind === 'hell');
    const shake = slam && preferences.shake ? Math.max(0, 1 - slam.age / Math.min(slam.duration, .38)) * (slam.kind === 'hell' ? 8 : 4) : 0;
    this.effects.alpha = preferences.effects === 'low' ? .4 : 1;
    this.skillVfx.alpha = preferences.effects === 'low' ? .35 : 1;
    this.groundVfx.alpha = preferences.effects === 'low' ? .35 : 1;
    this.rageFront.alpha = preferences.effects === 'low' ? .5 : 1;
    this.rageBack.alpha = preferences.effects === 'low' ? .5 : 1;
    this.dragonBack.alpha = preferences.effects === 'low' ? .35 : 1;
    this.app.stage.position.set(shake ? (Math.random() * 2 - 1) * shake : 0, shake ? (Math.random() * 2 - 1) * shake : 0);
    drawLoot.call(this, world, project, time, dt);
    drawEntities.call(this, world, project, time, dt, hx, hy, h);
    drawEffects.call(this, world, project, time);
    drawVignette.call(this, w, h, hx, hy, time);
  }

  drawSkillVfx(world: CombatEngine, effect: Effect, x: number, y: number, t: number, screenAngle: number, time: number): boolean { return drawSkillVfx.call(this, world, effect, x, y, t, screenAngle, time); }

  drawDragon(effect: Effect, x: number, y: number, progress: number, time: number): void { return drawDragon.call(this, effect, x, y, progress, time); }

  drawHero(world: CombatEngine, x: number, y: number, time: number): void { return drawHero.call(this, world, x, y, time); }

  updateAfterimages(world: CombatEngine, project: (x: number, y: number) => [number, number], dt: number): void { return updateAfterimages.call(this, world, project, dt); }

  updateCorpses(project: (x: number, y: number) => [number, number], dt: number): void { return updateCorpses.call(this, project, dt); }

  drawHit(x: number, y: number, t: number, seed: number): void { return drawHit.call(this, x, y, t, seed); }
  /** 적의 반격(작업 245) — 플레이어 몸 위 할퀴기 자국. */
  drawEnemyStrike(x: number, y: number, t: number, angle: number): void { return drawEnemyStrike.call(this, x, y, t, angle); }

  updateDamageLabels(effects: Effect[], project: (x: number, y: number) => [number, number]): void { return updateDamageLabels.call(this, effects, project); }

  drawRunes(world: CombatEngine, x: number, y: number, time: number): void { return drawRunes.call(this, world, x, y, time); }

  drawTerrain(world: CombatEngine, project: (x: number, y: number) => [number, number], time: number): void { return drawTerrain.call(this, world, project, time); }

  drawDust(world: CombatEngine, project: (x: number, y: number) => [number, number], time: number, dt: number): void { return drawDust.call(this, world, project, time, dt); }

  drawDeath(x: number, y: number, t: number, seed: number): void { return drawDeath.call(this, x, y, t, seed); }

  drawLighting(world: CombatEngine, w: number, h: number, time: number): void { return drawLighting.call(this, world, w, h, time); }
}
