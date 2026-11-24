import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const {
  DefenseBattle, DEFENSE_STEP, DEFENSE_MAX_STEPS, DEFENSE_RUN_SECONDS, DEFENSE_MAX_STAGE,
  defenseBattleSummary, runDefenseBattle, defenseRewardFloor, defenseEnemyFloor, defenseBossStage,
  defenseWaveSizes, defenseWaveKills, defenseStageEnemyCount, defenseSpawnSeconds, defenseDescentSeconds,
  defenseSpawnFloorSeconds, defenseStageHpSum, defenseKillReward, defenseMobHp, defenseBossHp,
  DEFENSE_WAVES_PER_STAGE, DEFENSE_BOSS_EVERY, DEFENSE_HERO_V, DEFENSE_LINE_V, defenseLane
} = await import('../src/game/dungeon/defenseBattle.ts');
const { freshSave } = await import('../src/game/store.ts');

/** 실제 플레이어처럼 무기를 찬 세이브(무기 미장착이면 공격이 막힌다). */
const armed = (level = 17, attack = 120, defense = 400) => {
  const save = freshSave('male', 'warrior');
  save.level = level;
  save.learned = ['slash2'];
  save.quickSlots = ['slash2', null, null];
  save.skillLevels = { slash2: 5 };
  save.equipment = {
    weapon: { id: `def-w-${attack}`, name: '시험 검', slot: 'weapon', rarity: 'rare', stats: { attack }, plus: 0 },
    armor: { id: `def-a-${defense}`, name: '시험 갑옷', slot: 'armor', rarity: 'rare', stats: { defense, health: 600 }, plus: 0 }
  };
  return save;
};

test('무한 방어전은 3웨이브 = 1스테이지, 5스테이지마다 보스 1 + 미니언 4다', () => {
  assert.equal(DEFENSE_WAVES_PER_STAGE, 3);
  assert.equal(DEFENSE_BOSS_EVERY, 5);
  assert.equal(defenseBossStage(5), true);
  assert.equal(defenseBossStage(10), true);
  assert.equal(defenseBossStage(4), false);
  assert.equal(defenseBossStage(11), false);
  // 보스 스테이지 1웨이브만 [보스+미니언 4, 일반, 일반]이고 나머지는 3웨이브 모두 일반이다.
  assert.deepEqual(defenseWaveSizes(5), [5, defenseWaveKills(5), defenseWaveKills(5)]);
  assert.deepEqual(defenseWaveSizes(4), [3, 3, 3]);
  assert.equal(defenseWaveKills(1), 3);
  assert.equal(defenseWaveKills(40), 9);
  assert.equal(defenseStageEnemyCount(5), 5 + 2 * defenseWaveKills(5));
});

test('스테이지·웨이브는 무한히 오르고, 스폰 간격·하강 시간은 하한에서 멈춘다', () => {
  assert.equal(DEFENSE_MAX_STAGE, 999);
  assert.ok(defenseSpawnSeconds(1) > defenseSpawnSeconds(20));
  assert.equal(defenseSpawnSeconds(41), 1.1);
  assert.equal(defenseSpawnSeconds(300), 1.1);
  assert.ok(defenseDescentSeconds(1) > defenseDescentSeconds(40));
  assert.equal(defenseDescentSeconds(200), 3.2);
  // 스테이지가 깊어질수록 그 스테이지까지의 스폰 하한 합이 커진다(서버 최소 시간의 근거).
  assert.ok(defenseSpawnFloorSeconds(10) > defenseSpawnFloorSeconds(5));
  assert.ok(defenseStageHpSum(10) > defenseStageHpSum(5));
  assert.ok(defenseMobHp(30) > defenseMobHp(10));
  assert.ok(defenseBossHp(10) > defenseMobHp(10));
});

test('보상 기준 층은 2스테이지마다 1층씩 오르고 20층에서 포화한다(서버 MAX_FLOOR 계약 유지)', () => {
  assert.equal(defenseRewardFloor(1), 1);
  assert.equal(defenseRewardFloor(2), 1);
  assert.equal(defenseRewardFloor(3), 2);
  assert.equal(defenseRewardFloor(39), 20);
  assert.equal(defenseRewardFloor(60), 20);
  assert.equal(defenseRewardFloor(999), 20, '보상은 20층 값에서 더 오르지 않는다');
  // 적의 세기는 40스테이지(필드 80층)에서 포화한다 — 무한히 세지지 않는다.
  assert.equal(defenseEnemyFloor(1), 2);
  assert.equal(defenseEnemyFloor(40), 80);
  assert.equal(defenseEnemyFloor(80), 80);
});

