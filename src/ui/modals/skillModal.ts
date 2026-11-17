import {setSkillIcon, setPassiveSkillIcon} from '../skillArtwork';
import { markSkillUpgrade, renderSkillBooks, renderSkillUpgrade } from '../skillBooks';
import { orderedSkills } from '../itemOrder';
import { availableSkills, unequipSkill } from '../../game/loadout';
import { skillLevel } from '../../game/store';
import { MAX_SKILL_LEVEL, passiveOrder, passives, skillDuration, skillRange, skills } from '../../game/skills';
import type { Interface } from '../interface';

export function renderSkills(this: Interface, dialog: HTMLElement): void {
    const list = document.createElement('div'); list.className = 'skill-list';
    const save = this.world.save;
    const note = document.createElement('p'); note.className = 'skill-note';
    note.textContent = this.skillTarget !== undefined ? `${this.skillTarget + 1}번 스킬 원에 장착할 스킬을 선택하세요.` : '스킬북으로 습득·강화합니다. 장착 중인 스킬은 해제할 수 있고, 필드의 + 원에서 다시 장착할 수 있습니다.';
    list.appendChild(note);
    renderSkillBooks(this, list);
    const base = document.createElement('article'); base.className = 'skill-card';
    base.innerHTML = '<div class="skill-icon">⚔</div><div class="skill-info"><h3>대검 베기 <small>Lv.1 · 기본 보유</small></h3><p>묵직한 두손검 횡베기로 전방 넓은 부채꼴을 공격합니다.</p><small>기본 쿨타임 0.48초 · 공격력 × 1.0 · 고정 슬롯</small></div>';
    const baseIcon=base.querySelector<HTMLElement>('.skill-icon')!;baseIcon.textContent='';baseIcon.className='skill-icon skill-image-icon';setSkillIcon(baseIcon,'attack');
    list.appendChild(base);
    for (const id of orderedSkills(save)) {
      const skill = skills[id], learned = save.learned.includes(id), level = learned ? skillLevel(save, id) : 1;
      const growth = id === 'warcry' ? `공격 버프 +${50 + (level - 1) * 5}%` : `위력 +${(level - 1) * 10}%`;
      const card = document.createElement('article'); card.className = 'skill-card'; card.dataset.skill = id;
      card.innerHTML = `<div class="skill-icon">${skill.icon}</div><div class="skill-info"><h3>${skill.name} <small>권장 Lv.${skill.level}</small></h3><p>${skill.description}</p><strong class="skill-level">${learned ? `스킬 Lv.${level} / ${MAX_SKILL_LEVEL}` : '미습득 (스킬북 파밍 필요)'}</strong><small>쿨타임 ${skill.cooldown}초 · 지속 ${skillDuration(id, level).toFixed(1)}초 · 범위 ${skillRange(id, level)} · ${growth}</small><div class="skill-actions"></div></div>`;
      const icon=card.querySelector<HTMLElement>('.skill-icon')!;icon.textContent='';icon.className='skill-icon skill-image-icon';setSkillIcon(icon,id);
      const actions = card.querySelector<HTMLElement>('.skill-actions')!;
      if (!learned) {
        const state = document.createElement('span'); state.textContent = '미습득 (스킬북 파밍 필요)'; actions.appendChild(state);
      } else {
        const state = document.createElement('span'); state.textContent = '습득 완료'; actions.appendChild(state);
        if (save.quickSlots.includes(id)) {
          const equipped = document.createElement('span'); equipped.className = 'skill-equipped'; equipped.textContent = '장착 중'; actions.appendChild(equipped);
          const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '해제'; remove.setAttribute('aria-label', `${skill.name} 장착 해제`);
          remove.onclick = () => {
            if (this.world.paused || this.market.busy || this.market.sync.locked) { this.message('동기화 중에는 스킬을 해제할 수 없습니다. 잠시 후 다시 시도하세요.'); return; }
            const result = unequipSkill(save, id);
            this.message(`${skill.name}: ${result.message}`);
            if (result.ok) this.world.onChange();
          };
          actions.appendChild(remove);
        } else if (availableSkills(save).includes(id) && (this.skillTarget !== undefined || save.quickSlots.every(slot => slot !== null))) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = '장착하기';
          button.onclick = () => this.chooseSkill(id); actions.appendChild(button);
        } else {
          const hint = document.createElement('span'); hint.textContent = '필드의 + 원에서 장착'; actions.appendChild(hint);
        }
      }
      renderSkillUpgrade(this, actions, id); markSkillUpgrade(this, card, id);
      list.appendChild(card);
    }
    const heading = document.createElement('h3'); heading.className = 'skill-group-title'; heading.textContent = '패시브 스킬'; list.appendChild(heading);
    const passivesGrid = document.createElement('div'); passivesGrid.className = 'passive-skill-grid';
    for (const id of passiveOrder) {
      const passive = passives[id], learned = save.passives.includes(id), level = learned ? skillLevel(save, id) : 1;
      const card = document.createElement('article'); card.className = 'skill-card passive-skill-card'; card.dataset.skill = id;
      const bonus = id === 'mastery' ? `공격 +${15 + (level - 1) * 2}%` : id === 'body' ? `HP·방어 +${15 + (level - 1) * 2}%` : `치명 +${8 + (level - 1) * 2}% · 공속 +${12 + (level - 1) * 2}%`;
      card.innerHTML = `<div class="skill-icon">${passive.icon}</div><div class="skill-info"><h3>${passive.name} <small>권장 Lv.${passive.level}</small></h3><p>${passive.description}</p><strong class="skill-level">${learned ? `스킬 Lv.${level} / ${MAX_SKILL_LEVEL}` : '미습득 (스킬북 파밍 필요)'}</strong><small>${bonus}</small><div class="skill-actions"></div></div>`;
      const icon=card.querySelector<HTMLElement>('.skill-icon')!;icon.textContent='';icon.className='skill-icon skill-image-icon passive-image-icon';setPassiveSkillIcon(icon,id);
      const action = card.querySelector<HTMLElement>('.skill-actions')!;
      renderSkillUpgrade(this, action, id); markSkillUpgrade(this, card, id);
      passivesGrid.appendChild(card);
    }
    list.appendChild(passivesGrid);
    dialog.appendChild(list);
  }
