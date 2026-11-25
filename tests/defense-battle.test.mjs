import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const {
  DefenseBattle, DEFENSE_STEP, DEFENSE_MAX_STEPS, DEFENSE_RUN_SECONDS, DEFENSE_MAX_STAGE,
  defenseBattleSummary, runDefenseBattle, defenseRewardFloor, defenseEnemyFloor, defenseBossStage, defenseEliteWave,
  defenseWaveSizes, defenseWaveKills, defenseStageEnemyCount, defenseSpawnSeconds, defenseDescentSpeed,
  defenseSpawnFloorSeconds, defenseStageHpSum, defenseKillReward, defenseMobHp, defenseBossHp,
  defenseEnemyKind, DEFENSE_BOSS_EVERY, DEFENSE_HERO_V, defenseLane, DEFENSE_REWARD_FLOOR_CAP,
  defenseHpWaveScale, defenseDmgWaveScale
} = await import('../src/game/dungeon/defenseBattle.ts');
const { DEFENSE_TUNING } = await import('../src/game/dungeon/defenseTuning.ts');
const { freshSave, totalStats } = await import('../src/game/store.ts');
const { enemyMaxHp } = await import('../src/game/battle/formulas.ts');
const { killReward, BOSS_GOLD_PER_FLOOR } = await import('../src/game/progress.ts');

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

test('진행 단위는 웨이브 하나다 — 5웨이브마다 보스(보스 1 + 호위 6), 3의 배수 웨이브에 정예', () => {
  assert.equal(DEFENSE_BOSS_EVERY, 5);
  assert.equal(defenseBossStage(5), true);
  assert.equal(defenseBossStage(10), true);
  assert.equal(defenseBossStage(4), false);
  assert.equal(defenseBossStage(11), false);
  // 보스 웨이브는 한 웨이브에 보스 1 + 호위 6 = 7마리다(스테이지 안에 웨이브 3개를 두지 않는다).
  assert.deepEqual(defenseWaveSizes(5), [7]);
  assert.deepEqual(defenseWaveSizes(4), [defenseWaveKills(4)]);
  // 정예는 보스 웨이브를 뺀 3의 배수 웨이브다.
  assert.equal(defenseEliteWave(3), true);
  assert.equal(defenseEliteWave(6), true);
  assert.equal(defenseEliteWave(5), false, '보스 웨이브에는 정예가 따로 서지 않는다');
  assert.equal(defenseEliteWave(4), false);
});

test('웨이브 몹 수는 8 → 14(10웨이브) → 18(30웨이브) → 24 상한이다', () => {
  assert.equal(defenseWaveKills(1), 8);
  assert.equal(defenseWaveKills(10), 14);
  assert.equal(defenseWaveKills(30), 18);
  assert.equal(defenseWaveKills(35), 19, '30웨이브 이후 5웨이브마다 +1');
  assert.equal(defenseWaveKills(100), 24, '상한 24');
  assert.equal(defenseStageEnemyCount(5), 7);
  // 1~30웨이브 누적 마릿수는 383마리다(서버 처치 범위의 근거).
  let total = 0;
  for (let wave = 1; wave <= 30; wave++) total += defenseStageEnemyCount(wave);
  assert.equal(total, 383);
});

test('스폰 간격은 1.30 → 0.55초, 추격 속도는 110 → 190u/s에서 멈춘다', () => {
  assert.equal(defenseSpawnSeconds(1), 1.3);
  assert.equal(defenseSpawnSeconds(100), .55);
  assert.equal(Math.round(defenseDescentSpeed(1)), 110);
  assert.equal(Math.round(defenseDescentSpeed(30)), 145);
  assert.equal(Math.round(defenseDescentSpeed(70)), 190);
  assert.equal(Math.round(defenseDescentSpeed(300)), 190);
  assert.equal(DEFENSE_TUNING.chaseMax, 190);
  assert.equal(Math.round(defenseSpawnFloorSeconds(30)), 377, '서버 최소 시간 하한의 근거(×0.75 = 283초)');
  assert.ok(defenseStageHpSum(30) > defenseStageHpSum(10));
  assert.equal(DEFENSE_MAX_STAGE, 999);
});

test('보상 기준 층은 1웨이브마다 1층씩 오르고 20층(20웨이브)에서 포화한다', () => {
  assert.equal(DEFENSE_TUNING.rewardWavesPerFloor, 1);
  assert.equal(DEFENSE_TUNING.rewardCap, DEFENSE_REWARD_FLOOR_CAP, '보상 상한은 서버 MAX_FLOOR 계약(20)과 같은 값이다');
  assert.equal(defenseRewardFloor(1), 1);
  assert.equal(defenseRewardFloor(2), 2);
  assert.equal(defenseRewardFloor(3), 3);
  assert.equal(defenseRewardFloor(20), 20);
  assert.equal(defenseRewardFloor(30), 20);
  assert.equal(defenseRewardFloor(60), 20);
  assert.equal(defenseRewardFloor(999), 20, '보상은 20층 값에서 더 오르지 않는다');
  // 적의 세기는 기준 층 60(필드 120층 상당)에서 포화한다 — 무한히 세지 않는다.
  assert.equal(defenseEnemyFloor(1), 2);
  assert.equal(defenseEnemyFloor(30), 18);
  assert.equal(defenseEnemyFloor(200), 60);
  assert.ok(defenseMobHp(30) > defenseMobHp(10));
  assert.ok(defenseBossHp(10) > defenseMobHp(10));
});

