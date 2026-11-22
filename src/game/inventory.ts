import { autoEquipBest, canWield, isEquipment, itemPower, plusOf, rarityRanks, salvageGold, salvageStones, type EquipmentItem, type Item, type Rarity, type Slot } from './items';
import { EQUIPMENT_BAG_LIMIT, equipmentCount } from './bagCapacity';
import { jobOrDefault } from './skills';
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
  const job = jobOrDefault(save.job);
  for (const item of items) {
    // 다른 직업의 무기는 이 캐릭터가 입을 수 없다(작업 204): 지금 장착한 무기와 비교해 '더 좋은 장비'로
    // 잡히면 안 된다. 그런 장비는 경매장·분해 대상일 뿐이다.
    if (!canWield(item, job)) continue;
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
  const items = save.bag.filter((item): item is EquipmentItem => selected.has(item.id) && isEquipment(item) && !item.locked);
  const emptySlots = [...new Set(items.filter(item => item.slot === 'ring1' || item.slot === 'ring2'
    ? !save.equipment.ring1 || !save.equipment.ring2 : !save.equipment[item.slot]).map(item => item.slot))];
  return { items, emptySlots, upgrades: salvageUpgrades(save, items) };
}

export function salvageItems(save: Save, ids: string[]): { count: number; gold: number; stones: number } {
  const { items } = salvagePlan(save, ids), removed = new Set(items.map(item => item.id));
  const gold = items.reduce((sum, item) => sum + salvageGold[item.rarity], 0);
  const stones = items.reduce((sum, item) => sum + salvageStones[item.rarity], 0);
  save.bag = save.bag.filter(item => !removed.has(item.id)); save.gold += gold; save.stones += stones;
  // 분해한 **장비 수**만큼 누적한다(작업 207) — 일일·주간 `장비 분해 N회` 미션의 근거.
  save.salvageCount = (save.salvageCount ?? 0) + items.length;
  return { count: items.length, gold, stones };
}

/** Why a freshly recovered piece is NOT taken by live auto-salvage (작업 196) — or `undefined` when it
 *  is. The rules are the ones 일괄 분해 already asks about, applied to one piece at the moment it
 *  reaches the hero: a stat book is never swept, a locked piece is the player's own mark, nothing
 *  above the chosen grade is taken, an empty slot needs something to wear, and a piece that beats what
 *  is worn is exactly what 자동 장착 would take, so it stays in the bag. */
export type AutoSalvageBlock = 'statbook' | 'pouch' | 'locked' | 'grade' | 'plus' | 'empty-slot' | 'upgrade';

/** From this floor a drop can carry a 강화 단계, so live auto-salvage also obeys the player's
 *  `+N까지` cap (작업 203). Below it every piece is `+0` and the grade rules alone decide. */
export const AUTO_SALVAGE_PLUS_FLOOR = 41;

/** How far down the sweep may reach: `maxPlus` is the chosen `+N까지` cap (0~7) and is read only from
 *  `AUTO_SALVAGE_PLUS_FLOOR` on. A piece above the cap is a rare drop worth selling at the auction
 *  house, so it is kept even when it is weaker than what the hero wears. */
export function autoSalvageBlock(save: Save, item: Item, maxRarity: Exclude<Rarity, 'legendary'>, maxPlus?: number): AutoSalvageBlock | undefined {
  // 영구 스탯북(파트 B)은 소모품이라 자동 분해가 삼키지 않는다 — 함부로 사라지면 안 되는 드문 물건이다.
  if (item.kind === 'statbook') return 'statbook';
  // 보물 주머니(작업 207)도 같은 이유로 보호한다.
  if (!isEquipment(item)) return 'pouch';
  if (item.locked) return 'locked';
  if (rarityRanks[item.rarity] > rarityRanks[maxRarity]) return 'grade';
  if (save.maxFloor >= AUTO_SALVAGE_PLUS_FLOOR && typeof maxPlus === 'number' && plusOf(item) > maxPlus) return 'plus';
  // 다른 직업의 무기는 입을 수 없으므로 '빈 슬롯'·'더 좋은 장비' 보호 대상이 아니다(작업 204).
  if (!canWield(item, jobOrDefault(save.job))) return undefined;
  const ring = item.slot === 'ring1' || item.slot === 'ring2';
  if (ring ? !save.equipment.ring1 || !save.equipment.ring2 : !save.equipment[item.slot]) return 'empty-slot';
  if (salvageUpgrades(save, [item]).length) return 'upgrade';
  return undefined;
}

/** Auto-salvages one recovered piece on the spot: it never enters the bag, and its gold and stones are
 *  paid exactly as a manual salvage of the same piece would pay. Returns `undefined` when the piece is
 *  kept, so the caller stores it as usual. */
export function autoSalvageRecovered(save: Save, item: Item, maxRarity: Exclude<Rarity, 'legendary'>, maxPlus?: number): { gold: number; stones: number } | undefined {
  const block = autoSalvageBlock(save, item, maxRarity, maxPlus);
  if (block || !isEquipment(item)) return undefined;
  const gold = salvageGold[item.rarity], stones = salvageStones[item.rarity];
  save.gold += gold; save.stones += stones;
  // 자동 분해도 한 벌 = 1회로 센다(작업 207).
  save.salvageCount = (save.salvageCount ?? 0) + 1;
  return { gold, stones };
}

/** 가방 40칸에 세는 수 — `bagCapacity.equipmentCount`와 같은 셈(모든 아이템 1개=1칸, 파트 B). */
export function bagEquipmentCount(save: Save): number { return equipmentCount(save.bag, jobOrDefault(save.job)); }

/** 가방 40칸이 **꽉 찬** 상태에서 이미 들고 있던 장비를 즉시 분해해 빈 칸을 만든다(작업 209, 사용자 확정
 *  #4286 "꽉차면 바로 자동분해 되도록").
 *
 *  접속 중 자동 분해는 지금까지 **새로 주워 오는 장비**만 갈아냈기 때문에, 40칸이 차면 설정 등급 이하의
 *  장비가 가방에 그대로 남아 있어도 새 드롭을 줍지 못했다. 이 함수는 `autoSalvageBlock`이 허용하는
 *  장비만(설정 등급 이하·잠금 아님·`+N까지` 이하·입을 수 있는 직업·이미 채워진 칸·장착보다 나쁨) 골라
 *  `salvageItems`와 **같은 값**(금화·강화석·`salvageCount`)으로 분해한다. 스탯북·보물 주머니·보호 대상은
 *  건드리지 않으며, 가방이 덜 찾거나 남길 장비밖에 없으면 `undefined`(아무 일도 없다). */
export function sweepBagOnFull(save: Save, maxRarity: Exclude<Rarity, 'legendary'>, maxPlus?: number): { count: number; gold: number; stones: number } | undefined {
  if (bagEquipmentCount(save) < EQUIPMENT_BAG_LIMIT) return undefined;
  const ids = save.bag
    .filter(item => isEquipment(item) && !autoSalvageBlock(save, item, maxRarity, maxPlus))
    .map(item => item.id);
  if (!ids.length) return undefined;
  const swept = salvageItems(save, ids);
  return swept.count ? swept : undefined;
}
