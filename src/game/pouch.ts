import {
  isPouch, POUCH_NAME, rollEquipment,
  type EquipmentItem, type Item, type Rarity, type StatBook, type TreasurePouch
} from './items';
import { STAT_BOOK_DROP_RATES, rollStatBook } from './statBooks';
import type { Save } from './store';
import { addItemToBag } from './rewardGrant';

/**
 * 무작위 보물 주머니의 확률표 (작업 207 → 파트 B 2026-11-22).
 *
 * 한 주머니를 열면 먼저 **분류**를 뽑고(금화 59% · 장비 40% · 영구 스탯북 1%), 고른 분류 안에서 다시
 * 세부 확률을 뽑는다. 아래 `rate`는 모두 **그 분류 안에서의 몫**이며(합 100%), 분류별 합도 100%다.
 *  - 금화 59% → 1,500G 55% · 3,000G 32% · 5,000G 13%
 *  - 장비 40% → 일반 34% · 매직 30% · 레어 20% · 에픽 11% · 유니크 4% · 레전드 1%
 *    (등급이 정해지면 이 층의 슬롯·티어·스탯·`+단계` 규칙 그대로 1개를 만든다)
 *  - 영구 스탯북 1% → 공격의 서·방어의 서·체력의 서가 같은 확률(1/3)
 *
 * **스킬북 5%는 파트 B에서 폐지됐다** — 그 5%를 장비·금화로 돌리고, 스탯북은 개극악 확률(1%)만 남겼다.
 * 분류 확률은 `statBooks.ts`의 `STAT_BOOK_DROP_RATES.pouch` 한 값에서 나머지를 계산하므로, 확률을 바꾸려면
 * 그 표만 고치면 된다(`POUCH_STAT_BOOK_RATE`).
 *
 * `[확률표]` 화면은 이 전체 표를 **전체 확률 한 줄(10항목, 높은 확률 순)**로 보여 준다:
 * `POUCH_OVERALL_RATES`가 그 10줄의 근거이고, 각 줄 = 분류 확률 × 세부 확률(합 100.00%).
 */
export type PouchCategory = 'gold' | 'equipment' | 'statbook';
/** 주머니 하나가 스탯북일 확률 — `statBooks.ts`의 확률표에서 온다(여기서 숫자를 따로 두지 않는다). */
export const POUCH_STAT_BOOK_RATE = STAT_BOOK_DROP_RATES.pouch;
export const POUCH_CATEGORIES: readonly { kind: PouchCategory; label: string; rate: number }[] = [
  { kind: 'gold', label: '금화', rate: .59 },
  { kind: 'equipment', label: '장비', rate: .40 },
  { kind: 'statbook', label: '영구 스탯북', rate: POUCH_STAT_BOOK_RATE }
];
export const POUCH_GOLD_TIERS: readonly { gold: number; rate: number }[] = [
  { gold: 1500, rate: .55 },
  { gold: 3000, rate: .32 },
  { gold: 5000, rate: .13 }
];
export const POUCH_RARITY_TIERS: readonly { rarity: Rarity; rate: number }[] = [
  { rarity: 'common', rate: .34 },
  { rarity: 'magic', rate: .30 },
  { rarity: 'rare', rate: .20 },
  { rarity: 'epic', rate: .11 },
  { rarity: 'unique', rate: .04 },
  { rarity: 'legendary', rate: .01 }
];
/** 확률표의 등급 색 — 장비 등급색과 같은 값(인게임 `.rarity-*`). */
export const POUCH_RARITY_INK: Record<Rarity, string> = {
  common: '#9ca3af', magic: '#60a5fa', rare: '#facc15', epic: '#c084fc', unique: '#fb923c', legendary: '#f87171'
};
/**
 * 전체 확률 한 줄 — 분류 확률 × 세부 확률. 합이 정확히 100%다(사용자 확정 10항목).
 * 표에서 계산하므로 분류·세부 확률을 바꿔도 이 목록이 어긋나지 않는다.
 */
