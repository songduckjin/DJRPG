// Limits are expressed in isometric screen axes before the .86/.43 projection.
// They leave room for the HUD, skill bar, and character art on narrow phones.
export const arenaLimits = { horizontal: 120, vertical: 180 } as const;

// 일반 필드 몹이 걸어 들어오는 **바깥 테두리**(작업 230, 사용자 요청 "몹들이 필드 멀리서 뜨도록
// 랜덤하게 뜨게좀 해줘"). 아레나는 플레이어와 전투가 머무는 가운데 상자이고, 이 상자는 화면
// 가장자리까지 잇는 필드다 — 세로 값이 큰 이유는 아이소메트릭 `.43` 압축 때문이다(v 400 ≈ 화면
// 위아래 172px, h 250 ≈ 좌우 215px). 던전(`game/dungeon/battle.ts`)은 `arenaLimits`·`clampArenaPoint`만
// 쓰므로 이 상자를 넓혀도 던전 경계는 그대로다.
export const fieldSpawnLimits = { horizontal: 250, vertical: 400 } as const;

/** 스폰 지점은 플레이어에서 적어도 이만큼(월드 단위) 떨어진다 — 화면 중앙 코앞에 튀어나오지 않게. */
export const fieldSpawnMinDistance = 170;

/** 필드 외곽 밴드 — 플레이어에서 필드 경계까지의 거리를 1로 볼 때 이 구간에서 뜬다.
 *  매번 같은 경계선 한 줄이 아니라 거리도 함께 흔들리게 하는 값이다. */
export const fieldSpawnBand = { near: .78, far: 1 } as const;

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

/** `(px, py)`에서 방향 `(dx, dy)`(단위 벡터)로 필드 경계까지 남은 거리. 경계 밖이면 0이다. */
function fieldReachAt(px: number, py: number, dx: number, dy: number): number {
  const horizontal = px - py, vertical = px + py;
  const alongHorizontal = dx - dy, alongVertical = dx + dy;
  let reach = Infinity;
  if (Math.abs(alongHorizontal) > 1e-9) {
    const target = alongHorizontal > 0 ? fieldSpawnLimits.horizontal : -fieldSpawnLimits.horizontal;
    const distance = (target - horizontal) / alongHorizontal;
    if (distance > 0) reach = Math.min(reach, distance);
  }
  if (Math.abs(alongVertical) > 1e-9) {
    const target = alongVertical > 0 ? fieldSpawnLimits.vertical : -fieldSpawnLimits.vertical;
    const distance = (target - vertical) / alongVertical;
    if (distance > 0) reach = Math.min(reach, distance);
  }
  return Number.isFinite(reach) ? Math.max(0, reach) : 0;
}

/**
 * 일반 필드 몹이 뜨는 자리(작업 230).
 * `angle` 방향 **필드 외곽 밴드**(`distanceRatio` = 플레이어→경계 거리의 비율, 기본 밴드 가운데)를
 * 고르고, 그 지점이 `fieldSpawnMinDistance`보다 가까우면 같은 방향의 외곽까지 밀어 본 뒤
 * **반대편 → 가장 먼 외곽** 순서로 보정한다. 반환점은 항상 필드 경계 안이다.
 */
export function spawnArenaEnemy(
  player: { x: number; y: number },
  angle: number,
  distanceRatio: number = (fieldSpawnBand.near + fieldSpawnBand.far) / 2
): { x: number; y: number } {
  const ratio = Math.max(0, Math.min(1, distanceRatio));
  const spawnAlong = (direction: number) => {
    const dx = Math.cos(direction), dy = Math.sin(direction);
    const reach = fieldReachAt(player.x, player.y, dx, dy);
    // 밴드 비율만큼 나가되 최소 거리 밑으로는 내려가지 않는다(경계 밖으로는 나가지 않는다).
    const distance = Math.min(reach, Math.max(reach * ratio, fieldSpawnMinDistance));
    return { x: player.x + dx * distance, y: player.y + dy * distance, reach };
  };
  const straight = spawnAlong(angle);
  if (straight.reach >= fieldSpawnMinDistance) return { x: straight.x, y: straight.y };
  // 플레이어가 외곽에 치우쳐 그 방향이 너무 가깝다 — 반대편에서 뜬다.
  const opposite = spawnAlong(angle + Math.PI);
  if (opposite.reach >= fieldSpawnMinDistance) return { x: opposite.x, y: opposite.y };
  // 양쪽 다 가까울 만큼 구석이라면 가장 먼 외곽을 고른다.
  let farthest = straight;
  for (let step = 1; step < 24; step++) {
    const candidate = spawnAlong(angle + step * Math.PI / 12);
    if (candidate.reach > farthest.reach) farthest = candidate;
  }
  return { x: farthest.x, y: farthest.y };
}
