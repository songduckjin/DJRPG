import { setSkillIcon, setPassiveSkillIcon } from '../skillArtwork';
import { renderSkillBooks, skillUpgradeInfo, upgradeSkill, useAllReadySkillBooks } from '../skillBooks';
import { orderedSkills } from '../itemOrder';
import { autoEquipRecommendedSkills, availableSkills, unequipSkill } from '../../game/loadout';
import { skillLevel, totalStats, type Save } from '../../game/store';
import { MAX_SKILL_LEVEL, jobOrDefault, passiveOrderFor, passives, skillDuration, skillRange, skills, type Job, type PassiveId, type SkillId, type SkillLevelId } from '../../game/skills';
import { hasSkillUpgrade, skillBookStatus } from '../../game/skillProgress';
import type { Interface, SkillFilter } from '../interface';
import type { SkillSelection } from '../interfaceTypes';

/**
 * 스킬 창(작업 240) — **B안: 2열 타일 그리드 + 하단 고정 액션 바**(작업 266).
 *
 * 화면은 위에서 아래로 네 칸이다: ① 머리글 ② `전체/액티브/패시브` 탭과 `추천 자동 장착`·`자동 강화`
 * ③ 스크롤되는 타일 그리드 ④ **스크롤 밖에 고정된 액션 바**. 타일은 아이콘·이름·`Lv.N`·상태 칩
 * (`장착중`·`강화!`·`고정`·`미습득`)만 보여 주고, 긴 설명·능력치는 액션 바의 `정보`를 눌렀을 때만 펼친다.
 * 예전 카드형(설명·강화 버튼이 카드마다 있던 3열/1열 배치)은 스크롤이 길고 누를 곳이 많았다.
 *
 * 액션 바는 **지금 고른 타일 하나**를 다룬다. 액티브는 `장착`(장착 중이면 `해제`)·`강화`·`정보`,
 * 패시브는 `강화`·`정보`만 — 패시브는 장착이 없다. 기본 공격 타일은 `고정` 슬롯이라 장착·강화가 잠긴다.
 * 판정은 `skillUpgradeInfo`(스킬북 칸과 같은 한 벌)와 `skillChips`·`skillActions`가 정하고, 이 파일은
 * 그 값을 DOM으로 옮기기만 한다.
 */
export function renderSkills(this: Interface, dialog: HTMLElement): void {
  const save = this.world.save;
  const job = jobOrDefault(save.job);
  const filter: SkillFilter = this.skillFilter === 'active' || this.skillFilter === 'passive' ? this.skillFilter : 'all';
  // 고른 타일은 탭을 바꿔도 살아 있고, 그 탭에 없으면 보이는 첫 스킬(장착 중 우선)로 옮긴다.
  const selection = resolveSkillSelection(save, job, filter, this.skillSelected);
  this.skillSelected = selection;

  const list = document.createElement('div'); list.className = 'skill-list';
  const note = document.createElement('p'); note.className = 'skill-note';
  note.textContent = this.skillTarget !== undefined ? `${this.skillTarget + 1}번 스킬 원에 장착할 스킬을 선택하세요.` : '스킬북으로 습득·강화합니다. 장착 중인 스킬은 해제할 수 있고, 필드의 + 원에서 다시 장착할 수 있습니다.';
  list.appendChild(note);
  if (filter !== 'active') list.appendChild(passiveSection(this, save, job, selection));
  if (filter !== 'passive') { activeHeading(list, save); appendActiveTiles(this, list, save, job, selection); }
  renderSkillBooks(this, list);

  // 스크롤은 이 목록만 갖는다(액션 바는 스크롤 밖). 다시 그려도 보던 자리를 잃지 않게 기억한다.
  const scroll = this.skillScroll ?? 0;
  list.onscroll = () => { this.skillScroll = list.scrollTop; };
  dialog.appendChild(skillTopBar(this, filter));
  dialog.appendChild(list);
  dialog.appendChild(skillActionBar(this, save, job, selection));
  list.scrollTop = scroll;
}

