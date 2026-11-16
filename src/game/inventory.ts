import { autoEquipBest, isSkillBook, salvageGold, salvageStones, type EquipmentItem } from './items';
import type { Save } from './store';
export function canAutoEquip(save: Save): boolean {
  const before = new Set(Object.values(save.equipment).filter(Boolean).map(item => item!.id));
  const candidate = structuredClone(save); autoEquipBest(candidate);
  return Object.values(candidate.equipment).some(item => item && !before.has(item.id));
}
export function salvagePlan(save: Save, ids: string[]): { items: EquipmentItem[]; emptySlots: string[] } {
  const selected = new Set(ids);
  const items = save.bag.filter((item): item is EquipmentItem => selected.has(item.id) && !isSkillBook(item) && !item.locked);
  const emptySlots = [...new Set(items.filter(item => item.slot === 'ring1' || item.slot === 'ring2'
    ? !save.equipment.ring1 || !save.equipment.ring2 : !save.equipment[item.slot]).map(item => item.slot))];
  return { items, emptySlots };
}
export function salvageItems(save: Save, ids: string[]): { count: number; gold: number; stones: number } {
  const { items } = salvagePlan(save, ids), removed = new Set(items.map(item => item.id));
  const gold = items.reduce((sum, item) => sum + salvageGold[item.rarity], 0);
  const stones = items.reduce((sum, item) => sum + salvageStones[item.rarity], 0);
  save.bag = save.bag.filter(item => !removed.has(item.id)); save.gold += gold; save.stones += stones;
  return { count: items.length, gold, stones };
}
