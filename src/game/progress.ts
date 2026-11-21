/**
 * 진행 규칙 단일 창구 (PR-3, 작업 262).
 *
 * 예전에는 같은 규칙이 네다섯 벌로 나뉘어 있었다:
 *  · `world.ts` — 필드 `kill()`의 금화·경험치, 보스 승패의 층 진행, `update()`의 플레이 시간
 *  · `offline.ts` — `applyOfflineRewards`의 hunt/beatBoss가 같은 식을 **손으로 옮겨 적은** 사본
 *  · `dungeonRewards.ts` — 던전 클리어 정산의 킬 금화(`3 + 층`·`70 × 층`)
 *  · `server/save-guard.mjs` — 서버 상한 계산이 층 목표·경험치 곡선·금화 식을 근사한 사본
 * 그래서 밸런스 수치 하나를 바꾸면 3~4곳을 동시에 고쳐야 했고, 한 곳을 빠뜨리면 오프라인 보상이
 * 어긋나거나 서버가 정상 보상을 잘라냈다.
 *
 * 이 파일은 **의존이 없는 순수 모듈**이다(다른 게임 모듈을 import하지 않는다). 서버(`server/`)가
 * 그대로 import할 수 있어야 하고, 번들에 렌더·UI가 딸려 들어오면 안 되기 때문이다. 세이브는
 * 구조만 맞으면 되므로 아래 `ProgressSave` 타입을 쓴다(`store.ts`의 `Save`가 그대로 들어온다).
 *
 * **밸런스 수치는 한 자리도 바꾸지 않았다.** 리팩터링 전후로 `tests/progress-parity.test.mjs`의
 * 스냅샷(필드 60초·방치 12시간·던전 1판·던전 정산)이 같은 값이어야 한다.
 */

/** 메인 사냥의 마지막 층(작업 204). 20층 위로는 열리지 않으며, 상한이 풀릴 때 이 값만 올린다. */
export const MAX_FLOOR = 20;
export const MAX_LEVEL = 30;

/** 일반 몹 한 마리의 금화 = `3 + 층`. 정예·보스는 아래 배율을 곱한다. */
export const KILL_GOLD_BASE = 3;
/** 일반 몹 한 마리의 경험치 = `9 + 층`(작업 207, 사용자 확정). 정예 2배·보스 6배. */
export const KILL_EXP_BASE = 9;
/** 층 보스의 금화 = `70 × 층`(작업 195·207). */
export const BOSS_GOLD_PER_FLOOR = 70;
/** 층 보스의 경험치 배율 — 일반의 6배. */
export const BOSS_EXP_SCALE = 6;
/** 정예 몹의 금화·경험치 배율(작업 206) — 드롭률은 일반과 같다. */
export const ELITE_REWARD_SCALE = 2;
/** 쓰러졌을 때 잃는 금화(작업 245) — 모자라면 0까지만. */
export const DEFEAT_GOLD_LOSS = 10;
/** 던전 한 층에서 사냥하는 몹 수 — 클리어 정산 금화가 `7 × (3 + 층)`인 근거다. */
export const DUNGEON_KILLS_PER_FLOOR = 7;

/** 진행 규칙이 읽고 쓰는 세이브 필드만 적은 구조 — `store.ts`의 `Save`가 그대로 맞는다. */
export type ProgressSave = {
  gold: number; exp: number; level: number; health: number;
  floor: number; maxFloor: number; floorKills: number;
  kills: number; bossKills: number; playSeconds: number;
  bossRetryFloor?: number;
};

export type KillOptions = {
  /** 보상을 계산할 층 — 비우면 `save.floor`. */
  floor?: number;
  boss?: boolean;
  elite?: boolean;
};

/** 그 층에서 보스가 나오기까지 잡아야 하는 몬스터 수(작업 204). 1층 150마리 → 20층 3,505마리. */
export function killsToBoss(floor: number): number {
  const depth = Math.max(0, floor - 1);
  return 150 + 55 * depth + Math.round(Math.pow(depth, 2) * 6.4);
}

/** 다음 레벨까지 필요한 경험치(작업 207, `1400 × level²`). */
export function expToNext(level: number): number { return Math.round(1400 * Math.pow(level, 2)); }

/** 한 마리 처치가 주는 금화·경험치 — 아직 세이브에 넣지 않는 순수 계산. */
export function killReward(save: Pick<ProgressSave, 'floor'>, options: KillOptions = {}): { gold: number; exp: number } {
  const floor = options.floor ?? save.floor;
  // 정예는 금화·경험치 2배, 장비·스킬북 드롭률은 일반 몹과 같은 1배다(작업 206).
  if (options.boss) return { gold: BOSS_GOLD_PER_FLOOR * floor, exp: (KILL_EXP_BASE + floor) * BOSS_EXP_SCALE };
  const scale = options.elite ? ELITE_REWARD_SCALE : 1;
  return { gold: (KILL_GOLD_BASE + floor) * scale, exp: (KILL_EXP_BASE + floor) * scale };
}

/** 한 마리 처치의 금화만 — 드霤·경험치 없이 금화 금액만 필요한 곳(던전 정산)이 쓴다. */
export function killGold(floor: number, options: { boss?: boolean; elite?: boolean } = {}): number {
  return killReward({ floor }, options).gold;
}

/**
 * 경험치를 넣고 레벨업을 처리한다 — `store.ts`의 `addExperience`가 이 함수를 부른다.
 * 체력 갱신(`save.health = totalStats(save).health`)은 최대 체력을 아는 쪽(store)이 맡는다.
 */
