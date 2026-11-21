import type { Gender } from '../store';
import { pilotSheet, pilotSheets } from './pilotAssets';

/**
 * pilot-25d 투구 머리 파츠 (작업 151).
 *
 * 승인 시안 `djrpg_pilot_helms_1to5.png`·`djrpg_pilot_helms_6to10.png`(남성 0~9)와
 * 여성 오픈페이스 시안(0~2)에서 투구 머리 부분만 잘라 검정 배경을 투명화한 PNG 다.
 * 모든 PNG 는 **아래 중앙(목 밑동)이 앵커**이고, 크기는 본체 362px 셀 좌표계 기준이다.
 * 그래서 런타임은 프레임마다 목 밑동 자리(x, y)와 배율만 알면 된다.
 *
 * 이 13장은 서기(`idle`)·걷기(`walk`)의 **정면** 파츠다. 공격은 3/4 옆모습 파츠
 * (`helmetAttackArtPaths`, 작업 154)를 따로 쓴다.
 */
const helmetArtBase = {
  helm_0: '/assets/pilot-25d/helmets/helm_0.png',
  helm_1: '/assets/pilot-25d/helmets/helm_1.png',
  helm_2: '/assets/pilot-25d/helmets/helm_2.png',
  helm_3: '/assets/pilot-25d/helmets/helm_3.png',
  helm_4: '/assets/pilot-25d/helmets/helm_4.png',
  helm_5: '/assets/pilot-25d/helmets/helm_5.png',
  helm_6: '/assets/pilot-25d/helmets/helm_6.png',
  helm_7: '/assets/pilot-25d/helmets/helm_7.png',
  helm_8: '/assets/pilot-25d/helmets/helm_8.png',
  helm_9: '/assets/pilot-25d/helmets/helm_9.png',
  helm_female_0: '/assets/pilot-25d/helmets/helm_female_0.png',
  helm_female_1: '/assets/pilot-25d/helmets/helm_female_1.png',
  helm_female_2: '/assets/pilot-25d/helmets/helm_female_2.png'
} as const;

/** 작업 227: pilot-25d 시트는 파일명을 유지한 채 다시 구우므로 URL 버전을 붙인다. */
export const helmetArtPaths: { [K in keyof typeof helmetArtBase]: string } = pilotSheets(helmetArtBase);

export type HelmetArt = keyof typeof helmetArtBase;
export const helmetArtList: readonly HelmetArt[] = Object.keys(helmetArtPaths) as HelmetArt[];

/**
 * 공격 3/4 옆모습 투구 파츠 (작업 154).
 *
 * 승인 시안(`downloads/helm_atk/raw/{male,female}_helm_{0..9}.png`, 10종 × 공격 4프레임)을
 * 게임 공격 셀(`warrior_{male,female}_attack_v1.png`, 362px 셀)에 정렬한 뒤, 게임이 지운
 * 머리 실루엣을 기준으로 투구·얼굴·머리카락만 떠낸 80장이다. 파츠 자체가 이미 3/4 각도와
 * 고개 숙임을 담고 있으므로 회전·세로 축소 없이 배치만 하면 된다.
 * 파일명은 `atk/{성별}_{투구 인덱스}_f{프레임}.png` 이고, 앵커도 아래 중앙이다.
 */
