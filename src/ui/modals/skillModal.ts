import { skillLevel, totalStats, upgradeSkill } from '../../game/store';
import { canLearn, MAX_SKILL_LEVEL, passiveOrder, passives, skillDuration, skillOrder, skillRange, skills, skillUpgradeCost, UNLOCK_ALL_SKILLS_FOR_TEST, type SkillLevelId } from '../../game/skills';
import type { Interface } from '../interface';

export function renderSkills(this: Interface, dialog: HTMLElement): void {
    const list = document.createElement('div'); list.className = 'skill-list';
    const save = this.world.save;
    const note = document.createElement('p'); note.className = 'skill-note';
    note.textContent = UNLOCK_ALL_SKILLS_FOR_TEST ? '테스트 모드: 레벨 제한 없이 모든 스킬을 습득할 수 있습니다. 요구 레벨은 정식 해금 기준입니다.' : '레벨을 올려 스킬을 해금하세요.';
    list.appendChild(note);
    const base = document.createElement('article'); base.className = 'skill-card';
    base.innerHTML = '<div class="skill-icon">⚔</div><div class="skill-info"><h3>대검 베기 <small>Lv.1 · 기본 보유</small></h3><p>묵직한 두손검 횡베기로 전방 넓은 부채꼴을 공격합니다.</p><small>마나 0 · 기본 쿨타임 0.48초 · 공격력 × 1.0 · 고정 슬롯</small></div>';
    list.appendChild(base);
    for (const id of skillOrder) {
      const skill = skills[id], learned = save.learned.includes(id), level = skillLevel(save, id);
      const growth = id === 'warcry' ? `공격 버프 +${50 + (level - 1) * 5}%` : `위력 +${(level - 1) * 10}%`;
      const card = document.createElement('article'); card.className = 'skill-card'; card.dataset.skill = id;
      card.innerHTML = `<div class="skill-icon">${skill.icon}</div><div class="skill-info"><h3>${skill.name} <small>요구 Lv.${skill.level}</small></h3><p>${skill.description}</p><strong class="skill-level">${learned ? `스킬 Lv.${level} / ${MAX_SKILL_LEVEL}` : '미습득 · 습득 시 스킬 Lv.1'}</strong><small>마나 ${skill.cost} · 쿨타임 ${skill.cooldown}초 · 지속 ${skillDuration(id, level).toFixed(1)}초 · 범위 ${skillRange(id, level)} · ${growth}</small><div class="skill-actions"></div></div>`;
      const actions = card.querySelector<HTMLElement>('.skill-actions')!;
      if (!learned) {
        const button = document.createElement('button'); button.textContent = canLearn(save.level, skill.level) ? '습득' : `Lv.${skill.level} 필요`;
        button.disabled = !canLearn(save.level, skill.level);
        button.onclick = () => { save.learned.push(id); save.skillLevels[id] = 1; this.world.onChange(); this.message(`${skill.name} 습득!`); };
        actions.appendChild(button);
      } else {
        const state = document.createElement('span'); state.textContent = '습득 완료'; actions.appendChild(state);
        this.addSkillUpgrade(actions, id, skill.name);
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
      const passive = passives[id], learned = save.passives.includes(id), level = skillLevel(save, id);
      const card = document.createElement('article'); card.className = 'skill-card';
      const bonus = id === 'mastery' ? `공격 +${15 + (level - 1) * 2}%` : id === 'body' ? `HP·방어 +${15 + (level - 1) * 2}%` : `치명 +${8 + (level - 1) * 2}% · 공속 +${12 + (level - 1) * 2}%`;
      card.innerHTML = `<div class="skill-icon">${passive.icon}</div><div class="skill-info"><h3>${passive.name} <small>요구 Lv.${passive.level}</small></h3><p>${passive.description}</p><strong class="skill-level">${learned ? `스킬 Lv.${level} / ${MAX_SKILL_LEVEL}` : '미습득 · 습득 시 스킬 Lv.1'}</strong><small>${bonus}</small><div class="skill-actions"></div></div>`;
      const action = card.querySelector<HTMLElement>('.skill-actions')!;
      if (learned) { const state = document.createElement('span'); state.textContent = '습득 완료 · 상시 적용'; action.appendChild(state); this.addSkillUpgrade(action, id, passive.name); }
      else {
        const button = document.createElement('button'); button.textContent = canLearn(save.level, passive.level) ? '습득' : `Lv.${passive.level} 필요`;
        button.disabled = !canLearn(save.level, passive.level);
        button.onclick = () => {
          const before = totalStats(save).health;
          save.passives.push(id);
          save.skillLevels[id] = 1;
          const gained = totalStats(save).health - before;
          this.world.player.hp += gained; save.health = this.world.player.hp;
          this.world.onChange(); this.message(`${passive.name} 습득!`);
        };
        action.appendChild(button);
      }
      list.appendChild(card);
    }
    dialog.appendChild(list);
  }

export function addSkillUpgrade(this: Interface, actions: HTMLElement, id: SkillLevelId, name: string): void {
    const level = skillLevel(this.world.save, id);
    const button = document.createElement('button');
    button.textContent = level >= MAX_SKILL_LEVEL ? '최대 레벨' : `레벨업 (${skillUpgradeCost(level)}골드)`;
    button.disabled = level >= MAX_SKILL_LEVEL;
    button.onclick = () => {
      const before = totalStats(this.world.save).health;
      const result = upgradeSkill(this.world.save, id);
      if (!result.ok) { this.message(result.message); return; }
      const gained = totalStats(this.world.save).health - before;
      this.world.player.hp += gained;
      this.world.save.health = this.world.player.hp;
      this.world.onChange();
      this.message(`${name} ${result.message}`);
    };
    actions.appendChild(button);
  }
