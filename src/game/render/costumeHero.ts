import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { baseItemIndex, type Slot } from '../items';
import type { Save } from '../store';
import {
  costumeAtlasUrl, loadCostumeManifest, planCostume,
  type CostumeAnchor, type CostumeDefinition, type CostumeFallbackReason, type CostumeLoadResult, type CostumeManifest
} from '../costume/manifest';
import type { CostumeSlotGroup } from '../costume/mapping';
import { costumeMotionSlot, type AttackFacing, type HeroCostumeMotion } from './heroMotion';

/**
 * 독립형 코스튬 필드 렌더러 (작업 140, `docs/COSTUME_SYSTEM.md` v1.1 §4·§7.1·§8).
 *
 * 구조:
 *   1. `planHeroCostume()` — 아이템 + 매니페스트 로드 결과 → 그릴 레이어 순서/피벗/보정 표(순수 함수).
 *   2. `ensureCostumeAtlas()/costumeLayerTexture()` — 버전 URL 아틀라스 로드 + 셀 자르기.
 *   3. `renderCostumeHero()` — 위 계획대로 `heroLayer` 안의 스프라이트를 갱신하고 성공 여부를 돌려준다.
 *
 * 안전장치(§8): 매니페스트·아틀라스가 없거나 검증에 실패하거나 `costumeId`가 매핑되지 않으면
 * `false`를 돌려주고 호출부(`entities.ts` `drawHero`)가 기존 통합 바디·무기 소켓 경로로 그린다.
 * 이 모듈은 예외를 던지지 않고, 실패한 요청은 한 번만 기록하고 다시 시도하지 않는다
 * (404 요청 폭주·캐릭터 소실 프레임 방지). 전투 판정·월드 위치·Save는 건드리지 않는다.
 */

/** 본체 파츠 3영역(① 머리 포함 몸통 ② 양팔 ③ 다리). 배열 순서가 아틀라스 변형 인덱스다. */
export type CostumeBodyPart = 'torso' | 'arms' | 'legs';
export const costumeBodyParts: readonly CostumeBodyPart[] = ['torso', 'arms', 'legs'];

/** 본체 파츠 기본 레이어 순서. 다리 → 몸통 → 팔. */
export const costumeBodyZOrder: Record<CostumeBodyPart, number> = { legs: 0, torso: 10, arms: 15 };

/** 장비 부위 기본 레이어 순서(매니페스트 `zOrder`가 있으면 그 값이 우선한다). */
export const costumeSlotZOrder: Record<CostumeSlotGroup, number> = {
  boots: 5, armor: 10, gloves: 20, helmet: 30, offhand: 40, weapon: 50, necklace: 0, belt: 0, ring: 0
};

/** 필드에서 그리는 장비 부위와 그 순서. 목걸이·벨트·반지는 필드 미표시(§3.1)라 대상이 아니다. */
export const costumeSlotDrawOrder: readonly Slot[] = ['boots', 'armor', 'gloves', 'helmet', 'offhand', 'weapon'];

/**
 * 아틀라스 셀 크기. 138 `estimateCanvas`가 계산한 최대 동작 캔버스 후보(대검 234×242)를
 * 그대로 셀로 쓴다(§3 표). 모든 파츠가 같은 셀·같은 발 피벗을 쓴다(§6.2).
 */
export const costumeAtlasCellWidth = 234;
export const costumeAtlasCellHeight = 242;

/** 페이지 상한. 2048×2048 목표(§6.2)에서 234×242 셀이 8×8 = 64칸 들어간다. */
export const costumeAtlasColumns = 8;
export const costumeAtlasRows = 8;
export const costumeAtlasCellsPerPage = costumeAtlasColumns * costumeAtlasRows;

/** Maximum simultaneously resident costume atlas pages. One complete loadout needs at most six. */
export const costumeAtlasPageCacheLimit = 6;

/**
 * 변형 하나가 페이지에서 차지하는 칸 수. 한 파츠의 30프레임을 32칸 슬롯에 담아
 * 변형이 페이지 경계를 넘지 않게 한다(64칸 = 변형 2개).
 */
