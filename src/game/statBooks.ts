/**
 * 영구 스탯북 3종 (2026-11-22 스킬 개편 파트 B, 송덕진 님 확정 스펙).
 *
 * 스킬북을 전면 폐지하면서 그 자리에 들어온 **영구 능력치 책**이다. 가방·창고·거래소·우편 어디서든
 * 한 칸을 쓰는 소모품이고, 사용하면 캐릭터에 **영구 보너스**가 붙는다(장비처럼 벗을 수 없다).
 *
 * | 책        | 사용 시        | 캐릭터당 상한 |
 * |-----------|----------------|---------------|
 * | 공격의 서 | 공격력 +5      | 30권          |
 * | 방어의 서 | 방어력 +3      | 30권          |
 * | 체력의 서 | 체력 +30       | 30권          |
 *
 * 사용 권수는 세이브의 `statBooks`(`{ attack, defense, health }`)에 남는다. 스킬 트리(파트 A)가 쓰는
 * `skillPoints`/`skillLevels`와 **겹치지 않는 별도 필드**라 두 파트의 세이브 계약이 서로를 건드리지 않는다.
 *
 * 보너스는 `items.ts` `totalStats`가 **모든 배율(패시브·추가옵션 %)이 끝난 뒤** 더한다 — 그래야 책 한 권이
 * 화면에 적힌 그대로(+5/+3/+30) 늘어난다.
 */
import type { Item, Rarity, Stat } from './items';
import { random } from './rng';
import type { Save } from './store';

export type StatBookKind = 'attack' | 'defense' | 'health';
/** 세이브·화면·확률표가 함께 쓰는 고정 순서 — `공격 → 방어 → 체력`. */
export const STAT_BOOK_ORDER: readonly StatBookKind[] = ['attack', 'defense', 'health'];

/** 가방 아이템으로서의 스탯북 — 장비·보물 주머니처럼 이름·등급·빈 `stats`를 가진다. */
export type StatBook = {
  id: string;
  name: string;
  slot: 'statbook';
  rarity: Rarity;
  kind: 'statbook';
  /** 어떤 책인가 — `STAT_BOOKS`의 키. 서버 저장 검증도 이 값만 본다. */
  book: StatBookKind;
  stats: {};
};

export const STAT_BOOK_SLOT = 'statbook' as const;
/** 캐릭터당 책 종류별 사용 상한(송덕진 님 확정 30권). */
export const STAT_BOOK_LIMIT = 30;
/** 스탯북의 등급 표기 — 아이템 등급표(6단계) 그대로, 영구 능력치 책이라 주황(유니크)으로 둔다. */
export const STAT_BOOK_RARITY: Rarity = 'unique';

export type StatBookSpec = { name: string; stat: Stat; perBook: number; max: number; description: string };

/** 세 종류의 정의 — 이름·능력치·권당 상승량·상한을 **이 표 하나**에서만 읽는다. */
export const STAT_BOOKS: Record<StatBookKind, StatBookSpec> = {
  attack: { name: '공격의 서', stat: 'attack', perBook: 5, max: STAT_BOOK_LIMIT, description: '사용하면 영구 공격력 +5 (캐릭터당 최대 30권)' },
  defense: { name: '방어의 서', stat: 'defense', perBook: 3, max: STAT_BOOK_LIMIT, description: '사용하면 영구 방어력 +3 (캐릭터당 최대 30권)' },
  health: { name: '체력의 서', stat: 'health', perBook: 30, max: STAT_BOOK_LIMIT, description: '사용하면 영구 체력 +30 (캐릭터당 최대 30권)' }
};

export function isStatBookKind(value: unknown): value is StatBookKind {
  return value === 'attack' || value === 'defense' || value === 'health';
}

/**
 * 스탯북 드랍 확률 — **한 곳에서 조정한다**(송덕진 님 확정 2026-11-22: 일반 0.01%, 보스 0.05~0.1%).
 *
 * 값은 `1` = 100%다. 적용 지점:
 *  - `hunt`   접속 사냥의 **일반·정예 몹 1마리당** (`world.ts` `kill()`)
 *  - `offline` 방치 사냥 정산의 **1마리당** (`offline.ts` `hunt()`)
 *  - `boss`   필드 보스 1체당 (`world.ts` `kill()`, 보스 확률은 아이템 드랍과 별도로 한 번 더 굴린다)
 *  - `dungeonBoss` 끝없는 던전 보스 1체당 — 던전 보스가 바닥에 남기는 확정 2개 중 하나가 이 확률로 책이 된다
 *  - `pouch`  무작위 보물 주머니 1개당
 *
 * 세 종류는 **같은 확률(1/3)** 로 나뉜다(`rollStatBook`).
 * 확률을 바꾸려면 이 표의 숫자만 고치면 된다 — 다른 파일에는 확률 상수가 없다.
 */
export const STAT_BOOK_DROP_RATES = {
  hunt: .0001,
  offline: .0001,
  boss: .0005,
  dungeonBoss: .001,
  pouch: .01
} as const;
export type StatBookDropSource = keyof typeof STAT_BOOK_DROP_RATES;

/** 그 지점의 스탯북 드랍 확률(0~1). */
export function statBookDropChance(source: StatBookDropSource): number { return STAT_BOOK_DROP_RATES[source]; }

