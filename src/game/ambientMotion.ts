// Normalized image coordinates: [horizontal center, root line, half width, canopy height].
export const grassPatches = [
  [.126,.229,.045,.038], [.196,.209,.035,.030], [.280,.177,.035,.030],
  [.397,.231,.048,.039], [.506,.236,.033,.027],
  [.734,.195,.041,.035], [.824,.216,.053,.040],
  [.884,.351,.036,.033], [.844,.370,.038,.031], [.144,.412,.051,.044],
  [.180,.493,.042,.033], [.133,.533,.039,.030], [.223,.518,.032,.026],
  [.816,.511,.046,.034], [.853,.521,.029,.024],
  [.796,.594,.040,.031], [.836,.604,.030,.022], [.119,.648,.040,.030],
  [.733,.704,.042,.037], [.795,.721,.035,.027],
  [.355,.769,.040,.033], [.450,.796,.033,.027],
  [.214,.824,.038,.032], [.260,.894,.039,.031],
  [.749,.805,.038,.037], [.798,.775,.042,.033], [.709,.848,.040,.033], [.670,.878,.031,.025]
] as const;
export type AmbientInfluence = { kind: 'grass' | 'fire'; weight: number; phase: number };
type Fire = { x: number; y: number };

function canopy(u: number, v: number, x: number, root: number, radius: number, height: number): number {
  const tip = (root - v) / height, side = Math.abs(u - x) / radius;
  if (tip <= 0 || tip >= 1 || side >= 1) return 0;
  // Zero at the root and patch boundaries, avoiding moving ground or visible seams.
  const feather = Math.min(1, (1 - tip) / .18);
  return (1 - side * side) ** 2 * tip * tip * feather;
}
export function ambientInfluence(u: number, v: number, fires: Fire[]): AmbientInfluence | undefined {
  if (u <= .006 || u >= .994 || v <= .006 || v >= .994) return undefined;
  let best: AmbientInfluence | undefined;
  for (let index = 0; index < fires.length; index++) {
    const fire = fires[index], weight = canopy(u, v, fire.x, fire.y, .025, .035);
    if (weight > 0 && (!best || weight > best.weight)) best = { kind: 'fire', weight, phase: index * 2.7 + u * 11 };
  }
  if (best) return best;
  grassPatches.forEach(([x, root, radius, height], index) => {
    const weight = canopy(u, v, x, root, radius, height);
    if (weight > 0 && (!best || weight > best.weight)) best = { kind: 'grass', weight, phase: index * .83 + u * 16 + v * 8 };
  });
  return best;
}
export function ambientOffset(influence: AmbientInfluence, time: number, enabled = true) {
  if (!enabled) return { x: 0, y: 0 };
  const { kind, weight, phase } = influence;
  return kind === 'grass'
    ? { x: weight * (Math.sin(time * 1.75 + phase) * 10 + Math.sin(time * .65 + phase * .7) * 3), y: weight * Math.sin(time * .75 + phase) * .45 }
    : { x: weight * (Math.sin(time * 7.1 + phase) * 3.5 + Math.sin(time * 12.3 + phase) * 1.6), y: weight * Math.sin(time * 9.3 + phase) * 4.5 };
}
export class AmbientDeformation {
  private points: { index: number; x: number; y: number; influence: AmbientInfluence }[] = [];
  constructor(private positions: Float32Array, private width: number, private height: number, fires: Fire[]) {
    for (let index = 0; index < positions.length; index += 2) {
      const x = positions[index], y = positions[index + 1], influence = ambientInfluence(x / width, y / height, fires);
      if (influence) this.points.push({ index, x, y, influence });
    }
  }
  get animatedVertices(): number { return this.points.length; }
  apply(time: number, enabled = true): void {
    for (const point of this.points) {
      const offset = ambientOffset(point.influence, time, enabled);
      this.positions[point.index] = point.x + offset.x * this.width / 964;
      this.positions[point.index + 1] = point.y + offset.y * this.height / 1632;
    }
  }
}
export function fireFlicker(index: number, time: number): number {
  return .92 + Math.sin(time * 6.3 + index * 4.1) * .11 + Math.sin(time * 10.7 + index * 2.7) * .05;
}
export function fireEmbers(index: number, time: number) {
  return [0, 1, 2].map(particle => {
    const life = (time * .48 + particle / 3 + index * .17) % 1;
    return { x: Math.sin(time * 1.4 + particle * 5 + index) * 3 + (particle - 1) * 3,
      y: -life * 40, radius: (1 - life) * 1.8 + .3, alpha: Math.sin(life * Math.PI) * .65 };
  });
}
