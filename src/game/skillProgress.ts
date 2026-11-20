import type { Save } from './store';
import { isSkillBook } from './items';
import { MAX_SKILL_LEVEL, passiveOrderFor, skillOrderFor, type SkillLevelId } from './skills';
import { jobOrDefault } from './skills';

export function skillBookCost(targetLevel: number): number { return Math.ceil(Math.max(1, targetLevel) / 5); }
export function skillBookStatus(save: Save, id: SkillLevelId) {
  const learned = [...save.learned, ...save.passives].includes(id);
  const level = learned ? save.skillLevels[id] ?? 1 : 0;
  const count = save.bag.filter(item => isSkillBook(item) && item.skillId === id).length;
  const cost = skillBookCost(level + 1), maxed = level >= MAX_SKILL_LEVEL;
  return { level, count, cost, maxed, ready: !maxed && count >= cost };
}
export function hasSkillUpgrade(save: Save): boolean {
  const job = jobOrDefault(save.job);
  return [...skillOrderFor(job), ...passiveOrderFor(job)].some(id => skillBookStatus(save, id).ready);
}
