import { totalStats } from '../../game/store';
import { MAX_FLOOR } from '../../game/progress';
import type { Interface } from '../interface';
import {
  combatPower, floorGroups, floorPowerState, formatPower, groupPowerRange, groupStart,
  recommendedFloorPower, type FloorPowerState
} from '../../game/floorPower';
import { bestFarmFloor, killsPerHourAt } from '../../game/offline';

/**
 * 「층 선택」 창 — 1안(2026-11-24 대장님·덕진 님 확정, `downloads/djrpg_offline_rework/ui_a_floor_list.png`).
 *
 * 층 카드의 둘째 줄이 `권장 전투력`에서 **`시간당 N 마리`** 로 바뀐다. 그 층에서 지금 스펙으로 한 시간
 * 사냥하면 몇 마리를 잡는지(쓰러짐 포함)를 층을 고르는 자리에서 바로 보여 주고, 가장 빠른 층에 `★ 최다`,
 * 가장 빠른 층 대비 손해가 큰 층에 `▼N%`를 붙인다. 상단 `★ 추천`도 전투력이 아니라 **시간당 처치** 기준이다.
 *
 * 처치 수는 `game/offline.ts`의 `killsPerHourAt`·`bestFarmFloor`가 정한다 — 접속 사냥과 같은 몹 HP·젠에
 * 생존 가동률(체력·방어·회피·피흡·회복·부활 대기)을 곱한 값이라, 방치 정산서의 숫자와 같은 식이다.
 */

/** 상태 문구 — `여유`(충분) · `적정`(권장 근처) · `위험`(모자람). */
const stateLabels: Record<FloorPowerState, string> = { easy: '여유', okay: '적정', danger: '위험' };

/** 가장 빠른 층보다 이만큼(%) 느리면 카드에 `▼N%`를 붙인다. */
export const FARM_LOSS_BADGE_PCT = 15;
/** 손해가 이만큼(%) 이상이면 `▼N%`를 붉게 — "여기서 사냥하면 손해"가 한눈에 보이게. */
export const FARM_LOSS_DANGER_PCT = 40;

/** `8,261` — 시간당 처치 수 표기(권장 전투력과 같은 천 단위 구분). */
export function formatKills(value: number): string {
  return Math.round(Number.isFinite(value) ? value : 0).toLocaleString('ko-KR');
}

/**
 * 펼쳐 둔 구간(10층 단위)의 시작 층 — 사용자가 접고 편 것을 같은 창을 다시 그려도 지킨다.
 * `null`이면 아직 손대지 않은 상태다: **가장 빠른 층**이 든 구간 하나만 펼친다.
 */
let expandedGroups: Set<number> | null = null;

/** 창을 새로 열 때 `가장 빠른 층 구간만` 상태로 되돌린다. */
export function resetFloorGroups(): void { expandedGroups = null; }

