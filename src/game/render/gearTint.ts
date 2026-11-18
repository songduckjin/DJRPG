import { Texture } from 'pixi.js';
import type { GearPalette } from '../appearance';

export const gearHeadBand = .22;
const MAX_TINTED_TEXTURES = 64;
const tintCache = new Map<string, Texture>();

export function gearTintCacheKey(sourceKey: string, armor: GearPalette | null, helmet: GearPalette | null): string {
  return `${sourceKey}|${armor?.key ?? '-'}|${helmet?.key ?? '-'}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function isSkinPixel(r: number, g: number, b: number): boolean {
  const [h, s, l] = rgbToHsl(r, g, b);
  return r > g && g > b && r - b > 18 && l * 255 >= 60 && l * 255 <= 245 && h >= 10 && h <= 45 && s >= .12 && s <= .55;
}

export function isHairPixel(r: number, g: number, b: number): boolean {
  const [h, s, l] = rgbToHsl(r, g, b);
  const darkBrown = h >= 15 && h <= 50 && s >= .22 && s <= .78 && l >= .12 && l <= .4;
  const blonde = h >= 25 && h <= 55 && s >= .25 && s <= .65 && l >= .55 && l <= .88;
  return darkBrown || blonde;
}

export function tintGearImageData(image: ImageData, palette: GearPalette, strengthScale = 1): void {
  const data = image.data;
  const [th, ts, tl] = rgbToHsl((palette.tint >> 16) & 255, (palette.tint >> 8) & 255, palette.tint & 255);
  const strength = palette.strength * strengthScale;
  if (!strength) return;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], alpha = data[i + 3];
    if (!alpha || isSkinPixel(r, g, b) || isHairPixel(r, g, b)) continue;
    const luma = (r * .2126 + g * .7152 + b * .0722);
    if (luma < 25 || luma > 245) continue;
    const [h, s, l] = rgbToHsl(r, g, b);
    const chromaWeight = 1 - Math.min(1, s) * .55;
    const amount = strength * chromaWeight;
    const [nr, ng, nb] = hslToRgb(h + ((((th - h) + 540) % 360) - 180) * amount, s + (ts - s) * amount, l + (tl - l) * amount);
    data[i] = nr; data[i + 1] = ng; data[i + 2] = nb;
  }
}

export function tintPortraitCanvas(
  source: HTMLImageElement,
  armor: GearPalette | null,
  helmet: GearPalette | null
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, source.naturalWidth);
  canvas.height = Math.max(1, source.naturalHeight);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('장비 초상화 틴트 캔버스를 만들 수 없습니다.');
  context.drawImage(source, 0, 0);
  const bandHeight = Math.floor(canvas.height * gearHeadBand);
  if (helmet && bandHeight > 0) {
    const head = context.getImageData(0, 0, canvas.width, bandHeight);
    tintGearImageData(head, helmet);
    context.putImageData(head, 0, 0);
  }
  if (armor) {
    const bodyTop = helmet ? bandHeight : 0;
    const body = context.getImageData(0, bodyTop, canvas.width, canvas.height - bodyTop);
    tintGearImageData(body, armor);
    context.putImageData(body, 0, bodyTop);
  }
  return canvas;
}

export function tintedGearTexture(
  sourceKey: string,
  source: Texture,
  armor: GearPalette | null,
  helmet: GearPalette | null,
  attack = false
): Texture {
  if (!armor && !helmet) return source;
  const key = gearTintCacheKey(sourceKey, armor, helmet) + (attack ? '|attack' : '|body');
  const cached = tintCache.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return source;
  const width = Math.max(1, Math.round(source.frame.width)), height = Math.max(1, Math.round(source.frame.height));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const resource = source.source.resource as CanvasImageSource;
  if (!context || !resource) return source;
  context.drawImage(resource, source.frame.x, source.frame.y, source.frame.width, source.frame.height, 0, 0, width, height);
  const bandHeight = Math.floor(height * gearHeadBand);
  if (helmet && bandHeight > 0) {
    const head = context.getImageData(0, 0, width, bandHeight);
    tintGearImageData(head, helmet, attack ? .6 : 1);
    context.putImageData(head, 0, 0);
  }
  if (armor) {
    const bodyTop = helmet ? bandHeight : 0;
    const body = context.getImageData(0, bodyTop, width, height - bodyTop);
    tintGearImageData(body, armor, attack ? .6 : 1);
    context.putImageData(body, 0, bodyTop);
  }
  const tinted = Texture.from(canvas);
  tinted.source.scaleMode = source.source.scaleMode;
  tintCache.set(key, tinted);
  if (tintCache.size > MAX_TINTED_TEXTURES) {
    const oldest = tintCache.keys().next().value;
    if (oldest) tintCache.delete(oldest);
  }
  return tinted;
}