export const costumeVariantStride = 32;
export const costumeVariantsPerPage = costumeAtlasCellsPerPage / costumeVariantStride;

/** 본체 파츠의 셀 안 발 피벗(정규화). 142에서 실물 알파 경계로 재측정하는 잠정값이다. */
export const costumeBodyPivot = { x: .5, y: .96 } as const;

/** 코스튬 레이어의 부위 키. 장비는 부위 이름, 본체는 `torso`·`arms`·`legs`. */
export type CostumeLayerRole = CostumeBodyPart | CostumeSlotGroup | 'pilot';

export type CostumeLayerPlan = {
  role: CostumeLayerRole;
  /** 본체 파츠면 `null`. */
  costumeId: string | null;
  /** 아틀라스 페이지 기본 이름(`body-male`·`armor`·`helmet` …). */
  page: string;
  /** 같은 부위 안에서의 변형 순서(매니페스트 순서 또는 본체 파츠 순서). */
  variant: number;
  zOrder: number;
  /** 셀 안 피벗(정규화 0..1). */
  anchor: { x: number; y: number };
  /** 매니페스트 `fit`의 위치 보정(아트 픽셀). */
  offset: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  /** Only the isolated task-145 pilot page uses v4; the shared v3 manifest remains unchanged. */
  assetVersion?: number;
};

export type CostumeHeroPlan =
  | { ok: true; layers: CostumeLayerPlan[] }
  | { ok: false; reason: CostumeFallbackReason; detail: string };

/**
 * 매니페스트 `anchor` → 셀 정규화 피벗.
 * - `{0,0}`은 "보정 없음"으로 보고 본체 발 피벗을 쓴다(테스트·기본값).
 * - 0..1 사이 값은 이미 정규화된 피벗이다.
 * - 그보다 큰 값은 셀 아트 픽셀로 보고 나눈다(뷰어 좌표계 그대로 쓴 매니페스트 허용).
 * 어느 쪽이든 결과는 0..1로 고정해 캐릭터가 화면 밖으로 밀리지 않게 한다.
 */
export function costumeLayerAnchor(anchor: CostumeAnchor | undefined): { x: number; y: number } {
  if (!anchor || (anchor.x === 0 && anchor.y === 0)) return { ...costumeBodyPivot };
  const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
  const inside = Math.abs(anchor.x) <= 1 && Math.abs(anchor.y) <= 1;
  return inside
    ? { x: clamp01(anchor.x), y: clamp01(anchor.y) }
    : { x: clamp01(anchor.x / costumeAtlasCellWidth), y: clamp01(anchor.y / costumeAtlasCellHeight) };
}

/** New versioned pilot atlases can be used beside the shared v3 assets without changing their URLs. */
export function costumeLayerAtlasUrl(layer: CostumeLayerPlan): string {
  return costumeAtlasUrl(costumeAtlasPageName(layer.page, costumeLayerPageIndex(layer)), layer.assetVersion);
}

function variantIndex(manifest: CostumeManifest, definition: CostumeDefinition): number {
  return manifest.costumes.filter(entry => entry.slot === definition.slot).findIndex(entry => entry.costumeId === definition.costumeId);
}

/**
 * Save의 장비 + 매니페스트 로드 결과 → 그릴 레이어 계획.
 *
 * - 몸통·팔·다리 본체 파츠는 항상 계획에 넣고, 갑옷을 입으면 **본체 파츠 3종을 모두 갑옷으로 교체**한다
 *   (§4 파츠 교체). v2는 `torso`만 지워 맨몸 팔·다리가 갑옷 밖으로 삐져나와 다리가 4개처럼 보였다.
 * - 투구는 머리 위치가 갑옷 셀 기준인지 맨몸 셀 기준인지에 따라 페이지가 다르다:
 *   갑옷을 입으면 `helmet-<성별>`, 맨몸이면 `helmet-body-<성별>`(§7.5 2D 머리 정렬).
 * - 장비 하나라도 계획이 서지 않으면(폴백 ①②③) 부분 합성하지 않고 전체 폴백을 돌려준다.
 *   반쯤 벗은 실루엣으로 그리는 것보다 기존 통합 바디로 그리는 편이 안전하다(§8).
 */