export function renderFloor(this: Interface, dialog: HTMLElement): void {
  const save = this.world.save;
  const power = combatPower(totalStats(save));
  // 지금 스펙에서 가장 빠른 층 — 최고 도달 층 이하에서만 고른다(아직 못 가는 층을 권하지 않는다).
  const bestFloor = bestFarmFloor(save);
  const bestRate = killsPerHourAt(save, bestFloor);

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

  // ── 상단 배너: 내 전투력 + 시간당 처치가 가장 많은 층 ──────────────────────
  const banner = document.createElement('div'); banner.className = 'floor-power';
  const mine = document.createElement('span'); mine.className = 'floor-power-mine';
  mine.innerHTML = `내 전투력 <b>${formatPower(power)}</b>`;
  const pick = document.createElement('span'); pick.className = 'floor-power-rec';
  pick.textContent = `★ 추천 ${bestFloor}층`;
  banner.append(mine, pick);
  dialog.appendChild(banner);

  // 배너 아래 한 줄 — 왜 그 층인지(시간당 처치)를 숫자로 말한다.
  const tip = document.createElement('p'); tip.className = 'floor-farm-tip';
  tip.textContent = `⏱ ${bestFloor}층 ${formatKills(bestRate)}마리/시간 — 지금 스펙에서 가장 빠른 층`;
  dialog.appendChild(tip);

  // ── 10층 단위 아코디언 ──────────────────────────────────────────────────────
  const groups = document.createElement('div'); groups.className = 'floor-groups';
  const open = expandedGroups ?? new Set([groupStart(bestFloor)]);
  for (const group of floorGroups()) {
    const section = document.createElement('section');
    section.className = 'floor-group';
    const expanded = open.has(group.lo);
    section.classList.toggle('open', expanded);

    const head = document.createElement('button'); head.type = 'button'; head.className = 'floor-group-head';
    head.setAttribute('aria-expanded', String(expanded));
    const bodyId = `floor-group-${group.lo}`;
    head.setAttribute('aria-controls', bodyId);
    const range = groupPowerRange(group);
    head.innerHTML = `<span class="floor-group-caret" aria-hidden="true"></span><b>${group.label}</b>`
      + `<span class="floor-group-range">권장 ${formatPower(range.lo)} ~ ${formatPower(range.hi)}</span>`;

    const grid = document.createElement('div'); grid.className = 'floor-grid'; grid.id = bodyId;
    grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', group.label);
    grid.hidden = !expanded;
    for (let floor = group.lo; floor <= group.hi; floor++) {
      const recommended = recommendedFloorPower(floor);
      const state = floorPowerState(power, floor);
      const current = floor === save.floor;
      const locked = floor > save.maxFloor;
      const rate = killsPerHourAt(save, floor);
      const best = floor === bestFloor;
      // 가장 빠른 층 대비 손해(%) — 15% 이상일 때만 카드에 붙인다(잔차는 소음이다).
      const loss = bestRate > 0 ? Math.max(0, Math.round((1 - rate / bestRate) * 100)) : 0;
      const label = stateLabels[state];
      const button = document.createElement('button'); button.type = 'button';
      button.className = `floor-card ${state}${current ? ' current' : ''}${locked ? ' locked' : ''}${best ? ' best' : ''}`;
      if (current) button.setAttribute('aria-current', 'location');
      if (locked) {
        button.disabled = true;
        button.setAttribute('title', '최고 층 보스 처치 후 해금');
      }
      button.setAttribute('aria-label',
        `${floor}층, 시간당 ${formatKills(rate)}마리, 권장 전투력 ${formatPower(recommended)}, ${label}`
        + `${best ? ', 가장 빠른 층' : ''}${loss > 0 ? `, 최다 대비 ${loss}% 적음` : ''}${current ? ', 현재 층' : ''}${locked ? ', 잠김' : ''}`);
      button.innerHTML = `<span class="floor-card-head"><b>${floor}층</b>`
        + (floor % 5 === 0 ? '<span class="floor-card-crown" aria-hidden="true">👑</span>' : '')
        + (best ? '<span class="floor-card-badge best">★ 최다</span>' : '')
        + (current ? '<span class="floor-card-badge">현재</span>' : '')
        + `<span class="floor-card-state">${label}</span></span>`
        + `<span class="floor-card-rate"><small>시간당</small><strong>${formatKills(rate)}</strong><small>마리</small>`
        + (loss >= FARM_LOSS_BADGE_PCT ? `<span class="floor-card-loss${loss >= FARM_LOSS_DANGER_PCT ? ' danger' : ''}">▼${loss}%</span>` : '')
        + '</span>';
      if (!locked) button.onclick = () => { const result = this.world.travelToFloor(floor); if (result.ok) this.open(null); this.message(result.message); };
      grid.appendChild(button);
    }
    head.onclick = () => {
      const current = expandedGroups ?? new Set([groupStart(bestFloor)]);
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
  footer.textContent = '시간당 = 지금 스펙으로 1시간 사냥 시 처치 수(쓰러짐 포함)';
  dialog.appendChild(footer);
}
