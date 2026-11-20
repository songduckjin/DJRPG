import { canStoreItem } from './bagCapacity';
import { equipmentDropChance, rollItem, rollSkillBook, skillBookDropChance, totalStats, type Item } from './items';
import { jobOrDefault as jobOf } from './skills';
import { addExperience, floorKillTarget, type Save } from './store';
import { enemyMaxHp } from './world';

export type OfflineReward = { seconds: number; kills: number; exp: number; gold: number; items: Item[]; missedDrops: number; levels: number };

export function applyOfflineRewards(save: Save, elapsedSeconds: number): OfflineReward | undefined {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 60) return undefined;
  const seconds = Math.min(43_200, Math.floor(elapsedSeconds));
  const attack = totalStats(save).attack;
  const killsPerMinute = Math.max(8, Math.min(16, 8 + Math.floor(attack / enemyMaxHp(save.floor, false) * 16)));
  const kills = Math.floor(seconds / 60 * killsPerMinute);
  const target = floorKillTarget(save.floor);
  const bossKills = Math.floor(kills / target);
  save.bossKills += bossKills;
  const exp = kills * 8;
  const gold = kills * (3 + save.floor) + bossKills * 70 * save.floor;
  save.kills += kills;
  save.floorKills = Math.max(0, Math.min(target, save.floorKills + kills - bossKills * target));
  save.gold += gold;
  const levels = addExperience(save, exp);
  const items: Item[] = [];
  let missedDrops = 0;
  const receive = (createItem: () => Item): void => {
    const item = createItem();
    if (!canStoreItem(save.bag, item)) { missedDrops++; return; }
    save.bag.push(item);
    items.push(item);
  };
  if (save.tutorial >= 1) {
    for (let index = 0; index < kills; index++) {
      if (Math.random() < equipmentDropChance(save.floor, false)) receive(() => rollItem(save.floor, false, false, jobOf(save)));
      if (Math.random() < skillBookDropChance(save.floor, false)) receive(() => rollSkillBook(save.floor, jobOf(save)));
    }
    for (let index = 0; index < bossKills; index++) {
      if (Math.random() < equipmentDropChance(save.floor, true)) receive(() => rollItem(save.floor, false, true, jobOf(save)));
      if (Math.random() < skillBookDropChance(save.floor, true)) receive(() => rollSkillBook(save.floor, jobOf(save)));
    }
  }
  save.lastActiveAt = Date.now();
  return { seconds, kills, exp, gold, items, missedDrops, levels };
}