export function gainExperience(save: Pick<ProgressSave, 'exp' | 'level'>, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0 || save.level >= MAX_LEVEL) return 0;
  save.exp += amount;
  let gained = 0;
  while (save.level < MAX_LEVEL && save.exp >= expToNext(save.level)) {
    save.exp -= expToNext(save.level);
    save.level++;
    gained++;
  }
  if (save.level >= MAX_LEVEL) save.exp = 0;
  return gained;
}

/**
 * 필드 한 마리 처치를 세이브에 적는다 — 처치 수·보스 수·금화·경험치(레벨업 포함).
 * 드롭·연출·스폰은 화면(`world.ts`)이 맡는다.
 */
export function applyKillReward(save: ProgressSave, options: KillOptions = {}): { gold: number; exp: number; levels: number } {
  const reward = killReward(save, options);
  save.kills += 1;
  if (options.boss) save.bossKills += 1;
  save.gold += reward.gold;
  const levels = gainExperience(save, reward.exp);
  return { ...reward, levels };
}

/** 방치 정산 — 그 층에서 `count`마리를 한꺼번에 잡은 것으로 친다(금화·경험치는 선형이라 한 번에 곱한다). */
export function applyKillBatch(save: ProgressSave, floor: number, count: number): { kills: number; gold: number; exp: number; levels: number } {
  const kills = Math.max(0, Math.floor(count));
  if (!kills) return { kills: 0, gold: 0, exp: 0, levels: 0 };
  const unit = killReward(save, { floor });
  save.kills += kills;
  save.gold += unit.gold * kills;
  const exp = unit.exp * kills;
  const levels = gainExperience(save, exp);
  return { kills, gold: unit.gold * kills, exp, levels };
}

/**
 * 층 보스 처치의 보상. `countsKill`은 필드만 참이다 — 방치는 보스 처치를 `kills`에 세지 않는다
 * (일일·주간 `몬스터 처치` 미션 카운터가 바뀌지 않게 기존 동작을 그대로 둔다).
 */
export function applyBossReward(save: ProgressSave, floor: number, countsKill = false): { gold: number; exp: number; levels: number } {
  const reward = killReward(save, { floor, boss: true });
  if (countsKill) save.kills += 1;
  save.bossKills += 1;
  save.gold += reward.gold;
  const levels = gainExperience(save, reward.exp);
  return { ...reward, levels };
}

/**
 * 보스를 이겼을 때의 층 진행.
 * `climb`(자동 등반)이 켜져 있으면 한 층 올라가고 최고 도달 층을 갱신하며 재도전 기록을 지운다.
 * 마지막 층(`MAX_FLOOR`)에서는 이겨도 층이 오르지 않고 그 층에서 계속 사냥한다(작업 204).
 * 자동 등반이 꺼져 있으면 그 층에 머물며 `⚔ 보스 도전`을 다시 띄운다(작업 222).
 */
export function afterBossWin(save: ProgressSave, options: { climb?: boolean } = {}): { capped: boolean; floor: number; climbed: boolean; retryFloor: number } {
  const floor = save.floor;
  save.floorKills = 0;
  if (options.climb === false) {
    const retryFloor = floor < MAX_FLOOR ? floor : 0;
    save.bossRetryFloor = retryFloor;
    return { capped: false, floor, climbed: false, retryFloor };
  }
  save.bossRetryFloor = 0;
  const capped = floor >= MAX_FLOOR;
  if (!capped) {
    save.floor = floor + 1;
    save.maxFloor = Math.min(MAX_FLOOR, Math.max(save.maxFloor, save.floor));
  }
  return { capped, floor: save.floor, climbed: !capped, retryFloor: 0 };
}

/**
 * 보스에게 졌을 때의 진행 — 1마리부터 다시 잡고, 진 층을 세이브에 남겨 `⚔ 보스 도전`이 살아 있게 한다
 * (작업 223). 마지막 층에는 올라갈 다음 층이 없으므로 재도전 층을 비운다(화면 판정도 `maxFloor < MAX_FLOOR`).
 */
export function afterBossLose(save: ProgressSave): { floor: number; retryFloor: number } {
  save.floorKills = 0;
  return recordBossLoss(save);
}

/**
 * 진 층만 남긴다 — 자동 등반이 꺼진 채 보스에게 진 경우다(작업 222). 진행도(`floorKills`)는 그대로 두고
 * `⚔ 보스 도전`만 살린다.
 */
export function recordBossLoss(save: ProgressSave): { floor: number; retryFloor: number } {
  const floor = save.floor;
  const retryFloor = floor < MAX_FLOOR ? floor : 0;
  save.bossRetryFloor = retryFloor;
  return { floor, retryFloor };
}

/**
 * 보스가 없는 아래층에서 목표 마릿수를 채웠을 때(작업 245).
 * 자동 등반이 켜져 있으면 한 층 올라가고, 꺼져 있으면(강등 직후 등) 그 층에서 진행도만 0으로 돌린다.
 */
export function afterFloorClear(save: ProgressSave, options: { climb?: boolean } = {}): { floor: number; climbed: boolean } {
  save.floorKills = 0;
  if (options.climb !== true) return { floor: save.floor, climbed: false };
  save.floor += 1;
  return { floor: save.floor, climbed: true };
}

/** 쓰러졌을 때 잃는 금화 — 모자라면 가진 만큼만(0 아래로 가지 않는다). */
export function defeatPenalty(save: Pick<ProgressSave, 'gold'>): number {
  const before = save.gold;
  save.gold = Math.max(0, save.gold - DEFEAT_GOLD_LOSS);
  return before - save.gold;
}

/** 접속 중 플레이 시간 누적 — 화면 프레임 시간이 음수·비정상이어도 늘지 않게 0에서 자른다. */
export function recordPlaySeconds(save: Pick<ProgressSave, 'playSeconds'>, dt: number): void {
  save.playSeconds += Math.max(0, dt);
}
