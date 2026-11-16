export function heroAnimationMode(moving: boolean, attackPose: number, hasAttackSheet: boolean): 'idle' | 'walk' | 'attack' {
  if (moving) return 'walk';
  return attackPose > 0 && hasAttackSheet ? 'attack' : 'idle';
}

export function heroMotion(
  hasAttackSheet: boolean,
  attackPose: number,
  face: number,
  spin?: { age: number; duration: number },
  attack?: { swing?: number },
  slam?: { age: number }
): { pulse: number; scaleX: number; scaleY: number; rotation: number } {
  const pulse = attackPose > 0 ? Math.sin(Math.PI * (1 - attackPose / .32)) : 0;
  if (!hasAttackSheet) return { pulse, scaleX: 1, scaleY: 1, rotation: 0 };
  return {
    pulse,
    scaleX: attackPose > 0 ? 1 + pulse * .15 : 1,
    scaleY: attackPose > 0 ? 1 - pulse * .15 : slam && slam.age > .35 ? .82 : 1,
    rotation: spin ? spin.age / spin.duration * Math.PI * 2 * face : attack ? (attack.swing ?? 1) * .2 * pulse * face : 0
  };
}
