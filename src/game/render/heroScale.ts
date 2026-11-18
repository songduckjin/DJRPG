// Hero art is drawn at a different size inside every file. The idle textures are cropped
// tight to the character, the walk/attack sheets keep a wide margin, and a raised sword
// changes the opaque area from frame to frame. Dividing the sprite by the frame height
// therefore made the hero grow and shrink whenever the state changed.
//
// These are measured head-to-feet heights of the drawn body, in art pixels, one value per
// sheet (so a frame with the sword overhead never rescales the body). Keeping the hero's
// visible body at this share of the screen height makes every state and every
// gender × helmet × armor × weapon combination the same size.
export const heroBodyFraction = .0935;

export const heroBodyPx: Record<string, number> = {
  // idle (single cropped texture)
  male: 189, female: 189, maleSword: 189, femaleSword: 186,
  armored: 1457, armoredNoHelm: 1445, femaleArmoredNoHelm: 1369, femaleArmoredHelm: 1381,
  maleBaseHelm: 705, maleSwordHelm: 559, femaleBaseHelm: 726, femaleSwordHelm: 542,
  femaleBaseOldHelm: 694, femaleSwordOldHelm: 531, femaleArmoredOldHelm: 1377,
  // walk sheets (4×2 frames of 177 px, or 4 poses of 290 px when the sword needs the room)
  maleBaseWalk: 156, femaleBaseWalk: 161, maleWalk: 156, femaleWalk: 159,
  maleBaseHelmWalk: 157, femaleBaseHelmWalk: 168, femaleBaseOldHelmWalk: 161,
  maleHelmWalk: 219, femaleHelmWalk: 267, femaleOldHelmWalk: 230,
  armoredWalk: 351, armoredNoHelmWalk: 373,
  femaleArmoredNoHelmWalk: 425, femaleArmoredHelmWalk: 435, femaleArmoredOldHelmWalk: 429,
  // attack frames (290 px sheets, or four 210 px files)
  maleAttack: 163, femaleAttack: 154, armoredAttack: 137, armoredNoHelmAttack: 150,
  maleHelmAttack: 244, femaleHelmAttack: 235, femaleOldHelmAttack: 243,
  femaleArmoredNoHelmAttack: 257, femaleArmoredHelmAttack: 263, femaleArmoredOldHelmAttack: 265
};

export function heroBodyHeight(art: string, frameHeight: number): number {
  return heroBodyPx[art] ?? Math.round(frameHeight * .95);
}

export function heroScale(screenHeight: number, art: string, frameHeight: number): number {
  return screenHeight * heroBodyFraction / heroBodyHeight(art, frameHeight);
}
