/**
 * 스킬 트리 화면 — 4단계 티어 트리와 선택 스킬 상세 패널(2026-11-22 스펙, 파트 A).
 *
 * 그리는 일만 한다: 무엇이 열리고 얼마인지는 `src/game/skillTree.ts`가, SP 총량은
 * `src/game/skillPoints.ts`가 정한다. 이 파일은 그 값을 DOM으로 옮기고, 누른 결과(투자·초기화·장착)를
 * 세이브에 반영한 뒤 `world.onChange()`로 저장·HUD를 함께 갱신한다.
 *
 * 화면은 위에서 아래로 세 칸이다.
 *   ① `.skill-top-bar` — `SP N` 표시와 `초기화 (무료)` 버튼
 *   ② `.skill-tree` — 스크롤되는 4단계 트리(티어 이름 + 연결선 + 스킬 노드)
 *   ③ `.skill-detail` — 지금 고른 스킬 하나(아이콘·`Lv.N/10`·선행 조건·현재/다음 수치·장착·`SP 1 투자`)
 *
 * 문구는 게임의 다른 창처럼 한국어이고, 배치는 확정 시안(`djrpg_skill_tree_clean_v3.png`)을 따른다:
 * 왼쪽에 티어 이름, 노드를 잇는 금빛 연결선, 트리 아래에 고정된 상세 패널.
 */
import { setPassiveSkillIcon, setSkillIcon } from './skillArtwork';
import type { Interface } from './interface';
import type { SkillSelection } from './interfaceTypes';
import { totalStats, type Save } from '../game/store';
import { jobOrDefault, passives, skills, type Job, type PassiveId, type SkillId } from '../game/skills';
import {
  investSkillPoint, resetSkillTree, skillNameOf, skillNodeStatus, skillTreeEdges, skillTreeFor, skillValueRows,
  skillsResetIsFree, type SkillNodeStatus, type SkillTreeNode
} from '../game/skillTree';
import { spLedger } from '../game/skillPoints';
import { unequipSkill } from '../game/loadout';

/** 지금 그릴 선택 — 고른 것이 이 직업 트리에 있으면 그대로, 없으면 장착 중 → 습득한 스킬 → 첫 노드 순. */
export function resolveSkillSelection(save: Save, job: Job, current?: SkillSelection): SkillSelection {
  const nodes = skillTreeFor(job);
  if (current && nodes.some(node => node.id === current)) return current;
  const equipped = save.quickSlots.find((id): id is SkillId => !!id && nodes.some(node => node.id === id));
  const learned = nodes.find(node => save.learned.includes(node.id as SkillId) || save.passives.includes(node.id as PassiveId));
  return equipped ?? learned?.id ?? nodes[0].id;
}

type Attrs = Record<string, string | boolean>;

/** 작은 DOM 도우미 — 이 파일 안에서만 쓴다. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '', attrs: Attrs = {}): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** 스킬 아이콘 — 기존 `skillArtwork` 한 벌(액티브는 직업 시트, 패시브는 패시브 시트). */
function paintSkillIcon(box: HTMLElement, id: SkillSelection, job: Job, passive: boolean, extra = ''): void {
  box.textContent = '';
  box.className = `skill-icon skill-image-icon${passive ? ' passive-image-icon' : ''}${extra ? ` ${extra}` : ''}`;
  if (passive) setPassiveSkillIcon(box, id as PassiveId); else setSkillIcon(box, id as SkillId, job);
}

/** ① 상단 바 — `SP N`과 `초기화 (무료)`. */
export function skillTopBar(ui: Interface): HTMLElement {
  const save = ui.world.save;
  const ledger = spLedger(save);
  const bar = el('div', 'skill-top-bar');
  bar.append(el('span', 'skill-sp-hint', 'SP 1 = 1랭크 · 최대 Lv.10'));
  const sp = el('span', 'skill-sp');
  const gem = el('i', 'skill-sp-gem');
  gem.setAttribute('aria-hidden', 'true');
  sp.append(gem, el('span', 'skill-sp-label', 'SP'), el('b', 'skill-sp-value', String(ledger.available)));
  sp.title = `남은 스킬 포인트 ${ledger.available} · 지금까지 ${ledger.total}pt 중 ${ledger.spent}pt 사용`;
  sp.setAttribute('aria-label', `스킬 포인트 ${ledger.available}`);

  const reset = el('button', 'skill-reset', skillsResetIsFree() ? '초기화 (무료)' : '초기화');
  reset.type = 'button';
  // 첫 스킬의 무료 1랭크는 늘 남으므로, 되돌릴 것이 없을 때(그 1랭크뿐일 때)만 잠근다.
  reset.disabled = ledger.spent <= 1;
  reset.title = ledger.spent <= 1 ? '초기화할 스킬이 없습니다' : `투자한 SP ${ledger.spent - 1}pt를 전부 돌려받습니다`;
  reset.setAttribute('aria-label', '스킬 초기화 — 투자한 SP 전액 환급');
  reset.onclick = () => resetSkills(ui);
  bar.append(sp, reset);
  return bar;
}

