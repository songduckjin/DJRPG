import {equipmentCount} from '../../game/bagCapacity';
import { autoEquipBest, equipmentImage, rarityNames, slotNames, statNames, totalStats, useSkillBook, type Item, type Rarity, type Save, type Slot, type Stat } from '../../game/store';
import { rarityOrder, rarityRanks, salvageGold } from '../../game/items';
import { canAutoEquip } from '../../game/inventory';
import { requestSalvage } from './salvageModal';
import { heroAppearance } from '../../game/appearance';
import { isSkillBook } from '../../game/items';
import { showEquippedDetail, dismissEquippedDetail, deferEquippedDismiss } from '../equippedDetail';
import { bagDetailPinned, createBagDetail, deferBagDismiss, dismissBagDetail, showBagDetail } from '../bagDetail';
import { skillbookName } from '../skillbookBag';
import type { BagFilter, Interface } from '../interface';

export function renderInventory(this: Interface, dialog: HTMLElement): void {
    const save = this.world.save;
    const section = document.createElement('section'); section.className = 'modal-bag';
    const heading = document.createElement('div'); heading.className = 'bag-heading';
    const title = document.createElement('h3'); title.textContent = '가방';
    const sort = document.createElement('button'); sort.type = 'button'; sort.className = 'bag-rarity-sort'; sort.textContent = '등급순';
    sort.classList.toggle('active', this.bagRaritySort); sort.setAttribute('aria-pressed', String(this.bagRaritySort));
    sort.onclick = () => { this.bagRaritySort = !this.bagRaritySort; dismissBagDetail(this); this.renderModal(); };
    heading.append(title, sort); section.appendChild(heading);
    const filters = document.createElement('div'); filters.className = 'bag-filters';
    const filterNames: Record<BagFilter, string> = { all: '장비 전체', weapon: '무기', armor: '방어구', accessory: '장신구' };
    for (const filter of Object.keys(filterNames) as BagFilter[]) {
      const button = document.createElement('button'); button.textContent = filterNames[filter];
      button.classList.toggle('active', this.bagFilter === filter);
      button.onclick = () => { this.bagFilter = filter; dismissBagDetail(this); this.renderModal(); };
      filters.appendChild(button);
    }
    section.appendChild(filters);
    const grid = document.createElement('div'); grid.className = 'bag-grid'; section.appendChild(grid);
    const stacks = save.bag.filter(item => !isSkillBook(item) && (this.bagFilter === 'all'
      || (this.bagFilter === 'weapon' && (item.slot === 'weapon' || item.slot === 'offhand'))
      || (this.bagFilter === 'armor' && ['helmet', 'armor', 'gloves', 'belt', 'boots'].includes(item.slot))
      || (this.bagFilter === 'accessory' && ['necklace', 'ring1', 'ring2'].includes(item.slot))))
      .sort((a, b) => this.bagRaritySort ? rarityRanks[b.rarity] - rarityRanks[a.rarity] : 0)
      .map(item => ({ item, count: 1 }));
    const visible = stacks.map(stack => stack.item);
    for (const { item, count: quantity } of stacks) {
      const book = isSkillBook(item), name = book ? skillbookName(item) : item.name;
      const cell = document.createElement('button'); cell.className = `bag-item ${book ? 'skillbook-item' : item.rarity} ${this.selected === item.id ? 'selected' : ''}`;
      cell.innerHTML = itemIcon.call(this, item.slot, item, 'item-icon');
      cell.type = 'button'; cell.dataset.itemId = item.id;
      if (book) {
        const badge = document.createElement('span'); badge.className = 'skillbook-count'; badge.textContent = `×${quantity}`;
        cell.append(badge);
      }
      const locked = !isSkillBook(item) && !!item.locked;
      cell.setAttribute('aria-label', `${name}${book ? ` · ${quantity}권` : ` · ${rarityNames[item.rarity]}`}${locked ? ' · 잠긴 장비' : ''}`);
      if (locked) {
        const badge = document.createElement('span'); badge.className = 'lock-icon is-locked bag-lock-badge';
        badge.setAttribute('aria-hidden', 'true'); cell.appendChild(badge);
      }
      cell.setAttribute('aria-expanded', String(this.selected === item.id));
      cell.onpointerenter = event => {
        if (event.pointerType !== 'touch') { dismissEquippedDetail(this); showBagDetail(this, item.id); }
      };
      cell.onpointerleave = () => { if (cell.isConnected) deferBagDismiss(this); };
      cell.onfocus = () => { dismissEquippedDetail(this); showBagDetail(this, item.id); };
      cell.onblur = () => { if (cell.isConnected) deferBagDismiss(this); };
      cell.onclick = () => {
        dismissEquippedDetail(this);
        if (this.selected === item.id && bagDetailPinned(this)) dismissBagDetail(this);
        else showBagDetail(this, item.id, true);
      };
      grid.appendChild(cell);
    }
    if (!visible.length) grid.innerHTML = '<p class="empty">이 분류에 획득한 아이템이 없습니다.</p>';
    const footer = document.createElement('div'); footer.className = 'modal-bag-footer';
    const count = document.createElement('span'); count.textContent = `장비 ${save.bag.filter(item => !isSkillBook(item)).length}개`;
    count.title = `장비 보관 ${equipmentCount(save.bag)}/40 · 스킬북 별도`;
    const capacity = document.createElement('small'); capacity.className = 'bag-capacity'; capacity.textContent = `장비 ${equipmentCount(save.bag)}/40`; count.append(capacity);
    const controls = document.createElement('div'); controls.className = 'bag-footer-actions';
    const equip = document.createElement('button'); equip.className = 'salvage'; equip.textContent = '자동 장착';
    const canEquip = canAutoEquip(save); equip.disabled = !canEquip; equip.classList.toggle('auto-equip-ready', canEquip);
    equip.title = canEquip ? '더 좋은 장비를 장착할 수 있습니다.' : '자동 장착할 장비가 없습니다.';
    equip.onclick = () => {
      const changed = autoEquipBest(save);
      this.selected = undefined; this.world.onChange();
      this.message(changed ? `${changed}부위 자동 장착 완료` : '이미 최고 장비 장착 중');
    };
    const salvageOrder = rarityOrder.filter((rarity): rarity is Exclude<Rarity, 'legendary'> => rarity !== 'legendary');
    const rarityLabels: Record<Exclude<Rarity, 'legendary'>, string> = { common: '일반만', magic: '매직 이하', rare: '레어 이하', epic: '에픽 이하', unique: '유니크 이하' };
    const rarityButton = document.createElement('button'); rarityButton.className = 'salvage-rarity'; rarityButton.type = 'button';
    rarityButton.textContent = `기준: ${rarityLabels[this.salvageRarity]}`;
    rarityButton.setAttribute('aria-label', `일괄 분해 기준 ${rarityLabels[this.salvageRarity]}. 누르면 다음 등급으로 변경`);
    rarityButton.onclick = () => {
      this.salvageRarity = salvageOrder[(salvageOrder.indexOf(this.salvageRarity) + 1) % salvageOrder.length];
      rarityButton.textContent = `기준: ${rarityLabels[this.salvageRarity]}`;
      rarityButton.setAttribute('aria-label', `일괄 분해 기준 ${rarityLabels[this.salvageRarity]}. 누르면 다음 등급으로 변경`);
    };
    const salvage = document.createElement('button'); salvage.className = 'salvage'; salvage.textContent = '일괄 분해'; salvage.onclick = () => this.salvage();
    controls.append(equip, rarityButton, salvage); footer.append(count, controls); section.appendChild(footer);
    dialog.appendChild(section);
    const selectedItem = visible.find(item => item.id === this.selected);
    if (selectedItem) {
      const detail = createBagDetail(this, selectedItem); detail.dataset.itemId = selectedItem.id;
      dialog.append(detail);
    }
  }

