import { expToNext, rarityNames, slotNames, slots, statNames, totalStats, type Item, type Save, type Stat } from '../game/store';
import { cooldowns, costs, type Action, type World } from '../game/world';

const actions: { key: Action; icon: string; name: string; description: string; power: string }[] = [
  { key: 'attack', icon: '⚔', name: '기본 공격', description: '전방 부채꼴 검기 베기. 버튼을 누르고 있으면 연속 공격합니다.', power: '공격력 × 1.0' },
  { key: 'spin', icon: '⟳', name: '회전 베기', description: '주변의 모든 적을 휘감는 360도 광역 공격.', power: '공격력 × 1.65' },
  { key: 'slam', icon: '✦', name: '대지 강타', description: '전방에 붉은 균열을 내고 적을 밀어냅니다.', power: '공격력 × 2.2' },
  { key: 'warcry', icon: '♛', name: '전투 함성', description: '6초 동안 공격력과 이동속도가 상승하고 주변 적을 밀어냅니다.', power: '공격력 × 1.5 / 이동속도 상승' }
];
type Modal = 'status' | 'equipment' | 'skills' | 'account';

export class Interface {
  private selected?: string;
  private openModal: Modal | null = null;
  private top: HTMLElement;
  private banner: HTMLElement;
  private inventory: HTMLElement;
  private modal: HTMLElement;
  private actionButtons = new Map<Action, HTMLButtonElement>();
  private toast: HTMLElement;
  private toastTimer = 0;
  private lastSaved = true;
  private confirmReset = false;

