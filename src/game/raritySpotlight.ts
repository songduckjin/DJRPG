/**
 * 유니크·전설 아이템 획득의 **상위 노출** 규칙 (백로그 3번, 2026-11-23).
 *
 * 지금까지는 이급 장비만 등급 색으로 글자만 칠했고, 전설만 전광판(서버 공지)이 있었다. 그래서
 * 보물 주머니·보상 창·가방 어디에서 뛰어난 것이 나왔는지 **한눈에** 알기 어려웠다. 이 파일은
 * "무엇을 상위 등급으로 볼지"·"어떤 순서로 먼저 보여 줄지"·"배너에 무슨 문장을 쓸지"만 정한다 —
 * DOM은 `src/ui/raritySpotlightBar.ts`가 맡고, 화면(주머니·보상 창·가방)은 여기 값만 읽는다.
 *
 * 화면을 그리는 모듈이 아니므로 `node --test`에서 그대로 검사한다(DOM·pixi를 import하지 않는다).
 */
import { itemDisplayName, type Item, type Rarity } from './items';

/** 상위 노출 등급 — **유니크·전설**만(에픽 이하는 지금처럼 등급 색만). */
export const SPOTLIGHT_RARITIES: readonly Rarity[] = ['legendary', 'unique'];
/** 필드·보상 창 위쪽 띠가 떠 있는 시간(ms) — 사용자 확정 3.5초. */
export const SPOTLIGHT_BANNER_MS = 3500;

const RANKS: Record<string, number> = { legendary: 0, unique: 1 };

/** 이 등급이 상위 노출 대상인가. */
export function isSpotlightRarity(rarity: Rarity | undefined): boolean {
  return !!rarity && SPOTLIGHT_RARITIES.includes(rarity);
}

/** 정렬 키 — 전설 0 · 유니크 1 · 그 밖(에픽 이하·스탯북) 2. */
export function spotlightRank(rarity: Rarity | undefined): number {
  return (rarity && RANKS[rarity]) ?? 2;
}

/**
 * 상위 등급을 **위로** 올린 목록 — 같은 등급끼리는 원래 순서를 지킨다(안정 정렬).
 * 보상 창의 목록처럼 "나머지는 손대지 않고 상위만 위로" 하고 싶은 자리에서 쓴다.
 */
export function spotlightFirst<T>(rows: readonly T[], rarityOf: (row: T) => Rarity | undefined): T[] {
  return rows
    .map((row, index) => ({ row, index, rank: spotlightRank(rarityOf(row)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.row);
}

/** 목록 한 줄 앞에 붙는 등급 꼬리표 — `[전설]`·`[유니크]`. 상위 등급이 아니면 빈 문자열. */
export function spotlightTag(rarity: Rarity | undefined): string {
  if (!isSpotlightRarity(rarity)) return '';
  return rarity === 'legendary' ? '[전설]' : '[유니크]';
}

/** 위쪽 띠의 문장 — `✦ 전설 · 영원의 붉은 갑주 획득!`(전설은 앞에 ✦를 붙여 눈에 띄게). */
export function spotlightAnnouncementText(item: Item): string {
  const tag = item.rarity === 'legendary' ? '✦ 전설' : '유니크';
  return `${tag} · ${itemDisplayName(item)} 획득!`;
}
