import type { EquipmentItem, Rarity, Stat } from './items';
import { CRIT_DAMAGE_BONUS_CAP, critDamageScale } from './battle/formulas';

/**
 * 장비 추가옵션(보조 옵션) — 작업 238.
 *
 * 에픽·유니크·전설 장비에는 등급에 따라 1·2·3개의 추가옵션이 붙는다(일반·매직·레어는 0개).
 * 값은 1~3%의 정수이고, 한 아이템 안에서 같은 옵션이 두 번 나오지 않는다.
 *
 * **기존에 이미 지급된 장비**와 **새로 떨어지는 장비**가 같은 규칙을 쓰도록, 옵션은 아이템 `id`로
 * 정해지는 결정적 난수(seed)로 뽑는다. 그래서 같은 id면 언제 어디서 계산해도(가방·장착·공용창고·
 * 거래소·서버 검증) 같은 옵션이 나오고, DB를 전수 수정하지 않아도 기존 에픽·유니크·전설 장비 전부에
 * 옵션이 즉시 붙는다. 서버(`server/extra-options.mjs`)도 같은 식을 쓰며, 테스트가 두 구현을 대조한다.
 */
export type ExtraOptionKey =
  | 'regenPct' | 'bonusDmgPct' | 'lifestealPct' | 'attackPct' | 'critPct'
  | 'defensePct' | 'healthPct' | 'evasionPct' | 'speedPct' | 'cdrPct' | 'critDmgPct';
export type ExtraOptions = Partial<Record<ExtraOptionKey, number>>;

/** 추가옵션 11종 — 이 순서가 뽑기 풀의 순서다(`id` 시드가 같으면 이 순서로 뽑히므로 바꾸지 않는다).
 *  `cdrPct`(스킬 쿨타임 감소)는 밸런스 v2에서, `critDmgPct`(치명타 피해량, 백로그 2번)는 그 뒤에
 *  **맨 뒤로** 덧붙였다 — 풀 길이가 10→11로 늘어나므로 저장된 옵션이 **없던** 옛 장비만 한 번 다시
 *  뽑히고(여전히 1~3%·등급별 개수 그대로), 저장된 값이 있는 장비는 `validExtraOptions`가 그대로 살린다. */
export const extraOptionKeys: readonly ExtraOptionKey[] = [
  'regenPct', 'bonusDmgPct', 'lifestealPct', 'attackPct', 'critPct',
  'defensePct', 'healthPct', 'evasionPct', 'speedPct', 'cdrPct', 'critDmgPct'
];

/** 표시 이름 — `critPct`(확률)와 `critDmgPct`(터졌을 때의 배수)는 **다른 것**이라 이름으로 갈라 적는다.
 *  예전에 둘 다 `치명타`로 적혀 장비 상세에서 어느 쪽인지 알 수 없었다(백로그 2번). */
export const extraOptionNames: Record<ExtraOptionKey, string> = {
  regenPct: '체력회복력', bonusDmgPct: '추가 데미지', lifestealPct: '피흡',
  attackPct: '공격력', critPct: '치명타 확률', defensePct: '방어력',
  healthPct: '체력', evasionPct: '회피율', speedPct: '공격속도', cdrPct: '쿨타임 감소',
  critDmgPct: '치명타 피해량'
};

/** 등급별 추가옵션 개수 — 일반·매직·레어 0, 에픽 1, 유니크 2, 전설 3. */
export const extraOptionCounts: Record<Rarity, number> = { common: 0, magic: 0, rare: 0, epic: 1, unique: 2, legendary: 3 };

export const EXTRA_OPTION_MIN = 1;
export const EXTRA_OPTION_MAX = 3;
/** `cdrPct`(스킬 쿨타임 감소)만 1~2%다 — 1~3%면 부위 하나에 3%가 붙어 상한(35%)을 너무 쉽게 넘긴다(밸런스 v2). */
export const EXTRA_CDR_MIN = 1;
export const EXTRA_CDR_MAX = 2;
/** 그 옵션이 가질 수 있는 값의 범위. */
export function extraOptionRange(key: ExtraOptionKey): { min: number; max: number } {
  return key === 'cdrPct' ? { min: EXTRA_CDR_MIN, max: EXTRA_CDR_MAX } : { min: EXTRA_OPTION_MIN, max: EXTRA_OPTION_MAX };
}

