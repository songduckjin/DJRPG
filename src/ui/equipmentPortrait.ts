import {
  costumeAtlasCellHeight, costumeAtlasCellWidth, costumeLayerAtlasUrl, costumeLayerCell, costumeLayerPageIndex,
  type CostumeLayerPlan
} from '../game/render/costumeHero';
import type { Save } from '../game/store';
import { baseItemIndex, isArcher, isMage, usesBaseSheetOnly } from '../game/items';
import { jobOrDefault } from '../game/skills';
import { helmetArtFor, helmetArtPath, helmetIdlePlacement } from '../game/render/helmets';
import { armorIndexFor, armorSheetPath } from '../game/render/armors';
import { WEAPON_GUARD, weaponIndexFor, weaponPartPath, weaponPose, swordlessBodyPath } from '../game/render/weapons';
import { BOW_GRIP, bowIndexFor, bowPartPath, bowPose, bowlessBodyPath } from '../game/render/bows';
import { STAFF_GRIP, staffIndexFor, staffPartPath, staffPose, stafflessBodyPath } from '../game/render/staffs';

/**
 * 내 정보(장비창) 초상화 — Task 149 full-body pilot image. Gear remains functional but its
 * visual is fixed to the same male/female pilot sheet used by the field renderer.
 */

/** 전사 시안은 장착 조합에 맞춘 필드와 같은 전신 그림을 쓴다(작업 155: 갑옷 티어별 시트). */
export function equipmentFallbackPortrait(save: Save): string {
  // 궁수(작업 157·160)·마법사(작업 198)는 기본 시트만 쓴다 — 전용 갑옷·투구·무기 외형은 추후 별도 시안.
  // 작업 159: 궁수 시트를 갈면서 `/assets/*` immutable 캐시를 피하려고 궁수 URL에 `?v=2`를 붙인다
  // (render.ts·charactersModal.ts와 같은 규칙).
  if (usesBaseSheetOnly(save)) {
    // 작업 160: 궁수는 1번 이상 활을 차면 기본 활대를 지운 서기 시트 위에 활 파츠를 얹는다.
    // `nobow/` 시트는 이번에 새로 만든 파일이라 쿼리 없이 그대로 캐시된다.
    if (isArcher(save)) {
      return bowIndexFor(save) >= 1
        ? bowlessBodyPath(save.gender, 'idle')
        : `/assets/pilot-25d/archer_${save.gender}_idle_v1.png?v=2`;
    }
    // 작업 201: 마법사는 지팡이를 찼으면 기본 지팡이를 지운 서기 시트 위에 지팡이 파츠를 얹는다.
    if (isMage(save)) {
      return staffIndexFor(save) >= 0
        ? stafflessBodyPath(save.gender, 'idle')
        : `/assets/pilot-25d/mage_${save.gender}_idle_v1.png`;
    }
    return `/assets/pilot-25d/${jobOrDefault(save.job)}_${save.gender}_idle_v1.png`;
  }
  // 투구를 쓰면 필드와 같은 머리 없는 본체 위에 투구 파츠를 얹는다(작업 152).
  const headless = !!save.equipment.helmet;
  const armor = armorIndexFor(save);
  // 0번이 아닌 검을 차면 필드와 같이 기본 검을 지운 시트를 쓴다(작업 156).
  const swordless = weaponIndexFor(save) >= 1;
  if (armor >= 0) {
    const path = armorSheetPath(save.gender, armor, 'idle', headless, swordless);
    if (path) return path;
  }
  if (swordless) return swordlessBodyPath(save.gender, 'idle', headless);
  if (headless) return `/assets/pilot-25d/headless/warrior_${save.gender}_idle_v1.png`;
  return `/assets/pilot-25d/warrior_${save.gender}_idle_v1.png`;
}

/** 장비창에 합성하는 대검 파츠(작업 156). 파츠는 idle 자세 그대로다. */
export type EquipmentPortraitWeapon = {
  /** 파츠 PNG 경로. */
  path: string;
  /** 본체 362px 셀 좌표에서 손잡이(가드) 점과 회전각(도). */
  x: number;
  y: number;
  rotation: number;
};

/** 착용 무기의 파츠. 0번(기본 두손검)은 본체 시트에 그려져 있어 undefined. 궁수는 활 파츠를 따로 쓰고, 마법사는 무기 외형이 없다. */
export function equipmentPortraitWeapon(save: Save): EquipmentPortraitWeapon | undefined {
  if (usesBaseSheetOnly(save)) return undefined;
  const path = weaponPartPath(weaponIndexFor(save));
  if (!path) return undefined;
  const pose = weaponPose(save.gender, 'idle', 0);
  return { path, x: pose.x, y: pose.y, rotation: pose.rot };
}

