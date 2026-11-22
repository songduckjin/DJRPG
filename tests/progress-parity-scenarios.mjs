/**
 * 진행 규칙 스냅샷 시나리오 (PR-3, 작업 261).
 *
 * `src/game/progress.ts`로 진행 규칙을 뽑아내기 **전에** 이 시나리오로 네 가지 진행 경로
 * (필드 사냥 60초·방치 12시간·던전 1판·던전 클리어 정산)를 고정 세이브·고정 시드로 돌려 값을 기록하고,
 * `tests/progress-parity.test.mjs`가 리팩터링 전후에 **같은 값**이 나오는지 대조한다.
 * 밸런스 수치를 한 자리도 바꾸지 않는 것이 이 작업의 조건이므로, 이 스냅샷이 유일한 안전망이다.
 *
 * 시나리오는 PR-2B(전투 코어 분리)에서도 그대로 쓸 수 있게 세이브를 만드는 함수와 실행을 나눠 둔다.
 */
import { freshSave } from '../src/game/store.ts';
import { seededRandom, withRandom } from '../src/game/rng.ts';
import { World } from '../src/game/world.ts';
import { applyOfflineRewards } from '../src/game/offline.ts';
import { claimDungeonRewards } from '../src/game/dungeonRewards.ts';
import { dungeonBattleSummary, runDungeonBattle } from '../src/game/dungeon/battle.ts';

/** 모든 시나리오가 같은 시드를 쓴다 — 실패했을 때 어느 굴림이 달라졌는지 다시 짚을 수 있게. */
export const PARITY_SEED = 20261121;

/** 스냅샷에 남기는 진행 필드 — 이 목록 밖의 값(연출·좌표)은 대조하지 않는다. */
export const PROGRESS_FIELDS = ['gold', 'exp', 'level', 'floor', 'maxFloor', 'floorKills', 'kills', 'bossKills', 'playSeconds', 'stones', 'salvageCount', 'tutorial', 'health', 'dungeonFloor'];

export function progressOf(save) {
  const out = {};
  for (const field of PROGRESS_FIELDS) out[field] = save[field];
  if (save.bossRetryFloor !== undefined) out.bossRetryFloor = save.bossRetryFloor;
  out.bag = save.bag.length;
  return out;
}

/**
 * 시나리오용 세이브 — 튜토리얼은 끝났고, 무기 하나를 들고 6층에서 사냥 중이다.
 * `attack`이 곧 그 세이브의 전투력이라, 같은 시드에서도 강한 세이브는 보스를 잡고 약한 세이브는 진다.
 */
export function heroSave({ attack = 90, level = 7, exp = 400, health = 300, floorKills = 200 } = {}) {
  const save = freshSave();
  save.tutorial = 3;
  save.level = level;
  save.exp = exp;
  save.gold = 900;
  save.floor = 6;
  save.maxFloor = 6;
  save.floorKills = floorKills;
  save.health = health;
  save.stones = 3;
  save.equipment = { weapon: { id: 'parity-weapon', name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack } } };
  return save;
}

/** ① 필드 사냥 60초 — `World.update(1/60)` 3,600스텝. 공격은 화면의 자동 사냥과 같이 매 프레임 시도한다. */
export function fieldScenario(options = {}, seconds = 60) {
  const save = heroSave(options);
  const world = new World(save);
  world.attackHeld = true;
  const steps = Math.round(seconds * 60);
  withRandom(seededRandom(PARITY_SEED), () => {
    for (let step = 0; step < steps; step++) world.update(1 / 60);
  });
  return progressOf(save);
}

/** ② 방치 정산 12시간 — 드롭은 `Math.random`을 쓰므로 시드 난수로 바꿔 끼운다(끝나면 되돌린다). */
export function offlineScenario({ attack = 400, level = 15, health = 600 } = {}, seconds = 43_200) {
  const save = freshSave();
  save.tutorial = 3;
  save.level = level;
  save.exp = 0;
  save.gold = 5000;
  save.floor = 8;
  save.maxFloor = 10;
  save.floorKills = 300;
  save.stones = 12;
  save.health = health;
  save.autoClimb = true;
  save.equipment = { weapon: { id: 'parity-weapon', name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack } } };
  const original = Math.random;
  Math.random = seededRandom(PARITY_SEED);
  try {
    const reward = applyOfflineRewards(save, seconds);
    return {
      progress: progressOf(save),
      reward: {
        seconds: reward.seconds, kills: reward.kills, exp: reward.exp, gold: reward.gold, levels: reward.levels,
        startFloor: reward.startFloor, endFloor: reward.endFloor, bossKills: reward.bossKills, deaths: reward.deaths,
        items: reward.items.length, missedDrops: reward.missedDrops, salvaged: reward.salvaged
      }
    };
  } finally { Math.random = original; }
}

/** ③ 던전 1판 — 서버 리플레이와 같은 고정 스텝으로 끝까지 돌린다. 세이브는 사본이라 그대로다. */
export function dungeonScenario(floor, options = {}) {
  const save = heroSave(options);
  const battle = runDungeonBattle(save, floor, PARITY_SEED);
  return {
    summary: dungeonBattleSummary(battle),
    progress: progressOf(battle.world.save),
    slain: battle.world.slain,
    lootGold: battle.world.lootGold,
    lootItems: battle.world.loot.filter(entry => entry.kind === 'item').length
  };
}

/** ④ 던전 클리어 정산 — 그 층이 바닥에 남긴 금화·아이템·강화석을 계정 세이브로 옮긴다. */
export function dungeonClaimScenario(floor, options = {}) {
  const save = heroSave(options);
  save.dungeonFloor = Math.max(0, floor - 1);
  const battle = runDungeonBattle(save, floor, PARITY_SEED);
  const loot = battle.clearRewards();
  if (!loot) return { cleared: false, progress: progressOf(save) };
  const receipt = claimDungeonRewards(save, floor, loot);
  return { cleared: true, receipt: { ...receipt, items: receipt.items.length }, progress: progressOf(save) };
}

/** 이 파일 하나로 기록·대조하는 전체 순서 — 테스트가 이 목록을 그대로 스냅샷과 맞춘다. */
export const PARITY_SCENARIOS = [
  ['field-boss-win', () => fieldScenario({ attack: 200, level: 10, floorKills: 575 })],
  ['field-boss-loss', () => fieldScenario({ attack: 90, level: 7, floorKills: 575 })],
  ['offline-12h', () => offlineScenario()],
  ['dungeon-1-clear', () => dungeonScenario(1, { attack: 120, level: 10, health: 400 })],
  ['dungeon-5-boss-clear', () => dungeonScenario(5, { attack: 1500, level: 25, health: 900 })],
  ['dungeon-5-boss-death', () => dungeonScenario(5, { attack: 120, level: 10, health: 400 })],
  ['dungeon-5-claim', () => dungeonClaimScenario(5, { attack: 1500, level: 25, health: 900 })]
];

export function recordScenarios() {
  const out = {};
  for (const [name, run] of PARITY_SCENARIOS) out[name] = run();
  return out;
}
