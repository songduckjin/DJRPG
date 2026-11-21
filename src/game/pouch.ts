import { EQUIPMENT_BAG_LIMIT, equipmentCount } from './bagCapacity';
import { jobOrDefault } from './skills';
import {
  isPouch, POUCH_NAME, rollEquipment, rollSkillBook,
  type EquipmentItem, type Item, type Rarity, type SkillBook, type TreasurePouch
} from './items';
import type { Save } from './store';

/**
 * 무작위 보물 주머니의 확률표 (작업 207, 사용자 최종 확정).
 *
 * 한 주머니를 열면 먼저 **분류**를 뽑고(금화 55% · 장비 40% · 스킬북 5%), 고른 분류 안에서 다시
 * 세부 확률을 뽑는다. 아래 `rate`는 모두 **그 분류 안에서의 몫**이며(합 100%), 분류별 합도 100%다.
 *  - 금화 55% → 1,500G 55% · 3,000G 32% · 5,000G 13%
 *  - 장비 40% → 일반 34% · 매직 30% · 레어 20% · 에픽 11% · 유니크 4% · 레전드 1%
 *    (등급이 정해지면 이 층의 슬롯·티어·스탯·`+단계` 규칙 그대로 1개를 만든다)
 *  - 스킬북 5% → 세 직업 모든 스킬북이 같은 확률(100%) — `rollSkillBook`이 직업을 1/3로 고른다
 *
 * `[확률표]` 화면은 이 전체 표를 **전체 확률 한 줄(10항목, 높은 확률 순)**로 보여 준다:
 * `POUCH_OVERALL_RATES`가 그 10줄의 근거이고, 각 줄 = 분류 확률 × 세부 확률(합 100.00%).
 */
export type PouchCategory = 'gold' | 'equipment' | 'skillbook';
export const POUCH_CATEGORIES: readonly { kind: PouchCategory; label: string; rate: number }[] = [
  { kind: 'gold', label: '금화', rate: .55 },
  { kind: 'equipment', label: '장비', rate: .40 },
  { kind: 'skillbook', label: '스킬북', rate: .05 }
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
/** 전체 확률 한 줄 — 분류 확률 × 세부 확률. 합이 정확히 100%다(사용자 확정 10항목). */
export const POUCH_OVERALL_RATES: readonly { label: string; rate: number; rarity?: Rarity }[] = [
  { label: '1,500G', rate: .3025 },
  { label: '3,000G', rate: .1760 },
  { label: '일반 장비', rate: .1360, rarity: 'common' },
  { label: '매직 장비', rate: .1200, rarity: 'magic' },
  { label: '레어 장비', rate: .0800, rarity: 'rare' },
  { label: '5,000G', rate: .0715 },
  { label: '무작위 스킬북 1권', rate: .0500 },
  { label: '에픽 장비', rate: .0440, rarity: 'epic' },
  { label: '유니크 장비', rate: .0160, rarity: 'unique' },
  { label: '레전드 장비', rate: .0040, rarity: 'legendary' }
];

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
  | { kind: 'skillbook'; item: SkillBook };

export function rollPouch(floor: number, random: () => number = Math.random): PouchResult {
  const category = rollPouchCategory(random);
  if (category === 'gold') return { kind: 'gold', gold: rollPouchGold(random) };
  if (category === 'equipment') return { kind: 'equipment', item: rollEquipment(floor, rollPouchRarity(random)) };
  return { kind: 'skillbook', item: rollSkillBook(floor) };
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
 * 가방 40칸은 **모든 아이템**(장비·스킬북·보물 주머니)을 1개씩 센다(작업 248). 주머니를 여는 것은
 * 주머니 1개를 빼고 결과 1개(또는 금화)를 넣는 **자리 바꿈**이라 칸 수가 늘지 않는다 — 가방이 꽉 찬
 * 상태에서도 그대로 열 수 있고, 40개를 넘긴 세이브도 주머니를 열어 줄여 나갈 수 있다.
 */
export function openPouch(save: Save, id?: string, random: () => number = Math.random): PouchOpenResult {
  const pouch = (id ? save.bag.find(item => item.id === id) : undefined) ?? firstPouch(save);
  if (!pouch || !isPouch(pouch)) return { ok: false, message: `가방에 ${POUCH_NAME}이(가) 없습니다.` };
  if (equipmentCount(save.bag, jobOrDefault(save.job)) > EQUIPMENT_BAG_LIMIT) return { ok: false, message: '가방이 40칸을 넘었습니다. 장비를 분해하거나 공용창고에 보관해 정리한 뒤 열어 주세요.' };
  const result = rollPouch(save.maxFloor || save.floor || 1, random);
  save.bag = save.bag.filter(item => item.id !== pouch.id);
  if (result.kind === 'gold') save.gold += result.gold;
  else save.bag.push(result.item);
  return { ok: true, pouch, result, remaining: pouchCount(save) };
}

/** 결과를 한 줄로 — 토스트·결과 카드가 같은 문구를 쓴다. */
export function pouchResultText(result: PouchResult): string {
  if (result.kind === 'gold') return `${result.gold.toLocaleString('ko-KR')} 금화`;
  return result.item.name;
}

/** 가방·상세가 쓰는 한 줄 설명. */
export const POUCH_HINT = '열면 금화·장비·스킬북 중 하나가 나옵니다';
export type { Item };
