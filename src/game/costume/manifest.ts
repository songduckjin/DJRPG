import type { Slot } from '../items';
import { COSTUME_NONE, costumeSlotGroups, lookupCostume, type CostumeSlotGroup } from './mapping';

/**
 * 코스튬 런타임 매니페스트 로더 (작업 139, `docs/COSTUME_SYSTEM.md` v1.1 §7.1).
 *
 * Pixi·DOM에 의존하지 않는 순수 모듈이다. 매니페스트는 1회 로드해 메모리에 캐시하고,
 * 실패하면 예외를 던지지 않고 폴백 플래그(`bodyFallback: true`)를 돌려준다 —
 * 본체가 사라지지 않고 기본 외형으로 그려지는 것이 계약이다(§8).
 */

/** 매니페스트 구조 버전. 구조를 바꿀 때만 올린다. */
export const COSTUME_MANIFEST_SCHEMA_VERSION = 1;

/**
 * 에셋 URL 버전. `public/_headers`가 `/assets/*`를 `immutable`로 고정하므로
 * 매니페스트와 아틀라스는 배포마다 이 값만 올려 URL을 바꾼다(§6.2·§8).
 */
export const COSTUME_ASSET_VERSION = 2;

export const COSTUME_ASSET_BASE_PATH = '/assets/costume';

/** 코스튬 에셋 URL의 유일한 생성 지점. 매니페스트·아틀라스가 항상 같은 배포본을 가리킨다. */
export function costumeAssetUrl(path: string, version: number = COSTUME_ASSET_VERSION): string {
  return `${COSTUME_ASSET_BASE_PATH}/v${version}/${path.replace(/^\/+/, '')}`;
}

export function costumeManifestUrl(version: number = COSTUME_ASSET_VERSION): string {
  return costumeAssetUrl('manifest.json', version);
}

export function costumeAtlasUrl(page = 'warrior', version: number = COSTUME_ASSET_VERSION): string {
  return costumeAssetUrl(`atlas/${page}.png`, version);
}

export type CostumeAnimMode = 'attach' | 'frames';
export const costumeAnimModes: readonly CostumeAnimMode[] = ['attach', 'frames'];

/** 본체 기준점(발 접지점 중앙 = `(0,0)`). 138 뷰어에서 확정한 좌표계다. */
export type CostumeAnchor = { x: number; y: number };

/** 위치·크기·회전 보정. 필요한 코스튬만 값으로 갖는다. */
export type CostumeFit = { x: number; y: number; scaleX: number; scaleY: number; rotation: number };

/** §7 초기 범위의 필드만 쓴다 — `schemaVersion`·`costumeId`·`slot`·`animMode`·`anchor`(+선택 `fit`·`zOrder`). */
export type CostumeDefinition = {
  costumeId: string;
  slot: CostumeSlotGroup;
  animMode: CostumeAnimMode;
  anchor: CostumeAnchor;
  fit?: CostumeFit;
  zOrder?: number;
};

export type CostumeManifest = { schemaVersion: number; costumes: readonly CostumeDefinition[] };

type Record_ = Record<string, unknown>;
function isRecord(value: unknown): value is Record_ { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }

export type CostumeManifestValidation = { ok: true; manifest: CostumeManifest } | { ok: false; error: string };
type CostumeDefinitionValidation = { ok: true; definition: CostumeDefinition } | { ok: false; error: string };

function validateCostumeDefinition(value: unknown, index: number): CostumeDefinitionValidation {
  const at = `costumes[${index}]`;
  if (!isRecord(value)) return { ok: false, error: `${at} is not an object` };
  if (typeof value.costumeId !== 'string' || !value.costumeId.trim()) return { ok: false, error: `${at}.costumeId is required` };
  if (typeof value.slot !== 'string' || !costumeSlotGroups.includes(value.slot as CostumeSlotGroup)) return { ok: false, error: `${at}.slot is invalid: ${String(value.slot)}` };
  if (typeof value.animMode !== 'string' || !costumeAnimModes.includes(value.animMode as CostumeAnimMode)) return { ok: false, error: `${at}.animMode is invalid: ${String(value.animMode)}` };
  if (!isRecord(value.anchor) || !finite(value.anchor.x) || !finite(value.anchor.y)) return { ok: false, error: `${at}.anchor requires finite x, y` };

  const definition: CostumeDefinition = {
    costumeId: value.costumeId,
    slot: value.slot as CostumeSlotGroup,
    animMode: value.animMode as CostumeAnimMode,
    anchor: { x: value.anchor.x, y: value.anchor.y }
  };
  if (value.fit !== undefined) {
    if (!isRecord(value.fit) || !finite(value.fit.x) || !finite(value.fit.y) || !finite(value.fit.scaleX) || !finite(value.fit.scaleY) || !finite(value.fit.rotation)) {
      return { ok: false, error: `${at}.fit requires finite x, y, scaleX, scaleY, rotation` };
    }
    definition.fit = { x: value.fit.x, y: value.fit.y, scaleX: value.fit.scaleX, scaleY: value.fit.scaleY, rotation: value.fit.rotation };
  }
  if (value.zOrder !== undefined) {
    if (!finite(value.zOrder)) return { ok: false, error: `${at}.zOrder must be a finite number` };
    definition.zOrder = value.zOrder;
  }
  return { ok: true, definition };
}

