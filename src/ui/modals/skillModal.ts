import { skillLevel } from '../../game/store';
import { MAX_SKILL_LEVEL, passiveOrder, passives, skillDuration, skillOrder, skillRange, skills } from '../../game/skills';
import type { Interface } from '../interface';

export function renderSkills(this: Interface, dialog: HTMLElement): void {
    const list = document.createElement('div'); list.className = 'skill-list';
    const save = this.world.save;
    const note = document.createElement('p'); note.className = 'skill-note';
    note.textContent = '사냥에서 스킬북을 획득해 가방에서 사용하면 스킬을 습득하거나 강화합니다.';
    list.appendChild(note);
    const base = document.createElement('article'); base.className = 'skill-card';
    base.innerHTML = '<div class="skill-icon">⚔</div><div class="skill-info"><h3>대검 베기 <small>Lv.1 · 기본 보유</small></h3><p>묵직한 두손검 횡베기로 전방 넓은 부채꼴을 공격합니다.</p><small>마나 0 · 기본 쿨타임 0.48초 · 공격력 × 1.0 · 고정 슬롯</small></div>';
    list.appendChild(base);
    for (const id of skillOrder) {
      const skill = skills[id], learned = save.learned.includes(id), level = learned ? skillLevel(save, id) : 1;
      const growth = id === 'warcry' ? `공격 버프 +${50 + (level - 1) * 5}%` : `위력 +${(level - 1) * 10}%`;
      const card = document.createElement('article'); card.className = 'skill-card'; card.dataset.skill = id;
      card.innerHTML = `<div class="skill-icon">${skill.icon}</div><div class="skill-info"><h3>${skill.name} <small>권장 Lv.${skill.level}</small></h3><p>${skill.description}</p><strong class="skill-level">${learned ? `스킬 Lv.${level} / ${MAX_SKILL_LEVEL}` : '미습득 (스킬북 파밍 필요)'}</strong><small>마나 ${skill.cost} · 쿨타임 ${skill.cooldown}초 · 지속 ${skillDuration(id, level).toFixed(1)}초 · 범위 ${skillRange(id, level)} · ${growth}</small><div class="skill-actions"></div></div>`;
      const actions = card.querySelector<HTMLElement>('.skill-actions')!;
      if (!learned) {
        const state = document.createElement('span'); state.textContent = '미습득 (스킬북 파밍 필요)'; actions.appendChild(state);
      } else {
        const state = document.createElement('span'); state.textContent = '습득 완료'; actions.appendChild(state);
        for (let slot = 0; slot < 3; slot++) {
          const button = document.createElement('button'); button.textContent = `슬롯 ${slot + 1}`;
          button.classList.toggle('active', save.quickSlots[slot] === id);
          button.onclick = () => {
            const other = save.quickSlots.indexOf(id);
            if (other !== slot && other >= 0) save.quickSlots[other] = save.quickSlots[slot];
            save.quickSlots[slot] = id; this.world.onChange();
          };
          actions.appendChild(button);
        }
      }
      list.appendChild(card);
    }
    const heading = document.createElement('h3'); heading.className = 'skill-group-title'; heading.textContent = '패시브 스킬'; list.appendChild(heading);
    for (const id of passiveOrder) {
      const passive = passives[id], learned = save.passives.includes(id), level = learned ? skillLevel(save, id) : 1;
      const card = document.createElement('article'); card.className = 'skill-card';
      const bonus = id === 'mastery' ? `공격 +${15 + (level - 1) * 2}%` : id === 'body' ? `HP·방어 +${15 + (level - 1) * 2}%` : `치명 +${8 + (level - 1) * 2}% · 공속 +${12 + (level - 1) * 2}%`;
      card.innerHTML = `<div class="skill-icon">${passive.icon}</div><div class="skill-info"><h3>${passive.name} <small>권장 Lv.${passive.level}</small></h3><p>${passive.description}</p><strong class="skill-level">${learned ? `스킬 Lv.${level} / ${MAX_SKILL_LEVEL}` : '미습득 (스킬북 파밍 필요)'}</strong><small>${bonus}</small><div class="skill-actions"></div></div>`;
      const action = card.querySelector<HTMLElement>('.skill-actions')!;
      if (learned) { const state = document.createElement('span'); state.textContent = '습득 완료 · 상시 적용'; action.appendChild(state); }
      else {
        const state = document.createElement('span'); state.textContent = '미습득 (스킬북 파밍 필요)'; action.appendChild(state);
      }
      list.appendChild(card);
    }
    dialog.appendChild(list);
  }
