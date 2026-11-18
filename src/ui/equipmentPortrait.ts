import { heroAppearance } from '../game/appearance';
import { equipmentImage, type Save, type Slot } from '../game/store';
import { wearableEquipmentImage } from '../game/items';

type Gender = Save['gender'];
type Part = { slot: Slot; path: string; frame: number; columns: number; rows: number; half?: 0 | 1 };
type Rect = { x: number; y: number; w: number; h: number; flip?: boolean };
const visibleSlots = ['armor', 'helmet', 'boots', 'gloves', 'weapon'] as const;
const accessorySlots = ['belt', 'necklace', 'offhand', 'ring1', 'ring2'] as const;
const slots = [...visibleSlots, ...accessorySlots];
const starterFrames = { weapon: 0, helmet: 0, armor: 0, gloves: 0, boots: 2 } as const;

const fit: Record<Gender, Record<Slot, Rect[]>> = {
  male: {
    weapon: [{ x: -3, y: 17, w: 82, h: 85, flip: true }],
    helmet: [{ x: 20, y: 0, w: 38, h: 43 }],
    armor: [{ x: 8, y: 33, w: 62, h: 80 }],
    gloves: [{ x: 0, y: 78, w: 16, h: 36 }, { x: 62, y: 78, w: 16, h: 36 }],
    boots: [{ x: 2, y: 144, w: 31, h: 47 }, { x: 45, y: 144, w: 31, h: 47 }],
    belt: [{ x: 24, y: 89, w: 30, h: 13 }],
    necklace: [{ x: 32, y: 43, w: 14, h: 18 }],
    offhand: [{ x: 54, y: 47, w: 16, h: 18 }],
    ring1: [{ x: 6, y: 104, w: 7, h: 8 }],
    ring2: [{ x: 67, y: 104, w: 7, h: 8 }]
  },
  female: {
    weapon: [{ x: 4, y: 13, w: 77, h: 88 }],
    helmet: [{ x: 21, y: 0, w: 37, h: 43 }],
    armor: [{ x: 11, y: 33, w: 56, h: 81 }],
    gloves: [{ x: 0, y: 77, w: 16, h: 37 }, { x: 62, y: 77, w: 16, h: 37 }],
    boots: [{ x: 3, y: 143, w: 30, h: 48 }, { x: 45, y: 143, w: 30, h: 48 }],
    belt: [{ x: 25, y: 88, w: 28, h: 13 }],
    necklace: [{ x: 33, y: 43, w: 12, h: 17 }],
    offhand: [{ x: 53, y: 47, w: 15, h: 18 }],
    ring1: [{ x: 6, y: 103, w: 7, h: 8 }],
    ring2: [{ x: 67, y: 103, w: 7, h: 8 }]
  }
};

export function equipmentPortraitPlan(save: Save) {
  const bodySave = { ...save, equipment: { ...save.equipment, weapon: undefined, helmet: undefined, armor: undefined } };
  const parts: Part[] = [];
  for (const slot of slots) {
    const item = save.equipment[slot];
    if (!item) continue;
    const wearable = wearableEquipmentImage(item);
    const art = wearable ?? equipmentImage(item);
    if (slot === 'gloves' || slot === 'boots') {
      if (!wearable) continue;
      parts.push({ slot, path: art.path, frame: art.frame, columns: art.columns, rows: wearable.rows, half: 0 });
      parts.push({ slot, path: art.path, frame: art.frame, columns: art.columns, rows: wearable.rows, half: 1 });
    } else {
      parts.push({ slot, path: art.path, frame: art.frame, columns: art.columns, rows: wearable?.rows ?? 1 });
    }
  }
  const starter = visibleSlots.every(slot => {
    const item = save.equipment[slot];
    return item && wearableEquipmentImage(item)?.frame === starterFrames[slot];
  });
  const base = starter ? `/assets/warrior_equipped_starter_${save.gender}.png` : heroAppearance(bodySave).portrait;
  const drawn = starter ? parts.filter(part => accessorySlots.some(slot => slot === part.slot)) : parts;
  const key = `${save.gender}:${base}:${parts.map(part => `${part.slot}:${part.path}:${part.frame}:${part.half ?? ''}`).join('|')}`;
  return { base, parts: drawn, key, starter };
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();
const portraitCache = new Map<string, string>();
function loadImage(path: string): Promise<HTMLImageElement> {
  const existing = imageCache.get(path);
  if (existing) return existing;
  const loading = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`착용 이미지 로딩 실패: ${path}`));
    image.src = path;
  });
  imageCache.set(path, loading);
  void loading.catch(() => imageCache.delete(path));
  return loading;
}

