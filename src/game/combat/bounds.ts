/**
 * 아레나·필드 경계 (DOM-free 순수 기하).
 *
 * 전투가 서는 자리를 자르는 **좌표 규칙만** 여기 있다. 어떤 몹이 어디서 뜨는지(필드 스폰 밴드)는
 * 필드의 일이라 `game/arena.ts`에 남는다 — 던전·월드보스처럼 필드를 쓰지 않는 전투가 서버에서 돌 때
 * 스폰 표까지 끌고 들어오지 않게 하려고 경계 계산만 따로 내렸다(PR-2B).
 *
 * 좌표는 아이소메트릭 화면축(`.86`/`.43` 투영) **이전**의 월드 값이다.
 */

// Limits are expressed in isometric screen axes before the .86/.43 projection.
// They leave room for the HUD, skill bar, and character art on narrow phones.
export const arenaLimits = { horizontal: 120, vertical: 180 } as const;

// 일반 필드 몹이 걸어 들어오는 **바깥 테두리**(작업 230, 사용자 요청 "몹들이 필드 멀리서 뜨도록
// 랜덤하게 뜨게좀 해줘"). 아레나는 플레이어와 전투가 머무는 가운데 상자이고, 이 상자는 화면
// 가장자리까지 잇는 필드다 — 세로 값이 큰 이유는 아이소메트릭 `.43` 압축 때문이다(v 400 ≈ 화면
// 위아래 172px, h 250 ≈ 좌우 215px). 던전(`game/dungeon/battle.ts`)은 `arenaLimits`·`clampArenaPoint`만
// 쓰므로 이 상자를 넓혀도 던전 경계는 그대로다.
export const fieldSpawnLimits = { horizontal: 250, vertical: 400 } as const;

export function projectArenaPoint(x: number, y: number, width: number, height: number): [number, number] {
  return [width / 2 + (x - y) * .86, height / 2 + (x + y) * .43];
}

function clampTo(x: number, y: number, limits: { horizontal: number; vertical: number }): { x: number; y: number } {
  const horizontal = Math.max(-limits.horizontal, Math.min(limits.horizontal, x - y));
  const vertical = Math.max(-limits.vertical, Math.min(limits.vertical, x + y));
  return { x: (horizontal + vertical) / 2, y: (vertical - horizontal) / 2 };
}

export function clampArenaPoint(x: number, y: number): { x: number; y: number } {
  return clampTo(x, y, arenaLimits);
}

/** 플레이어가 머무는 아레나가 아니라 **필드 전체** 경계로 자른다 — 멀리서 스폰된 적이 첫 프레임에
 *  아레나 안으로 순간이동하지 않고 외곽에서 걸어 들어오게 하는 데 쓴다(작업 230). */
export function clampFieldPoint(x: number, y: number): { x: number; y: number } {
  return clampTo(x, y, fieldSpawnLimits);
}

/** 아레나 상자에서 얼마나 벗어났는가 — 1 이하면 안쪽, 1보다 크면 그만큼 바깥이다(좌우·앞뒤 중 먼 쪽). */
function arenaOverflow(x: number, y: number): number {
  return Math.max(Math.abs(x - y) / arenaLimits.horizontal, Math.abs(x + y) / arenaLimits.vertical);
}

/**
 * 넉백이 몹을 데려갈 수 있는 자리 — **전투 경계(`arenaLimits`) 밖으로 밀려나지 않는다**(작업 264).
 *
 * `from`은 이번 프레임에 걸어온 자리(밀리기 전), `to`는 평타·스킬·블러드 레이지가 민 자리다.
 *
 * ① 아레나 안에 있던 몹: 민 자리가 경계를 넘으면 **경계 위에서 멈춘다**. 예전에는 필드 경계
 *    (`fieldSpawnLimits`, 120~250 구간)까지만 막아서, 맞은 몹이 아레나 밖으로 밀려나면 아레나에
 *    막힌 전사가 따라가지도 때리지도 못했다.
 * ② 아직 아레나 밖(필드 외곽 스폰 밴드)에서 걸어 들어오는 중인 몹: **더 바깥으로는 나가지 않는다**.
 *    제자리를 지키거나, 민 방향이 안쪽·옆이라면 그만큼은 움직인다 — 멀리서 뜬 몹이 걸어 들어오는
 *    동작(작업 230)은 그대로다.
 */
export function clampKnockbackPoint(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
  if (arenaOverflow(from.x, from.y) <= 1 + 1e-9) return clampArenaPoint(to.x, to.y);
  return arenaOverflow(to.x, to.y) > arenaOverflow(from.x, from.y) ? { x: from.x, y: from.y } : { x: to.x, y: to.y };
}

export function arenaEdgePoint(angle: number): { x: number; y: number } {
  const x = Math.cos(angle), y = Math.sin(angle);
  const horizontal = x - y, vertical = x + y;
  const scale = Math.min(arenaLimits.horizontal / Math.max(1e-6, Math.abs(horizontal)), arenaLimits.vertical / Math.max(1e-6, Math.abs(vertical)));
  return { x: x * scale, y: y * scale };
}
