import { enemyMaxHp } from '../../game/world';
import { MAX_FLOOR } from '../../game/store';
import type { Interface } from '../interface';

export function renderFloor(this: Interface, dialog: HTMLElement): void {
    const save = this.world.save;
    const summary = document.createElement('p'); summary.className = 'floor-summary';
    summary.textContent = `현재 ${save.floor}층 · 최고 ${save.maxFloor}층 · 층을 옮기면 현재 층의 처치 진행도와 바닥 드랍이 초기화됩니다.`;
    dialog.appendChild(summary);
    const mode = document.createElement('button'); mode.className = 'floor-mode'; mode.type = 'button';
    mode.textContent = save.autoClimb ? '자동 등반 중 · 누르면 현재 층 반복' : '현재 층 반복 중 · 누르면 자동 등반';
    mode.setAttribute('aria-pressed', String(!save.autoClimb));
    mode.onclick = () => { save.autoClimb = !save.autoClimb; this.world.onChange(); this.message(save.autoClimb ? (save.floor >= MAX_FLOOR ? `최고 ${MAX_FLOOR}층입니다. 보스를 처치해도 ${MAX_FLOOR}층에서 계속 사냥합니다.` : '보스 처치 시 다음 층으로 이동합니다.') : '보스 처치 후에도 현재 층에서 사냥합니다.'); };
    dialog.appendChild(mode);
    const grid = document.createElement('div'); grid.className = 'floor-grid';
    for (let floor = 1; floor <= save.maxFloor; floor++) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'floor-choice';
      button.classList.toggle('current', floor === save.floor);
      if (floor === save.floor) button.setAttribute('aria-current', 'location');
      button.innerHTML = `<b>${floor}층${floor % 5 === 0 ? ' 👑' : ''}</b><small>권장 Lv.${Math.max(1, Math.ceil(floor * .8))}</small><small>몬스터 HP ${enemyMaxHp(floor, false)}</small>`;
      button.onclick = () => { const result = this.world.travelToFloor(floor); if (result.ok) this.open(null); this.message(result.message); };
      grid.appendChild(button);
    }
    const locked = document.createElement('button'); locked.type = 'button'; locked.className = 'floor-choice locked'; locked.disabled = true;
    // 20층이 마지막 층이다(작업 204): 그 위는 잠긴 칸 대신 '최고 20층 달성'을 보여 준다.
    if (save.maxFloor < MAX_FLOOR) locked.innerHTML = `<b>🔒 ${save.maxFloor + 1}층</b><small>최고 층 보스 처치 후 해금</small>`;
    else locked.innerHTML = `<b>🏆 최고 ${MAX_FLOOR}층</b><small>${MAX_FLOOR}층 달성 · 마지막 층</small>`;
    grid.appendChild(locked); dialog.appendChild(grid);
  }