export function planHeroCostume(save: Pick<Save, 'gender' | 'equipment'>, load: CostumeLoadResult | undefined): CostumeHeroPlan {
  if (!load) return { ok: false, reason: 'manifest-missing', detail: '코스튬 매니페스트를 아직 불러오지 않았습니다.' };
  if (!load.ok) return { ok: false, reason: load.reason, detail: load.detail };
  const compactName = (value: string | undefined) => value?.normalize('NFKC').replace(/[\s\u200b\ufeff]/gu, '') ?? '';
  const helmet = save.equipment.helmet;
  const weapon = save.equipment.weapon;
  const pilotLoadout = compactName(helmet?.name) === compactName('서리의 가죽 두건')
    && baseItemIndex(weapon ?? { id: '', slot: 'weapon', name: '', rarity: 'common', stats: {} }) === 0
    && !save.equipment.armor && !save.equipment.offhand && !save.equipment.gloves && !save.equipment.boots;
  if (pilotLoadout) {
    return { ok: true, layers: [{
      role: 'pilot', costumeId: 'pilot-frost-leather-hood', page: `pilot-hood-${save.gender}`, variant: 0,
      zOrder: 10, anchor: { ...costumeBodyPivot }, offset: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0,
      assetVersion: 4
    }] };
  }
  // The v3 helmet atlas uses an open-face source for every variant. The legacy
  // helmet has a distinct closed visor in the integrated body sheets.
  if (save.equipment.helmet?.name.normalize('NFKC').replace(/[\s\u200b\ufeff]/gu, '') === '낡은투구') {
    return { ok: false, reason: 'unmapped-costume', detail: '낡은 투구의 얼굴 가림 아틀라스가 없어 기존 전신 시트를 사용합니다.' };
  }
  const manifest = load.manifest;
  const bodyPage = `body-${save.gender}`;
  const body: CostumeLayerPlan[] = costumeBodyParts.map((part, variant) => ({
    role: part, costumeId: null, page: bodyPage, variant,
    zOrder: costumeBodyZOrder[part], anchor: { ...costumeBodyPivot },
    offset: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0
  }));

  let armor: CostumeLayerPlan | null = null;
  const equipment: CostumeLayerPlan[] = [];
  for (const slot of costumeSlotDrawOrder) {
    const item = save.equipment[slot];
    if (!item) continue;
    const plan = planCostume(item, load);
    if (!plan.fieldVisible) continue;
    if (plan.bodyFallback || !plan.definition) {
      return { ok: false, reason: plan.reason, detail: `${item.name}(${plan.costumeId ?? '미매핑'}) 코스튬 계획 실패` };
    }
    const definition = plan.definition;
    const variant = variantIndex(manifest, definition);
    if (variant < 0) return { ok: false, reason: 'unmapped-costume', detail: `${definition.costumeId}가 매니페스트에 없습니다.` };
    const layer: CostumeLayerPlan = {
      role: definition.slot,
      costumeId: definition.costumeId,
      // 장비도 성별 페이지를 쓴다(`armor-male`·`armor-female`). 갑옷이 몸통 파츠를 대체하는
      // 전신 그림이라 남/여 그림을 섞으면 체형이 뒤바뀐다(작업 142, `docs/COSTUME_SYSTEM.md` §7.2).
      page: `${definition.slot}-${save.gender}`,
      variant,
      zOrder: definition.zOrder ?? costumeSlotZOrder[definition.slot],
      anchor: costumeLayerAnchor(definition.anchor),
      offset: { x: definition.fit?.x ?? 0, y: definition.fit?.y ?? 0 },
      scale: { x: definition.fit?.scaleX ?? 1, y: definition.fit?.scaleY ?? 1 },
      rotation: definition.fit?.rotation ?? 0
    };
    if (definition.slot === 'weapon') {
      // v3's 104px idle sword crosses the head. Shrink around its hand socket
      // so the grip remains attached in field and portrait plans alike.
      const grip = save.gender === 'female' ? { x: 90, y: 126 } : { x: 126, y: 112 };
      const scale = .7;
      layer.offset.x += (1 - scale) * (grip.x - costumeAtlasCellWidth * costumeBodyPivot.x);
      layer.offset.y += (1 - scale) * (grip.y - costumeAtlasCellHeight * costumeBodyPivot.y);
      layer.scale.x *= scale;
      layer.scale.y *= scale;
    }
    if (definition.slot === 'armor') armor = layer;
    else equipment.push(layer);
  }

  // 갑옷 착용 시 본체 파츠(torso·arms·legs)를 전부 뺐다 — 하나라도 남으면 포즈가 다른
  // 프레임에서 맨몸 팔·다리가 갑옷 밖으로 나온다(v3 실기 버그).
  if (armor) {
    const helmet = equipment.find(layer => layer.role === 'helmet');
    if (helmet) helmet.page = `helmet-${save.gender}`;
  } else {
    // 맨몸 + 투구: 투구를 맨몸 머리에 맞춰 둔 페이지를 쓴다(§7.5).
    for (const layer of equipment) {
      if (layer.role === 'helmet') layer.page = `helmet-body-${save.gender}`;
    }
  }
  // 전신 파일을 쓸 수 없는 장비 조합도 두건 그림은 동일하게 보이게 한다.
  // 다른 장비 레이어와 v3 매니페스트는 그대로 두고 투구 페이지만 교체한다.
  if (compactName(helmet?.name) === compactName('서리의 가죽 두건')) {
    const hood = equipment.find(layer => layer.role === 'helmet');
    if (hood) {
      hood.page = `frost-hood-${armor ? 'armor' : 'body'}-${save.gender}`;
      hood.variant = 0;
      hood.costumeId = 'pilot-frost-leather-hood-overlay';
      hood.assetVersion = 5;
    }
  }
  const layers = armor ? [armor, ...equipment] : [...body, ...equipment];
  layers.sort((a, b) => a.zOrder - b.zOrder);
  return { ok: true, layers };
}

