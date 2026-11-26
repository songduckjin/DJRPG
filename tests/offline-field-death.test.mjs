/**
 * 방치(오프라인)·자리 비움 정산에서의 일반 사냥 사망 진행도 초기화 (2026-11-25 덕진 님 확정).
 *
 * 확정 기준(A안): 방치는 사망이 개별 사건이 아니라 **비율**로 계산되므로, 사망은
 * `버티는 초 + 부활 대기` 주기로 규칙적으로 일어난다고 보고 **마지막 사망 이후 사냥한 몫**만
 * `floorKills`에 남긴다. 사망이 있던 청크는 목표를 채웠더라도 승급·보스전을 열지 않는다.
 *  · 5층부터 적용, 입문 1~4층은 면제(누적 그대로).
 *  · 10골드 패널티·`fieldDeaths`는 접속과 같은 방식(사망 횟수 × 10).
 *  · 자리 비움도 `applyOfflineRewards` 한 번이라 이 파일이 둘 다 본다(`src/game/offlineSettle.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './patch-buff-off.mjs';

const { freshSave, floorKillTarget } = await import('../src/game/store.ts');
const { applyOfflineRewards, offlineDeathsPerHour, offlineKillsPerMinute, offlineSurviveSeconds } = await import('../src/game/offline.ts');
const { clampSaveProgress } = await import('../server/save-guard.mjs');

/** 장비 몇 점으로 스펙을 만든다 — `totalStats`는 착용 장비의 스탯을 그대로 더한다. */
const geared = (save, { attack = 0, defense = 0, health = 0 } = {}) => ({
  ...save,
  equipment: {
    ...save.equipment,
    weapon: { id: `w-${attack}`, name: '시험용 대검', slot: 'weapon', rarity: 'legendary', stats: { attack } },
    armor: { id: `a-${health}`, name: '시험용 갑옷', slot: 'armor', rarity: 'legendary', stats: { health, defense } }
  }
});

/** 사망이 있었다면 남을 수 있는 최대 진행도 — 한 사망 주기(버티는 초 + 부활 대기) 동안 잡는 마릿수. */
const cycleKills = (save, floor) =>
  Math.ceil(offlineKillsPerMinute(save, floor) * (offlineSurviveSeconds(save, floor) + 5) / 60) + 1;

test('사망이 잦으면 정산 뒤 진행도는 마지막 사망 이후 몫만 남는다(5층)', () => {
  const save = freshSave();
  save.tutorial = 1; save.floor = 5; save.maxFloor = 5;
  const reward = applyOfflineRewards(save, 3600);
  assert(reward.fieldDeaths > 0, '한 시간 내내 쓰러진다');
  assert.equal(reward.progressResets, reward.fieldDeaths, '5층에서는 사망마다 진행도가 초기화된다');
  assert.equal(reward.deaths, 0, '목표를 한 번도 못 채워 보스전이 열리지 않는다');
  assert.equal(save.floor, 5, '층은 그대로');
  assert.equal(save.bossKills, 0);
  assert(save.floorKills < floorKillTarget(5), '목표에 닿지 않는다');
  assert(save.floorKills <= cycleKills(save, 5), `마지막 사망 이후 몫만 (${save.floorKills})`);
  // 처치는 그대로 들어온다 — 진행도만 사라진다(금화·경험치는 처치 수만큼).
  assert(reward.kills > 500);
  assert.equal(save.gold, reward.gold - (reward.deaths + reward.fieldDeaths) * 10, '10골드 패널티는 사망 횟수만큼');
});

test('사망이 없는 스펙은 예전처럼 진행도가 누적된다(회귀)', () => {
  const save = geared(freshSave(), { attack: 60_000, defense: 5_000, health: 200_000 });
  save.tutorial = 1; save.autoClimb = false;          // 층에 머물러 진행도만 쌓는 경로
  save.floor = 5; save.maxFloor = 5;
  const reward = applyOfflineRewards(save, 3600);
  assert.equal(reward.fieldDeaths, 0, '회복이 피해를 넘어 죽지 않는다');
  assert.equal(reward.progressResets, 0);
  assert.equal(save.floorKills, reward.kills % floorKillTarget(5), '잡은 만큼 그대로 쌓인다');
});

