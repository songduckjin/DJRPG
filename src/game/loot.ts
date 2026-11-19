// Ground loot rules shared by the hunting field and its renderer.
//
// A kill leaves one coin (the gold it paid, shown as a coin only — the amount is never drawn) and,
// by the field's own drop odds, an equipment or skill book item on the ground. A drop rests where
// it fell for a beat, then is pulled into the character wherever he stands at that moment. Nothing
// here touches the save: `world.ts` owns when a drop is stored, and the renderer only reads it.

/** How long a coin or item stays on the ground after it fell, before the pull starts. */
export const LOOT_REST_SECONDS = 1.5;
/** Length of the pull itself, from the resting spot to the character. */
export const LOOT_ABSORB_SECONDS = .45;
/** Items of one kill rest at least this far apart; coins pile up instead. */
export const LOOT_GAP = 36;
/** Ground loot rests inside a fan opening from the hero: ±100° of straight up, so nothing ends up
 *  behind the feet under the skill bar. */
export const LOOT_FAN = Math.PI * 100 / 180;
/** Coins of one heap land this close together: only a coin that would sit on the very same point as
 *  another steps a few pixels aside, enough that two coins never read as one. */
export const LOOT_GOLD_PILE_MIN = 10;
export const LOOT_GOLD_PILE_STEP = 6;
/** Paint order of ground loot: an item may land on a coin and always covers it. */
export const LOOT_DEPTH = { gold: 0, item: 1 } as const;

export type LootSpot = { x: number; y: number };
/** A drop waiting for its resting spot: `gold` marks a coin, which is allowed to pile on anything. */
export type LootDrop = LootSpot & { gold?: boolean };

/** 0 while the drop still rests on the ground, 1 once it has reached the character. `started` is the
 *  age the pull began at, so a drop held back by a full bag does not look swallowed. */
export function lootAbsorbProgress(age: number, started = LOOT_REST_SECONDS): number {
  return Math.min(1, Math.max(0, (age - started) / LOOT_ABSORB_SECONDS));
}

/** Point of a drop `progress` of the way into the character: it starts at the ground, accelerates
 *  (progress squared), swings `swing` pixels sideways in the middle of the way and lands exactly on
 *  `to`, where the drop is removed. */
export function lootAbsorbPoint(from: LootSpot, to: LootSpot, progress: number, swing = 0): LootSpot {
  const k = progress * progress;
  const side = progress >= 1 ? 0 : Math.sin(Math.PI * progress) * swing;
  return { x: from.x + (to.x - from.x) * k + side, y: from.y + (to.y - from.y) * k };
}

/** Resting spots for the drops of a kill (or of several). A drop keeps the point it fell on whenever
 *  that point is clear of the character art; inside the keep-out ellipse (`rx`/`ry` half-axes) it is
 *  pulled out along the character→drop direction — never shoved to the sides — just past the
 *  silhouette, and `reach` caps how far from the character it may rest. Only items then keep `gap`
 *  from other items; a coin piles up with coins and items alike, stepping aside only to clear the
 *  silhouette or to get off a coin of its own heap. A drop never ends up on the character art. */
export function lootRestSpots(heroX: number, heroY: number, drops: LootDrop[], taken: LootDrop[], rx: number, ry: number, gap: number, reach = Infinity): LootSpot[] {
  const polar = (r: number, a: number): LootSpot => ({ x: heroX + Math.sin(a) * r, y: heroY - Math.cos(a) * r });
  const rim = (a: number) => 1 / Math.hypot(Math.sin(a) / rx, Math.cos(a) / ry);
  const fan = (a: number) => Math.max(-LOOT_FAN, Math.min(LOOT_FAN, a));
  const angleOf = (p: LootSpot) => Math.atan2(p.x - heroX, heroY - p.y);
  const place = (r: number, a: number): LootSpot => polar(Math.max(Math.min(r, reach), rim(a) + 2), a);
  // Coins are in `taken` too, but only another item can push an item away.
  const free = (p: LootSpot) => taken.every(t => t.gold || Math.hypot(t.x - p.x, t.y - p.y) >= gap - 1e-6);
  const spots: LootSpot[] = [];
  for (const drop of drops) {
    const a = fan(angleOf(drop)), r = Math.max(Math.hypot(drop.x - heroX, drop.y - heroY), rim(a) + 2), base = place(r, a);
    let spot = base;
    if (drop.gold) {
      const pile = taken.filter(t => t.gold && Math.hypot(t.x - base.x, t.y - base.y) < LOOT_GOLD_PILE_MIN).length;
      if (pile) {
        const turn = pile * 2.4, step = LOOT_GOLD_PILE_STEP * (1 + Math.floor(pile / 6));
        const nudge = { x: base.x + Math.sin(turn) * step, y: base.y - Math.cos(turn) * step }, nudgeAngle = fan(angleOf(nudge));
        spot = polar(Math.max(Math.hypot(nudge.x - heroX, nudge.y - heroY), rim(nudgeAngle) + 2), nudgeAngle);
      }
    } else if (!free(base)) for (let ring = 1; ring <= 12; ring++) {
      let nearest = Infinity;
      for (const turn of [0, .4, -.4, .8, -.8, 1.2, -1.2, 1.6, -1.6]) {
        const candidate = place(r + ring * gap, fan(a + turn));
        if (!free(candidate)) continue;
        const distance = Math.hypot(candidate.x - base.x, candidate.y - base.y);
        if (distance < nearest) { nearest = distance; spot = candidate; }
      }
      if (nearest < Infinity) break;
    }
    taken.push({ ...spot, gold: drop.gold });
    spots.push(spot);
  }
  return spots;
}