/** 아틀라스 페이지 이름. 첫 페이지는 기본 이름, 이후는 `-2`·`-3`. */
export function costumeAtlasPageName(page: string, pageIndex: number): string {
  return pageIndex <= 0 ? page : `${page}-${pageIndex + 1}`;
}

/** 레이어의 변형이 놓인 페이지 인덱스. 변형은 페이지 경계를 넘지 않는다. */
export function costumeLayerPageIndex(layer: CostumeLayerPlan): number {
  return Math.floor(layer.variant / costumeVariantsPerPage);
}

/** 레이어·모션·프레임 → 그 페이지 안의 셀 위치(0..63). */
export function costumeLayerCell(layer: CostumeLayerPlan, motion: HeroCostumeMotion, frame: number, direction?: AttackFacing): number {
  if (layer.role === 'pilot' && motion !== 'idle' && motion !== 'walk') {
    // Four generated key poses: left, right, far/back, near/front. One key pose
    // holds through each attack/skill window so no empty pilot cell is rendered.
    return 9 + Math.max(0, ['left', 'right', 'back', 'front'].indexOf(direction ?? 'right'));
  }
  return (layer.variant % costumeVariantsPerPage) * costumeVariantStride + costumeMotionSlot(motion, frame);
}

export type CostumeHeroState = {
  status: 'idle' | 'loading' | 'fallback';
  load?: CostumeLoadResult & { ok: true };
  /** 아틀라스 페이지 URL → 텍스처. */
  textures: Map<string, Texture>;
  /** Pixi Assets가 소유하며, 축출 시 `Assets.unload()`해야 하는 페이지. */
  ownedPages: Set<string>;
  /** 진행 중인 Pixi Assets unload 작업. unload가 끝나기 전에는 새 페이지를 로드하지 않는다. */
  unloading: Map<string, Promise<void>>;
  /** 현재 장비 계획에서 쓰는 페이지. 이 페이지들은 캐시 정리에서 보호한다. */
  activePages: Set<string>;
  activePlanKey: string;
  /** 셀 자르기 결과 캐시. 매 프레임 `new Texture`를 만들지 않는다. */
  frames: Map<string, Texture>;
  loading: Set<string>;
  failed: Set<string>;
  /** 부위 키 → 현재 레이어 스프라이트. */
  sprites: Map<string, Sprite>;
  reason: CostumeFallbackReason;
  detail: string;
};

