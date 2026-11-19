import type { Gender } from '../store';

/**
 * pilot-25d 투구 머리 파츠 (작업 151).
 *
 * 승인 시안 `djrpg_pilot_helms_1to5.png`·`djrpg_pilot_helms_6to10.png`(남성 0~9)와
 * 여성 오픈페이스 시안(0~2)에서 투구 머리 부분만 잘라 검정 배경을 투명화한 PNG 다.
 * 모든 PNG 는 **아래 중앙(목 밑동)이 앵커**이고, 크기는 본체 362px 셀 좌표계 기준이다.
 * 그래서 런타임은 프레임마다 목 밑동 자리(x, y)와 배율만 알면 된다.
 */
export const helmetArtPaths = {
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

export type HelmetArt = keyof typeof helmetArtPaths;
export const helmetArtList: readonly HelmetArt[] = Object.keys(helmetArtPaths) as HelmetArt[];

export type HelmetMotion = 'idle' | 'walk' | 'attack';

/**
 * 투구 인덱스 → 머리 파츠. 0~2번(가죽 두건·철제 바시넷·사슬 코이프)은 얼굴이 드러나는
 * 오픈페이스라 여성용 시안을 따로 쓰고, 3~9번은 풀페이스라 남녀가 같은 파츠를 쓴다.
 */
export function helmetArtFor(gender: Gender, index: number): HelmetArt | undefined {
  if (!Number.isInteger(index) || index < 0 || index > 9) return undefined;
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
    idle: '/assets/pilot-25d/headless/warrior_male_idle_v1.png',
    walk: '/assets/pilot-25d/headless/warrior_male_walk_v1.png',
    attack: '/assets/pilot-25d/headless/warrior_male_attack_v1.png'
  },
  female: {
    idle: '/assets/pilot-25d/headless/warrior_female_idle_v1.png',
    walk: '/assets/pilot-25d/headless/warrior_female_walk_v1.png',
    attack: '/assets/pilot-25d/headless/warrior_female_attack_v1.png'
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
  /** 파츠 PNG 를 그릴 배율(프레임마다 본체 머리 크기가 달라 보정한다). */
  scale: number;
};

/**
 * 성별·동작·프레임별 목 밑동 좌표와 배율.
 *
 * 작업 152에서 **머리 없는 본체**에 맞춰 다시 쟀다. 기준은 지운 머리 영역의 무게중심 x 와
 * 정수리 높이(머리 영역 최상단)이며, 파츠가 본체 칼라에 자연스럽게 얹히는지 합성 검수로
 * 확정했다(남 idle (228, 89) · 여 idle (227, 88), 걷기·공격은 프레임 실측). `walk` 는
 * 시트가 4포즈를 8프레임으로 반복 재생하므로 4개 값만 두고 `frame % 4` 로 조회한다.
 */
const helmetFrames: Record<Gender, Record<HelmetMotion, readonly HelmetPlacement[]>> = {
  male: {
    idle: [{ x: 228, y: 89, scale: 1 }],
    walk: [
      { x: 248, y: 85, scale: .95 },
      { x: 255, y: 86, scale: .95 },
      { x: 258, y: 93, scale: .95 },
      { x: 260, y: 94, scale: .95 }
    ],
    attack: [
      { x: 202, y: 113, scale: 1 },
      { x: 190, y: 107, scale: 1 },
      { x: 191, y: 118, scale: 1 },
      { x: 190, y: 180, scale: 1 }
    ]
  },
  female: {
    idle: [{ x: 227, y: 88, scale: 1 }],
    walk: [
      { x: 247, y: 88, scale: .95 },
      { x: 250, y: 89, scale: .95 },
      { x: 252, y: 93, scale: .95 },
      { x: 259, y: 95, scale: .95 }
    ],
    attack: [
      { x: 208, y: 116, scale: 1 },
      { x: 205, y: 108, scale: 1 },
      { x: 215, y: 115, scale: 1 },
      { x: 190, y: 155, scale: 1 }
    ]
  }
};

export function helmetPlacement(gender: Gender, motion: HelmetMotion, frame: number): HelmetPlacement {
  const list = helmetFrames[gender][motion];
  const index = Number.isFinite(frame) ? ((Math.trunc(frame) % list.length) + list.length) % list.length : 0;
  return list[index];
}

/** 장비창(내 정보) 초상화는 서 있는 자세 한 장만 쓴다. */
export function helmetIdlePlacement(gender: Gender): HelmetPlacement {
  return helmetFrames[gender].idle[0];
}
