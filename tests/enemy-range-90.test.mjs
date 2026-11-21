import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { World, WARRIOR_ATTACK_RANGE, ENEMY_ATTACK_RANGE, ENEMY_STOP_RANGE, ENEMY_STRIKE_SECONDS, enemyMoveSpeed } = await import('../src/game/world.ts');
const { DungeonBattle, DUNGEON_STEP, runDungeonBattle } = await import('../src/ui/dungeonBattle.ts');
const { freshSave, totalStats } = await import('../src/game/store.ts');

/**
 * 작업 254 — 몬스터 공격 사거리를 전사 평타와 같은 90으로 통일.
 *
 * ① 종전에는 적이 히어로 몸에 닿아야(35) 때렸고, 그때까지 27로 걸어 들어와 히어로 위에 겹쳐 섰다.
 *    전사는 90에서 일방적으로 벨 수 있었고 적은 몸이 닿아야 반격했다.
 * ② 이제 적은 90 안이면 때리고, 서는 자리는 그보다 안쪽인 `ENEMY_STOP_RANGE`(60)다 — 60은 히어로의
 *    평타 넉백(16)에 밀려도 76이라 사거리 안에 남아 때리고 걷기를 반복하지 않는다.
 * ③ 던전도 같은 상수를 쓴다(추가 걸음·0.9초 피격).
 */
const hero = (level = 20) => {
  const save = freshSave(); save.level = level;
  save.equipment = { weapon: { id: 'probe', name: '두손검', slot: 'weapon', rarity: 'legendary', stats: { attack: 120 } } };
  return save;
};

test('몬스터 사거리는 전사 평타와 같은 90이고, 서는 자리는 그 안쪽이다', () => {
  assert.equal(WARRIOR_ATTACK_RANGE, 90, '전사 평타 사거리는 종전 그대로 90');
  assert.equal(ENEMY_ATTACK_RANGE, WARRIOR_ATTACK_RANGE, '몬스터 사거리는 전사 평타와 같다');
  assert(ENEMY_STOP_RANGE < ENEMY_ATTACK_RANGE, '서는 자리는 사거리 안쪽이다');
  // 넉백(12 × 16 = 16유닛)에 밀려도 사거리 밖으로 나가지 않아야 때리고 걷기를 반복하지 않는다.
  assert(ENEMY_STOP_RANGE + 16 <= ENEMY_ATTACK_RANGE, `정지 거리 ${ENEMY_STOP_RANGE} + 넉백 16 > 사거리 ${ENEMY_ATTACK_RANGE}`);
});

test('필드: 예전에는 닿지 않던 80 거리의 적이 이제 때린다(맞사거리 90)', () => {
  const world = new World(hero());
  world.spawnTimer = 999; world.cooldown.attack = 999;
  const enemy = world.enemies[0];
  enemy.hp = enemy.maxHp = 1e9;
  enemy.x = world.player.x + 80; enemy.y = world.player.y;
  world.player.hit = 0;
  const before = world.player.hp;
  world.update(.016);
  assert(world.player.hp < before, '80 거리에서 피해가 들어간다');
  assert.equal(enemy.attack, ENEMY_STRIKE_SECONDS, '때린 적이 내딛는 모션을 취한다');
  assert(world.effects.some(effect => effect.kind === 'enemyStrike'), '맞은 자리에 할퀴기 표시');
});

test('필드: 사거리(90) 밖에서는 그 프레임에 때리지 않는다', () => {
  const world = new World(hero());
  world.spawnTimer = 999; world.cooldown.attack = 999;
  const enemy = world.enemies[0];
  enemy.hp = enemy.maxHp = 1e9;
  enemy.x = world.player.x + ENEMY_ATTACK_RANGE + 5; enemy.y = world.player.y;
  world.player.hit = 0;
  const before = world.player.hp;
  world.update(.001);   // 걸어 들어오는 거리(0.038)보다 짧은 틱 — 아직 사거리 밖이다
  assert.equal(world.player.hp, before, '한 걸음 남은 거리에서는 맞지 않는다');
});