test('벽 구간 — 15웨이브까지는 v2 그대로, 16웨이브부터 체력 ×1.13·공격 ×1.25씩 오른다', () => {
  assert.equal(DEFENSE_TUNING.wallFrom, 15);
  assert.equal(DEFENSE_TUNING.wallHpGrowth, 1.13);
  assert.equal(DEFENSE_TUNING.wallDmgGrowth, 1.25);
  assert.equal(defenseHpWaveScale(1), 1);
  assert.equal(defenseHpWaveScale(15), 1, '15웨이브까지는 배율이 걸리지 않는다');
  assert.ok(Math.abs(defenseHpWaveScale(16) - 1.13) < 1e-9);
  assert.ok(Math.abs(defenseHpWaveScale(30) - Math.pow(1.13, 15)) < 1e-9);
  assert.ok(Math.abs(defenseDmgWaveScale(16) - 1.25) < 1e-9);
  // 1~15웨이브 체력은 v2와 같다 — 벽이 초반 손맛을 건드리지 않는다.
  assert.equal(defenseMobHp(15), Math.round(enemyMaxHp(defenseEnemyFloor(15), false) * DEFENSE_TUNING.hpScale));
  assert.equal(defenseBossHp(15), Math.round(enemyMaxHp(defenseEnemyFloor(15), true) * DEFENSE_TUNING.hpScale));
  // 30웨이브는 벽 몫만큼 두꺼워진다(일반·보스 같은 배율).
  assert.ok(defenseMobHp(30) > defenseMobHp(15) * 6);
  assert.ok(defenseBossHp(30) > defenseBossHp(15) * 6);
  // 적 1타도 체력보다 가파르게 오른다.
  assert.ok(defenseDmgWaveScale(30) > defenseDmgWaveScale(20) * 5);
  // 벽은 기준 층 곡선을 바꾸지 않는다 — 층은 그대로 60에서 포화한다.
  assert.equal(defenseEnemyFloor(30), 18);
  assert.equal(defenseEnemyFloor(200), 60);
});