const helmetAttackArtBase = {
  atk_male_0_f0: '/assets/pilot-25d/helmets/atk/male_0_f0.png',
  atk_male_0_f1: '/assets/pilot-25d/helmets/atk/male_0_f1.png',
  atk_male_0_f2: '/assets/pilot-25d/helmets/atk/male_0_f2.png',
  atk_male_0_f3: '/assets/pilot-25d/helmets/atk/male_0_f3.png',
  atk_male_1_f0: '/assets/pilot-25d/helmets/atk/male_1_f0.png',
  atk_male_1_f1: '/assets/pilot-25d/helmets/atk/male_1_f1.png',
  atk_male_1_f2: '/assets/pilot-25d/helmets/atk/male_1_f2.png',
  atk_male_1_f3: '/assets/pilot-25d/helmets/atk/male_1_f3.png',
  atk_male_2_f0: '/assets/pilot-25d/helmets/atk/male_2_f0.png',
  atk_male_2_f1: '/assets/pilot-25d/helmets/atk/male_2_f1.png',
  atk_male_2_f2: '/assets/pilot-25d/helmets/atk/male_2_f2.png',
  atk_male_2_f3: '/assets/pilot-25d/helmets/atk/male_2_f3.png',
  atk_male_3_f0: '/assets/pilot-25d/helmets/atk/male_3_f0.png',
  atk_male_3_f1: '/assets/pilot-25d/helmets/atk/male_3_f1.png',
  atk_male_3_f2: '/assets/pilot-25d/helmets/atk/male_3_f2.png',
  atk_male_3_f3: '/assets/pilot-25d/helmets/atk/male_3_f3.png',
  atk_male_4_f0: '/assets/pilot-25d/helmets/atk/male_4_f0.png',
  atk_male_4_f1: '/assets/pilot-25d/helmets/atk/male_4_f1.png',
  atk_male_4_f2: '/assets/pilot-25d/helmets/atk/male_4_f2.png',
  atk_male_4_f3: '/assets/pilot-25d/helmets/atk/male_4_f3.png',
  atk_male_5_f0: '/assets/pilot-25d/helmets/atk/male_5_f0.png',
  atk_male_5_f1: '/assets/pilot-25d/helmets/atk/male_5_f1.png',
  atk_male_5_f2: '/assets/pilot-25d/helmets/atk/male_5_f2.png',
  atk_male_5_f3: '/assets/pilot-25d/helmets/atk/male_5_f3.png',
  atk_male_6_f0: '/assets/pilot-25d/helmets/atk/male_6_f0.png',
  atk_male_6_f1: '/assets/pilot-25d/helmets/atk/male_6_f1.png',
  atk_male_6_f2: '/assets/pilot-25d/helmets/atk/male_6_f2.png',
  atk_male_6_f3: '/assets/pilot-25d/helmets/atk/male_6_f3.png',
  atk_male_7_f0: '/assets/pilot-25d/helmets/atk/male_7_f0.png',
  atk_male_7_f1: '/assets/pilot-25d/helmets/atk/male_7_f1.png',
  atk_male_7_f2: '/assets/pilot-25d/helmets/atk/male_7_f2.png',
  atk_male_7_f3: '/assets/pilot-25d/helmets/atk/male_7_f3.png',
  atk_male_8_f0: '/assets/pilot-25d/helmets/atk/male_8_f0.png',
  atk_male_8_f1: '/assets/pilot-25d/helmets/atk/male_8_f1.png',
  atk_male_8_f2: '/assets/pilot-25d/helmets/atk/male_8_f2.png',
  atk_male_8_f3: '/assets/pilot-25d/helmets/atk/male_8_f3.png',
  atk_male_9_f0: '/assets/pilot-25d/helmets/atk/male_9_f0.png',
  atk_male_9_f1: '/assets/pilot-25d/helmets/atk/male_9_f1.png',
  atk_male_9_f2: '/assets/pilot-25d/helmets/atk/male_9_f2.png',
  atk_male_9_f3: '/assets/pilot-25d/helmets/atk/male_9_f3.png',
  atk_female_0_f0: '/assets/pilot-25d/helmets/atk/female_0_f0.png',
  atk_female_0_f1: '/assets/pilot-25d/helmets/atk/female_0_f1.png',
  atk_female_0_f2: '/assets/pilot-25d/helmets/atk/female_0_f2.png',
  atk_female_0_f3: '/assets/pilot-25d/helmets/atk/female_0_f3.png',
  atk_female_1_f0: '/assets/pilot-25d/helmets/atk/female_1_f0.png',
  atk_female_1_f1: '/assets/pilot-25d/helmets/atk/female_1_f1.png',
  atk_female_1_f2: '/assets/pilot-25d/helmets/atk/female_1_f2.png',
  atk_female_1_f3: '/assets/pilot-25d/helmets/atk/female_1_f3.png',
  atk_female_2_f0: '/assets/pilot-25d/helmets/atk/female_2_f0.png',
  atk_female_2_f1: '/assets/pilot-25d/helmets/atk/female_2_f1.png',
  atk_female_2_f2: '/assets/pilot-25d/helmets/atk/female_2_f2.png',
  atk_female_2_f3: '/assets/pilot-25d/helmets/atk/female_2_f3.png',
  atk_female_3_f0: '/assets/pilot-25d/helmets/atk/female_3_f0.png',
  atk_female_3_f1: '/assets/pilot-25d/helmets/atk/female_3_f1.png',
  atk_female_3_f2: '/assets/pilot-25d/helmets/atk/female_3_f2.png',
  atk_female_3_f3: '/assets/pilot-25d/helmets/atk/female_3_f3.png',
  atk_female_4_f0: '/assets/pilot-25d/helmets/atk/female_4_f0.png',
  atk_female_4_f1: '/assets/pilot-25d/helmets/atk/female_4_f1.png',
  atk_female_4_f2: '/assets/pilot-25d/helmets/atk/female_4_f2.png',
  atk_female_4_f3: '/assets/pilot-25d/helmets/atk/female_4_f3.png',
  atk_female_5_f0: '/assets/pilot-25d/helmets/atk/female_5_f0.png',
  atk_female_5_f1: '/assets/pilot-25d/helmets/atk/female_5_f1.png',
  atk_female_5_f2: '/assets/pilot-25d/helmets/atk/female_5_f2.png',
  atk_female_5_f3: '/assets/pilot-25d/helmets/atk/female_5_f3.png',
  atk_female_6_f0: '/assets/pilot-25d/helmets/atk/female_6_f0.png',
  atk_female_6_f1: '/assets/pilot-25d/helmets/atk/female_6_f1.png',
  atk_female_6_f2: '/assets/pilot-25d/helmets/atk/female_6_f2.png',
  atk_female_6_f3: '/assets/pilot-25d/helmets/atk/female_6_f3.png',
  atk_female_7_f0: '/assets/pilot-25d/helmets/atk/female_7_f0.png',
  atk_female_7_f1: '/assets/pilot-25d/helmets/atk/female_7_f1.png',
  atk_female_7_f2: '/assets/pilot-25d/helmets/atk/female_7_f2.png',
  atk_female_7_f3: '/assets/pilot-25d/helmets/atk/female_7_f3.png',
  atk_female_8_f0: '/assets/pilot-25d/helmets/atk/female_8_f0.png',
  atk_female_8_f1: '/assets/pilot-25d/helmets/atk/female_8_f1.png',
  atk_female_8_f2: '/assets/pilot-25d/helmets/atk/female_8_f2.png',
  atk_female_8_f3: '/assets/pilot-25d/helmets/atk/female_8_f3.png',
  atk_female_9_f0: '/assets/pilot-25d/helmets/atk/female_9_f0.png',
  atk_female_9_f1: '/assets/pilot-25d/helmets/atk/female_9_f1.png',
  atk_female_9_f2: '/assets/pilot-25d/helmets/atk/female_9_f2.png',
  atk_female_9_f3: '/assets/pilot-25d/helmets/atk/female_9_f3.png'
} as const;

