import type { Save } from './store';

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

export type Rarity = 'common' | 'magic' | 'rare' | 'legendary';

export type Slot = 'weapon' | 'offhand' | 'helmet' | 'armor' | 'necklace' | 'gloves' | 'belt' | 'boots' | 'ring1' | 'ring2';

export type Stat = 'attack' | 'defense' | 'health' | 'crit' | 'speed';

export type Item = { id: string; name: string; slot: Slot; rarity: Rarity; stats: Partial<Record<Stat, number>> };

export const slots: Slot[] = ['weapon', 'offhand', 'helmet', 'armor', 'necklace', 'gloves', 'belt', 'boots', 'ring1', 'ring2'];

export const slotNames: Record<Slot, string> = { weapon: '두손검', offhand: '문장', helmet: '투구', armor: '갑옷', necklace: '목걸이', gloves: '장갑', belt: '벨트', boots: '신발', ring1: '반지 1', ring2: '반지 2' };

export const rarityNames: Record<Rarity, string> = { common: '일반', magic: '마법', rare: '희귀', legendary: '전설' };

export const statNames: Record<Stat, string> = { attack: '공격', defense: '방어', health: '체력', crit: '치명', speed: '공속' };

const weaponNames: Record<Rarity, string> = { common: '낡은 두손검', magic: '서리의 클레이모어', rare: '황혼의 대검', legendary: '영원의 쯔바이핸드' };

const zweihanderNames: Record<Rarity, string> = { common: '쯔바이핸드', magic: '강철 쯔바이핸드', rare: '피빛 쯔바이핸드', legendary: '영원의 쯔바이핸드' };

export function isZweihander(item: Item): boolean { return item.slot === 'weapon' && /쯔바이핸드|츠바이핸더/.test(item.name); }

export function migrateItem(value: unknown): Item | undefined {
  if (!isRecord(value) || typeof value.slot !== 'string' || !slots.includes(value.slot as Slot) || typeof value.rarity !== 'string' || !Object.hasOwn(rarityNames, value.rarity)) return undefined;
  const slot = value.slot as Slot, rarity = value.rarity as Rarity;
  const stats: Item['stats'] = {};
  if (isRecord(value.stats)) for (const stat of Object.keys(statNames) as Stat[]) {
    const amount = value.stats[stat];
    if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) stats[stat] = amount;
  }
  const savedName = typeof value.name === 'string' ? value.name : '';
  const zweihander = savedName === zweihanderNames[rarity] || (rarity === 'legendary' && savedName === '영원의 츠바이핸더');
  const name = slot === 'weapon' ? (zweihander ? zweihanderNames[rarity] : weaponNames[rarity]) : savedName || slotNames[slot];
  return { id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(), name, slot, rarity, stats };
}

function itemSkillLevel(save: Save, id: 'mastery' | 'body' | 'instinct'): number { return save.skillLevels[id] ?? 1; }

export function totalStats(save: Save): Record<Stat, number> {
  const total = { attack: 8 + save.level * 2, defense: 2 + save.level, health: 100 + (save.level - 1) * 12, crit: 2, speed: 0 };
  for (const item of Object.values(save.equipment)) if (item) {
    for (const stat of Object.keys(item.stats) as Stat[]) total[stat] += item.stats[stat] ?? 0;
  }
  if (save.passives.includes('mastery')) total.attack = Math.ceil(total.attack * (1.15 + (itemSkillLevel(save, 'mastery') - 1) * .02));
  if (save.passives.includes('body')) { const bonus = 1.15 + (itemSkillLevel(save, 'body') - 1) * .02; total.defense = Math.ceil(total.defense * bonus); total.health = Math.ceil(total.health * bonus); }
  if (save.passives.includes('instinct')) { total.crit += 8 + (itemSkillLevel(save, 'instinct') - 1) * 2; total.speed += 12 + (itemSkillLevel(save, 'instinct') - 1) * 2; }
  return total;
}

