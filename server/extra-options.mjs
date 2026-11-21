/**
 * 장비 추가옵션 서버 사본 (작업 238).
 *
 * `src/game/extraOptions.ts`와 **같은 식**을 순수 JS로 옮겨 적은 것이다. `server/database.mjs`는
 * ts 로더 없이 도는 스크립트(`scripts/migrate-turso-db.mjs`)에서도 import되므로 TS를 직접 쓸 수 없다.
 * 두 구현이 갈라지면 같은 아이템 id가 클라이언트와 서버에서 다른 옵션을 갖게 되므로,
 * `tests/extra-options.test.mjs`가 여러 id에서 두 결과를 대조한다.
 *
 * 서버는 저장·거래·창고로 들어오는 모든 장비의 추가옵션을 **id에서 다시 계산해 덮어쓴다**
 * (`normalizeExtraOptions`). 그래서 클라이언트가 값을 조작해도 1~3%·등급별 개수 규칙 밖으로 나갈 수 없다.
 */
export const EXTRA_OPTION_KEYS = [
  'regenPct', 'bonusDmgPct', 'lifestealPct', 'attackPct', 'critPct',
  'defensePct', 'healthPct', 'evasionPct', 'speedPct', 'cdrPct'
];
export const EXTRA_OPTION_COUNTS = { common: 0, magic: 0, rare: 0, epic: 1, unique: 2, legendary: 3 };
export const EXTRA_OPTION_MIN = 1;
export const EXTRA_OPTION_MAX = 3;
/** `cdrPct`만 1~2%다(밸런스 v2) — 상한 `EXTRA_CDR_CAP` 6%. */
export const EXTRA_CDR_MIN = 1;
export const EXTRA_CDR_MAX = 2;
export const extraOptionRange = key => key === 'cdrPct' ? { min: EXTRA_CDR_MIN, max: EXTRA_CDR_MAX } : { min: EXTRA_OPTION_MIN, max: EXTRA_OPTION_MAX };

export function extraOptionCount(rarity) { return EXTRA_OPTION_COUNTS[rarity] ?? 0; }

function seedOf(id) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** `id`·등급으로 정해지는 추가옵션 — `src/game/extraOptions.ts` `deriveExtraOptions`와 같은 결과. */
export function deriveExtraOptions(rarity, id) {
  const count = extraOptionCount(rarity);
  if (!count) return {};
  const next = seeded(seedOf(String(id ?? '') || rarity));
  const pool = [...EXTRA_OPTION_KEYS];
  const options = {};
  for (let index = 0; index < count && pool.length; index++) {
    const pick = Math.min(pool.length - 1, Math.floor(next() * pool.length));
    const key = pool.splice(pick, 1)[0];
    const { min, max } = extraOptionRange(key);
    options[key] = min + Math.min(max - min, Math.floor(next() * (max - min + 1)));
  }
  return options;
}

/** 저장된 값이 규칙(허용 키 10종·키별 1~3%(`cdrPct` 1~2%) 정수·중복 없음·등급별 개수)에 맞는지. */
export function extraOptionsWithin(item) {
  if (!item || typeof item !== 'object') return false;
  const count = extraOptionCount(item.rarity);
  if (item.extraOptions === undefined || item.extraOptions === null) return true;
  if (!count || typeof item.extraOptions !== 'object' || Array.isArray(item.extraOptions)) return false;
  const keys = Object.keys(item.extraOptions);
  if (keys.length !== count) return false;
  return keys.every(key => {
    if (!EXTRA_OPTION_KEYS.includes(key)) return false;
    const { min, max } = extraOptionRange(key);
    return Number.isInteger(item.extraOptions[key]) && item.extraOptions[key] >= min && item.extraOptions[key] <= max;
  });
}

/** 장비의 추가옵션을 `id` 기준으로 다시 채운다(일반·매직·레어는 필드를 지운다). */
export function normalizeExtraOptions(item) {
  if (!item || typeof item !== 'object' || typeof item.rarity !== 'string') return item;
  if (item.slot === 'skillbook' || item.slot === 'pouch' || item.kind === 'skillbook' || item.kind === 'pouch') {
    if (item.extraOptions !== undefined) delete item.extraOptions;
    return item;
  }
  const options = deriveExtraOptions(item.rarity, item.id);
  if (Object.keys(options).length) item.extraOptions = options;
  else delete item.extraOptions;
  return item;
}