/** 작업 227: 80장 모두 알파가 복원된 파일이라 URL 버전을 붙인다. */
export const helmetAttackArtPaths: { [K in keyof typeof helmetAttackArtBase]: string } = pilotSheets(helmetAttackArtBase);

export type HelmetAtkArt = keyof typeof helmetAttackArtBase;
export const helmetAttackArtList: readonly HelmetAtkArt[] = Object.keys(helmetAttackArtPaths) as HelmetAtkArt[];

/** 정면·공격 파츠를 함께 다루는 타입과 경로 조회. */
export type HelmetPartArt = HelmetArt | HelmetAtkArt;
export function helmetArtPath(art: HelmetPartArt): string {
  return art in helmetArtPaths ? helmetArtPaths[art as HelmetArt] : helmetAttackArtPaths[art as HelmetAtkArt];
}

/**
 * 투구 발광 마스크 경로 (작업 256).
 *
 * 파츠와 **같은 파일명·같은 크기**의 알파 마스크를 `helmets_glow/` 아래 같은 구조로 둔다
 * (`scripts/build-helm-glow-masks.py` 가 만든다). 파츠 경로에서 디렉터리 이름만 바꾸므로
 * 정면·공격 파츠 어느 쪽이든 한 함수로 마스크를 찾고, `?v=` 캐시 버전도 그대로 따라간다.
 */
export const HELMET_GLOW_DIR = 'helmets_glow';

