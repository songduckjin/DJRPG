import { autoEquipBest, equipmentImage, rarityNames, salvageByRarity, slotNames, statNames, totalStats, useSkillBook, type Item, type Rarity, type Save, type Slot, type Stat } from '../../game/store';
import { heroAppearance, unequipItem } from '../../game/appearance';
import { isSkillBook } from '../../game/items';
import type { BagFilter, Interface } from '../interface';

export function renderInventory(this: Interface, dialog: HTMLElement): void {
    const save = this.world.save;
    const section = document.createElement('section'); section.className = 'modal-bag';
    section.innerHTML = '<h3>가방</h3>';
    const filters = document.createElement('div'); filters.className = 'bag-filters';
    const filterNames: Record<BagFilter, string> = { all: '전체', weapon: '무기', armor: '방어구', accessory: '장신구', skillbook: '스킬북' };
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
      || (this.bagFilter === 'accessory' && ['necklace', 'ring1', 'ring2'].includes(item.slot))
      || (this.bagFilter === 'skillbook' && isSkillBook(item)));
    for (const item of visible) {
      const cell = document.createElement('button'); cell.className = `bag-item ${item.rarity} ${this.selected === item.id ? 'selected' : ''}`;
      cell.innerHTML = `${itemIcon.call(this, item.slot, item, 'item-icon')}<small>${rarityNames[item.rarity]}</small><b></b>`;
      cell.querySelector('b')!.textContent = item.name;
      cell.onclick = () => { this.selected = item.id; this.renderModal(); };
      grid.appendChild(cell);
      if (item.id === this.selected) grid.appendChild(this.itemDetail(save, item));
    }
    if (!visible.length) grid.innerHTML = '<p class="empty">이 분류에 획득한 아이템이 없습니다.</p>';
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
    if (isSkillBook(item)) {
      const title = document.createElement('h2'); title.textContent = item.name; panel.appendChild(title);
      const note = document.createElement('p'); note.textContent = '사용하면 해당 스킬을 습득하거나 1레벨 강화합니다. 최대 Lv.10'; panel.appendChild(note);
      const use = document.createElement('button'); use.textContent = '사용하기';
      use.onclick = () => {
        const before = totalStats(save).health;
        const result = useSkillBook(save, item.id);
        if (!result.ok) { this.message(result.message); return; }
        this.world.player.hp += totalStats(save).health - before;
        save.health = this.world.player.hp;
        this.selected = undefined; this.world.onChange(); this.message(result.message);
      };
      panel.appendChild(use); return panel;
    }
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
      cell.innerHTML = `${itemIcon.call(this, slot, item, 'slot-icon')}<span class="slot-meta"><small>${slotNames[slot]}</small><b></b><em></em></span>`;
      cell.querySelector('b')!.textContent = item?.name ?? '빈 슬롯';
      const core = item && (Object.keys(item.stats) as Stat[])[0];
      cell.querySelector('em')!.textContent = core ? `${statNames[core]} +${item.stats[core]}` : '';
      cell.onclick = () => {
        const result = unequipItem(save, slot);
        if (result.ok) this.world.onChange();
        this.message(result.message);
      };
      side.appendChild(cell);
    };
    for (const slot of ['weapon', 'helmet', 'armor', 'gloves', 'boots'] as Slot[]) addSlot(slot, left);
    for (const slot of ['offhand', 'necklace', 'belt', 'ring1', 'ring2'] as Slot[]) addSlot(slot, right);
    const center = document.createElement('div'); center.className = 'showcase-hero';
    const portrait = document.createElement('img'); portrait.alt = '현재 전사 외형';
    const appearance = heroAppearance(save);
    portrait.src = appearance.portrait;
    center.appendChild(portrait);
    if (appearance.helmet) {
      const helmet = document.createElement('span'); helmet.className = 'portrait-helmet';
      helmet.innerHTML = itemIcon.call(this, 'helmet', appearance.helmet, 'portrait-helmet-art');
      helmet.setAttribute('aria-label', `착용 투구: ${appearance.helmet.name}`);
      center.appendChild(helmet);
    }
    showcase.append(left, center, right); dialog.appendChild(showcase);
    const summary = document.createElement('div'); summary.className = 'showcase-stats';
    const power = Math.round(stats.attack * 3 + stats.defense * 2 + stats.health * .2 + stats.crit * 2 + stats.speed * 2);
    summary.innerHTML = `<span>전투력 <b>${power}</b></span><span>공격 <b>${stats.attack}</b></span><span>방어 <b>${stats.defense}</b></span><span>HP <b>${Math.ceil(this.world.player.hp)}/${stats.health}</b></span>`;
    dialog.appendChild(summary);
    const hint = document.createElement('p'); hint.className = 'modal-hint'; hint.textContent = '장착한 장비를 터치하면 가방으로 옮깁니다.'; dialog.appendChild(hint);
  }

export function salvageValue(this: Interface, item: Item): number { return { common: 3, magic: 10, rare: 25, legendary: 60 }[item.rarity]; }

function itemIcon(this: Interface, slot: Slot | 'skillbook', item: Item | undefined, className: string): string {
  if (item && !isSkillBook(item)) {
    const art = equipmentImage(item);
    if (art.columns === 5) return `<span class="${className} atlas-icon" style="background-image:url('${art.path}');background-position:${art.frame * 25}% center" aria-hidden="true"></span>`;
  }
  return `<img class="${className}" src="${this.iconPath(slot, item)}" alt="">`;
}

export function iconPath(this: Interface, slot: Slot | 'skillbook', item?: Item): string {
  if (slot === 'skillbook') return '/assets/icons/icon_skillbook.png';
  const iconSlot = slot === 'ring1' || slot === 'ring2' ? 'ring' : slot;
  if (item && !isSkillBook(item)) return equipmentImage(item).path;
  return `/assets/icons/${iconSlot}.png`;
}