test('입문 1~4층은 사망해도 진행도가 초기화되지 않는다(면제)', () => {
  const save = freshSave();
  save.tutorial = 1; save.autoClimb = false; save.floor = 3; save.maxFloor = 3;
  const reward = applyOfflineRewards(save, 3600);
  assert(reward.fieldDeaths > 0, '3층에서도 쓰러진다(10골드는 문다)');
  assert.equal(reward.progressResets, 0, '초기화는 5층부터');
  assert.equal(save.floorKills, reward.kills % floorKillTarget(3), '누적 규칙 그대로');
});

test('자동 등반이 켜져 있어도 사망이 있던 청크로는 층을 올라가지 않는다', () => {
  const save = freshSave();
  save.tutorial = 1; save.autoClimb = true; save.floor = 5; save.maxFloor = 9;
  const reward = applyOfflineRewards(save, 3600);
  assert.equal(save.floor, 5, '목표(30)를 한 번도 안 죽고 채우지 못한다');
  assert.equal(save.maxFloor, 9, '최고 도달 층은 그대로');
  assert.equal(reward.endFloor, 5);
  assert(reward.progressResets > 0);
  assert(save.floorKills <= cycleKills(save, 5));
});

test('사망이 드물면 마지막 사망 이후 몫이 그대로 진행도가 되고, 층은 오른다', () => {
  const save = geared(freshSave(), { attack: 250, defense: 60, health: 1_200 });
  save.tutorial = 1; save.autoClimb = true; save.floor = 5; save.maxFloor = 9;
  const reward = applyOfflineRewards(save, 3600);
  assert(save.floor > 9, `최고층을 지나 계속 오른다 (${save.floor}층)`);
  assert(reward.progressResets > 0, '죽은 적은 있다');
  assert(save.floorKills <= floorKillTarget(save.floor), '진행도는 그 층 목표 안에');
  assert.equal(reward.endFloor, save.floor);
});

test('12시간 정산도 멈추지 않고 끝난다(죽어도 보스를 만나지 못할 뿐)', () => {
  const save = freshSave();
  save.tutorial = 1; save.floor = 5; save.maxFloor = 5;
  const reward = applyOfflineRewards(save, 43_200);
  assert.equal(reward.seconds, 43_200);
  assert.equal(save.floor, 5);
  assert.equal(reward.endFloor, 5);
  assert(reward.kills > 5_000, '사냥은 계속된다');
  assert.equal(reward.progressResets, reward.fieldDeaths);
  assert(save.floorKills <= cycleKills(save, 5));
  // 사망 횟수는 `버티는 초 + 부활 대기` 주기 모형과 같은 규모다(레벨업으로 주기가 조금씩 변한다).
  const expected = offlineDeathsPerHour(save, 5) * 12;
  assert(Math.abs(reward.fieldDeaths - expected) <= expected * .25, `사망 ${reward.fieldDeaths} vs 기대 ${Math.round(expected)}`);
});

test('자동 등반이 꺼진 아래층 경로도 마지막 사망 이후 몫만 남긴다', () => {
  const save = geared(freshSave(), { attack: 400, defense: 100, health: 2_000 });
  save.tutorial = 1; save.autoClimb = false; save.floor = 8; save.maxFloor = 10;
  const reward = applyOfflineRewards(save, 3600);
  assert.equal(save.floor, 8, '층은 그대로');
  assert(reward.progressResets > 0);
  assert(save.floorKills < floorKillTarget(8), '목표 안에서 돈다');
  assert(save.floorKills <= cycleKills(save, 8));
});

test('서버 검증은 진행도가 0인 방치 세이브를 깎지 않는다', () => {
  const previous = freshSave();
  previous.tutorial = 1; previous.floor = 5; previous.maxFloor = 5;
  const save = structuredClone(previous);
  applyOfflineRewards(save, 3600);
  const before = structuredClone(save);
  const { clamped } = clampSaveProgress(structuredClone(previous), save, { elapsedSeconds: 3600 });
  assert(!clamped.includes('floorKills'), '상한만 자르므로 0은 그대로 통과한다');
  assert.equal(save.floorKills, before.floorKills);
  assert(save.floorKills < floorKillTarget(5));
});
