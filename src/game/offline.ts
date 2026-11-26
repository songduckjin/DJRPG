import { addItemToBag } from './rewardGrant';
import { autoSalvageRecovered } from './inventory';
import { offlineDropChance, rollItem, totalStats, type Item, type Rarity } from './items';
import { rollStatBookDrop } from './statBooks';
import { jobOrDefault as jobOf, skillDamageScale, skillDuration, skills, SKILL_HIT_POWER, type SkillId } from './skills';
import { skillLevel, type Save } from './store';
import { afterBossLose, afterBossWin, applyBossReward, applyKillBatch, defeatPenalty, FIELD_DEATH_RESET_FROM, killsToBoss, MAX_FLOOR } from './progress';
import { basicAttackPower, berserkAttackScale, berserkSpeedScale, CRIT_CHANCE_CAP, attackInterval, critDamageScale, enemyHitDamage, enemyMaxHp, fieldSpawnRate, swarmCount } from './battle/formulas';
import { effectiveExtraOptions, EXTRA_LIFESTEAL_SECOND_CAP, EXTRA_REGEN_SECONDS } from './extraOptions';
import { EARLY_REGEN_FLOOR, EARLY_REGEN_PER_SECOND, reviveSeconds, SKILL_CDR_CAP } from './combat/engine';
import { skillCastScale } from './loadout';

/**
 * 오프라인 방치 정산(작업 235).
 *
 * 덕진 님 확정 원칙: **켜 놓고 보는 사람과 방치하는 사람이 똑같아야 한다** — 자동 등반이 켜져 있고
 * 최고 도달 층에 있으면, 목표 처치 수를 채웠을 때 보스 도전 버튼을 누르지 않아도 보스전이 열리고,
 * 내 스펙으로 그 보스를 잡을 수 있으면 다음 층으로 올라가 남은 시간을 새 층에서 계속 사냥한다.
 * 규칙은 `src/game/world.ts`의 `kill()`·`update()`와 같다:
 *  · 보스는 **최고 도달 층에서만** 나오고(`bossFloor()`), 아래층 반복 사냥에는 나오지 않는다.
 *  · 보스를 이기면 `bossKills +1`·보스 금화·경험치·드롭을 받고 `floor+1`·`maxFloor` 갱신·`floorKills=0`.
 *  · 지면 10골드를 잃고 `floorKills=0`으로 돌아가 1마리부터 다시 잡는다(`autoClimb`는 켜 둔 채).
 *  · **일반·정예 몹에게 죽어도 5층부터는 `floorKills=0`**(2026-11-25 덕진 님 확정) — 접속 사냥의
 *    `heroDown`과 같은 규칙이다. 방치는 사망이 개별 사건이 아니라 비율이라 "마지막 사망 이후 몫"만
 *    남긴다(A안): 사망은 `버티는 초 + 부활 대기` 주기로 규칙적으로 일어난다고 보고, 그 주기 위상을
 *    `deathClock`에 세어 청크 경계를 넘어도 이어진다. 사망이 있던 청크는 보스전을 열지 않는다.
 *  · 마지막 층(`MAX_FLOOR`)에서는 이겨도 층이 오르지 않고 그 층에서 보스를 계속 잡는다.
 */
export type OfflineReward = {
  seconds: number; kills: number; exp: number; gold: number; items: Item[]; missedDrops: number; levels: number;
  /** 서버 저장에서 상한 조정이 있었다면 계산 전 수치 대신 확정된 아이템만 표시한다. */
  adjusted?: boolean;
  /** 정산 전후 층 — `5층 → 8층 돌파!`를 보여 준다(작업 235). */
  startFloor: number; endFloor: number;
  /** 오프라인 동안 잡은 층 보스 수(작업 235). */
  bossKills: number;
  /** 보스에게 진 횟수(작업 235) — 층이 멈춘 이유를 보여 준다. */
  deaths: number;
  /** 사냥 중 일반·정예 몹에게 쓰러진 횟수(2026-11-24) — 접속과 같은 10골드씩 잃었다. */
  fieldDeaths: number;
  /** 그 사망으로 5층부터의 층 진행도가 1마리부터 다시가 된 횟수(2026-11-25) — 정산서가 이유를 말한다. */
  progressResets: number;
  /** 방치 중 자동 분해가 가져간 장비의 환산량 (작업 254) — 가방에 들어가지 않고 금화·강화석이 됐다. */
  salvaged: { count: number; gold: number; stones: number };
};