// ── 타일이 보여 주는 상태 ────────────────────────────────────────────────────
/** 타일 상태 칩 — 오른쪽 아래에 붙는다. 한 타일이 여러 개를 가질 수 있다(예: 장착중 + 강화!). */
export type SkillChip = 'equipped' | 'upgrade' | 'fixed' | 'unlearned';
export const SKILL_CHIP_LABELS: Record<SkillChip, string> = { equipped: '장착중', upgrade: '강화!', fixed: '고정', unlearned: '미습득' };

/** 이 스킬이 지금 어떤 상태인가 — 타일 칩과 액션 바가 같은 값을 본다. */
export function skillChips(save: Save, id: SkillSelection): SkillChip[] {
  if (id === 'attack') return ['fixed'];
  const learned = [...save.learned, ...save.passives].includes(id);
  if (!learned) return ['unlearned'];
  const chips: SkillChip[] = [];
  if (save.quickSlots.includes(id as SkillId)) chips.push('equipped');
  if (skillBookStatus(save, id).ready) chips.push('upgrade');
  return chips;
}

/** 액션 바·타일이 쓰는 한 스킬의 표시 정보(이름·레벨·설명·능력치 줄). */
export type SkillMeta = { id: SkillSelection; name: string; learned: boolean; level: number; passive: boolean; description: string; stats: string };

const passiveBonus: Record<PassiveId, (level: number) => string> = {
  mastery: level => `공격 +${15 + (level - 1) * 2}%`, bowMastery: level => `공격 +${15 + (level - 1) * 2}%`,
  body: level => `HP·방어 +${15 + (level - 1) * 2}%`,
  instinct: level => `치명 +${8 + (level - 1) * 2}% · 공속 +${12 + (level - 1) * 2}%`,
  swiftStep: level => `이동·공속 +${12 + (level - 1) * 2}%`,
  hawkSight: level => `치명 +${8 + (level - 1) * 2}% · 사거리 +8%`,
  staffMastery: level => `공격 +${15 + (level - 1) * 2}%`,
  manaCircuit: level => `이동·공속 +${12 + (level - 1) * 2}%`,
  arcaneSense: level => `치명 +${8 + (level - 1) * 2}% · 사거리 +8%`
};

/** 기본 공격(대검 베기·활 사격·마법탄) — 직업마다 이름·아이콘·계수가 다르고 슬롯은 고정이다. */
function attackMeta(job: Job): SkillMeta {
  const ranged = job === 'archer' || job === 'mage';
  const name = job === 'archer' ? '활 사격' : job === 'mage' ? '마법탄' : '대검 베기';
  const description = job === 'archer' ? '시위를 당겨 화살을 날려 먼 거리의 적을 맞힙니다.'
    : job === 'mage' ? '지팡이 끝에서 마력 구슬을 날려 먼 거리의 적을 맞힙니다.'
      : '묵직한 두손검 횡베기로 전방 넓은 부채꼴을 공격합니다.';
  return { id: 'attack', name, learned: true, level: 1, passive: false, description, stats: `쿨 0.48초 · 위력 × ${ranged ? '1.6' : '1.0'} · 고정 슬롯` };
}

export function skillMeta(save: Save, job: Job, id: SkillSelection): SkillMeta {
  if (id === 'attack') return attackMeta(job);
  if (id in passives) {
    const passive = passives[id as PassiveId], learned = save.passives.includes(id as PassiveId);
    const level = learned ? Math.max(1, skillLevel(save, id)) : 1;
    return { id, name: passive.name, learned, level, passive: true, description: passive.description, stats: `영구 적용 · ${passiveBonus[id as PassiveId](level)}` };
  }
  const skill = skills[id as SkillId], learned = save.learned.includes(id as SkillId);
  const level = learned ? Math.max(1, skillLevel(save, id)) : 1;
  // [작업 216] 광폭 버프 3종의 공격력은 +20%에서 레벨당 +1.5%(공속은 +20%에서 +1%, 상한 1.5배).
  const buff = id === 'warcry' || id === 'hawkEye' || id === 'arcaneShield';
  const growth = buff ? `공격 버프 +${(20 + (level - 1) * 1.5).toFixed(1)}%` : `위력 +${(level - 1) * 10}%`;
  return { id, name: skill.name, learned, level, passive: false, description: skill.description, stats: `쿨 ${skill.cooldown}초 · 지속 ${skillDuration(id as SkillId, level).toFixed(1)}초 · 범위 ${skillRange(id as SkillId, level)} · ${growth}` };
}