/** 장비창에 합성하는 지팡이 파츠(작업 201). 파츠는 서기 자세 그대로다. */
export type EquipmentPortraitStaff = {
  /** 파츠 PNG 경로. */
  path: string;
  /** 본체 362px 셀 좌표에서 그립 점과 회전각(도). */
  x: number;
  y: number;
  rotation: number;
};

/** 착용 지팡이의 파츠. 지팡이가 아니면 undefined. */
export function equipmentPortraitStaff(save: Save): EquipmentPortraitStaff | undefined {
  if (!isMage(save)) return undefined;
  const path = staffPartPath(staffIndexFor(save));
  if (!path) return undefined;
  const pose = staffPose(save.gender, 'idle', 0);
  return { path, x: pose.x, y: pose.y, rotation: pose.rot };
}

/** 장비창에 합성하는 활 파츠(작업 160). 파츠는 서기 자세 그대로다. */
export type EquipmentPortraitBow = {
  /** 파츠 PNG 경로. */
  path: string;
  /** 본체 362px 셀 좌표에서 그립 점과 회전각(도). */
  x: number;
  y: number;
  rotation: number;
};

/** 착용 활의 파츠. 0번(사냥꾼의 활)은 본체 시트에 그려져 있어 undefined. */
export function equipmentPortraitBow(save: Save): EquipmentPortraitBow | undefined {
  if (!isArcher(save)) return undefined;
  const path = bowPartPath(bowIndexFor(save));
  if (!path) return undefined;
  const pose = bowPose(save.gender, 'idle', 0);
  return { path, x: pose.x, y: pose.y, rotation: pose.rot };
}

export type EquipmentPortraitHelmet = {
  /** 투구 머리 파츠 PNG 경로. */
  path: string;
  /** 본체 362px 셀 좌표에서 목 밑동의 x·y 와 배율. */
  x: number;
  y: number;
  scale: number;
};

/** 착용 투구의 머리 파츠. 투구가 없거나 궁수·마법사면 undefined(전신 그림만 그린다). */
export function equipmentPortraitHelmet(save: Save): EquipmentPortraitHelmet | undefined {
  const item = save.equipment.helmet;
  if (!item || usesBaseSheetOnly(save)) return undefined;
  // 장비창은 서기 1프레임이라 정면 파츠를 그대로 쓴다(공격 3/4 파츠는 필드 전용).
  const art = helmetArtFor(save.gender, baseItemIndex(item), 'idle', 0);
  if (!art) return undefined;
  const place = helmetIdlePlacement(save.gender);
  return { path: helmetArtPath(art), x: place.x, y: place.y, scale: place.scale };
}

export type EquipmentPortraitPlan = {
  /**
   * `costume`: 공용 외형 계획으로 그린다(필드와 같은 레이어).
   * `fallback`: 코스튬 계획을 세울 수 없어 전신 초상화 한 장으로 그린다.
   */
  mode: 'costume' | 'fallback';
  /** 즉시 표시용 전신 초상화 경로. 코스튬 합성이 끝나기 전·에셋 없음일 때 이 그림이 보인다. */
  base: string;
  /** 착용 투구가 있으면 전신 초상화 위에 같은 자리·배율로 합성한다. */
  helmet?: EquipmentPortraitHelmet;
  /** 착용 대검이 있으면(1번 이상) 같은 셀 좌표로 합성한다. */
  weapon?: EquipmentPortraitWeapon;
  /** 착용 활이 있으면(1번 이상) 같은 셀 좌표로 합성한다(작업 160). */
  bow?: EquipmentPortraitBow;
  /** 착용 지팡이가 있으면 같은 셀 좌표로 합성한다(작업 201). */
  staff?: EquipmentPortraitStaff;
  /** 캐시 키(성별 + 투구). */
  key: string;
  gender: Save['gender'];
  layers: CostumeLayerPlan[];
};

/**
 * Save → 초상화 계획. 동기 함수이며 이미 로드된 매니페스트만 쓴다(`renderEquipmentPortrait`가
 * 로드를 마친 뒤 다시 호출한다). 고정 시안은 장비 레이어를 표시하지 않는다.
 */
