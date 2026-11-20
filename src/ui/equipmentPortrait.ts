import {
  costumeAtlasCellHeight, costumeAtlasCellWidth, costumeLayerAtlasUrl, costumeLayerCell, costumeLayerPageIndex,
  type CostumeLayerPlan
} from '../game/render/costumeHero';
import type { Save } from '../game/store';
import { baseItemIndex, isArcher, isMage, usesBaseSheetOnly } from '../game/items';
import { jobOrDefault } from '../game/skills';
import { helmetArtFor, helmetArtPath, helmetIdlePlacement } from '../game/render/helmets';
import { armorIndexFor, armorSheetPath } from '../game/render/armors';
import { archerArmorIndexFor, archerArmorSheetPath } from '../game/render/archerArmors';
import { mageRobeIndexFor, robeHeadlessSheetPath, robeSheetPath } from '../game/render/robes';
import { WEAPON_GUARD, weaponIndexFor, weaponPartPath, weaponPose, swordlessBodyPath } from '../game/render/weapons';
import { BOW_GRIP, bowIndexFor, bowPartPath, bowPose, bowlessBodyPath, usesBowlessBody } from '../game/render/bows';
import { STAFF_GRIP, staffIndexFor, staffPartPath, staffPlacement, stafflessBodyPath } from '../game/render/staffs';
import { archerHeadlessBodyPath, archerHelmIdlePlacement, archerHelmIndexFor, archerHelmPartPath } from '../game/render/archerHelmets';
import { mageHeadlessBodyPath, mageHelmIdlePlacement, mageHelmIndexFor, mageHelmPartPath } from '../game/render/mageHelmets';
import { gearGlowCss, gearGlowTone } from '../game/render/gearGlow';

/**
 * 내 정보(장비창) 초상화 — Task 149 full-body pilot image. Gear remains functional but its
 * visual is fixed to the same male/female pilot sheet used by the field renderer.
 */

