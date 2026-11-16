// Both original skeleton/boss sheets face screen-left, including all walk frames.
export function enemyFacing(enemy: { x: number; y: number }, target: { x: number; y: number }, previous = 1): number {
  const screenDx = (target.x - enemy.x) - (target.y - enemy.y);
  if (Math.abs(screenDx) <= 4) return previous < 0 ? -1 : 1;
  return screenDx > 0 ? -1 : 1;
}
