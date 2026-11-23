import { addItemToBag } from './rewardGrant';
import { autoSalvageRecovered } from './inventory';
import { offlineDropChance, rollItem, totalStats, type Item, type Rarity } from './items';
import { rollStatBookDrop } from './statBooks';
import { FIRE_BOLT_TOTAL_POWER, jobOrDefault as jobOf, skillDamageScale, skillDuration, skills, type SkillId } from './skills';
import { skillLevel, type Save } from './store';
import { afterBossLose, afterBossWin, applyBossReward, applyKillBatch, defeatPenalty, killsToBoss } from './progress';
import { basicAttackPower, berserkAttackScale, berserkSpeedScale, CRIT_CHANCE_CAP, attackInterval, critDamageScale, enemyHitDamage, enemyMaxHp, fieldSpawnRate } from './battle/formulas';
import { effectiveExtraOptions } from './extraOptions';
import { SKILL_CDR_CAP } from './combat/engine';
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
 *  · 마지막 층(`MAX_FLOOR`)에서는 이겨도 층이 오르지 않고 그 층에서 보스를 계속 잡는다.
 */
export type OfflineReward = {
  seconds: number; kills: number; exp: number; gold: number; items: Item[]; missedDrops: number; levels: number;
  /** 정산 전후 층 — `5층 → 8층 돌파!`를 보여 준다(작업 235). */
  startFloor: number; endFloor: number;
  /** 오프라인 동안 잡은 층 보스 수(작업 235). */
  bossKills: number;
  /** 보스에게 진 횟수(작업 235) — 층이 멈춘 이유를 보여 준다. */
  deaths: number;
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
 * 스킬 한 번의 위력(공격력 배수) — `world.ts` `action()`이 실제로 넣는 값.
 * 한 마리(보스)에게 들어가는 몫만 센다: 멀티 샷·폭풍 연사는 여러 발 중 한 발, 화살비는 3틱.
 * 버프(블러드 레이지·호크아이·아케인 실드)는 위력이 없으므로 0이며 아래에서 배율로 따로 본다.
 */
const skillBurst: Record<SkillId, number> = {
  slash2: 2.2, slam: 2.2, warcry: 0, power: 4, destroy: 2.7, hell: 3.2, crushing: 3.4, spin: 1.65,
  doubleShot: 2.7, multiShot: .95, pierceShot: 2.6, iceArrow: 1.9, hawkEye: 0, snipe: 6.5, stormVolley: .8, arrowRain: 2.55,
  fireBolt: FIRE_BOLT_TOTAL_POWER, iceBolt: 1.7, chainLightning: 1.25, manaBurst: 2.5, frostNova: 1.5, arcaneShield: 0, meteorStrike: 3.6, arcaneOverlord: 3
};
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
    const burst = id === 'arrowRain' ? skillCastScale(id, level) : skillBurst[id];
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
/** 분당 처치 수 — `60 × min(처치 능력, 젠 속도) × 0.7`. 접속과 같은 몹 HP·젠을 쓴다(밸런스 v2). */
export function offlineKillsPerMinute(save: Save): number {
  const capacity = offlineHeroDps(save) / Math.max(1, enemyMaxHp(save.floor, false));
  return Math.max(1, 60 * Math.min(capacity, fieldSpawnRate(save.floor)) * OFFLINE_EFFICIENCY);
}

export type OfflineBossBattle = { win: boolean; seconds: number; heroDps: number; bossHp: number; heroHp: number; bossDps: number };
/**
 * 이 층 보스를 **죽지 않고** 잡을 수 있는지 — 보스 HP를 내 DPS로 깎는 시간과, 보스 피해로 내 체력이
 * 버티는 시간을 견준다. 보스가 나올 때 체력은 꽉 찬 상태이고(`world.ts` 스폰 블록), 보스는 0.85초에
 * 한 번 때린다. 이기면 걸리는 시간은 처치 시간, 지면 쓰러지기까지의 시간이다.
 */
export function offlineBossBattle(save: Save, floor: number): OfflineBossBattle {
  const stats = totalStats(save);
  const heroDps = Math.max(1, offlineHeroDps(save));
  const bossHp = enemyMaxHp(floor, true);
  const bossDps = enemyHitDamage(floor, true, stats.defense) / BOSS_HIT_INTERVAL;
  const timeToKill = bossHp / heroDps;
  const survive = stats.health / Math.max(.001, bossDps);
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
  const reward: OfflineReward = { seconds, kills: 0, exp: 0, gold: 0, items, missedDrops: 0, levels: 0, startFloor, endFloor: startFloor, bossKills: 0, deaths: 0, salvaged };
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
  /** 그 층에서 `count`마리 사냥 — 금화·경험치·처치 수는 `progress.ts`가 정한다(PR-3). 드롭만 방치 몫을 쓴다. */
  const hunt = (count: number, floor: number): void => {
    if (count <= 0) return;
    const batch = applyKillBatch(save, floor, count);
    reward.kills += batch.kills; reward.gold += batch.gold; reward.exp += batch.exp; reward.levels += batch.levels;
    // 레벨업 뒤 최대 체력 — 경험치 규칙은 progress가, 체력은 최대 체력을 아는 이쪽이 맞춘다.
    if (batch.levels) save.health = totalStats(save).health;
    if (save.tutorial >= 1) for (let index = 0; index < batch.kills; index++) {
      // 한 마리당 한 번만 굴려 장비 1개(파트 B — 스킬북 폐지). 확률은 방치 몫(전 층 0.30%, 작업 254)이다.
      // 영구 스탯북은 **별개로** 개극악 확률(`statBooks.ts`)을 한 번 더 굴린다.
      if (Math.random() < offlineDropChance(floor, false)) receive(() => rollItem(floor, false, false, jobOf(save)));
      const book = rollStatBookDrop('offline');
      if (book) receive(() => book);
    }
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
        hunt(count, floor);
        save.floorKills = Math.min(target, save.floorKills + count);
        break;
      }
      hunt(need, floor);
      save.floorKills = 0;
      remaining -= need * perKill;
      save.floor = floor + 1;
      continue;
    }
    if (!(save.autoClimb && floor >= save.maxFloor)) {
      const count = Math.floor(remaining / perKill);
      hunt(count, floor);
      save.floorKills = (save.floorKills + count) % target;
      break;
    }
    const need = Math.max(0, target - save.floorKills);
    if (need * perKill >= remaining) {
      // 돌아오기 전에 목표를 다 못 채웠다 — 채운 만큼만 정산하고 다음 접속을 기다린다.
      const count = Math.floor(remaining / perKill);
      hunt(count, floor);
      save.floorKills = Math.min(target, save.floorKills + count);
      break;
    }
    hunt(need, floor);
    save.floorKills = target;
    remaining -= need * perKill;
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
