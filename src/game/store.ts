import { passiveOrder, skillOrder, type PassiveId, type SkillId } from './skills';

export type Gender = 'male' | 'female';
export type Rarity = 'common' | 'magic' | 'rare' | 'legendary';
export type Slot = 'weapon' | 'offhand' | 'helmet' | 'armor' | 'necklace' | 'gloves' | 'belt' | 'boots' | 'ring1' | 'ring2';
export type Stat = 'attack' | 'defense' | 'health' | 'crit' | 'speed';
export type Item = { id: string; name: string; slot: Slot; rarity: Rarity; stats: Partial<Record<Stat, number>> };
export type Save = { version: 1; name: string; accountId: string; gender: Gender; auto: boolean; level: number; exp: number; gold: number; floor: number; kills: number; health: number; equipment: Partial<Record<Slot, Item>>; bag: Item[]; tutorial: number; stones: number; learned: SkillId[]; passives: PassiveId[]; quickSlots: [SkillId, SkillId, SkillId] };

export const slots: Slot[] = ['weapon', 'offhand', 'helmet', 'armor', 'necklace', 'gloves', 'belt', 'boots', 'ring1', 'ring2'];
export const slotNames: Record<Slot, string> = { weapon: '무기(두손검)', offhand: '문장', helmet: '투구', armor: '갑옷', necklace: '목걸이', gloves: '장갑', belt: '벨트', boots: '신발', ring1: '반지 1', ring2: '반지 2' };
export const rarityNames: Record<Rarity, string> = { common: '일반', magic: '마법', rare: '희귀', legendary: '전설' };
export const statNames: Record<Stat, string> = { attack: '공격', defense: '방어', health: '체력', crit: '치명', speed: '공속' };
const key = 'djrpg-save-v1';
export function expToNext(level: number): number { return Math.round(800 * Math.pow(level, 2.1)); }

export function freshSave(gender: Gender = 'male'): Save {
  return { version: 1, name: '모험가', accountId: crypto.randomUUID().slice(0, 8).toUpperCase(), gender, auto: true, level: 1, exp: 0, gold: 0, floor: 1, kills: 0, health: 100, equipment: {}, bag: [], tutorial: 0, stones: 0, learned: ['spin', 'slam', 'warcry'], passives: [], quickSlots: ['spin', 'slam', 'warcry'] };
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
    return { ...defaults, ...value, name: typeof value.name === 'string' && value.name.trim() ? value.name : '모험가', accountId: typeof value.accountId === 'string' && value.accountId ? value.accountId : crypto.randomUUID().slice(0, 8).toUpperCase(), auto: typeof value.auto === 'boolean' ? value.auto : true, equipment: value.equipment ?? {}, bag: Array.isArray(value.bag) ? value.bag : [], learned: [...new Set([...learned, ...slots])], passives: Array.isArray(value.passives) ? value.passives.filter(id => passiveOrder.includes(id)) : [], quickSlots: slots };
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
  if (save.passives.includes('mastery')) total.attack = Math.ceil(total.attack * 1.15);
  if (save.passives.includes('body')) { total.defense = Math.ceil(total.defense * 1.15); total.health = Math.ceil(total.health * 1.15); }
  if (save.passives.includes('instinct')) { total.crit += 8; total.speed += 12; }
  return total;
}

export function rollItem(floor: number, guaranteed = false, boss = false): Item {
  if (guaranteed) return { id: crypto.randomUUID(), name: '낡은 검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } };
  const roll = Math.random();
  const rarity: Rarity = boss
    ? roll < .04 ? 'legendary' : roll < .20 ? 'rare' : roll < .55 ? 'magic' : 'common'
    : roll < .005 ? 'legendary' : roll < .03 ? 'rare' : roll < .15 ? 'magic' : 'common';
  const slot = slots[Math.floor(Math.random() * slots.length)];
  const base = slot === 'weapon' ? { common: '대검', magic: '클레이모어', rare: '츠바이핸더', legendary: '용살자 대검' }[rarity] : slot === 'ring2' ? '반지' : slotNames[slot];
  const prefix = { common: '낡은', magic: '서리의', rare: '황혼의', legendary: '영원의' }[rarity];
  const scale = (1 + Math.floor(floor / 2)) * ({ common: 1, magic: 2, rare: 3, legendary: 5 }[rarity]);
  const primary: Stat = ['weapon', 'ring1', 'ring2', 'gloves'].includes(slot) ? 'attack' : 'defense';
  const stats: Partial<Record<Stat, number>> = { [primary]: scale + Math.ceil(Math.random() * 3) };
  if (rarity !== 'common') stats.health = 3 * scale;
  if (rarity === 'rare' || rarity === 'legendary') stats.crit = scale;
  if (rarity === 'legendary') stats.speed = scale;
  return { id: crypto.randomUUID(), name: `${prefix} ${base}`, slot, rarity, stats };
}