  constructor(private root: HTMLElement, private world: World, private onSave: () => boolean) {
    root.innerHTML = `<main class="game-shell"><section class="battle"><div class="battle-canvas"></div><div class="top-hud"></div><button class="auto-toggle" type="button"></button><div class="tutorial"></div><div class="controls"><div class="stick"><div class="stick-knob"></div></div><div class="action-pad"></div></div><div class="resource hp"><span>HP</span><b></b></div><div class="resource mp"><span>MP</span><b></b></div></section><section class="inventory"><div class="inventory-head"><div><small>THE EXILE'S SATCHEL</small><h1>가방 <span class="bag-count"></span></h1></div><button class="salvage" type="button">일괄 분해</button></div><div class="inventory-body"></div><nav class="bottom-nav"><button data-modal="status">내 상태</button><button data-modal="equipment">장비</button><button data-modal="skills">스킬</button></nav></section><div class="modal-backdrop" hidden><div class="modal-dialog" role="dialog" aria-modal="true"></div></div><div class="toast" role="status"></div></main>`;
    this.top = this.get('.top-hud'); this.banner = this.get('.tutorial'); this.inventory = this.get('.inventory-body');
    this.modal = this.get('.modal-backdrop'); this.toast = this.get('.toast');
    this.get('.auto-toggle').addEventListener('click', () => { world.save.auto = !world.save.auto; this.message(`AUTO ${world.save.auto ? 'ON' : 'OFF'}`); world.onChange(); });
    this.get('.salvage').addEventListener('click', () => this.salvage());
    this.root.querySelectorAll<HTMLButtonElement>('[data-modal]').forEach(button => button.onclick = () => this.open(button.dataset.modal as Modal));
    this.modal.addEventListener('click', event => { if (event.target === this.modal) this.open(null); });
    window.addEventListener('keydown', event => { if (event.key === 'Escape') this.open(null); });
    const pad = this.get('.action-pad');
    for (const action of actions) {
      const button = document.createElement('button'); button.className = `action action-${action.key}`; button.type = 'button';
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
    world.onChange = () => {
      this.lastSaved = this.onSave(); this.renderInventory(); this.renderStatus();
      if (this.openModal !== 'account' || document.activeElement?.tagName !== 'INPUT') this.renderModal();
    };
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
    stick.addEventListener('pointerdown', e => {
      e.preventDefault(); pointer = e.pointerId; this.world.joystickActive = true;
      if (this.world.save.auto) { this.world.save.auto = false; this.message('수동 이동: AUTO OFF'); this.world.onChange(); }
      stick.setPointerCapture(pointer); move(e);
    });
    stick.addEventListener('pointermove', move);
    const end = () => { pointer = undefined; this.world.joystickActive = false; knob.style.transform = ''; this.world.move = { x: 0, y: 0 }; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  }

  renderStatus(): void {
    const { save, player } = this.world;
    const progress = Math.min(100, Math.max(0, save.exp / expToNext(save.level) * 100));
    this.top.innerHTML = `<div class="status-main"><span>층 <b>${save.floor}</b></span><span>처치 <b>${save.kills}</b></span><span class="gold">◆ ${save.gold}</span></div><button class="level-badge" type="button" aria-label="계정 정보 열기"><span>LV</span><b>${save.level}</b></button><div class="exp"><i style="width:${progress}%"></i></div>`;
    const levelBadge = this.get('.level-badge'); levelBadge.style.setProperty('--progress', `${progress}%`); levelBadge.addEventListener('click', () => this.open('account'));
    const toggle = this.get('.auto-toggle'); toggle.textContent = `AUTO ${save.auto ? 'ON' : 'OFF'}`; toggle.classList.toggle('on', save.auto);
    this.get('.hp').style.setProperty('--fill', `${Math.max(0, player.hp / totalStats(save).health * 100)}%`);
    this.get('.mp').style.setProperty('--fill', `${player.mp}%`);
    this.get('.hp b').textContent = `${Math.ceil(player.hp)}`; this.get('.mp b').textContent = `${Math.ceil(player.mp)}`;
    const text = [save.auto ? '자동사냥 중입니다. 직접 이동하면 AUTO가 꺼집니다.' : '조이스틱으로 이동해 첫 해골전사를 처치하세요.', '빛기둥으로 이동해 낡은 검을 줍세요.', '가방에서 낡은 검을 선택해 장착하세요.'][save.tutorial];
    this.banner.textContent = text ?? ''; this.banner.hidden = save.tutorial >= 3;
  }

  tick(): void {
    for (const action of actions) {
      const button = this.actionButtons.get(action.key)!; const cd = this.world.cooldown[action.key];
      button.classList.toggle('cooling', cd > 0); button.querySelector('em')!.textContent = cd > 0 ? cd.toFixed(1) : '';
      button.title = `${action.name} · 마나 ${costs[action.key]} · 쿨타임 ${cooldowns[action.key]}초`;
    }
    const { player, save } = this.world;
    this.get('.hp').style.setProperty('--fill', `${Math.max(0, player.hp / totalStats(save).health * 100)}%`);
    this.get('.mp').style.setProperty('--fill', `${player.mp}%`);
    this.get('.hp b').textContent = `${Math.ceil(player.hp)}`; this.get('.mp b').textContent = `${Math.ceil(player.mp)}`;
  }

  private renderInventory(): void {
    const save = this.world.save;
    this.get('.bag-count').textContent = `${save.bag.length}/40`;
    this.inventory.replaceChildren();
    const grid = document.createElement('div'); grid.className = 'bag-grid'; this.inventory.appendChild(grid);
    for (const item of save.bag) {
      const cell = document.createElement('button'); cell.className = `bag-item ${item.rarity} ${this.selected === item.id ? 'selected' : ''}`;
      cell.innerHTML = `<span class="item-icon">${this.icon(item.slot)}</span><small>${rarityNames[item.rarity]}</small><b></b>`;
      cell.querySelector('b')!.textContent = item.name;
      cell.onclick = () => { this.selected = item.id; this.renderInventory(); };
      grid.appendChild(cell);
    }
    if (!save.bag.length) grid.innerHTML = '<p class="empty">획득한 장비가 없습니다. 해골전사를 처치하세요.</p>';
    const selected = save.bag.find(item => item.id === this.selected);
    if (selected) this.inventory.appendChild(this.itemDetail(save, selected));
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
      save.bag = save.bag.filter(i => i.id !== item.id); save.gold += this.salvageValue(item); save.stones += item.rarity === 'common' ? 1 : 2;
      this.selected = undefined; this.world.onChange();
    };
    buttons.append(equip, dismantle); panel.appendChild(buttons); return panel;
  }

  private salvage(): void {
    const save = this.world.save;
    const chosen = save.bag.filter(item => item.rarity === 'common' || item.rarity === 'magic');
    if (!chosen.length) { this.message('분해할 일반·마법 장비가 없습니다.'); return; }
    save.bag = save.bag.filter(item => !chosen.includes(item));
    save.gold += chosen.reduce((sum, item) => sum + this.salvageValue(item), 0);
    save.stones += chosen.reduce((sum, item) => sum + (item.rarity === 'common' ? 1 : 2), 0);
    this.selected = undefined; this.message(`${chosen.length}개 장비를 분해했습니다.`); this.world.onChange();
  }

  private open(kind: Modal | null): void { this.openModal = kind; this.confirmReset = false; this.renderModal(); }
  private renderModal(): void {
    this.modal.hidden = this.openModal === null;
    if (!this.openModal) return;
    const dialog = this.modal.querySelector<HTMLElement>('.modal-dialog')!; dialog.replaceChildren();
    const heading = document.createElement('header');
    heading.innerHTML = `<h2>${{ status: '내 상태', equipment: '장비', skills: '스킬', account: '계정 정보' }[this.openModal]}</h2><button class="modal-close" aria-label="닫기">×</button>`;
    heading.querySelector('button')!.addEventListener('click', () => this.open(null)); dialog.appendChild(heading);
    if (this.openModal === 'equipment') this.renderEquipment(dialog);
    if (this.openModal === 'status') this.renderCharacter(dialog);
    if (this.openModal === 'skills') this.renderSkills(dialog);
    if (this.openModal === 'account') this.renderAccount(dialog);
  }

  private renderEquipment(dialog: HTMLElement): void {
    const save = this.world.save, stats = totalStats(save);
    const summary = document.createElement('div'); summary.className = 'stat-strip';
    summary.innerHTML = `<span>공격 <b>${stats.attack}</b></span><span>방어 <b>${stats.defense}</b></span><span>체력 <b>${stats.health}</b></span><span>치명 <b>${stats.crit}%</b></span>`;
    dialog.appendChild(summary);
    const grid = document.createElement('div'); grid.className = 'equipment-grid'; dialog.appendChild(grid);
    for (const slot of slots) {
      const item = save.equipment[slot]; const cell = document.createElement('button'); cell.className = `equipment-slot ${item?.rarity ?? ''}`;
      cell.innerHTML = `<span class="slot-icon">${this.icon(slot)}</span><span><small>${slotNames[slot]}</small><b></b></span>`;
      cell.querySelector('b')!.textContent = item?.name ?? '비어 있음';
      cell.onclick = () => {
        if (!item) return;
        if (save.bag.length >= 40) { this.message('가방이 가득 차 장비를 해제할 수 없습니다.'); return; }
        save.bag.push(item); delete save.equipment[slot]; this.world.onChange();
      };
      grid.appendChild(cell);
    }
    const hint = document.createElement('p'); hint.className = 'modal-hint'; hint.textContent = '장착한 장비를 터치하면 가방으로 옮깁니다.'; dialog.appendChild(hint);
  }

  private renderCharacter(dialog: HTMLElement): void {
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

  private renderAccount(dialog: HTMLElement): void {
    const save = this.world.save;
    const content = document.createElement('div'); content.className = 'account-content';
    const nameLabel = document.createElement('label'); nameLabel.textContent = '모험가 이름';
    const nameRow = document.createElement('div'); nameRow.className = 'account-name';
    const input = document.createElement('input'); input.value = save.name; input.maxLength = 16; input.setAttribute('aria-label', '모험가 이름');
    const rename = document.createElement('button'); rename.textContent = '이름 저장';
    rename.onclick = () => {
      const name = input.value.trim();
      if (!name) { this.message('이름은 비워둘 수 없습니다.'); return; }
      save.name = name; this.world.onChange(); this.message('모험가 이름을 저장했습니다.');
    };
    nameRow.append(input, rename); content.append(nameLabel, nameRow);
    const identity = document.createElement('div'); identity.className = 'account-line';
    identity.innerHTML = '<span>계정 ID</span><b></b>';
    identity.querySelector('b')!.textContent = save.accountId;
    content.appendChild(identity);
    const role = document.createElement('div'); role.className = 'account-line'; role.innerHTML = '<span>직업</span><b>전사</b>'; content.appendChild(role);
    const gender = document.createElement('div'); gender.className = 'account-gender'; gender.innerHTML = '<span>성별</span>';
    for (const choice of ['male', 'female'] as const) {
      const button = document.createElement('button'); button.textContent = choice === 'male' ? '남' : '여';
      button.classList.toggle('active', save.gender === choice);
      button.onclick = () => { save.gender = choice; this.world.onChange(); };
      gender.appendChild(button);
    }
    content.appendChild(gender);
    const level = document.createElement('div'); level.className = 'account-progress';
    level.innerHTML = `<b>LV ${save.level}</b><span>${save.exp} / ${expToNext(save.level)} EXP</span><div><i style="width:${Math.min(100, save.exp / expToNext(save.level) * 100)}%"></i></div>`;
    content.appendChild(level);
    const floor = document.createElement('div'); floor.className = 'account-line'; floor.innerHTML = `<span>최고 도달 층수</span><b>${save.floor}층</b>`; content.appendChild(floor);
    const kills = document.createElement('div'); kills.className = 'account-line'; kills.innerHTML = `<span>누적 처치 수</span><b>${save.kills}</b>`; content.appendChild(kills);
    const status = document.createElement('div'); status.className = 'account-line'; status.innerHTML = '<span>저장 상태</span><b></b>';
    status.querySelector('b')!.textContent = this.lastSaved ? '로컬 자동 저장 중' : '저장 실패'; content.appendChild(status);
    const reset = document.createElement('div'); reset.className = 'account-reset';
    if (!this.confirmReset) {
      const button = document.createElement('button'); button.textContent = '데이터 초기화';
      button.onclick = () => { this.confirmReset = true; this.renderModal(); }; reset.appendChild(button);
    } else {
      const warning = document.createElement('p'); warning.textContent = '레벨, 장비, 골드 등 모든 진행 상황을 삭제할까요? 이 작업은 되돌릴 수 없습니다.';
      const yes = document.createElement('button'); yes.textContent = '모두 삭제'; yes.onclick = () => {
        try { localStorage.removeItem('djrpg-save-v1'); window.dispatchEvent(new Event('game-reset')); location.reload(); }
        catch (error) { this.message(`데이터를 초기화하지 못했습니다: ${String(error)}`); }
      };
      const no = document.createElement('button'); no.textContent = '취소'; no.onclick = () => { this.confirmReset = false; this.renderModal(); };
      reset.append(warning, yes, no);
    }
    content.appendChild(reset); dialog.appendChild(content);
  }

  private renderSkills(dialog: HTMLElement): void {
    const list = document.createElement('div'); list.className = 'skill-list';
    for (const action of actions) {
      const card = document.createElement('article');
      card.innerHTML = `<div class="skill-icon">${action.icon}</div><div><h3>${action.name}</h3><p>${action.description}</p><small>마나 ${costs[action.key]} · 쿨타임 ${cooldowns[action.key]}초 · ${action.power}</small></div>`;
      list.appendChild(card);
    }
    dialog.appendChild(list);
  }

  private salvageValue(item: Item): number { return { common: 3, magic: 10, rare: 25, legendary: 60 }[item.rarity]; }
  private icon(slot: string): string { return ({ weapon: '⚔', offhand: '⬟', helmet: '♜', armor: '♟', necklace: '◇', gloves: '✥', belt: '═', boots: '♧', ring1: '◉', ring2: '◉' } as Record<string, string>)[slot] ?? '◆'; }
}
