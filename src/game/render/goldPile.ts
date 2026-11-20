// The heap of coins a gold drop leaves on the floor (작업 194, 선명도 작업 195).
//
// The old drop was one 30px coin standing upright, so a kill read like a platform-game pickup. A coin
// lying on this floor is flat instead: two or three coins of the standing art, each squashed and tinted
// to a heavier antique gold, set a few pixels apart so they read as a heap. Both screens draw this
// same table — the field renderer as Pixi sprites and the dungeon as DOM images — so one coin looks
// the same wherever it falls. A heap carries no outer light at all.
//
// The sizes are what keeps a coin readable (작업 195, 사용자 확정): the art is 256px, so a coin squeezed
// under 20px is mostly resampling and its sword emblem and ridged edge smear into a blob. These coins
// are 21~24px wide and only squashed to `.65` of that, and the field asks the texture for mipmaps so
// the downscale stays clean instead of shimmering.

/** One coin of a heap. `dx` is pixels right of the spot the drop fell on, `dy` pixels above the
 *  floor (negative is up, 0 rests on the floor), `size` the coin's width and `squash` its height as
 *  a share of that width — the compression that makes a standing coin lie flat. */
export type GoldCoin = { dx: number; dy: number; size: number; squash: number; tint: number };

/** The coins of one heap, lowest first so each coin overlaps the ones already on the floor. */
export const GOLD_PILE: readonly GoldCoin[] = [
  { dx: 10, dy: -1, size: 21, squash: .65, tint: 0xc8bda6 },
  { dx: -10, dy: 1, size: 24, squash: .65, tint: 0xdcd0b8 },
  { dx: 0, dy: -9, size: 22, squash: .65, tint: 0xf0e4cc },
];

/** Half the heap's footprint and the height of its ground shadow, in pixels. */
export const GOLD_PILE_RX = 22, GOLD_PILE_RY = 5;