export function rollItem(floor: number, guaranteed = false, boss = false): Item {
  if (guaranteed) return { id: crypto.randomUUID(), name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } };
  const roll = Math.random();
  const rarity: Rarity = boss
    ? roll < .02 ? 'legendary' : roll < .14 ? 'rare' : roll < .54 ? 'magic' : 'common'
    : roll < .002 ? 'legendary' : roll < .017 ? 'rare' : roll < .117 ? 'magic' : 'common';
  const slot = slots[Math.floor(Math.random() * slots.length)];
  const zweihander = slot === 'weapon' && (rarity === 'legendary' || Math.random() < .35);
  const base = slot === 'ring2' ? '반지' : slotNames[slot];
  const prefix = { common: '낡은', magic: '서리의', rare: '황혼의', legendary: '영원의' }[rarity];
  const scale = (1 + Math.floor(floor / 2)) * ({ common: 1, magic: 2, rare: 3, legendary: 5 }[rarity]);
  const primary: Stat = ['weapon', 'ring1', 'ring2', 'gloves'].includes(slot) ? 'attack' : 'defense';
  const stats: Partial<Record<Stat, number>> = { [primary]: scale + Math.ceil(Math.random() * 3) };
  if (rarity !== 'common') stats.health = 3 * scale;
  if (rarity === 'rare' || rarity === 'legendary') stats.crit = scale;
  if (rarity === 'legendary') stats.speed = scale;
  if (zweihander) {
    stats.attack = (stats.attack ?? 0) + 2 + Math.ceil(scale * .25);
    if (rarity !== 'common') stats.crit = (stats.crit ?? 0) + Math.max(1, Math.ceil(scale * .5));
  }
  return { id: crypto.randomUUID(), name: slot === 'weapon' ? zweihander ? zweihanderNames[rarity] : weaponNames[rarity] : `${prefix} ${base}`, slot, rarity, stats };
}

export function itemPower(item: Item): number {
  return (item.stats.attack ?? 0) * 3 + (item.stats.defense ?? 0) * 2 + (item.stats.health ?? 0) * .2 + (item.stats.crit ?? 0) * 2 + (item.stats.speed ?? 0) * 2;
}

export function autoEquipBest(save: Save): number {
  let changed = 0;
  for (const slot of slots.filter(slot => slot !== 'ring1' && slot !== 'ring2')) {
    const current = save.equipment[slot];
    const best = save.bag.filter(item => item.slot === slot).sort((a, b) => itemPower(b) - itemPower(a))[0];
    if (!best || (current && itemPower(best) <= itemPower(current))) continue;
    save.bag.splice(save.bag.findIndex(item => item.id === best.id), 1);
    if (current) save.bag.push(current);
    save.equipment[slot] = best;
    changed++;
  }
  const ringSlots: Slot[] = ['ring1', 'ring2'];
  const equippedRings = ringSlots.map(slot => save.equipment[slot]).filter((item): item is Item => !!item);
  const bagRings = save.bag.filter(item => ringSlots.includes(item.slot));
  const bestRings = [...equippedRings, ...bagRings].sort((a, b) => itemPower(b) - itemPower(a)).slice(0, 2);
  const used = new Set(bestRings.map(item => item.id));
  save.bag = save.bag.filter(item => !used.has(item.id));
  for (const item of equippedRings) if (!used.has(item.id)) save.bag.push(item);
  for (const [index, slot] of ringSlots.entries()) {
    const next = bestRings[index];
    if (save.equipment[slot]?.id !== next?.id) changed++;
    if (next) save.equipment[slot] = next;
    else delete save.equipment[slot];
  }
  if (save.tutorial === 2 && save.equipment.weapon) save.tutorial = 3;
  return changed;
}

export function salvageByRarity(save: Save, maxRarity: Exclude<Rarity, 'legendary'>): { count: number; gold: number; stones: number } {
  const ranks: Record<Rarity, number> = { common: 0, magic: 1, rare: 2, legendary: 3 };
  const chosen = save.bag.filter(item => ranks[item.rarity] <= ranks[maxRarity]);
  const gold = chosen.reduce((sum, item) => sum + ({ common: 3, magic: 10, rare: 25, legendary: 60 })[item.rarity], 0);
  const stones = chosen.reduce((sum, item) => sum + (item.rarity === 'common' ? 1 : 2), 0);
  const ids = new Set(chosen.map(item => item.id));
  save.bag = save.bag.filter(item => !ids.has(item.id));
  save.gold += gold; save.stones += stones;
  return { count: chosen.length, gold, stones };
}
