export type Weapon = 'one' | 'great';
export type Motion = 'walk' | 'slash' | 'spin' | 'smash' | 'cast';
export const walkFrames = 8;
export const frameMs = 110;

export function pose(frame: number, weapon: Weapon, motion: Motion = 'walk') {
  const phase = (frame % walkFrames + walkFrames) % walkFrames;
  const step = Math.sin(phase * Math.PI / 4);
  const lift = Math.max(0, Math.cos(phase * Math.PI / 2));
  const attack = motion === 'smash' ? -26 : motion === 'slash' ? -12 : motion === 'cast' ? -8 : 0;
  const hand = { x: (weapon === 'great' ? 27 : 33) + step * 5, y: -96 + lift * 3 + attack };
  return {
    phase, hand,
    torso: { x: 0, y: -89 - lift * 2 },
    arm: { x: 22 + step * 3, y: -103 - lift * 2, rotation: (weapon === 'great' ? -.24 : -.08) + step * .12 + attack * .012 },
    legs: { x: step * 4, y: 0, rotation: step * .08 },
    weaponRotation: (weapon === 'great' ? -.25 : .13) + step * .08 + attack * .018,
    effect: motion === 'walk' ? 0 : motion === 'spin' ? 1 : .55
  };
}

export function estimateCanvas(weapon: Weapon, motions: Motion[] = ['walk','slash','spin','smash','cast']) {
  let left = -62, right = 62, top = -180, bottom = 8;
  for (const motion of motions) for (let frame = 0; frame < walkFrames; frame++) {
    const p = pose(frame, weapon, motion);
    const reach = weapon === 'great' ? 112 : 83;
    left = Math.min(left, p.hand.x - reach);
    right = Math.max(right, p.hand.x + reach);
    top = Math.min(top, p.hand.y - reach);
  }
  return { left: Math.floor(left), right: Math.ceil(right), top: Math.floor(top), bottom, width: Math.ceil(right-left), height: Math.ceil(bottom-top) };
}

export function productionFrames(armorCount: number, sharedArmor: boolean, genderVariants: number, skillFrames = 17) {
  const uniqueArmor = armorCount * (sharedArmor ? 1 : 2) * genderVariants;
  return { body: (1 + 8 + 4 + skillFrames) * 2 * genderVariants, armor: uniqueArmor * (1 + 8 + 4 + skillFrames) };
}