test('성벽이 없다 — 판은 캐릭터 체력 0에서만 끝나고, 판 길이는 30분 상한 안이다', () => {
  const save = armed(1, 6, 5);
  const battle = new DefenseBattle(save, 7);
  assert.equal(battle.world.player.hp > 0, true);
  // 이 모드에는 성벽·방어선 HP 필드가 없다.
  assert.equal('wallHp' in battle, false);
  assert.equal('wallHp' in battle.world, false);
  while (!battle.finished && battle.steps < DEFENSE_MAX_STEPS) battle.advance(DEFENSE_STEP);
  assert.ok(battle.finished);
  assert.ok(['dead', 'timeout'].includes(battle.outcome));
  assert.ok(battle.elapsed <= DEFENSE_RUN_SECONDS + 1, '30분 안전 상한을 넘기지 않는다');
  assert.equal(DEFENSE_RUN_SECONDS, 1800);
});

test('캐릭터는 하단에서 출발해 위에서 내려오는 적 쪽으로 올라간다', () => {
  const battle = new DefenseBattle(armed(), 2026);
  const start = defenseLane(battle.world.player.x, battle.world.player.y);
  assert.equal(Math.round(start.v), DEFENSE_HERO_V);
  const enemyStart = battle.world.enemies[0] && defenseLane(battle.world.enemies[0].x, battle.world.enemies[0].y);
  assert.ok(enemyStart && enemyStart.v < start.v, '적은 캐릭터보다 위에서 내려온다');
  for (let step = 0; step < 60 * 12; step++) battle.advance(DEFENSE_STEP);
  const moved = defenseLane(battle.world.player.x, battle.world.player.y);
  assert.ok(moved.v < start.v, '캐릭터가 위로 이동했다');
  // 방어선(성벽 자리)은 적이 더 내려오지 않는 선일 뿐, HP가 있는 물체가 아니다.
  assert.equal(DEFENSE_LINE_V, 60);
  for (const enemy of battle.world.enemies) assert.ok(defenseLane(enemy.x, enemy.y).v <= DEFENSE_LINE_V + .5);
});

test('같은 시드·같은 세이브는 같은 판이 된다(서버 리플레이 결정성)', () => {
  const save = armed();
  const first = runDefenseBattle(save, 424242, 60 * 60);
  const second = runDefenseBattle(save, 424242, 60 * 60);
  assert.deepEqual(defenseBattleSummary(first), defenseBattleSummary(second));
  assert.equal(first.stage, second.stage);
  assert.equal(first.world.slain, second.world.slain);
  // 다른 시드면 적 레인이 달라 요약도 갈린다.
  const other = runDefenseBattle(save, 424243, 60 * 60);
  assert.notEqual(defenseBattleSummary(other).digest, defenseBattleSummary(first).digest);
});

test('실패해도 그때까지 먹은 금화·경험치·아이템은 남는다', () => {
  const battle = runDefenseBattle(armed(1, 8, 5), 99, DEFENSE_MAX_STEPS);
  assert.equal(battle.outcome, 'dead');
  const rewards = battle.rewards();
  assert.ok(rewards.kills > 0);
  assert.ok(rewards.gold > 0, '쓰러져도 처치 금화는 남는다');
  assert.ok(rewards.exp > 0, '쓰러져도 처치 경험치는 남는다');
  const summary = defenseBattleSummary(battle);
  assert.equal(summary.kills, rewards.kills);
  assert.equal(summary.stages, battle.stage);
  assert.match(summary.digest, /^[0-9a-f]{8}$/);
});

test('처치 보상은 progress.ts의 killReward를 그대로 쓰고, 보상 층은 defenseRewardFloor다', () => {
  const save = armed();
  const normal = defenseKillReward(3, save);
  const boss = defenseKillReward(5, save, true);
  assert.ok(boss.gold > normal.gold && boss.exp > normal.exp, '보스는 금화·경험치가 크다');
  // 같은 층이면 같은 값 — 방어전 전용 보상표를 따로 만들지 않았다.
  assert.deepEqual(normal, defenseKillReward(3, { ...save, level: 1 }));
});

test('드랍은 상수를 복사하지 않고 items.ts·statBooks.ts의 필드 함수를 직접 부른다', () => {
  const source = readFileSync(new URL('../src/game/dungeon/defenseBattle.ts', import.meta.url), 'utf8');
  assert.match(source, /import \{[^}]*itemDropChance[^}]*\} from '\.\.\/items'/);
  assert.match(source, /import \{[^}]*rollItem[^}]*\} from '\.\.\/items'/);
  assert.match(source, /rollStatBookDrop\('hunt'\)/);
  assert.match(source, /itemDropChance\(floor, false\)/);
  assert.match(source, /rollItem\(floor, false, (true|false), job\)/);
  // 드랍률 상수(0.0039 등)를 복사하지 않는다 — PR #347이 값을 내리면 그대로 따라간다.
  assert.equal(/0\.00\d+/.test(source.replace(/DEFENSE_[A-Z_]+/g, '')), false, '드랍률 상수를 복사하지 않는다');
});
