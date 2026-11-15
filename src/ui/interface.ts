import { autoEquipBest, expToNext, rarityNames, salvageByRarity, skillLevel, slotNames, statNames, totalStats, upgradeSkill, type Item, type Rarity, type Save, type Slot, type Stat } from '../game/store';
import { cooldowns, costs, type Action, type World } from '../game/world';
import { canLearn, MAX_SKILL_LEVEL, passiveOrder, passives, skillDuration, skillOrder, skillRange, skills, skillUpgradeCost, UNLOCK_ALL_SKILLS_FOR_TEST, type SkillId, type SkillLevelId } from '../game/skills';

const shortNames: Record<SkillId, string> = { slash2: '소드', spin: '용오름', slam: '스탬프', warcry: '레이지', power: '파워', destroy: '충격파', hell: '헬파이어' };
type Modal = 'status' | 'equipment' | 'skills' | 'account';
type BagFilter = 'all' | 'weapon' | 'armor' | 'accessory';

export class Interface {
  private selected?: string;
  private bagFilter: BagFilter = 'all';
  private salvageRarity: Exclude<Rarity, 'legendary'> = 'magic';
  private openModal: Modal | null = null;
  private top: HTMLElement;
  private banner: HTMLElement;
  private modal: HTMLElement;
  private knownItems = new Set<string>();
  private newItems = new Set<string>();
  private attackButton!: HTMLButtonElement;
  private slotButtons: HTMLButtonElement[] = [];
  private toast: HTMLElement;
  private toastTimer = 0;
  private lastSaved = true;
  private confirmReset = false;

