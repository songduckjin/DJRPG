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

export function arenaEdgePoint(angle: number): { x: number; y: number } {
  const x = Math.cos(angle), y = Math.sin(angle);
  const horizontal = x - y, vertical = x + y;
  const scale = Math.min(arenaLimits.horizontal / Math.max(1e-6, Math.abs(horizontal)), arenaLimits.vertical / Math.max(1e-6, Math.abs(vertical)));
  return { x: x * scale, y: y * scale };
}
