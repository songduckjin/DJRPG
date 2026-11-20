// The art of one coin of a gold heap (작업 196): the original coin, squashed to lie on the floor, with
// its own 1px warm brown boundary and a 2px darker gold edge under it for thickness.
//
// Both screens bake this same chip, once per coin size, at `CHIP_SCALE` device pixels per screen
// pixel: the field turns it into a Pixi texture, the dungeon into a data URL for an `<img>`. Baking
// (rather than stacking three sprites or a CSS drop-shadow chain per coin) is what keeps the 1px
// boundary exactly 1px and the gold bright — a scaled-up copy of the art would give a soft brown
// fringe, and a per-frame filter chain on ten boss heaps would cost more than one small bitmap.
//
// Nothing here invents a new picture: the coin is still `/assets/icons/gold-coin.png`. Only its
// colour is lifted (`GOLD_PILE_BRIGHTNESS`/`GOLD_PILE_CONTRAST`), and the boundary and edge are drawn
// from the art's own silhouette.

import { Texture } from 'pixi.js';
import {
  GOLD_COIN_EDGE, GOLD_COIN_RIM, GOLD_PILE, GOLD_PILE_BRIGHTNESS, GOLD_PILE_CONTRAST, GOLD_PILE_EDGE, GOLD_PILE_RIM,
  goldCoinChipHeight, goldCoinChipWidth, goldCoinHeight, type GoldCoin,
} from './goldPile';

/** Device pixels the chip is painted at, per screen pixel. Four keeps the 1px boundary crisp under a
 *  phone's 2~3x display without a big bitmap. */
const CHIP_SCALE = 4;
/** The 3×3 ring of one-pixel steps that turns a silhouette into a 1px boundary. */
const EDGE_RING: readonly (readonly [number, number])[] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const edgeInk = `#${GOLD_PILE_EDGE.toString(16).padStart(6, '0')}`;
const rimInk = `#${GOLD_PILE_RIM.toString(16).padStart(6, '0')}`;

/** The coin art, lifted out of the dark floor: brightness, then contrast, exactly as the CSS
 *  `brightness(1.10) contrast(1.08)` would. Kept per image, because the conversion is per pixel. */
const brightCache = new WeakMap<object, HTMLCanvasElement | undefined>();

function lifted(image: CanvasImageSource, width: number, height: number): HTMLCanvasElement | undefined {
  if (typeof document === 'undefined') return undefined;
  const key = image as unknown as object;
  if (brightCache.has(key)) return brightCache.get(key);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) { brightCache.set(key, undefined); return undefined; }
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height), data = pixels.data;
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const value = data[index + channel] / 255 * GOLD_PILE_BRIGHTNESS;
      data[index + channel] = Math.max(0, Math.min(255, Math.round(((value - .5) * GOLD_PILE_CONTRAST + .5) * 255)));
    }
  }
  context.putImageData(pixels, 0, 0);
  brightCache.set(key, canvas);
  return canvas;
}

/** The art's silhouette in one flat colour, scaled to a coin of `coin`'s size. */
function silhouette(image: CanvasImageSource, coin: GoldCoin, ink: string): HTMLCanvasElement | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(coin.size * CHIP_SCALE); canvas.height = Math.round(goldCoinHeight(coin) * CHIP_SCALE);
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = ink; context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/** One coin's chip: boundary, thickness edge, then the lifted coin itself. */
export function paintGoldCoinChip(image: CanvasImageSource, width: number, height: number, coin: GoldCoin): HTMLCanvasElement | undefined {
  if (typeof document === 'undefined') return undefined;
  const coinArt = lifted(image, width, height), edge = silhouette(image, coin, edgeInk), rim = silhouette(image, coin, rimInk);
  if (!coinArt || !edge || !rim) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(goldCoinChipWidth(coin) * CHIP_SCALE);
  canvas.height = Math.round(goldCoinChipHeight(coin) * CHIP_SCALE);
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  const step = CHIP_SCALE, artWidth = coin.size * step, artHeight = goldCoinHeight(coin) * step;
  const left = GOLD_COIN_EDGE * step, floor = (GOLD_COIN_EDGE + GOLD_COIN_RIM) * step;
  // The boundary wraps the coin and the thickness under it together, so the edge reads as one solid
  // coin standing on the floor rather than a coin floating over a band.
  for (const [dx, dy] of EDGE_RING) {
    context.drawImage(edge, left + dx * step, (GOLD_COIN_EDGE + dy) * step, artWidth, artHeight);
    context.drawImage(edge, left + dx * step, floor + dy * step, artWidth, artHeight);
  }
  context.drawImage(rim, left, floor, artWidth, artHeight);
  context.drawImage(coinArt, left, GOLD_COIN_EDGE * step, artWidth, artHeight);
  return canvas;
}

/** A chip as a Pixi texture for the field. One texture per coin size, so ten boss heaps of ten coins
 *  still cost one texture each and one sprite per coin. */
export function goldCoinChipTexture(source: Texture, coin: GoldCoin): Texture | undefined {
  const image = source.source.resource as unknown as CanvasImageSource | undefined;
  if (!image) return undefined;
  try {
    const canvas = paintGoldCoinChip(image, source.source.width, source.source.height, coin);
    if (!canvas) return undefined;
    const texture = Texture.from(canvas);
    texture.source.scaleMode = 'linear';
    return texture;
  } catch { return undefined; /* an art the canvas cannot draw: the plain coin is still a coin */ }
}

/** The coin art the dungeon bakes from, decoded once when the arena opens. */
let coinImage: HTMLImageElement | undefined;
const chipUrls = new Map<string, string>();

/** Loads `/assets/icons/gold-coin.png` for the dungeon and bakes every chip of the heap, so the first
 *  kill already draws finished coins. Resolves false when the art cannot be read; the dungeon then
 *  keeps its plain coin images. */
export async function warmGoldCoinChips(path = '/assets/icons/gold-coin.png'): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (!coinImage) {
    const image = new Image(); image.src = path;
    try { await image.decode(); } catch { return false; }
    coinImage = image;
  }
  for (const coin of GOLD_PILE) if (!chipUrl(coin)) return false;
  return true;
}

/** A chip as a data URL, for the dungeon's DOM images. */
export function goldCoinChipUrl(coin: GoldCoin): string | undefined { return chipUrl(coin); }

function chipUrl(coin: GoldCoin): string | undefined {
  const key = `${coin.size}x${goldCoinHeight(coin)}`;
  const cached = chipUrls.get(key);
  if (cached) return cached;
  if (!coinImage) return undefined;
  try {
    const canvas = paintGoldCoinChip(coinImage, coinImage.naturalWidth || 256, coinImage.naturalHeight || 256, coin);
    if (!canvas) return undefined;
    const url = canvas.toDataURL('image/png');
    chipUrls.set(key, url);
    return url;
  } catch { return undefined; }
}
