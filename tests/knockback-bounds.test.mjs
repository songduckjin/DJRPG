import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { arenaLimits, fieldSpawnLimits, clampArenaPoint, clampKnockbackPoint } = await import('../src/game/combat/bounds.ts');
const { spawnArenaEnemy } = await import('../src/game/arena.ts');
const { freshSave } = await import('../src/game/store.ts');
const { World } = await import('../src/game/world.ts');

// 작업 264 — 전사 넉백 경계. 평타·스킬·블러드 레이지가 몹을 아레나(`arenaLimits`) 밖으로 밀어내면,
// 아레나에 막힌 전사가 따라가지도 때리지도 못했다(몹은 필드 경계인 250/400까지 밀렸다).
const at = (x, y) => ({ x, y });
const insideArena = point =>
  Math.abs(point.x - point.y) <= arenaLimits.horizontal + 1e-8 && Math.abs(point.x + point.y) <= arenaLimits.vertical + 1e-8;
/** 아레나 상자에서 얼마나 벗어났는가 — 1이면 경계, 1보다 크면 바깥. */
const overflow = point => Math.max(Math.abs(point.x - point.y) / arenaLimits.horizontal, Math.abs(point.x + point.y) / arenaLimits.vertical);
/** 안쪽·경계에 서 있는 자리들 — 전투가 실제로 벌어지는 곳(가운데·모서리·경계 위). */
const insideSpots = [at(0, 0), at(60, 0), at(-60, 0), at(90, -30), at(30, 150), at(150, 30), at(110, -10), clampArenaPoint(400, 0)];
const mob = (x, y, extra = {}) => ({ x, y, hp: 1e9, maxHp: 1e9, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0, ...extra });
/** 플레이어가 아레나 안에서 설 수 있는 가장 가까운 자리에서 적까지의 거리 — 90(전사 사거리)보다 크면 닿지 못한다. */
const closestHeroDistance = (hero, enemy) => {
  const dx = enemy.x - hero.x, dy = enemy.y - hero.y, length = Math.hypot(dx, dy);
  if (!length) return 0;
  const ux = dx / length, uy = dy / length;
  const alongU = Math.abs(ux - uy), alongV = Math.abs(ux + uy);
  const leftU = (arenaLimits.horizontal - Math.abs(hero.x - hero.y)) / Math.max(1e-9, alongU);
  const leftV = (arenaLimits.vertical - Math.abs(hero.x + hero.y)) / Math.max(1e-9, alongV);
  return Math.max(0, length - Math.max(0, Math.min(leftU, leftV)));
};

test('넉백은 아레나 안에 있던 몹을 경계 밖으로 보내지 않는다 (작업 264)', () => {
  for (const from of insideSpots) {
    assert(insideArena(from), `출발점은 아레나 안 (${JSON.stringify(from)})`);
    for (let step = 0; step < 24; step++) {
      const angle = step * Math.PI / 12;
      for (const distance of [16, 56, 200, 5000]) {
        const pushed = { x: from.x + Math.cos(angle) * distance, y: from.y + Math.sin(angle) * distance };
        const bounded = clampKnockbackPoint(from, pushed);
        assert(insideArena(bounded), `${JSON.stringify(from)} → ${distance}만큼 밀려도 아레나 안 (${JSON.stringify(bounded)})`);
      }
    }
  }
});

test('아레나 경계 위에서 맞으면 더 바깥으로 나가지 않고, 벽을 따라 밀린다', () => {
  const edge = at(90, -30);                          // u = 120 벽 위(모서리는 아니다)
  assert(Math.abs(overflow(edge) - 1) < 1e-8);
  const outward = clampKnockbackPoint(edge, { x: edge.x + 200, y: edge.y - 200 });   // 바깥 방향
  assert(Math.abs(outward.x - edge.x) < 1e-8 && Math.abs(outward.y - edge.y) < 1e-8, '바깥으로는 한 발도 못 나간다');
  const along = clampKnockbackPoint(edge, { x: edge.x + 30, y: edge.y + 30 });       // 벽을 따라(안쪽 성분 없음)
  assert(Math.abs(overflow(along) - 1) < 1e-8, '여전히 경계 위');
  assert(Math.hypot(along.x - edge.x, along.y - edge.y) > 10, '벽에 붙은 채로는 밀린다(얼어붙지 않는다)');
});

