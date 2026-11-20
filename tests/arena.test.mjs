import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { arenaLimits, fieldSpawnLimits, fieldSpawnMinDistance, projectArenaPoint, clampArenaPoint, arenaEdgePoint, spawnArenaEnemy } = await import('../src/game/arena.ts');
const { freshSave } = await import('../src/game/store.ts');
const { World } = await import('../src/game/world.ts');

test('fixed arena projection moves the hero while the background origin stays centered', () => {
  for (const [width, height] of [[320, 568], [390, 844], [540, 914]]) {
    assert.deepEqual(projectArenaPoint(0, 0, width, height), [width / 2, height / 2]);
    const moved = projectArenaPoint(40, 0, width, height);
    assert(moved[0] > width / 2 && moved[1] > height / 2);
    const enemy = projectArenaPoint(100, -20, width, height);
    assert.deepEqual(projectArenaPoint(100, -20, width, height), enemy);
    assert.notDeepEqual([enemy[0] - moved[0], enemy[1] - moved[1]], [enemy[0] - width / 2, enemy[1] - height / 2]);
  }
});

test('player and spawned monsters remain inside the projected mobile arena', () => {
  const limit = point => {
    assert(Math.abs(point.x - point.y) <= arenaLimits.horizontal + 1e-8);
    assert(Math.abs(point.x + point.y) <= arenaLimits.vertical + 1e-8);
    const [x, y] = projectArenaPoint(point.x, point.y, 320, 568);
    assert(x >= 56 && x <= 264 && y >= 206 && y <= 362);
  };
  for (const [x, y] of [[500, 500], [-500, 500], [500, -500], [-500, -500]]) limit(clampArenaPoint(x, y));
  const field = point => {
    assert(Math.abs(point.x - point.y) <= fieldSpawnLimits.horizontal + 1e-8, '필드 좌우 경계');
    assert(Math.abs(point.x + point.y) <= fieldSpawnLimits.vertical + 1e-8, '필드 위아래 경계');
  };
  for (let step = 0; step < 24; step++) {
    const edge = arenaEdgePoint(step * Math.PI / 12);
    limit(edge);
    assert(Math.abs(Math.abs(edge.x - edge.y) - arenaLimits.horizontal) < 1e-8 || Math.abs(Math.abs(edge.x + edge.y) - arenaLimits.vertical) < 1e-8);
    // 작업 230: 스폰은 아레나가 아니라 그보다 넓은 **필드 외곽**에서, 플레이어에서 멀찍이 떨어진다.
    const spawn = spawnArenaEnemy({ x: edge.x, y: edge.y }, step * Math.PI / 12);
    field(spawn);
    assert(Math.hypot(spawn.x - edge.x, spawn.y - edge.y) >= fieldSpawnMinDistance - 1e-8, '플레이어 코앞에 뜨지 않는다');
  }
});

test('world movement keeps the hero in the arena and knockback inside the wider field (작업 230)', () => {
  const world = new World(freshSave()); world.spawnTimer = 999;
  world.player.x = 150; world.player.y = 30;
  world.enemies = [{ x: -150, y: -30, hp: 1000, maxHp: 1000, boss: false, hit: 0, step: 0, moving: false, knockX: -1000, knockY: 0, slow: 0 }];
  world.update(.1);
  // 플레이어는 예전처럼 아레나 안에 머문다(던전과 공유하는 계약).
  assert(Math.abs(world.player.x - world.player.y) <= arenaLimits.horizontal + 1e-8);
  assert(Math.abs(world.player.x + world.player.y) <= arenaLimits.vertical + 1e-8);
  // 적은 필드 외곽까지 밀릴 수 있지만 필드 밖으로는 나가지 않는다.
  for (const actor of world.enemies) {
    assert(Math.abs(actor.x - actor.y) <= fieldSpawnLimits.horizontal + 1e-8);
    assert(Math.abs(actor.x + actor.y) <= fieldSpawnLimits.vertical + 1e-8);
  }
});
