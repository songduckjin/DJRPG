import { canStoreItem } from './bagCapacity';
import { itemDropChance, rollItem, rollItemKind, rollSkillBook, totalStats, type Item } from './items';
import { jobOrDefault as jobOf } from './skills';
import { addExperience, floorKillTarget, type Save } from './store';
import { offlineMobHp } from './world';

export type OfflineReward = { seconds: number; kills: number; exp: number; gold: number; items: Item[]; missedDrops: number; levels: number };

export function applyOfflineRewards(save: Save, elapsedSeconds: number): OfflineReward | undefined {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 60) return undefined;
  const seconds = Math.min(43_200, Math.floor(elapsedSeconds));
  const attack = totalStats(save).attack;
  // Offline settlement keeps the pace it always had (`offlineMobHp`): the steeper live curve from
  // 작업 196 is about a fight taking longer in the field, not about paying less for time away.
  const killsPerMinute = Math.max(8, Math.min(16, 8 + Math.floor(attack / offlineMobHp(save.floor) * 16)));
  const kills = Math.floor(seconds / 60 * killsPerMinute);
  const target = floorKillTarget(save.floor);
  // 아래층 반복 사냥에는 보스가 없다(작업 210) — 최고 도달 층에서만 보스 몫(금화·경험치·드롭)을 정산한다.
  const bossFloor = save.floor >= save.maxFloor;
  const bossKills = bossFloor ? Math.floor(kills / target) : 0;
  save.bossKills += bossKills;
  // 경험치는 필드와 같은 `9 + 층`(작업 207) — 보스 몫(6배)도 함께 정산한다.
  const exp = kills * (9 + save.floor) + bossKills * (9 + save.floor) * 5;
  const gold = kills * (3 + save.floor) + bossKills * 70 * save.floor;
  save.kills += kills;
  save.floorKills = bossFloor ? Math.max(0, Math.min(target, save.floorKills + kills - bossKills * target)) : (save.floorKills + kills) % target;
  save.gold += gold;
  const levels = addExperience(save, exp);
  const items: Item[] = [];
  let missedDrops = 0;
  const receive = (createItem: () => Item): void => {
    const item = createItem();
    if (!canStoreItem(save.bag, item, jobOf(save))) { missedDrops++; return; }
    save.bag.push(item);
    items.push(item);
  };
  if (save.tutorial >= 1) {
    for (let index = 0; index < kills; index++) {
      // 한 마리당 한 번만 굴려 1개 — 장비 70% · 스킬북 30%(작업 210, 접속 사냥과 같은 규칙).
      if (Math.random() < itemDropChance(save.floor, false)) receive(() => rollItemKind() === 'skillbook' ? rollSkillBook(save.floor, jobOf(save)) : rollItem(save.floor, false, false, jobOf(save)));
    }
    for (let index = 0; index < bossKills; index++) {
      if (Math.random() < itemDropChance(save.floor, true)) receive(() => rollItemKind() === 'skillbook' ? rollSkillBook(save.floor, jobOf(save)) : rollItem(save.floor, false, true, jobOf(save)));
    }
  }
  save.lastActiveAt = Date.now();
  return { seconds, kills, exp, gold, items, missedDrops, levels };
}
