import './ts-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rewardBudget, clampSaveProgress, itemWithinBounds, elapsedSince, expToNext, floorKillTarget,
  MAX_LEVEL, MAX_PLUS, MAX_OFFLINE_SECONDS, RARITY_SCALES, TIER_BONUS_MAX, MAX_SLOT_PROFILES, TIER_STAT_GROWTH
} from '../server/save-guard.mjs';
const items = await import('../src/game/items.ts');
const store = await import('../src/game/store.ts');

// save-guard는 순수 JS(.mjs)이고, 진행 규칙의 값은 `src/game/progress.ts` 한 곳에서 직접 가져온다(PR-3, 작업 262).
// 아래 대조는 그 값이 게임 쪽 공개 경로(store 재export)와도 같은 값인지 지키는 계약이다 — 서버가 클라를
// 신뢰하지 않으면서도 같은 규칙을 보는 근거다.
test('세이브 검증 상수는 게임 원본과 같은 값이다', () => {
  assert.deepEqual(RARITY_SCALES, items.rarityScales);
  assert.equal(MAX_LEVEL, store.MAX_LEVEL);
  assert.equal(MAX_PLUS, items.MAX_PLUS);
  for (const floor of [1, 7, 30, 78, 120]) assert.equal(expToNext(floor), store.expToNext(floor));
  for (const floor of [1, 2, 10, 78]) assert.equal(floorKillTarget(floor), store.floorKillTarget(floor));
  for (const slot of items.slots) assert.equal(TIER_BONUS_MAX[slot], items.maxTierBonus(slot), `${slot} 티어 보정 상한`);
  // 작업 255 — 새 드롭의 능력치 상한은 슬롯 배분표(직업별 최댓값)와 티어 계수에서 나온다. 사본이 갈라지면
  // 서버가 정상 드롭을 거부하거나(너무 좁음) 위조를 통과시킨다(너무 넓음).
  assert.equal(TIER_STAT_GROWTH, items.TIER_STAT_GROWTH);
  for (const slot of items.slots) assert.deepEqual({ ...MAX_SLOT_PROFILES[slot] }, { ...items.maxSlotProfileTable[slot] }, `${slot} 능력치 배분 상한`);
});

test('정상 드롭은 어느 층·등급·강화에서도 능력치 상한 안에 있다', () => {
  for (let floor = 1; floor <= 120; floor++) {
    for (let roll = 0; roll < 12; roll++) {
      for (const boss of [false, true]) {
        const item = items.rollItem(floor, false, boss, 'warrior');
        assert(itemWithinBounds(item, floor), `${floor}층 ${item.rarity} ${item.slot} ${JSON.stringify(item.stats)}`);
      }
    }
    assert(itemWithinBounds(items.rollItem(floor, false, false, 'archer'), floor));
    assert(itemWithinBounds(items.rollItem(floor, false, false, 'mage'), floor));
  }
  // 튜토리얼 고정 드롭과 옛 세이브에서 역산한 강화 단계도 통과한다.
  assert(itemWithinBounds({ id: 'x', name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } }, 1));
  const legacy = { id: 'y', name: '황혼의 두손검', slot: 'weapon', rarity: 'rare', stats: { attack: 40 }, plus: 0 };
  legacy.plus = items.estimatePlus(legacy);
  assert(itemWithinBounds(legacy, 20));
});

test('만들어낸 능력치·층에 맞지 않는 등급은 상한 밖으로 걸러진다', () => {
  assert.equal(itemWithinBounds({ id: 'a', name: '영원의 패왕의 성검', slot: 'weapon', rarity: 'legendary', stats: { attack: 99999 } }, 78), false);
  assert.equal(itemWithinBounds({ id: 'b', name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4, health: 5000 } }, 1), false);
  // 1층에서 120층 기준 능력치는 나올 수 없다(부위·등급에 따라 운이 나쁘면 작게 나오므로 고정 표본을 쓴다).
  const deepStats = items.gearStats('weapon', 'legendary', 9, 120, 'warrior');
  assert.equal(itemWithinBounds({ id: 'deep', name: '영원의 패왕의 성검', slot: 'weapon', rarity: 'legendary', stats: deepStats }, 1), false);
  assert.equal(itemWithinBounds({ id: 'c', name: '수상한 것', slot: 'weapon', rarity: 'common', stats: { luck: 5 } }, 1), false);
});

