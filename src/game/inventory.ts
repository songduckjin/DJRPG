import { autoEquipBest, isSkillBook, itemPower, rarityRanks, salvageGold, salvageStones, type EquipmentItem, type Item, type Rarity, type Slot } from './items';
import type { Save } from './store';

export function canAutoEquip(save: Save): boolean {
  const before = new Set(Object.values(save.equipment).filter(Boolean).map(item => item!.id));
  const candidate = structuredClone(save); autoEquipBest(candidate);
  return Object.values(candidate.equipment).some(item => item && !before.has(item.id));
}

/** A piece in a salvage selection that the character would rather be wearing: the piece, the slot it
 *  belongs to, what is worn there now, and how much power it gains over that piece. */
export type SalvageUpgrade = { item: EquipmentItem; slot: Slot; equipped: EquipmentItem; gain: number };

/** The pieces of a salvage selection that beat what is already worn (작업 196).
 *
 *  Bulk salvage sweeps a whole grade at once, so it can swallow a drop that is better than the gear
 *  the character has on — the very piece 자동 장착 would have taken. The repository's own comparison is
 *  `itemPower`, which is also what `autoEquipBest` sorts by, so an upgrade here means exactly "자동
 *  장착 would have equipped it". Rings are compared against the weaker of the two worn rings, because
 *  that is the one a better ring would replace. An empty slot is not reported here: `salvagePlan`
 *  already lists it in `emptySlots`, and that warning comes first. */
export function salvageUpgrades(save: Save, items: EquipmentItem[]): SalvageUpgrade[] {
  const rings = (['ring1', 'ring2'] as const)
    .map(slot => save.equipment[slot])
    .filter((item): item is EquipmentItem => !!item);
  // With a ring slot free there is nothing to beat — `emptySlots` covers it instead.
  const weakestRing = rings.length < 2 ? undefined : rings.reduce((weak, item) => itemPower(item) < itemPower(weak) ? item : weak);
  const upgrades: SalvageUpgrade[] = [];
  for (const item of items) {
    const ring = item.slot === 'ring1' || item.slot === 'ring2';
    const equipped = ring ? weakestRing : save.equipment[item.slot];
    if (!equipped) continue;
    const gain = itemPower(item) - itemPower(equipped);
    if (gain > 0) upgrades.push({ item, slot: item.slot, equipped, gain });
  }
  return upgrades;
}

/** What a salvage selection would do: the pieces it takes, the empty slots it would leave the
 *  character without, and the pieces that beat what is worn (`salvageUpgrades`). */
export function salvagePlan(save: Save, ids: string[]): { items: EquipmentItem[]; emptySlots: string[]; upgrades: SalvageUpgrade[] } {
  const selected = new Set(ids);
  const items = save.bag.filter((item): item is EquipmentItem => selected.has(item.id) && !isSkillBook(item) && !item.locked);
  const emptySlots = [...new Set(items.filter(item => item.slot === 'ring1' || item.slot === 'ring2'
    ? !save.equipment.ring1 || !save.equipment.ring2 : !save.equipment[item.slot]).map(item => item.slot))];
  return { items, emptySlots, upgrades: salvageUpgrades(save, items) };
}

export function salvageItems(save: Save, ids: string[]): { count: number; gold: number; stones: number } {
  const { items } = salvagePlan(save, ids), removed = new Set(items.map(item => item.id));
  const gold = items.reduce((sum, item) => sum + salvageGold[item.rarity], 0);
  const stones = items.reduce((sum, item) => sum + salvageStones[item.rarity], 0);
  save.bag = save.bag.filter(item => !removed.has(item.id)); save.gold += gold; save.stones += stones;
  return { count: items.length, gold, stones };
}

/** Why a freshly recovered piece is NOT taken by live auto-salvage (작업 196) — or `undefined` when it
 *  is. The rules are the ones 일괄 분해 already asks about, applied to one piece at the moment it
 *  reaches the hero: a skill book is never swept, a locked piece is the player's own mark, nothing
 *  above the chosen grade is taken, an empty slot needs something to wear, and a piece that beats what
 *  is worn is exactly what 자동 장착 would take, so it stays in the bag. */
export type AutoSalvageBlock = 'skillbook' | 'locked' | 'grade' | 'empty-slot' | 'upgrade';

export function autoSalvageBlock(save: Save, item: Item, maxRarity: Exclude<Rarity, 'legendary'>): AutoSalvageBlock | undefined {
  if (isSkillBook(item)) return 'skillbook';
  if (item.locked) return 'locked';
  if (rarityRanks[item.rarity] > rarityRanks[maxRarity]) return 'grade';
  const ring = item.slot === 'ring1' || item.slot === 'ring2';
  if (ring ? !save.equipment.ring1 || !save.equipment.ring2 : !save.equipment[item.slot]) return 'empty-slot';
  if (salvageUpgrades(save, [item]).length) return 'upgrade';
  return undefined;
}

/** Auto-salvages one recovered piece on the spot: it never enters the bag, and its gold and stones are
 *  paid exactly as a manual salvage of the same piece would pay. Returns `undefined` when the piece is
 *  kept, so the caller stores it as usual. */
export function autoSalvageRecovered(save: Save, item: Item, maxRarity: Exclude<Rarity, 'legendary'>): { gold: number; stones: number } | undefined {
  const block = autoSalvageBlock(save, item, maxRarity);
  if (block || isSkillBook(item)) return undefined;
  const gold = salvageGold[item.rarity], stones = salvageStones[item.rarity];
  save.gold += gold; save.stones += stones;
  return { gold, stones };
}