export function equipmentPortraitPlan(save: Save): EquipmentPortraitPlan {
  const base = equipmentFallbackPortrait(save);
  const helmet = equipmentPortraitHelmet(save);
  const weapon = equipmentPortraitWeapon(save);
  const bow = equipmentPortraitBow(save);
  const staff = equipmentPortraitStaff(save);
  // 착용 투구·대검이 바뀌면 합성 결과도 바뀌므로 키에 넣는다(성별 + 갑옷 티어 + 투구 + 검 파츠).
  return {
    mode: 'fallback', base,
    key: usesBaseSheetOnly(save)
      ? (isArcher(save) ? `archer:${save.gender}:${bow ? bow.path : '-'}`
        : isMage(save) ? `mage:${save.gender}:${staff ? staff.path : '-'}` : `${jobOrDefault(save.job)}:${save.gender}`)
      : `pilot:${save.gender}:a${armorIndexFor(save)}:${helmet ? helmet.path : '-'}:${weapon ? weapon.path : '-'}`,
    gender: save.gender, layers: [], helmet, weapon, bow, staff
  };
}

/* ── 아틀라스 이미지·합성 결과 캐시 ─────────────────────────────────────── */

const atlasImages = new Map<string, Promise<HTMLImageElement>>();
const pendingAtlasImages = new Set<string>();
const composingAtlasImages = new Map<string, number>();
const failedPages = new Set<string>();
const portraitCache = new Map<string, Promise<string>>();
const fallbackImages = new Map<string, Promise<HTMLImageElement>>();
/** Portraits are infrequent; keep only two decoded atlas pages after composition. */
export const equipmentPortraitAtlasPageCacheLimit = 2;

export function equipmentPortraitAtlasPageCacheSize(): number { return atlasImages.size; }

function touchAtlasImage(url: string): void {
  const hit = atlasImages.get(url);
  if (!hit) return;
  atlasImages.delete(url);
  atlasImages.set(url, hit);
}

function trimAtlasImages(): void {
  while (atlasImages.size > equipmentPortraitAtlasPageCacheLimit) {
    const oldest = [...atlasImages.keys()].find(url => !pendingAtlasImages.has(url) && !composingAtlasImages.has(url));
    if (!oldest) return;
    atlasImages.delete(oldest);
  }
}

/** 아틀라스/폴백 PNG 로드. 한 번 실패한 URL은 다시 요청하지 않는다(404 폭주 방지). */
function loadImage(url: string, store: Map<string, Promise<HTMLImageElement>>, failed: Set<string>): Promise<HTMLImageElement> {
  const cached = store.get(url);
  if (cached) {
    if (store === atlasImages) touchAtlasImage(url);
    return cached;
  }
  if (failed.has(url)) return Promise.reject(new Error(`이미지 로드 실패(재시도 안 함): ${url}`));
  const loading = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => { failed.add(url); store.delete(url); reject(new Error(`이미지 로딩 실패: ${url}`)); };
    image.src = url;
  });
  store.set(url, loading);
  if (store === atlasImages) {
    pendingAtlasImages.add(url);
    void loading.then(() => {
      pendingAtlasImages.delete(url);
      touchAtlasImage(url);
      trimAtlasImages();
    }, () => pendingAtlasImages.delete(url));
  }
  return loading;
}

/** LRU 조회 — 맞으면 뒤로 옮긴다(가장 오래 안 쓴 키가 먼저 삭제된다). */
function cachedPortrait(key: string): Promise<string> | undefined {
  const hit = portraitCache.get(key);
  if (!hit) return undefined;
  portraitCache.delete(key);
  portraitCache.set(key, hit);
  return hit;
}

function storePortrait(key: string, value: Promise<string>): void {
  portraitCache.set(key, value);
  while (portraitCache.size > 24) portraitCache.delete(portraitCache.keys().next().value!);
}

/* ── 합성 ──────────────────────────────────────────────────────────────── */

/** 미리보기 출력 높이(px). 표시 영역이 190px대라 720px면 축소 표시에 충분하다. */
const portraitOutputHeight = 720;
/** 레이어 회전이 있어도 잘리지 않도록 두는 여백(아트 픽셀). */
const layerPadding = 8;

type Rect = { x: number; y: number; w: number; h: number };

/** 레이어가 차지하는 아트 픽셀 사각형(회전 제외 근사). 페이지·피벗 규약은 필드와 같다. */
function layerRect(layer: CostumeLayerPlan): Rect {
  const w = costumeAtlasCellWidth * layer.scale.x;
  const h = costumeAtlasCellHeight * layer.scale.y;
  return { x: layer.offset.x - layer.anchor.x * w, y: layer.offset.y - layer.anchor.y * h, w, h };
}