/** 방치 정산에 넘기는 자동 분해 설정 (작업 254). 없으면 예전처럼 떨어진 것을 모두 가방으로 넣는다. */
export type OfflineRewardOptions = {
  /** 자동 분해할 최고 등급 — 켜져 있지 않으면 `undefined`. */
  autoSalvage?: Exclude<Rarity, 'legendary'>;
  /** 41층부터 쓰는 `+N까지` 상한(작업 203) — 방치도 접속과 같은 값을 쓴다. */
  autoSalvagePlus?: number;
};

/** 적이 한 번 때린 뒤 다음 타격까지의 시간 — `world.ts`는 맞은 뒤 `player.hit = .85`로 막는다. */
export const BOSS_HIT_INTERVAL = .85;
/** 보스가 필드 외곽에서 걸어 들어오는 동안은 맞기만 한다(`world.ts` 스폰 거리 · 이동 28px/s). */
export const BOSS_APPROACH_SECONDS = 2;
/** 아슬아슬한 승부는 이긴 것으로 치지 않는다 — 오프라인은 한 번의 잘못된 승리를 되돌릴 수 없다. */
export const BOSS_SAFETY_MARGIN = .9;

/**
 * 스킬 한 번의 위력(공격력 배수) — `skills.ts` `SKILL_HIT_POWER`가 단일 표다(2026-11-24).
 * 한 마리(보스)에게 들어가는 몫만 센다: 멀티 샷·폭풍 연사는 여러 발 중 한 발, 애로우 레인은
 * 한 번 시전이 한 마리에게 넣는 합계(`skillCastScale`)다. 버프(블러드 레이지·호크아이·아케인 실드)는
 * 위력이 없으므로 0이며 아래에서 배율로 따로 본다.
 */
/** 공격력·공격속도를 올리는 버프 3종 — 지속/쿨타임 비율만큼 DPS를 끌어올린다. */
const buffSkills: SkillId[] = ['warcry', 'hawkEye', 'arcaneShield'];

/** 지금 스펙으로 보스에게 넣는 초당 피해 — 평타(직업 기본 간격·공속·6.0타 상한·치명) + 퀵슬롯 스킬(CDR 반영) + 버프 가동률.
 *  밸런스 v2부터 필드와 **같은 식**이다(종전에는 치명·공속 상한·CDR을 무시해 필드의 66~80%였다).
 *  치명타 배수도 필드와 같은 `critDamageScale`이다(기본 1.8배 + 장비 `치명타 피해량`, 백로그 2번). */