test('아직 아레나 밖에서 걸어 들어오는 몹은 넉백으로 더 바깥에 가지 않는다 — 들어오는 길은 그대로', () => {
  const outside = at(65, -60);                       // u = 125 — 아레나(120) 바로 바깥
  assert(overflow(outside) > 1 && Math.abs(outside.x - outside.y) <= fieldSpawnLimits.horizontal);
  const further = clampKnockbackPoint(outside, { x: outside.x + 300, y: outside.y - 300 });
  assert.deepEqual(further, outside, '더 바깥으로 밀리지 않는다');
  const inward = clampKnockbackPoint(outside, { x: outside.x - 20, y: outside.y + 20 });
  assert(inward.x < outside.x && overflow(inward) < overflow(outside), '안쪽으로 미는 것은 그대로 받는다');
  // 필드 경계까지 밀려 있던 몹도 아레나로 순간이동하지 않는다(스폰 직후 진입 동작 보존).
  const far = at(120, -130);                         // u = 250 — 필드 좌우 경계
  assert.deepEqual(clampKnockbackPoint(far, far), far);
  assert(overflow(far) > 1, '아레나 밖 그대로');
});

test('몹 스폰은 계속 필드 외곽에서 — 넉백 클램프가 스폰을 아레나로 끌어들이지 않는다 (작업 230 보존)', () => {
  for (const hero of insideSpots) {
    for (let step = 0; step < 24; step++) {
      const spawn = spawnArenaEnemy(hero, step * Math.PI / 12);
      const bounded = clampKnockbackPoint(spawn, spawn);
      assert.deepEqual(bounded, spawn, '뜬 자리 그대로');
      assert(overflow(spawn) > 1, `필드 외곽에서 뜬다 (${overflow(spawn).toFixed(2)})`);
    }
  }
});

test('전사가 스킬로 몹을 계속 때려도 몹이 아레나 밖에 갇히지 않는다', () => {
  const save = freshSave();
  save.learned = ['destroy', 'hell', 'slam'];
  save.quickSlots = ['destroy', 'hell', 'slam'];
  save.skillLevels = { destroy: 5, hell: 5, slam: 5 };
  const world = new World(save);
  world.spawnTimer = 999;
  world.critRoll = () => 1;
  world.player.hp = 1e9;
  const enemy = mob(80, -20);                        // 아레나 안, 경계 쪽
  world.enemies = [enemy];
  const before = enemy.hp;
  let escapes = 0, outOfReach = 0;
  for (let frame = 0; frame < 600; frame++) {        // 10초
    world.update(1 / 60);
    if (!insideArena(enemy)) escapes++;
    if (closestHeroDistance(world.player, enemy) > 90 + 1e-6) outOfReach++;
  }
  assert.equal(escapes, 0, '한 프레임도 아레나 밖으로 밀리지 않는다');
  assert.equal(outOfReach, 0, '전사가 닿을 수 없는 거리에 갇히지 않는다');
  assert(enemy.hp < before, '계속 맞고 있다');
  assert(insideArena(world.player), '플레이어는 아레나 계약 그대로');
});

test('블러드 레이지의 밀어내기도 몹을 아레나 밖으로 보내지 않는다', () => {
  const save = freshSave();
  save.learned = ['warcry'];
  save.quickSlots = ['warcry', null, null];
  const world = new World(save);
  world.spawnTimer = 999;
  world.critRoll = () => 1;
  const enemy = mob(80, -20);
  world.enemies = [enemy];
  const before = { x: enemy.x, y: enemy.y };
  world.action('warcry');
  assert(world.player.berserk > 0, '버프는 종전대로 걸린다');
  assert(Math.hypot(enemy.x - before.x, enemy.y - before.y) > 10, '밀어내기는 그대로 일어난다');
  assert(insideArena(enemy), '밀려난 자리도 아레나 안');
  for (let frame = 0; frame < 300; frame++) {
    world.player.hp = 1e9;
    world.update(1 / 60);
    assert(insideArena(enemy), '이후에도 아레나 밖으로 나가지 않는다');
  }
});

test('필드에서 걸어 들어오던 몹이 넉백을 맞아도 계속 들어와 사거리 안에 든다', () => {
  const world = new World(freshSave());
  world.spawnTimer = 999;
  world.player.hp = 1e9;
  const enemy = mob(125, -80);                       // u = 205 — 아레나 밖 필드
  enemy.knockX = -600;                               // 들어오는 반대(바깥)로 밀리는 중
  world.enemies = [enemy];
  let previousOverflow = overflow(enemy);
  let entered = false;
  for (let frame = 0; frame < 400; frame++) {
    world.update(1 / 60);
    enemy.knockX = Math.min(0, enemy.knockX);
    const now = overflow(enemy);
    if (!insideArena(enemy)) assert(now <= previousOverflow + 1e-6, `${frame}: 넉백으로 더 바깥에 가지 않는다`);
    if (insideArena(enemy)) entered = true;
    previousOverflow = now;
  }
  assert(entered, '결국 아레나 안으로 들어온다');
  assert.equal(closestHeroDistance(world.player, enemy), 0, '전사가 닿는 자리까지 들어온다');
});