// ── 액션 바 버튼 ─────────────────────────────────────────────────────────────
export type SkillActionId = 'equip' | 'upgrade' | 'info';
export type SkillActionSpec = { id: SkillActionId; label: string; disabled: boolean; title: string };

/** 하단 액션 바 버튼 — 액티브 `장착/해제·강화·정보`, 패시브 `강화·정보`, 기본 공격은 장착·강화가 잠긴다. */
export function skillActions(ui: Interface, id: SkillSelection): SkillActionSpec[] {
  const save = ui.world.save;
  const info: SkillActionSpec = { id: 'info', label: '정보', disabled: false, title: '설명과 능력치를 접었다 펼칩니다' };
  if (id === 'attack') {
    return [
      { id: 'equip', label: '고정', disabled: true, title: '기본 공격은 고정 슬롯입니다' },
      { id: 'upgrade', label: '강화', disabled: true, title: '기본 공격은 강화할 수 없습니다' },
      info
    ];
  }
  const upgrade = skillUpgradeInfo(ui, id);
  const upgradeAction: SkillActionSpec = { id: 'upgrade', label: upgrade.label, disabled: upgrade.disabled, title: upgrade.title };
  if (id in passives) return [upgradeAction, info];
  const learned = save.learned.includes(id as SkillId);
  const equip: SkillActionSpec = save.quickSlots.includes(id as SkillId)
    ? { id: 'equip', label: '해제', disabled: false, title: '장착을 해제합니다' }
    : { id: 'equip', label: '장착', disabled: !learned, title: learned ? '스킬 원에 장착합니다' : '스킬북으로 먼저 습득해야 합니다' };
  return [equip, upgradeAction, info];
}

/** 지금 탭에서 보이는 타일을 화면 순서대로 — 선택이 사라졌을 때 되돌릴 자리를 찾는 데 쓴다. */
function visibleSelections(job: Job, filter: SkillFilter, save: Save): SkillSelection[] {
  const out: SkillSelection[] = [];
  if (filter !== 'active') out.push(...passiveOrderFor(job));
  if (filter !== 'passive') { out.push('attack'); out.push(...orderedSkills(save)); }
  return out;
}

/**
 * 이번에 그릴 선택 — 지금 고른 것이 이 탭에 있으면 그대로, 없으면 장착 중 → 습득한 스킬 → 첫 타일 순.
 * 창을 처음 열면 장착 중인 액티브가 잡혀 액션 바가 바로 쓸 만한 상태로 뜬다.
 */
export function resolveSkillSelection(save: Save, job: Job, filter: SkillFilter, current?: SkillSelection): SkillSelection {
  const visible = visibleSelections(job, filter, save);
  if (current && visible.includes(current)) return current;
  const equipped = save.quickSlots.find((id): id is SkillId => id !== null && visible.includes(id));
  const learned = visible.find(id => id !== 'attack' && (save.learned.includes(id as SkillId) || save.passives.includes(id as PassiveId)));
  // 아직 아무것도 습득하지 않았다면 늘 쓸 수 있는 기본 공격을 잡는다 — 타일이 하나는 늘 고른 상태다.
  return equipped ?? learned ?? (visible.includes('attack') ? 'attack' : visible[0]);
}

