// Normalized image coordinates: [horizontal center, root line, half width, canopy height].
export const grassPatches = [
  [.086,.165,.074,.040], [.187,.130,.040,.027], [.423,.168,.050,.036], [.469,.186,.035,.027],
  [.812,.137,.060,.035], [.956,.181,.060,.040], [.961,.318,.048,.040], [.906,.351,.046,.032],
  [.084,.383,.045,.041], [.132,.488,.038,.030], [.087,.527,.044,.032], [.911,.526,.048,.033],
  [.832,.616,.046,.037], [.052,.678,.045,.028], [.787,.732,.041,.036], [.846,.746,.038,.025],
  [.352,.826,.052,.032], [.112,.841,.046,.029], [.179,.902,.046,.035], [.936,.838,.045,.023],
  [.851,.867,.042,.029], [.811,.916,.045,.035], [.747,.980,.050,.044]
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
  constructor(private positions: Float32Array, width: number, height: number, fires: Fire[]) {
    for (let index = 0; index < positions.length; index += 2) {
      const x = positions[index], y = positions[index + 1], influence = ambientInfluence(x / width, y / height, fires);
      if (influence) this.points.push({ index, x, y, influence });
    }
  }
  get animatedVertices(): number { return this.points.length; }
  apply(time: number, enabled = true): void {
    for (const point of this.points) {
      const offset = ambientOffset(point.influence, time, enabled);
      this.positions[point.index] = point.x + offset.x;
      this.positions[point.index + 1] = point.y + offset.y;
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