export function createCostumeHeroState(): CostumeHeroState {
  return {
    status: 'idle', textures: new Map(), ownedPages: new Set(), unloading: new Map(), activePages: new Set(), activePlanKey: '',
    frames: new Map(), loading: new Set(), failed: new Set(),
    sprites: new Map(), reason: 'none', detail: ''
  };
}

function fallback(state: CostumeHeroState, reason: CostumeFallbackReason, detail: string): void {
  state.status = 'fallback';
  state.reason = reason;
  state.detail = detail;
}

/**
 * 매니페스트를 1회 로드한다(§7.1 캐시). 실패하면 `fallback` 상태로 굳고 다시 요청하지 않는다 —
 * 아틀라스도 요청하지 않으므로 404가 한 번(매니페스트)뿐이다.
 */
export async function beginCostumeHero(state: CostumeHeroState): Promise<void> {
  if (state.status !== 'idle') return;
  state.status = 'loading';
  let result: CostumeLoadResult;
  try { result = await loadCostumeManifest(); }
  catch (error) {
    fallback(state, 'manifest-missing', error instanceof Error ? error.message : String(error));
    return;
  }
  if (!result.ok) { fallback(state, result.reason, result.detail); return; }
  state.load = result;
  state.status = 'idle';
}

/** 테스트·프리로드용 주입 경로. 매니페스트 결과와 아틀라스 텍스처를 네트워크 없이 넣는다. */
export function applyCostumeHeroRuntime(state: CostumeHeroState, load: CostumeLoadResult & { ok: true }, textures: Map<string, Texture>): void {
  state.load = load;
  state.status = 'idle';
  state.reason = 'none';
  state.detail = '';
  for (const [url, texture] of textures) {
    state.textures.set(url, texture);
    // Test/preload textures are externally owned and must not be passed to Assets.unload().
    state.ownedPages.delete(url);
  }
}

function touchPage(state: CostumeHeroState, url: string): Texture | undefined {
  const texture = state.textures.get(url);
  if (!texture) return undefined;
  state.textures.delete(url);
  state.textures.set(url, texture);
  return texture;
}

function destroyFramesForPage(state: CostumeHeroState, url: string): void {
  for (const [key, texture] of state.frames) {
    if (!key.startsWith(`${url}#`)) continue;
    state.frames.delete(key);
    texture.destroy(false);
  }
}

function unloadPage(state: CostumeHeroState, url: string): void {
  const texture = state.textures.get(url);
  if (!texture) return;
  state.textures.delete(url);
  destroyFramesForPage(state, url);
  if (!state.ownedPages.delete(url)) return;
  const unloading = Assets.unload(url).catch(error => {
    console.info(`[costume] 아틀라스 해제 실패: ${url}`, error);
  });
  state.unloading.set(url, unloading);
  void unloading.finally(() => state.unloading.delete(url));
}

function pruneStalePages(state: CostumeHeroState): void {
  for (const url of [...state.textures.keys()]) {
    if (!state.activePages.has(url)) unloadPage(state, url);
  }
}

