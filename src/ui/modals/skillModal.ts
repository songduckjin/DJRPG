import {setSkillIcon, setPassiveSkillIcon} from '../skillArtwork';
import { markSkillUpgrade, renderSkillBooks, renderSkillUpgrade } from '../skillBooks';
import { orderedSkills } from '../itemOrder';
import { availableSkills, unequipSkill } from '../../game/loadout';
import { skillLevel } from '../../game/store';
import { MAX_SKILL_LEVEL, passiveOrderFor, passives, skillDuration, skillRange, skills } from '../../game/skills';
import { jobOrDefault } from '../../game/skills';
import type { Interface } from '../interface';

export function renderSkills(this: Interface, dialog: HTMLElement): void {
    const list = document.createElement('div'); list.className = 'skill-list';
    const save = this.world.save;
    const note = document.createElement('p'); note.className = 'skill-note';
    note.textContent = this.skillTarget !== undefined ? `${this.skillTarget + 1}번 스킬 원에 장착할 스킬을 선택하세요.` : '스킬북으로 습득·강화합니다. 장착 중인 스킬은 해제할 수 있고, 필드의 + 원에서 다시 장착할 수 있습니다.';
    list.appendChild(note);
    renderSkillBooks(this, list);
    const job = jobOrDefault(save.job);
    const base = document.createElement('article'); base.className = 'skill-card';
    base.innerHTML = job === 'archer'
      ? '<div class="skill-icon">🏹</div><div class="skill-info"><h3>활 사격 <small>Lv.1 · 기본 보유</small></h3><p>시위를 당겨 화살을 날려 먼 거리의 적을 맞힙니다.</p><small>기본 쿨타임 0.48초 · 공격력 × 1.6 · 고정 슬롯</small></div>'
      : job === 'mage'
        ? '<div class="skill-icon">✦</div><div class="skill-info"><h3>마법탄 <small>Lv.1 · 기본 보유</small></h3><p>지팡이 끝에서 마력 구슬을 날려 먼 거리의 적을 맞힙니다.</p><small>기본 쿨타임 0.48초 · 공격력 × 1.6 · 고정 슬롯</small></div>'
        : '<div class="skill-icon">⚔</div><div class="skill-info"><h3>대검 베기 <small>Lv.1 · 기본 보유</small></h3><p>묵직한 두손검 횡베기로 전방 넓은 부채꼴을 공격합니다.</p><small>기본 쿨타임 0.48초 · 공격력 × 1.0 · 고정 슬롯</small></div>';
    const baseIcon=base.querySelector<HTMLElement>('.skill-icon')!;baseIcon.textContent='';baseIcon.className='skill-icon skill-image-icon';setSkillIcon(baseIcon,'attack',job);
    list.appendChild(base);
    const equippedGroup=document.createElement('section');equippedGroup.className='equipped-skill-group';equippedGroup.setAttribute('role','group');equippedGroup.setAttribute('aria-label','장착 중 스킬');
    if(save.quickSlots.some(id=>id!==null)){const title=document.createElement('h3');title.className='equipped-group-title';title.textContent='장착 중';equippedGroup.append(title);list.append(equippedGroup);}
    for (const id of orderedSkills(save)) {
      const skill = skills[id], learned = save.learned.includes(id), level = learned ? skillLevel(save, id) : 1;
      // [작업 216] 광폭 버프 3종의 공격력은 +20%에서 레벨당 +1.5%(공속은 +20%에서 +1%, 상한 1.5배).
      const buff = id === 'warcry' || id === 'hawkEye' || id === 'arcaneShield';
      const growth = buff ? `공격 버프 +${(20 + (level - 1) * 1.5).toFixed(1)}%` : `위력 +${(level - 1) * 10}%`;
      const card = document.createElement('article'); card.className = 'skill-card active-skill-card'; card.dataset.skill = id;
      card.innerHTML = `<div class="skill-icon">${skill.icon}</div><div class="skill-info"><div class="skill-card-top"><div class="skill-name-block"><h3>${skill.name}</h3><strong class="skill-level">${learned ? `스킬 Lv.${level} / ${MAX_SKILL_LEVEL}` : '스킬북으로 습득'}</strong></div><div class="skill-status-stack"><span>${learned ? '습득 완료' : '미습득'}</span></div></div><p>${skill.description}</p><small>쿨타임 ${skill.cooldown}초 · 지속 ${skillDuration(id, level).toFixed(1)}초 · 범위 ${skillRange(id, level)} · ${growth}</small><div class="skill-actions"></div></div>`;
      const icon=card.querySelector<HTMLElement>('.skill-icon')!;icon.textContent='';icon.className='skill-icon skill-image-icon';setSkillIcon(icon,id);
      const actions = card.querySelector<HTMLElement>('.skill-actions')!;
      if (learned) {
        if (save.quickSlots.includes(id)) {
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
      renderSkillUpgrade(this, actions, id, card.querySelector<HTMLElement>('.skill-status-stack')!); markSkillUpgrade(this, card, id);
      if(save.quickSlots.includes(id))equippedGroup.appendChild(card);else list.appendChild(card);
    }
    const heading = document.createElement('h3'); heading.className = 'skill-group-title'; heading.textContent = '패시브 스킬'; list.appendChild(heading);
    const passivesGrid = document.createElement('div'); passivesGrid.className = 'passive-skill-grid';
    for (const id of passiveOrderFor(jobOrDefault(save.job))) {
      const passive = passives[id], learned = save.passives.includes(id), level = learned ? skillLevel(save, id) : 1;
      const card = document.createElement('article'); card.className = 'skill-card passive-skill-card'; card.dataset.skill = id;
      const bonusById = {
        mastery: `공격 +${15 + (level - 1) * 2}%`, bowMastery: `공격 +${15 + (level - 1) * 2}%`,
        body: `HP·방어 +${15 + (level - 1) * 2}%`,
        instinct: `치명 +${8 + (level - 1) * 2}% · 공속 +${12 + (level - 1) * 2}%`,
        swiftStep: `이동·공속 +${12 + (level - 1) * 2}%`,
        hawkSight: `치명 +${8 + (level - 1) * 2}% · 사거리 +8%`,
        staffMastery: `공격 +${15 + (level - 1) * 2}%`,
        manaCircuit: `이동·공속 +${12 + (level - 1) * 2}%`,
        arcaneSense: `치명 +${8 + (level - 1) * 2}% · 사거리 +8%`
      } as const;
      const bonus = bonusById[id];
      card.innerHTML = `<div class="skill-icon">${passive.icon}</div><div class="skill-info"><h3>${passive.name}</h3><p>${passive.description}</p><strong class="skill-level">${learned ? `스킬 Lv.${level} / ${MAX_SKILL_LEVEL}` : '미습득 (스킬북 파밍 필요)'}</strong><small>${bonus}</small><div class="skill-actions"></div></div>`;
      const icon=card.querySelector<HTMLElement>('.skill-icon')!;icon.textContent='';icon.className='skill-icon skill-image-icon passive-image-icon';setPassiveSkillIcon(icon,id);
      const action = card.querySelector<HTMLElement>('.skill-actions')!;
      renderSkillUpgrade(this, action, id); markSkillUpgrade(this, card, id);
      passivesGrid.appendChild(card);
    }
    list.appendChild(passivesGrid);
    dialog.appendChild(list);
  }
