import { test } from 'node:test';
import assert from 'node:assert/strict';
import './patch-buff-off.mjs';

const { SaveSync } = await import('../src/game/sync.ts');

const {
  BACKGROUND_MIN_SECONDS, BACKGROUND_POPUP_SECONDS, BACKGROUND_MAX_SECONDS,
  backgroundSettleSeconds, backgroundNeedsPopup, backgroundToast, backgroundDuration, acceptedItems,
} = await import('../src/game/background.ts');
const { freshSave } = await import('../src/game/store.ts');
const { World } = await import('../src/game/world.ts');
const { enemyMaxHp } = await import('../src/game/battle/formulas.ts');
const { killsToBoss } = await import('../src/game/progress.ts');
const { applyOfflineRewards } = await import('../src/game/offline.ts');

/**
 * 자리 비움(백그라운드) 정산 판정 (작업 261).
 *
 * 덕진 님 확정 기준(2026-11-24): 60초 미만은 정산 없음, 60~179초는 토스트, 180초 이상이거나
 * 놓치면 아쉬운 결과(유니크·전설·레벨업·층 상승·자동 분해)면 팝업. 상한 12시간.
 */

/** 판정 함수에 넘길 최소 보상 — 실제 정산(`applyOfflineRewards`)이 만드는 모양 그대로. */
const reward = (over = {}) => ({
  seconds: 60, kills: 31, exp: 930, gold: 620, items: [], missedDrops: 0, levels: 0,
  startFloor: 1, endFloor: 1, bossKills: 0, deaths: 0, salvaged: { count: 0, gold: 0, stones: 0 },
  ...over,
});
const gear = (rarity) => ({ id: `${rarity}-1`, name: '낡은 두손검', slot: 'weapon', rarity, stats: { attack: 2 } });

test('60초 미만은 정산하지 않고, 60초부터 숨김초만큼 정산한다', () => {
  assert.equal(BACKGROUND_MIN_SECONDS, 60);
  assert.equal(backgroundSettleSeconds(0), 0);
  assert.equal(backgroundSettleSeconds(59), 0, '짧은 탭 전환·알림 확인으로 보상이 나오지 않는다');
  assert.equal(backgroundSettleSeconds(60), 60);
  assert.equal(backgroundSettleSeconds(179.9), 179, '내림 — 초 단위로만 센다');
  assert.equal(backgroundSettleSeconds(600), 600);
});

test('서버가 알려 준 경과가 상한이다 — 숨기기 전 사냥 시간을 두 번 주지 않는다', () => {
  // 숨김 진입 저장이 성공한 정상 경로: 서버 경과 ≈ 숨김초(지연 몇 초) — 작은 쪽을 쓴다.
  assert.equal(backgroundSettleSeconds(600, 598), 598);
  // 진입 저장이 실패해 서버 경과에 숨기기 전 사냥 시간이 섞인 경우: 로컬 숨김초가 작다.
  assert.equal(backgroundSettleSeconds(600, 3_600), 600);
  // 숨김 중 저장이 성공해 서버 경과가 60초 미만으로 줄었다 — 이미 저장에 반영된 구간이다.
  assert.equal(backgroundSettleSeconds(600, 30), 0, '서버 기준 60초 미만이면 정산하지 않는다');
  // `load`가 실패했거나 8초를 넘겨 경과를 모르면 로컬 숨김초로 진행한다(보상을 잃지 않는다).
  assert.equal(backgroundSettleSeconds(600, undefined), 600);
});

test('상한은 12시간 — 기존 방치·서버 `elapsedSince`와 같다', () => {
  assert.equal(BACKGROUND_MAX_SECONDS, 43_200);
  assert.equal(backgroundSettleSeconds(13 * 3_600), 43_200);
  assert.equal(backgroundSettleSeconds(13 * 3_600, 99_999), 43_200);
});

test('3분 경계 — 179초는 토스트, 180초는 팝업', () => {
  assert.equal(BACKGROUND_POPUP_SECONDS, 180);
  assert.equal(backgroundNeedsPopup(179, reward()), false);
  assert.equal(backgroundNeedsPopup(180, reward()), true);
});

test('3분 미만이라도 놓치면 아쉬운 결과면 팝업 — 유니크·전설·레벨업·층 상승·자동 분해', () => {
  assert.equal(backgroundNeedsPopup(120, reward({ levels: 1 })), true, '레벨업');
  assert.equal(backgroundNeedsPopup(120, reward({ startFloor: 5, endFloor: 6 })), true, '층 상승');
  assert.equal(backgroundNeedsPopup(120, reward({ salvaged: { count: 2, gold: 40, stones: 1 } })), true, '자동 분해');
  assert.equal(backgroundNeedsPopup(120, reward({ items: [gear('unique')] })), true, '유니크 획득');
  assert.equal(backgroundNeedsPopup(120, reward({ items: [gear('legendary')] })), true, '전설 획득');
  // 흔한 등급·보스 처치·패배만으로는 흐름을 끊지 않는다.
  assert.equal(backgroundNeedsPopup(120, reward({ items: [gear('epic'), gear('rare')] })), false);
  assert.equal(backgroundNeedsPopup(120, reward({ bossKills: 1 })), false);
  assert.equal(backgroundNeedsPopup(120, reward({ deaths: 1 })), false);
});

