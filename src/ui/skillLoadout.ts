import { availableSkills, equipSkill, recommendedLoadouts, recommendedSkillOrder } from '../game/loadout';
import { jobOrDefault, skillDamageScale, skills, type SkillId } from '../game/skills';
import { skillLevel } from '../game/store';
import { setSkillIcon } from './skillArtwork';
import type { Interface } from './interface';
export function cancelSkillSelection(this: Interface): void {
  this.skillTarget = undefined; this.pendingSkill = undefined;
  this.root.querySelector('.slot-choice-prompt')?.remove();
  closeSkillPicker.call(this);
  this.tick();
}
/**
 * 빈 스킬 원(`+`)을 눌렀을 때 뜨는 전용 선택 팝업(작업 245).
 *
 * 전체 스킬 창(패시브·미습득·스킬북 포함) 대신 **지금 이 원에 장착할 수 있는 스킬**만 보여 준다.
 * 순서는 추천과 같은 **초당 딜량 내림차순**이고, 1번 원은 직업 버프를 맨 앞에 둔다. 맨 위 한 줄에만
 * `추천` 배지를 붙이고, 줄을 누르면 그 자리에 바로 장착하고 닫는다.
 */
export function openSkillPicker(this: Interface, index: number): void {
  const shell = this.root.querySelector('.game-shell');
  if (!shell) return;
  closeSkillPicker.call(this);
  const save = this.world.save;
  const available = availableSkills(save);
  const buff = recommendedLoadouts[jobOrDefault(save.job)].buff;
  const attacks = recommendedSkillOrder(save).filter(id => id !== buff && available.includes(id));
  const rows: SkillId[] = index === 0
    ? [...(available.includes(buff) ? [buff] : []), ...attacks]
    : [...attacks, ...(available.includes(buff) ? [buff] : [])];
  const overlay = document.createElement('div'); overlay.className = 'skill-picker';
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${index + 1}번 스킬 원 장착`);
  const card = document.createElement('div'); card.className = 'skill-picker-card';
  const head = document.createElement('div'); head.className = 'skill-picker-head';
  const title = document.createElement('b'); title.textContent = `${index + 1}번 스킬 원에 장착할 스킬`;
  const close = document.createElement('button'); close.type = 'button'; close.className = 'skill-picker-close';
  close.textContent = '닫기'; close.setAttribute('aria-label', '장착 선택 닫기');
  const dismiss = () => { closeSkillPicker.call(this); this.tick(); };
  close.onclick = dismiss;
  overlay.onclick = (event?: { target?: unknown }) => { if (!event || event.target === overlay) dismiss(); };
  head.append(title, close);
  const list = document.createElement('div'); list.className = 'skill-picker-list';
  rows.forEach((id, rank) => {
    const skill = skills[id], level = skillLevel(save, id);
    const row = document.createElement('button'); row.type = 'button';
    row.className = `skill-picker-row${rank === 0 ? ' is-recommended' : ''}`;
    row.dataset.skill = id;
    const icon = document.createElement('span'); icon.className = 'skill-picker-icon';
    setSkillIcon(icon, id);
    const info = document.createElement('span'); info.className = 'skill-picker-info';
    const name = document.createElement('b'); name.textContent = skill.name;
    if (rank === 0) {
      const badge = document.createElement('span'); badge.className = 'skill-recommend-badge'; badge.textContent = '추천';
      name.append(badge);
    }
    const summary = document.createElement('small');
    summary.textContent = id === buff
      ? `Lv.${level} · 공격 버프 · 쿨 ${skill.cooldown}초`
      : `Lv.${level} · 위력 +${Math.round((skillDamageScale(level) - 1) * 100)}% · 쿨 ${skill.cooldown}초`;
    info.append(name, summary);
    row.append(icon, info);
    row.setAttribute('aria-label', rank === 0 ? `${skill.name} 추천 · ${index + 1}번 원에 장착` : `${skill.name} · ${index + 1}번 원에 장착`);
    row.onclick = () => {
      const result = equipSkill(save, id, index);
      if (result.ok) { this.skillTarget = undefined; closeSkillPicker.call(this); this.world.onChange(); refreshSkillWindow.call(this); }
      this.message(`${skill.name}: ${result.message}`);
    };
    list.append(row);
  });
  card.append(head, list);
  overlay.append(card);
  shell.appendChild(overlay);
  this.tick();
}
/**
 * 스킬 창이 열려 있으면 다시 그린다 — 스킬 창은 사냥 중에 스스로 갱신되지 않으므로(2026-11-25 스크롤 개선)
 * 스킬 원 장착처럼 창 밖에서 바뀌는 결과도 여기서 한 번 반영한다. 창이 닫혀 있으면 아무 일도 하지 않는다.
 */
export function refreshSkillWindow(this: Interface): void {
  if (this.openModal === 'skills') this.renderModal();
}
/** 열려 있는 선택 팝업을 닫는다. */
export function closeSkillPicker(this: Interface): void {
  this.root.querySelector('.skill-picker')?.remove();
}
export function chooseSkill(this: Interface, id: SkillId): void {
  if (!availableSkills(this.world.save).includes(id) || this.world.paused) return;
  if (this.skillTarget !== undefined) {
    const result = equipSkill(this.world.save, id, this.skillTarget);
    if (result.ok) { cancelSkillSelection.call(this); this.open(null); this.world.onChange(); refreshSkillWindow.call(this); }
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
  closeSkillPicker.call(this);
  if (this.pendingSkill) {
    const id = this.pendingSkill, result = equipSkill(this.world.save, id, index);
    if (result.ok) { cancelSkillSelection.call(this); this.world.onChange(); refreshSkillWindow.call(this); }
    this.message(`${skills[id].name}: ${result.message}`); return;
  }
  const skill = this.world.save.quickSlots[index];
  if (skill) { this.world.action(skill); return; }
  if (!availableSkills(this.world.save).length) { this.message('스킬 트리에서 SP를 투자해 스킬을 습득하면 장착할 수 있습니다.'); return; }
  // 작업 245: 전체 스킬 창이 아니라 이 원에 넣을 수 있는 스킬만 고르는 팝업을 띄운다.
  openSkillPicker.call(this, index);
}