test('방어선이 없다 — 판은 캐릭터 체력 0에서만 끝나고, 30분 안전 상한 안이다', () => {
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

test('적은 방어선 없이 캐릭터에게 직접 다가와 60에서 선다', () => {
  const battle = new DefenseBattle(armed(1, 6, 5), 2026);
  const start = defenseLane(battle.world.player.x, battle.world.player.y);
  assert.equal(Math.round(start.v), DEFENSE_HERO_V);
  const enemy = battle.world.enemies[0];
  assert.ok(enemy, '첫 적이 서 있다');
  const before = Math.hypot(enemy.x - battle.world.player.x, enemy.y - battle.world.player.y);
  let closest = before;
  for (let step = 0; step < 60 * 12; step++) {
    battle.advance(DEFENSE_STEP);
    if (!battle.world.enemies.includes(enemy)) break;
    closest = Math.min(closest, Math.hypot(enemy.x - battle.world.player.x, enemy.y - battle.world.player.y));
  }
  assert.ok(closest < before, '적이 캐릭터 쪽으로 다가온다');
  // 정지 거리는 60이다(그보다 안으로 파고들지 않는다) — 몸 분리(24) 여유를 둔다.
  assert.ok(closest >= 20, `적이 몸 위로 겹치지 않는다(가장 가까운 거리 ${closest.toFixed(1)})`);
});

test('몹은 근접·돌진·사수 세 종류이고 보스는 항상 근접이다', () => {
  const seen = new Set();
  const battle = new DefenseBattle(armed(30, 4000, 2000), 12345);
  for (let step = 0; step < 60 * 60 * 3 && !battle.finished; step++) {
    battle.advance(DEFENSE_STEP);
    for (const enemy of battle.world.enemies) seen.add(enemy.boss ? `boss:${defenseEnemyKind(enemy)}` : defenseEnemyKind(enemy));
  }
  assert.ok(seen.has('melee'), '근접 몹이 나온다');
  assert.ok(seen.has('charger'), '돌진형 몹이 나온다');
  assert.ok(seen.has('ranged'), '사수형 몹이 나온다');
  for (const kind of seen) if (kind.startsWith('boss:')) assert.equal(kind, 'boss:melee', '보스는 근접 고정');
  assert.equal(DEFENSE_TUNING.chargerPct, 20);
  assert.equal(DEFENSE_TUNING.rangedPct, 25);
  assert.equal(DEFENSE_TUNING.rangedAttackRange, 215);
});

test('웨이브를 막으면 최대 체력 15%를 회복한다', () => {
  const battle = new DefenseBattle(armed(20, 800, 600), 5);
  const max = totalStats(battle.world.save).health;
  battle.world.player.hp = max * .4;
  // 적을 바로 처리하며 1웨이브를 비운다 — 웨이브 전환은 실제 판과 같은 경로(`step`)로 일어난다.
  for (let step = 0; step < 60 * 600 && battle.stage === 1 && !battle.finished; step++) {
    for (const enemy of [...battle.world.enemies]) battle.world.kill(enemy);
    battle.world.enemies = [];
    battle.advance(DEFENSE_STEP);
  }
  assert.ok(battle.stage > 1 || battle.finished, '웨이브가 넘어갔다');
  assert.ok(battle.healedOnClear > 0, '막은 뒤 체력이 찼다');
  assert.ok(battle.healedOnClear <= max * .15 + 1, '회복은 최대 체력의 15%를 넘지 않는다');
});

test('같은 시드·같은 세이브는 같은 판이 된다(서버 리플레이 결정성)', () => {
  const save = armed();
  const first = runDefenseBattle(save, 424242, 60 * 60);
  const second = runDefenseBattle(save, 424242, 60 * 60);
  assert.deepEqual(defenseBattleSummary(first), defenseBattleSummary(second));
  assert.equal(first.stage, second.stage);
  assert.equal(first.world.slain, second.world.slain);
  // 다른 시드면 적 레인·종류가 달라 요약도 갈린다.
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

test('처치 보상은 ×1.8, 보스 확정 장비는 2개다', () => {
  assert.equal(DEFENSE_TUNING.killRewardScale, 1.8);
  assert.equal(DEFENSE_TUNING.bossDropCount, 2);
  const save = armed();
  const plain = killReward(save, { floor: 3 });
  assert.deepEqual(defenseKillReward(3, save), {
    gold: Math.round(plain.gold * DEFENSE_TUNING.killRewardScale),
    exp: Math.round(plain.exp * DEFENSE_TUNING.killRewardScale)
  }, '결과창 계산도 전투 중 누적과 같은 배율을 쓴다');
  // 실제 판에서도 보스 한 마리가 장비 2개를 남긴다(스탯북은 따로 굴린다).
  const battle = new DefenseBattle(save, 17);
  const boss = { x: 0, y: 0, hp: 10, maxHp: 10, boss: true, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  battle.world.kill(boss);
  assert.equal(battle.world.items.filter(item => !item.kind).length, 2);
});

test('10웨이브를 막으면 마일스톤(보스 금화 ×2 + 확정 장비 1)이 그 자리에서 한 번 들어간다', () => {
  assert.equal(DEFENSE_TUNING.milestoneEvery, 10);
  const battle = new DefenseBattle(armed(20, 800, 600), 11);
  const goldBefore = battle.world.gold;
  const itemsBefore = battle.world.items.filter(item => !item.kind).length;
  battle.world.milestone(9);
  assert.equal(battle.world.gold, goldBefore, '10의 배수가 아니면 아무것도 주지 않는다');
  battle.world.milestone(20);
  const expected = Math.round(BOSS_GOLD_PER_FLOOR * defenseRewardFloor(20) * DEFENSE_TUNING.milestoneGoldScale);
  assert.equal(battle.world.gold - goldBefore, expected);
  assert.equal(battle.world.items.filter(item => !item.kind).length - itemsBefore, DEFENSE_TUNING.milestoneDrops);
  // 웨이브를 실제로 막는 경로(`step`)에서도 보너스는 10웨이브에만 들어간다.
  const run = new DefenseBattle(armed(30, 4000, 2000), 321);
  const bonuses = [];
  const milestone = run.world.milestone.bind(run.world);
  run.world.milestone = (stage) => {
    const before = run.world.gold;
    milestone(stage);
    if (run.world.gold > before) bonuses.push([stage, run.world.gold - before]);
  };
  for (let step = 0; step < 60 * 600 && run.stage < 11 && !run.finished; step++) {
    for (const enemy of [...run.world.enemies]) run.world.kill(enemy);
    run.world.enemies = [];
    run.advance(DEFENSE_STEP);
  }
  assert.equal(run.stage, 11, '10웨이브를 막고 11웨이브로 넘어갔다');
  assert.deepEqual(bonuses, [[10, Math.round(BOSS_GOLD_PER_FLOOR * defenseRewardFloor(10) * DEFENSE_TUNING.milestoneGoldScale)]]);
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
