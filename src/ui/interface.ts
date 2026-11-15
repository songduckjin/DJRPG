import { rarityNames, slotNames, slots, statNames, totalStats, type Item, type Save, type Stat } from '../game/store';
import { cooldowns, costs, type Action, type World } from '../game/world';

const actions: { key: Action; icon: string; name: string }[] = [
  { key: 'attack', icon: '⚔', name: '공격' }, { key: 'spin', icon: '⟳', name: '회전' },
  { key: 'slam', icon: '✦', name: '강타' }, { key: 'warcry', icon: '♛', name: '함성' }
];

export class Interface {
  private selected?: string;
  private tab: 'equipment' | 'bag' = 'equipment';
  private top: HTMLElement;
  private banner: HTMLElement;
  private inventory: HTMLElement;
  private actionButtons = new Map<Action, HTMLButtonElement>();
  private toast: HTMLElement;
  private toastTimer = 0;
  private onSave: () => void;

  constructor(private root: HTMLElement, private world: World, onSave: () => void) {
    this.onSave = onSave;
    root.innerHTML = `<main class="game-shell"><section class="battle"><div class="battle-canvas"></div><div class="top-hud"></div><div class="tutorial"></div><div class="controls"><div class="stick"><div class="stick-knob"></div></div><div class="action-pad"></div></div><div class="resource hp"><span>HP</span><b></b></div><div class="resource mp"><span>MP</span><b></b></div></section><section class="inventory"></section><div class="toast" role="status"></div></main>`;
    this.top = this.get('.top-hud'); this.banner = this.get('.tutorial'); this.inventory = this.get('.inventory'); this.toast = this.get('.toast');
    const pad = this.get('.action-pad');
    for (const action of actions) {
      const button = document.createElement('button');
      button.className = `action action-${action.key}`;
      button.setAttribute('aria-label', action.name);
      button.innerHTML = `<strong>${action.icon}</strong><small>${action.name}</small><em></em>`;
      pad.appendChild(button); this.actionButtons.set(action.key, button);
      if (action.key === 'attack') {
        button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); world.attackHeld = true; world.action('attack'); });
        button.addEventListener('pointerup', () => world.attackHeld = false);
        button.addEventListener('pointercancel', () => world.attackHeld = false);
        button.addEventListener('lostpointercapture', () => world.attackHeld = false);
      } else button.addEventListener('pointerdown', e => { e.preventDefault(); world.action(action.key); });
    }
    this.setupStick();
    world.onChange = () => { this.renderInventory(); this.renderStatus(); this.onSave(); };
    world.onMessage = text => this.message(text);
    this.renderInventory(); this.renderStatus();
  }

  get canvasHost(): HTMLElement { return this.get('.battle-canvas'); }
  private get(selector: string): HTMLElement { const node = this.root.querySelector<HTMLElement>(selector); if (!node) throw new Error(`UI 구성 요소 누락: ${selector}`); return node; }
  message(text: string): void { this.toast.textContent = text; this.toast.classList.add('visible'); clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => this.toast.classList.remove('visible'), 3200); }

  private setupStick(): void {
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
    stick.addEventListener('pointerdown', e => { e.preventDefault(); pointer = e.pointerId; stick.setPointerCapture(pointer); move(e); });
    stick.addEventListener('pointermove', move);
    const end = () => { pointer = undefined; knob.style.transform = ''; this.world.move = { x: 0, y: 0 }; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  }

  renderStatus(): void {
    const { save, player } = this.world;
    const need = save.level * 45;
    this.top.innerHTML = `<div class="status-main"><span>층 <b>${save.floor}</b></span><span>처치 <b>${save.kills}</b></span><span>LV <b>${save.level}</b></span><span class="gold">◆ ${save.gold}</span></div><div class="exp"><i style="width:${save.exp / need * 100}%"></i></div>`;
    const hp = this.get('.hp'), mp = this.get('.mp');
    hp.style.setProperty('--fill', `${Math.max(0, player.hp / totalStats(save).health * 100)}%`);
    mp.style.setProperty('--fill', `${player.mp}%`);
    hp.querySelector('b')!.textContent = `${Math.ceil(player.hp)}`;
    mp.querySelector('b')!.textContent = `${Math.ceil(player.mp)}`;
    const text = ['왼쪽 조이스틱으로 이동하고 공격하여 해골전사를 처치하세요.', '빛기둥으로 이동해 낡은 검을 줍세요.', '가방에서 낡은 검을 선택해 장착하세요.'][save.tutorial];
    this.banner.textContent = text ?? '';
    this.banner.hidden = save.tutorial >= 3;
  }

  tick(): void {
    for (const action of actions) {
      const button = this.actionButtons.get(action.key)!;
      const cd = this.world.cooldown[action.key];
      button.classList.toggle('cooling', cd > 0);
      button.querySelector('em')!.textContent = cd > 0 ? cd.toFixed(1) : '';
      button.title = `${action.name} · 마나 ${costs[action.key]} · 쿨타임 ${cooldowns[action.key]}초`;
    }
    this.get('.hp').style.setProperty('--fill', `${Math.max(0, this.world.player.hp / totalStats(this.world.save).health * 100)}%`);
    this.get('.mp').style.setProperty('--fill', `${this.world.player.mp}%`);
    this.get('.hp b').textContent = `${Math.ceil(this.world.player.hp)}`;
    this.get('.mp b').textContent = `${Math.ceil(this.world.player.mp)}`;
  }

  private renderInventory(): void {
    const save = this.world.save;
    const stats = totalStats(save);
    this.inventory.innerHTML = `<div class="inventory-head"><div><small>THE EXILE'S SATCHEL</small><h1>전사의 장비</h1></div><span class="stone">강화석 ${save.stones}</span></div><div class="inventory-tabs"><button data-tab="equipment" class="${this.tab === 'equipment' ? 'active' : ''}">장비</button><button data-tab="bag" class="${this.tab === 'bag' ? 'active' : ''}">가방 <span>${save.bag.length}/40</span></button></div><div class="inventory-body"></div>`;
    this.inventory.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(button => button.onclick = () => { this.tab = button.dataset.tab as 'equipment' | 'bag'; this.renderInventory(); });
    const body = this.inventory.querySelector<HTMLElement>('.inventory-body')!;
    if (this.tab === 'equipment') {
      body.innerHTML = `<div class="stat-strip"><span>공격 <b>${stats.attack}</b></span><span>방어 <b>${stats.defense}</b></span><span>체력 <b>${stats.health}</b></span><span>치명 <b>${stats.crit}%</b></span></div><div class="equipment-grid"></div>`;
      const grid = body.querySelector<HTMLElement>('.equipment-grid')!;
      for (const slot of slots) {
        const item = save.equipment[slot];
        const cell = document.createElement('button'); cell.className = `equipment-slot ${item ? item.rarity : ''}`;
        cell.innerHTML = `<span class="slot-icon">${this.icon(slot)}</span><span><small>${slotNames[slot]}</small><b>${item?.name ?? '비어 있음'}</b></span>`;
        cell.onclick = () => { if (item) { const displaced = save.equipment[slot]; if (displaced) { if (save.bag.length >= 40) { this.message('가방이 가득 차 장비를 해제할 수 없습니다.'); return; } save.bag.push(displaced); delete save.equipment[slot]; this.world.onChange(); } } };
        grid.appendChild(cell);
      }
    } else {
      const grid = document.createElement('div'); grid.className = 'bag-grid'; body.appendChild(grid);
      for (const item of save.bag) {
        const cell = document.createElement('button'); cell.className = `bag-item ${item.rarity} ${this.selected === item.id ? 'selected' : ''}`;
        cell.innerHTML = `<span class="item-icon">${this.icon(item.slot)}</span><small>${rarityNames[item.rarity]}</small><b></b>`;
        cell.querySelector('b')!.textContent = item.name;
        cell.onclick = () => { this.selected = item.id; this.renderInventory(); };
        grid.appendChild(cell);
      }
      if (!save.bag.length) grid.innerHTML = '<p class="empty">아직 획득한 장비가 없습니다.<br>던전에서 해골전사를 처치하세요.</p>';
      const item = save.bag.find(i => i.id === this.selected);
      if (item) body.appendChild(this.itemDetail(save, item));
      const salvage = document.createElement('button'); salvage.className = 'salvage'; salvage.textContent = '일반·마법 장비 일괄 분해'; salvage.onclick = () => this.salvage(); body.appendChild(salvage);
    }
  }

  private itemDetail(save: Save, item: Item): HTMLElement {
    const panel = document.createElement('div'); panel.className = `item-detail ${item.rarity}`;
    const equipped = save.equipment[item.slot];
    const title = document.createElement('h2'); title.textContent = `${item.name} · ${slotNames[item.slot]}`; panel.appendChild(title);
    for (const stat of Object.keys(item.stats) as Stat[]) {
      const diff = (item.stats[stat] ?? 0) - (equipped?.stats[stat] ?? 0);
      const line = document.createElement('span'); line.className = diff >= 0 ? 'up' : 'down';
      line.textContent = `${statNames[stat]} +${item.stats[stat]}  ${diff >= 0 ? '▲' : '▼'}${Math.abs(diff)}`; panel.appendChild(line);
    }
    const buttons = document.createElement('div'); buttons.className = 'detail-actions';
    const equip = document.createElement('button'); equip.textContent = '장착'; equip.onclick = () => {
      const index = save.bag.findIndex(i => i.id === item.id); if (index < 0) return;
      save.bag.splice(index, 1); if (equipped) save.bag.push(equipped); save.equipment[item.slot] = item;
      if (item.name === '낡은 검' && save.tutorial === 2) { save.tutorial = 3; this.message('튜토리얼 완료! 검을 장착했습니다.'); }
      this.selected = undefined; this.world.onChange();
    };
    const dismantle = document.createElement('button'); dismantle.textContent = '분해'; dismantle.onclick = () => {
      save.bag = save.bag.filter(i => i.id !== item.id); save.gold += this.salvageValue(item); save.stones += item.rarity === 'common' ? 1 : 2; this.selected = undefined; this.world.onChange();
    };
    buttons.append(equip, dismantle); panel.appendChild(buttons); return panel;
  }

  private salvage(): void {
    const save = this.world.save;
    const selected = save.bag.filter(item => item.rarity === 'common' || item.rarity === 'magic');
    if (!selected.length) { this.message('분해할 일반·마법 장비가 없습니다.'); return; }
    save.bag = save.bag.filter(item => !selected.includes(item));
    save.gold += selected.reduce((sum, item) => sum + this.salvageValue(item), 0);
    save.stones += selected.reduce((sum, item) => sum + (item.rarity === 'common' ? 1 : 2), 0);
    this.selected = undefined; this.message(`${selected.length}개 장비를 분해했습니다.`); this.world.onChange();
  }
  private salvageValue(item: Item): number { return { common: 3, magic: 10, rare: 25, legendary: 60 }[item.rarity]; }
  private icon(slot: string): string { return ({ weapon: '⚔', offhand: '⬟', helmet: '♜', armor: '♟', necklace: '◇', gloves: '✥', belt: '═', boots: '♧', ring1: '◉', ring2: '◉' } as Record<string, string>)[slot] ?? '◆'; }
}
