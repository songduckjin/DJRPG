import { MAX_SKILL_LEVEL, passiveOrder, skillOrder, skillUpgradeCost, type PassiveId, type SkillId, type SkillLevelId } from './skills';

export type Gender = 'male' | 'female';
export type Rarity = 'common' | 'magic' | 'rare' | 'legendary';
export type Slot = 'weapon' | 'offhand' | 'helmet' | 'armor' | 'necklace' | 'gloves' | 'belt' | 'boots' | 'ring1' | 'ring2';
export type Stat = 'attack' | 'defense' | 'health' | 'crit' | 'speed';
export type Item = { id: string; name: string; slot: Slot; rarity: Rarity; stats: Partial<Record<Stat, number>> };
export type Save = { version: 1; name: string; accountId: string; gender: Gender; auto: boolean; level: number; exp: number; gold: number; floor: number; kills: number; health: number; equipment: Partial<Record<Slot, Item>>; bag: Item[]; tutorial: number; stones: number; learned: SkillId[]; passives: PassiveId[]; quickSlots: [SkillId, SkillId, SkillId]; skillLevels: Partial<Record<SkillLevelId, number>> };

export const slots: Slot[] = ['weapon', 'offhand', 'helmet', 'armor', 'necklace', 'gloves', 'belt', 'boots', 'ring1', 'ring2'];
export const slotNames: Record<Slot, string> = { weapon: '두손검', offhand: '문장', helmet: '투구', armor: '갑옷', necklace: '목걸이', gloves: '장갑', belt: '벨트', boots: '신발', ring1: '반지 1', ring2: '반지 2' };
export const rarityNames: Record<Rarity, string> = { common: '일반', magic: '마법', rare: '희귀', legendary: '전설' };
export const statNames: Record<Stat, string> = { attack: '공격', defense: '방어', health: '체력', crit: '치명', speed: '공속' };
const key = 'djrpg-save-v1';
const weaponNames: Record<Rarity, string> = { common: '낡은 두손검', magic: '서리의 클레이모어', rare: '황혼의 대검', legendary: '영원의 츠바이핸더' };
function migrateItem(item: Item): Item { return item.slot === 'weapon' ? { ...item, name: weaponNames[item.rarity] } : item; }
export function expToNext(level: number): number { return Math.round(800 * Math.pow(level, 2.1)); }

export function freshSave(gender: Gender = 'male'): Save {
  return { version: 1, name: '모험가', accountId: crypto.randomUUID().slice(0, 8).toUpperCase(), gender, auto: true, level: 1, exp: 0, gold: 0, floor: 1, kills: 0, health: 100, equipment: {}, bag: [], tutorial: 0, stones: 0, learned: ['spin', 'slam', 'warcry'], passives: [], quickSlots: ['spin', 'slam', 'warcry'], skillLevels: { spin: 1, slam: 1, warcry: 1 } };
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return freshSave();
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) throw new Error('저장 데이터가 손상되었습니다.');
    const value = data as Partial<Save>;
    if (value.version !== 1) throw new Error('지원하지 않는 저장 버전입니다.');
    const defaults = freshSave(value.gender === 'female' ? 'female' : 'male');
    const slots = Array.isArray(value.quickSlots) && value.quickSlots.length === 3 && value.quickSlots.every(id => skillOrder.includes(id)) && new Set(value.quickSlots).size === 3
      ? value.quickSlots as [SkillId, SkillId, SkillId] : defaults.quickSlots;
    const learned = Array.isArray(value.learned) ? value.learned.filter(id => skillOrder.includes(id)) : defaults.learned;
    const active = [...new Set([...learned, ...slots])];
    const passives = Array.isArray(value.passives) ? value.passives.filter(id => passiveOrder.includes(id)) : [];
    const storedLevels = value.skillLevels && typeof value.skillLevels === 'object' ? value.skillLevels : {};
    const skillLevels = Object.fromEntries([...active, ...passives].map(id => {
      const rawLevel = storedLevels[id];
      return [id, Number.isFinite(rawLevel) ? Math.max(1, Math.min(MAX_SKILL_LEVEL, Math.floor(rawLevel!))) : 1];
    })) as Partial<Record<SkillLevelId, number>>;
    const equipment = Object.fromEntries(Object.entries(value.equipment ?? {}).map(([slot, item]) => [slot, item ? migrateItem(item) : item])) as Partial<Record<Slot, Item>>;
    return { ...defaults, ...value, name: typeof value.name === 'string' && value.name.trim() ? value.name : '모험가', accountId: typeof value.accountId === 'string' && value.accountId ? value.accountId : crypto.randomUUID().slice(0, 8).toUpperCase(), auto: typeof value.auto === 'boolean' ? value.auto : true, equipment, bag: Array.isArray(value.bag) ? value.bag.map(migrateItem) : [], learned: active, passives, quickSlots: slots, skillLevels };
  } catch (error) {
    window.dispatchEvent(new CustomEvent('game-message', { detail: `저장 데이터를 읽지 못했습니다: ${String(error)}` }));
    return freshSave();
  }
}

