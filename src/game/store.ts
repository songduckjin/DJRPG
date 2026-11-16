import { isSkillBook, migrateItem, slots, totalStats, type EquipmentItem, type Item, type Slot } from './items';
export { slots, slotNames, rarityNames, statNames, isZweihander, totalStats, rollItem, itemPower, autoEquipBest, salvageByRarity } from './items';
export type { Rarity, Slot, Stat, Item } from './items';
import { MAX_SKILL_LEVEL, passiveOrder, skillOrder, type PassiveId, type SkillId, type SkillLevelId } from './skills';

export type Gender = 'male' | 'female';
export const MAX_LEVEL = 30;

export type Save = { version: 1; name: string; accountId: string; gender: Gender; auto: boolean; autoClimb: boolean; level: number; exp: number; gold: number; floor: number; maxFloor: number; floorKills: number; kills: number; health: number; equipment: Partial<Record<Slot, EquipmentItem>>; bag: Item[]; tutorial: number; stones: number; skillPoints: number; lastActiveAt: number; learned: SkillId[]; passives: PassiveId[]; quickSlots: [SkillId, SkillId, SkillId]; skillLevels: Partial<Record<SkillLevelId, number>> };

const legacyKeys = ['djrpg-save-v1', 'djrpg.save.v1', 'djrpg.save.v1.guest'];
export function readLegacySave(loginId?: string): { save: Save; key: string } | undefined {
  let keys = legacyKeys;
  if (loginId) {
    const raw = localStorage.getItem('djrpg.accounts.v1');
    const records: unknown = raw ? JSON.parse(raw) : [];
    const account = Array.isArray(records) ? records.find(value => isRecord(value) && typeof value.loginId === 'string' && value.loginId.toLocaleLowerCase('ko-KR') === loginId.toLocaleLowerCase('ko-KR') && typeof value.id === 'string') : undefined;
    keys = account ? [`djrpg.save.v1.${account.id}`] : [];
  }
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    return { save: parseSave(JSON.parse(raw)), key };
  }
  return undefined;
}
export function clearLegacySave(key: string): void {
  localStorage.removeItem(key);
  if (key.startsWith('djrpg.save.v1.') && key !== 'djrpg.save.v1.guest') {
    const raw = localStorage.getItem('djrpg.accounts.v1');
    if (raw) {
      const records: unknown = JSON.parse(raw);
      if (Array.isArray(records)) {
        const remaining = records.filter(value => !isRecord(value) || value.id !== key.slice('djrpg.save.v1.'.length));
        if (remaining.length) localStorage.setItem('djrpg.accounts.v1', JSON.stringify(remaining));
        else localStorage.removeItem('djrpg.accounts.v1');
      }
    }
  }
  localStorage.removeItem('djrpg.lastLogin.v1');
  localStorage.removeItem('djrpg-salvage-rarity');
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function safeNumber(value: unknown, fallback: number, min = 0): number { return typeof value === 'number' && Number.isFinite(value) && value >= min ? value : fallback; }

export function expToNext(level: number): number { return Math.round(2400 * Math.pow(level, 2.2)); }
export function floorKillTarget(floor: number): number { return 120 + 40 * Math.max(0, floor - 1); }

export function freshSave(gender: Gender = 'male'): Save {
  return { version: 1, name: '모험가', accountId: crypto.randomUUID().slice(0, 8).toUpperCase(), gender, auto: true, autoClimb: true, level: 1, exp: 0, gold: 0, floor: 1, maxFloor: 1, floorKills: 0, kills: 0, health: 100, equipment: {}, bag: [], tutorial: 0, stones: 0, skillPoints: 0, lastActiveAt: Date.now(), learned: [], passives: [], quickSlots: ['slash2', 'spin', 'slam'], skillLevels: {} };
}

export function parseSave(data: unknown, accountId?: string): Save {
  try {
    if (typeof data !== 'object' || data === null) throw new Error('저장 데이터가 손상되었습니다.');
    const value = data as Partial<Save>;
    if (value.version !== 1) throw new Error('지원하지 않는 저장 버전입니다.');
    const defaults = freshSave(value.gender === 'female' ? 'female' : 'male');
    if (accountId) defaults.accountId = accountId;
    const quickSlots = Array.isArray(value.quickSlots) && value.quickSlots.length === 3 && value.quickSlots.every(id => skillOrder.includes(id)) && new Set(value.quickSlots).size === 3
      ? value.quickSlots as [SkillId, SkillId, SkillId] : defaults.quickSlots;
    const learned = Array.isArray(value.learned) ? value.learned.filter(id => skillOrder.includes(id)) : defaults.learned;
    const active = [...new Set(learned)];
    const passives = Array.isArray(value.passives) ? [...new Set(value.passives.filter(id => passiveOrder.includes(id)))] : [];
    const storedLevels = isRecord(value.skillLevels) ? value.skillLevels : {};
    const skillLevels = Object.fromEntries([...active, ...passives].map(id => {
      const rawLevel = storedLevels[id];
      return [id, typeof rawLevel === 'number' && Number.isFinite(rawLevel) ? Math.max(1, Math.min(MAX_SKILL_LEVEL, Math.floor(rawLevel))) : 1];
    })) as Partial<Record<SkillLevelId, number>>;
    const equipment: Save['equipment'] = {};
    if (isRecord(value.equipment)) for (const slot of slots) {
      const item = migrateItem(value.equipment[slot]);
      if (item?.slot === slot && !isSkillBook(item)) equipment[slot] = item;
    }
    const bag = Array.isArray(value.bag) ? value.bag.map(migrateItem).filter((item): item is Item => !!item).slice(0, 40) : [];
    const floor = Math.floor(safeNumber(value.floor, defaults.floor, 1));
    const level = Math.min(MAX_LEVEL, Math.floor(safeNumber(value.level, defaults.level, 1)));
    const invested = Object.values(skillLevels).reduce<number>((sum, rank) => sum + Math.max(0, (rank ?? 1) - 1), 0);
    const skillPoints = Math.floor(safeNumber(value.skillPoints, Math.max(0, level - 1 - invested)));
    return { ...defaults, name: typeof value.name === 'string' && value.name.trim() ? value.name : defaults.name, accountId: accountId ?? (typeof value.accountId === 'string' && value.accountId ? value.accountId : defaults.accountId), gender: value.gender === 'female' ? 'female' : 'male', auto: true, autoClimb: typeof value.autoClimb === 'boolean' ? value.autoClimb : true, level, exp: level >= MAX_LEVEL ? 0 : safeNumber(value.exp, defaults.exp), gold: Math.floor(safeNumber(value.gold, defaults.gold)), floor, maxFloor: Math.max(floor, Math.floor(safeNumber(value.maxFloor, floor, 1))), floorKills: Math.min(floorKillTarget(floor), Math.floor(safeNumber(value.floorKills, 0))), kills: Math.floor(safeNumber(value.kills, defaults.kills)), health: safeNumber(value.health, defaults.health), equipment, bag, tutorial: Math.min(3, Math.floor(safeNumber(value.tutorial, defaults.tutorial))), stones: Math.floor(safeNumber(value.stones, defaults.stones)), skillPoints, lastActiveAt: safeNumber(value.lastActiveAt, Date.now()), learned: active, passives, quickSlots, skillLevels };
  } catch (error) {
    throw new Error(`저장 데이터를 읽지 못했습니다: ${String(error)}`);
  }
}

export function skillLevel(save: Save, id: SkillLevelId): number { return save.skillLevels[id] ?? 1; }
export function addExperience(save: Save, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0 || save.level >= MAX_LEVEL) return 0;
  save.exp += amount;
  let gained = 0;
  while (save.level < MAX_LEVEL && save.exp >= expToNext(save.level)) {
    save.exp -= expToNext(save.level);
    save.level++;
    save.health = totalStats(save).health;
    gained++;
  }
  if (save.level >= MAX_LEVEL) save.exp = 0;
  return gained;
}
export function useSkillBook(save: Save, itemId: string): { ok: boolean; message: string } {
  const index = save.bag.findIndex(item => item.id === itemId);
  if (index < 0) return { ok: false, message: '가방에 스킬북이 없습니다.' };
  const item = save.bag[index];
  if (!isSkillBook(item)) return { ok: false, message: '스킬북만 사용할 수 있습니다.' };
  const id = item.skillId;
  const learned = skillOrder.includes(id as SkillId) ? save.learned.includes(id as SkillId) : save.passives.includes(id as PassiveId);
  const level = learned ? skillLevel(save, id) : 0;
  if (level >= MAX_SKILL_LEVEL) return { ok: false, message: '이미 최고 스킬 레벨입니다.' };
  if (!learned) {
    if (skillOrder.includes(id as SkillId)) save.learned.push(id as SkillId);
    else save.passives.push(id as PassiveId);
  }
  save.skillLevels[id] = level + 1;
  save.bag.splice(index, 1);
  return { ok: true, message: `${item.name} ${level ? `Lv.${level + 1} 강화!` : '습득!'}` };
}