/** 매니페스트 스키마 검증. `schemaVersion`·`costumeId`·`slot`·`animMode`·`anchor`가 필수다. */
export function validateCostumeManifest(value: unknown): CostumeManifestValidation {
  if (!isRecord(value)) return { ok: false, error: 'manifest is not an object' };
  if (!finite(value.schemaVersion) || value.schemaVersion !== COSTUME_MANIFEST_SCHEMA_VERSION) {
    return { ok: false, error: `schemaVersion must be ${COSTUME_MANIFEST_SCHEMA_VERSION}, got ${String(value.schemaVersion)}` };
  }
  if (!Array.isArray(value.costumes)) return { ok: false, error: 'costumes must be an array' };
  const costumes: CostumeDefinition[] = [], seen = new Set<string>();
  for (let index = 0; index < value.costumes.length; index++) {
    const parsed = validateCostumeDefinition(value.costumes[index], index);
    if (!parsed.ok) return parsed;
    if (seen.has(parsed.definition.costumeId)) return { ok: false, error: `duplicate costumeId: ${parsed.definition.costumeId}` };
    seen.add(parsed.definition.costumeId);
    costumes.push(parsed.definition);
  }
  return { ok: true, manifest: { schemaVersion: value.schemaVersion, costumes } };
}

/** ① 매니페스트 없음(네트워크·404) · ② JSON 파싱·스키마 검증 실패. */
export type CostumeManifestFailureReason = 'manifest-missing' | 'manifest-parse';

/** ③ `costumeId` 미매핑 · ④ 아틀라스 로드 실패. 모두 본체 폴백이다. */
export type CostumeFallbackReason = 'none' | CostumeManifestFailureReason | 'unmapped-costume' | 'atlas-load';
export const costumeFallbackReasons: readonly CostumeFallbackReason[] = ['none', 'manifest-missing', 'manifest-parse', 'unmapped-costume', 'atlas-load'];

export type CostumeLoadResult =
  | { ok: true; manifest: CostumeManifest; url: string; fallback: false; reason: 'none' }
  | { ok: false; manifest: null; url: string; fallback: true; reason: CostumeManifestFailureReason; detail: string };

export type CostumeFetchResponse = { ok: boolean; status?: number; json(): Promise<unknown> };
export type CostumeFetch = (url: string) => Promise<CostumeFetchResponse>;