export function helmetGlowMaskPath(art: HelmetPartArt): string {
  return helmetArtPath(art).replace('/helmets/', `/${HELMET_GLOW_DIR}/`);
}

/** 지금 그린 파츠의 발광 마스크 목록(검수·테스트용). */
export const helmetGlowMaskPaths: readonly string[] = [
  ...helmetArtList.map(art => helmetGlowMaskPath(art)),
  ...helmetAttackArtList.map(art => helmetGlowMaskPath(art))
];

export type HelmetMotion = 'idle' | 'walk' | 'attack';

/**
 * 투구 인덱스 → 머리 파츠. 0~2번(가죽 두건·철제 바시넷·사슬 코이프)은 얼굴이 드러나는
 * 오픈페이스라 여성용 시안을 따로 쓰고, 3~9번은 풀페이스라 남녀가 같은 정면 파츠를 쓴다.
 *
 * 작업 154: 공격(`attack`)은 정면 파츠를 돌리는 대신 **그 프레임의 3/4 옆모습 파츠**를 쓴다.
 * 남녀 모두 인덱스 0~9 의 공격 파츠를 따로 갖고 있어 여성도 정면 분기와 상관없이 고른다.
 */
export function helmetArtFor(gender: Gender, index: number, motion: HelmetMotion = 'idle', frame = 0): HelmetPartArt | undefined {
  if (!Number.isInteger(index) || index < 0 || index > 9) return undefined;
  if (motion === 'attack') return `atk_${gender}_${index}_f${attackFrame(frame)}` as HelmetAtkArt;
  if (gender === 'female' && index <= 2) return `helm_female_${index}` as HelmetArt;
  return `helm_${index}` as HelmetArt;
}

/**
 * 투구를 쓸 때만 쓰는 **머리 없는 본체** 시트 (작업 152).
 *
 * 본체 시트에는 긴 머리카락과 정수리가 그려져 있어 투구 파츠를 얹으면 투구 둘레로
 * 머리카락이 삐져나오고, 오픈페이스 투구에서는 본체 얼굴과 파츠 얼굴이 겹쳐 보였다.
 * 그래서 목·갑옷 칼라 위쪽(머리·머리카락 픽셀)만 지운 같은 크기·같은 자리의 시트를
 * 따로 두고, 투구를 착용했을 때만 이 시트를 쓴다. 좌표계가 같아 배율·앵커·무기
 * 소켓은 기존 시트 값을 그대로 쓴다.
 */
export const headlessBodyPaths = {
  male: {
    // 작업 222 → 227: 서기 시트를 다시 구운 뒤 알파까지 복원했다. 걷기·공격도 같이 바뀌었으므로
    // 세 동작 모두 `PILOT_ASSET_VERSION`을 붙인다(render.ts·equipmentPortrait.ts 와 같은 규칙).
    idle: pilotSheet('/assets/pilot-25d/headless/warrior_male_idle_v1.png'),
    walk: pilotSheet('/assets/pilot-25d/headless/warrior_male_walk_v1.png'),
    attack: pilotSheet('/assets/pilot-25d/headless/warrior_male_attack_v1.png')
  },
  female: {
    idle: pilotSheet('/assets/pilot-25d/headless/warrior_female_idle_v1.png'),
    walk: pilotSheet('/assets/pilot-25d/headless/warrior_female_walk_v1.png'),
    attack: pilotSheet('/assets/pilot-25d/headless/warrior_female_attack_v1.png')
  }
} as const;

export const headlessBodyPathList: readonly string[] = [
  headlessBodyPaths.male.idle, headlessBodyPaths.male.walk, headlessBodyPaths.male.attack,
  headlessBodyPaths.female.idle, headlessBodyPaths.female.walk, headlessBodyPaths.female.attack
];

export type HelmetPlacement = {
  /** 본체 셀 좌표에서 목 밑동의 x. */
  x: number;
  /** 본체 셀 좌표에서 목 밑동의 y. */
  y: number;
  /** 파츠 PNG 를 그릴 가로 배율(프레임마다 본체 머리 크기가 달라 보정한다). */
  scale: number;
  /**
   * 세로 배율. 없으면 `scale` 과 같다.
   *
   * 작업 153에서 공격 3·4프레임의 고개 숙임을 정면 파츠에 흉내 낼 때 썼다. 작업 154의
   * 3/4 공격 파츠는 숙임이 그림에 이미 들어 있어 쓰지 않는다(값이 없으면 1).
   */
  scaleY?: number;
  /**
   * 목 밑동을 축으로 돌리는 각도(라디안, 화면 기준 시계방향 +). 없으면 0.
   *
   * 작업 154의 3/4 공격 파츠도 회전 없이 그대로 얹는다.
   */
  rotation?: number;
};