function tightFrame(image: HTMLImageElement, part: Part) {
  const frameWidth = image.naturalWidth / part.columns, frameHeight = image.naturalHeight / part.rows;
  const width = part.half === undefined ? frameWidth : frameWidth / 2;
  const x = part.frame % part.columns * frameWidth + (part.half ?? 0) * width;
  const y = Math.floor(part.frame / part.columns) * frameHeight;
  const scratch = document.createElement('canvas'); scratch.width = Math.round(width); scratch.height = Math.round(frameHeight);
  const context = scratch.getContext('2d', { willReadFrequently: true });
  if (!context) return { x, y, width, height: frameHeight };
  context.drawImage(image, x, y, width, frameHeight, 0, 0, width, frameHeight);
  const pixels = context.getImageData(0, 0, scratch.width, scratch.height).data;
  let left = scratch.width, top = scratch.height, right = -1, bottom = -1;
  for (let row = 0; row < scratch.height; row++) for (let column = 0; column < scratch.width; column++) {
    if (pixels[(row * scratch.width + column) * 4 + 3] < 12) continue;
    left = Math.min(left, column); top = Math.min(top, row);
    right = Math.max(right, column); bottom = Math.max(bottom, row);
  }
  return right < left ? { x, y, width, height: frameHeight }
    : { x: x + left, y: y + top, width: right - left + 1, height: bottom - top + 1 };
}

export async function renderEquipmentPortrait(save: Save): Promise<string> {
  const plan = equipmentPortraitPlan(save);
  const cached = portraitCache.get(plan.key);
  if (cached) return cached;
  const paths = [plan.base, ...new Set(plan.parts.map(part => part.path))];
  const images = await Promise.all(paths.map(loadImage));
  const imageByPath = new Map(images.map((image, index) => [paths[index], image] as const));
  const canvas = document.createElement('canvas'); canvas.width = 312; canvas.height = 768;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('착용 이미지 캔버스를 만들 수 없습니다.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const base = imageByPath.get(plan.base)!;
  if (plan.starter) {
    const bounds = tightFrame(base, { slot: 'armor', path: plan.base, frame: 0, columns: 1, rows: 1 });
    const scale = Math.min(canvas.width / bounds.width, canvas.height / bounds.height);
    const width = bounds.width * scale, height = bounds.height * scale;
    context.drawImage(base, bounds.x, bounds.y, bounds.width, bounds.height, (canvas.width - width) / 2, canvas.height - height, width, height);
  } else context.drawImage(base, 0, 0, canvas.width, canvas.height);
  context.scale(4, 4);
  const partIndex = new Map<Slot, number>();
  for (const part of plan.parts) {
    const image = imageByPath.get(part.path)!;
    const index = partIndex.get(part.slot) ?? 0;
    partIndex.set(part.slot, index + 1);
    const rect = fit[save.gender][part.slot][index];
    if (!rect) continue;
    const source = tightFrame(image, part);
    context.save();
    if (rect.flip) { context.translate(rect.x + rect.w, rect.y); context.scale(-1, 1); }
    context.drawImage(image, source.x, source.y, source.width, source.height, rect.flip ? 0 : rect.x, rect.flip ? 0 : rect.y, rect.w, rect.h);
    context.restore();
  }
  const result = canvas.toDataURL('image/png');
  portraitCache.set(plan.key, result);
  if (portraitCache.size > 24) portraitCache.delete(portraitCache.keys().next().value!);
  return result;
}
