import { test } from 'node:test';
import assert from 'node:assert/strict';
// 기념 종일 버프(2026-11-22 공·방·체 +30%)를 끈 시각으로 시계를 고정한다 — 밸런스 스냅샷이 흔들리지 않게.
import './patch-buff-off.mjs';

const { freshSave, floorKillTarget, MAX_FLOOR } = await import('../src/game/store.ts');
const { applyOfflineRewards, offlineBossBattle, offlineHeroDps, offlineKillsPerMinute } = await import('../src/game/offline.ts');
const { clampSaveProgress, rewardBudget, MAX_FLOOR: GUARD_MAX_FLOOR } = await import('../server/save-guard.mjs');
const { totalStats } = await import('../src/game/store.ts');
const { attackInterval, fieldSpawnRate } = await import('../src/game/battle/formulas.ts');

/** 장비 몇 점으로 스펙을 만든다 — `totalStats`는 착용 장비의 스탯을 그대로 더한다. */
const geared = (save, { attack = 0, defense = 0, health = 0 } = {}) => ({
  ...save,
  equipment: {
    ...save.equipment,
    weapon: { id: `w-${attack}`, name: '시험용 대검', slot: 'weapon', rarity: 'legendary', stats: { attack } },
    armor: { id: `a-${health}`, name: '시험용 갑옷', slot: 'armor', rarity: 'legendary', stats: { health, defense } }
  }
});

test('강한 스펙이면 방치 중에도 보스가 저절로 나와 층이 오른다', () => {
  const save = geared(freshSave(), { attack: 400, defense: 100, health: 2_000 });
  save.tutorial = 1; save.level = 1;
  const reward = applyOfflineRewards(save, 3600);
  assert(reward, '1시간 정산');
  assert.equal(reward.startFloor, 1);
  assert(save.maxFloor > 1, `층이 올라야 한다 (maxFloor ${save.maxFloor})`);
  assert.equal(save.floor, save.maxFloor, '최고 층에서 계속 사냥한다');
  assert(save.bossKills >= 2, `보스를 여러 번 잡아야 한다 (${save.bossKills})`);
  assert.equal(reward.bossKills, save.bossKills);
  assert.equal(reward.endFloor, save.floor);
  assert.equal(reward.deaths, 0);
  // 보스 금화(70×층)와 그 층 킬당 금화가 함께 들어간다 — 1층만 돌았을 때보다 많다.
  assert(reward.gold > reward.kills * 3, `보스 금화가 붙는다 (${reward.gold})`);
  // 층을 올라간 만큼만 다음 층 목표를 채운다 — 목표를 넘겨 쌓이지 않는다.
  assert(save.floorKills <= floorKillTarget(save.floor));
});

test('약한 스펙이면 보스에게 막혀 그 층에서 일반 사냥만 한다', () => {
  const save = freshSave();
  save.tutorial = 1; save.floor = 5; save.maxFloor = 5;
  const weak = offlineBossBattle(save, 5);
  assert.equal(weak.win, false, '맨몸으로는 5층 보스를 못 잡는다');
  const reward = applyOfflineRewards(save, 3600);
  assert.equal(save.floor, 5, '층은 그대로');
  assert.equal(save.maxFloor, 5);
  assert.equal(save.bossKills, 0);
  // 밸런스 v2의 방치 속도(분당 40마리 안팎)에서는 한 시간에 5층 목표(286)를 두 번 채워 두 번 진다.
  assert(reward.deaths >= 1, '목표를 채우고 보스에게 진다');
  assert(reward.kills > 0);
  // 1마리부터 다시 잡는다 — 다음 접속에 바로 또 보스가 서 있지 않다.
  assert(save.floorKills < floorKillTarget(5));
  assert.equal(save.bossRetryFloor, 5, '`⚔ 보스 도전`이 살아 있는 층을 남긴다');
  // 지면 10골드를 잃는다(접속 사냥과 같다) — 2026-11-24부터 사냥 중 쓰러짐(`fieldDeaths`)도 같은 패널티다.
  assert.equal(save.gold, reward.gold - (reward.deaths + reward.fieldDeaths) * 10);
});

test('자동 등반이 꺼져 있으면 층이 오르지 않는다', () => {
  const save = geared(freshSave(), { attack: 400, defense: 100, health: 2_000 });
  save.tutorial = 1; save.autoClimb = false;
  const reward = applyOfflineRewards(save, 3600);
  assert.equal(save.floor, 1);
  assert.equal(save.maxFloor, 1);
  assert.equal(save.bossKills, 0);
  assert.equal(reward.bossKills, 0);
  assert.equal(reward.deaths, 0);
  assert.equal(save.floorKills, reward.kills % floorKillTarget(1));
});

