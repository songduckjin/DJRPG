import {setSkillIcon, setPassiveSkillIcon} from '../skillArtwork';
import { orderedSkills } from '../itemOrder';
import { autoEquipRecommendedSkills, availableSkills, unequipSkill } from '../../game/loadout';
import { skillLevel, type Save } from '../../game/store';
import { MAX_SKILL_LEVEL, passiveOrderFor, passives, skillDuration, skillRange, skills, type Job } from '../../game/skills';
import { jobOrDefault } from '../../game/skills';
import type { Interface, SkillFilter } from '../interface';

/**
 * 스킬 창(작업 240).
 *
 * 화면 순서는 **패시브 스킬 → 액티브 스킬(기본 공격·장착 중·8종)** 이다. 예전에는 패시브 3종이
 * 기본기·액티브 8종 맨 아래에 있어 스크롤을 끝까지 내려야만 보였다(사용자 제보 "패시브 스킬 창에
 * 안 나오는 현상"). 상단 `전체/액티브/패시브` 탭으로 한 종류만 볼 수도 있고, `전체`에서도 패시브 3종은
 * 기본기보다 위에 있으므로 어떤 상태에서도 놓치지 않는다.
 *
 * **파트 B(2026-11-22)**: 스킬북이 폐지되어 이 창에서 책을 쓰거나 `자동 강화`를 누르던 자리(아래쪽 책
 * 목록·카드의 `습득/강화` 버튼)를 걷어 냈다. 스킬 성장은 파트 A의 스킬 트리(SP 투자)가 맡는다.
 */
export function renderSkills(this: Interface, dialog: HTMLElement): void {
    const list = document.createElement('div'); list.className = 'skill-list';
    const save = this.world.save;
    const job = jobOrDefault(save.job);
    const filter: SkillFilter = this.skillFilter === 'active' || this.skillFilter === 'passive' ? this.skillFilter : 'all';
    const note = document.createElement('p'); note.className = 'skill-note';
    note.textContent = this.skillTarget !== undefined ? `${this.skillTarget + 1}번 스킬 원에 장착할 스킬을 선택하세요.` : '장착 중인 스킬은 해제할 수 있고, 필드의 + 원에서 다시 장착할 수 있습니다.';
    list.appendChild(note);
    list.appendChild(skillTopBar(this, filter));
    if (filter !== 'active') list.appendChild(passiveSection(this, save, job));
    if (filter !== 'passive') { activeHeading(list); appendBaseCard(list, job); appendActiveSkills(this, list, save); }
    dialog.appendChild(list);
  }

/** 상단 버튼 바 — `추천 자동 장착`으로 3칸을 다시 채운다(파트 B: `자동 강화`는 스킬북과 함께 없앴다). */
function skillTopBar(ui: Interface, filter: SkillFilter): HTMLElement {
  const bar = document.createElement('div'); bar.className = 'skill-top-bar';
  const actions = document.createElement('div'); actions.className = 'skill-top-actions';
  const auto = document.createElement('button');
  auto.type = 'button'; auto.className = 'skill-auto-equip'; auto.textContent = '추천 자동 장착';
  auto.setAttribute('aria-label', '보유한 스킬로 추천 조합을 자동 장착');
  auto.onclick = () => {
    if (ui.world.paused || ui.market.busy || ui.market.sync.locked) { ui.message('동기화 중에는 스킬을 장착할 수 없습니다. 잠시 후 다시 시도하세요.'); return; }
    const result = autoEquipRecommendedSkills(ui.world.save);
    // 실제로 바뀐 경우에만 저장·HUD·목록을 다시 그린다(`world.onChange`가 스킬 창을 다시 그린다).
    if (result.changed) ui.world.onChange();
    ui.message(result.message);
  };
  actions.append(auto);
  bar.appendChild(actions);
  const tabs = document.createElement('div'); tabs.className = 'skill-filter';
  tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '스킬 종류');
  const options: { key: SkillFilter; label: string }[] = [{ key: 'all', label: '전체' }, { key: 'active', label: '액티브' }, { key: 'passive', label: '패시브' }];
  for (const option of options) {
    const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'skill-filter-tab';
    tab.dataset.filter = option.key; tab.textContent = option.label;
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(filter === option.key));
    tab.setAttribute('aria-pressed', String(filter === option.key));
    tab.onclick = () => { if (ui.skillFilter === option.key) return; ui.skillFilter = option.key; ui.renderModal(); };
    tabs.appendChild(tab);
  }
  bar.appendChild(tabs);
  return bar;
}

function groupHeading(text: string, className = 'skill-group-title'): HTMLElement {
  const heading = document.createElement('h3'); heading.className = className; heading.textContent = text;
  return heading;
}

function activeHeading(parent: HTMLElement): void { parent.appendChild(groupHeading('액티브 스킬')); }

/** 패시브 3종 — 습득 여부와 상관없이 항상 세 장을 그린다(누락 방지). */
function passiveSection(_ui: Interface, save: Save, job: Job): HTMLElement {
  const section = document.createElement('section'); section.className = 'skill-passive-section';
  const order = passiveOrderFor(job);
  const learnedCount = order.filter(id => save.passives.includes(id)).length;
  section.appendChild(groupHeading(`패시브 스킬 · ${learnedCount}/${order.length} 습득`));
  const hint = document.createElement('small'); hint.className = 'skill-passive-hint';
  hint.textContent = '패시브는 장착 없이 습득하면 항상 적용됩니다.';
  section.appendChild(hint);
  const passivesGrid = document.createElement('div'); passivesGrid.className = 'passive-skill-grid';
  for (const id of order) {
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
    card.innerHTML = `<div class="skill-icon">${passive.icon}</div><div class="skill-info"><h3>${passive.name}</h3><p>${passive.description}</p><strong class="skill-level">${learned ? `스킬 Lv.${level} / ${MAX_SKILL_LEVEL}` : '미습득'}</strong><small>${bonus}</small><div class="skill-actions"></div></div>`;
    const icon=card.querySelector<HTMLElement>('.skill-icon')!;icon.textContent='';icon.className='skill-icon skill-image-icon passive-image-icon';setPassiveSkillIcon(icon,id);
    passivesGrid.appendChild(card);
  }
  section.appendChild(passivesGrid);
  return section;
}

