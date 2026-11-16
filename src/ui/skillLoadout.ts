import { availableSkills, equipSkill } from '../game/loadout';
import { skills, type SkillId } from '../game/skills';
import type { Interface } from './interface';
export function cancelSkillSelection(this: Interface): void {
  this.skillTarget = undefined; this.pendingSkill = undefined;
  this.root.querySelector('.slot-choice-prompt')?.remove();
  this.tick();
}
export function chooseSkill(this: Interface, id: SkillId): void {
  if (!availableSkills(this.world.save).includes(id) || this.world.paused) return;
  if (this.skillTarget !== undefined) {
    const result = equipSkill(this.world.save, id, this.skillTarget);
    if (result.ok) { cancelSkillSelection.call(this); this.open(null); this.world.onChange(); }
    this.message(`${skills[id].name}: ${result.message}`); return;
  }
  this.pendingSkill = id;
  this.open(null);
  const prompt = document.createElement('div'); prompt.className = 'slot-choice-prompt'; prompt.setAttribute('role', 'status');
  const text = document.createElement('span'); text.textContent = `${skills[id].name} · 장착할 스킬 원을 선택하세요`;
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '취소'; cancel.onclick = () => cancelSkillSelection.call(this);
  this.root.querySelector('.game-shell')!.appendChild(prompt); prompt.append(text, cancel);
  this.tick(); this.slotButtons[0].focus();
}
export function pressSkillSlot(this: Interface, index: number): void {
  if (!Number.isInteger(index) || index < 0 || index > 2) return;
  if (this.world.paused || this.market.sync.locked || this.market.busy) return;
  if (this.pendingSkill) {
    const id = this.pendingSkill, result = equipSkill(this.world.save, id, index);
    if (result.ok) { cancelSkillSelection.call(this); this.world.onChange(); }
    this.message(`${skills[id].name}: ${result.message}`); return;
  }
  const skill = this.world.save.quickSlots[index];
  if (skill) { this.world.action(skill); return; }
  if (!availableSkills(this.world.save).length) { this.message('스킬북으로 스킬을 습득하면 장착할 수 있습니다.'); return; }
  this.skillTarget = index;
  this.open('skills');
}
