import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { arenaLimits, projectArenaPoint, clampArenaPoint, arenaEdgePoint, spawnArenaEnemy } = await import('../src/game/arena.ts');
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
  for (let step = 0; step < 24; step++) {
    const edge = arenaEdgePoint(step * Math.PI / 12);
    limit(edge);
    assert(Math.abs(Math.abs(edge.x - edge.y) - arenaLimits.horizontal) < 1e-8 || Math.abs(Math.abs(edge.x + edge.y) - arenaLimits.vertical) < 1e-8);
    limit(spawnArenaEnemy({ x: edge.x, y: edge.y }, step * Math.PI / 12));
  }
});

test('world movement and knockback cannot push actors beyond arena limits', () => {
  const world = new World(freshSave()); world.spawnTimer = 999;
  world.player.x = 150; world.player.y = 30;
  world.enemies = [{ x: -150, y: -30, hp: 1000, maxHp: 1000, boss: false, hit: 0, step: 0, moving: false, knockX: -1000, knockY: 0, slow: 0 }];
  world.update(.1);
  for (const actor of [world.player, ...world.enemies]) {
    assert(Math.abs(actor.x - actor.y) <= arenaLimits.horizontal + 1e-8);
    assert(Math.abs(actor.x + actor.y) <= arenaLimits.vertical + 1e-8);
  }
});
