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

export type HelmetPlacement = {
  /** 본체 셀 좌표에서 목 밑동의 x. */
  x: number;
  /** 본체 셀 좌표에서 목 밑동의 y. */
  y: number;
  /** 파츠 PNG 를 그릴 배율(프레임마다 본체 머리 크기가 달라 보정한다). */
  scale: number;
};

/**
 * 성별·동작·프레임별 목 밑동 좌표와 배율. 값은 `idle`·`walk`(4포즈)·`attack`(4포즈)
 * 실물 합성 검수(2026-11-19)로 맞춘 실측치다. `walk` 는 시트가 4포즈를 8프레임으로
 * 반복 재생하므로 4개 값만 두고 `frame % 4` 로 조회한다.
 */
const helmetFrames: Record<Gender, Record<HelmetMotion, readonly HelmetPlacement[]>> = {
  male: {
    idle: [{ x: 224, y: 88, scale: 1 }],
    walk: [
      { x: 247, y: 78.7, scale: .8 },
      { x: 252, y: 80.7, scale: .8 },
      { x: 258, y: 80.1, scale: .72 },
      { x: 262, y: 82.2, scale: .73 }
    ],
    attack: [
      { x: 215, y: 129, scale: 1 },
      { x: 200, y: 140, scale: .93 },
      { x: 195, y: 152, scale: .9 },
      { x: 175, y: 175, scale: .87 }
    ]
  },
  female: {
    idle: [{ x: 230, y: 90, scale: 1 }],
    walk: [
      { x: 250, y: 84.4, scale: .9 },
      { x: 254, y: 85.4, scale: .9 },
      { x: 258, y: 85, scale: .84 },
      { x: 262, y: 85.8, scale: .82 }
    ],
    attack: [
      { x: 185, y: 131.4, scale: 1.05 },
      { x: 180, y: 144, scale: .92 },
      { x: 196, y: 158, scale: .88 },
      { x: 185, y: 170.4, scale: .92 }
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
