export function heroAnimationMode(moving: boolean, attackPose: number, hasAttackSheet: boolean): 'idle' | 'walk' | 'attack' {
  if (moving) return 'walk';
  return attackPose > 0 && hasAttackSheet ? 'attack' : 'idle';
}

// The attack sheets already carry the swing, so the body itself never stretches, squashes
// or tips over: only the forward lunge (`pulse`) and the spin skill's full turn remain.
export function heroMotion(
  attackPose: number,
  face: number,
  spin?: { age: number; duration: number }
): { pulse: number; scaleX: number; scaleY: number; rotation: number } {
  return {
    pulse: attackPose > 0 ? Math.sin(Math.PI * (1 - attackPose / .32)) : 0,
    scaleX: 1,
    scaleY: 1,
    rotation: spin ? spin.age / spin.duration * Math.PI * 2 * face : 0
  };
}