export function saveGame(save: Save): boolean {
  try { localStorage.setItem(key, JSON.stringify(save)); return true; }
  catch (error) { window.dispatchEvent(new CustomEvent('game-message', { detail: `진행 상황 저장 실패: ${String(error)}` })); return false; }
}

export function totalStats(save: Save): Record<Stat, number> {
  const total = { attack: 8 + save.level * 2, defense: 2 + save.level, health: 100 + (save.level - 1) * 12, crit: 2, speed: 0 };
  for (const item of Object.values(save.equipment)) if (item) {
    for (const stat of Object.keys(item.stats) as Stat[]) total[stat] += item.stats[stat] ?? 0;
  }
  if (save.passives.includes('mastery')) total.attack = Math.ceil(total.attack * (1.15 + (skillLevel(save, 'mastery') - 1) * .02));
  if (save.passives.includes('body')) { const bonus = 1.15 + (skillLevel(save, 'body') - 1) * .02; total.defense = Math.ceil(total.defense * bonus); total.health = Math.ceil(total.health * bonus); }
  if (save.passives.includes('instinct')) { total.crit += 8 + (skillLevel(save, 'instinct') - 1) * 2; total.speed += 12 + (skillLevel(save, 'instinct') - 1) * 2; }
  return total;
}

export function skillLevel(save: Save, id: SkillLevelId): number { return save.skillLevels[id] ?? 1; }
export function upgradeSkill(save: Save, id: SkillLevelId): { ok: boolean; message: string } {
  const learned = skillOrder.includes(id as SkillId) ? save.learned.includes(id as SkillId) : save.passives.includes(id as PassiveId);
  if (!learned) return { ok: false, message: '먼저 스킬을 습득해야 합니다.' };
  const level = skillLevel(save, id);
  if (level >= MAX_SKILL_LEVEL) return { ok: false, message: '이미 최고 스킬 레벨입니다.' };
  const cost = skillUpgradeCost(level);
  if (save.gold < cost) return { ok: false, message: `스킬 레벨업에 ${cost}골드가 필요합니다. (보유 ${save.gold}골드)` };
  save.gold -= cost;
  save.skillLevels[id] = level + 1;
  return { ok: true, message: `스킬 Lv.${level + 1} 달성!` };
}

export function rollItem(floor: number, guaranteed = false, boss = false): Item {
  if (guaranteed) return { id: crypto.randomUUID(), name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } };
  const roll = Math.random();
  const rarity: Rarity = boss
    ? roll < .02 ? 'legendary' : roll < .14 ? 'rare' : roll < .54 ? 'magic' : 'common'
    : roll < .002 ? 'legendary' : roll < .017 ? 'rare' : roll < .117 ? 'magic' : 'common';
  const slot = slots[Math.floor(Math.random() * slots.length)];
  const base = slot === 'ring2' ? '반지' : slotNames[slot];
  const prefix = { common: '낡은', magic: '서리의', rare: '황혼의', legendary: '영원의' }[rarity];
  const scale = (1 + Math.floor(floor / 2)) * ({ common: 1, magic: 2, rare: 3, legendary: 5 }[rarity]);
  const primary: Stat = ['weapon', 'ring1', 'ring2', 'gloves'].includes(slot) ? 'attack' : 'defense';
  const stats: Partial<Record<Stat, number>> = { [primary]: scale + Math.ceil(Math.random() * 3) };
  if (rarity !== 'common') stats.health = 3 * scale;
  if (rarity === 'rare' || rarity === 'legendary') stats.crit = scale;
  if (rarity === 'legendary') stats.speed = scale;
  return { id: crypto.randomUUID(), name: slot === 'weapon' ? weaponNames[rarity] : `${prefix} ${base}`, slot, rarity, stats };
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
