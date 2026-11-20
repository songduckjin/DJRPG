// The heap of coins a gold drop leaves on the floor (작업 194, art 작업 195).
//
// The old drop was one 30px coin standing upright, so a kill read like a platform-game pickup. A coin
// lying on this floor is flat instead: a small heap of antique coins on the floor, drawn as its own
// art at the size it is shown (`GOLD_PILE_W` × `GOLD_PILE_H`). It used to be the 256px
// `gold-coin.png` shrunk to 15~19px per coin and squashed with `scaleY`, which smeared the sword
// emblem and the ridged edge into a mush; the dedicated heap (built by `scripts/build-gold-pile.py`
// at 2× the display size, the largest device pixel ratio the canvas draws at) keeps the coins, their
// bronze rims and the engraved mark crisp. Both screens draw this one image — the field renderer as a
// Pixi sprite and the dungeon as a DOM image — so a heap looks the same wherever it falls. A heap
// carries no outer light at all.

/** The heap art. One image for the whole pile, drawn at `GOLD_PILE_W` × `GOLD_PILE_H`. */
export const GOLD_PILE_ART = '/assets/icons/gold-pile.png';

/** Size the heap is drawn at on screen, in CSS pixels — the same on the field and in the dungeon. */
export const GOLD_PILE_W = 44, GOLD_PILE_H = 20;

/** Half the heap's footprint and the height of its ground shadow, in pixels. */
export const GOLD_PILE_RX = GOLD_PILE_W / 2, GOLD_PILE_RY = 4.5;
