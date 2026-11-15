import { autoEquipBest, isZweihander, rarityNames, salvageByRarity, slotNames, statNames, totalStats, type Item, type Rarity, type Save, type Slot, type Stat } from '../../game/store';
import type { BagFilter, Interface } from '../interface';

export function renderInventory(this: Interface, dialog: HTMLElement): void {
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
      cell.innerHTML = `<img class="item-icon" src="${this.iconPath(item.slot, item)}" alt=""><small>${rarityNames[item.rarity]}</small><b></b>`;
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
    };
    const salvage = document.createElement('button'); salvage.className = 'salvage'; salvage.textContent = '일괄 분해'; salvage.onclick = () => this.salvage();
    controls.append(equip, rarityButton, salvage); footer.append(count, controls); section.appendChild(footer);
    dialog.appendChild(section);
  }

export function itemDetail(this: Interface, save: Save, item: Item): HTMLElement {
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

export function salvage(this: Interface): void {
    const save = this.world.save;
    const result = salvageByRarity(save, this.salvageRarity);
    if (!result.count) { this.message('선택한 등급 이하의 분해할 장비가 없습니다.'); return; }
    this.selected = undefined; this.world.onChange();
    this.message(`${result.count}개 분해 완료 (+${result.gold}골드 / +${result.stones}강화석)`);
  }

export function renderEquipment(this: Interface, dialog: HTMLElement): void {
    const save = this.world.save, stats = totalStats(save);
    const showcase = document.createElement('div'); showcase.className = 'equipment-showcase';
    const left = document.createElement('div'), right = document.createElement('div');
    left.className = 'showcase-side'; right.className = 'showcase-side';
    const addSlot = (slot: Slot, side: HTMLElement) => {
      const item = save.equipment[slot]; const cell = document.createElement('button'); cell.className = `equipment-slot ${item?.rarity ?? 'empty-slot'}`;
      cell.innerHTML = `<img class="slot-icon" src="${this.iconPath(slot, item)}" alt=""><span class="slot-meta"><small>${slotNames[slot]}</small><b></b><em></em></span>`;
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

export function salvageValue(this: Interface, item: Item): number { return { common: 3, magic: 10, rare: 25, legendary: 60 }[item.rarity]; }

export function iconPath(this: Interface, slot: Slot, item?: Item): string { return item && isZweihander(item) ? '/assets/icons/icon_zweihander.png' : `/assets/icons/${slot === 'ring1' || slot === 'ring2' ? 'ring' : slot}.png`; }