test('짧은 복귀 토스트 — 시간·처치·경험치·금화를 한 줄로, 있으면 아이템·분해도', () => {
  assert.equal(backgroundDuration(120), '2분');
  assert.equal(backgroundDuration(3_600), '1시간');
  assert.equal(backgroundDuration(3_900), '1시간 5분');
  assert.equal(backgroundToast(reward({ seconds: 120 })), '자리 비운 2분 · 처치 31마리 · EXP +930 · +620금화');
  assert.equal(
    backgroundToast(reward({ seconds: 120, items: [gear('rare')], salvaged: { count: 2, gold: 40, stones: 1 } })),
    '자리 비운 2분 · 처치 31마리 · EXP +930 · +620금화 · 아이템 1개 · 분해 2개',
  );
});

test('저장이 조정했으면 가방에 남은 아이템만 보여 준다 — 미확정 보상을 먼저 띄우지 않는다', () => {
  const dropped = [gear('unique'), gear('rare')];
  // 서버 응답 세이브에 한 개만 남았다(상한·충돌로 조정) — 정산서도 그 한 개만 보여 준다.
  assert.deepEqual(acceptedItems(dropped, [{ id: 'rare-1' }]).map(item => item.rarity), ['rare']);
  assert.deepEqual(acceptedItems(dropped, []), [], '가방에 없는 아이템은 목록에서 뺀다');
});

test('resetField — 세이브는 그대로 두고 필드(적·드롭·쿨타임·보스 예약)만 세이브 기준으로 다시 세운다', () => {
  const save = freshSave(); save.tutorial = 1;
  const world = new World(save);
  // 정산이 끝난 뒤의 세이브 — 5층으로 올라가 있고 층 목표를 채웠다.
  save.floor = 5; save.maxFloor = 5; save.floorKills = killsToBoss(5);
  save.gold = 1_234; save.kills = 77;
  const bagBefore = save.bag.length;
  world.enemies = [{ x: 1, y: 1, hp: 1, maxHp: 1, boss: true, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 }];
  world.drops = [{ item: gear('rare'), x: 1, y: 1, age: 0, id: 'drop-1' }];
  world.spawnTimer = 12;
  // 같은 객체를 넘기는 `adoptSave`를 쓰면 세이브가 통째로 비워진다 — `resetField`는 그것을 피한다.
  world.resetField();
  assert.equal(save.floor, 5, '세이브가 지워지지 않는다');
  assert.equal(save.gold, 1_234);
  assert.equal(save.kills, 77);
  assert.equal(save.bag.length, bagBefore);
  assert.equal(world.enemies.length, 1, '새 층의 일반 몹 한 마리로 다시 시작한다');
  assert.equal(world.enemies[0].boss, false);
  assert.equal(world.enemies[0].hp, enemyMaxHp(5, false));
  assert.equal(world.drops.length, 0, '정산 전 드롭은 버린다');
  assert.equal(world.spawnTimer, 0);
  assert.equal(world.bossPending, true, '층 목표를 채운 최고 층이면 보스가 다시 예약된다');
  assert.equal(world.paused, false, '사냥 상태는 부르는 쪽이 정한다');
});

test('정산 뒤 resetField — 정산이 올린 층에서 이어서 사냥하고, 12시간 상한을 넘기지 않는다', () => {
  const save = freshSave(); save.tutorial = 1;
  const world = new World(save);
  const seconds = backgroundSettleSeconds(13 * 3_600, 13 * 3_600);
  const result = applyOfflineRewards(save, seconds, {});
  assert.equal(result.seconds, 43_200, '13시간을 숨겨도 12시간으로 계산한다');
  world.resetField();
  assert.equal(world.enemies[0].hp, enemyMaxHp(save.floor, false), '정산 뒤 층의 몹으로 다시 시작한다');
  assert.equal(save.floor, result.endFloor);
  assert.equal(world.drops.length, 0);
});

test('숨김 동안에는 예약 저장을 만들지 않는다 — 복귀 정산 구간이 짧아지지 않게', async () => {
  const save = freshSave();
  const session = { accountId: save.accountId, loginId: 'test', gender: 'male', guest: false, token: 'token', save, revision: 0, characterSlot: 1 };
  const sync = new SaveSync(save, session);
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { calls++; throw new Error('offline'); };
  try {
    sync.setHidden(true);
    sync.markDirty();
    sync.queueSave();
    await new Promise(resolve => setTimeout(resolve, 1_200));
    assert.equal(calls, 0, '숨김 중 자동 저장이 나가지 않는다');
    assert.equal(await sync.flushIfDirty(), true, '숨김 중 `flushIfDirty`는 요청을 만들지 않는다');
    assert.equal(calls, 0);
    assert.equal(sync.unsaved, true, '보낼 변경은 그대로 남아 다음 저장에 실린다');
    // 탭이 돌아오면 다시 보낸다(정산 저장·자동 저장이 이어서 돈다).
    sync.setHidden(false);
    await sync.flush();
    assert.equal(calls, 1, '복귀 뒤 첫 저장은 서버로 나간다');
  } finally { globalThis.fetch = realFetch; }
});