/** 회피율 합산 상한 — 10부위에서 30%까지(사용자 확정 밸런스 보충). */
export const EXTRA_EVASION_CAP = 30;
/** 체력회복력 합산 상한(%/5초) — 부위를 모두 채워도 5초마다 최대 체력의 12%까지만 회복한다(불사 방지). */
export const EXTRA_REGEN_CAP = 12;
/** 체력회복력이 도는 간격(초). */
export const EXTRA_REGEN_SECONDS = 5;
/** 치명타·공격속도 추가옵션의 합산 상한(%) — 치명 예산(기본 20 + 패시브 30 + 장비 60 = 110)을 넘지 않게. */
export const EXTRA_CRIT_CAP = 10;
export const EXTRA_SPEED_CAP = 10;
/** 쿨타임 감소 추가옵션의 합산 상한(%) — 부위 3개(전설) × 2%. */
export const EXTRA_CDR_CAP = 6;
/** 치명타 피해량(`critDmgPct`) 합산 상한(%) — 값의 단일 기준은 `battle/formulas.ts` `CRIT_DAMAGE_BONUS_CAP`.
 *  10부위 × 3%면 30%지만 +15%에서 자른다(치명타 한 방이 1.95배를 넘지 않게, 덕진 님 확정). */
export const EXTRA_CRIT_DMG_CAP = CRIT_DAMAGE_BONUS_CAP;
/** 피흡 합산 상한(%) — 장비로만 얻으며 넘는 값은 잘라 쓴다(밸런스 v2: 15 → 5). */
export const EXTRA_LIFESTEAL_CAP = 5;
/** 한 번의 타격에서 피흡으로 회복할 수 있는 최대치(최대 체력 대비 비율) — 큰 광역 한 방이 체력을 다 채우지 않게. */
export const EXTRA_LIFESTEAL_HIT_CAP = .004;
/** 1초 동안 피흡으로 회복할 수 있는 최대치(최대 체력 대비 비율) — 연타·광역으로 피가 솟지 않게(밸런스 v2). */
export const EXTRA_LIFESTEAL_SECOND_CAP = .025;

/** 그 등급이 가질 추가옵션 개수(0~3). */
export function extraOptionCount(rarity: Rarity): number { return extraOptionCounts[rarity] ?? 0; }

/** 문자열 id의 32비트 해시(FNV-1a) — 결정적 난수의 시드. */
function seedOf(id: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index++) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 32비트 시드 하나로 재현되는 난수(mulberry32). `src/game/rng.ts`의 `seededRandom`과 같은 식이다. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `id`와 등급으로 추가옵션을 뽑는다 — 같은 id·등급이면 언제나 같은 결과다.
 * 풀에서 중복 없이 `count`개를 고르고(피셔-예이츠), 값은 1~3% 정수다.
 */
export function deriveExtraOptions(rarity: Rarity, id: string): ExtraOptions {
  const count = extraOptionCount(rarity);
  if (!count) return {};
  const next = seeded(seedOf(id || rarity));
  const pool = [...extraOptionKeys];
  const options: ExtraOptions = {};
  for (let index = 0; index < count && pool.length; index++) {
    const pick = Math.min(pool.length - 1, Math.floor(next() * pool.length));
    const key = pool.splice(pick, 1)[0];
    const { min, max } = extraOptionRange(key);
    options[key] = min + Math.min(max - min, Math.floor(next() * (max - min + 1)));
  }
  return options;
}