/** 초기화 — 무료(테스트 서버 기간)이고, 사라진 스킬은 장착 원에서도 빠진다(`resetSkillTree`). */
function resetSkills(ui: Interface): void {
  if (ui.world.paused || ui.market.busy || ui.market.sync.locked) { ui.message('동기화 중에는 스킬을 초기화할 수 없습니다. 잠시 후 다시 시도하세요.'); return; }
  const before = totalStats(ui.world.save).health;
  const result = resetSkillTree(ui.world.save);
  // 패시브가 빠지며 최대 체력이 내려가면 지금 체력도 그 위로 넘치지 않게 맞춘다.
  const health = totalStats(ui.world.save).health;
  if (health < before) { ui.world.player.hp = Math.min(ui.world.player.hp, health); ui.world.save.health = ui.world.player.hp; }
  ui.world.onChange();
  ui.message(result.message);
}

/** ② 트리 — 티어 4줄과 그 사이 연결선. 스크롤은 이 칸만 갖는다. */
export function skillTreePanel(ui: Interface, save: Save, job: Job, selection: SkillSelection): HTMLElement {
  const nodes = skillTreeFor(job);
  const statuses = new Map(nodes.map(node => [node.id, skillNodeStatus(save, node)]));
  const panel = el('section', 'skill-tree');
  panel.setAttribute('aria-label', '스킬 트리');
  const canvas = el('div', 'skill-tree-canvas');

  // 연결선 — 노드 뒤에 깔린다. 열린 노드로 가는 선은 금빛, 아직 잠긴 노드로 가는 선은 흐린 회색.
  const edges = el('div', 'skill-tree-edges');
  edges.setAttribute('aria-hidden', 'true');
  const paths = skillTreeEdges(job).map(edge => {
    const mid = ((edge.fromY + edge.toY) / 2) * 100;
    const open = statuses.get(edge.to)?.open;
    const d = `M ${(edge.fromX * 100).toFixed(2)} ${(edge.fromY * 100).toFixed(2)} V ${mid.toFixed(2)} H ${(edge.toX * 100).toFixed(2)} V ${(edge.toY * 100).toFixed(2)}`;
    return `<path class="skill-edge${open ? ' is-open' : ''}${edge.ultimate ? ' is-ultimate' : ''}" d="${d}" />`;
  }).join('');
  edges.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${paths}</svg>`;
  canvas.append(edges);

  for (const tier of [1, 2, 3, 4] as const) {
    const inTier = nodes.filter(node => node.tier === tier);
    if (!inTier.length) continue;
    const row = el('div', 'skill-tier', '', { 'data-tier': String(tier) });
    const learned = inTier.filter(node => statuses.get(node.id)?.learned).length;
    const label = el('div', 'skill-tier-label');
    label.append(el('b', 'skill-tier-name', `TIER ${tier}`), el('span', 'skill-tier-count', `${learned}/${inTier.length}`));
    const holders = el('div', 'skill-tier-nodes');
    for (const node of inTier) holders.append(skillNodeButton(ui, node, statuses.get(node.id)!, selection === node.id));
    row.append(label, holders);
    canvas.append(row);
  }
  panel.append(canvas);
  // 다시 그려도 보던 자리를 잃지 않게 기억한다(스킬 선택·투자마다 창을 다시 그린다).
  const scroll = ui.skillScroll ?? 0;
  panel.onscroll = () => { ui.skillScroll = panel.scrollTop; };
  panel.scrollTop = scroll;
  return panel;
}

/** 스킬 노드 하나 — 아이콘과 `N/10`. 잠긴 노드는 자물쇠, 궁극은 금빛 테두리. */
function skillNodeButton(ui: Interface, node: SkillTreeNode, status: SkillNodeStatus, selected: boolean): HTMLElement {
  const save = ui.world.save, job = jobOrDefault(save.job);
  const equipped = !node.passive && save.quickSlots.includes(node.id as SkillId);
  const classes = ['skill-node'];
  if (node.passive) classes.push('is-passive');
  if (node.ultimate) classes.push('is-ultimate');
  if (selected) classes.push('is-selected');
  if (status.learned) classes.push('is-learned'); else classes.push(status.open ? 'is-open' : 'is-locked');
  if (status.maxed) classes.push('is-maxed');
  if (equipped) classes.push('is-equipped');
  const button = el('button', classes.join(' '), '', { type: 'button', 'aria-pressed': String(selected), 'data-skill': node.id });
  const name = skillNameOf(node.id);
  const state = !status.learned ? (status.open ? '습득 가능' : '잠김') : `Lv.${status.level}`;
  button.setAttribute('aria-label', `${name} · ${state} · ${status.level}/${10}${equipped ? ' · 장착중' : ''}`);
  button.title = status.reason || `${name} — ${state}`;
  const frame = el('span', 'skill-node-frame');
  // 자물쇠는 **정말 잠긴** 노드(선행·SP 미충족)에만 — 습득만 안 한 열린 노드는 아이콘이 그대로 보인다.
  if (!status.learned && !status.open) {
    const lock = el('i', 'skill-node-lock', '🔒');
    lock.setAttribute('aria-hidden', 'true');
    frame.append(lock);
  }
  const art = el('span', 'skill-icon skill-image-icon');
  frame.append(art);
  const level = el('span', 'skill-node-level', `${status.level}/${10}`);
  if (!status.learned) level.classList.add('is-locked');
  button.append(frame, level);
  paintSkillIcon(art, node.id, job, node.passive);
  if (equipped) {
    const badge = el('i', 'skill-node-equipped', '장착');
    badge.setAttribute('aria-hidden', 'true');
    button.append(badge);
  }
  button.onclick = () => selectNode(ui, node.id);
  return button;
}

function selectNode(ui: Interface, id: SkillSelection): void {
  if (ui.skillSelected === id) return;
  ui.skillSelected = id;
  ui.renderModal();
}

/** ③ 상세 패널 — 고른 스킬 하나의 선행 조건·현재/다음 수치와 두 버튼. */
export function skillDetailPanel(ui: Interface, save: Save, selection: SkillSelection): HTMLElement {
  const job = jobOrDefault(save.job);
  const node = skillTreeFor(job).find(item => item.id === selection) ?? skillTreeFor(job)[0];
  const status = skillNodeStatus(save, node);
  const panel = el('section', 'skill-detail', '', { 'data-skill': node.id });
  panel.setAttribute('aria-label', '선택한 스킬');

  const head = el('div', 'skill-detail-head');
  const art = el('span', 'skill-icon skill-image-icon skill-detail-icon');
  paintSkillIcon(art, node.id, job, node.passive, 'skill-detail-icon');
  const title = el('div', 'skill-detail-title');
  title.append(el('b', 'skill-detail-name', skillNameOf(node.id)));
  title.append(el('span', 'skill-detail-sub', status.learned ? `Lv.${status.level} / ${10}` : `미습득 / ${10}`));
  const tags = el('div', 'skill-detail-tags');
  if (node.ultimate) tags.append(el('i', 'skill-detail-tag is-ultimate', '궁극'));
  if (node.passive) tags.append(el('i', 'skill-detail-tag', '패시브'));
  if (!node.passive && save.quickSlots.includes(node.id as SkillId)) tags.append(el('i', 'skill-detail-tag is-equipped', '장착중'));
  head.append(art, title, tags);
  panel.append(head);

  // 설명 문구는 `skills.ts`의 정의를 그대로 쓴다 — 화면에서 새로 쓰지 않는다.
  const description = node.passive
    ? (passives as Record<string, { description: string }>)[node.id]?.description ?? ''
    : (skills as Record<string, { description: string }>)[node.id]?.description ?? '';
  panel.append(el('p', 'skill-detail-desc', description));

  panel.append(requirementBox(status));
  panel.append(compareBox(status));
  panel.append(detailActions(ui, node, status));
  return panel;
}

/** 선행 조건 — 스킬별 요구 레벨과 트리 누적 투자 SP를 한 줄씩, 채웠으면 ✓. */
function requirementBox(status: SkillNodeStatus): HTMLElement {
  const box = el('div', 'skill-detail-req');
  box.append(el('span', 'skill-req-title', '선행 조건'));
  for (const requirement of status.requirements) {
    const row = el('div', `skill-req-row${requirement.met ? ' is-met' : ''}`);
    row.append(el('b', 'skill-req-name', requirement.name), el('span', 'skill-req-value', `${Math.min(requirement.have, requirement.need)}/${requirement.need}`));
    row.append(el('i', 'skill-req-check', requirement.met ? '✓' : '✕'));
    box.append(row);
  }
  const sp = el('div', `skill-req-row skill-req-sp${status.spMet ? ' is-met' : ''}`);
  sp.append(el('b', 'skill-req-name', '누적 투자 SP'), el('span', 'skill-req-value', `${Math.min(status.spSpent, status.spNeed)}/${status.spNeed}`));
  sp.append(el('i', 'skill-req-check', status.spMet ? '✓' : '✕'));
  box.append(sp);
  return box;
}

/** 현재 / 다음 레벨 — 같은 함수(`skillValueRows`)로 두 열을 채운다. */
function compareBox(status: SkillNodeStatus): HTMLElement {
  const box = el('div', 'skill-detail-compare');
  const current = el('div', 'skill-compare is-current');
  current.append(el('span', 'skill-compare-title', '현재'));
  if (status.learned) for (const row of skillValueRows(status.node.id, status.level)) {
    const line = el('div', 'skill-compare-row');
    line.append(el('span', 'skill-compare-label', row.label), el('b', 'skill-compare-value', row.value));
    current.append(line);
  } else current.append(el('span', 'skill-compare-empty', '미습득'));
  const next = el('div', 'skill-compare is-next');
  next.append(el('span', 'skill-compare-title', status.maxed ? '최대 레벨' : '다음 레벨'));
  if (status.maxed) next.append(el('span', 'skill-compare-empty', `Lv.${status.level}`));
  else for (const row of skillValueRows(status.node.id, status.level + 1)) {
    const line = el('div', 'skill-compare-row');
    line.append(el('span', 'skill-compare-label', row.label), el('b', 'skill-compare-value', row.value));
    next.append(line);
  }
  box.append(current, el('div', 'skill-compare-arrow', '»'), next);
  return box;
}

/** 장착/해제 · `SP 1 투자` 두 버튼. 패시브는 장착이 없어 투자 버튼 하나다. */
function detailActions(ui: Interface, node: SkillTreeNode, status: SkillNodeStatus): HTMLElement {
  const save = ui.world.save;
  const row = el('div', 'skill-detail-actions');
  if (!node.passive) {
    const equipped = save.quickSlots.includes(node.id as SkillId);
    const equip = el('button', 'skill-detail-equip', equipped ? '장착 해제' : '장착');
    equip.type = 'button';
    equip.disabled = !status.learned;
    equip.title = !status.learned ? 'SP를 투자해 먼저 습득해야 합니다' : equipped ? '스킬 원에서 해제합니다' : '필드의 스킬 원에 장착합니다';
    if (equipped) equip.classList.add('is-equipped');
    equip.onclick = () => toggleEquip(ui, node.id as SkillId);
    row.append(equip);
  }
  const invest = el('button', 'skill-detail-invest', status.maxed ? '최대 레벨' : 'SP 1 투자');
  invest.type = 'button';
  invest.disabled = !status.canInvest;
  invest.title = status.reason || 'SP 1을 투자해 이 스킬을 올립니다';
  if (status.canInvest) invest.classList.add('is-ready');
  invest.setAttribute('aria-disabled', String(!status.canInvest));
  invest.onclick = () => investOne(ui, node.id);
  row.append(invest);
  return row;
}

function investOne(ui: Interface, id: SkillSelection): void {
  if (ui.world.paused || ui.market.busy || ui.market.sync.locked) { ui.message('동기화 중에는 스킬에 투자할 수 없습니다. 잠시 후 다시 시도하세요.'); return; }
  const before = totalStats(ui.world.save).health;
  const result = investSkillPoint(ui.world.save, id);
  if (result.ok) {
    // 패시브(강인한 육체)로 최대 체력이 올랐으면 지금 체력도 함께 올린다 — 스킬북이 하던 규칙 그대로.
    ui.world.player.hp += totalStats(ui.world.save).health - before;
    ui.world.save.health = ui.world.player.hp;
    ui.world.onChange();
  }
  ui.message(result.message);
}

function toggleEquip(ui: Interface, id: SkillId): void {
  const save = ui.world.save;
  if (save.quickSlots.includes(id)) {
    if (ui.world.paused || ui.market.busy || ui.market.sync.locked) { ui.message('동기화 중에는 스킬을 해제할 수 없습니다. 잠시 후 다시 시도하세요.'); return; }
    const result = unequipSkill(save, id);
    ui.message(`${skillNameOf(id)}: ${result.message}`);
    if (result.ok) ui.world.onChange();
    return;
  }
  if (!save.learned.includes(id)) { ui.message('SP를 투자해 스킬을 습득하면 장착할 수 있습니다.'); return; }
  ui.chooseSkill(id);
}
