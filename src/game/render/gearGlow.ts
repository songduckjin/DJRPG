import { Texture } from 'pixi.js';
import type { Rarity } from '../items';

/**
 * 장비 등급색 발광 (작업 218, 세기 강화 231).
 *
 * 유니크·전설 장비만 **스스로 빛난다**. 빛은 `0 → 최대 → 0` 사인 파동으로 숨쉬며, 파동의
 * 시작과 끝에서는 장비가 원래 색 그대로이고 가운데에서만 등급색 빛이 가득 들어온다.
 * 일반·매직·레어·에픽은 빛이 없다(원래 등급 표시 그대로).
 *
 * 대상은 필드 캐릭터의 착용 투구·갑옷·무기 파츠와 내 정보 장착 화면 전신 일러스트의 같은
 * 부위이며, 화면 카드(가방·거래소·도감)에는 쓰지 않는다(작업 217 롤백).
 *
 * [작업 231] 사용자 요청 "발광 색·세기를 지금보다 훨씬 진하게"에 따라 색을 더 진한 주황·
 * 선명한 빨강으로 바꾸고 세기를 크게 올렸다(유니크 0.58 → 0.92, 전설 0.64 → 1.0). 주기와
 * 파형은 그대로다 — 유니크 2.6초, 전설 2.3초로 전설이 조금 더 빠르게 숨쉰다.
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
  unique: { color: 0xff7a00, cycle: 2.6, peak: 0.92 },
  legendary: { color: 0xef1a1a, cycle: 2.3, peak: 1 }
};

/**
 * 발광을 이루는 겹(작업 231).
 *
 * 한 겹으로는 "진한 색"과 "빛"을 같이 낼 수 없다. 가산(add)만 쓰면 밝은 금속이 주황·빨강으로
 * 물드는 대신 노랗게 날아가고, 곱하기(multiply)만 쓰면 장비가 어두워진다. 그래서 필드는
 * ① 등급색을 진하게 깔아 주는 multiply 층 ② 장비 면에서 뿜어 나오는 가산 층 ③ 실루엣 밖으로
 * 넓게 번지는 가산 후광 층을 겹쳐, 장비 전체가 등급색으로 빛나 보이게 한다.
 *
 * `weight`는 파동 세기(0~peak)에 곱하는 비율, `scale`은 원본 파츠 대비 크기다.
 */
export type GearGlowLayerSpec = {
  mode: 'multiply' | 'add';
  weight: number;
  scale: number;
  /** `flat`: 원본 파츠 텍스처 + 등급색 tint(명암이 그대로 남는다) · `emissive`: 밝기 비례 발광 텍스처. */
  source: 'flat' | 'emissive';
};

export const gearGlowLayers: readonly GearGlowLayerSpec[] = [
  // 곱하기는 **원본 텍스처**로 해야 장비의 명암·판금 경계가 남는다(발광 텍스처끼리 곱하면 면이 납작해진다).
  { mode: 'multiply', weight: .42, scale: 1, source: 'flat' },
  { mode: 'add', weight: .58, scale: 1, source: 'emissive' },
  { mode: 'add', weight: .45, scale: 1.12, source: 'emissive' }
];

/**
 * 발광을 얹는 부위. 투구·갑옷·무기가 같은 표를 쓰되, 마스크로 **파츠 일부만** 빛내는
 * 부위(사용자 확정 1안)는 겹 구성이 다르다.
 */
export type GearGlowPart = 'armor' | 'helmet' | 'weapon';

/**
 * 부위별 겹 구성(작업 248).
 *
 * 투구는 사용자 확정 1안 — **파츠만 깔끔하게 발광하고 오라가 번지지 않는다**. 그래서 실루엣 밖으로
 * 1.12배 키워 번지는 후광 겹(③)을 빼고, 파츠 위의 두 겹(진한 색 + 가산 빛)만 남긴다.
 * 그 두 겹도 `GearGlowMask`(투구 PNG 알파 마스크)로 잘라 얼굴·목·어깨·머리카락이 물들지 않는다.
 * 갑옷·무기는 종전 3겹 그대로다(갑옷은 다음 작업에서 같은 방식으로 좁힌다).
 */
