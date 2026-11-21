import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave } = await import('../src/game/store.ts');
const {
  World, ENEMY_ATTACK_RANGE, warriorAttackRange, archerAttackRange, mageAttackRange
} = await import('../src/game/world.ts');
const { DungeonBattle } = await import('../src/ui/dungeonBattle.ts');

/**
 * 작업 254 — 적 공격 사거리를 전사와 같은 90으로 통일(사용자 제보 "적들 공격 사거리를 전사랑 같아야 공격할거같아").
 *
 * 바뀐 것은 `world.ts`의 적 정지 거리(`d > 27` → `d > ENEMY_ATTACK_RANGE`)와 적 공격 판정
 * (`d < 35` → `d <= ENEMY_ATTACK_RANGE`), 그리고 던전의 1.5배 추가 걸음 한계(`d - 27` → `d - ENEMY_ATTACK_RANGE`)다.
 * 여기서 보는 것은 ① 두 값이 전사 평타 사거리(90)와 같은지, ② 필드 적이 90에서 멈춰 그 자리에서 때리는지
 * (예전처럼 몸 위로 겹쳐 들어오지 않는지), ③ 경계 95/85에서 공격이 갈리는지, ④ 던전에서도 1.5배 추가
 * 걸음이 90 안으로 파고들지 않는지다.
 */

test('작업 254 확정 수치 — 적 공격 사거리 = 전사 평타 사거리(90), 궁수·마법사 사거리는 그대로', () => {
  assert.equal(warriorAttackRange, 90);
  assert.equal(ENEMY_ATTACK_RANGE, 90);
  assert.equal(ENEMY_ATTACK_RANGE, warriorAttackRange, '적과 전사의 사거리가 갈라졌다');
  assert.equal(archerAttackRange, 330);
  assert.equal(mageAttackRange, 285);
});

function fieldWorld() {
  const world = new World(freshSave());
  world.spawnTimer = 999;
  world.player.x = 0; world.player.y = 0;
  world.cooldown.attack = 999;              // 내 평타가 먼저 적을 죽이지 않게
  return world;
}

function enemyAt(world, distance) {
  const enemy = {
    x: world.player.x + distance, y: world.player.y,
    hp: 1e9, maxHp: 1e9, boss: false, elite: false, hit: 0, step: 0, moving: true,
    knockX: 0, knockY: 0, slow: 0
  };
  world.enemies = [enemy];
  return enemy;
}

test('필드 적은 전사 사거리(90)에서 멈춰 그 자리에서 공격한다 — 몸 위로 겹쳐 들어오지 않는다', () => {
  const world = fieldWorld();
  const enemy = enemyAt(world, 200);
  const before = world.player.hp;
  let closest = Infinity;
  for (let frame = 0; frame < 400; frame++) {
    // 플레이어는 제자리에 둔다(플레이어도 추격하므로, 적의 정지 거리만 재려고 고정한다).
    world.player.x = 0; world.player.y = 0;
    world.update(.016);
    closest = Math.min(closest, Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y));
  }
  const distance = Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y);
  assert(distance >= ENEMY_ATTACK_RANGE - 1, `적이 90보다 가까이 들어왔다: ${distance}`);
  assert(distance <= ENEMY_ATTACK_RANGE + 2, `적이 90에서 멈추지 않았다: ${distance}`);
  assert(closest >= ENEMY_ATTACK_RANGE - 1, `프레임 중 90 안으로 파고들었다: ${closest}`);
  assert.equal(enemy.moving, false, '정지 거리에서 계속 걷는다');
  assert(world.player.hp < before, '90 자리에서 공격하지 않는다');
  // 예전 접촉 거리(27~35)까지 붙지 않는다.
  assert(closest > 40, `적이 예전처럼 몸에 붙었다: ${closest}`);
});

test('공격 판정 경계 — 95에서는 맞지 않고 85에서는 맞는다', () => {
  const world = fieldWorld();
  const enemy = enemyAt(world, 95);
  world.player.hit = 0;
  const before = world.player.hp;
  world.update(.016);
  assert.equal(world.player.hp, before, '90 밖인데 맞았다');
  assert.equal(enemy.attack, 0, '90 밖인데 공격 모션이 섰다');

  enemy.x = 85; enemy.y = 0; world.player.x = 0; world.player.y = 0;
  world.player.hit = 0;
  const hp = world.player.hp;
  world.update(.016);
  assert(world.player.hp < hp, '90 안인데 맞지 않았다');
  assert(enemy.attack > 0, '90 안인데 공격 모션이 서지 않았다');
});

test('던전은 종전 간격(27)을 그대로 쓴다 — 히어로 고정 전투라 90으로 올리면 아무도 닿지 못한다', () => {
  // 작업 248(PR #253)이 히어로 (50,50) 고정을 없애기 전까지, 던전에서 적을 90에 세우면 히어로가 걸어간 만큼
  // 되돌아와 서로 92에서 마주 보고 90초가 끝난다(`world.ts` `enemyRange` 주석). 그래서 던전만 27을 유지한다.
  const save = freshSave();
  save.equipment.weapon = { id: 'w', name: '두손검', slot: 'weapon', rarity: 'rare', stats: { attack: 40 } };
  const battle = new DungeonBattle(save, 1);
  let closest = Infinity;
  for (let step = 0; step < 120; step++) {
    battle.advance(.05);
    for (const enemy of battle.world.enemies) {
      closest = Math.min(closest, Math.hypot(enemy.x - battle.world.player.x, enemy.y - battle.world.player.y));
    }
  }
  // 무기를 든 히어로는 90에서 먼저 베므로 적이 27까지 붙기 전에 죽는다 — 접전이 멈추지 않는지만 본다.
  assert(battle.world.slain > 0, '던전 전투가 진행되지 않는다(접전이 멈췄다)');
  assert(closest <= 45, `던전 적이 종전 간격 언저리까지 붙지 않는다: ${closest}`);
});