function describe(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function browserFetch(url: string): Promise<CostumeFetchResponse> {
  const globalFetch = (globalThis as { fetch?: CostumeFetch }).fetch;
  if (!globalFetch) return Promise.reject(new Error('fetch is not available'));
  return globalFetch(url);
}

async function requestCostumeManifest(fetcher: CostumeFetch): Promise<CostumeLoadResult> {
  const url = costumeManifestUrl();
  let response: CostumeFetchResponse;
  try { response = await fetcher(url); }
  catch (error) { return { ok: false, manifest: null, url, fallback: true, reason: 'manifest-missing', detail: describe(error) }; }
  if (!response.ok) return { ok: false, manifest: null, url, fallback: true, reason: 'manifest-missing', detail: `HTTP ${response.status ?? 'error'}` };
  let payload: unknown;
  try { payload = await response.json(); }
  catch (error) { return { ok: false, manifest: null, url, fallback: true, reason: 'manifest-parse', detail: describe(error) }; }
  const validation = validateCostumeManifest(payload);
  if (!validation.ok) return { ok: false, manifest: null, url, fallback: true, reason: 'manifest-parse', detail: validation.error };
  return { ok: true, manifest: validation.manifest, url, fallback: false, reason: 'none' };
}

let cached: CostumeLoadResult | undefined;
let pending: Promise<CostumeLoadResult> | undefined;

/**
 * 매니페스트를 1회 로드해 메모리에 캐시한다. 성공만 캐시하며(실패한 배포를 영구 고정하지 않는다),
 * `force`로 다시 받을 수 있다. 동시 호출은 같은 요청을 공유한다.
 */
export async function loadCostumeManifest(options: { fetch?: CostumeFetch; force?: boolean } = {}): Promise<CostumeLoadResult> {
  if (!options.force) {
    if (cached && cached.ok) return cached;
    if (pending) return pending;
  }
  const request = requestCostumeManifest(options.fetch ?? browserFetch);
  if (!options.force) pending = request;
  const result = await request;
  if (pending === request) pending = undefined;
  if (result.ok) cached = result;
  return result;
}

export function cachedCostumeManifest(): CostumeManifest | undefined {
  return cached && cached.ok ? cached.manifest : undefined;
}

export function resetCostumeManifestCache(): void { cached = undefined; pending = undefined; }

/**
 * 렌더러에 넘기는 확정 계획. `bodyFallback: true`면 기본 본체만 그린다(코스튬 부착 없음).
 * `costumeId: 'none'`은 실패가 아니라 "이 부위는 필드에 그리지 않는다"는 정상 판정이다.
 */
export type CostumePlan = {
  costumeId: string | null;
  slotGroup: CostumeSlotGroup | null;
  fieldVisible: boolean;
  definition: CostumeDefinition | null;
  bodyFallback: boolean;
  reason: CostumeFallbackReason;
};

function fallbackPlan(costumeId: string | null, slotGroup: CostumeSlotGroup | null, fieldVisible: boolean, reason: CostumeFallbackReason): CostumePlan {
  return { costumeId, slotGroup, fieldVisible, definition: null, bodyFallback: true, reason };
}

/**
 * 아이템 + 매니페스트 로드 결과 → 코스튬 계획.
 * `load`가 `undefined`면 아직 로드하지 않은 것이므로 ①(매니페스트 없음)로 본다.
 */
export function planCostume(item: { name: string; slot: Slot }, load: CostumeLoadResult | undefined): CostumePlan {
  const lookup = lookupCostume(item);
  if (!lookup.ok) return fallbackPlan(null, lookup.slotGroup, lookup.fieldVisible, 'unmapped-costume');
  if (lookup.costumeId === COSTUME_NONE) return { costumeId: COSTUME_NONE, slotGroup: lookup.slotGroup, fieldVisible: false, definition: null, bodyFallback: false, reason: 'none' };
  if (!load) return fallbackPlan(lookup.costumeId, lookup.slotGroup, lookup.fieldVisible, 'manifest-missing');
  if (!load.ok) return fallbackPlan(lookup.costumeId, lookup.slotGroup, lookup.fieldVisible, load.reason);
  const definition = load.manifest.costumes.find(entry => entry.costumeId === lookup.costumeId);
  if (!definition) return fallbackPlan(lookup.costumeId, lookup.slotGroup, lookup.fieldVisible, 'unmapped-costume');
  // 매니페스트가 다른 부위로 적혀 있으면 엉뚱한 곳에 붙이지 않고 본체로 돌아간다.
  if (definition.slot !== lookup.slotGroup) return fallbackPlan(lookup.costumeId, lookup.slotGroup, lookup.fieldVisible, 'unmapped-costume');
  return { costumeId: lookup.costumeId, slotGroup: definition.slot, fieldVisible: lookup.fieldVisible, definition, bodyFallback: false, reason: 'none' };
}

/** ④ 아틀라스 로드 실패 계약. 렌더러는 텍스처 로드를 catch한 지점에서 이 값을 그대로 쓴다. */
export type CostumeAtlasPlan = { atlasUrl: string; bodyFallback: boolean; reason: 'none' | 'atlas-load' };

export function costumeAtlasLoadResult(loaded: boolean, page = 'warrior'): CostumeAtlasPlan {
  return { atlasUrl: costumeAtlasUrl(page), bodyFallback: !loaded, reason: loaded ? 'none' : 'atlas-load' };
}
