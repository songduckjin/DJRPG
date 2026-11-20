// What a boss leaves on the floor (작업 194, 195).
//
// The gold half is shared: a boss's gold hits the floor in ten heaps that scatter around the body,
// and the heaps add up to exactly the gold the kill already pays — the shower is how that gold is
// shown, never a second payment. Both the hunting field and the dungeon use that.
//
// The item half is the dungeon's alone. The dungeon is a ten-floor preview with a boss on floors 5
// and 10, so its boss leaves five random items plus the heaps (`bossItems`); the main field hands out
// no items of its own for a boss and keeps the one chance roll every kill makes (작업 195 — the user's
// "메인층은 금화만 10무 더기" correction).

import { equipmentDropChance, rollItem, rollSkillBook, skillBookDropChance, type Item } from './items';

/** Random items a dungeon boss leaves on the ground. The main field drops none of these for a boss. */
export const BOSS_ITEM_DROPS = 5;
/** Heaps a boss's gold hits the floor in. */
export const BOSS_GOLD_PILES = 10;
/** Heaps are set this far from the body on the first ring, then a second ring this much wider. */
const HEAP_RING = 5, HEAP_RADIUS = 10, HEAP_STEP = 12, HEAP_FLATTEN = .62;

/** One random item of a boss haul: the field's equipment/skill-book odds decide which, exactly as a
 *  normal kill's item does, so a boss never invents a drop table of its own. */
export function rollBossItem(floor: number): Item {
  const equipment = equipmentDropChance(floor, true), book = skillBookDropChance(floor, true);
  return Math.random() * (equipment + book) < equipment ? rollItem(floor, false, true) : rollSkillBook(floor);
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

/** Where the `index`th heap lands: a small spiral around the body (`HEAP_RING` heaps per ring, the
 *  floor's foreshortening flattening the ring), so ten heaps fall as a shower instead of on one
 *  pixel. The first heap keeps the spot the boss died on. */
export function bossGoldSpot(x: number, y: number, index: number): { x: number; y: number } {
  if (index <= 0) return { x, y };
  const step = index - 1, ring = Math.floor(step / HEAP_RING) + 1, turn = step * 2.4 + ring * .5;
  const radius = HEAP_RADIUS + ring * HEAP_STEP;
  return { x: x + Math.cos(turn) * radius, y: y + Math.sin(turn) * radius * HEAP_FLATTEN };
}
