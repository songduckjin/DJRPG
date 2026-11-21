/**
 * 진행 규칙 패리티 (PR-3, 작업 261).
 *
 * `src/game/progress.ts`로 진행 규칙(킬 보상·보스 승패·층 진행·플레이 시간)을 뽑아내기 전에
 * **origin/main(9829aea)의 코드로** 아래 시나리오를 돌려 값을 그대로 적어 두었다.
 * 리팩터링은 이 값을 한 자리도 바꾸지 않아야 한다 — 밸런스 수치 불변이 이 작업의 조건이다.
 *
 * 시나리오 정의: `tests/progress-parity-scenarios.mjs`
 *  · 필드 60초(보스 승리·보스 패배)
 *  · 방치 정산 12시간(자동 등반으로 8층 → 16층, 보스 6회 처치)
 *  · 던전 1층 클리어·5층 보스 클리어·5층 보스 패배
 *  · 던전 5층 클리어 보상 정산(금화·강화석·아이템)
 *
 * 값이 달라지면 밸런스가 움직였다는 뜻이다. 의도한 밸런스 변경이라면 이 표를 고치기 전에
 * 그 변경이 왜 진행 규칙을 바꾸는지 먼저 확인한다(PR 본문의 "동작 동일 대조표"에 적는다).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { PARITY_SCENARIOS, recordScenarios } = await import('./progress-parity-scenarios.mjs');

const EXPECTED = {
  'field-boss-win': {
    gold: 1750, exp: 1216, level: 10, floor: 7, maxFloor: 7, floorKills: 35, kills: 46, bossKills: 1,
    playSeconds: 59.999999999997875, stones: 3, salvageCount: 0, tutorial: 3, health: 21.800000000000026,
    dungeonFloor: 0, bossRetryFloor: 0, bag: 0
  },
  'field-boss-loss': {
    gold: 1238, exp: 1030, level: 7, floor: 6, maxFloor: 6, floorKills: 31, kills: 41, bossKills: 0,
    playSeconds: 59.999999999997875, stones: 3, salvageCount: 0, tutorial: 3, health: 172,
    dungeonFloor: 0, bossRetryFloor: 6, bag: 0
  },
  'offline-12h': {
    progress: {
      gold: 186547, exp: 246149, level: 15, floor: 16, maxFloor: 16, floorKills: 79, kills: 11513, bossKills: 6,
      playSeconds: 0, stones: 12, salvageCount: 0, tutorial: 3, health: 600, dungeonFloor: 0, bossRetryFloor: 0, bag: 26
    },
    reward: {
      seconds: 43200, kills: 11513, exp: 246149, gold: 181547, levels: 0, startFloor: 8, endFloor: 16,
      bossKills: 6, deaths: 0, items: 26, missedDrops: 0, salvaged: { count: 0, gold: 0, stones: 0 }
    }
  },
  'dungeon-1-clear': {
    summary: { won: true, steps: 198, seconds: 3.3, heroHp: 171, heroHpMax: 208, enemyHp: 0, slain: 7, digest: '657cb117' },
    progress: {
      gold: 900, exp: 400, level: 10, floor: 1, maxFloor: 6, floorKills: 0, kills: 0, bossKills: 0,
      playSeconds: 3.299999999999993, stones: 3, salvageCount: 0, tutorial: 3, health: 170.00000000000003,
      dungeonFloor: 0, bossRetryFloor: 0, bag: 0
    },
    slain: 7, lootGold: 28, lootItems: 0
  },
  'dungeon-5-boss-clear': {
    summary: { won: true, steps: 116, seconds: 1.9, heroHp: 182, heroHpMax: 388, enemyHp: 0, slain: 1, digest: 'b876b8f3' },
    progress: {
      gold: 900, exp: 400, level: 25, floor: 5, maxFloor: 6, floorKills: 0, kills: 0, bossKills: 0,
      playSeconds: 1.9333333333333313, stones: 3, salvageCount: 0, tutorial: 3, health: 181.60000000000002,
      dungeonFloor: 0, bossRetryFloor: 0, bag: 0
    },
    slain: 1, lootGold: 350, lootItems: 2
  },
  'dungeon-5-boss-death': {
    summary: { won: false, steps: 82, seconds: 1.4, heroHp: 0, heroHpMax: 208, enemyHp: 8497, slain: 0, digest: '82f40fe2' },
    progress: {
      gold: 900, exp: 400, level: 10, floor: 5, maxFloor: 6, floorKills: 0, kills: 0, bossKills: 0,
      playSeconds: 1.3666666666666667, stones: 3, salvageCount: 0, tutorial: 3, health: 98.8,
      dungeonFloor: 0, bossRetryFloor: 0, bag: 0
    },
    slain: 0, lootGold: 0, lootItems: 0
  },
  'dungeon-5-claim': {
    cleared: true,
    receipt: { floor: 5, firstClear: true, gold: 350, stones: 35, items: 2, missed: 0, salvaged: { count: 0, gold: 0, stones: 0 } },
    progress: {
      gold: 1250, exp: 400, level: 25, floor: 6, maxFloor: 6, floorKills: 200, kills: 0, bossKills: 0,
      playSeconds: 0, stones: 38, salvageCount: 0, tutorial: 3, health: 900, dungeonFloor: 4,
      bossRetryFloor: 0, bag: 2
    }
  }
};

// 시나리오 표와 기대값 표가 어긋나면(새 시나리오를 기대값 없이 추가) 먼저 잡는다.
test('진행 패리티 시나리오마다 기록된 기대값이 있다', () => {
  assert.deepEqual(PARITY_SCENARIOS.map(([name]) => name), Object.keys(EXPECTED));
});

// 한 러너에서 여러 번 돌려도 같은 값이 나오는지(난수·시계가 새지 않는지) 먼저 확인한다.
test('같은 시드·같은 세이브는 언제 돌려도 같은 값이다', () => {
  assert.deepEqual(recordScenarios(), recordScenarios());
});

test('필드·방치·던전 진행 결과가 리팩터링 전 스냅샷과 같다', () => {
  const actual = recordScenarios();
  for (const [name] of PARITY_SCENARIOS) {
    assert.deepEqual(actual[name], EXPECTED[name], `${name} 진행 결과가 달라졌다`);
  }
});

test('보스 승패가 세이브에 남기는 층 기록 — 승리는 +1층·재도전 기록 없음, 패배는 재도전 층', () => {
  const actual = recordScenarios();
  const win = actual['field-boss-win'], loss = actual['field-boss-loss'];
  assert.equal(win.bossKills, 1);
  assert.equal(win.floor, 7);
  assert.equal(win.floorKills < 585, true, '보스를 잡아 새 층에서 진행도가 다시 0부터 쌓인다');
  assert.equal(win.bossRetryFloor, 0, '이기고 올라가면 재도전 기록은 지운다');
  assert.equal(loss.bossKills, 0);
  assert.equal(loss.floor, 6, '지면 층은 그대로');
  assert.equal(loss.bossRetryFloor, 6, '`⚔ 보스 도전`이 살아 있는 층을 남긴다');
});