/** 프레임 번호를 표 길이 안으로 접는다(음수·소수·큰 값 방어). */
const wrapFrame = (frame: number, length: number): number =>
  Number.isFinite(frame) ? ((Math.trunc(frame) % length) + length) % length : 0;

/** 공격 시트는 4프레임이다. */
const ATTACK_FRAMES = 4;
const attackFrame = (frame: number): number => wrapFrame(frame, ATTACK_FRAMES);

/**
 * 성별·동작·프레임별 목 밑동 좌표와 배율 — 정면 파츠(`helmetArtPaths`)용.
 *
 * 작업 152에서 **머리 없는 본체**에 맞춰 다시 쟀다. 기준은 지운 머리 영역의 무게중심 x 와
 * 정수리 높이(머리 영역 최상단)이며, 파츠가 본체 칼라에 자연스럽게 얹히는지 합성 검수로
 * 확정했다(남 idle (228, 89) · 여 idle (227, 88), 걷기·공격은 프레임 실측). `walk` 는
 * 시트가 4포즈를 8프레임으로 반복 재생하므로 4개 값만 두고 `frame % 4` 로 조회한다.
 *
 * 공격은 작업 154에서 3/4 파츠로 바뀌어 `helmetAttackFrames` 로 옮겼다(153의 회전·숙임 값은
 * 더 이상 쓰지 않는다).
 */
const helmetFrames: Record<Gender, Record<'idle' | 'walk', readonly HelmetPlacement[]>> = {
  male: {
    idle: [{ x: 228, y: 89, scale: 1 }],
    walk: [
      { x: 248, y: 85, scale: .95 },
      { x: 255, y: 86, scale: .95 },
      { x: 258, y: 93, scale: .95 },
      { x: 260, y: 94, scale: .95 }
    ]
  },
  female: {
    idle: [{ x: 227, y: 88, scale: 1 }],
    walk: [
      { x: 247, y: 88, scale: .95 },
      { x: 250, y: 89, scale: .95 },
      { x: 252, y: 93, scale: .95 },
      { x: 259, y: 95, scale: .95 }
    ]
  }
};

/**
 * 공격 3/4 파츠의 목 밑동 좌표 (작업 154).
 *
 * `[프레임][투구 인덱스]` 순서다. 값은 시안 원본을 게임 공격 셀에 SIFT 유사변환으로 정렬한 뒤
 * 파츠 크롭의 아래 중앙을 그대로 옮긴 좌표라, 배율 1·회전 0 으로 얹으면 원본 그림과 같은
 * 자리에 앉는다. 투구마다 왕관·뿔·머리카락이 붙는 방향이 달라 크롭이 조금씩 비뚤어지므로
 * 인덱스별로 따로 적는다(남 4프레임 x 171.5~182.5 처럼 10px 안팎 차이가 난다).
 */
/** 공격 파츠는 크롭 아래 중앙 좌표만 있으면 된다(배율·회전은 그림에 이미 들어 있다). */
type HelmetAnchor = { x: number; y: number };