export function offlineHeroDps(save: Save): number {
  const stats = totalStats(save);
  const critDamage = critDamageScale(effectiveExtraOptions(save.equipment).critDmgPct);
  const critFactor = 1 + Math.min(CRIT_CHANCE_CAP, Math.max(0, stats.crit)) / 100 * (critDamage - 1);
  const cdrScale = 1 - Math.min(SKILL_CDR_CAP, Math.max(0, stats.cdr)) / 100;
  let skill = 0;
  for (const id of save.quickSlots) {
    if (!id || !save.learned.includes(id)) continue;
    const level = skillLevel(save, id);
    const burst = id === 'arrowRain' || id === 'iceBolt' ? skillCastScale(id, level) : SKILL_HIT_POWER[id];
    if (burst) skill += stats.attack * burst * skillDamageScale(level)
      * (id === 'snipe' ? critDamage : 1) / (skills[id].cooldown * cdrScale);
  }
  const buffId = buffSkills.find(id => save.learned.includes(id) && save.quickSlots.includes(id));
  if (!buffId) return stats.attack * basicAttackPower * critFactor / attackInterval(jobOf(save), stats.speed) + skill;
  const level = skillLevel(save, buffId);
  const speedUp = berserkSpeedScale(level), attackUp = berserkAttackScale(level);
  const uptime = Math.min(1, skillDuration(buffId, level) / (skills[buffId].cooldown * cdrScale));
  const base = stats.attack * basicAttackPower * critFactor / attackInterval(jobOf(save), stats.speed) + skill;
  const peak = stats.attack * attackUp * basicAttackPower * critFactor / attackInterval(jobOf(save), stats.speed, speedUp) + skill * attackUp;
  return base * (1 - uptime) + peak * uptime;
}
/** 방치 효율 — 접속 사냥의 70%(밸런스 v2 시뮬레이션 값). */
export const OFFLINE_EFFICIENCY = .7;

/**
 * 그 층에서 1초에 입는 피해 — 필드 `tickEnemies`와 같은 식(2026-11-24).
 *
 * 한 번 맞으면 0.85초 동안 다시 맞지 않고(`p.hit = .85`), 그 창에서 `swarmCount(층)`마리가 함께 때린다.
 * 1타 위력은 `enemyHitDamage`가 이미 군집 배율을 빼고 계산한 값이므로 여기서는 군집 수만 곱한다.
 * 회피는 맞을 순간 굴리는 확률이라 기대값으로 곱해 뺀다.
 */
export function offlineDamagePerSecond(save: Save, floor = save.floor): number {
  const stats = totalStats(save);
  const evasion = effectiveExtraOptions(save.equipment).evasionPct;
  return enemyHitDamage(floor, false, stats.defense) * swarmCount(floor) / BOSS_HIT_INTERVAL * (1 - Math.max(0, Math.min(100, evasion)) / 100);
}

/**
 * 그 층에서 1초에 회복하는 체력 — 피흡(초당 최대 체력 2.5% 상한) + 체력회복(%/5초) + 입문 1~4층 자연회복 1%/초.
 *
 * 피흡은 **가한 피해**에 비례하므로 `dps`를 받는다(보스전은 보스에게 넣는 DPS).
 */
export function offlineHealPerSecond(save: Save, floor = save.floor, dps = offlineHeroDps(save)): number {
  const stats = totalStats(save);
  const extras = effectiveExtraOptions(save.equipment);
  const lifesteal = Math.min(dps * extras.lifestealPct / 100, stats.health * EXTRA_LIFESTEAL_SECOND_CAP);
  const regen = stats.health * extras.regenPct / 100 / EXTRA_REGEN_SECONDS
    + (floor <= EARLY_REGEN_FLOOR ? stats.health * EARLY_REGEN_PER_SECOND : 0);
  return lifesteal + regen;
}

/** 쓰러지기까지 버티는 초 — 회복이 피해보다 크면 `Infinity`(그 층에서는 죽지 않는다). */
export function offlineSurviveSeconds(save: Save, floor = save.floor): number {
  const net = offlineDamagePerSecond(save, floor) - offlineHealPerSecond(save, floor);
  return net > 0 ? totalStats(save).health / net : Infinity;
}

/**
 * 생존 가동률 0~1 — 부활 대기(`reviveSeconds`)만큼은 사냥을 못 한다.
 * 접속 사냥과 **같은 값**을 쓴다(5초, 입문 1~4층은 0초라 가동률 1).
 */
export function offlineSurvivalUptime(save: Save, floor = save.floor): number {
  const survive = offlineSurviveSeconds(save, floor);
  if (!Number.isFinite(survive)) return 1;
  const wait = reviveSeconds(floor);
  return wait > 0 ? survive / (survive + wait) : 1;
}

