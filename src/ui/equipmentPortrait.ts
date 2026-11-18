import { heroAppearance, type GearTier } from '../game/appearance';
import {
  cachedCostumeManifest, costumeAtlasUrl, costumeManifestUrl, loadCostumeManifest,
  type CostumeLoadResult, type CostumeManifest
} from '../game/costume/manifest';
import {
  costumeAtlasCellHeight, costumeAtlasCellWidth, costumeAtlasPageName, costumeLayerCell,
  costumeLayerPageIndex, planHeroCostume, type CostumeLayerPlan
} from '../game/render/costumeHero';
import type { Save } from '../game/store';

/**
 * 내 정보(장비창) 초상화 — 필드와 **같은 공용 외형 계획**을 쓴다 (작업 141).
 *
 * - 계획: `planHeroCostume(save, 매니페스트)`(작업 140, `render/costumeHero.ts`)가 돌려주는
 *   본체 3파츠 + 장비 레이어를 그대로 그린다. UI 전용 `fit` 좌표 표나
 *   `wearableEquipmentImage` 5부위 덧그리기는 [작업 136]에서 제거했고 이 파일에 남기지 않는다.
 * - 필드와 다른 점은 **정지 1프레임(idle frame 0)** 하나뿐이다. 필드는 `world`의 이동·공격·스킬
 *   상태로 `idle`/`walk`/`attack`/`slash`/`spin`/`smash`/`cast`를 고르고 프레임을 진행하지만,
 *   이 미리보기는 장비 확인용 정지 그림이라 `idle` 0번 슬롯(`costumeLayerCell(layer, 'idle', 0)`)만
 *   쓴다. 그래서 계획 함수·아틀라스 셀 규약·피벗·`zOrder`·파츠 교체는 필드와 동일하고,
 *   모션 진행과 재생 배율만 없다.
 * - 실물 코스튬 아틀라스는 [작업 142]에서 배포된다. 매니페스트·아틀라스가 없거나 셀이 페이지
 *   밖이면 빈 화면 대신 136의 티어별 전신 초상화(`warrior_equipped_t*`)로 안전하게 폴백한다.
 */

const tierPortrait: Record<GearTier, string> = { 1: 'starter', 2: 't2', 3: 't3', 4: 't4' };

/** 폴백 전신 초상화 경로. 갑옷+투구를 함께 착용하면 갑옷 티어별 시트를 쓴다. */
export function equipmentFallbackPortrait(save: Save): string {
  const appearance = heroAppearance(save);
  if (save.equipment.armor && save.equipment.helmet && appearance.armorTier) {
    return `/assets/warrior_equipped_${tierPortrait[appearance.armorTier]}_${save.gender}.png`;
  }
  return appearance.portrait;
}

export type EquipmentPortraitPlan = {
  /**
   * `costume`: 공용 외형 계획으로 그린다(필드와 같은 레이어).
   * `fallback`: 코스튬 계획을 세울 수 없어 전신 초상화 한 장으로 그린다.
   */
  mode: 'costume' | 'fallback';
  /** 즉시 표시용 전신 초상화 경로. 코스튬 합성이 끝나기 전·에셋 없음일 때 이 그림이 보인다. */
  base: string;
  /** 캐시 키(성별 + 레이어 구성 + 피벗/보정). */
  key: string;
  gender: Save['gender'];
  layers: CostumeLayerPlan[];
};

function cachedLoad(): CostumeLoadResult | undefined {
  const manifest: CostumeManifest | undefined = cachedCostumeManifest();
  return manifest ? { ok: true, manifest, url: costumeManifestUrl(), fallback: false, reason: 'none' } : undefined;
}

/**
 * Save → 초상화 계획. 동기 함수이며 이미 로드된 매니페스트만 쓴다(`renderEquipmentPortrait`가
 * 로드를 마친 뒤 다시 호출한다). 매니페스트가 아직 없으면 폴백 계획을 돌려준다.
 */
