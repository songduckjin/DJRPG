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
  // Task 149: fixed full-body pilot sheets (body head-to-feet measured once per sheet).
  // Task 150: idle is drawn 335~337px tall, but the walk cells are 293~307px and the attack
  // cells 246~341px, so reusing 335 for all three states shrank the hero whenever it walked
  // or swung. Walk uses the mean of its four cells; attack sits at the mean of the crouched
  // swing cells (the overhead-sword frame is the outlier), which keeps the greatsword looking
  // as heavy as it does at rest.
  pilotMale: 335, pilotFemale: 335,
  pilotMaleWalk: 300, pilotFemaleWalk: 300,
  pilotMaleAttack: 270, pilotFemaleAttack: 270,
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

/**
 * 독립형 코스튬 본체의 머리~발 높이(아트 픽셀) — 작업 140.
 *
 * 코스튬 아틀라스는 파츠마다 같은 캔버스(`234×242` 셀)와 같은 발 피벗을 쓰므로
 * 시트별 실측표(`heroBodyPx`) 대신 셀 하나의 본체 높이 하나면 된다.
 * 지금 값은 138 `estimateCanvas`의 캔버스 비율에서 잡은 **잠정값**이며, 실물 아틀라스가
 * 들어오는 [작업 142]에서 알파 경계로 재고 이 상수 하나만 고친다.
 */
export const costumeBodyPx = 190;

/** 코스튬 본체 배율. `heroBodyPx` 표를 쓰지 않고 이 한 값으로 모든 모션·파츠를 같은 크기로 맞춘다. */
export function costumeScale(screenHeight: number): number {
  return screenHeight * heroBodyFraction / costumeBodyPx;
}
