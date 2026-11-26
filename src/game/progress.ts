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
 * 이 파일은 **게임 규칙 수치만 담는 순수 모듈**이다(화면·렌더·`src/ui/**`를 import하지 않는다). 서버(`server/`)가
 * 그대로 import할 수 있어야 하고, 번들에 렌더·UI가 딸려 들어오면 안 되기 때문이다. 세이브는
 * 구조만 맞으면 되므로 아래 `ProgressSave` 타입을 쓴다(`store.ts`의 `Save`가 그대로 들어온다).
 *
 * 층간 보상 배율(`안 A`)만 예외로 `battle/formulas.ts`의 몹 HP 곡선을 읽는다 — 배율을 두 벌로
 * 적으면 또 어긋나기 때문이다(2026-11-24).
 *
 * **밸런스 수치는 한 자리도 바꾸지 않았다.** 리팩터링 전후로 `tests/progress-parity.test.mjs`의
 * 스냅샷(필드 60초·방치 12시간·던전 1판·던전 정산)이 같은 값이어야 한다.
 */

import { depthRewardScale, ELITE_REWARD_SCALE } from './battle/formulas.ts';

/**
 * 메인 사냥의 마지막 층.
 *
 * 작업 204에서 20층으로 잠갔고, 21~40층 확장(해골 군주의 성)에서 40으로 올렸다. 층 곡선(처치 목표·
 * 몹·보스 HP·보상·강화 단계)은 원래 21층+를 이미 계산하던 식이라 상한만 올리면 그대로 이어진다.
 * 클라·서버가 이 상수를 함께 읽으므로(`server/save-guard.mjs`) 반드시 동시에 배포한다.
 */
export const MAX_FLOOR = 40;
export const MAX_LEVEL = 30;

/** 일반 몹 한 마리의 금화 = `3 + 층`. 정예·보스는 아래 배율을 곱한다. */
export const KILL_GOLD_BASE = 3;
/** 일반 몹 한 마리의 경험치 = `9 + 층`(작업 207, 사용자 확정). 정예 2배·보스 6배. */
export const KILL_EXP_BASE = 9;
/** 층 보스의 금화 = `70 × 층`(작업 195·207). */
export const BOSS_GOLD_PER_FLOOR = 70;
/** 층 보스의 경험치 배율 — 일반의 6배. */
export const BOSS_EXP_SCALE = 6;
/** 정예 몹의 금화·경험치 배율(작업 206) — 드롭률은 일반과 같다. 값은 `battle/formulas.ts`(정예 HP 배율 옆)에 있다. */
export { ELITE_REWARD_SCALE };
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

/**
 * 층 진행도(`floorKills`)가 0으로 돌아가는 첫 층 — **일반 사냥 사망 초기화가 시작되는 층**.
 *
 * 2026-11-25 덕진 님 확정: 일반·정예 몹에게 쓰러지면 이번 층 진행도가 1마리부터 다시다(접속·방치·자리 비움
 * 모두). 다만 입문 구간(1~4층)은 면제한다 — 부활 대기 면제와 같은 구간이고, 시작 장비로 배우는 자리다.
 */
export const FIELD_DEATH_RESET_FROM = 5;
/** 마지막 층(40층)의 처치 목표 예외 — 5~39층 곡선(최대 68)을 그대로 두면 보스가 20초마다 나와
 *  마지막 층이 보스 반복장이 된다. 마지막 층만 150으로 두어 파밍 층의 리듬을 지킨다(추천 C안 §6.6). */
export const FINAL_FLOOR_KILL_TARGET = 150;

/** 두 층 사이를 직선으로 잇는 구간 보간 — `killsToBoss`의 5~40층 곡선이 이 함수로 만들어진다. */
function goalLine(floor: number, x0: number, y0: number, x1: number, y1: number): number {
  return Math.round(y0 + (y1 - y0) * (floor - x0) / (x1 - x0));
}

/**
 * 그 층에서 보스가 나오기까지 잡아야 하는 몬스터 수.
 *
 * **일반 사냥 사망 시 진행도 초기화(2026-11-25 덕진 님 확정)** 이후에는 "죽기까지 잡는 마릿수"(한 생애 예산)
 * 안에 목표가 들어와야 층을 넘을 수 있다. 그래서 5층부터는 실측한 한 생애 예산에 맞춘 곡선을 쓴다
 * (추천 C안 — 5층 30 → 10층 35 → 20층 40 → 30층 52 → 39층 68, 40층은 150 예외).
 * 1~4층은 초기화 면제 구간이라 예전 곡선 `150 + 30d + d²`(150·181·214·249)을 그대로 둔다.
 * 40층 위(상한 밖)는 같은 기울기로 계속 계산한다 — `floor-cap` 테스트의 외삽 계약이 남아 있다.
 */
