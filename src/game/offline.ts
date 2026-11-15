import { equipmentDropChance, rollItem, totalStats, type Item } from './items';
import { addExperience, floorKillTarget, type Save } from './store';
import { enemyMaxHp } from './world';

export type OfflineReward = { seconds: number; kills: number; exp: number; gold: number; items: Item[]; missedDrops: number; levels: number };

export function applyOfflineRewards(save: Save, elapsedSeconds: number): OfflineReward | undefined {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 60) return undefined;
  const seconds = Math.min(43_200, Math.floor(elapsedSeconds));
  const attack = totalStats(save).attack;
  const killsPerMinute = Math.max(8, Math.min(14, 8 + Math.floor(attack / enemyMaxHp(save.floor, false) * 16)));
  const kills = Math.floor(seconds / 60 * killsPerMinute);
  const exp = kills * 8;
  const gold = kills * (3 + save.floor);
  save.kills += kills;
  save.floorKills = Math.min(floorKillTarget(save.floor), save.floorKills + kills);
  save.gold += gold;
  const levels = addExperience(save, exp);
  const items: Item[] = [];
  let missedDrops = 0;
  if (save.tutorial >= 1) for (let index = 0; index < kills; index++) {
    if (Math.random() >= equipmentDropChance(save.floor)) continue;
    if (save.bag.length >= 40) { missedDrops++; continue; }
    const item = rollItem(save.floor);
    save.bag.push(item);
    items.push(item);
  }
  save.lastActiveAt = Date.now();
  return { seconds, kills, exp, gold, items, missedDrops, levels };
}