export function gearGlowLayersFor(part: GearGlowPart): readonly GearGlowLayerSpec[] {
  return part === 'helmet' ? gearGlowLayers.filter(layer => layer.scale <= 1) : gearGlowLayers;
}

/**
 * 발광 마스크(작업 248) — 파츠와 **같은 크기**의 흰 PNG(알파=발광 세기).
 *
 * 필드는 파츠와 같은 앵커·위치·배율로 이 텍스처를 스프라이트로 얹어 `mask` 로 걸고,
 * 장착 화면은 파츠를 등급색으로 칠한 캔버스에 `destination-in` 으로 도려낸다. 부위마다
 * 다른 마스크(투구 PNG·갑옷 절차 마스크)를 같은 방식으로 넘길 수 있게 텍스처 하나로 표현한다.
 */
export type GearGlowMask = Texture;

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

/**
 * 필드 발광용 "빛나는 텍스처"(작업 231).
 *
 * 파츠 텍스처의 픽셀을 **밝기(루미넌스) 비례 등급색**으로 바꾼 텍스처를 만든다. 그래서 밝은
 * 금속면은 등급색으로 타오르고 어두운 틈새·무늬는 어두운 등급색으로 남아 질감이 살아 있다
 * (장착 화면 `paintPatch`와 같은 식). 스프라이트 `tint`만 곱하면 어두운 갑옷이 거의 빛나지
 * 않으므로, 발광 층은 이 텍스처를 쓴다.
 *
 * 발광은 본래 번지는 빛이라 원본의 **1/3 크기**로 구워 올린다(픽셀 수 1/9 — 프레임이 바뀔 때
 * 드는 비용과 메모리를 줄이고, 확대되며 부드러워지는 것은 발광에 오히려 맞다). 스프라이트는
 * 원본과 같은 앵커·위치에서 `scale × 배율`로 키워 얹는다.
 */
const GLOW_TEXTURE_CACHE = 72;
const GLOW_TEXTURE_DIVISOR = 3;
const glowTextures = new Map<string, Texture>();

export function glowGearTexture(source: Texture, color: number, key: string): Texture | undefined {
  if (typeof document === 'undefined') return undefined;
  const cacheKey = `${key}|${color.toString(16)}`;
  const cached = glowTextures.get(cacheKey);
  if (cached) return cached;
  const resource = source.source?.resource as CanvasImageSource | undefined;
  if (!resource) return undefined;
  const width = Math.max(1, Math.round(source.frame.width / GLOW_TEXTURE_DIVISOR));
  const height = Math.max(1, Math.round(source.frame.height / GLOW_TEXTURE_DIVISOR));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return undefined;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    resource, source.frame.x, source.frame.y, source.frame.width, source.frame.height,
    0, 0, width, height
  );
  const frame = context.getImageData(0, 0, width, height);
  const pixels = frame.data;
  const rgb = [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha === 0) continue;
    const lum = (0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2]) / 255;
    // 세기는 등급색 **밝기**만 올린다(1.25배 상한). 색 채널을 2배 넘게 곱하면 주황이 노랗게,
    // 빨강이 분홍으로 날아가 "진한 등급색"이 아니라 흰빛이 된다.
    const light = Math.min(1.25, .45 + 1.55 * lum);
    pixels[index] = Math.min(255, rgb[0] * light);
    pixels[index + 1] = Math.min(255, rgb[1] * light);
    pixels[index + 2] = Math.min(255, rgb[2] * light);
  }
  context.putImageData(frame, 0, 0);
  const glow = Texture.from(canvas);
  glowTextures.set(cacheKey, glow);
  if (glowTextures.size > GLOW_TEXTURE_CACHE) {
    const oldest = glowTextures.keys().next().value;
    if (oldest) glowTextures.delete(oldest);
  }
  return glow;
}
