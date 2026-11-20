import type { Rarity } from '../items';

/**
 * 장비 등급색 발광 (작업 218).
 *
 * 유니크·전설 장비만 **스스로 빛난다**. 빛은 `0 → 최대 → 0` 사인 파동으로 숨쉬며, 파동의
 * 시작과 끝에서는 장비가 원래 색 그대로이고 가운데에서만 등급색 빛이 가득 들어온다.
 * 일반·매직·레어·에픽은 빛이 없다(원래 등급 표시 그대로).
 *
 * 대상은 필드 캐릭터의 착용 투구·갑옷·무기 파츠와 내 정보 장착 화면 전신 일러스트의 같은
 * 부위이며, 화면 카드(가방·거래소·도감)에는 쓰지 않는다(작업 217 롤백).
 *
 * 색은 시안 v2에서 확정한 값이다 — 유니크 주황 `#fb923c`, 전설 진한 빨강 `#dc2626`.
 * 주기도 시안 그대로 유니크 2.6초, 전설 2.3초로 전설이 조금 더 빠르게 숨쉰다.
 */
export type GearGlowTone = {
  /** 화면에 얹는 등급색(0xRRGGBB). */
  color: number;
  /** 한 번 숨쉬는 데 걸리는 시간(초). */
  cycle: number;
  /** 가장 밝은 순간의 세기(0~1). 전설이 조금 더 강하다. */
  peak: number;
};

/** 빛이 나는 등급은 유니크·전설 둘뿐이다. 나머지 등급은 표에 없다. */
export const gearGlowTones: Readonly<Partial<Record<Rarity, GearGlowTone>>> = {
  unique: { color: 0xfb923c, cycle: 2.6, peak: 0.58 },
  legendary: { color: 0xdc2626, cycle: 2.3, peak: 0.64 }
};

/** 등급 이름 → 발광 톤. 빛이 없는 등급은 undefined. */
export function gearGlowTone(rarity: Rarity | undefined | null): GearGlowTone | undefined {
  if (!rarity) return undefined;
  return Object.hasOwn(gearGlowTones, rarity) ? gearGlowTones[rarity] : undefined;
}

/** 톤의 색을 CSS·캔버스에서 쓰는 `#rrggbb` 문자열로. */
export function gearGlowCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/**
 * 지금 순간의 빛 세기. `0 → peak → 0` 파동이며 시작·끝은 smoothstep으로 부드럽게 멈춘다.
 *
 * 0초(그리고 주기의 배수)에는 0이라 장비가 원래 색 그대로이고, 반 주기에서 최대가 된다.
 * 필드 렌더러와 장착 화면이 같은 파형을 쓰도록 이 함수 하나가 기준이다.
 */
export function gearGlowAmount(time: number, tone: GearGlowTone): number {
  const cycle = tone.cycle > 0 ? tone.cycle : 1;
  const phase = ((time % cycle) + cycle) % cycle / cycle;
  const wave = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  return wave * wave * (3 - 2 * wave) * tone.peak;
}
