/**
 * 일반 사냥 사망 시 층 진행도 초기화 (2026-11-25 덕진 님 확정).
 *
 * 확정 기준
 *  · 접속 필드 사냥에서 **일반·정예 몹**에게 쓰러지면 이번 층 `floorKills = 0` — 다음 층으로 넘어가지 못한다.
 *  · **모든 층 공통**이되 **입문 1~4층은 면제**(5층부터 적용) — 부활 대기 면제와 같은 구간이다.
 *  · 보스 패배(`afterBossLose`/`recordBossLoss`), `bossRetryFloor`, `autoClimb`, 10골드 패널티는 기존 규칙 그대로.
 *  · 진행도를 0으로 돌리면 **예약된 보스도 취소**한다(`bossPending = false`) — 죽은 직후 보스가 뜨면 안 된다.
 *  · `⚔ 보스 도전`은 그대로 살아 있다(작업 222·223) — 한 번 보스를 만난 층은 버튼으로 바로 재도전한다.
 *
 * 방치·자리 비움 쪽 같은 규칙은 `tests/offline-field-death.test.mjs`가 본다(둘 다 `applyOfflineRewards`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './patch-buff-off.mjs';

const { freshSave, floorKillTarget, totalStats } = await import('../src/game/store.ts');
const { World } = await import('../src/game/world.ts');
const { afterFieldDeath, FIELD_DEATH_RESET_FROM, MAX_FLOOR } = await import('../src/game/progress.ts');
const { REVIVE_CARD_PROGRESS, FLOOR_DEATH_RESET_NOTE, isReviveToastSuppressed } = await import('../src/game/reviveNotice.ts');

/** 때리기만 하고 죽지 않는 몹 — `player.hp = 1`에서 한 프레임이면 쓰러진다. */
const mob = (elite = false) => ({ x: 10, y: 0, hp: 9_999, maxHp: 9_999, boss: false, elite, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
/** 그 층 보스(때리는 쪽) — 보스에게 지는 경로를 만든다. */
const boss = () => ({ x: 10, y: 0, hp: 9_999, maxHp: 9_999, boss: true, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });

/** `floor`층에서 일반 몹에게 한 번 쓰러진 세계 — 메시지는 모아 둔다. */
function dieOn(floor, { maxFloor = floor, autoClimb = true, floorKills = 10, enemy = mob() } = {}) {
  const save = freshSave();
  save.tutorial = 1; save.autoClimb = autoClimb; save.gold = 100;
  save.floor = floor; save.maxFloor = maxFloor; save.floorKills = floorKills;
  const world = new World(save);
  const messages = [];
  world.onMessage = text => messages.push(text);
  world.spawnTimer = 999;              // 죽는 프레임에 몹·보스가 새로 뜨지 않게
  world.enemies = [enemy];
  world.player.hp = 1;
  world.update(.01);
  return { save, world, messages };
}

// ── 규칙(순수 함수) ────────────────────────────────────────────────────────────

test('afterFieldDeath — 5층부터 진행도가 0, 입문 1~4층은 면제', () => {
  for (let floor = 1; floor <= 4; floor++) {
    const save = { ...freshSave(), floor, floorKills: 10 };
    assert.deepEqual(afterFieldDeath(save), { reset: false }, `${floor}층은 면제`);
    assert.equal(save.floorKills, 10, `${floor}층 진행도는 그대로`);
  }
  for (const floor of [5, 12, 20, 39, MAX_FLOOR]) {
    const save = { ...freshSave(), floor, floorKills: 10 };
    assert.deepEqual(afterFieldDeath(save), { reset: true }, `${floor}층은 0으로`);
    assert.equal(save.floorKills, 0);
  }
  assert.equal(FIELD_DEATH_RESET_FROM, 5);
  // 이미 0이면 사라진 것이 없다 — 화면이 `1마리부터 다시`를 새로 띄우지 않는다.
  const empty = { ...freshSave(), floor: 6, floorKills: 0 };
  assert.deepEqual(afterFieldDeath(empty), { reset: false });
  // 보스 재도전 기록은 건드리지 않는다(작업 222·223 보존).
  const retry = { ...freshSave(), floor: 6, floorKills: 7, bossRetryFloor: 6 };
  afterFieldDeath(retry);
  assert.equal(retry.bossRetryFloor, 6);
});

// ── 접속 사냥 ─────────────────────────────────────────────────────────────────

test('최고층에서 일반 몹에게 쓰러지면 이번 층 진행도가 0이 된다(5층부터)', () => {
  const { save, world } = dieOn(5, { floorKills: 12 });
  assert.equal(save.floorKills, 0, '1마리부터 다시');
  assert.equal(save.floor, 5, '층은 그대로(자동 등반은 꺼지지 않는다)');
  assert.equal(save.autoClimb, true);
  assert.equal(world.reviveProgressReset, true, '부활 카드가 진행도 초기화를 알린다');
  assert.equal(save.bossRetryFloor, 0, '일반 몹 사망으로 재도전 기록은 서지 않는다');
});

test('정예 몹에게 쓰러져도 진행도가 0이 된다', () => {
  const { save } = dieOn(8, { floorKills: 9, enemy: mob(true) });
  assert.equal(save.floorKills, 0);
});

test('아래층 파밍(floor < maxFloor)에서도 5층부터는 진행도가 0이 된다', () => {
  const { save } = dieOn(7, { maxFloor: 12, floorKills: 15 });
  assert.equal(save.floorKills, 0);
  assert.equal(save.maxFloor, 12, '최고 도달 층은 그대로');
});

test('자동 등반이 꺼진 세이브에서도 진행도가 0이 된다', () => {
  const { save } = dieOn(9, { autoClimb: false, floorKills: 4 });
  assert.equal(save.floorKills, 0);
  assert.equal(save.autoClimb, false, '설정은 건드리지 않는다');
});

test('입문 1~4층은 면제 — 쓰러져도 진행도가 남는다(부활 대기 0초와 같은 구간)', () => {
  const { save, world, messages } = dieOn(3, { maxFloor: 6, floorKills: 13 });
  assert.equal(save.floorKills, 13, '1~4층은 그대로');
  assert.equal(world.reviveProgressReset, false);
  assert.equal(world.reviveTimer, 0, '입문 구간은 대기 없이 바로 부활한다');
  const death = messages.find(text => /골드를 잃고 부활/.test(text)) ?? '';
  assert.match(death, /10골드를 잃고 부활/);
  assert.doesNotMatch(death, /1마리부터 다시 잡습니다/);
});

test('진행도가 목표인 상태에서 쓰러지면 예약된 보스도 취소된다(죽은 직후 보스가 뜨지 않는다)', () => {
  const save = freshSave();
  save.tutorial = 1; save.autoClimb = true; save.gold = 100;
  save.floor = 5; save.maxFloor = 5; save.floorKills = floorKillTarget(5);
  const world = new World(save);
  assert.equal(world.bossPending, true, '목표를 채워 보스가 예약돼 있다');
  world.spawnTimer = 999;
  world.enemies = [mob()];
  world.player.hp = 1;
  world.update(.01);
  assert.equal(save.floorKills, 0);
  assert.equal(world.bossPending, false, '죽은 뒤에는 보스가 서 있지 않다');
  // 부활한 뒤 몹을 잡아 다시 채워야 보스가 온다.
  world.reviveTimer = 0; world.player.hp = totalStats(save).health;
  const target = floorKillTarget(5);
  for (let kill = 0; kill < target; kill++) {
    world.kill({ x: 0, y: 0, hp: 0, maxHp: 1, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
  }
  assert(world.bossPending, '목표를 다시 채우면 보스가 나타난다');
});

test('사망 메시지가 진행도 초기화를 말하고, 강등 문구(`자동 등반이 중단`)는 쓰지 않는다', () => {
  const { messages, world } = dieOn(6, { floorKills: 3 });
  const death = messages.find(text => /골드를 잃었습니다/.test(text)) ?? '';
  assert.match(death, /10골드를 잃었습니다\. 5초 뒤 부활합니다\./);
  assert.match(death, /이번 층은 1마리부터 다시 잡습니다/);
  assert.doesNotMatch(death, /자동 등반이 중단/);
  // 부활 카드가 같은 말을 보여 주므로 토스트는 접는다(카드가 없는 1~4층 문장은 그대로 남는다).
  assert.equal(isReviveToastSuppressed(death), true);
  assert.equal(isReviveToastSuppressed('쓰러졌습니다. 10골드를 잃었습니다. 5초 뒤 부활합니다. 자동 등반은 계속됩니다.'), true);
  assert.equal(isReviveToastSuppressed('쓰러졌습니다. 10골드를 잃었습니다. 5초 뒤 부활합니다. 1마리부터 다시 잡으면 보스가 다시 나타납니다.'), false, '보스 안내는 카드에 없는 정보');
  assert.equal(world.reviveProgressReset, true);
});

test('부활 카드·층 선택 안내 문구가 5층 규칙을 말한다', () => {
  assert.match(REVIVE_CARD_PROGRESS, /1마리부터/);
  assert.match(FLOOR_DEATH_RESET_NOTE, /5층부터는 쓰러지면/);
  assert.match(FLOOR_DEATH_RESET_NOTE, /1마리부터 다시 시작합니다/);
});

test('부활 대기 중 연속 피격은 초기화·패널티를 한 번만 문다', () => {
  const { save, world } = dieOn(5, { floorKills: 20 });
  assert.equal(save.floorKills, 0);
  assert(world.reviveTimer > 0, '5초 대기 중이다');
  const gold = save.gold;
  // 대기 중에 옆 몹이 계속 때려도 heroDown은 다시 돌지 않는다(처음 처리에서 조기 return).
  for (let step = 0; step < 30; step++) world.update(.1);
  assert.equal(save.gold, gold, '10골드를 한 번만 잃는다');
  assert.equal(save.floorKills, 0);
});

// ── 보존되는 기존 규칙 ────────────────────────────────────────────────────────

test('자동 등반 중 보스에게 지면 예전처럼 0 + `⚔ 보스 도전` 유지', () => {
  const save = freshSave();
  save.tutorial = 1; save.autoClimb = true; save.gold = 100;
  save.floor = 6; save.maxFloor = 6; save.floorKills = floorKillTarget(6);
  const world = new World(save);
  world.spawnTimer = 999; world.enemies = [boss()]; world.player.hp = 1;
  world.update(.01);
  assert.equal(save.floorKills, 0, '보스 패배도 1마리부터');
  assert.equal(save.bossRetryFloor, 6);
  assert.equal(world.bossRetryReady, true);
});

test('자동 등반이 꺼진 채 보스에게 지면 진행도는 남는다(작업 222 보존)', () => {
  const save = freshSave();
  save.tutorial = 1; save.autoClimb = false; save.gold = 100;
  save.floor = 6; save.maxFloor = 6; save.floorKills = 17;
  const world = new World(save);
  world.spawnTimer = 999; world.enemies = [boss()]; world.player.hp = 1;
  world.update(.01);
  assert.equal(save.floorKills, 17, '진행도는 그대로');
  assert.equal(world.bossRetryReady, true, '버튼만 살아난다');
});

test('`⚔ 보스 도전`은 진행도를 목표까지 채워 준다 — 한 번 만난 층은 사망해도 재도전할 수 있다', () => {
  const save = freshSave();
  save.tutorial = 1; save.autoClimb = true; save.gold = 100;
  save.floor = 9; save.maxFloor = 9; save.floorKills = 10;
  const world = new World(save);
  world.bossRetryAvailable = true;
  world.spawnTimer = 999; world.enemies = [mob()]; world.player.hp = 1;
  world.update(.01);
  assert.equal(save.floorKills, 0, '사망으로 진행도가 사라졌다');
  assert.equal(world.challengeBoss(), true);
  assert.equal(save.floorKills, floorKillTarget(9), '버튼이 목표까지 채운다');
});
