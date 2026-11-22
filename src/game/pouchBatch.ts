import { isStatBook, itemDisplayName, POUCH_NAME, type EquipmentItem, type Rarity, type StatBook } from './items';
import { openPouch, pouchCount, type PouchResult } from './pouch';
import type { StatBookKind } from './statBooks';
import type { Save } from './store';

/**
 * 보물 주머니 **한 번에 열기** (2026-11-22).
 *
 * 가방의 주머니를 하나씩 1.55초 연출로 까면 30개에 46초가 걸린다(파트 B로 모든 계정이 30개를 받았다).
 * 그래서 가방·개봉 창에서 `전부 열기`를 누르면 **보유한 주머니를 모두** 열고, 연출 대신 **결과 요약 한 장**을
 * 보여 준다.
 *
 * 규칙은 1개 열기(`openPouch`)를 그대로 반복해 쓴다 — 확률표·장비 티어·`+N`·가방 자리 규칙이 두 벌이 되면
 * 어긋나기 때문이다. 이 모듈이 더하는 것은 **집계**(`summarizePouchResults`)뿐이다.
 *
 * **가방 40칸**: 보물 주머니는 수량 무관 **1칸**이다(주머니 스택형). 처음 주머니를 열어도 그 칸이 비지 않으므로,
 * 결과가 장비·스탯북(새 칸)인데 가방이 이미 40칸이면 거기서 멈춘다(넘치는 결과를 잃지 않게).
 * 금화는 칸을 쓰지 않으므로 계속 열린다. 서버 `reconcileItems`는 "지금 칸 이하 유지" 저장을 통과시킨다.
 *
 * **금화**: 한 번에 열면 금화가 한 저장 창에 몰린다(30개 × 최대 5,000G = 150,000G). 서버 `clampSaveProgress`의
 * 금화 상한은 사냥 시간으로 계산되므로 이만큼은 정당하게 인정되지 않는다 — 그래서 서버는 **소모된 주머니 수 ×
 * `POUCH_MAX_GOLD`** 를 같은 저장의 `goldCredit`으로 더한다(`server/db/items.mjs` `reconcileItems`).
 * 클라이언트는 그 상한을 알 필요가 없다(서버가 계산한다).
 */
/** 한 번에 열기 한 번이 여는 주머니 수 상한 — 서버 아이템 생성 상한(40 + 초당 0.5개) 안에 넉넉히 든다. */
export const POUCH_BATCH_LIMIT = 40;

export type PouchBatchRow = {
  /** 같은 이름·등급(장비) 또는 같은 종류(스탯북)의 묶음 키. */
  key: string;
  kind: 'equipment' | 'statbook';
  name: string;
  rarity: Rarity;
  count: number;
  /** 묶음의 대표 아이템 — 요약 줄의 그림·등급색을 그린다. */
  item: EquipmentItem | StatBook;
};

export type PouchBatchSummary = {
  /** 실제로 연 주머니 수. */
  opened: number;
  /** 획득 금화 합계. */
  gold: number;
  /** 획득 장비 수. */
  equipmentCount: number;
  /** 획득 영구 스탯북 권수. */
  bookTotal: number;
  /** 장비 등급별 수량 — 요약의 등급 표기. */
  rarityCounts: Record<Rarity, number>;
  /** 스탯북 종류별 권수. */
  bookCounts: Record<StatBookKind, number>;
  /** 획득한 장비·스탯북 묶음(전설 → 일반, 많은 수 → 이름 순). */
  rows: PouchBatchRow[];
  /** 레전드 장비 — 전광판(`ui.sharePouchLegend`)에 한 줄씩 올린다. */
  legendary: EquipmentItem[];
  /** 열고 남은 주머니 수. */
  remaining: number;
  /** 칸이 모자라 중간에 멈췄는가(주머니 스택형) — 남은 주머니는 그대로 가방에 있다. */
  blocked: boolean;
};

const RARITY_ORDER: Rarity[] = ['legendary', 'unique', 'epic', 'rare', 'magic', 'common'];
const bookKinds: StatBookKind[] = ['attack', 'defense', 'health'];