const save = (over = {}) => ({
  version: 1, name: '전사', gender: 'male', level: 10, exp: 0, gold: 1000, floor: 20, maxFloor: 20,
  floorKills: 0, kills: 500, bossKills: 4, playSeconds: 3600, health: 220, equipment: {}, bag: [], stones: 10,
  skillPoints: 9, skillLevels: {}, tutorial: 3, dungeonFloor: 0, dungeonClearAt: 0, ...over
});

test('정상 플레이 변화는 그대로 통과한다', () => {
  const previous = save();
  const next = save({ kills: 512, bossKills: 4, gold: 1210, playSeconds: 3610, exp: 96 });
  const { clamped } = clampSaveProgress(previous, next, { elapsedSeconds: 5 });
  assert.deepEqual(clamped, []);
  assert.equal(next.gold, 1210);
  assert.equal(next.kills, 512);
});

test('한 창에서 만들 수 없는 골드·처치·레벨·층·강화석은 잘라 낸다', () => {
  const previous = save();
  const next = save({ gold: 5e11, kills: 9_000_000, bossKills: 1_000_000, playSeconds: 9e9, maxFloor: 78, floor: 78, level: 30, exp: 0, stones: 1e6, skillPoints: 999, dungeonFloor: 10, dungeonClearAt: Date.now() + 9e9 });
  const { clamped } = clampSaveProgress(previous, next, { elapsedSeconds: 5 });
  for (const field of ['gold', 'kills', 'bossKills', 'playSeconds', 'maxFloor', 'level', 'stones', 'skillPoints', 'dungeonFloor']) assert(clamped.includes(field), `${field} 클램프`);
  const budget = rewardBudget(previous, 5);
  assert.equal(next.kills, previous.kills + budget.kills);
  assert(next.gold <= previous.gold + budget.gold);
  assert(next.maxFloor <= previous.maxFloor + budget.bosses);
  assert(next.level <= MAX_LEVEL);
  assert.equal(next.dungeonFloor, 1, '검증된 기록이 없으면 이번 저장에서 한 층까지만');
  assert(next.dungeonClearAt <= Date.now());
});

test('던전 최고층은 서버가 검증한 기록(+1)까지만 저장된다', () => {
  const next = save({ dungeonFloor: 9 });
  clampSaveProgress(save({ dungeonFloor: 6 }), next, { elapsedSeconds: 60, dungeonFloorCap: 6 });
  assert.equal(next.dungeonFloor, 7);
  const reset = save({ dungeonFloor: 0 });
  clampSaveProgress(save({ dungeonFloor: 6 }), reset, { elapsedSeconds: 60, dungeonFloorCap: 6 });
  assert.equal(reset.dungeonFloor, 0, '초기화는 진행을 지운다');
});

test('서버가 같은 요청에서 준 금화·강화석은 상한에 함께 더한다', () => {
  const previous = save({ gold: 0 });
  const next = save({ gold: 900_000_000 });
  clampSaveProgress(previous, next, { elapsedSeconds: 1, goldCredit: 900_000_000 });
  assert.equal(next.gold, 900_000_000, '거래소 판매대금·우편 보상은 잘리지 않는다');
});

test('경과 시간은 최대 12시간까지만 인정한다', () => {
  const now = Date.parse('2026-11-20T10:00:00Z');
  assert.equal(elapsedSince(new Date(now - 5_000).toISOString(), now), 5);
  assert.equal(elapsedSince(new Date(now - 999_999_000).toISOString(), now), MAX_OFFLINE_SECONDS);
  assert.equal(elapsedSince('깨진 값', now), 0);
  assert.equal(elapsedSince(undefined, now), 0);
});