/** 기본 보유 평타(대검 베기·활 사격·마법탄) — 직업마다 이름·아이콘이 다르다. */
function appendBaseCard(list: HTMLElement, job: Job): void {
  const base = document.createElement('article'); base.className = 'skill-card';
  base.innerHTML = job === 'archer'
    ? '<div class="skill-icon">🏹</div><div class="skill-info"><h3>활 사격 <small>Lv.1 · 기본 보유</small></h3><p>시위를 당겨 화살을 날려 먼 거리의 적을 맞힙니다.</p><small>기본 쿨타임 0.48초 · 공격력 × 1.6 · 고정 슬롯</small></div>'
    : job === 'mage'
      ? '<div class="skill-icon">✦</div><div class="skill-info"><h3>마법탄 <small>Lv.1 · 기본 보유</small></h3><p>지팡이 끝에서 마력 구슬을 날려 먼 거리의 적을 맞힙니다.</p><small>기본 쿨타임 0.48초 · 공격력 × 1.6 · 고정 슬롯</small></div>'
      : '<div class="skill-icon">⚔</div><div class="skill-info"><h3>대검 베기 <small>Lv.1 · 기본 보유</small></h3><p>묵직한 두손검 횡베기로 전방 넓은 부채꼴을 공격합니다.</p><small>기본 쿨타임 0.48초 · 공격력 × 1.0 · 고정 슬롯</small></div>';
  const baseIcon=base.querySelector<HTMLElement>('.skill-icon')!;baseIcon.textContent='';baseIcon.className='skill-icon skill-image-icon';setSkillIcon(baseIcon,'attack',job);
  list.appendChild(base);
}

/** 장착 중 그룹 + 습득/미습득 액티브 8종(장착 스킬이 먼저 온다). */
function appendActiveSkills(ui: Interface, list: HTMLElement, save: Save): void {
  const equippedGroup=document.createElement('section');equippedGroup.className='equipped-skill-group';equippedGroup.setAttribute('role','group');equippedGroup.setAttribute('aria-label','장착 중 스킬');
  if(save.quickSlots.some(id=>id!==null)){equippedGroup.append(groupHeading('장착 중','equipped-group-title'));list.append(equippedGroup);}
  for (const id of orderedSkills(save)) {
    const skill = skills[id], learned = save.learned.includes(id), level = learned ? skillLevel(save, id) : 1;
    // [작업 216] 광폭 버프 3종의 공격력은 +20%에서 레벨당 +1.5%(공속은 +20%에서 +1%, 상한 1.5배).
    const buff = id === 'warcry' || id === 'hawkEye' || id === 'arcaneShield';
    const growth = buff ? `공격 버프 +${(20 + (level - 1) * 1.5).toFixed(1)}%` : `위력 +${(level - 1) * 10}%`;
    const card = document.createElement('article'); card.className = 'skill-card active-skill-card'; card.dataset.skill = id;
    card.innerHTML = `<div class="skill-icon">${skill.icon}</div><div class="skill-info"><div class="skill-card-top"><div class="skill-name-block"><h3>${skill.name}</h3><strong class="skill-level">${learned ? `스킬 Lv.${level} / ${MAX_SKILL_LEVEL}` : '미습득'}</strong></div><div class="skill-status-stack"><span>${learned ? '습득 완료' : '미습득'}</span></div></div><p>${skill.description}</p><small>쿨타임 ${skill.cooldown}초 · 지속 ${skillDuration(id, level).toFixed(1)}초 · 범위 ${skillRange(id, level)} · ${growth}</small><div class="skill-actions"></div></div>`;
    const icon=card.querySelector<HTMLElement>('.skill-icon')!;icon.textContent='';icon.className='skill-icon skill-image-icon';setSkillIcon(icon,id);
    const actions = card.querySelector<HTMLElement>('.skill-actions')!;
    if (learned) {
      if (save.quickSlots.includes(id)) {
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '해제'; remove.setAttribute('aria-label', `${skill.name} 장착 해제`);
        remove.onclick = () => {
          if (ui.world.paused || ui.market.busy || ui.market.sync.locked) { ui.message('동기화 중에는 스킬을 해제할 수 없습니다. 잠시 후 다시 시도하세요.'); return; }
          const result = unequipSkill(save, id);
          ui.message(`${skill.name}: ${result.message}`);
          if (result.ok) ui.world.onChange();
        };
        actions.appendChild(remove);
      } else if (availableSkills(save).includes(id) && (ui.skillTarget !== undefined || save.quickSlots.every(slot => slot !== null))) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = '장착하기';
        button.onclick = () => ui.chooseSkill(id); actions.appendChild(button);
      } else {
        const hint = document.createElement('span'); hint.textContent = '필드의 + 원에서 장착'; actions.appendChild(hint);
      }
    }
    if(save.quickSlots.includes(id))equippedGroup.appendChild(card);else list.appendChild(card);
  }
}