/** 저장된 추가옵션이 이 등급의 규칙(허용 키 10종·키별 1~3%(cdrPct 1~2%) 정수·중복 없음·개수 일치)에 맞는지. */
export function validExtraOptions(raw: unknown, rarity: Rarity): ExtraOptions | undefined {
  const count = extraOptionCount(rarity);
  if (!count || typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== count) return undefined;
  const options: ExtraOptions = {};
  for (const key of keys) {
    if (!(extraOptionKeys as readonly string[]).includes(key)) return undefined;
    const value = record[key];
    const { min, max } = extraOptionRange(key as ExtraOptionKey);
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) return undefined;
    options[key as ExtraOptionKey] = value as number;
  }
  return options;
}

/**
 * 아이템의 추가옵션 — 저장된 값이 규칙에 맞으면 그것을, 아니면(옛 장비) `id`로 뽑은 값을 쓴다.
 * 등급이 일반·매직·레어면 언제나 빈 객체다.
 */
export function extraOptionsFor(item: Pick<EquipmentItem, 'id' | 'rarity'> & { extraOptions?: unknown }): ExtraOptions {
  if (!extraOptionCount(item.rarity)) return {};
  return validExtraOptions(item.extraOptions, item.rarity) ?? deriveExtraOptions(item.rarity, item.id);
}

/** 아이템에 추가옵션을 채워 넣는다(없는 등급이면 필드를 지운다) — 마이그레이션·드롭 때 한 번. */
export function normalizeExtraOptions<T extends { id: string; rarity: Rarity; extraOptions?: ExtraOptions }>(item: T): T {
  const options = extraOptionsFor(item);
  if (Object.keys(options).length) item.extraOptions = options;
  else delete item.extraOptions;
  return item;
}

/** 장비 한 벌(부위별)의 추가옵션 합계 — 중복 없이 모두 더한다(상한은 `effectiveExtraOptions`). */
export function extraOptionTotals(equipment: Partial<Record<string, EquipmentItem | undefined>> | undefined): Record<ExtraOptionKey, number> {
  const total = Object.fromEntries(extraOptionKeys.map(key => [key, 0])) as Record<ExtraOptionKey, number>;
  for (const item of Object.values(equipment ?? {})) {
    if (!item) continue;
    const options = extraOptionsFor(item);
    for (const key of extraOptionKeys) total[key] += options[key] ?? 0;
  }
  return total;
}

/** 실제 전투에 쓰는 값 — 회피 30%·체력회복 12%/5초·피흡 5%·치명·공속 10%·쿨감 6%·치명타 피해 15% 상한을 적용한다. */
export function effectiveExtraOptions(equipment: Partial<Record<string, EquipmentItem | undefined>> | undefined): Record<ExtraOptionKey, number> {
  const total = extraOptionTotals(equipment);
  total.evasionPct = Math.min(EXTRA_EVASION_CAP, total.evasionPct);
  total.regenPct = Math.min(EXTRA_REGEN_CAP, total.regenPct);
  total.lifestealPct = Math.min(EXTRA_LIFESTEAL_CAP, total.lifestealPct);
  total.critPct = Math.min(EXTRA_CRIT_CAP, total.critPct);
  total.speedPct = Math.min(EXTRA_SPEED_CAP, total.speedPct);
  total.cdrPct = Math.min(EXTRA_CDR_CAP, total.cdrPct);
  total.critDmgPct = Math.min(EXTRA_CRIT_DMG_CAP, total.critDmgPct);
  return total;
}

/**
 * 추가옵션의 전투력 가중치 — `itemPower`가 자동 장착·`▲ 업그레이드`·분해 보호에서 추가옵션까지
 * 비교하도록 더한다. 1%가 대략 스탯 1~3점에 해당하는 정도로 잡아, 같은 등급·비슷한 스탯의 장비
 * 사이에서는 추가옵션이 결정을 가르고, 등급 차이(등급 1단계 = +2)를 뒤집지는 않게 한다.
 */
const extraOptionPowerWeights: Record<ExtraOptionKey, number> = {
  attackPct: 3, bonusDmgPct: 3, critPct: 2.5, speedPct: 2.5, evasionPct: 2,
  defensePct: 2, lifestealPct: 2, healthPct: 1, regenPct: 1, cdrPct: 4,
  // 치명타 피해량은 **확률이 100%일 때만** 온전히 값어치가 있어 확률(2.5)보다 낮게 잡는다(덕진 님 확정 1.2).
  critDmgPct: 1.2
};

