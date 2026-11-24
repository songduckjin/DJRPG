import { totalStats } from '../../game/store';
import { MAX_FLOOR } from '../../game/progress';
import { isCastle, realmName } from '../../game/floorTheme';
import type { Interface } from '../interface';
import {
  combatPower, floorGroups, floorPowerState, formatPower, groupPowerRange, groupStart,
  recommendedFloorFor, recommendedFloorPower, type FloorPowerState
} from '../../game/floorPower';

/** 상태 문구 — `여유`(충분) · `적정`(권장 근처) · `위험`(모자람). */
const stateLabels: Record<FloorPowerState, string> = { easy: '여유', okay: '적정', danger: '위험' };

/**
 * 펼쳐 둔 구간(10층 단위)의 시작 층 — 사용자가 접고 편 것을 같은 창을 다시 그려도 지킨다.
 * `null`이면 아직 손대지 않은 상태다: 내 권장 층이 든 구간 **하나만** 펼친다.
 */
let expandedGroups: Set<number> | null = null;

/** 창을 새로 열 때 `내 권장 층 구간만` 상태로 되돌린다. */
export function resetFloorGroups(): void { expandedGroups = null; }

export function renderFloor(this: Interface, dialog: HTMLElement): void {
  const save = this.world.save;
  const power = combatPower(totalStats(save));
  // 최고 층까지만 추천한다 — 아직 열리지 않은 층을 "가서 사냥하라"고 할 수는 없다.
  const recommendedFloor = recommendedFloorFor(power, save.maxFloor);

  const summary = document.createElement('p'); summary.className = 'floor-summary';
  summary.textContent = `현재 ${save.floor}층 · 최고 ${save.maxFloor}층`;
  dialog.appendChild(summary);
  const note = document.createElement('p'); note.className = 'floor-summary-note';
  note.textContent = '층 이동 시 처치 진행도와 바닥 드랍이 초기화됩니다';
  dialog.appendChild(note);

  const mode = document.createElement('button'); mode.className = 'floor-mode'; mode.type = 'button';
  mode.textContent = save.autoClimb ? '자동 등반 중 · 누르면 현재 층 반복' : '현재 층 반복 중 · 누르면 자동 등반';
  mode.setAttribute('aria-pressed', String(!save.autoClimb));
  mode.onclick = () => { save.autoClimb = !save.autoClimb; this.world.onChange(); this.message(save.autoClimb ? (save.floor >= MAX_FLOOR ? `최고 ${MAX_FLOOR}층입니다. 보스를 처치해도 ${MAX_FLOOR}층에서 계속 사냥합니다.` : '보스 처치 시 다음 층으로 이동합니다.') : '보스 처치 후에도 현재 층에서 사냥합니다.'); };
  dialog.appendChild(mode);

  // ── 상단 배너: 내 전투력 + 추천 층 ──────────────────────────────────────────
  const banner = document.createElement('div'); banner.className = 'floor-power';
  const mine = document.createElement('span'); mine.className = 'floor-power-mine';
  mine.innerHTML = `내 전투력 <b>${formatPower(power)}</b>`;
  const pick = document.createElement('span'); pick.className = 'floor-power-rec';
  pick.textContent = `★ 추천 ${recommendedFloor}층`;
  banner.append(mine, pick);
  dialog.appendChild(banner);

  // ── 10층 단위 아코디언 ──────────────────────────────────────────────────────
  const groups = document.createElement('div'); groups.className = 'floor-groups';
  const open = expandedGroups ?? new Set([groupStart(recommendedFloor)]);
  for (const group of floorGroups()) {
    const section = document.createElement('section');
    section.className = 'floor-group';
    const expanded = open.has(group.lo);
    section.classList.toggle('open', expanded);
    if (group.lo <= recommendedFloor && recommendedFloor <= group.hi) section.classList.add('recommended');

    const head = document.createElement('button'); head.type = 'button'; head.className = 'floor-group-head';
    head.setAttribute('aria-expanded', String(expanded));
    const bodyId = `floor-group-${group.lo}`;
    head.setAttribute('aria-controls', bodyId);
    const range = groupPowerRange(group);
    const inThisGroup = group.lo <= recommendedFloor && recommendedFloor <= group.hi;
    head.innerHTML = `<span class="floor-group-caret" aria-hidden="true"></span><b>${group.label}</b>`
      + (isCastle(group.lo) ? `<span class="floor-group-realm">${realmName(group.lo)}</span>` : '')
      + (inThisGroup ? '<span class="floor-group-rec">· 내 권장 층 포함</span>' : '')
      + `<span class="floor-group-range">권장 ${formatPower(range.lo)} ~ ${formatPower(range.hi)}</span>`;

    const grid = document.createElement('div'); grid.className = 'floor-grid'; grid.id = bodyId;
    grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', group.label);
    grid.hidden = !expanded;
    for (let floor = group.lo; floor <= group.hi; floor++) {
      const recommended = recommendedFloorPower(floor);
      const state = floorPowerState(power, floor);
      const current = floor === save.floor;
      const locked = floor > save.maxFloor;
      const isRecommended = floor === recommendedFloor;
      const label = stateLabels[state] + (isRecommended ? ' · 내 권장 층' : '');
      const button = document.createElement('button'); button.type = 'button';
      button.className = `floor-card ${state}${current ? ' current' : ''}${locked ? ' locked' : ''}${isRecommended ? ' recommended' : ''}`;
      if (current) button.setAttribute('aria-current', 'location');
      if (locked) {
        button.disabled = true;
        button.setAttribute('title', '최고 층 보스 처치 후 해금');
      }
      button.setAttribute('aria-label',
        `${floor}층, 권장 전투력 ${formatPower(recommended)}, ${label}${current ? ', 현재 층' : ''}${locked ? ', 잠김' : ''}`);
      button.innerHTML = `<span class="floor-card-head"><b>${floor}층</b>`
        + (floor % 5 === 0 ? '<span class="floor-card-crown" aria-hidden="true">👑</span>' : '')
        + (current ? '<span class="floor-card-badge">현재</span>' : '')
        + `<span class="floor-card-state">${label}</span></span>`
        + `<span class="floor-card-power"><small>권장 전투력</small><strong>${formatPower(recommended)}</strong></span>`;
      if (!locked) button.onclick = () => { const result = this.world.travelToFloor(floor); if (result.ok) this.open(null); this.message(result.message); };
      grid.appendChild(button);
    }
    head.onclick = () => {
      const current = expandedGroups ?? new Set([groupStart(recommendedFloor)]);
      const next = new Set(current);
      if (next.has(group.lo)) next.delete(group.lo); else next.add(group.lo);
      expandedGroups = next;
      const isOpen = next.has(group.lo);
      grid.hidden = !isOpen;
      section.classList.toggle('open', isOpen);
      head.setAttribute('aria-expanded', String(isOpen));
    };
    section.append(head, grid);
    groups.appendChild(section);
  }
  dialog.appendChild(groups);

  const footer = document.createElement('p'); footer.className = 'floor-note';
  footer.textContent = `내 권장 층(${recommendedFloor}층)이 든 구간만 자동으로 펼쳐집니다 · 구간을 누르면 접히고 펼쳐집니다`;
  const footerTip = document.createElement('p'); footerTip.className = 'floor-note floor-note-dim';
  footerTip.textContent = '권장 전투력은 몹 체력·1타 곡선에서 계산합니다 · 최고 층 위는 보스 처치 후 열립니다';
  dialog.append(footer, footerTip);
}
