import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { arenaLimits, fieldSpawnLimits, fieldSpawnMinDistance, fieldSpawnBand, clampArenaPoint, clampFieldPoint, spawnArenaEnemy } = await import('../src/game/arena.ts');
const { freshSave } = await import('../src/game/store.ts');
const { World, enemyMoveSpeed } = await import('../src/game/world.ts');

const insideField = point => Math.abs(point.x - point.y) <= fieldSpawnLimits.horizontal + 1e-8 && Math.abs(point.x + point.y) <= fieldSpawnLimits.vertical + 1e-8;
const insideArena = point => Math.abs(point.x - point.y) <= arenaLimits.horizontal + 1e-8 && Math.abs(point.x + point.y) <= arenaLimits.vertical + 1e-8;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// 아레나 네 모서리(`|h|=120`·`|v|=180`)와 가운데 — 플레이어가 설 수 있는 극단값이다.
const arenaPlayers = [{ x: 0, y: 0 }, { x: 150, y: 30 }, { x: 30, y: 150 }, { x: -30, y: -150 }, { x: -150, y: -30 }];

// 작업 229, 사용자 요청 "몹들이 필드 멀리서 뜨도록 랜덤하게 뜨게좀 해줘".
test('field monsters spawn on the wide field edge, never next to the hero', () => {
  for (const player of arenaPlayers) {
    for (let step = 0; step < 36; step++) {
      for (const ratio of [fieldSpawnBand.near, .88, fieldSpawnBand.far]) {
        const spawn = spawnArenaEnemy(player, step * Math.PI / 18, ratio);
        assert(insideField(spawn), `필드 밖으로 뜨지 않는다 (${JSON.stringify(spawn)})`);
        assert(distance(spawn, player) >= fieldSpawnMinDistance - 1e-8, `플레이어 코앞(${distance(spawn, player).toFixed(1)})에 뜨지 않는다`);
      }
    }
  }
  // 가운데 서 있는 플레이어(가장 흔한 경우)에게는 아레나 밖에서 뜬다.
  for (let step = 0; step < 36; step++) {
    const spawn = spawnArenaEnemy({ x: 0, y: 0 }, step * Math.PI / 18);
    assert(!insideArena(spawn), '아레나 안 코앞이 아니라 필드에서');
  }
});

test('the spawn distance swings with the rolled band ratio instead of one fixed edge line', () => {
  // 세로(아이소메트릭 v) 방향은 밴드가 잘리지 않는다 — 비율이 클수록 더 멀리 선다.
  const player = { x: 0, y: 0 };
  const near = spawnArenaEnemy(player, Math.PI / 2, fieldSpawnBand.near);
  const middle = spawnArenaEnemy(player, Math.PI / 2, (fieldSpawnBand.near + fieldSpawnBand.far) / 2);
  const far = spawnArenaEnemy(player, Math.PI / 2, fieldSpawnBand.far);
  assert(distance(near, player) < distance(middle, player));
  assert(distance(middle, player) < distance(far, player));
  // 각도를 돌려 가며 비율을 굴리면 거리도 방향도 한 줄로 겹치지 않는다.
  const spots = Array.from({ length: 24 }, (_, step) => spawnArenaEnemy(player, step * Math.PI / 12, fieldSpawnBand.near + (step % 5) / 20));
  const distances = new Set(spots.map(spot => Math.round(distance(spot, player))));
  const angles = new Set(spots.map(spot => Math.round(Math.atan2(spot.y - player.y, spot.x - player.x) * 100)));
  assert(distances.size > 5, '거리가 매번 같지 않다');
  assert(angles.size > 10, '방향이 매번 같지 않다');
  assert(Math.max(...distances) - Math.min(...distances) > 30, '먼 곳과 가까운 곳이 함께 나온다');
});

test('a hero pushed into a corner still gets its monster from the far side of the field', () => {
  for (const player of arenaPlayers) {
    for (let step = 0; step < 24; step++) {
      const spawn = spawnArenaEnemy(player, step * Math.PI / 12, fieldSpawnBand.near);
      assert(distance(spawn, player) >= fieldSpawnMinDistance - 1e-8, '반대편·가장 먼 외곽으로 보정');
      assert(insideField(spawn));
    }
  }
});

test('the arena and the wider field keep their own boundaries (dungeon stays on the arena)', () => {
  assert.deepEqual({ ...arenaLimits }, { horizontal: 120, vertical: 180 }, '던전과 공유하는 아레나 계약은 그대로');
  assert.deepEqual(clampArenaPoint(400, -120), clampArenaPoint(400, -120));
  const hero = clampArenaPoint(600, 0);
  assert(Math.abs(hero.x - hero.y) <= arenaLimits.horizontal + 1e-8);
  const field = clampFieldPoint(600, 0);
  assert(Math.abs(field.x - field.y) <= fieldSpawnLimits.horizontal + 1e-8);
  assert(Math.abs(field.x - field.y) > arenaLimits.horizontal, '필드는 아레나보다 넓다');
});

test('a monster spawned at the field edge walks in — no teleport into the arena on the first frame', () => {
  const world = new World(freshSave());
  world.save.tutorial = 1; // 무기가 없어 평타가 나가지 않는다 — 방금 뜬 적이 걸어 들어오는지만 본다
  world.enemies = [];
  world.spawnTimer = 0;
  world.update(1 / 60);
  assert.equal(world.enemies.length, 1, '한 마리 스폰');
  const enemy = world.enemies[0];
  const hero = world.player;
  let previous = distance(enemy, hero);
  assert(previous >= fieldSpawnMinDistance - 1, `멀리서 뜬다 (${previous.toFixed(1)})`);
  assert(!insideArena(enemy), '아레나 밖 필드에서 시작한다');
  // 플레이어(125)와 적(층 속도)이 함께 다가가는 것보다 더 많이 움직이면 순간이동이다.
  const step = 125 + enemyMoveSpeed(world.save.floor, false);
  world.spawnTimer = 999; // 이 테스트는 방금 뜬 한 마리의 이동만 본다
  let closest = previous;
  for (let frame = 0; frame < 240; frame++) {
    world.player.hp = 100000;
    world.update(1 / 60);
    const now = distance(enemy, world.player);
    assert(Math.abs(previous - now) <= step / 60 + 1e-6, `프레임당 이동이 자연스럽다 (${(previous - now).toFixed(2)})`);
    previous = now;
    closest = Math.min(closest, now);
  }
  assert(closest < 90, '결국 사거리 안까지 걸어 들어온다');
  assert(Math.abs(world.player.x - world.player.y) <= arenaLimits.horizontal + 1e-8, '플레이어는 아레나를 벗어나지 않는다');
  assert(Math.abs(world.player.x + world.player.y) <= arenaLimits.vertical + 1e-8);
});
