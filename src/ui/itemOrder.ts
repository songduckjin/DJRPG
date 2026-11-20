import { isEquipment, isSkillBook, type Item } from '../game/items';
import type { Save } from '../game/store';
import { jobOrDefault, skillOrderFor } from '../game/skills';

export function orderedSkills(save: Pick<Save, 'quickSlots' | 'job'>) {
  const equipped = save.quickSlots.filter(id => id !== null);
  return [...equipped, ...skillOrderFor(jobOrDefault(save.job)).filter(id => !equipped.includes(id))];
}
export function filterSaleItems(items: Item[], category: string, rarity: string): Item[] {
  // 보물 주머니(작업 207)는 소모품이라 경매장 판매 목록에 끼지 않는다.
  return items.filter(item => (isSkillBook(item) || isEquipment(item)) && (!rarity || item.rarity === rarity) && (!category
    || category === 'weapon' && ['weapon', 'offhand'].includes(item.slot)
    || category === 'armor' && ['helmet', 'armor', 'gloves', 'belt', 'boots'].includes(item.slot)
    || category === 'accessory' && ['necklace', 'ring1', 'ring2'].includes(item.slot)
    || category === 'skillbook' && isSkillBook(item)));
}