/** 장비 교체 평가용 환산표. 새 옵션 키는 이 표에 추가하며, 아직 모르는 키도 작은 양수로 평가한다. */
type CombatStats = { attack: number; defense: number; health: number; crit: number; speed: number; cdr: number };
const optionValueTable: Partial<Record<ExtraOptionKey, (value: number, stats: CombatStats) => number>> = {
  attackPct: (value, stats) => stats.attack * value / 100 * 3,
  defensePct: (value, stats) => stats.defense * value / 100 * 2,
  healthPct: (value, stats) => stats.health * value / 100 * .2,
  bonusDmgPct: (value, stats) => stats.attack * value / 100 * 3,
  critPct: (value, stats) => stats.attack * value / 100 * .6,
  speedPct: (value, stats) => stats.attack * value / 100 * .6,
  cdrPct: (value, stats) => stats.attack * value / 100 * .9,
  lifestealPct: (value, stats) => Math.min(stats.attack * value / 100, stats.health * EXTRA_LIFESTEAL_SECOND_CAP) * .7,
  evasionPct: (value, stats) => stats.health * value / 100 * .2,
  regenPct: (value, stats) => stats.health * value / 100 / EXTRA_REGEN_SECONDS * .2
};
export function extraOptionValue(key: string, value: number, stats: CombatStats): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return (optionValueTable as Record<string, ((value: number, stats: CombatStats) => number) | undefined>)[key]?.(value, stats)
    ?? Math.max(.25, stats.attack * .001) * value;
}

/** 추가옵션만의 전투력 몫. */
export function extraOptionPower(item: Pick<EquipmentItem, 'id' | 'rarity'> & { extraOptions?: unknown }): number {
  const options = extraOptionsFor(item);
  let power = 0;
  for (const key of extraOptionKeys) power += (options[key] ?? 0) * extraOptionPowerWeights[key];
  return power;
}

/** 상세 화면 한 줄 — `✨ 체력회복력 +2%`. */
export function extraOptionLine(key: ExtraOptionKey, value: number): string { return `✨ ${extraOptionNames[key]} +${value}%`; }

/** 그 아이템의 추가옵션 줄들(표시 순서는 풀 순서). */
export function extraOptionLines(item: Pick<EquipmentItem, 'id' | 'rarity'> & { extraOptions?: unknown }): string[] {
  const options = extraOptionsFor(item);
  return extraOptionKeys.filter(key => options[key] !== undefined).map(key => extraOptionLine(key, options[key] as number));
}

/**
 * 이 장비로 오른 치명타 **배수** — 기본 1.8 + `치명타 피해량`(상한 15%).
 * 전투(`combat/engine.ts`)·방치 정산(`offline.ts`)·상세 스탯(`statSheet.ts`)이 같은 값을 본다.
 */
export function extraCritDamageScale(equipment: Partial<Record<string, EquipmentItem | undefined>> | undefined): number {
  return critDamageScale(effectiveExtraOptions(equipment).critDmgPct);
}

/** 내 정보 스탯 아래에 한 줄로 붙는 요약 — 실제 전투 값(상한 적용)을 쓴다. */
export function extraOptionSummary(equipment: Partial<Record<string, EquipmentItem | undefined>> | undefined): string {
  const effective = effectiveExtraOptions(equipment);
  return extraOptionKeys
    .filter(key => effective[key] > 0)
    .map(key => `${extraOptionNames[key]} ${effective[key]}%`)
    .join(' · ');
}

/** 스탯 이름과 겹치지 않게, 추가옵션 키가 어떤 기본 스탯을 키우는지(내 정보 표시용). */
export const extraOptionStat: Partial<Record<ExtraOptionKey, Stat>> = {
  attackPct: 'attack', defensePct: 'defense', healthPct: 'health', critPct: 'crit', speedPct: 'speed', cdrPct: 'cdr'
};