test('필드: 적은 히어로 몸(27)이 아니라 정지 거리(60)에 서고, 겹치지 않는다', () => {
  const save = hero(30);
  const world = new World(save);
  world.spawnTimer = 0;                    // 한 마리만 세운 뒤 스폰을 막는다
  world.update(.016); world.spawnTimer = 999;
  world.action = () => {};                 // 히어로는 벨 수 없게 해 적의 접근만 본다
  const closest = new Map();
  for (let i = 0; i < 1200; i++) {         // 20초
    world.update(1 / 60);
    for (const enemy of world.enemies) {
      const d = Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y);
      closest.set(enemy, Math.min(closest.get(enemy) ?? Infinity, d));
    }
  }
  assert(world.enemies.length > 0, '적이 남아 있어야 한다');
  for (const [enemy, d] of closest) {
    assert(d > ENEMY_STOP_RANGE - 4, `적이 정지 거리를 지나 몸까지 파고들었다: ${d.toFixed(1)}`);
    assert.equal(enemy.moving, false, '정지 거리에 서면 걷기를 멈춘다');
  }
});

test('필드: 때린 뒤에도 적이 사거리 안에 남아 계속 맞는다(때리고 걷기 반복 없음)', () => {
  const world = new World(hero(30));
  world.spawnTimer = 999;
  const enemy = world.enemies[0];
  enemy.hp = enemy.maxHp = 1e9;
  enemy.x = world.player.x + ENEMY_STOP_RANGE; enemy.y = world.player.y;
  let hits = 0, walked = 0;
  for (let i = 0; i < 300; i++) {          // 5초
    world.update(1 / 60);
    hits += world.effects.filter(effect => effect.kind === 'hit').length;
    if (i > 30 && Math.hypot(world.activeMove.x, world.activeMove.y) > .05) walked++;
    world.effects = world.effects.filter(effect => effect.kind !== 'hit');
  }
  assert(hits >= 8, `5초 동안 때린 횟수가 너무 적다: ${hits}`);
  assert(walked <= 2, `대부분의 프레임을 걷느라 보냈다: ${walked}`);
});

test('던전: 90 안의 적이 0.9초 피격을 넣는다', () => {
  const battle = new DungeonBattle(hero());
  const p = battle.world.player;
  const enemy = battle.world.enemies[0];
  enemy.x = p.x + 85; enemy.y = p.y; enemy.hp = enemy.maxHp = 1e9;
  battle.world.enemies = [enemy];
  battle.world.spawnTimer = Infinity;
  p.hit = 0;
  const before = p.hp;
  battle.advance(DUNGEON_STEP);
  assert(p.hp < before, '던전에서도 85 거리의 적이 때린다');
  assert.equal(enemy.attack, ENEMY_STRIKE_SECONDS, '던전에서도 공격 모션이 선다');
});

test('던전: 정지 거리 밖의 적은 추가 걸음으로도 몸까지 파고들지 않는다', () => {
  const battle = new DungeonBattle(hero());
  const p = battle.world.player;
  const enemy = battle.world.enemies[0];
  enemy.x = p.x + 150; enemy.y = p.y; enemy.hp = enemy.maxHp = 1e9;
  battle.world.enemies = [enemy];
  battle.world.spawnTimer = Infinity;
  battle.world.action = () => {};
  let closest = Infinity;
  for (let step = 0; step < 600; step++) {
    battle.advance(DUNGEON_STEP);
    closest = Math.min(closest, Math.hypot(enemy.x - p.x, enemy.y - p.y));
  }
  assert(closest > ENEMY_STOP_RANGE - 4, `던전의 추가 걸음이 정지 거리를 넘었다: ${closest.toFixed(1)}`);
});

test('던전은 새 거리에서도 같은 장비로 같은 층을 깬다(리플레이 계약 유지)', () => {
  const deep = hero(30);
  const battle = runDungeonBattle(deep, 5, 97531);
  assert.equal(battle.outcome, 'clear', 'Lv30·공격 320 장비는 5층 보스를 90초 안에 잡는다');
  assert(battle.elapsed < 90);
  const beginner = hero(10);
  const first = runDungeonBattle(beginner, 1, 97531);
  assert.equal(first.outcome, 'clear', '1층은 초보 장비로도 깬다');
  assert(Math.ceil(first.world.player.hp) > 0);
});
