// What a boss leaves on the floor (작업 194, 195, 196) — PR-2B에서 `game/bossLoot.ts`가 이리로 왔다.
//
// 필드와 던전이 **함께** 쓰는 보스 드랍 규칙이라 전투 쪽(`game/combat/`)에 둔다. 옛 경로
// (`src/game/bossLoot.ts`)는 그대로 남겨 두었으므로 기존 import는 하나도 바뀌지 않는다.
//
// The gold half is shared: a boss's gold hits the floor in ten heaps that burst out around the body,
// and the heaps add up to exactly the gold the kill already pays — the shower is how that gold is
// shown, never a second payment. Both the hunting field and the dungeon use that.
//
// The item half is the dungeon's alone. The dungeon is a ten-floor preview with a boss on floors 5
// and 10, so its boss leaves one random item plus the heaps (`bossItems`); the main field hands out
// no items of its own for a boss and keeps the one chance roll every kill makes (작업 195 — the user's
// "메인층은 금화만 10무 더기" correction). The count came down from two to one in the 아이템 드롭 B안
// (2026-11-23, 덕진 님 확정 — 전 항목 1/10 하향).
//
// Where the heaps land (작업 196 — "도파민 터지게 보스 죽은 주변 흩뿌려줘"): the old two rings of 22
// and 34 pixels bunched ten heaps into one spot. The ten now leave on two much wider rings — five
// close around the body, five further out — spread evenly all the way around it, so a boss kill reads
// as a burst rather than a pile. The rings are laid out on the floor's own isometric screen
// (`HEAP_ISO_X`/`HEAP_ISO_Y`, the projection in `game/combat/bounds`), which is why a circle of world points
// would look squashed and lopsided on screen but these do not.

import { rollDungeonItem, type Item } from '../items';
import { rollStatBookDrop } from '../statBooks';

/** Random items a dungeon boss leaves on the ground (작업 248: 5 → 2개 확정 → 아이템 드롭 B안 2026-11-23: **1개 확정**). The main field drops none of these for a boss. */
export const BOSS_ITEM_DROPS = 1;
/** Heaps a boss's gold hits the floor in. */
export const BOSS_GOLD_PILES = 10;
/** The floor's isometric projection, as `projectArenaPoint` applies it. */
const HEAP_ISO_X = .86, HEAP_ISO_Y = .43;
/** Heaps to a ring, and the five places in it. Two rings of five fill ten heaps evenly. */
const HEAP_PER_RING = 5;
/** Screen half-width and half-height of the two rings, before each place's spread across it: the inner
 *  ring hugs the body, the outer one clears it widely, and both are flatter than they are wide
 *  because they lie on the floor (the floor's perspective, on top of the projection below). */
const HEAP_RINGS: readonly { x: readonly [number, number]; y: readonly [number, number] }[] = [
  { x: [44, 56], y: [26, 34] },
  { x: [80, 96], y: [46, 58] },
];
/** Where each place of a ring lands across that ring's width, and how far it swings off its spoke —
 *  fixed, not random: the burst looks thrown, yet the field, the dungeon and the tests all agree. */
const HEAP_SPREAD = [.10, .88, .36, 1, .58] as const;
const HEAP_SWIRL = [5, -8, 6, -5, 4] as const;
/** Angle of each ring's first place, in degrees: the outer ring fills the gaps of the inner one. */
const HEAP_BASE = [90, 54] as const;

/** One random item of a boss haul: an **영구 스탯북** at the boss rate (`STAT_BOOK_DROP_RATES.dungeonBoss`,
 *  파트 B) or an equipment from the dungeon's 10-floor tier table (작업 248). 스킬북은 어디서도 떨어지지
 *  않는다(파트 B — 스킬북 전면 폐지). */
export function rollBossItem(floor: number): Item {
  return rollStatBookDrop('dungeonBoss') ?? rollDungeonItem(floor, true);
}

/** The `BOSS_ITEM_DROPS` random items a dungeon boss leaves behind. */
export function bossItems(floor: number): Item[] {
  return Array.from({ length: BOSS_ITEM_DROPS }, () => rollBossItem(floor));
}

/** `gold` split into `BOSS_GOLD_PILES` heaps that add up to exactly `gold`. */
export function bossGoldPiles(gold: number): number[] {
  const base = Math.floor(gold / BOSS_GOLD_PILES), extra = gold - base * BOSS_GOLD_PILES;
  return Array.from({ length: BOSS_GOLD_PILES }, (_, index) => base + (index < extra ? 1 : 0));
}

/** Where the `index`th heap of a boss's gold lands, relative to the body. Five heaps ring the body
 *  closely and five ring it wide, all ten evenly around it, on the floor's isometric screen. */
export function bossGoldSpot(x: number, y: number, index: number): { x: number; y: number } {
  const ringIndex = Math.min(HEAP_RINGS.length - 1, Math.floor(index / HEAP_PER_RING)), place = index % HEAP_PER_RING;
  const ring = HEAP_RINGS[ringIndex], reach = HEAP_SPREAD[place];
  const turn = (HEAP_BASE[ringIndex] + place * 360 / HEAP_PER_RING + HEAP_SWIRL[place]) * Math.PI / 180;
  const screenX = Math.cos(turn) * (ring.x[0] + (ring.x[1] - ring.x[0]) * reach);
  const screenY = Math.sin(turn) * (ring.y[0] + (ring.y[1] - ring.y[0]) * reach);
  // Read the floor's projection backwards: (x−y) and (x+y) are what the screen actually shows.
  return { x: x + (screenX / HEAP_ISO_X + screenY / HEAP_ISO_Y) / 2, y: y + (screenY / HEAP_ISO_Y - screenX / HEAP_ISO_X) / 2 };
}
