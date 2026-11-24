/**
 * 진행 규칙 패리티 (PR-3, 작업 261).
 *
 * `src/game/progress.ts`로 진행 규칙(킬 보상·보스 승패·층 진행·플레이 시간)을 뽑아내기 전에
 * **origin/main(9829aea)의 코드로** 아래 시나리오를 돌려 값을 그대로 적어 두었다.
 * 리팩터링은 이 값을 한 자리도 바꾸지 않아야 한다 — 밸런스 수치 불변이 그 작업의 조건이었다.
 * 밸런스 v2는 **의도적으로** 진행 수치를 바꾸므로, 이 표를 v2 값으로 갱신했다(사유: 층 목표 150+30d+d²,
 * 필드 보상 계수 0.70→0.35, 몹/보스 HP 곡선, 방치 70% 효율). 이후의 변경은 다시 이 표를 기준으로 대조한다.
 *
 * 시나리오 정의: `tests/progress-parity-scenarios.mjs`
 *  · 필드 60초(보스 승리·보스 패배)
 *  · 방치 정산 12시간(자동 등반으로 8층 → 16층, 보스 6회 처치)
 *  · 던전 1층 클리어·5층 보스 클리어·5층 보스 패배
 *  · 던전 5층 클리어 보상 정산(금화·강화석·아이템)
 *
 * 값이 달라지면 밸런스가 움직였다는 뜻이다. 의도한 밸런스 변경이라면 이 표를 고치기 전에
 * 그 변경이 왜 진행 규칙을 바꾸는지 먼저 확인한다(PR 본문의 "동작 동일 대조표"에 적는다).
 *
 * **2026-11-24 방치 사냥 개선**으로 아래 세 시나리오가 바뀌었다(의도한 변경):
 *  · 접속 사냥에 부활 대기 5초(1~4층 0초) — 필드 60초 시나리오는 죽으면 그만큼 못 싸워 처치 수·체력이 줄고,
 *    마지막에 쓰러진 채 끝나는 판은 `health: 0`(부활 대기 중)이다.
 *  · 방치 정산에 생존 가동률 — 체력·방어·회피·피흡·회복이 낮은 이 시험 세이브(방어 17·체력 600)는
 *    15층에서 자주 쓰러져 처치 수가 절반 아래로 떨어진다(약한 스펙일수록 더 떨어지는 것이 이 작업의 요지다).
 *  · 마리당 금화·경험지의 층 보상 배율(`안 A`) — 깊은 층일수록 마리당 보상이 커진다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
// 기념 종일 버프(2026-11-22 공·방·체 +30%)를 끈 시각으로 시계를 고정한다 — 밸런스 스냅샷이 흔들리지 않게.
import './patch-buff-off.mjs';

const { PARITY_SCENARIOS, recordScenarios } = await import('./progress-parity-scenarios.mjs');

const EXPECTED = {
  // 파트 B(2026-11-22): 스킬북 폐지로 드롭 구성이 바뀌고, 영구 스탯북 확률 굴림이 난수 스트림에 한 번 더
  // 들어간다 — 같은 시드의 진행 결과가 그만큼 달라진다(그 차이가 아래 값이다).
  // 아이템 드롭 B안(2026-11-23, 덕진 님 확정): 네 지점 드롭률을 1/10로 내렸다. 드롭 성공 횟수가
  // 바뀌면 같은 시드라도 그 뒤의 난수 순서가 달라져(드롭 1건마다 등급·강화·추가옵션을 더 굴린다)
  // 전투 중 판정이 갈리고, 자동 장착되는 장비도 달라진다 — 그래서 60초 시나리오의 처치 수·체력·가방이
  // 조금씩 다르다. 층·금화 식은 그대로다. 방치 12시간은 아이템 40 → 26개, 놓친 몫 253 → 0.
  'field-boss-win': {
    gold: 1702, exp: 1160, level: 10, floor: 7, maxFloor: 7, floorKills: 65, kills: 66, bossKills: 1,
    playSeconds: 59.999999999997875, stones: 3, salvageCount: 0, tutorial: 3, health: 98,
    dungeonFloor: 0, bossRetryFloor: 0, bag: 0
  },
  'field-boss-loss': {
    gold: 1252, exp: 1020, level: 7, floor: 6, maxFloor: 6, floorKills: 61, kills: 61, bossKills: 0,
    playSeconds: 59.999999999997875, stones: 3, salvageCount: 0, tutorial: 3, health: 30,
    dungeonFloor: 0, bossRetryFloor: 6, bag: 0
  },
  'offline-12h': {
    progress: {
      // 주머니 스택형: 같은 종류의 영구 스탯북은 한 칸에 쌓이므로 한 번에 40칸이 차면 가방이 멈춘다.
      // 아이템 드롭 B안(2026-11-23): 접속·방치 드롭률이 1/10이 되어 12시간 방치 아이템이 40 → **26개**이고,
      // 가방 40칸이 차지 않아 놓친 몫은 **0**이다(직전 253). 층·금화·경험치·생존 수치는 그대로다.
      gold: 875260, exp: 80971, level: 18, floor: 15, maxFloor: 15, floorKills: 408, kills: 96672, bossKills: 5,
      playSeconds: 0, stones: 12, salvageCount: 0, tutorial: 3, health: 344, dungeonFloor: 0, bossRetryFloor: 15, bag: 26
    },
    reward: {
      seconds: 43200, kills: 96672, exp: 1158971, gold: 871470, levels: 3, startFloor: 8, endFloor: 15,
      bossKills: 5, deaths: 121, items: 26, missedDrops: 0, salvaged: { count: 0, gold: 0, stones: 0 }
    }
  },
  'dungeon-1-clear': {
    summary: { won: true, steps: 198, seconds: 3.3, heroHp: 214, heroHpMax: 248, enemyHp: 0, slain: 7, digest: 'e8530315' },
    progress: {
      gold: 900, exp: 400, level: 10, floor: 1, maxFloor: 6, floorKills: 0, kills: 0, bossKills: 0,
      playSeconds: 3.299999999999993, stones: 3, salvageCount: 0, tutorial: 3, health: 214,
      dungeonFloor: 0, bossRetryFloor: 0, bag: 0
    },
    slain: 7, lootGold: 28, lootItems: 0
  },
  'dungeon-5-boss-clear': {
    summary: { won: true, steps: 87, seconds: 1.4, heroHp: 64, heroHpMax: 428, enemyHp: 0, slain: 1, digest: '8735cda8' },
    progress: {
      gold: 900, exp: 400, level: 25, floor: 5, maxFloor: 6, floorKills: 0, kills: 0, bossKills: 0,
      playSeconds: 1.4499999999999997, stones: 3, salvageCount: 0, tutorial: 3, health: 64,
      dungeonFloor: 0, bossRetryFloor: 0, bag: 0
    },
    slain: 1, lootGold: 350, lootItems: 1
  },
  'dungeon-5-boss-death': {
    summary: { won: false, steps: 82, seconds: 1.4, heroHp: 0, heroHpMax: 248, enemyHp: 6247, slain: 0, digest: '3ad8091c' },
    progress: {
      gold: 900, exp: 400, level: 10, floor: 5, maxFloor: 6, floorKills: 0, kills: 0, bossKills: 0,
      playSeconds: 1.3666666666666667, stones: 3, salvageCount: 0, tutorial: 3, health: 58,
      dungeonFloor: 0, bossRetryFloor: 0, bag: 0
    },
    slain: 0, lootGold: 0, lootItems: 0
  },
  'dungeon-5-claim': {
    cleared: true,
    receipt: { floor: 5, firstClear: true, gold: 350, stones: 35, items: 1, missed: 0, salvaged: { count: 0, gold: 0, stones: 0 } },
    progress: {
      gold: 1250, exp: 400, level: 25, floor: 6, maxFloor: 6, floorKills: 200, kills: 0, bossKills: 0,
      playSeconds: 0, stones: 38, salvageCount: 0, tutorial: 3, health: 900, dungeonFloor: 4,
      bossRetryFloor: 0, bag: 1
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