// ── 그리기 ───────────────────────────────────────────────────────────────────
/** 상단 버튼 바 — `추천 자동 장착`으로 3칸을 다시 채우고, `자동 강화`로 보유 스킬북을 한 번에 쓴다. */
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
  // 작업 245: 내 직업 스킬북을 가능한 만큼 연속 습득·강화한다(최대 체력이 오르는 패시브도 반영).
  // 작업 246: **지금 쓸 수 있는 책이 없으면 흐리게 잠근다** — 사용자 요청. `hasSkillUpgrade`가
  // `skillBookStatus(...).ready`를 직업별로 확인하는 그 판정을 그대로 써서 버튼과 실제 동작이 갈리지 않는다.
  const ready = hasSkillUpgrade(ui.world.save);
  const upgrade = document.createElement('button');
  upgrade.type = 'button'; upgrade.className = 'skill-auto-upgrade'; upgrade.textContent = '자동 강화';
  upgrade.disabled = !ready;
  upgrade.classList.toggle('is-ready', ready);
  upgrade.setAttribute('aria-disabled', String(!ready));
  upgrade.title = ready ? '가방의 내 직업 스킬북으로 가능한 만큼 한 번에 강화합니다.' : '습득하거나 강화할 수 있는 내 직업 스킬북이 없습니다.';
  upgrade.setAttribute('aria-label', ready ? '보유한 내 직업 스킬북으로 가능한 만큼 강화' : '자동 강화할 스킬북이 없어 잠김');
  upgrade.onclick = () => {
    if (!ready) return;
    if (ui.world.paused || ui.market.busy || ui.market.sync.locked) { ui.message('동기화 중에는 스킬을 강화할 수 없습니다.'); return; }
    const before = totalStats(ui.world.save).health;
    const result = useAllReadySkillBooks(ui.world.save);
    if (!result.used) { ui.message('습득하거나 강화할 수 있는 내 직업 스킬북이 없습니다.'); return; }
    // 강인한 육체 같은 패시브로 최대 체력이 올랐으면 지금 체력도 같이 올려 준다(`skillBooks.ts`와 같은 규칙).
    ui.world.player.hp += totalStats(ui.world.save).health - before; ui.world.save.health = ui.world.player.hp;
    ui.world.onChange();
    const kinds = new Set(result.upgrades.map(entry => entry.id)).size;
    ui.message(`스킬 ${kinds}종 자동 강화 완료 (총 ${result.used}회)`);
  };
  actions.append(auto, upgrade);
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

/** 그룹 제목 — 오른쪽에 그 그룹의 요약(습득 수·장착 수)을 붙인다. */
function groupHeading(text: string, summary?: string): HTMLElement {
  const heading = document.createElement('h3'); heading.className = 'skill-group-title'; heading.textContent = text;
  if (summary) {
    const count = document.createElement('span'); count.className = 'skill-group-count'; count.textContent = summary;
    heading.appendChild(count);
  }
  return heading;
}

function tileGrid(label: string, passive: boolean): HTMLElement {
  const grid = document.createElement('div');
  grid.className = passive ? 'skill-tile-grid passive-skill-grid' : 'skill-tile-grid';
  grid.setAttribute('role', 'list'); grid.setAttribute('aria-label', label);
  return grid;
}

/** 패시브 3종 — 습득 여부와 상관없이 항상 세 장을 그린다(누락 방지). */
function passiveSection(ui: Interface, save: Save, job: Job, selection: SkillSelection): HTMLElement {
  const section = document.createElement('section'); section.className = 'skill-passive-section';
  const order = passiveOrderFor(job);
  const learnedCount = order.filter(id => save.passives.includes(id)).length;
  section.appendChild(groupHeading('패시브', `${learnedCount} / ${order.length} 습득`));
  const grid = tileGrid('패시브 스킬', true);
  for (const id of order) grid.appendChild(skillTile(ui, save, job, id, selection === id));
  section.appendChild(grid);
  return section;
}

function activeHeading(list: HTMLElement, save: Save): void {
  const equipped = save.quickSlots.filter(id => id !== null).length;
  list.appendChild(groupHeading('액티브', `장착 ${equipped} / 3`));
}

/** 기본 공격 + 액티브 8종(장착 중인 스킬이 먼저 온다) — 한 그리드에 2열로 놓는다. */
function appendActiveTiles(ui: Interface, list: HTMLElement, save: Save, job: Job, selection: SkillSelection): void {
  const grid = tileGrid('액티브 스킬', false);
  grid.appendChild(skillTile(ui, save, job, 'attack', selection === 'attack'));
  for (const id of orderedSkills(save)) grid.appendChild(skillTile(ui, save, job, id, selection === id));
  list.appendChild(grid);
}

/**
 * 타일 한 장 — **아이콘·이름·`Lv.N`·상태 칩만** 둔다. 긴 설명은 액션 바의 `정보`가 맡는다.
 * 누르면 이 타일이 액션 바의 대상이 된다(같은 타일을 다시 눌러도 펼친 정보는 그대로).
 */