test('아래층에서도 자동 등반이 켜져 있으면 목표를 채울 때마다 한 층씩 올라간다(작업 245)', () => {
  const save = geared(freshSave(), { attack: 400, defense: 100, health: 2_000 });
  save.tutorial = 1; save.floor = 2; save.maxFloor = 9;
  const reward = applyOfflineRewards(save, 3600);
  // 작업 245: 자동 등반 중이면 방치 정산도 접속 사냥과 같이 아래층을 한 층씩 올라간다(보스는 최고층에서만).
  assert(save.floor > 2, '아래층에 머물지 않고 올라간다');
  // 최고층(9)에 닿은 뒤로는 보스를 이길 때마다 한 층씩 더 올라간다 — 최고 도달 층도 함께 오른다(접속과 같다).
  assert(save.floor >= 9, `최고층을 지나 보스를 이겨 더 올라간다 (${save.floor}층)`);
  assert(save.maxFloor >= 9 && save.maxFloor <= MAX_FLOOR, '최고 도달 층은 보스 승리만큼만 오른다');
  assert.equal(save.maxFloor, save.floor === MAX_FLOOR ? MAX_FLOOR : save.maxFloor);
  assert.equal(reward.endFloor, save.floor);
  assert(save.floorKills <= floorKillTarget(save.floor), '진행도는 그 층 목표 안에');
  // 한 층에 머무는 경우는 자동 등반이 꺼져 있을 때뿐이다.
  const parked = geared(freshSave(), { attack: 400, defense: 100, health: 2_000 });
  parked.tutorial = 1; parked.floor = 2; parked.maxFloor = 9; parked.autoClimb = false;
  const parkedReward = applyOfflineRewards(parked, 3600);
  assert.equal(parked.floor, 2);
  assert.equal(parkedReward.bossKills, 0);
  assert.equal(parkedReward.deaths, 0);
});

test('마지막 층에서는 보스를 이겨도 층이 오르지 않고 보스만 계속 잡는다', () => {
  const save = geared(freshSave(), { attack: 60_000, defense: 5_000, health: 200_000 });
  save.tutorial = 1; save.floor = MAX_FLOOR; save.maxFloor = MAX_FLOOR;
  const reward = applyOfflineRewards(save, 43_200);
  assert.equal(save.floor, MAX_FLOOR);
  assert.equal(save.maxFloor, MAX_FLOOR);
  assert(reward.bossKills > 0, '마지막 층에서도 보스 보상은 받는다');
  assert.equal(reward.deaths, 0);
});

test('보스전 추정은 접속 전투와 같은 값(평타 1.6배·직업 간격·치명·6.0타 상한·0.85초 피격)을 쓴다', () => {
  const save = freshSave();
  // 평타만: 공격 10 × 1.6 × 치명(2%) / 직업 기본 간격 0.48 = 33.87/s
  const crit = 1 + totalStats(save).crit / 100 * .8;
  assert(Math.abs(offlineHeroDps(save) - 10 * 1.6 * crit / .48) < .01);
  // 공속 장비는 공격 간격을 줄여 DPS를 올린다 — 전사는 장비 공속에 0.55배(밸런스 v2).
  const fast = { ...save, equipment: { gloves: { id: 'g', name: '시험용 장갑', slot: 'gloves', rarity: 'rare', stats: { speed: 100 } } } };
  assert(Math.abs(offlineHeroDps(fast) - 10 * 1.6 * crit / attackInterval('warrior', 55)) < .01);
  const battle = offlineBossBattle(save, 1);
  assert.equal(battle.win, false, '맨몸 1레벨은 1층 보스에게 진다(실제 전투와 같은 식)');
  const ready = offlineBossBattle(geared(freshSave(), { attack: 100, defense: 20, health: 400 }), 1);
  assert.equal(ready.win, true, '장비를 갖추면 잡는다');
  assert(ready.seconds > 0);
  assert.equal(Math.round(offlineKillsPerMinute(save) * 100) / 100, Math.round(60 * fieldSpawnRate(1) * .7 * 100) / 100, '1층 젠 상한(60 × 0.98 × 0.7)에 닿는다');
});

test('서버 검증은 방치 등반 세이브를 깎지 않는다(층·보스·금화·경험치)', () => {
  const previous = geared(freshSave(), { attack: 400, defense: 100, health: 2_000 });
  previous.tutorial = 1;
  const save = structuredClone(previous);
  const reward = applyOfflineRewards(save, 3600);
  assert(save.maxFloor > 1, '테스트 전제: 층이 올랐다');
  assert.equal(GUARD_MAX_FLOOR, MAX_FLOOR);
  const { clamped } = clampSaveProgress(structuredClone(previous), save, { elapsedSeconds: 3600 });
  assert.deepEqual(clamped, [], `클램프되면 안 된다: ${clamped.join(',')}`);
  // 같은 창에서 그 층 값으로 계산한 금화 상한이 실제 보상보다 커야 한다.
  const budget = rewardBudget(previous, 3600, save.maxFloor);
  assert(budget.gold > reward.gold, `금화 상한 ${budget.gold} > 보상 ${reward.gold}`);
  assert(budget.exp > reward.exp);
});