const helmetAttackFrames: Record<Gender, readonly (readonly HelmetAnchor[])[]> = {
  male: [
    // 공격 1프레임 — 인덱스 0~9 순서
    [{ x: 200.5, y: 114.5 }, { x: 194.8, y: 114.5 }, { x: 196.0, y: 114.5 }, { x: 200.0, y: 114.5 }, { x: 199.8, y: 114.5 }, { x: 200.0, y: 114.5 }, { x: 199.8, y: 114.5 }, { x: 199.8, y: 114.5 }, { x: 195.5, y: 114.5 }, { x: 195.2, y: 114.5 }],
    // 공격 2프레임 — 인덱스 0~9 순서
    [{ x: 190.0, y: 116.5 }, { x: 190.0, y: 116.5 }, { x: 190.0, y: 117.5 }, { x: 190.0, y: 116.5 }, { x: 190.0, y: 116.5 }, { x: 190.0, y: 116.5 }, { x: 190.0, y: 117.5 }, { x: 190.0, y: 117.5 }, { x: 190.0, y: 117.0 }, { x: 190.0, y: 115.5 }],
    // 공격 3프레임 — 인덱스 0~9 순서
    [{ x: 182.8, y: 136.5 }, { x: 182.2, y: 138.5 }, { x: 182.5, y: 138.0 }, { x: 182.0, y: 138.5 }, { x: 184.2, y: 136.5 }, { x: 182.5, y: 138.5 }, { x: 182.8, y: 138.5 }, { x: 190.2, y: 138.5 }, { x: 182.2, y: 138.5 }, { x: 182.2, y: 138.0 }],
    // 공격 4프레임 — 인덱스 0~9 순서
    [{ x: 171.5, y: 168.0 }, { x: 171.8, y: 168.5 }, { x: 172.2, y: 168.5 }, { x: 171.5, y: 168.5 }, { x: 172.2, y: 168.0 }, { x: 172.0, y: 167.0 }, { x: 174.0, y: 168.0 }, { x: 182.5, y: 168.0 }, { x: 172.0, y: 168.0 }, { x: 174.5, y: 168.5 }]
  ],
  female: [
    // 공격 1프레임 — 인덱스 0~9 순서
    [{ x: 199.5, y: 108.5 }, { x: 195.0, y: 108.5 }, { x: 199.5, y: 108.5 }, { x: 198.8, y: 108.5 }, { x: 199.2, y: 108.5 }, { x: 195.8, y: 108.5 }, { x: 199.2, y: 108.5 }, { x: 197.5, y: 108.5 }, { x: 198.8, y: 108.5 }, { x: 192.5, y: 108.5 }],
    // 공격 2프레임 — 인덱스 0~9 순서
    [{ x: 175.8, y: 168.5 }, { x: 176.2, y: 169.0 }, { x: 174.8, y: 170.0 }, { x: 175.8, y: 170.0 }, { x: 173.0, y: 170.0 }, { x: 171.8, y: 170.5 }, { x: 175.2, y: 169.0 }, { x: 176.0, y: 168.5 }, { x: 176.2, y: 170.5 }, { x: 172.5, y: 170.0 }],
    // 공격 3프레임 — 인덱스 0~9 순서
    [{ x: 174.8, y: 176.0 }, { x: 173.8, y: 176.0 }, { x: 173.0, y: 176.0 }, { x: 173.8, y: 176.0 }, { x: 172.2, y: 176.0 }, { x: 174.2, y: 176.0 }, { x: 174.5, y: 176.0 }, { x: 180.5, y: 176.0 }, { x: 173.2, y: 176.0 }, { x: 176.2, y: 176.0 }],
    // 공격 4프레임 — 인덱스 0~9 순서
    [{ x: 172.5, y: 206.0 }, { x: 170.2, y: 206.0 }, { x: 168.8, y: 206.0 }, { x: 170.5, y: 206.0 }, { x: 167.8, y: 206.0 }, { x: 170.2, y: 206.0 }, { x: 173.0, y: 206.0 }, { x: 176.5, y: 206.0 }, { x: 163.2, y: 206.0 }, { x: 172.8, y: 206.0 }]
  ]
};

/** 3/4 공격 파츠는 그림에 각도·숙임이 들어 있어 배율 1, 회전 0 으로 얹는다. */
const atkPlacement = (anchor: HelmetAnchor): HelmetPlacement => ({ x: anchor.x, y: anchor.y, scale: 1, scaleY: 1, rotation: 0 });

export function helmetPlacement(gender: Gender, motion: HelmetMotion, frame: number, index = 0): HelmetPlacement {
  if (motion === 'attack') {
    const frames = helmetAttackFrames[gender];
    const list = frames[attackFrame(frame)];
    const safe = Number.isInteger(index) && index >= 0 && index < list.length ? index : 0;
    return atkPlacement(list[safe]);
  }
  const list = helmetFrames[gender][motion];
  return list[wrapFrame(frame, list.length)];
}

/** 장비창(내 정보) 초상화는 서 있는 자세 한 장만 쓴다. */
export function helmetIdlePlacement(gender: Gender): HelmetPlacement {
  return helmetFrames[gender].idle[0];
}