/** 시간당 쓰러지는 횟수 — 접속과 같은 `버티는 초 + 부활 대기` 주기로 센다. */
export function offlineDeathsPerHour(save: Save, floor = save.floor): number {
  const survive = offlineSurviveSeconds(save, floor);
  return Number.isFinite(survive) ? 3600 / (survive + reviveSeconds(floor)) : 0;
}

/**
 * 분당 처치 수 — `60 × min(처치 능력, 젠 속도) × 0.7 × 생존 가동률`. 접속과 같은 몹 HP·젠을 쓴다(밸런스 v2).
 *
 * 가동률이 곱해지면서 **체력·방어·회피·피흡·체력회복이 처치 수를 가른다**(2026-11-24 방치 사냥 개선).
 * 약한 스펙으로 고층에 세워 두면 쓰러지는 시간만큼 덜 잡고, 회복이 피해를 넘는 스펙은 깎이지 않는다.
 * `floor`를 받는 이유는 「층 선택」 창이 1~20층을 같은 스펙으로 비교하기 위해서다.
 */
export function offlineKillsPerMinute(save: Save, floor = save.floor): number {
  const capacity = offlineHeroDps(save) / Math.max(1, enemyMaxHp(floor, false));
  return Math.max(1, 60 * Math.min(capacity, fieldSpawnRate(floor)) * OFFLINE_EFFICIENCY * offlineSurvivalUptime(save, floor));
}

/** 그 층에서 1시간 사냥했을 때의 처치 수 — 「층 선택」 창의 `시간당 N 마리`(쓰러짐 포함). */
export function killsPerHourAt(save: Save, floor = save.floor): number {
  return Math.round(offlineKillsPerMinute(save, floor) * 60);
}

/**
 * 지금 스펙에서 가장 빠른 층 — **최고 도달 층 이하**에서 시간당 처치가 가장 많은 층.
 * 같은 값이면 더 깊은 층을 고른다(보상이 더 큰 쪽이 낫다).
 */
export function bestFarmFloor(save: Save): number {
  const top = Math.max(1, Math.min(MAX_FLOOR, Math.floor(save.maxFloor) || 1));
  let best = 1, bestRate = -1;
  for (let floor = 1; floor <= top; floor++) {
    const rate = offlineKillsPerMinute(save, floor);
    if (rate >= bestRate) { bestRate = rate; best = floor; }
  }
  return best;
}

export type OfflineBossBattle = { win: boolean; seconds: number; heroDps: number; bossHp: number; heroHp: number; bossDps: number };
/**
 * 이 층 보스를 **죽지 않고** 잡을 수 있는지 — 보스 HP를 내 DPS로 깎는 시간과, 보스 피해로 내 체력이
 * 버티는 시간을 견준다. 보스가 나올 때 체력은 꽉 찬 상태이고(`world.ts` 스폰 블록), 보스는 0.85초에
 * 한 번 때린다. 이기면 걸리는 시간은 처치 시간, 지면 쓰러지기까지의 시간이다.
 *
 * 2026-11-24: 회피·피흡·체력회복을 넣어 "버티는 초"를 필드와 같게 맞췄다(종전에는 방어만 봤다).
 * 36케이스(5·10·15·20층 × 3직업 × 3스펙)에서 승패가 바뀌지 않는 보완이다 — 회복형 빌드가
 * 제값을 하고, 체력회복 12%·피흡 5%를 맞춘 표준 빌드는 버티는 초가 크게 늘어난다.
 */
export function offlineBossBattle(save: Save, floor: number): OfflineBossBattle {
  const stats = totalStats(save);
  const extras = effectiveExtraOptions(save.equipment);
  const heroDps = Math.max(1, offlineHeroDps(save));
  const bossHp = enemyMaxHp(floor, true);
  const evasion = Math.max(0, Math.min(100, extras.evasionPct));
  const bossDps = enemyHitDamage(floor, true, stats.defense) / BOSS_HIT_INTERVAL * (1 - evasion / 100);
  const timeToKill = bossHp / heroDps;
  // 보스는 혼자 때리므로 군집 배율은 없다 — 필드 계산식과 같은 회복 함수를 그대로 쓴다.
  const net = bossDps - offlineHealPerSecond(save, floor, heroDps);
  const survive = net > 0 ? stats.health / net : Infinity;
  const win = timeToKill <= (survive + BOSS_APPROACH_SECONDS) * BOSS_SAFETY_MARGIN;
  return { win, seconds: BOSS_APPROACH_SECONDS + (win ? timeToKill : survive), heroDps, bossHp, heroHp: stats.health, bossDps };
}