/** 전사 시안은 장착 조합에 맞춘 필드와 같은 전신 그림을 쓴다(작업 155: 갑옷 티어별 시트). */
export function equipmentFallbackPortrait(save: Save): string {
  // 궁수(작업 157·160)·마법사(작업 198)는 기본 시트 계열만 쓴다 — 전용 갑옷·투구·무기 외형은 추후 별도 시안.
  // 작업 159: 궁수 시트를 갈면서 `/assets/*` immutable 캐시를 피하려고 궁수 URL에 `?v=2`를 붙인다
  // (render.ts·charactersModal.ts와 같은 규칙). 새로 만든 `nobow/`·`archer_armors/` 시트는 새 파일이라 그대로 캐시된다.
  if (usesBaseSheetOnly(save)) {
    // 작업 160(활): 1번 이상 활을 차면 기본 활대를 지운 서기 시트 위에 활 파츠를 얹는다.
    // 작업 160(갑옷): 갑옷 1~9번은 그 티어의 궁수 갑옷 서기 시트를 쓰고, 활을 바꿨으면 같은 티어의
    // 기본 활대를 지운 판(`archer_armors/nobow/`)을 쓴다.
    // 작업 200: 궁수 투구를 쓰면 필드와 같이 머리를 지운 시트를 쓴다(투구 파츠가 그 자리를 덮는다).
    if (isArcher(save)) {
      const helmeted = archerHelmIndexFor(save) >= 0;
      const bowless = usesBowlessBody(save);
      const tier = archerArmorIndexFor(save);
      if (tier >= 1) {
        // 갑옷 1~9번은 그 티어 시트 — 투구를 썼으면 머리 지운 판, 활을 바꿨으면 활 지운 판.
        const armorSheet = archerArmorSheetPath(save.gender, tier, 'idle', bowless, helmeted)
          ?? archerArmorSheetPath(save.gender, tier, 'idle', bowless);
        if (armorSheet) return armorSheet;
      }
      if (helmeted) return archerHeadlessBodyPath(save.gender, 'idle', bowless);
      return bowless
        ? bowlessBodyPath(save.gender, 'idle')
        : `/assets/pilot-25d/archer_${save.gender}_idle_v1.png?v=2`;
    }
    // 작업 201: 마법사는 지팡이를 찼으면 기본 지팡이를 지운 서기 시트 위에 지팡이 파츠를 얹는다.
    // 작업 204: 투구를 쓰면 필드와 같은 자리에서 머리를 지운 시트를 쓴다(지팡이 착용 여부로 판이 갈린다).
    // 작업 208: 갑옷 1~9번이면 그 티어 로브 시트를 쓰고, 투구를 함께 쓰면 로브의 머리 없는 판을 쓴다.
    if (isMage(save)) {
      const staffless = staffIndexFor(save) >= 0;
      const helm = mageHelmIndexFor(save) >= 0;
      const robe = mageRobeIndexFor(save);
      if (robe >= 1) {
        const robePath = helm ? robeHeadlessSheetPath(save.gender, robe, 'idle') : robeSheetPath(save.gender, robe, 'idle');
        if (robePath) return robePath;
      }
      if (helm) return mageHeadlessBodyPath(save.gender, 'idle', staffless);
      return staffless
        ? stafflessBodyPath(save.gender, 'idle')
        : `/assets/pilot-25d/mage_${save.gender}_idle_v1.png?v=2`;
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
  /** 파츠 배율 — 남성 서기는 0.83525(작업 204 서기 본체 재생성). */
  scale: number;
};

/** 착용 지팡이의 파츠. 지팡이가 아니면 undefined. */
export function equipmentPortraitStaff(save: Save): EquipmentPortraitStaff | undefined {
  if (!isMage(save)) return undefined;
  const path = staffPartPath(staffIndexFor(save));
  if (!path) return undefined;
  const pose = staffPlacement(save.gender, 'idle', 0);
  return { path, x: pose.x, y: pose.y, rotation: pose.rot, scale: pose.scale };
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

/**
 * 장비창에 합성하는 궁수 투구 파츠(작업 200).
 *
 * 전사 투구 파츠는 목 밑동을 앵커로 쓰는 작은 그림이지만, 궁수 파츠는 서기 셀 크기 그대로의
 * **전체 셀 PNG**라 필드와 같이 좌상단 좌표·배율만 쓴다(서기라 (0,0)·1).
 */
export type EquipmentPortraitArcherHelm = {
  /** 전체 셀 파츠 PNG 경로. */
  path: string;
  /** 362px 셀 좌표에서 파츠 좌상단과 배율. */
  x: number;
  y: number;
  scale: number;
};

/** 착용 궁수 투구 파츠. 궁수가 아니거나 투구가 없으면 undefined. */
export function equipmentPortraitArcherHelm(save: Save): EquipmentPortraitArcherHelm | undefined {
  if (!isArcher(save)) return undefined;
  const path = archerHelmPartPath(save.gender, archerHelmIndexFor(save));
  if (!path) return undefined;
  const place = archerHelmIdlePlacement;
  return { path, x: place.x, y: place.y, scale: place.scale };
}

/**
 * 장비창에 합성하는 마법사 투구 파츠(작업 204).
 *
 * 궁수 투구와 같이 전체 셀 PNG 라 좌상단 좌표·배율만 쓴다. 파츠 PNG 는 셀 위로 44행 더 크므로
 * 서기 좌표의 y 가 음수(`-44`)이고, 초상화는 그만큼 위로 여백을 두고 그린다.
 */
export type EquipmentPortraitMageHelm = {
  /** 전체 셀 파츠 PNG 경로. */
  path: string;
  /** 362px 셀 좌표에서 파츠 좌상단과 배율. */
  x: number;
  y: number;
  scale: number;
};

/** 착용 마법사 투구 파츠. 마법사가 아니거나 투구가 없으면 undefined. */
export function equipmentPortraitMageHelm(save: Save): EquipmentPortraitMageHelm | undefined {
  if (!isMage(save)) return undefined;
  const path = mageHelmPartPath(save.gender, mageHelmIndexFor(save));
  if (!path) return undefined;
  const place = mageHelmIdlePlacement;
  return { path, x: place.x, y: place.y, scale: place.scale };
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
  /** 궁수 전용 투구 파츠(전체 셀). 있으면 전신 초상화 위에 좌상단 좌표로 얹는다(작업 200). */
  archerHelm?: EquipmentPortraitArcherHelm;
  /** 마법사 전용 모자·투구 파츠(전체 셀, 셀 위 여유 44행). 있으면 좌상단 좌표로 얹는다(작업 204). */
  mageHelm?: EquipmentPortraitMageHelm;
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
  const archerHelm = equipmentPortraitArcherHelm(save);
  const mageHelm = equipmentPortraitMageHelm(save);
  const weapon = equipmentPortraitWeapon(save);
  const bow = equipmentPortraitBow(save);
  const staff = equipmentPortraitStaff(save);
  // 착용 투구·대검이 바뀌면 합성 결과도 바뀌므로 키에 넣는다(성별 + 갑옷 티어 + 투구 + 검 파츠).
  return {
    mode: 'fallback', base,
    key: usesBaseSheetOnly(save)
      // 마법사만 로브 티어를 키에 넣는다(궁수는 활·투구 파츠, 그 외는 직업:성별).
      ? (isArcher(save)
        ? `archer:${save.gender}:a${archerArmorIndexFor(save)}:${bow ? bow.path : '-'}:${archerHelm ? archerHelm.path : '-'}`
        : isMage(save)
          ? `mage:${save.gender}:r${mageRobeIndexFor(save)}:${staff ? staff.path : '-'}:${mageHelm ? mageHelm.path : '-'}`
          : `${jobOrDefault(save.job)}:${save.gender}`)
      : `pilot:${save.gender}:a${armorIndexFor(save)}:${helmet ? helmet.path : '-'}:${weapon ? weapon.path : '-'}`,
    gender: save.gender, layers: [], helmet, archerHelm, mageHelm, weapon, bow, staff
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
export const portraitOutputHeight = 720;

/**
 * 초상화 합성 옵션(작업 210).
 *
 * 캐릭터 선택 카드처럼 작게 보이는 곳은 `height`를 낮춰 같은 그림을 가볍게 만든다 —
 * 결과는 높이까지 포함한 키로 캐시되므로 장비창(720px)과 카드(360px)가 서로를 덮어쓰지 않는다.
 */
export type EquipmentPortraitOptions = { height?: number };
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

function fitCanvas(width: number, height: number, outputHeight = portraitOutputHeight): HTMLCanvasElement {
  const scale = outputHeight / Math.max(1, height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = outputHeight;
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

/** 장착 화면 발광의 부위 — 갑옷(몸체 시트) · 투구 · 무기. */
export type GlowSlot = 'armor' | 'helmet' | 'weapon';

/** 발광 레이어 한 장을 그릴 때의 지시. */
type PortraitGlow = { slot: GlowSlot; color: string };

/**
 * 얼굴 자리(362px 셀 좌표). 갑옷은 몸체 시트에 함께 그려져 있어, 시트 전체를 물들이면 맨 얼굴까지
 * 등급색이 된다. 그래서 갑옷 발광 레이어에서는 이 자리만 도려내 원래 얼굴을 남긴다.
 * 투구를 쓰면 머리는 시트에 없으므로(머리 없는 시트) 도려낼 것이 없다.
 */
const headCell = { x: 228, y: 74, rx: 38, ry: 44 } as const;

/**
 * 파츠 한 장을 그린다 — 원본 그대로, 또는 등급색 빛으로 물들여서(작업 218).
 *
 * 발광일 때는 같은 그림을 등급색으로 채운 사본을 `shadowBlur` 후광과 함께 얹는다. 장착 화면은
 * 정지 사진이라 필드처럼 매 프레임 계산하지 않고, 이 레이어를 DOM에서 opacity 로 숨쉬게 한다.
 */
function paintPatch(
  context: CanvasRenderingContext2D, image: HTMLImageElement,
  x: number, y: number, width: number, height: number, glow?: string
): void {
  if (!glow) { context.drawImage(image, x, y, width, height); return; }
  const tinted = document.createElement('canvas');
  tinted.width = Math.max(1, Math.round(image.naturalWidth));
  tinted.height = Math.max(1, Math.round(image.naturalHeight));
  const paint = tinted.getContext('2d');
  if (!paint) { context.drawImage(image, x, y, width, height); return; }
  paint.imageSmoothingEnabled = true;
  paint.imageSmoothingQuality = 'high';
  paint.drawImage(image, 0, 0);
  // 원본 픽셀의 **밝기(루미넌스)** 를 광량으로 써서 등급색 빛으로 바꾼다 — 어두운 틈새·무늬는 어둡게
  // 남아 질감이 살고, 밝은 금속면이 세게 빛난다(불투명하게 덮는 '물감칠'이 아니다).
  const rgb = parseGlowColor(glow);
  const frame = paint.getImageData(0, 0, tinted.width, tinted.height);
  const pixels = frame.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha === 0) continue;
    const lum = (0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2]) / 255;
    const light = Math.min(1.6, .3 + 1.2 * lum);
    pixels[index] = Math.min(255, rgb[0] * light);
    pixels[index + 1] = Math.min(255, rgb[1] * light);
    pixels[index + 2] = Math.min(255, rgb[2] * light);
  }
  paint.putImageData(frame, 0, 0);
  context.save();
  context.shadowColor = glow;
  context.shadowBlur = Math.max(6, Math.round(width * .022));
  context.drawImage(tinted, x, y, width, height);
  context.restore();
}

/** CSS·캔버스용 `#rrggbb` → [r, g, b]. */
function parseGlowColor(color: string): [number, number, number] {
  const value = Number.parseInt(color.replace('#', ''), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** 폴백: 전신 초상화 한 장(+착용 투구·대검)을 캔버스에 맞춰 그린다(빈 화면 방지). */
async function composeFallback(
  base: string, helmet?: EquipmentPortraitHelmet, weapon?: EquipmentPortraitWeapon, bow?: EquipmentPortraitBow,
  archerHelm?: EquipmentPortraitArcherHelm, staff?: EquipmentPortraitStaff, mageHelm?: EquipmentPortraitMageHelm,
  outputHeight = portraitOutputHeight, glow?: PortraitGlow
): Promise<string> {
  const image = await loadImage(base, fallbackImages, new Set());
  // 마법사 투구 파츠는 셀 위로 솟는다(고깔모·후광). 그만큼 초상화 위쪽에 여백을 두고 전체를 맞춘다
  // (`object-fit: contain` 이라 그림이 잘리지 않고 조금 작아질 뿐이다).
  const overflow = mageHelm ? Math.max(0, -mageHelm.y * mageHelm.scale) : 0;
  const artHeight = image.naturalHeight + overflow;
  const canvas = fitCanvas(image.naturalWidth, artHeight, outputHeight);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('장비 초상화 캔버스를 만들 수 없습니다.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / artHeight);
  const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
  const left = (canvas.width - width) / 2;
  const top = canvas.height - height;
  // 발광 레이어(`glow`)는 그 부위만 그린 투명 PNG다. 나머지 부위는 건너뛴다.
  const wants = (slot: GlowSlot): boolean => !glow || glow.slot === slot;
  if (wants('armor')) {
    paintPatch(context, image, left, top, width, height, glow?.color);
    // 갑옷은 몸체 시트 전체라 얼굴까지 물들면 안 된다 — 머리 자리를 도려내 맨 얼굴은 원래 색으로 남긴다.
    if (glow) {
      context.save();
      context.globalCompositeOperation = 'destination-out';
      context.beginPath();
      context.ellipse(left + headCell.x * scale, top + headCell.y * scale, headCell.rx * scale, headCell.ry * scale, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }
  if (helmet && wants('helmet')) {
    try {
      const patch = await loadImage(helmet.path, fallbackImages, new Set());
      // 필드와 같은 362px 셀 좌표 → 초상화 캔버스 좌표(전신 그림이 그려진 배율 그대로).
      const patchScale = helmet.scale * scale;
      const patchWidth = patch.naturalWidth * patchScale, patchHeight = patch.naturalHeight * patchScale;
      const patchLeft = left + helmet.x * scale - patchWidth / 2;
      const patchTop = top + helmet.y * scale - patchHeight;
      paintPatch(context, patch, patchLeft, patchTop, patchWidth, patchHeight, glow?.color);
    } catch (error) {
      console.info('[장비창] 투구 머리 파츠 로딩 실패 → 전신 그림만 표시:', error);
    }
  }
  if (bow && wants('weapon')) {
    try {
      const patch = await loadImage(bow.path, fallbackImages, new Set());
      // 활 파츠도 362px 셀 좌표계라 전신 그림의 배율·위치에 그대로 얹고 그립 점을 축으로 돌린다.
      const gripX = left + bow.x * scale;
      const gripY = top + bow.y * scale;
      context.save();
      context.translate(gripX, gripY);
      context.rotate(bow.rotation * Math.PI / 180);
      paintPatch(context, patch, -BOW_GRIP.x * scale, -BOW_GRIP.y * scale, patch.naturalWidth * scale, patch.naturalHeight * scale, glow?.color);
      context.restore();
    } catch (error) {
      console.info('[장비창] 활 파츠 로딩 실패 → 전신 그림만 표시:', error);
    }
  }
  if (archerHelm && wants('helmet')) {
    try {
      const patch = await loadImage(archerHelm.path, fallbackImages, new Set());
      // 궁수 투구 파츠는 본체와 같은 362px 셀 전체 크기라, 본체 그림의 배율·좌상단에 그대로 얹는다.
      const layerScale = archerHelm.scale * scale;
      paintPatch(context, patch, left + archerHelm.x * scale, top + archerHelm.y * scale, patch.naturalWidth * layerScale, patch.naturalHeight * layerScale, glow?.color);
    } catch (error) {
      console.info('[장비창] 궁수 투구 파츠 로딩 실패 → 전신 그림만 표시:', error);
    }
  }
  if (mageHelm && wants('helmet')) {
    try {
      const patch = await loadImage(mageHelm.path, fallbackImages, new Set());
      // 마법사 투구 파츠도 362px 셀 전체 크기라, 본체 그림의 배율·좌상단에 그대로 얹는다.
      // 파츠 PNG 가 셀 위로 44행 더 크므로 y 가 음수이고, 그만큼 위 여백에 그려진다.
      const layerScale = mageHelm.scale * scale;
      paintPatch(context, patch, left + mageHelm.x * scale, top + mageHelm.y * scale, patch.naturalWidth * layerScale, patch.naturalHeight * layerScale, glow?.color);
    } catch (error) {
      console.info('[장비창] 마법사 투구 파츠 로딩 실패 → 전신 그림만 표시:', error);
    }
  }
  if (staff && wants('weapon')) {
    try {
      const patch = await loadImage(staff.path, fallbackImages, new Set());
      // 지팡이 파츠도 362px 셀 좌표계라 전신 그림의 배율·위치에 그대로 얹고 그립 점을 축으로 돌린다.
      const gripX = left + staff.x * scale;
      const gripY = top + staff.y * scale;
      context.save();
      context.translate(gripX, gripY);
      context.rotate(staff.rotation * Math.PI / 180);
      const partScale = scale * staff.scale;
      paintPatch(context, patch, -STAFF_GRIP.x * partScale, -STAFF_GRIP.y * partScale, patch.naturalWidth * partScale, patch.naturalHeight * partScale, glow?.color);
      context.restore();
    } catch (error) {
      console.info('[장비창] 지팡이 파츠 로딩 실패 → 전신 그림만 표시:', error);
    }
  }
  if (weapon && wants('weapon')) {
    try {
      const patch = await loadImage(weapon.path, fallbackImages, new Set());
      // 파츠는 본체와 같은 362px 셀 좌표계라, 전신 그림이 그려진 배율·위치에 그대로 얹고
      // 손잡이(가드) 점을 축으로 회전시킨다(필드 `syncWeaponPart` 와 같은 규칙).
      const guardX = left + weapon.x * scale;
      const guardY = top + weapon.y * scale;
      context.save();
      context.translate(guardX, guardY);
      context.rotate(weapon.rotation * Math.PI / 180);
      paintPatch(context, patch, -WEAPON_GUARD.x * scale, -WEAPON_GUARD.y * scale, patch.naturalWidth * scale, patch.naturalHeight * scale, glow?.color);
      context.restore();
    } catch (error) {
      console.info('[장비창] 대검 파츠 로딩 실패 → 전신 그림만 표시:', error);
    }
  }
  return canvas.toDataURL('image/png');
}

export async function renderEquipmentPortrait(save: Save, options: EquipmentPortraitOptions = {}): Promise<string> {
  const plan = equipmentPortraitPlan(save);
  const height = Number(options.height) > 0 ? Math.round(Number(options.height)) : portraitOutputHeight;
  // 높이가 다르면 같은 장비라도 다른 그림이라 키를 나눈다(장비창 720 · 캐릭터 카드 360).
  const key = height === portraitOutputHeight ? plan.key : `${plan.key}@${height}`;
  const cached = cachedPortrait(key);
  if (cached) return cached;

  const pending = (async () => {
    if (plan.mode === 'costume') {
      try {
        return await composeCostume(plan.layers);
      } catch (error) {
        console.info('[장비창] 코스튬 합성 실패 → 전신 초상화로 폴백:', error);
      }
    }
    return composeFallback(plan.base, plan.helmet, plan.weapon, plan.bow, plan.archerHelm, plan.staff, plan.mageHelm, height);
  })();
  storePortrait(key, pending);
  void pending.catch(() => {
    if (portraitCache.get(key) === pending) portraitCache.delete(key);
  });
  return pending;
}

/** 테스트·디버그용 캐시 초기화. */
/**
 * 장착 화면 발광 레이어(작업 218).
 *
 * 초상화 본체는 지금처럼 dataURL 한 장으로 캐시하고, 그 위에 **부위별 투명 발광 PNG**를 얹어
 * DOM에서 opacity 로 숨쉬게 한다. 그래서 캐시·성능을 그대로 두고 부위별 등급색(유니크 주황·전설
 * 진한 빨강)만 따로 반짝일 수 있다. 빛이 없는 등급은 레이어가 없다.
 */
export type EquipmentGlowLayer = {
  /** 어느 부위가 빛나는지 — 갑옷 · 투구 · 무기. */
  slot: GlowSlot;
  /** 그 부위만 등급색으로 물든 투명 PNG(dataURL). 본체와 같은 크기·구도다. */
  src: string;
  /** CSS에서 쓰는 등급색(`#rrggbb`). */
  color: string;
  /** 한 번 숨쉬는 시간(초) — 유니크 2.6 · 전설 2.3. */
  cycle: number;
};

const glowCache = new Map<string, Promise<EquipmentGlowLayer[]>>();

export async function renderEquipmentGlowLayers(save: Save, options: EquipmentPortraitOptions = {}): Promise<EquipmentGlowLayer[]> {
  const plan = equipmentPortraitPlan(save);
  const height = Number(options.height) > 0 ? Math.round(Number(options.height)) : portraitOutputHeight;
  const key = `glow:${height === portraitOutputHeight ? plan.key : `${plan.key}@${height}`}`;
  const cached = glowCache.get(key);
  if (cached) return cached;

  const pending = (async () => {
    // 그 부위의 파츠가 실제로 그려질 때만 레이어를 만든다(기본 검은 몸체 시트에 구워져 있어 파츠가 없다).
    const helmetPart = !!(plan.helmet || plan.archerHelm || plan.mageHelm);
    const weaponPart = !!(plan.weapon || plan.bow || plan.staff);
    const slots: { slot: GlowSlot; tone: ReturnType<typeof gearGlowTone>; draw: boolean }[] = [
      { slot: 'armor', tone: gearGlowTone(save.equipment.armor?.rarity), draw: !!save.equipment.armor },
      { slot: 'helmet', tone: gearGlowTone(save.equipment.helmet?.rarity), draw: helmetPart },
      { slot: 'weapon', tone: gearGlowTone(save.equipment.weapon?.rarity), draw: weaponPart }
    ];
    const layers: EquipmentGlowLayer[] = [];
    for (const entry of slots) {
      if (!entry.tone || !entry.draw) continue;
      const color = gearGlowCss(entry.tone.color);
      const src = await composeFallback(
        plan.base, plan.helmet, plan.weapon, plan.bow, plan.archerHelm, plan.staff, plan.mageHelm, height,
        { slot: entry.slot, color }
      );
      layers.push({ slot: entry.slot, src, color, cycle: entry.tone.cycle });
    }
    return layers;
  })();
  glowCache.set(key, pending);
  while (glowCache.size > 12) glowCache.delete(glowCache.keys().next().value!);
  void pending.catch(() => { if (glowCache.get(key) === pending) glowCache.delete(key); });
  return pending;
}

export function resetEquipmentPortraitCache(): void {
  portraitCache.clear();
  glowCache.clear();
  atlasImages.clear();
  pendingAtlasImages.clear();
  fallbackImages.clear();
  failedPages.clear();
}