function skillTile(ui: Interface, save: Save, job: Job, id: SkillSelection, selected: boolean): HTMLElement {
  const meta = skillMeta(save, job, id);
  const chips = skillChips(save, id);
  // 미습득은 `Lv.N` 자리가 이미 `미습득`이라 칩을 또 붙이지 않는다(같은 말이 두 번 보이지 않게).
  const shownChips = chips.filter(chip => chip !== 'unlearned');
  const card = document.createElement('article');
  card.className = `skill-card skill-tile ${meta.passive ? 'passive-skill-card' : id === 'attack' ? 'base-skill-card' : 'active-skill-card'}${selected ? ' is-selected' : ''}`
    + `${chips.includes('equipped') ? ' is-equipped' : ''}${chips.includes('upgrade') ? ' has-upgrade' : ''}`
    + `${chips.includes('fixed') ? ' is-fixed' : ''}${meta.learned ? '' : ' is-locked'}`;
  card.dataset.skill = id;
  card.setAttribute('role', 'listitem');
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'skill-tile-button';
  button.setAttribute('aria-pressed', String(selected));
  button.setAttribute('aria-label', `${meta.name} · ${meta.learned ? `스킬 Lv.${meta.level} / ${MAX_SKILL_LEVEL}` : '미습득'}${shownChips.map(chip => ` · ${SKILL_CHIP_LABELS[chip]}`).join('')}`);
  const icon = document.createElement('span');
  const body = document.createElement('span'); body.className = 'skill-tile-body';
  const name = document.createElement('b'); name.className = 'skill-tile-name'; name.textContent = meta.name;
  // 아래 줄: `Lv.N` 배지(왼쪽) + 상태 칩(오른쪽) — 좁은 2열 폭에서도 서로 겹치지 않게 한 줄에 흘려 둔다.
  const foot = document.createElement('span'); foot.className = 'skill-tile-foot';
  const level = document.createElement('span');
  level.className = `skill-level${meta.learned ? '' : ' is-unlearned'}`;
  level.textContent = meta.learned ? `Lv.${meta.level}` : '미습득';
  foot.appendChild(level);
  if (shownChips.length) {
    const chipBox = document.createElement('span'); chipBox.className = 'skill-tile-chips';
    for (const chip of shownChips) {
      const el = document.createElement('i'); el.className = `skill-chip skill-chip-${chip}`; el.textContent = SKILL_CHIP_LABELS[chip];
      chipBox.appendChild(el);
    }
    foot.appendChild(chipBox);
  }
  body.append(name, foot);
  button.append(icon, body);
  if (selected) { const check = document.createElement('i'); check.className = 'skill-tile-check'; check.setAttribute('aria-hidden', 'true'); check.textContent = '✓'; button.appendChild(check); }
  button.onclick = () => selectSkill(ui, id);
  card.appendChild(button);
  // 아이콘은 카드에서 다시 찾아 칠한다 — 스킬 창·픽커·필드가 모두 `skillArtwork` 한 벌을 쓴다.
  const art = card.querySelector<HTMLElement>('.skill-icon') ?? icon;
  art.textContent = '';
  art.className = `skill-icon skill-image-icon${meta.passive ? ' passive-image-icon' : ''}`;
  if (meta.passive) setPassiveSkillIcon(art, id as PassiveId); else setSkillIcon(art, id as SkillId, job);
  return card;
}

function selectSkill(ui: Interface, id: SkillSelection): void {
  if (ui.skillSelected === id) return;
  ui.skillSelected = id; ui.skillInfoOpen = false;
  ui.renderModal();
}

/**
 * 하단 고정 액션 바 — 고른 스킬의 아이콘·이름·`Lv.N`, 그리고 같은 폭의 버튼 한 줄.
 * `정보`를 누르면 설명과 능력치(`쿨·지속·범위·위력`)가 이 안에서 펼쳐지고 다시 누르면 접힌다.
 */
