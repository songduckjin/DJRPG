import { heroAppearance, type GearTier } from '../game/appearance';
import { gearTintCacheKey, tintPortraitCanvas } from '../game/render/gearTint';
import type { Save } from '../game/store';

const tierPortrait: Record<GearTier, string> = {
  1: 'starter',
  2: 't2',
  3: 't3',
  4: 't4'
};

export function equipmentPortraitPlan(save: Save) {
  const appearance = heroAppearance(save);
  const hasArmor = !!save.equipment.armor;
  const hasHelmet = !!save.equipment.helmet;
  const starter = hasArmor && hasHelmet && appearance.armorTier === 1;
  let base = appearance.portrait;
  if (hasArmor && hasHelmet && appearance.armorTier) {
    base = `/assets/warrior_equipped_${tierPortrait[appearance.armorTier]}_${save.gender}.png`;
  }
  const parts: [] = [];
  const key = gearTintCacheKey(base, appearance.armorPalette, appearance.helmetPalette);
  return { base, parts, key, starter };
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();
const portraitCache = new Map<string, Promise<string>>();

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

export function renderEquipmentPortrait(save: Save): Promise<string> {
  const plan = equipmentPortraitPlan(save);
  const cached = portraitCache.get(plan.key);
  if (cached) {
    portraitCache.delete(plan.key);
    portraitCache.set(plan.key, cached);
    return cached;
  }

  const rendering = (async () => {
    const base = await loadImage(plan.base);
    const canvas = document.createElement('canvas');
    canvas.width = 312;
    canvas.height = 768;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('착용 이미지 캔버스를 만들 수 없습니다.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    const appearance = heroAppearance(save);
    const portrait = appearance.armorPalette || appearance.helmetPalette
      ? tintPortraitCanvas(base, appearance.armorPalette, appearance.helmetPalette)
      : base;
    context.drawImage(portrait, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  })();
  portraitCache.set(plan.key, rendering);
  void rendering.catch(() => {
    if (portraitCache.get(plan.key) === rendering) portraitCache.delete(plan.key);
  });
  if (portraitCache.size > 24) portraitCache.delete(portraitCache.keys().next().value!);
  return rendering;
}
