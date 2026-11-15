import { expToNext, floorKillTarget, MAX_LEVEL, totalStats } from '../game/store';
import { cooldowns, costs, type Action } from '../game/world';
import { skills, type SkillId } from '../game/skills';
import type { Interface } from './interface';

const shortNames: Record<SkillId, string> = { slash2: '이단참', spin: '용오름', crushing: '크러싱', slam: '스탬프', warcry: '레이지', power: '파워', destroy: '충격파', hell: '헬파이어' };

export function setupStick(this: Interface): void {
    const stick = this.get('.stick'), knob = this.get('.stick-knob');
    let pointer: number | undefined;
    const move = (e: PointerEvent) => {
      if (pointer !== e.pointerId) return;
      const rect = stick.getBoundingClientRect();
      const dx = e.clientX - rect.left - rect.width / 2, dy = e.clientY - rect.top - rect.height / 2;
      const d = Math.hypot(dx, dy), scale = Math.min(1, 43 / (d || 1));
      knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
      this.world.move = { x: dx / 43 * scale, y: dy / 43 * scale };
    };
    stick.addEventListener('pointerdown', e => {
      e.preventDefault(); pointer = e.pointerId; this.world.joystickActive = true;
      if (this.world.save.auto) { this.world.save.auto = false; this.message('수동 이동: AUTO OFF'); this.world.onChange(); }
      stick.setPointerCapture(pointer); move(e);
    });
    stick.addEventListener('pointermove', move);
    const end = () => { pointer = undefined; this.world.joystickActive = false; knob.style.transform = ''; this.world.move = { x: 0, y: 0 }; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  }

export function renderStatus(this: Interface): void {
    const { save, player } = this.world;
    const progress = save.level >= MAX_LEVEL ? 100 : Math.min(100, Math.max(0, save.exp / expToNext(save.level) * 100));
    this.top.innerHTML = `<button class="level-badge" type="button" aria-label="계정 정보 열기"><span>LV</span><b>${save.level >= MAX_LEVEL ? 'MAX' : save.level}</b></button><div class="status-main"><button class="floor-button" type="button" aria-label="층 선택, 현재 ${save.floor}층"><span>층 <b>${save.floor}</b> · ${Math.min(save.floorKills, floorKillTarget(save.floor))}/${floorKillTarget(save.floor)}</span><span aria-hidden="true">▾</span></button><span class="gold">◆ ${save.gold}</span></div><div class="exp"><i style="width:${progress}%"></i></div>`;
    const levelBadge = this.get('.level-badge'); levelBadge.style.setProperty('--progress', `${progress}%`); levelBadge.addEventListener('click', () => this.open('account'));
    this.get('.floor-button').addEventListener('click', () => this.open('floor'));
    const toggle = this.get('.auto-toggle'); toggle.textContent = `AUTO ${save.auto ? 'ON' : 'OFF'}`; toggle.classList.toggle('on', save.auto);
    this.get('.hp').style.setProperty('--fill', `${Math.max(0, player.hp / totalStats(save).health * 100)}%`);
    this.get('.mp').style.setProperty('--fill', `${player.mp}%`);
    this.get('.hp b').textContent = `${Math.ceil(player.hp)}`; this.get('.mp b').textContent = `${Math.ceil(player.mp)}`;
    const text = [save.auto ? '자동사냥 중입니다. 직접 이동하면 AUTO가 꺼집니다.' : '조이스틱으로 이동해 첫 해골전사를 처치하세요.', '빛기둥으로 이동해 낡은 두손검을 줍세요.', '하단 갑옷 아이콘을 눌러 가방의 낡은 두손검을 장착하세요.'][save.tutorial];
    this.banner.textContent = text ?? ''; this.banner.hidden = save.tutorial >= 3;
  }

export function tick(this: Interface): void {
    for (let index = 0; index < 4; index++) {
      const kind: Action = index === 0 ? 'attack' : this.world.save.quickSlots[index - 1];
      const button = index === 0 ? this.attackButton : this.slotButtons[index - 1];
      const name = kind === 'attack' ? '대검 베기' : skills[kind].name;
      if (button.dataset.skill !== kind) {
        button.dataset.skill = kind;
        button.querySelector('strong')!.textContent = kind === 'attack' ? '⚔' : skills[kind].icon;
        button.querySelector('small')!.textContent = kind === 'attack' ? '대검 베기' : shortNames[kind];
        button.setAttribute('aria-label', name);
      }
      const cd = this.world.cooldown[kind];
      button.classList.toggle('cooling', cd > 0); button.querySelector('em')!.textContent = cd > 0 ? cd.toFixed(1) : '';
      button.title = `${name} · 마나 ${costs[kind]} · 쿨타임 ${cooldowns[kind]}초`;
    }
    const { player, save } = this.world;
    this.get('.hp').style.setProperty('--fill', `${Math.max(0, player.hp / totalStats(save).health * 100)}%`);
    this.get('.mp').style.setProperty('--fill', `${player.mp}%`);
    this.get('.hp b').textContent = `${Math.ceil(player.hp)}`; this.get('.mp b').textContent = `${Math.ceil(player.mp)}`;
  }

export function renderBagBadge(this: Interface): void {
    const badge = this.get('.new-badge'); badge.textContent = `${this.newItems.size}`; badge.hidden = this.newItems.size === 0;
  }