function skillActionBar(ui: Interface, save: Save, job: Job, selection: SkillSelection | undefined): HTMLElement {
  const bar = document.createElement('div'); bar.className = 'skill-action-bar';
  bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', '선택한 스킬');
  if (!selection) {
    const empty = document.createElement('p'); empty.className = 'skill-action-empty'; empty.textContent = '스킬을 선택하세요.';
    bar.appendChild(empty); return bar;
  }
  const meta = skillMeta(save, job, selection);
  bar.classList.toggle('is-info-open', ui.skillInfoOpen === true);

  const head = document.createElement('div'); head.className = 'skill-action-head';
  const icon = document.createElement('span');
  const title = document.createElement('div'); title.className = 'skill-action-title';
  const name = document.createElement('b'); name.className = 'skill-action-name'; name.textContent = meta.name;
  const level = document.createElement('span'); level.className = 'skill-action-level'; level.textContent = meta.learned ? `Lv.${meta.level}` : '미습득';
  title.append(name, level);
  const label = document.createElement('span'); label.className = 'skill-action-label'; label.textContent = meta.passive ? '상시 적용' : '선택한 스킬';
  head.append(icon, title, label);
  bar.appendChild(head);

  const detail = document.createElement('div'); detail.className = 'skill-action-detail';
  if (ui.skillInfoOpen) {
    const desc = document.createElement('p'); desc.className = 'skill-action-desc'; desc.textContent = meta.description;
    const stats = document.createElement('p'); stats.className = 'skill-action-stats'; stats.textContent = meta.stats;
    detail.append(desc, stats);
    if (selection !== 'attack') {
      const cost = document.createElement('span'); cost.className = 'skill-book-cost skill-action-cost';
      cost.textContent = skillUpgradeInfo(ui, selection).note;
      detail.appendChild(cost);
    }
  }
  bar.appendChild(detail);

  const buttons = document.createElement('div'); buttons.className = 'skill-action-buttons';
  for (const action of skillActions(ui, selection)) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `skill-action-button skill-action-${action.id}`;
    button.textContent = action.id === 'info' && ui.skillInfoOpen ? '정보 ▴' : action.label;
    button.disabled = action.disabled;
    button.title = action.title;
    // 읽기 이름은 `라벨 · 설명` 한 번만 — `습득 · 습득 · …`처럼 같은 말을 겹쳐 읽지 않는다.
    button.setAttribute('aria-label', action.title.startsWith(action.label) ? action.title : `${action.label} · ${action.title}`);
    if (action.id === 'info') button.setAttribute('aria-expanded', String(ui.skillInfoOpen));
    if (action.id === 'upgrade' && !action.disabled) button.classList.add('is-ready');
    button.onclick = () => runSkillAction(ui, selection, action.id);
    buttons.appendChild(button);
  }
  bar.appendChild(buttons);

  const art = bar.querySelector<HTMLElement>('.skill-icon') ?? icon;
  art.textContent = '';
  art.className = `skill-icon skill-image-icon skill-action-icon${meta.passive ? ' passive-image-icon' : ''}`;
  if (meta.passive) setPassiveSkillIcon(art, selection as PassiveId); else setSkillIcon(art, selection as SkillId, job);
  return bar;
}

/** 액션 바 버튼 동작 — 장착·해제·강화·정보. 화면 갱신은 각 규칙(`world.onChange`·`renderModal`)이 맡는다. */
function runSkillAction(ui: Interface, id: SkillSelection, action: SkillActionId): void {
  if (action === 'info') { ui.skillInfoOpen = !ui.skillInfoOpen; ui.renderModal(); return; }
  if (action === 'upgrade') { if (id !== 'attack') upgradeSkill(ui, id as SkillLevelId); return; }
  if (id === 'attack') return;
  const save = ui.world.save;
  if (save.quickSlots.includes(id as SkillId)) {
    if (ui.world.paused || ui.market.busy || ui.market.sync.locked) { ui.message('동기화 중에는 스킬을 해제할 수 없습니다. 잠시 후 다시 시도하세요.'); return; }
    const result = unequipSkill(save, id as SkillId);
    ui.message(`${skills[id as SkillId].name}: ${result.message}`);
    if (result.ok) ui.world.onChange();
    return;
  }
  if (!availableSkills(save).includes(id as SkillId)) { ui.message('스킬북으로 스킬을 습득하면 장착할 수 있습니다.'); return; }
  ui.chooseSkill(id as SkillId);
}
