/**
 * 전투 타겟팅 (DOM-free, 순수 함수).
 *
 * `world.ts`의 `World.nearest()`·`aimPoint()`·`damage()` 판정과 파이어 볼트 화염구 자리를 그대로
 * 옮긴 것이다. 판정 규칙이 화면 클래스 밖에 있으므로 서버 리플레이(던전·월드보스)가 같은 함수를 쓴다.
 *
 * 값을 하나도 바꾸지 않은 순수 이동이다 — `tests/dungeon-battle.test.mjs`·`fire-bolt.test.mjs`가
 * 같은 결과를 고정한다.
 */
import type { Enemy } from './types';

type Point = { x: number; y: number };

/** 가장 가까운 적. 월드·던전이 같은 규칙(유클리드 거리, 동률이면 먼저 선 적)을 쓴다. */
export function nearestEnemy(from: Point, enemies: readonly Enemy[]): Enemy | undefined {
  return enemies.reduce<Enemy | undefined>((best, e) => !best || Math.hypot(e.x - from.x, e.y - from.y) < Math.hypot(best.x - from.x, best.y - from.y) ? e : best, undefined);
}

/** 스킬을 쏠 지점 — 사거리 안의 가장 가까운 적, 없으면 정면 사거리 끝. */
export function aimPoint(from: Point & { facing: number }, target: Enemy | undefined, range: number): Point {
  if (target && Math.hypot(target.x - from.x, target.y - from.y) <= range) return { x: target.x, y: target.y };
  return { x: from.x + Math.cos(from.facing) * range * .75, y: from.y + Math.sin(from.facing) * range * .75 };
}

export type ArcTarget = { enemy: Enemy; dx: number; dy: number; dist: number };

/** 부채꼴(`arc` 라디안) 안에서 `radius` 이내인 적. `maxTargets`를 주면 가까운 순으로 그 수만 남는다
 *  (평타 1마리). 판정 순서·동률 처리는 종전 `World.damage()`의 루프와 같다. */
export function targetsInArc(origin: Point, radius: number, angle: number, arc: number, enemies: readonly Enemy[], maxTargets = Infinity): ArcTarget[] {
  const inRange: ArcTarget[] = [];
  for (const enemy of enemies) {
    const dx = enemy.x - origin.x, dy = enemy.y - origin.y, dist = Math.hypot(dx, dy);
    const diff = Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle));
    if (dist > radius || Math.abs(diff) > arc) continue;
    inRange.push({ enemy, dx, dy, dist });
  }
  return inRange.length > maxTargets ? inRange.sort((a, b) => a.dist - b.dist).slice(0, maxTargets) : inRange;
}

/** 시전 방향으로 길이 `range`, 좌우 `halfWidth`인 전방 사각형 안의 적. */
export function targetsInForwardBox(origin: Point, range: number, halfWidth: number, angle: number, enemies: readonly Enemy[]): ArcTarget[] {
  const forwardX = Math.cos(angle), forwardY = Math.sin(angle);
  const targets: ArcTarget[] = [];
  for (const enemy of enemies) {
    const dx = enemy.x - origin.x, dy = enemy.y - origin.y;
    const forward = dx * forwardX + dy * forwardY;
    const side = -dx * forwardY + dy * forwardX;
    if (forward < 0 || forward > range || Math.abs(side) > halfWidth) continue;
    targets.push({ enemy, dx, dy, dist: Math.hypot(dx, dy) });
  }
  return targets;
}

/** 머리 위 화염구 자리(월드 좌표, 작업 216).
 *  아이소 투영의 역변환으로 화면 기준 자리를 만든다. 5발은 위 3개·아래 2개로 엇갈려 배치한다. */
export function fireBoltSpots(x: number, y: number, count: number): Point[] {
  const spots: Point[] = [];
  const n = Math.max(1, Math.floor(count));
  for (let index = 0; index < n; index++) {
    const spread = n === 1 ? 0 : index / (n - 1) - .5;            // -0.5 ~ +0.5
    const screenX = n === 5 ? [-52, 0, 52, -26, 26][index] : (index - (n - 1) / 2) * 50;
    const screenY = n === 5 ? (index < 3 ? -110 : -70) : -68 - (1 - Math.abs(spread) * 2) * 8;
    spots.push({ x: x + (screenX / .86 + screenY / .43) / 2, y: y + (screenY / .43 - screenX / .86) / 2 });
  }
  return spots;
}