export function killsToBoss(floor: number): number {
  const depth = Math.max(0, floor - 1);
  const legacy = 150 + 30 * depth + Math.round(depth * depth);
  if (floor <= FIELD_DEATH_RESET_FROM - 1) return legacy;
  if (floor === MAX_FLOOR) return FINAL_FLOOR_KILL_TARGET;
  if (floor <= 10) return goalLine(floor, 5, 30, 10, 35);
  if (floor <= 20) return goalLine(floor, 10, 35, 20, 40);
  if (floor <= 30) return goalLine(floor, 20, 40, 30, 52);
  return goalLine(floor, 30, 52, MAX_FLOOR, 70);
}

/**
 * 필드 킬 보상 계수(밸런스 v2) — 1층 0.70 → 20층 0.45 → 28층+ 0.35.
 *
 * v2는 목표 생존 수 젠(3/5/7)으로 젠이 1.7~2.4배 빨라진 만큼 마리당 금화·경험치를 같은 비율로 낮춘다.
 * 그래서 어느 층에서도 시간당 수입·가방이 넘치지 않는다. **던전 정산·보스 금화는 대상이 아니다** —
 * 보스는 층당 1회 고정이라 젠과 무관하고, 던전은 필드와 다른 보상표를 쓴다.
 */
export function fieldRewardScale(floor: number): number {
  const depth = Math.max(1, Math.floor(Number.isFinite(floor) ? floor : 1));
  return Math.max(.35, .70 - .013 * (depth - 1));
}

/** 다음 레벨까지 필요한 경험치(작업 207, `1400 × level²`). */
export function expToNext(level: number): number { return Math.round(1400 * Math.pow(level, 2)); }

/** 한 마리 처치가 주는 금화·경험치 — 아직 세이브에 넣지 않는 순수 계산.
 *  `depthRewardScale`(안 A)은 마리당 금화·경험치를 몹 HP에 비례해 올린다 — 필드·방치가 같은 값을 쓴다. */
export function killReward(save: Pick<ProgressSave, 'floor'>, options: KillOptions & { unscaled?: boolean } = {}): { gold: number; exp: number } {
  const floor = options.floor ?? save.floor;
  // 정예는 금화·경험치 2배, 장비·스킬북 드롭률은 일반 몹과 같은 1배다(작업 206).
  if (options.boss) return { gold: BOSS_GOLD_PER_FLOOR * floor, exp: (KILL_EXP_BASE + floor) * BOSS_EXP_SCALE };
  const siege = options.elite ? ELITE_REWARD_SCALE : 1;
  // 필드 보상 계수(밸런스 v2) — 던전 정산(`killGold`)만 `unscaled`로 옛 값을 쓴다.
  const scale = options.unscaled ? 1 : fieldRewardScale(floor) * depthRewardScale(floor);
  return { gold: Math.max(1, Math.round((KILL_GOLD_BASE + floor) * scale)) * siege, exp: Math.max(1, Math.round((KILL_EXP_BASE + floor) * scale)) * siege };
}

/** 한 마리 처치의 금화만 — 던전 정산이 쓴다. 던전 보상에는 필드 계수(밸런스 v2)를 곱하지 않는다. */
export function killGold(floor: number, options: { boss?: boolean; elite?: boolean } = {}): number {
  return killReward({ floor }, { ...options, unscaled: true }).gold;
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
 * 필드에서 **일반·정예 몹**에게 쓰러졌을 때의 층 진행(2026-11-25 덕진 님 확정) — 이번 층은 1마리부터 다시.
 *
 * 보스 패배(`afterBossLose`)와 달리 재도전 층(`bossRetryFloor`)은 건드리지 않는다 — `⚔ 보스 도전`은
 * 그대로 살아 있고, 이미 그 층 보스를 만난 기록이 있으면 버튼으로 바로 재도전할 수 있다(작업 222·223 유지).
 * 입문 1~4층(`FIELD_DEATH_RESET_FROM` 미만)은 면제 — 부활 대기가 0초인 구간과 같다.
 *
 * `reset`은 이번 사망으로 실제로 진행도가 사라졌는지다 — 화면이 `이번 층은 1마리부터 다시 잡습니다`를
 * 띄울지 정하는 데 쓴다(진행도가 이미 0이면 새로 사라진 것이 없다).
 */
export function afterFieldDeath(save: ProgressSave): { reset: boolean } {
  if (save.floor < FIELD_DEATH_RESET_FROM) return { reset: false };
  const reset = save.floorKills > 0;
  save.floorKills = 0;
  return { reset };
}

/**
 * 보스가 없는 아래층에서 목표 마릿수를 채웠을 때(작업 245).
 * 자동 등반이 켜져 있으면 한 층 올라가고, 꺼져 있으면(강등 직후 등) 그 층에서 진행도만 0으로 돌린다.
 */
export function afterFloorClear(save: ProgressSave, options: { climb?: boolean } = {}): { floor: number; climbed: boolean } {
  save.floorKills = 0;
  if (options.climb !== true) return { floor: save.floor, climbed: false };
  // 마지막 층 위로는 오르지 않는다(호출부가 아래층에서만 부르지만 방어적으로 상한을 건다).
  if (save.floor >= MAX_FLOOR) return { floor: save.floor, climbed: false };
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