export function itemDetail(this: Interface, save: Save, item: Item): HTMLElement {
    const panel = document.createElement('div'); panel.className = `item-detail ${isSkillBook(item) ? 'skillbook-detail' : item.rarity}`;
    if (isSkillBook(item)) {
      const title = document.createElement('h2'); title.textContent = skillbookName(item); panel.appendChild(title);
      const note = document.createElement('p'); note.textContent = '사용하면 해당 스킬을 습득하거나 1레벨 강화합니다. 최대 Lv.30'; panel.appendChild(note);
      const use = document.createElement('button'); use.type = 'button'; use.className = 'skillbook-use'; use.textContent = '사용하기';
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
    const heading = document.createElement('div'); heading.className = 'item-detail-heading';
    const title = document.createElement('h2'); title.textContent = `${item.name} · ${slotNames[item.slot]}`;
    const lock = document.createElement('button'); lock.type = 'button'; lock.className = 'item-lock';
    lock.setAttribute('aria-pressed', String(!!item.locked)); lock.setAttribute('aria-label', item.locked ? '장비 잠금 해제' : '장비 잠금');
    lock.title = item.locked ? '잠금 중 · 누르면 해제' : '열림 · 누르면 분해 방지 잠금';
    lock.innerHTML = `<span class="lock-icon ${item.locked ? 'is-locked' : 'is-open'}" aria-hidden="true"></span>`;
    lock.onclick = () => { if (this.world.paused) return; item.locked = !item.locked; this.world.onChange(); };
    heading.append(title, lock); panel.append(heading);
    const grade = document.createElement('small'); grade.className = `item-detail-grade rarity-${item.rarity}`; grade.textContent = rarityNames[item.rarity]; panel.append(grade);
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
    const dismantle = document.createElement('button'); dismantle.textContent = item.locked ? '잠금 중' : '분해'; dismantle.disabled = !!item.locked; dismantle.onclick = () => requestSalvage.call(this, [item.id]);
    buttons.append(equip, dismantle); panel.appendChild(buttons); return panel;
  }

export function salvage(this: Interface): void {
    const save = this.world.save;
    const ids = save.bag.filter(item => !isSkillBook(item) && !item.locked && rarityRanks[item.rarity] <= rarityRanks[this.salvageRarity]).map(item => item.id);
    requestSalvage.call(this, ids);
  }

export function renderEquipment(this: Interface, dialog: HTMLElement): void {
    const save = this.world.save, stats = totalStats(save);
    const showcase = document.createElement('div'); showcase.className = 'equipment-showcase';
    const left = document.createElement('div'), right = document.createElement('div');
    left.className = 'showcase-side'; right.className = 'showcase-side';
    const addSlot = (slot: Slot, side: HTMLElement) => {
      const item = save.equipment[slot]; const cell = document.createElement('button'); cell.className = `equipment-slot ${item?.rarity ?? 'empty-slot'}`;
      cell.type = 'button'; cell.dataset.equippedSlot = slot; cell.disabled = !item;
      cell.innerHTML = `<small class="slot-part">${slotNames[slot]}</small>${itemIcon.call(this, slot, item, 'slot-icon')}<span class="slot-meta"><b></b></span>`;
      cell.querySelector('b')!.textContent = wrapEquipmentName(item?.name ?? '빈 슬롯');
      cell.setAttribute('aria-label', `${slotNames[slot]} · ${item?.name ?? '빈 슬롯'}`);
      cell.setAttribute('aria-expanded', String(this.equippedSlot === slot));
      cell.onpointerenter = event => { if (event.pointerType !== 'touch') showEquippedDetail(this, slot); };
      cell.onpointerleave = () => { if (cell.isConnected) deferEquippedDismiss(this); };
      cell.onfocus = () => showEquippedDetail(this, slot);
      cell.onblur = () => { if (cell.isConnected) deferEquippedDismiss(this); };
      cell.onclick = () => {
        if (this.equippedSlot === slot && this.equippedPinned) dismissEquippedDetail(this);
        else showEquippedDetail(this, slot, true);
      };
      side.appendChild(cell);
    };
    for (const slot of ['weapon', 'helmet', 'armor', 'gloves', 'boots'] as Slot[]) addSlot(slot, left);
    for (const slot of ['offhand', 'necklace', 'belt', 'ring1', 'ring2'] as Slot[]) addSlot(slot, right);
    const center = document.createElement('div'); center.className = 'showcase-hero';
    const portrait = document.createElement('img'); portrait.alt = '현재 전사 외형';
    const appearance = heroAppearance(save);
    const figure = document.createElement('span'); figure.className = 'showcase-figure';
    portrait.src = appearance.portrait;
    figure.appendChild(portrait);
    center.appendChild(figure);
    showcase.append(left, center, right); dialog.appendChild(showcase);
    const summary = document.createElement('div'); summary.className = 'showcase-stats';
    const power = Math.round(stats.attack * 3 + stats.defense * 2 + stats.health * .2 + stats.crit * 2 + stats.speed * 2);
    summary.innerHTML = `<span>전투력 <b>${power}</b></span><span>공격 <b>${stats.attack}</b></span><span>방어 <b>${stats.defense}</b></span><span>HP <b>${Math.ceil(this.world.player.hp)}/${stats.health}</b></span>`;
    dialog.appendChild(summary);
    const hint = document.createElement('p'); hint.className = 'modal-hint'; hint.textContent = '장비에 마우스를 올리거나 터치하면 설명을 확인합니다.'; dialog.appendChild(hint);
  }

export function salvageValue(this: Interface, item: Item): number { return salvageGold[item.rarity]; }

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

export function wrapEquipmentName(name: string): string {
  const lines: string[] = [];
  let line = '';
  for (const word of name.trim().split(/\s+/)) {
    const characters = Array.from(word);
    if (line && Array.from(line).length + 1 + characters.length <= 8) { line += ` ${word}`; continue; }
    if (line) { lines.push(line); line = ''; }
    while (characters.length > 8) lines.push(characters.splice(0, 8).join(''));
    line = characters.join('');
  }
  if (line) lines.push(line);
  return lines.join('\n');
}
