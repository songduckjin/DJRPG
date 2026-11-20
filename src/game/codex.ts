import { baseItems, equipmentImage, isEquipment, isZweihander, rarityOrder, rarityPrefixes, rarityRanks, rarityScales, rarityTiers, type EquipmentItem, type Item, type Rarity, type Slot, type Stat } from './items';
import type { Save } from './store';
export type CodexSlot = Exclude<Slot, 'ring1' | 'ring2'> | 'ring';
export type CodexEntry = { key: string; name: string; slot: CodexSlot; index: number; item: EquipmentItem; art: ReturnType<typeof equipmentImage> };
export const codexSlotNames: Record<CodexSlot, string> = { weapon: '무기', offhand: '문장', helmet: '투구', armor: '갑옷', necklace: '목걸이', gloves: '장갑', belt: '허리띠', boots: '신발', ring: '반지' };
export const codexEntries: CodexEntry[] = Object.keys(codexSlotNames).flatMap(raw => {
  const slot = raw as CodexSlot, itemSlot = slot === 'ring' ? 'ring1' : slot;
  return baseItems[itemSlot].map((name, index) => {
    const item: EquipmentItem = { id: `codex-${slot}-${index}`, name, slot: itemSlot, rarity: 'common', stats: {} };
    return { key: `${slot}:${index}`, name, slot, index, item, art: equipmentImage(item) };
  });
});
const keys = new Set(codexEntries.map(entry => entry.key));
export function equipmentCodexKey(item: Item): string | undefined {
  // 스킬북·보물 주머니(작업 207)는 도감 대상이 아니다.
  if (!isEquipment(item)) return undefined;
  const slot = item.slot === 'ring1' || item.slot === 'ring2' ? 'ring' : item.slot;
  const index = baseItems[item.slot].findIndex(name => item.name === name || item.name.endsWith(` ${name}`));
  return index >= 0 ? `${slot}:${index}` : isZweihander(item) ? 'weapon:3' : undefined;
}
export function normalizeCollection(value: unknown): string[] { return Array.isArray(value) ? [...new Set(value.filter((key): key is string => typeof key === 'string' && keys.has(key)))] : []; }
export function discoverEquipment(save: Pick<Save, 'equipmentCollection' | 'bag' | 'equipment'>): boolean {
  const discovered = new Set(normalizeCollection(save.equipmentCollection));
  for (const item of [...save.bag, ...Object.values(save.equipment).filter((item): item is EquipmentItem => !!item)]) {
    const key = equipmentCodexKey(item); if (key) discovered.add(key);
  }
  const next = [...discovered], changed = JSON.stringify(next) !== JSON.stringify(save.equipmentCollection);
  save.equipmentCollection = next; return changed;
}
export function codexOwnership(save: Save, entry: CodexEntry): { bag: number; equipped: number; discovered: boolean } {
  const bag = save.bag.filter(item => equipmentCodexKey(item) === entry.key).length;
  const equipped = Object.values(save.equipment).filter(item => item && equipmentCodexKey(item) === entry.key).length;
  return { bag, equipped, discovered: save.equipmentCollection.includes(entry.key) || bag + equipped > 0 };
}
export function codexVariantName(entry: CodexEntry, rarity: Rarity): string { const prefix = rarityPrefixes[rarity]; return entry.name.startsWith(`${prefix} `) ? entry.name : `${prefix} ${entry.name}`; }
export function firstDropFloor(entry: CodexEntry, rarity: Rarity): number {
  const count = baseItems[entry.item.slot].length, tier = rarityTiers[rarity];
  const offset = Math.floor(tier * (count - 1) / 9), stride = count === 10 ? 3 : 8;
  return 1 + Math.max(0, entry.index - offset) * stride;
}
export function codexOptions(entry: CodexEntry, rarity: Rarity, floor: number): { floor: number; stats: { stat: Stat; min: number; max: number }[] } {
  floor = Math.max(firstDropFloor(entry, rarity), Math.floor(floor));
  const scale = (1 + Math.floor(floor / 2)) * rarityScales[rarity];
  const primary: Stat = ['weapon','ring1','ring2','gloves'].includes(entry.item.slot) ? 'attack' : 'defense';
  const tierBonus = Math.ceil(entry.index * (entry.slot === 'weapon' ? .6 : .4));
  const zweihander = entry.slot === 'weapon' && entry.name === '쯔바이핸드';
  const bonus = zweihander ? 2 + Math.ceil(scale * .25) : 0;
  const stats: { stat: Stat; min: number; max: number }[] = [{ stat: primary, min: scale + 1 + tierBonus + bonus, max: scale + 3 + tierBonus + bonus }];
  if (rarity !== 'common') stats.push({ stat: 'health', min: 3 * scale, max: 3 * scale });
  const crit = (rarityRanks[rarity] >= rarityRanks.rare ? scale : 0) + (zweihander && rarity !== 'common' ? Math.max(1, Math.ceil(scale * .5)) : 0);
  if (crit) stats.push({ stat: 'crit', min: crit, max: crit });
  if (rarityRanks[rarity] >= rarityRanks.unique) stats.push({ stat: 'speed', min: scale, max: scale });
  return { floor, stats };
}
export function filterCodex(save: Save, query = '', slot = '', state = 'all'): CodexEntry[] {
  const search = query.trim().toLocaleLowerCase('ko-KR');
  return codexEntries.filter(entry => {
    if (slot && entry.slot !== slot) return false;
    const owned = codexOwnership(save, entry);
    if (state === 'found' && !owned.discovered || state === 'missing' && owned.discovered || state === 'owned' && owned.bag + owned.equipped === 0) return false;
    return !search || [entry.name, ...rarityOrder.map(rarity => codexVariantName(entry, rarity))].some(name => name.toLocaleLowerCase('ko-KR').includes(search));
  });
}
export const codexRarities: Rarity[] = rarityOrder;
export function codexVariants(save: Save, query = '', slot = '', state = 'all', rarity = '') {
  const search = query.trim().toLocaleLowerCase('ko-KR');
  return filterCodex(save, '', slot, state).flatMap(entry => codexRarities.filter(grade => !rarity || grade === rarity).flatMap(grade => {
    const name = codexVariantName(entry, grade);
    if (search && !name.toLocaleLowerCase('ko-KR').includes(search)) return [];
    const bag = save.bag.filter(item => item.rarity === grade && equipmentCodexKey(item) === entry.key).length;
    const equipped = Object.values(save.equipment).filter(item => item?.rarity === grade && equipmentCodexKey(item) === entry.key).length;
    if (state === 'owned' && !bag && !equipped) return [];
    return [{ entry, rarity: grade, key: `${entry.key}@${grade}`, name, bag, equipped, discovered: codexOwnership(save, entry).discovered }];
  })).sort((a, b) => rarityRanks[a.rarity] - rarityRanks[b.rarity]);
}