function planBounds(layers: CostumeLayerPlan[]): Rect {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const layer of layers) {
    const rect = layerRect(layer);
    left = Math.min(left, rect.x); top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.w); bottom = Math.max(bottom, rect.y + rect.h);
  }
  if (!Number.isFinite(left)) return { x: 0, y: 0, w: costumeAtlasCellWidth, h: costumeAtlasCellHeight };
  return { x: left - layerPadding, y: top - layerPadding, w: right - left + layerPadding * 2, h: bottom - top + layerPadding * 2 };
}

function fitCanvas(width: number, height: number): HTMLCanvasElement {
  const scale = portraitOutputHeight / Math.max(1, height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = portraitOutputHeight;
  return canvas;
}

/** 공용 계획의 레이어를 idle 0프레임으로 합성한다. */
async function composeCostume(layers: CostumeLayerPlan[]): Promise<string> {
  const pageUrls = new Map<string, string>();
  for (const layer of layers) {
    const url = costumeLayerAtlasUrl(layer);
    pageUrls.set(`${layer.page}#${costumeLayerPageIndex(layer)}`, url);
  }
  const pinnedUrls = [...new Set(pageUrls.values())];
  for (const url of pinnedUrls) composingAtlasImages.set(url, (composingAtlasImages.get(url) ?? 0) + 1);
  try {
  const entries = await Promise.all([...pageUrls].map(async ([key, url]) =>
    [key, await loadImage(url, atlasImages, failedPages)] as const));
  const pages = new Map(entries);

  const bounds = planBounds(layers);
  const canvas = fitCanvas(bounds.w, bounds.h);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('장비 초상화 캔버스를 만들 수 없습니다.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const scale = canvas.height / Math.max(1, bounds.h);
  context.scale(scale, scale);
  context.translate(-bounds.x, -bounds.y);

  for (const layer of layers) {
    const page = pages.get(`${layer.page}#${costumeLayerPageIndex(layer)}`)!;
    const columns = Math.floor(page.naturalWidth / costumeAtlasCellWidth);
    const rows = Math.floor(page.naturalHeight / costumeAtlasCellHeight);
    if (columns <= 0 || rows <= 0) throw new Error(`아틀라스 셀 크기가 맞지 않습니다: ${layer.page}`);
    const cell = costumeLayerCell(layer, 'idle', 0);
    const column = cell % columns, row = Math.floor(cell / columns);
    if (row >= rows) throw new Error(`아틀라스 셀 범위를 벗어났습니다: ${layer.page}#${cell}`);
    context.save();
    context.translate(layer.offset.x, layer.offset.y);
    if (layer.rotation) context.rotate(layer.rotation);
    context.scale(layer.scale.x, layer.scale.y);
    context.drawImage(
      page, column * costumeAtlasCellWidth, row * costumeAtlasCellHeight, costumeAtlasCellWidth, costumeAtlasCellHeight,
      -layer.anchor.x * costumeAtlasCellWidth, -layer.anchor.y * costumeAtlasCellHeight, costumeAtlasCellWidth, costumeAtlasCellHeight
    );
    context.restore();
  }
  // 성별은 계획의 본체 페이지(`body-male`/`body-female`)에 이미 반영돼 있어 별도 분기가 없다.
  return canvas.toDataURL('image/png');
  } finally {
    for (const url of pinnedUrls) {
      const count = (composingAtlasImages.get(url) ?? 1) - 1;
      if (count <= 0) composingAtlasImages.delete(url);
      else composingAtlasImages.set(url, count);
    }
    trimAtlasImages();
  }
}

/** 폴백: 전신 초상화 한 장(+착용 투구·대검)을 캔버스에 맞춰 그린다(빈 화면 방지). */
async function composeFallback(
  base: string, helmet?: EquipmentPortraitHelmet, weapon?: EquipmentPortraitWeapon, bow?: EquipmentPortraitBow,
  staff?: EquipmentPortraitStaff
): Promise<string> {
  const image = await loadImage(base, fallbackImages, new Set());
  const canvas = fitCanvas(image.naturalWidth, image.naturalHeight);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('장비 초상화 캔버스를 만들 수 없습니다.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
  context.drawImage(image, (canvas.width - width) / 2, canvas.height - height, width, height);
  if (helmet) {
    try {
      const patch = await loadImage(helmet.path, fallbackImages, new Set());
      // 필드와 같은 362px 셀 좌표 → 초상화 캔버스 좌표(전신 그림이 그려진 배율 그대로).
      const patchScale = helmet.scale * scale;
      const patchWidth = patch.naturalWidth * patchScale, patchHeight = patch.naturalHeight * patchScale;
      const left = (canvas.width - width) / 2 + helmet.x * scale - patchWidth / 2;
      const top = canvas.height - height + helmet.y * scale - patchHeight;
      context.drawImage(patch, left, top, patchWidth, patchHeight);
    } catch (error) {
      console.info('[장비창] 투구 머리 파츠 로딩 실패 → 전신 그림만 표시:', error);
    }
  }
  if (bow) {
    try {
      const patch = await loadImage(bow.path, fallbackImages, new Set());
      // 활 파츠도 362px 셀 좌표계라 전신 그림의 배율·위치에 그대로 얹고 그립 점을 축으로 돌린다.
      const gripX = (canvas.width - width) / 2 + bow.x * scale;
      const gripY = canvas.height - height + bow.y * scale;
      context.save();
      context.translate(gripX, gripY);
      context.rotate(bow.rotation * Math.PI / 180);
      context.drawImage(patch, -BOW_GRIP.x * scale, -BOW_GRIP.y * scale, patch.naturalWidth * scale, patch.naturalHeight * scale);
      context.restore();
    } catch (error) {
      console.info('[장비창] 활 파츠 로딩 실패 → 전신 그림만 표시:', error);
    }
  }
  if (staff) {
    try {
      const patch = await loadImage(staff.path, fallbackImages, new Set());
      // 지팡이 파츠도 362px 셀 좌표계라 전신 그림의 배율·위치에 그대로 얹고 그립 점을 축으로 돌린다.
      const gripX = (canvas.width - width) / 2 + staff.x * scale;
      const gripY = canvas.height - height + staff.y * scale;
      context.save();
      context.translate(gripX, gripY);
      context.rotate(staff.rotation * Math.PI / 180);
      context.drawImage(patch, -STAFF_GRIP.x * scale, -STAFF_GRIP.y * scale, patch.naturalWidth * scale, patch.naturalHeight * scale);
      context.restore();
    } catch (error) {
      console.info('[장비창] 지팡이 파츠 로딩 실패 → 전신 그림만 표시:', error);
    }
  }
  if (weapon) {
    try {
      const patch = await loadImage(weapon.path, fallbackImages, new Set());
      // 파츠는 본체와 같은 362px 셀 좌표계라, 전신 그림이 그려진 배율·위치에 그대로 얹고
      // 손잡이(가드) 점을 축으로 회전시킨다(필드 `syncWeaponPart` 와 같은 규칙).
      const guardX = (canvas.width - width) / 2 + weapon.x * scale;
      const guardY = canvas.height - height + weapon.y * scale;
      const dexed = { x: WEAPON_GUARD.x, y: WEAPON_GUARD.y };
      context.save();
      context.translate(guardX, guardY);
      context.rotate(weapon.rotation * Math.PI / 180);
      context.drawImage(patch, -dexed.x * scale, -dexed.y * scale, patch.naturalWidth * scale, patch.naturalHeight * scale);
      context.restore();
    } catch (error) {
      console.info('[장비창] 대검 파츠 로딩 실패 → 전신 그림만 표시:', error);
    }
  }
  return canvas.toDataURL('image/png');
}

/**
 * 초상화 dataURL. 결과는 계획 키로 캐시하고(LRU 24) 합성 중 같은 요청은 한 번만 만든다.
 * 픽셀 단위 스캔은 하지 않는다 — 팔레트·피부톤 보정은 142 아틀라스가 색으로 담당한다.
 */
export async function renderEquipmentPortrait(save: Save): Promise<string> {
  const plan = equipmentPortraitPlan(save);
  const cached = cachedPortrait(plan.key);
  if (cached) return cached;

  const pending = (async () => {
    if (plan.mode === 'costume') {
      try {
        return await composeCostume(plan.layers);
      } catch (error) {
        console.info('[장비창] 코스튬 합성 실패 → 전신 초상화로 폴백:', error);
      }
    }
    return composeFallback(plan.base, plan.helmet, plan.weapon, plan.bow, plan.staff);
  })();
  storePortrait(plan.key, pending);
  void pending.catch(() => {
    if (portraitCache.get(plan.key) === pending) portraitCache.delete(plan.key);
  });
  return pending;
}

/** 테스트·디버그용 캐시 초기화. */
export function resetEquipmentPortraitCache(): void {
  portraitCache.clear();
  atlasImages.clear();
  pendingAtlasImages.clear();
  fallbackImages.clear();
  failedPages.clear();
}
