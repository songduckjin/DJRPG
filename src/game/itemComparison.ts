import { isEquipment, statNames, type Item, type Stat } from './items';
import type { Save } from './store';

export function compareEquipment(save: Pick<Save, 'equipment'>, item: Item) {
  if (!isEquipment(item)) return undefined;
  const equipped = save.equipment[item.slot];
  const stats = (Object.keys(statNames) as Stat[])
    .filter(stat => item.stats[stat] !== undefined || equipped?.stats[stat] !== undefined)
    .map(stat => {
      const current = equipped?.stats[stat] ?? 0, candidate = item.stats[stat] ?? 0;
      return { stat, current, candidate, difference: candidate - current };
    });
  return { equipped, stats };
}
