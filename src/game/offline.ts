import { canStoreItem } from './bagCapacity';
import { itemDropChance, rollItem, rollItemKind, rollSkillBook, totalStats, type Item } from './items';
import { jobOrDefault as jobOf, skillDamageScale, skillDuration, skills, type SkillId } from './skills';
import { addExperience, floorKillTarget, MAX_FLOOR, skillLevel, type Save } from './store';
import { basicAttackPower, berserkAttackScale, berserkSpeedScale, cooldowns, enemyHitDamage, enemyMaxHp, offlineMobHp } from './world';

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
  doubleShot: 2.7, multiShot: .95, pierceShot: 2.6, iceArrow: 1.9, hawkEye: 0, snipe: 4.3, stormVolley: .8, arrowRain: 2.55,
  fireBolt: 2, iceBolt: 1.7, chainLightning: 1.25, manaBurst: 2.5, frostNova: 1.5, arcaneShield: 0, meteorStrike: 3.6, arcaneOverlord: 3
};
/** 공격력·공격속도를 올리는 버프 3종 — 지속/쿨타임 비율만큼 DPS를 끌어올린다. */
const buffSkills: SkillId[] = ['warcry', 'hawkEye', 'arcaneShield'];

/** 지금 스펙으로 보스에게 넣는 초당 피해 — 평타(공격력 ×1.6 / 공격 간격) + 퀵슬롯 스킬 + 버프 가동률. */
export function offlineHeroDps(save: Save): number {
  const stats = totalStats(save);
  const interval = cooldowns.attack / (1 + Math.max(0, stats.speed) / 100);
  let skill = 0, buff = 1;
  for (const id of save.quickSlots) {
    if (!id || !save.learned.includes(id)) continue;
    const level = skillLevel(save, id);
    if (skillBurst[id]) skill += stats.attack * skillBurst[id] * skillDamageScale(level) / skills[id].cooldown;
    if (buffSkills.includes(id)) buff += Math.min(1, skillDuration(id, level) / skills[id].cooldown) * (berserkAttackScale(level) * berserkSpeedScale(level) - 1);
  }
  return (stats.attack * basicAttackPower / interval + skill) * buff;
}
/** 분당 처치 수 — 접속 사냥과 같은 기준(`offlineMobHp`)을 쓴다(작업 196). 8~16마리/분. */
export function offlineKillsPerMinute(save: Save): number {
  const attack = totalStats(save).attack;
  return Math.max(8, Math.min(16, 8 + Math.floor(attack / offlineMobHp(save.floor) * 16)));
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

export function applyOfflineRewards(save: Save, elapsedSeconds: number): OfflineReward | undefined {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 60) return undefined;
  const seconds = Math.min(43_200, Math.floor(elapsedSeconds));
  const startFloor = save.floor;
  const items: Item[] = [];
  let missedDrops = 0;
  const reward: OfflineReward = { seconds, kills: 0, exp: 0, gold: 0, items, missedDrops: 0, levels: 0, startFloor, endFloor: startFloor, bossKills: 0, deaths: 0 };
  const receive = (createItem: () => Item): void => {
    const item = createItem();
    if (!canStoreItem(save.bag, item, jobOf(save))) { missedDrops++; return; }
    save.bag.push(item);
    items.push(item);
  };
  /** 그 층에서 `count`마리 사냥 — 금화·경험치·드롭은 `world.ts` `kill()`과 같은 식이다. */
  const hunt = (count: number, floor: number): void => {
    if (count <= 0) return;
    reward.kills += count; save.kills += count;
    const gold = count * (3 + floor); reward.gold += gold; save.gold += gold;
    // 경험치는 필드와 같은 `9 + 층`(작업 207).
    const exp = count * (9 + floor); reward.exp += exp; reward.levels += addExperience(save, exp);
    if (save.tutorial >= 1) for (let index = 0; index < count; index++) {
      // 한 마리당 한 번만 굴려 1개 — 장비 70% · 스킬북 30%(작업 210, 접속 사냥과 같은 규칙).
      if (Math.random() < itemDropChance(floor, false)) receive(() => rollItemKind() === 'skillbook' ? rollSkillBook(floor, jobOf(save)) : rollItem(floor, false, false, jobOf(save)));
    }
  };
  /** 층 보스 처치 보상 — 금화 `70 × 층`, 경험치 `(9 + 층) × 6`, 드롭 한 번(작업 195·207). */
  const beatBoss = (floor: number): void => {
    reward.bossKills++; save.bossKills++;
    const gold = 70 * floor; reward.gold += gold; save.gold += gold;
    const exp = (9 + floor) * 6; reward.exp += exp; reward.levels += addExperience(save, exp);
    if (save.tutorial >= 1 && Math.random() < itemDropChance(floor, true)) {
      receive(() => rollItemKind() === 'skillbook' ? rollSkillBook(floor, jobOf(save)) : rollItem(floor, false, true, jobOf(save)));
    }
  };

  let remaining = seconds;
  for (let guard = 0; remaining > 0 && guard < 50_000; guard++) {
    const floor = save.floor;
    const target = floorKillTarget(floor);
    const perKill = 60 / offlineKillsPerMinute(save);
    // 보스는 **최고 도달 층에서만** 나온다(작업 210) — 자동 등반이 꺼졌거나 아래층을 도는 중이면 없다.
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
      save.bossRetryFloor = 0;
      // 마지막 층에서는 이겨도 더 올라갈 곳이 없다(작업 204) — 그 층에서 보스를 계속 잡는다.
      if (floor < MAX_FLOOR) {
        save.floor = floor + 1;
        save.maxFloor = Math.min(MAX_FLOOR, Math.max(save.maxFloor, save.floor));
      }
    } else {
      // 켜 놓고 보던 사람과 같다: 10골드를 잃고 1마리부터 다시 잡아, 목표를 채우면 또 도전한다.
      reward.deaths++;
      save.gold = Math.max(0, save.gold - 10);
      save.bossRetryFloor = floor < MAX_FLOOR ? floor : 0;
    }
  }
  save.lastActiveAt = Date.now();
  reward.endFloor = save.floor;
  reward.missedDrops = missedDrops;
  return reward;
}
