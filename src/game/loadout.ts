import type { Save } from './store';
import { jobOrDefault, skillOrderFor, type Job, type SkillId } from './skills';
export type QuickSlots = [SkillId | null, SkillId | null, SkillId | null];
export function normalizeQuickSlots(raw: unknown, learned: SkillId[], job: Job = 'warrior'): QuickSlots {
  const slots: QuickSlots = [null, null, null], used = new Set<SkillId>(), order = skillOrderFor(job);
  if (Array.isArray(raw)) for (let index = 0; index < 3; index++) {
    const id = raw[index];
    if (order.includes(id) && learned.includes(id) && !used.has(id)) { slots[index] = id; used.add(id); }
  }
  return slots;
}
export function availableSkills(save: Save): SkillId[] { return skillOrderFor(jobOrDefault(save.job)).filter(id => save.learned.includes(id) && !save.quickSlots.includes(id)); }
export function equipSkill(save: Save, id: SkillId, slot: number): { ok: boolean; message: string } {
  if (!Number.isInteger(slot) || slot < 0 || slot > 2) return { ok: false, message: '장착할 스킬 원을 선택하세요.' };
  if (!save.learned.includes(id)) return { ok: false, message: '먼저 스킬북으로 습득해야 합니다.' };
  if (save.quickSlots.includes(id)) return { ok: false, message: '이미 장착된 스킬입니다.' };
  save.quickSlots[slot] = id;
  return { ok: true, message: '스킬을 장착했습니다.' };
}
export function unequipSkill(save: Save, id: SkillId): { ok: boolean; message: string } {
  const slot = save.quickSlots.indexOf(id);
  if (slot < 0) return { ok: false, message: '장착되지 않은 스킬입니다.' };
  save.quickSlots[slot] = null;
  return { ok: true, message: `${slot + 1}번 스킬 원에서 해제했습니다.` };
}