/** 계획에 필요한 아틀라스만 보유한다. 현재 장비 최대 6페이지 외에는 GPU 자산까지 해제한다. */
export function ensureCostumeAtlas(state: CostumeHeroState, plan: CostumeLayerPlan[]): void {
  const urls = [...new Set(plan.map(costumeLayerAtlasUrl))];
  if (urls.length > costumeAtlasPageCacheLimit) {
    fallback(state, 'atlas-load', `장비 계획이 아틀라스 캐시 상한(${costumeAtlasPageCacheLimit})을 넘었습니다.`);
    return;
  }
  state.activePages = new Set(urls);
  pruneStalePages(state);
  // Avoid transiently keeping an old decoded page and its replacement set on GPU together.
  if (state.unloading.size > 0) return;
  for (const url of urls) {
    if (state.textures.has(url)) { touchPage(state, url); continue; }
    if (state.loading.has(url) || state.failed.has(url)) continue;
    if (state.textures.size + state.loading.size >= costumeAtlasPageCacheLimit) break;
    state.loading.add(url);
    void Assets.load<Texture>(url).then(texture => {
      texture.source.scaleMode = 'linear';
      state.ownedPages.add(url);
      if (state.activePages.has(url) && state.status !== 'fallback') state.textures.set(url, texture);
      else {
        state.textures.set(url, texture);
        unloadPage(state, url);
      }
      state.loading.delete(url);
    }).catch(() => {
      state.loading.delete(url);
      state.failed.add(url);
      fallback(state, 'atlas-load', url);
      state.activePages.clear();
      pruneStalePages(state);
      console.info(`[costume] 아틀라스 페이지 없음 → 기존 본체로 폴백: ${url}`);
    });
  }
}

/**
 * 레이어·모션·프레임에 해당하는 셀 텍스처. 페이지가 없거나 셀이 페이지 밖이면 `null`(폴백).
 * 셀 크기는 실제 텍스처에서 계산해 2048² 미만 배포본도 잘라 쓸 수 있게 한다.
 */
export function costumeLayerTexture(state: CostumeHeroState, layer: CostumeLayerPlan, motion: HeroCostumeMotion, frame: number, direction?: AttackFacing): Texture | null {
  const url = costumeLayerAtlasUrl(layer);
  const page = touchPage(state, url);
  if (!page) return null;
  const columns = Math.floor(page.source.width / costumeAtlasCellWidth);
  const rows = Math.floor(page.source.height / costumeAtlasCellHeight);
  if (columns <= 0 || rows <= 0) return null;
  const cell = costumeLayerCell(layer, motion, frame, direction);
  const column = cell % columns, row = Math.floor(cell / columns);
  if (row >= rows) return null;
  const key = `${url}#${column},${row}`;
  const cached = state.frames.get(key);
  if (cached) return cached;
  const texture = new Texture({
    source: page.source,
    frame: new Rectangle(column * costumeAtlasCellWidth, row * costumeAtlasCellHeight, costumeAtlasCellWidth, costumeAtlasCellHeight)
  });
  state.frames.set(key, texture);
  return texture;
}

export type CostumeHeroTarget = {
  heroLayer: Container;
  hero?: Sprite;
  /** Loadout changed: release short-lived ghost sprites before unloading their source pages. */
  onPlanChange?: () => void;
};

export type CostumeHeroFrame = { motion: HeroCostumeMotion; frame: number; tint?: number; direction?: AttackFacing };

function clearCostumeSprites(target: CostumeHeroTarget, state: CostumeHeroState): void {
  target.onPlanChange?.();
  for (const sprite of state.sprites.values()) {
    if (sprite.parent) sprite.parent.removeChild(sprite);
    sprite.destroy();
  }
  state.sprites.clear();
}

/**
 * 코스튬 레이어로 캐릭터를 그린다. 그렸으면 `true`, 폴백이면 `false`.
 *
 * 성공 판정은 "모든 레이어의 셀 텍스처가 준비됨"이다. 하나라도 준비되지 않으면 아무것도
 * 바꾸지 않고 `false`를 돌려주므로 그 프레임은 기존 통합 바디로 그려진다(캐릭터 소실 없음).
 */
