import { isSkillBook, type Item } from '../game/items';
import type { Save } from '../game/store';
import { skillOrder } from '../game/skills';

export function orderedSkills(save: Pick<Save, 'quickSlots'>) {
  const equipped = save.quickSlots.filter(id => id !== null);
  return [...equipped, ...skillOrder.filter(id => !equipped.includes(id))];
}
export function filterSaleItems(items: Item[], category: string, rarity: string): Item[] {
  return items.filter(item => (!rarity || item.rarity === rarity) && (!category
    || category === 'weapon' && ['weapon', 'offhand'].includes(item.slot)
    || category === 'armor' && ['helmet', 'armor', 'gloves', 'belt', 'boots'].includes(item.slot)
    || category === 'accessory' && ['necklace', 'ring1', 'ring2'].includes(item.slot)
    || category === 'skillbook' && isSkillBook(item)));
}