  constructor(private root: HTMLElement, private world: World, private onSave: () => boolean) {
    root.innerHTML = `<main class="game-shell"><section class="battle"><div class="battle-canvas"></div><div class="top-hud"></div><button class="auto-toggle" type="button"></button><div class="tutorial"></div><div class="controls"><div class="stick"><div class="stick-knob"></div></div><div class="action-pad"></div></div><div class="resource hp"><span>HP</span><b></b></div><div class="resource mp"><span>MP</span><b></b></div></section><nav class="bottom-nav"><button data-modal="status">내 상태</button><button data-modal="equipment">장비<i class="new-badge" hidden></i></button><button data-modal="skills">스킬</button></nav><div class="modal-backdrop" hidden><div class="modal-dialog" role="dialog" aria-modal="true"></div></div><div class="toast" role="status"></div></main>`;
    this.top = this.get('.top-hud'); this.banner = this.get('.tutorial');
    this.modal = this.get('.modal-backdrop'); this.toast = this.get('.toast');
    try {
      const stored = localStorage.getItem('djrpg-salvage-rarity');
      if (stored === 'common' || stored === 'magic' || stored === 'rare') this.salvageRarity = stored;
    } catch (error) { this.message(`분해 기준을 불러오지 못했습니다: ${String(error)}`); }
    for (const item of [...world.save.bag, ...Object.values(world.save.equipment)]) if (item) this.knownItems.add(item.id);
    this.get('.auto-toggle').addEventListener('click', () => { world.save.auto = !world.save.auto; this.message(`AUTO ${world.save.auto ? 'ON' : 'OFF'}`); world.onChange(); });
    this.root.querySelectorAll<HTMLButtonElement>('[data-modal]').forEach(button => button.onclick = () => this.open(button.dataset.modal as Modal));
    this.modal.addEventListener('click', event => { if (event.target === this.modal) this.open(null); });
    window.addEventListener('keydown', event => { if (event.key === 'Escape') this.open(null); });
    const pad = this.get('.action-pad');
    for (let index = 0; index < 4; index++) {
      const button = document.createElement('button'); button.className = `action ${index === 0 ? 'action-attack' : `action-slot${index}`}`; button.type = 'button';
      button.innerHTML = '<strong></strong><small></small><em></em>';
      pad.appendChild(button);
      if (index === 0) {
        this.attackButton = button;
        button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); world.attackHeld = true; world.action('attack'); });
        button.addEventListener('pointerup', () => world.attackHeld = false);
        button.addEventListener('pointercancel', () => world.attackHeld = false);
        button.addEventListener('lostpointercapture', () => world.attackHeld = false);
      } else {
        this.slotButtons.push(button);
        button.addEventListener('pointerdown', e => { e.preventDefault(); world.action(world.save.quickSlots[index - 1]); });
      }
    }
    this.setupStick();
    world.onChange = () => {
      this.lastSaved = this.onSave();
      for (const item of world.save.bag) if (!this.knownItems.has(item.id)) { this.knownItems.add(item.id); if (this.openModal !== 'equipment') this.newItems.add(item.id); }
      this.renderBagBadge(); this.renderStatus();
      if (this.openModal !== 'account' || document.activeElement?.tagName !== 'INPUT') this.renderModal();
    };
    world.onMessage = text => this.message(text);
    this.renderBagBadge(); this.renderStatus();
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
    this.top.innerHTML = `<button class="level-badge" type="button" aria-label="계정 정보 열기"><span>LV</span><b>${save.level}</b></button><div class="status-main"><span>층 <b>${save.floor}</b></span><span class="gold">◆ ${save.gold}</span></div><div class="exp"><i style="width:${progress}%"></i></div>`;
    const levelBadge = this.get('.level-badge'); levelBadge.style.setProperty('--progress', `${progress}%`); levelBadge.addEventListener('click', () => this.open('account'));
    const toggle = this.get('.auto-toggle'); toggle.textContent = `AUTO ${save.auto ? 'ON' : 'OFF'}`; toggle.classList.toggle('on', save.auto);
    this.get('.hp').style.setProperty('--fill', `${Math.max(0, player.hp / totalStats(save).health * 100)}%`);
    this.get('.mp').style.setProperty('--fill', `${player.mp}%`);
    this.get('.hp b').textContent = `${Math.ceil(player.hp)}`; this.get('.mp b').textContent = `${Math.ceil(player.mp)}`;
    const text = [save.auto ? '자동사냥 중입니다. 직접 이동하면 AUTO가 꺼집니다.' : '조이스틱으로 이동해 첫 해골전사를 처치하세요.', '빛기둥으로 이동해 낡은 두손검을 줍세요.', '하단 장비 버튼을 눌러 가방의 낡은 두손검을 장착하세요.'][save.tutorial];
    this.banner.textContent = text ?? ''; this.banner.hidden = save.tutorial >= 3;
  }

  tick(): void {
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

  private renderBagBadge(): void {
    const badge = this.get('.new-badge'); badge.textContent = `${this.newItems.size}`; badge.hidden = this.newItems.size === 0;
  }

  private renderInventory(dialog: HTMLElement): void {
    const save = this.world.save;
    const section = document.createElement('section'); section.className = 'modal-bag';
    section.innerHTML = '<h3>가방</h3>';
    const filters = document.createElement('div'); filters.className = 'bag-filters';
    const filterNames: Record<BagFilter, string> = { all: '전체', weapon: '무기', armor: '방어구', accessory: '장신구' };
    for (const filter of Object.keys(filterNames) as BagFilter[]) {
      const button = document.createElement('button'); button.textContent = filterNames[filter];
      button.classList.toggle('active', this.bagFilter === filter);
      button.onclick = () => { this.bagFilter = filter; this.selected = undefined; this.renderModal(); };
      filters.appendChild(button);
    }
    section.appendChild(filters);
    const grid = document.createElement('div'); grid.className = 'bag-grid'; section.appendChild(grid);
    const visible = save.bag.filter(item => this.bagFilter === 'all'
      || (this.bagFilter === 'weapon' && (item.slot === 'weapon' || item.slot === 'offhand'))
      || (this.bagFilter === 'armor' && ['helmet', 'armor', 'gloves', 'belt', 'boots'].includes(item.slot))
      || (this.bagFilter === 'accessory' && ['necklace', 'ring1', 'ring2'].includes(item.slot)));
    for (const item of visible) {
      const cell = document.createElement('button'); cell.className = `bag-item ${item.rarity} ${this.selected === item.id ? 'selected' : ''}`;
      cell.innerHTML = `<img class="item-icon" src="${this.iconPath(item.slot)}" alt=""><small>${rarityNames[item.rarity]}</small><b></b>`;
      cell.querySelector('b')!.textContent = item.name;
      cell.onclick = () => { this.selected = item.id; this.renderModal(); };
      grid.appendChild(cell);
      if (item.id === this.selected) grid.appendChild(this.itemDetail(save, item));
    }
    if (!visible.length) grid.innerHTML = '<p class="empty">이 분류에 획득한 장비가 없습니다.</p>';
    const footer = document.createElement('div'); footer.className = 'modal-bag-footer';
    const count = document.createElement('span'); count.textContent = `보유 ${save.bag.length}/40`;
    const controls = document.createElement('div'); controls.className = 'bag-footer-actions';
    const equip = document.createElement('button'); equip.className = 'salvage'; equip.textContent = '자동 장착';
    equip.onclick = () => {
      const changed = autoEquipBest(save);
      this.selected = undefined; this.world.onChange();
      this.message(changed ? `${changed}부위 자동 장착 완료` : '이미 최고 장비 장착 중');
    };
    const rarityOrder = ['common', 'magic', 'rare'] as const;
    const rarityLabels: Record<Exclude<Rarity, 'legendary'>, string> = { common: '일반만', magic: '마법 이하', rare: '희귀 이하' };
    const rarityButton = document.createElement('button'); rarityButton.className = 'salvage-rarity'; rarityButton.type = 'button';
    rarityButton.textContent = `기준: ${rarityLabels[this.salvageRarity]}`;
    rarityButton.setAttribute('aria-label', `일괄 분해 기준 ${rarityLabels[this.salvageRarity]}. 누르면 다음 등급으로 변경`);
    rarityButton.onclick = () => {
      this.salvageRarity = rarityOrder[(rarityOrder.indexOf(this.salvageRarity) + 1) % rarityOrder.length];
      rarityButton.textContent = `기준: ${rarityLabels[this.salvageRarity]}`;
      rarityButton.setAttribute('aria-label', `일괄 분해 기준 ${rarityLabels[this.salvageRarity]}. 누르면 다음 등급으로 변경`);
      try { localStorage.setItem('djrpg-salvage-rarity', this.salvageRarity); }
      catch (error) { this.message(`분해 기준을 저장하지 못했습니다: ${String(error)}`); }
    };
    const salvage = document.createElement('button'); salvage.className = 'salvage'; salvage.textContent = '일괄 분해'; salvage.onclick = () => this.salvage();
    controls.append(equip, rarityButton, salvage); footer.append(count, controls); section.appendChild(footer);
    dialog.appendChild(section);
  }

  private itemDetail(save: Save, item: Item): HTMLElement {
    const panel = document.createElement('div'); panel.className = `item-detail ${item.rarity}`;
    const equipped = save.equipment[item.slot];
    const title = document.createElement('h2'); title.textContent = `${item.name} · ${slotNames[item.slot]}`; panel.appendChild(title);
    const compared = new Set<Stat>([...Object.keys(item.stats), ...Object.keys(equipped?.stats ?? {})] as Stat[]);
    for (const stat of compared) {
      const diff = (item.stats[stat] ?? 0) - (equipped?.stats[stat] ?? 0);
      const line = document.createElement('span'); line.className = diff >= 0 ? 'up' : 'down';
      line.textContent = `${statNames[stat]} +${item.stats[stat] ?? 0} (현재 +${equipped?.stats[stat] ?? 0}) ${diff >= 0 ? '▲' : '▼'}${Math.abs(diff)}`; panel.appendChild(line);
    }
    const buttons = document.createElement('div'); buttons.className = 'detail-actions';
    const equip = document.createElement('button'); equip.textContent = '장착'; equip.onclick = () => {
      const index = save.bag.findIndex(i => i.id === item.id); if (index < 0) return;
      save.bag.splice(index, 1); if (equipped) save.bag.push(equipped); save.equipment[item.slot] = item;
      if (item.name === '낡은 두손검' && save.tutorial === 2) { save.tutorial = 3; this.message('튜토리얼 완료! 두손검을 장착했습니다.'); }
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
    const result = salvageByRarity(save, this.salvageRarity);
    if (!result.count) { this.message('선택한 등급 이하의 분해할 장비가 없습니다.'); return; }
    this.selected = undefined; this.world.onChange();
    this.message(`${result.count}개 분해 완료 (+${result.gold}골드 / +${result.stones}강화석)`);
  }

  private open(kind: Modal | null): void {
    if (this.openModal !== kind) this.modal.querySelector<HTMLElement>('.modal-dialog')!.scrollTop = 0;
    this.openModal = kind; this.confirmReset = false;
    if (kind === 'equipment') { this.newItems.clear(); this.renderBagBadge(); }
    this.renderModal();
  }
  private renderModal(): void {
    this.modal.hidden = this.openModal === null;
    if (!this.openModal) return;
    const dialog = this.modal.querySelector<HTMLElement>('.modal-dialog')!;
    dialog.classList.toggle('equipment-modal', this.openModal === 'equipment');
    const scroll = dialog.scrollTop, bagScroll = dialog.querySelector<HTMLElement>('.bag-grid')?.scrollTop ?? 0;
    dialog.replaceChildren();
    const heading = document.createElement('header');
    heading.innerHTML = `<h2>${{ status: '내 상태', equipment: '장비', skills: '스킬', account: '계정 정보' }[this.openModal]}</h2><button class="modal-close" aria-label="닫기">×</button>`;
    heading.querySelector('button')!.addEventListener('click', () => this.open(null)); dialog.appendChild(heading);
    if (this.openModal === 'equipment') { this.renderEquipment(dialog); this.renderInventory(dialog); }
    if (this.openModal === 'status') this.renderCharacter(dialog);
    if (this.openModal === 'skills') this.renderSkills(dialog);
    if (this.openModal === 'account') this.renderAccount(dialog);
    dialog.scrollTop = scroll;
    const bagGrid = dialog.querySelector<HTMLElement>('.bag-grid');
    if (bagGrid) bagGrid.scrollTop = bagScroll;
  }

  private renderEquipment(dialog: HTMLElement): void {
    const save = this.world.save, stats = totalStats(save);
    const showcase = document.createElement('div'); showcase.className = 'equipment-showcase';
    const left = document.createElement('div'), right = document.createElement('div');
    left.className = 'showcase-side'; right.className = 'showcase-side';
    const addSlot = (slot: Slot, side: HTMLElement) => {
      const item = save.equipment[slot]; const cell = document.createElement('button'); cell.className = `equipment-slot ${item?.rarity ?? 'empty-slot'}`;
      cell.innerHTML = `<img class="slot-icon" src="${this.iconPath(slot)}" alt=""><span class="slot-meta"><small>${slotNames[slot]}</small><b></b><em></em></span>`;
      cell.querySelector('b')!.textContent = item?.name ?? '빈 슬롯';
      const core = item && (Object.keys(item.stats) as Stat[])[0];
      cell.querySelector('em')!.textContent = core ? `${statNames[core]} +${item.stats[core]}` : '';
      cell.onclick = () => {
        if (!item) return;
        if (save.bag.length >= 40) { this.message('가방이 가득 차 장비를 해제할 수 없습니다.'); return; }
        save.bag.push(item); delete save.equipment[slot]; this.world.onChange();
      };
      side.appendChild(cell);
    };
    for (const slot of ['weapon', 'helmet', 'armor', 'gloves', 'boots'] as Slot[]) addSlot(slot, left);
    for (const slot of ['offhand', 'necklace', 'belt', 'ring1', 'ring2'] as Slot[]) addSlot(slot, right);
    const center = document.createElement('div'); center.className = 'showcase-hero';
    const portrait = document.createElement('img'); portrait.alt = '현재 전사 외형';
    portrait.src = save.equipment.armor ? save.equipment.helmet ? '/assets/warrior_armored.png' : '/assets/warrior_armored_nohelm.png' : save.equipment.weapon ? `/assets/warrior_${save.gender}_sword.png` : `/assets/warrior_${save.gender}_base.png`;
    center.appendChild(portrait);
    showcase.append(left, center, right); dialog.appendChild(showcase);
    const summary = document.createElement('div'); summary.className = 'showcase-stats';
    const power = Math.round(stats.attack * 3 + stats.defense * 2 + stats.health * .2 + stats.crit * 2 + stats.speed * 2);
    summary.innerHTML = `<span>전투력 <b>${power}</b></span><span>공격 <b>${stats.attack}</b></span><span>방어 <b>${stats.defense}</b></span><span>HP <b>${Math.ceil(this.world.player.hp)}/${stats.health}</b></span><span>MP <b>${Math.ceil(this.world.player.mp)}/100</b></span>`;
    dialog.appendChild(summary);
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
    const save = this.world.save;
    const note = document.createElement('p'); note.className = 'skill-note';
    note.textContent = UNLOCK_ALL_SKILLS_FOR_TEST ? '테스트 모드: 레벨 제한 없이 모든 스킬을 습득할 수 있습니다. 요구 레벨은 정식 해금 기준입니다.' : '레벨을 올려 스킬을 해금하세요.';
    list.appendChild(note);
    const base = document.createElement('article'); base.className = 'skill-card';
    base.innerHTML = '<div class="skill-icon">⚔</div><div class="skill-info"><h3>대검 베기 <small>Lv.1 · 기본 보유</small></h3><p>묵직한 두손검 횡베기로 전방 넓은 부채꼴을 공격합니다.</p><small>마나 0 · 기본 쿨타임 0.48초 · 공격력 × 1.0 · 고정 슬롯</small></div>';
    list.appendChild(base);
    for (const id of skillOrder) {
      const skill = skills[id], learned = save.learned.includes(id), level = skillLevel(save, id);
      const growth = id === 'warcry' ? `공격 버프 +${50 + (level - 1) * 5}%` : `위력 +${(level - 1) * 10}%`;
      const card = document.createElement('article'); card.className = 'skill-card'; card.dataset.skill = id;
      card.innerHTML = `<div class="skill-icon">${skill.icon}</div><div class="skill-info"><h3>${skill.name} <small>요구 Lv.${skill.level}</small></h3><p>${skill.description}</p><strong class="skill-level">${learned ? `스킬 Lv.${level} / ${MAX_SKILL_LEVEL}` : '미습득 · 습득 시 스킬 Lv.1'}</strong><small>마나 ${skill.cost} · 쿨타임 ${skill.cooldown}초 · 지속 ${skillDuration(id, level).toFixed(1)}초 · 범위 ${skillRange(id, level)} · ${growth}</small><div class="skill-actions"></div></div>`;
      const actions = card.querySelector<HTMLElement>('.skill-actions')!;
      if (!learned) {
        const button = document.createElement('button'); button.textContent = canLearn(save.level, skill.level) ? '습득' : `Lv.${skill.level} 필요`;
        button.disabled = !canLearn(save.level, skill.level);
        button.onclick = () => { save.learned.push(id); save.skillLevels[id] = 1; this.world.onChange(); this.message(`${skill.name} 습득!`); };
        actions.appendChild(button);
      } else {
        const state = document.createElement('span'); state.textContent = '습득 완료'; actions.appendChild(state);
        this.addSkillUpgrade(actions, id, skill.name);
        for (let slot = 0; slot < 3; slot++) {
          const button = document.createElement('button'); button.textContent = `슬롯 ${slot + 1}`;
          button.classList.toggle('active', save.quickSlots[slot] === id);
          button.onclick = () => {
            const other = save.quickSlots.indexOf(id);
            if (other !== slot && other >= 0) save.quickSlots[other] = save.quickSlots[slot];
            save.quickSlots[slot] = id; this.world.onChange();
          };
          actions.appendChild(button);
        }
      }
      list.appendChild(card);
    }
    const heading = document.createElement('h3'); heading.className = 'skill-group-title'; heading.textContent = '패시브 스킬'; list.appendChild(heading);
    for (const id of passiveOrder) {
      const passive = passives[id], learned = save.passives.includes(id), level = skillLevel(save, id);
      const card = document.createElement('article'); card.className = 'skill-card';
      const bonus = id === 'mastery' ? `공격 +${15 + (level - 1) * 2}%` : id === 'body' ? `HP·방어 +${15 + (level - 1) * 2}%` : `치명 +${8 + (level - 1) * 2}% · 공속 +${12 + (level - 1) * 2}%`;
      card.innerHTML = `<div class="skill-icon">${passive.icon}</div><div class="skill-info"><h3>${passive.name} <small>요구 Lv.${passive.level}</small></h3><p>${passive.description}</p><strong class="skill-level">${learned ? `스킬 Lv.${level} / ${MAX_SKILL_LEVEL}` : '미습득 · 습득 시 스킬 Lv.1'}</strong><small>${bonus}</small><div class="skill-actions"></div></div>`;
      const action = card.querySelector<HTMLElement>('.skill-actions')!;
      if (learned) { const state = document.createElement('span'); state.textContent = '습득 완료 · 상시 적용'; action.appendChild(state); this.addSkillUpgrade(action, id, passive.name); }
      else {
        const button = document.createElement('button'); button.textContent = canLearn(save.level, passive.level) ? '습득' : `Lv.${passive.level} 필요`;
        button.disabled = !canLearn(save.level, passive.level);
        button.onclick = () => {
          const before = totalStats(save).health;
          save.passives.push(id);
          save.skillLevels[id] = 1;
          const gained = totalStats(save).health - before;
          this.world.player.hp += gained; save.health = this.world.player.hp;
          this.world.onChange(); this.message(`${passive.name} 습득!`);
        };
        action.appendChild(button);
      }
      list.appendChild(card);
    }
    dialog.appendChild(list);
  }

  private addSkillUpgrade(actions: HTMLElement, id: SkillLevelId, name: string): void {
    const level = skillLevel(this.world.save, id);
    const button = document.createElement('button');
    button.textContent = level >= MAX_SKILL_LEVEL ? '최대 레벨' : `레벨업 (${skillUpgradeCost(level)}골드)`;
    button.disabled = level >= MAX_SKILL_LEVEL;
    button.onclick = () => {
      const before = totalStats(this.world.save).health;
      const result = upgradeSkill(this.world.save, id);
      if (!result.ok) { this.message(result.message); return; }
      const gained = totalStats(this.world.save).health - before;
      this.world.player.hp += gained;
      this.world.save.health = this.world.player.hp;
      this.world.onChange();
      this.message(`${name} ${result.message}`);
    };
    actions.appendChild(button);
  }

  private salvageValue(item: Item): number { return { common: 3, magic: 10, rare: 25, legendary: 60 }[item.rarity]; }
  private iconPath(slot: Slot): string { return `/assets/icons/${slot === 'ring1' || slot === 'ring2' ? 'ring' : slot}.png`; }
}