/** 스탯북 하나를 만든다. 이름은 정의 표에서 가져와 화면·서버가 같은 문자열을 쓴다. */
export function statBookItem(kind: StatBookKind, id: string = crypto.randomUUID()): StatBook {
  return { id, name: STAT_BOOKS[kind].name, slot: STAT_BOOK_SLOT, rarity: STAT_BOOK_RARITY, kind: 'statbook', book: kind, stats: {} };
}

/** 세 종류 중 하나를 **같은 확률(1/3)** 로 뽑는다. */
export function rollStatBook(draw: () => number = random): StatBook {
  const index = Math.min(STAT_BOOK_ORDER.length - 1, Math.max(0, Math.floor(draw() * STAT_BOOK_ORDER.length)));
  return statBookItem(STAT_BOOK_ORDER[index]);
}

/** 이 지점에서 책이 떨어졌으면 그 책, 아니면 `undefined` — 확률 판정과 뽑기를 함께 한다. */
export function rollStatBookDrop(source: StatBookDropSource, draw: () => number = random): StatBook | undefined {
  return draw() < statBookDropChance(source) ? rollStatBook(draw) : undefined;
}

/** 세이브에 남은 종류별 사용 권수(0~30). 값이 없거나 깨진 옛 세이브는 0부터 센다. */
export type StatBookCounts = Record<StatBookKind, number>;
export function statBookCounts(save: Pick<Save, 'statBooks'> | undefined): StatBookCounts {
  const source = save?.statBooks as Partial<Record<StatBookKind, unknown>> | undefined;
  const counts = {} as StatBookCounts;
  for (const kind of STAT_BOOK_ORDER) {
    const raw = Number(source?.[kind]);
    counts[kind] = Number.isFinite(raw) ? Math.max(0, Math.min(STAT_BOOKS[kind].max, Math.floor(raw))) : 0;
  }
  return counts;
}

/** 그 종류를 더 쓸 수 있는 권수. */
export function statBookRemaining(save: Pick<Save, 'statBooks'>, kind: StatBookKind): number {
  return Math.max(0, STAT_BOOKS[kind].max - statBookCounts(save)[kind]);
}

/** 사용 권수 → 영구 보너스(공격/방어/체력). `totalStats`가 마지막에 더한다. */
export function statBookBonus(save: Pick<Save, 'statBooks'> | undefined): Record<'attack' | 'defense' | 'health', number> {
  const counts = statBookCounts(save);
  return {
    attack: counts.attack * STAT_BOOKS.attack.perBook,
    defense: counts.defense * STAT_BOOKS.defense.perBook,
    health: counts.health * STAT_BOOKS.health.perBook
  };
}

/** 책 하나가 주는 값 — 상세 창이 쓴다. */
export function statBookGain(kind: StatBookKind): { stat: Stat; amount: number } {
  const spec = STAT_BOOKS[kind];
  return { stat: spec.stat, amount: spec.perBook };
}

/**
 * 가방의 스탯북 한 권을 사용한다 — 그 책을 소모하고 `save.statBooks`를 1 올린다.
 *
 * 상한(30권)에 닿은 종류는 소모하지 않고 안내만 돌려준다. 최대 체력이 오르는 `체력의 서`는 호출부가
 * `totalStats` 차이만큼 현재 체력도 올려 준다(`equipModal`의 사용 버튼).
 */
export function useStatBook(save: Save, itemId: string): { ok: boolean; message: string } {
  const index = save.bag.findIndex(item => item.id === itemId);
  if (index < 0) return { ok: false, message: '가방에 그 책이 없습니다.' };
  const item = save.bag[index];
  if (item.kind !== 'statbook') return { ok: false, message: '스탯북만 사용할 수 있습니다.' };
  const kind = (item as StatBook).book;
  if (!isStatBookKind(kind)) return { ok: false, message: '스탯북 정보를 읽을 수 없습니다.' };
  const spec = STAT_BOOKS[kind];
  const counts = statBookCounts(save);
  if (counts[kind] >= spec.max) return { ok: false, message: `${spec.name}은(는) 이미 최대 ${spec.max}권 사용했습니다.` };
  save.statBooks = { ...counts, [kind]: counts[kind] + 1 };
  save.bag = save.bag.filter(other => other.id !== item.id);
  const statName = spec.stat === 'attack' ? '공격력' : spec.stat === 'defense' ? '방어력' : '체력';
  return { ok: true, message: `${spec.name} 사용! 영구 ${statName} +${spec.perBook} (사용 ${counts[kind] + 1}/${spec.max}권)` };
}

/** 상세 창 한 줄 — `영구 공격력 +5 · 사용 3/30권`. */
export function statBookStatusText(save: Pick<Save, 'statBooks'>, kind: StatBookKind): string {
  const spec = STAT_BOOKS[kind];
  const statName = spec.stat === 'attack' ? '공격력' : spec.stat === 'defense' ? '방어력' : '체력';
  return `영구 ${statName} +${spec.perBook} · 사용 ${statBookCounts(save)[kind]}/${spec.max}권`;
}

/** 가방 칸이 쓰는 짧은 이름(정의 표의 이름 그대로). */
export function statBookName(item: Item): string {
  return item.kind === 'statbook' && isStatBookKind((item as StatBook).book) ? STAT_BOOKS[(item as StatBook).book].name : item.name;
}