/** 결과 묶음을 요약한다 — 세이브는 건드리지 않는 순수 함수. */
export function summarizePouchResults(results: readonly PouchResult[], remaining: number, blocked = false): PouchBatchSummary {
  const gold = results.reduce((total, result) => total + (result.kind === 'gold' ? result.gold : 0), 0);
  const rarityCounts = Object.fromEntries(RARITY_ORDER.map(rarity => [rarity, 0])) as Record<Rarity, number>;
  const bookCounts = { attack: 0, defense: 0, health: 0 } as Record<StatBookKind, number>;
  const rows = new Map<string, PouchBatchRow>();
  const legendary: EquipmentItem[] = [];
  for (const result of results) {
    if (result.kind === 'gold') continue;
    const item = result.item;
    if (isStatBook(item)) {
      bookCounts[item.book] += 1;
      const key = `statbook:${item.book}`;
      const row = rows.get(key);
      if (row) row.count += 1;
      else rows.set(key, { key, kind: 'statbook', name: itemDisplayName(item), rarity: item.rarity, count: 1, item });
      continue;
    }
    rarityCounts[item.rarity] += 1;
    if (item.rarity === 'legendary') legendary.push(item);
    // 같은 이름·등급은 한 줄로 묶는다(스탯·`+N`이 달라도 가방에서 같은 물건으로 보인다).
    const key = `equipment:${item.rarity}:${itemDisplayName(item)}`;
    const row = rows.get(key);
    if (row) row.count += 1;
    else rows.set(key, { key, kind: 'equipment', name: itemDisplayName(item), rarity: item.rarity, count: 1, item });
  }
  const rank = (rarity: Rarity): number => RARITY_ORDER.length - RARITY_ORDER.indexOf(rarity);
  return {
    opened: results.length,
    gold,
    equipmentCount: RARITY_ORDER.reduce((total, rarity) => total + rarityCounts[rarity], 0),
    bookTotal: bookKinds.reduce((total, kind) => total + bookCounts[kind], 0),
    rarityCounts,
    bookCounts,
    rows: [...rows.values()].sort((a, b) => rank(b.rarity) - rank(a.rarity) || b.count - a.count
      || a.name.localeCompare(b.name, 'ko-KR')),
    legendary,
    remaining,
    blocked
  };
}

export type PouchOpenAllResult =
  | { ok: true; summary: PouchBatchSummary }
  | { ok: false; message: string };

/**
 * 가방의 보물 주머니를 **전부** 연다.
 *
 * 한 개 열기(`openPouch`)를 남은 수만큼 반복하므로 확률·지급·가방 자리 규칙이 1개 열기와 완전히 같다.
 * 가방이 가득 차 장비·스탯북을 넣을 칸이 없으면 **그 자리에서 멈추고** 남은 주머니를 그대로 둔다(주머니 스택형)
 * — 금화는 칸을 쓰지 않으므로 그 전까지는 계속 열린다.
 */
export function openPouches(save: Save, options: { random?: () => number } = {}): PouchOpenAllResult {
  const total = pouchCount(save);
  if (!total) return { ok: false, message: `가방에 ${POUCH_NAME}이(가) 없습니다.` };
  const results: PouchResult[] = [];
  let blocked = false;
  // 한 번에 여는 상한 — 주머니는 수량 제한 없이 한 칸에 쌓이므로(주머니 스택형) 999개를 한 저장에 다 열면
  // 서버의 아이템 생성 상한(`rewardBudget.items` = 40 + 초당 0.5개)을 넘어 저장이 거부된다. 그래서 한 번에
  // `POUCH_BATCH_LIMIT`개까지만 열고 나머지는 가방에 남긴다(남은 수는 결과 요약에 그대로 보인다).
  const limit = Math.min(total, POUCH_BATCH_LIMIT);
  for (let index = 0; index < limit; index++) {
    const opened = openPouch(save, undefined, options.random);
    if (!opened.ok) { blocked = true; break; }
    results.push(opened.result);
  }
  // 하나도 열지 못했으면(가방이 가득 차 장비·스탯북 결과만 나온 경우) 개봉 창에 이유를 보여 준다.
  if (!results.length) return { ok: false, message: '가방이 가득 찼습니다. 분해·판매로 자리를 비운 뒤 다시 열어 주세요.' };
  return { ok: true, summary: summarizePouchResults(results, pouchCount(save), blocked) };
}

/** 요약 한 줄 — 토스트·안내가 같은 문구를 쓴다. 0인 항목은 빼고 남긴다. */
export function pouchBatchText(summary: Pick<PouchBatchSummary, 'gold' | 'equipmentCount' | 'bookTotal'>): string {
  const parts: string[] = [];
  if (summary.gold > 0) parts.push(`금화 ${summary.gold.toLocaleString('ko-KR')}`);
  if (summary.equipmentCount > 0) parts.push(`장비 ${summary.equipmentCount}개`);
  if (summary.bookTotal > 0) parts.push(`영구 스탯북 ${summary.bookTotal}권`);
  return parts.join(' · ') || '획득 없음';
}