export function renderCostumeHero(
  target: CostumeHeroTarget, state: CostumeHeroState | undefined, save: Pick<Save, 'gender' | 'equipment'>, frame: CostumeHeroFrame
): boolean {
  if (!state || !state.load) return false;
  if (state.status === 'fallback') {
    if (state.sprites.size > 0) clearCostumeSprites(target, state);
    return false;
  }
  const plan = planHeroCostume(save, state.load);
  if (!plan.ok) {
    if (state.sprites.size > 0) clearCostumeSprites(target, state);
    state.activePlanKey = '';
    state.activePages.clear();
    pruneStalePages(state);
    return false;
  }
  const planKey = plan.layers.map(layer => `${layer.role}:${layer.page}:${layer.variant}:${layer.zOrder}:${layer.anchor.x},${layer.anchor.y}:${layer.offset.x},${layer.offset.y}:${layer.scale.x},${layer.scale.y}:${layer.rotation}`).join('|');
  if (state.activePlanKey && state.activePlanKey !== planKey) {
    clearCostumeSprites(target, state);
  }
  state.activePlanKey = planKey;
  ensureCostumeAtlas(state, plan.layers);
  const resolved: { layer: CostumeLayerPlan; texture: Texture }[] = [];
  for (const layer of plan.layers) {
    const texture = costumeLayerTexture(state, layer, frame.motion, frame.frame, frame.direction);
    if (!texture) return false; // 아직 로드 중이거나 셀 밖 → 이번 프레임은 폴백
    resolved.push({ layer, texture });
  }

  const roles = new Set(plan.layers.map(layer => `${layer.role}`));
  for (const [role, sprite] of [...state.sprites]) {
    if (roles.has(role)) continue;
    if (sprite.parent) sprite.parent.removeChild(sprite);
    sprite.destroy();
    state.sprites.delete(role);
  }
  for (const { layer, texture } of resolved) {
    const role = `${layer.role}`;
    let sprite = state.sprites.get(role);
    if (!sprite) {
      sprite = new Sprite(texture);
      target.heroLayer.addChild(sprite);
      state.sprites.set(role, sprite);
    }
    if (sprite.texture !== texture) sprite.texture = texture;
    sprite.anchor.set(layer.anchor.x, layer.anchor.y);
    sprite.position.set(layer.offset.x, layer.offset.y);
    sprite.scale.set(layer.scale.x, layer.scale.y);
    sprite.rotation = layer.rotation;
    sprite.zIndex = layer.zOrder;
    sprite.visible = true;
    sprite.alpha = 1;
    sprite.tint = frame.tint ?? 0xffffff;
  }
  target.heroLayer.sortableChildren = true;
  // 폴백용 통합 바디 스프라이트가 남아 있으면 두 몸이 겹쳐 보인다.
  if (target.hero) target.hero.visible = false;
  return true;
}

/** 폴백 경로로 돌아갈 때 통합 바디를 다시 보이게 하고 코스튬 레이어를 숨긴다. */
export function hideCostumeHero(target: CostumeHeroTarget, state: CostumeHeroState | undefined): void {
  if (target.hero) target.hero.visible = true;
  if (!state) return;
  for (const [, sprite] of state.sprites) sprite.visible = false;
}

/**
 * 잔상(`updateAfterimages`)용 레이어 스냅샷. 코스튬 모드가 아니면 `null`이며,
 * 호출부는 기존처럼 `this.hero` 한 장을 쓴다.
 */
export function costumeGhostSources(state: CostumeHeroState | undefined): { sprite: Sprite; offset: { x: number; y: number } }[] | null {
  if (!state || state.sprites.size === 0) return null;
  const sources: { sprite: Sprite; offset: { x: number; y: number } }[] = [];
  for (const [, sprite] of state.sprites) {
    if (!sprite.visible) continue;
    sources.push({ sprite, offset: { x: sprite.position.x, y: sprite.position.y } });
  }
  return sources.length ? sources : null;
}

/** 코스튬 모드가 그려지고 있는지. 장비창·디버그 패널이 같은 판정을 쓸 수 있게 노출한다. */
export function costumeHeroActive(state: CostumeHeroState | undefined): boolean {
  return !!state && state.sprites.size > 0;
}
