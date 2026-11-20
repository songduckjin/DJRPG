// The heap of coins a gold drop leaves on the floor (작업 194, 195, 196).
//
// The old drop was one 30px coin standing upright, so a kill read like a platform-game pickup. A coin
// lying on this floor is flat instead: two or three coins of the standing art, each squashed to half
// its width and set a few pixels apart so they read as a heap. Both screens draw this same table —
// the field renderer as Pixi sprites and the dungeon as DOM images — so one coin looks the same
// wherever it falls.
//
// The art is the original `/assets/icons/gold-coin.png` (256×256) and nothing replaces it. What makes
// the heap read (작업 196, 사용자 확정 "오른쪽"):
// - the spent tone-down is gone. The coins keep the art's own rich gold, lifted a touch
//   (`GOLD_PILE_BRIGHTNESS`/`GOLD_PILE_CONTRAST`) instead of being dulled to the dark floor;
// - every coin is squashed to `0.50`, so it lies down rather than stands, and keeps its sword emblem;
// - every coin gets its own 1px warm brown boundary (`GOLD_PILE_EDGE`) so three coins never merge
//   into one blob, and a 2px darker gold edge (`GOLD_PILE_RIM`) under it for thickness — the two
//   together are what makes a coin look minted instead of painted. Both are 1px/2px on screen; the
//   art for them is baked by `goldCoinArt`, once per session, at 4× so they stay sharp.

/** One coin of a heap. `dx` is pixels right of the spot the drop fell on, `dy` pixels above the
 *  floor (negative is up, 0 rests on the floor), `size` the coin's width and `squash` its height as
 *  a share of that width — the compression that makes a standing coin lie flat. */
export type GoldCoin = { dx: number; dy: number; size: number; squash: number; tint: number };

/** The coins of one heap, back first: the coin resting on the two below it is drawn before them, so
 *  the two on the floor overlap its lower edge instead of its border cutting across them. */
export const GOLD_PILE: readonly GoldCoin[] = [
  { dx: 0, dy: -9, size: 22, squash: .50, tint: 0xffffff },
  { dx: -10, dy: 1, size: 23, squash: .50, tint: 0xffe9c4 },
  { dx: 10, dy: -1, size: 22, squash: .50, tint: 0xfff3d6 },
];

/** The 1px boundary of a coin: a warm brown, dark enough to cut the coin out of the floor and the
 *  coin behind it, warm enough to belong to the gold (not a grade outline or a neon rim). */
export const GOLD_PILE_EDGE = 0x482e0c;
/** Width of that boundary, in screen pixels. */
export const GOLD_COIN_EDGE = 1;
/** The band of darker gold under a coin that gives it thickness, and its height in screen pixels. */
export const GOLD_PILE_RIM = 0x8a5a12;
export const GOLD_COIN_RIM = 2;
/** The art's own gold, lifted a little so it does not sink into the dark floor. */
export const GOLD_PILE_BRIGHTNESS = 1.10, GOLD_PILE_CONTRAST = 1.08;

/** Half the heap's footprint and the height of its ground shadow, in pixels. */
export const GOLD_PILE_RX = 23, GOLD_PILE_RY = 5;

/** Height of one coin on screen: its width squashed, rounded to whole pixels so the baked art and
 *  the sprite agree on the same box. */
export function goldCoinHeight(coin: GoldCoin): number { return Math.round(coin.size * coin.squash); }
/** Box of one coin's baked chip: the coin plus the thickness under it and the 1px boundary. */
export function goldCoinChipWidth(coin: GoldCoin): number { return coin.size + 2 * GOLD_COIN_EDGE; }
export function goldCoinChipHeight(coin: GoldCoin): number { return goldCoinHeight(coin) + GOLD_COIN_RIM + 2 * GOLD_COIN_EDGE; }
/** How far the chip's bottom edge sits below the coin's own floor line. */
export const GOLD_COIN_CHIP_DROP = GOLD_COIN_EDGE + GOLD_COIN_RIM;
