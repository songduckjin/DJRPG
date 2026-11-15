import { expToNext, statNames, totalStats, type Stat } from '../../game/store';
import type { Interface } from '../interface';

export function renderCharacter(this: Interface, dialog: HTMLElement): void {
    const save = this.world.save, stats = totalStats(save);
    const overview = document.createElement('div'); overview.className = 'character-overview';
    overview.innerHTML = `<b>LV ${save.level} · ${save.floor}층</b><span>경험치 ${save.exp} / ${expToNext(save.level)}</span><span>골드 ${save.gold} · 강화석 ${save.stones}</span>`;
    dialog.appendChild(overview);
    const grid = document.createElement('div'); grid.className = 'character-stats';
    for (const stat of ['attack', 'defense', 'health', 'crit', 'speed'] as Stat[]) {
      const line = document.createElement('div'); line.innerHTML = `<span>${statNames[stat]}</span><b>${stats[stat]}${stat === 'crit' || stat === 'speed' ? '%' : ''}</b>`; grid.appendChild(line);
    }
    dialog.appendChild(grid);
    const gender = document.createElement('div'); gender.className = 'gender-switch'; gender.innerHTML = '<span>캐릭터 성별</span>';
    for (const choice of ['male', 'female'] as const) {
      const button = document.createElement('button'); button.textContent = choice === 'male' ? '남성 전사' : '여성 전사';
      button.classList.toggle('active', save.gender === choice);
      button.onclick = () => { save.gender = choice; this.world.onChange(); };
      gender.appendChild(button);
    }
    dialog.appendChild(gender);
  }
