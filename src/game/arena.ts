// Limits are expressed in isometric screen axes before the .86/.43 projection.
// They leave room for the HUD, skill bar, and character art on narrow phones.
export const arenaLimits = { horizontal: 120, vertical: 180 } as const;

export function projectArenaPoint(x: number, y: number, width: number, height: number): [number, number] {
  return [width / 2 + (x - y) * .86, height / 2 + (x + y) * .43];
}

export function clampArenaPoint(x: number, y: number): { x: number; y: number } {
  const horizontal = Math.max(-arenaLimits.horizontal, Math.min(arenaLimits.horizontal, x - y));
  const vertical = Math.max(-arenaLimits.vertical, Math.min(arenaLimits.vertical, x + y));
  return { x: (horizontal + vertical) / 2, y: (vertical - horizontal) / 2 };
}

export function arenaEdgePoint(angle: number): { x: number; y: number } {
  const x = Math.cos(angle), y = Math.sin(angle);
  const horizontal = x - y, vertical = x + y;
  const scale = Math.min(arenaLimits.horizontal / Math.max(1e-6, Math.abs(horizontal)), arenaLimits.vertical / Math.max(1e-6, Math.abs(vertical)));
  return { x: x * scale, y: y * scale };
}

export function spawnArenaEnemy(player: { x: number; y: number }, angle: number): { x: number; y: number } {
  const point = arenaEdgePoint(angle);
  return Math.hypot(point.x - player.x, point.y - player.y) < 90 ? arenaEdgePoint(angle + Math.PI) : point;
}