export function equipmentPortraitPlan(save: Save): EquipmentPortraitPlan {
  const base = equipmentFallbackPortrait(save);
  const load = cachedLoad();
  if (load) {
    const plan = planHeroCostume(save, load);
    if (plan.ok) {
      const key = `costume:${save.gender}:${plan.layers.map(layer =>
        `${layer.role}/${layer.page}/${layer.variant}/${layer.anchor.x},${layer.anchor.y}/${layer.offset.x},${layer.offset.y}/${layer.scale.x},${layer.scale.y}/${layer.rotation}`
      ).join('|')}`;
      return { mode: 'costume', base, key, gender: save.gender, layers: plan.layers };
    }
  }
  return { mode: 'fallback', base, key: `fallback:${base}`, gender: save.gender, layers: [] };
}

/* ── 매니페스트 1회 로드 ───────────────────────────────────────────────── */

let manifestAttempt: Promise<CostumeLoadResult | undefined> | undefined;
let manifestFailed = false;

/**
 * 매니페스트를 1회만 요청한다. 실패하면 세션 동안 폴백으로 굳는다 —
 * 장비창을 열 때마다 404를 반복하지 않기 위해서다(필드 렌더러의 폴백 고정과 같은 규율).
 */
function ensureManifest(): Promise<CostumeLoadResult | undefined> {
  if (manifestFailed) return Promise.resolve(undefined);
  const cached = cachedLoad();
  if (cached) return Promise.resolve(cached);
  if (!manifestAttempt) {
    manifestAttempt = loadCostumeManifest().then(result => {
      if (!result.ok) {
        manifestFailed = true;
        console.info(`[장비창] 코스튬 매니페스트 없음 → 전신 초상화로 폴백: ${result.reason} ${result.detail}`);
      }
      return result;
    }).catch(error => {
      manifestFailed = true;
      console.info('[장비창] 코스튬 매니페스트 요청 실패 → 전신 초상화로 폴백:', error);
      return undefined;
    });
  }
  return manifestAttempt;
}

/* ── 아틀라스 이미지·합성 결과 캐시 ─────────────────────────────────────── */

const atlasImages = new Map<string, Promise<HTMLImageElement>>();
const failedPages = new Set<string>();
const portraitCache = new Map<string, Promise<string>>();
const fallbackImages = new Map<string, Promise<HTMLImageElement>>();

/** 아틀라스/폴백 PNG 로드. 한 번 실패한 URL은 다시 요청하지 않는다(404 폭주 방지). */
function loadImage(url: string, store: Map<string, Promise<HTMLImageElement>>, failed: Set<string>): Promise<HTMLImageElement> {
  const cached = store.get(url);
  if (cached) return cached;
  if (failed.has(url)) return Promise.reject(new Error(`이미지 로드 실패(재시도 안 함): ${url}`));
  const loading = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => { failed.add(url); store.delete(url); reject(new Error(`이미지 로딩 실패: ${url}`)); };
    image.src = url;
  });
  store.set(url, loading);
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
    const url = costumeAtlasUrl(costumeAtlasPageName(layer.page, costumeLayerPageIndex(layer)));
    pageUrls.set(`${layer.page}#${costumeLayerPageIndex(layer)}`, url);
  }
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
}

/** 폴백: 전신 초상화 한 장을 캔버스에 맞춰 그린다(빈 화면 방지). */
async function composeFallback(base: string): Promise<string> {
  const image = await loadImage(base, fallbackImages, new Set());
  const canvas = fitCanvas(image.naturalWidth, image.naturalHeight);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('장비 초상화 캔버스를 만들 수 없습니다.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
  context.drawImage(image, (canvas.width - width) / 2, canvas.height - height, width, height);
  return canvas.toDataURL('image/png');
}

/**
 * 초상화 dataURL. 결과는 계획 키로 캐시하고(LRU 24) 합성 중 같은 요청은 한 번만 만든다.
 * 픽셀 단위 스캔은 하지 않는다 — 팔레트·피부톤 보정은 142 아틀라스가 색으로 담당한다.
 */
export async function renderEquipmentPortrait(save: Save): Promise<string> {
  await ensureManifest();
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
    return composeFallback(plan.base);
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
  fallbackImages.clear();
  failedPages.clear();
  manifestAttempt = undefined;
  manifestFailed = false;
}