export function applyOfflineRewards(save: Save, elapsedSeconds: number, options: OfflineRewardOptions = {}): OfflineReward | undefined {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 60) return undefined;
  const seconds = Math.min(43_200, Math.floor(elapsedSeconds));
  const startFloor = save.floor;
  const items: Item[] = [];
  let missedDrops = 0;
  const salvaged = { count: 0, gold: 0, stones: 0 };
  const reward: OfflineReward = { seconds, kills: 0, exp: 0, gold: 0, items, missedDrops: 0, levels: 0, startFloor, endFloor: startFloor, bossKills: 0, deaths: 0, fieldDeaths: 0, progressResets: 0, salvaged };
  /** 사망 주기 위상 — 마지막 사망 이후 사냥한 초. 층이 바뀌면 0부터 다시 센다(A안). */
  let deathClock = 0;
  let deathClockFloor = 0;
  /** 떨어진 하나를 가방에 넣는다 — 자동 분해가 켜져 있으면 **필드·던전과 같은 규칙**(`autoSalvageRecovered`)으로
   *  먼저 분해해 보고, 분해되면 가방에 넣지 않고 금화·강화석으로 정산한다(작업 254). 스킬북·보물
   *  주머니·잠금·등급 초과·`+N` 초과·빈 슬롯·더 좋은 장비 보호는 그 함수가 그대로 맡는다. */
  const receive = (createItem: () => Item): void => {
    const item = createItem();
    if (options.autoSalvage) {
      const sweep = autoSalvageRecovered(save, item, options.autoSalvage, options.autoSalvagePlus);
      if (sweep) { salvaged.count++; salvaged.gold += sweep.gold; salvaged.stones += sweep.stones; return; }
    }
    // 자리 검사·가방 반영·`itemGranted` 신호는 `addItemToBag` 한 곳이 맡는다.
    if (!addItemToBag(save, item, 'offline')) { missedDrops++; return; }
    items.push(item);
  };
  /**
   * 그 층에서 `count`마리 사냥 — 금화·경험치·처치 수는 `progress.ts`가 정한다(PR-3). 드롭만 방치 몫을 쓴다.
   *
   * 돌려주는 값(2026-11-25): `died`는 이번 청크에서 쓰러진 횟수, `killsSinceDeath`는 **마지막 사망 이후**
   * 잡은 마릿수다. 사망이 없으면 `count` 그대로다 — 층 진행도는 이 값만 남겨 접속 사냥과 같은 규칙을 쓴다.
   */
  const hunt = (count: number, floor: number): { died: number; killsSinceDeath: number } => {
    if (count <= 0) return { died: 0, killsSinceDeath: 0 };
    const batch = applyKillBatch(save, floor, count);
    reward.kills += batch.kills; reward.gold += batch.gold; reward.exp += batch.exp; reward.levels += batch.levels;
    // 사냥 중 사망(2026-11-24) — 처치 수에는 이미 생존 가동률로 반영돼 있고, 여기서는 접속과 같은
    // 10골드 패널티를 문다. 쓰러진 횟수는 정산서를 위해 `fieldDeaths`에 남긴다.
    // 죽음은 `버티는 초 + 부활 대기` 주기로 규칙적으로 온다 — 그 주기를 청크 경계 너머로 이어 세야
    // "마지막 사망 이후 얼마나 사냥했나"를 알 수 있다(A안, 2026-11-25). 주기가 무한이면(회복이 피해를
    // 넘는 스펙) 죽지 않는다 — 반드시 `Number.isFinite`로 막는다(무한 루프 방지).
    const huntedSeconds = count * 60 / offlineKillsPerMinute(save, floor);
    const deathsPerHour = offlineDeathsPerHour(save, floor);
    const cycle = deathsPerHour > 0 ? 3600 / deathsPerHour : Infinity;
    if (floor !== deathClockFloor) { deathClockFloor = floor; deathClock = 0; }
    let died = 0, spent = 0;
    while (Number.isFinite(cycle) && deathClock + (huntedSeconds - spent) >= cycle) {
      spent += cycle - deathClock;
      deathClock = 0;
      died++;
    }
    deathClock += huntedSeconds - spent;
    if (died > 0) {
      reward.fieldDeaths += died;
      for (let index = 0; index < died; index++) defeatPenalty(save);
    }
    // 레벨업 뒤 최대 체력 — 경험치 규칙은 progress가, 체력은 최대 체력을 아는 이쪽이 맞춘다.
    if (batch.levels) save.health = totalStats(save).health;
    if (save.tutorial >= 1) for (let index = 0; index < batch.kills; index++) {
      // 한 마리당 한 번만 굴려 장비 1개(파트 B — 스킬북 폐지). 확률은 방치 몫(전 층 0.30%, 작업 254)이다.
      // 영구 스탯북은 **별개로** 개극악 확률(`statBooks.ts`)을 한 번 더 굴린다.
      if (Math.random() < offlineDropChance(floor, false)) receive(() => rollItem(floor, false, false, jobOf(save)));
      const book = rollStatBookDrop('offline');
      if (book) receive(() => book);
    }
    // 마지막 사망 뒤 몫 — 청크 안에서 균등하게 잡았다고 보고 사냥한 시간 비율로 나눈다.
    const killsSinceDeath = died > 0 && huntedSeconds > 0 ? Math.floor(count * (deathClock / huntedSeconds)) : count;
    return { died, killsSinceDeath };
  };
  /** 층 보스 처치 보상 — 금화 `70 × 층`, 경험치 `(9 + 층) × 6`, 드롭 한 번(작업 195·207). 금액은 `progress.ts`.
   *  방치는 보스 처치를 `kills`에 세지 않는다 — 기존 동작 그대로(일일 미션 카운터 불변). */
  const beatBoss = (floor: number): void => {
    const boss = applyBossReward(save, floor);
    reward.bossKills++; reward.gold += boss.gold; reward.exp += boss.exp; reward.levels += boss.levels;
    if (boss.levels) save.health = totalStats(save).health;
    if (save.tutorial >= 1 && Math.random() < offlineDropChance(floor, true)) {
      receive(() => rollItem(floor, false, true, jobOf(save)));
    }
    // 보스의 영구 스탯북은 확정 드롭과 별개로 한 번 더 굴린다(파트 B).
    const bossBook = save.tutorial >= 1 ? rollStatBookDrop('boss') : undefined;
    if (bossBook) receive(() => bossBook);
  };

  /**
   * 사망이 있던 청크의 층 진행도 — 5층부터는 **마지막 사망 이후 몫**만 남긴다(2026-11-25 덕진 님 확정, A안).
   * 입문 1~4층은 초기화 면제라 예전처럼 채운 만큼 더한다. `true`를 돌려주면 부르는 쪽이 진행도를
   * `killsSinceDeath`로 세운다 — 목표를 채운 청크라도 승급·보스전을 열지 않는다(접속 사냥과 같은 규칙).
   */
  const keepOnlySinceLastDeath = (floor: number, hunted: { died: number; killsSinceDeath: number }): boolean => {
    if (hunted.died <= 0 || floor < FIELD_DEATH_RESET_FROM) return false;
    reward.progressResets += hunted.died;
    return true;
  };

  let remaining = seconds;
  for (let guard = 0; remaining > 0 && guard < 50_000; guard++) {
    const floor = save.floor;
    const target = killsToBoss(floor);
    const perKill = 60 / offlineKillsPerMinute(save);
    // 보스는 **최고 도달 층에서만** 나온다(작업 210) — 자동 등반이 꺼졌거나 아래층을 도는 중이면 없다.
    // 작업 245: 자동 등반이 켜져 있고 아직 최고층이 아니면 층 목표를 채울 때마다 한 층씩 올라간다
    // (접속 사냥의 `kill()`과 같은 규칙). 그 층에는 보스가 없으므로 보스전 없이 다음 층으로 넘어간다.
    if (save.autoClimb && floor < save.maxFloor) {
      const need = Math.max(0, target - save.floorKills);
      if (need * perKill >= remaining) {
        // 돌아오기 전에 이 층 목표를 다 못 채웠다 — 채운 만큼만 정산하고 그 층에 머문다.
        const count = Math.floor(remaining / perKill);
        const hunted = hunt(count, floor);
        save.floorKills = keepOnlySinceLastDeath(floor, hunted)
          ? Math.min(target, hunted.killsSinceDeath)
          : Math.min(target, save.floorKills + count);
        break;
      }
      const hunted = hunt(need, floor);
      remaining -= need * perKill;
      // 사망이 있던 청크는 목표 달성으로 치지 않는다 — 마지막 사망 이후 몫만 남기고 그 층에서 다시 쌓는다.
      if (keepOnlySinceLastDeath(floor, hunted)) {
        save.floorKills = Math.min(target, hunted.killsSinceDeath);
        continue;
      }
      save.floorKills = 0;
      save.floor = floor + 1;
      continue;
    }
    if (!(save.autoClimb && floor >= save.maxFloor)) {
      const count = Math.floor(remaining / perKill);
      const hunted = hunt(count, floor);
      // 반복 사냥은 목표를 넘기면 다시 0부터 돈다 — 사망이 있으면 그 사망 시점부터 다시 센다.
      save.floorKills = (keepOnlySinceLastDeath(floor, hunted) ? hunted.killsSinceDeath : save.floorKills + count) % target;
      break;
    }
    const need = Math.max(0, target - save.floorKills);
    if (need * perKill >= remaining) {
      // 돌아오기 전에 목표를 다 못 채웠다 — 채운 만큼만 정산하고 다음 접속을 기다린다.
      const count = Math.floor(remaining / perKill);
      const hunted = hunt(count, floor);
      save.floorKills = keepOnlySinceLastDeath(floor, hunted)
        ? Math.min(target, hunted.killsSinceDeath)
        : Math.min(target, save.floorKills + count);
      break;
    }
    const hunted = hunt(need, floor);
    remaining -= need * perKill;
    // 사망이 있던 청크는 보스전을 열지 않는다 — 죽었는데 보스가 서 있으면 접속 규칙과 어긋난다.
    if (keepOnlySinceLastDeath(floor, hunted)) {
      save.floorKills = Math.min(target, hunted.killsSinceDeath);
      continue;
    }
    save.floorKills = target;
    const battle = offlineBossBattle(save, floor);
    // 보스를 다 잡기 전에 돌아왔다 — 보상도 층 상승도 없고, 다음 접속에 목표를 채운 채로 서 있다.
    if (battle.seconds > remaining) break;
    remaining -= battle.seconds;
    save.floorKills = 0;
    if (battle.win) {
      beatBoss(floor);
      // 이기면 재도전 기록을 지우고 한 층 올라간다. 마지막 층(`MAX_FLOOR`)에서는 그 층에서 계속 잡는다(작업 204).
      afterBossWin(save);
    } else {
      // 켜 놓고 보던 사람과 같다: 10골드를 잃고 1마리부터 다시 잡아, 목표를 채우면 또 도전한다.
      reward.deaths++;
      defeatPenalty(save);
      afterBossLose(save);
    }
  }
  save.lastActiveAt = Date.now();
  reward.endFloor = save.floor;
  reward.missedDrops = missedDrops;
  return reward;
}
