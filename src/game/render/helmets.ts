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
  /** 파츠 PNG 를 그릴 가로 배율(프레임마다 본체 머리 크기가 달라 보정한다). */
  scale: number;
  /**
   * 세로 배율. 없으면 `scale` 과 같다.
   *
   * 작업 153: 공격 3·4프레임은 고개를 앞으로 숙인 자세라 정면 파츠를 그대로 얹으면
   * 얼굴이 길게 서서 "쳐다보는" 것처럼 보인다. 고개가 앞으로 기울면 화면상 세로가
   * 줄어들므로, 숙임 각도의 코사인만큼 세로만 줄여 입체감을 낸다.
   */
  scaleY?: number;
  /**
   * 목 밑동을 축으로 돌리는 각도(라디안, 화면 기준 시계방향 +). 없으면 0.
   *
   * 작업 153: 공격 프레임은 고개가 오른쪽으로 돌아가거나 숙여져 정면 파츠를 축 그대로
   * 얹으면 머리만 따로 떠 있는 느낌이 난다. 앵커(목 밑동)를 축으로 고개 기울기만큼
   * 돌려 몸통과 한 덩어리로 보이게 한다.
   */
  rotation?: number;
};

/** 도(degree) → 라디안. 앵커 표를 눈으로 검수하기 쉽게 각도로 적는다. */
const deg = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * 성별·동작·프레임별 목 밑동 좌표와 배율.
 *
 * 작업 152에서 **머리 없는 본체**에 맞춰 다시 쟀다. 기준은 지운 머리 영역의 무게중심 x 와
 * 정수리 높이(머리 영역 최상단)이며, 파츠가 본체 칼라에 자연스럽게 얹히는지 합성 검수로
 * 확정했다(남 idle (228, 89) · 여 idle (227, 88), 걷기·공격은 프레임 실측). `walk` 는
 * 시트가 4포즈를 8프레임으로 반복 재생하므로 4개 값만 두고 `frame % 4` 로 조회한다.
 *
 * 작업 153에서 `attack` 4프레임만 다시 쟀다. 151·152의 공격값은 목 밑동보다 10~50px 위에
 * 찍혀 파츠가 정수리에 얹히고 턱·목이 비어 "머리가 떠다니는" 원인이었다. 원본 공격 시트
 * (`warrior_{male,female}_attack_v1.png`)의 턱·목 위치를 다시 읽어 앵커를 내리고, 프레임별
 * 고개 기울기(`rotation`)와 숙임(`scaleY`)을 합성 검수로 확정했다 — 1프레임은 젖힌 고개라
 * 살짝 반대로(-), 3·4프레임은 깊게 숙여 세로를 12% 줄이고 12~15도 돌린다. `idle`·`walk`
 * 는 정면이라 종전 값을 그대로 둔다(사용자 확인 완료 구간).
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
      { x: 205, y: 122, scale: .97, scaleY: 1, rotation: deg(4) },
      { x: 188, y: 124, scale: .97, scaleY: 1, rotation: deg(-3) },
      { x: 196, y: 174, scale: .97, scaleY: .92, rotation: deg(12) },
      { x: 196, y: 192, scale: .97, scaleY: .88, rotation: deg(15) }
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
      { x: 204, y: 134, scale: .95, scaleY: 1, rotation: deg(4) },
      { x: 192, y: 142, scale: .95, scaleY: 1, rotation: deg(-2) },
      { x: 193, y: 164, scale: .95, scaleY: .92, rotation: deg(11) },
      { x: 194, y: 194, scale: .95, scaleY: .88, rotation: deg(14) }
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