const pouchCategoryRate = (kind: PouchCategory): number => POUCH_CATEGORIES.find(entry => entry.kind === kind)?.rate ?? 0;
/** 분류 × 세부 확률 — 부동소수 오차를 지워 화면 표기(소수 둘째 자리 %)와 정확히 맞춘다. */
const overallRate = (rate: number): number => Math.round(rate * 1e6) / 1e6;
export const POUCH_OVERALL_RATES: readonly { label: string; rate: number; rarity?: Rarity }[] = [
  ...POUCH_GOLD_TIERS.map(tier => ({ label: `${tier.gold.toLocaleString('ko-KR')}G`, rate: overallRate(pouchCategoryRate('gold') * tier.rate) })),
  ...POUCH_RARITY_TIERS.map(tier => ({ label: `${({ common: '일반', magic: '매직', rare: '레어', epic: '에픽', unique: '유니크', legendary: '레전드' } as Record<Rarity, string>)[tier.rarity]} 장비`, rate: overallRate(pouchCategoryRate('equipment') * tier.rate), rarity: tier.rarity })),
  { label: '영구 스탯북 1권', rate: overallRate(pouchCategoryRate('statbook')) }
].sort((a, b) => b.rate - a.rate);

/** 가중 표에서 하나를 뽑는다. 표의 합이 1이 아니어도(반올림) 마지막 항목으로 떨어져 결과가 빈다. */
function pick<T extends { rate: number }>(table: readonly T[], random: () => number): T {
  const total = table.reduce((sum, entry) => sum + entry.rate, 0);
  let roll = random() * total;
  for (const entry of table) { roll -= entry.rate; if (roll < 0) return entry; }
  return table[table.length - 1];
}

export function rollPouchCategory(random: () => number = Math.random): PouchCategory {
  return pick(POUCH_CATEGORIES, random).kind;
}
export function rollPouchGold(random: () => number = Math.random): number {
  return pick(POUCH_GOLD_TIERS, random).gold;
}
export function rollPouchRarity(random: () => number = Math.random): Rarity {
  return pick(POUCH_RARITY_TIERS, random).rarity;
}

/** 주머니 하나를 열었을 때의 결과 — 아직 세이브에 넣지 않은 순수 계산이다. */
export type PouchResult =
  | { kind: 'gold'; gold: number }
  | { kind: 'equipment'; item: EquipmentItem }
  | { kind: 'statbook'; item: StatBook };

export function rollPouch(floor: number, random: () => number = Math.random): PouchResult {
  const category = rollPouchCategory(random);
  if (category === 'gold') return { kind: 'gold', gold: rollPouchGold(random) };
  if (category === 'equipment') return { kind: 'equipment', item: rollEquipment(floor, rollPouchRarity(random)) };
  return { kind: 'statbook', item: rollStatBook(random) };
}

export function pouchCount(save: Pick<Save, 'bag'>): number {
  return save.bag.filter(isPouch).length;
}
export function firstPouch(save: Pick<Save, 'bag'>): TreasurePouch | undefined {
  return save.bag.find(isPouch);
}

export type PouchOpenResult =
  | { ok: true; pouch: TreasurePouch; result: PouchResult; remaining: number }
  | { ok: false; message: string };

/**
 * 주머니 1개를 소모하고 결과를 세이브에 넣는다.
 *
 * 가방 40칸은 **모든 아이템**을 1개씩 센다(파트 B: 스탯북·보물 주머니도 한 칸). 주머니를 여는 것은
 * 주머니 1개를 빼고 결과 1개(또는 금화)를 넣는 **자리 바꿈**이라 칸 수가 **늘지 않는다**(금화면 -1, 아이템이면 0).
 * 그래서 40칸이 찬 상태는 물론 **이미 40칸을 넘긴 세이브에서도** 주머니를 열 수 있다(작업 251).
 * 서버 `reconcileItems`도 "지금 개수 이하 유지" 저장은 통과시킨다.
 */
export function openPouch(save: Save, id?: string, random: () => number = Math.random): PouchOpenResult {
  const pouch = (id ? save.bag.find(item => item.id === id) : undefined) ?? firstPouch(save);
  if (!pouch || !isPouch(pouch)) return { ok: false, message: `가방에 ${POUCH_NAME}이(가) 없습니다.` };
  const result = rollPouch(save.maxFloor || save.floor || 1, random);
  save.bag = save.bag.filter(item => item.id !== pouch.id);
  if (result.kind === 'gold') save.gold += result.gold;
  else addItemToBag(save, result.item, 'pouch', { enforceCapacity: false });
  return { ok: true, pouch, result, remaining: pouchCount(save) };
}

/** 결과를 한 줄로 — 토스트·결과 카드가 같은 문구를 쓴다. */
export function pouchResultText(result: PouchResult): string {
  if (result.kind === 'gold') return `${result.gold.toLocaleString('ko-KR')} 금화`;
  return result.item.name;
}

/** 가방·상세가 쓰는 한 줄 설명. */
export const POUCH_HINT = '열면 금화·장비·영구 스탯북 중 하나가 나옵니다';
export type { Item };
