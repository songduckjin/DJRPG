// The heap of coins a gold drop leaves on the floor (작업 194).
//
// The old drop was one 30px coin standing upright, so a kill read like a platform-game pickup. A coin
// lying on this floor is flat instead: two or three small coins, each squashed to roughly six tenths
// of its height and tinted to a heavier antique gold, set a few pixels apart so they read as a heap.
// Both screens draw this same table — the field renderer as Pixi sprites and the dungeon as DOM
// images — so one coin looks the same wherever it falls. A heap carries no outer light at all.

/** One coin of a heap. `dx` is pixels right of the spot the drop fell on, `dy` pixels above the
 *  floor (negative is up, 0 rests on the floor), `size` the coin's width and `squash` its height as
 *  a share of that width — the compression that makes a standing coin lie flat. */
export type GoldCoin = { dx: number; dy: number; size: number; squash: number; tint: number };

/** The coins of one heap, lowest first so each coin overlaps the ones already on the floor. */
export const GOLD_PILE: readonly GoldCoin[] = [
  { dx: -9, dy: 0, size: 19, squash: .58, tint: 0xdcd0b8 },
  { dx: 8, dy: -1, size: 17, squash: .6, tint: 0xc8bda6 },
  { dx: 0, dy: -8, size: 15, squash: .56, tint: 0xf0e4cc },
];

/** Half the heap's footprint and the height of its ground shadow, in pixels. */
export const GOLD_PILE_RX = 17, GOLD_PILE_RY = 4;
