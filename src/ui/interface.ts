import { dismissEquippedDetail, positionEquippedDetail, showEquippedDetail } from './equippedDetail';
import { SkillFeedback } from './skillFeedback';
import { bindModalClose } from './modalClose';
import { resetModalDefaults } from './modalDefaults';
import { dismissBagDetail, positionBagDetail } from './bagDetail';
import type { Item, Rarity, Save, Slot } from '../game/store';
import { discoverEquipment } from '../game/codex';
import { renderCodex } from './modals/codexModal';
import type { SkillId } from '../game/skills';
import { cancelSkillSelection, chooseSkill, pressSkillSlot } from './skillLoadout';
import { renderSalvage } from './modals/salvageModal';
import type { World } from '../game/world';

import type { Session } from './login';
import { renderStatus, tick, renderBagBadge } from './hud';
import { renderInventory, itemDetail, salvage, renderEquipment, salvageValue, iconPath } from './modals/equipModal';
import { renderCharacter } from './modals/statusModal';
import { renderFloor } from './modals/floorModal';
import { renderAccount } from './modals/accountModal';
import { renderSkills } from './modals/skillModal';
import { renderOffline } from './modals/offlineModal';
import type { OfflineReward } from '../game/offline';
import type { SaveSync } from '../game/sync';
import { Market } from '../game/market';
import { renderMarket, updateMarketLive } from './modals/marketModal';
import { loadCharacters, loadWarehouse, renderCharacters, renderCreateCharacter, renderWarehouse, type CharacterSummary } from './modals/charactersModal';

const navIcons = {
  market: '<img class="nav-icon" src="/assets/icons/nav_market_v2.png" alt="" aria-hidden="true" />',
  status: '<img class="nav-icon" src="/assets/icons/nav_status_v2.png" alt="" aria-hidden="true" />',
  equipment: '<img class="nav-icon" src="/assets/icons/nav_equipment_v2.png" alt="" aria-hidden="true" />',
  skills: '<img class="nav-icon" src="/assets/icons/nav_skills_v2.png" alt="" aria-hidden="true" />'
};
type Modal = 'status' | 'equipment' | 'skills' | 'account' | 'floor' | 'offline' | 'market' | 'salvage' | 'codex' | 'characters' | 'createCharacter' | 'warehouse';
export type BagFilter = 'all' | 'weapon' | 'armor' | 'accessory';

export class Interface {
  market: Market;
  selected?: string;
  equippedSlot?: Slot;
  equippedPinned = false;
  bagFilter: BagFilter = 'all';
  salvageRarity: Exclude<Rarity, 'legendary'> = 'common';
  salvageIds?: string[];
  skillTarget?: number;
  pendingSkill?: SkillId;
  codexQuery = '';
  codexSlot = '';
  codexState = 'all';
  codexRarity = '';
  codexSelected?: string;
  openModal: Modal | null = null;
  top: HTMLElement;
  banner: HTMLElement;
  modal: HTMLElement;
  knownItems = new Set<string>();
  newItems = new Set<string>();
  attackButton!: HTMLButtonElement;
  slotButtons: HTMLButtonElement[] = [];
  skillFeedback = new SkillFeedback();
  toast: HTMLElement;
  toastTimer = 0;
  saveStatus = '저장됨';
  confirmReset = false;
  offlineReward?: OfflineReward;
  characterList?: { characters: CharacterSummary[]; activeSlot: number; maxSlots: number; revision: number };
  characterPage = 0;
  characterCreateSlot = 2;
  warehouseItems?: Item[];

  constructor(public root: HTMLElement, public world: World, public onSave: () => void, public session: Session, public onReset: () => Promise<void>, sync: SaveSync) {
    this.market = new Market(sync);
    discoverEquipment(world.save);
    root.innerHTML = `<main class="game-shell"><section class="battle"><div class="battle-canvas"></div><div class="top-hud"></div><div class="tutorial"></div><div class="controls"><div class="action-pad"></div></div></section><button class="character-open" type="button" aria-label="캐릭터 선택" title="캐릭터 선택">⚔</button><nav class="bottom-nav" aria-label="게임 메뉴"><button data-modal="status" type="button" aria-label="내 상태" title="내 상태">${navIcons.status}</button><button data-modal="equipment" type="button" aria-label="장비" title="장비">${navIcons.equipment}<i class="new-badge" hidden></i></button><button data-modal="skills" type="button" aria-label="스킬" title="스킬">${navIcons.skills}<i class="skill-nav-dot" hidden aria-label="장착 또는 강화 가능한 스킬 있음"></i></button><button data-modal="market" type="button" aria-label="거래소" title="거래소">${navIcons.market}<i class="new-badge market-badge" hidden></i></button></nav><div class="modal-backdrop" hidden><div class="modal-dialog" role="dialog" aria-modal="true"></div></div><div class="toast" role="status"></div></main>`;
    this.top = this.get('.top-hud'); this.banner = this.get('.tutorial');
    this.modal = this.get('.modal-backdrop'); this.toast = this.get('.toast');
    this.market.onMessage = text => this.message(text);
    sync.onWarehouseRecovered = () => { this.renderStatus(); this.renderBagBadge(); if (this.openModal === 'warehouse') void loadWarehouse(this); this.message('공용창고 이동 결과를 확인했습니다.'); };
    this.market.onChange = full => {
      if (this.openModal === 'market' && full) this.renderModal();
      updateMarketLive(this); this.renderStatus();
    };
    this.market.start();
    for (const item of [...world.save.bag, ...Object.values(world.save.equipment)]) if (item) this.knownItems.add(item.id);
    this.root.querySelectorAll<HTMLButtonElement>('[data-modal]').forEach(button => button.onclick = () => { cancelSkillSelection.call(this); this.open(button.dataset.modal as Modal); });
    this.get('.character-open').onclick = () => this.open('characters');
    this.root.addEventListener('pointerdown', event => {
      const target = event.target as HTMLElement;
      if (this.equippedSlot && !target.closest('.equipped-detail, .equipment-slot')) dismissEquippedDetail(this);
      if (this.selected && !target.closest('.bag-detail-overlay, .bag-item')) dismissBagDetail(this);
    }, true);
    window.addEventListener('resize', () => { positionBagDetail(this); positionEquippedDetail(this); });
    this.modal.addEventListener('scroll', event => {
      if (event.target !== this.modal.querySelector('.equipped-detail')) positionEquippedDetail(this);
      if (event.target !== this.modal.querySelector('.bag-detail-overlay')) positionBagDetail(this);
    }, true);
    this.modal.addEventListener('click', event => { if (event.target === this.modal) this.open(null); });
    window.addEventListener('keydown', event => { if (event.key === 'Escape') { cancelSkillSelection.call(this); this.open(null); } });
    const pad = this.get('.action-pad');
    for (let index = 0; index < 4; index++) {
      const button = document.createElement('button'); button.className = `action ${index === 0 ? 'action-attack' : `action-slot${index}`}`; button.type = 'button';
      button.innerHTML = '<span class="skill-art" aria-hidden="true"></span><strong></strong><small></small><em></em><i class="skill-alert-dot" hidden></i>';
      pad.appendChild(button);
      if (index === 0) {
        this.attackButton = button;
        button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); world.attackHeld = true; world.action('attack'); });
        button.addEventListener('pointerup', () => world.attackHeld = false);
        button.addEventListener('pointercancel', () => world.attackHeld = false);
        button.addEventListener('lostpointercapture', () => world.attackHeld = false);
      } else {
        this.slotButtons.push(button);
        button.addEventListener('click', () => pressSkillSlot.call(this, index - 1));
      }
    }
    world.onChange = () => {
      discoverEquipment(world.save); this.onSave();
      for (const item of world.save.bag) if (!this.knownItems.has(item.id)) { this.knownItems.add(item.id); if (this.openModal !== 'equipment') this.newItems.add(item.id); }
      this.renderBagBadge(); this.renderStatus();
      if (!(this.openModal === 'codex' && ['INPUT','SELECT'].includes(document.activeElement?.tagName ?? '')) && this.openModal !== 'market' && this.openModal !== 'createCharacter' && (this.openModal !== 'account' || document.activeElement?.tagName !== 'INPUT')) this.renderModal();
    };
    world.onMessage = text => this.message(text);
    this.renderBagBadge(); this.renderStatus();
  }

  get canvasHost(): HTMLElement { return this.get('.battle-canvas'); }
  get(selector: string): HTMLElement { const node = this.root.querySelector<HTMLElement>(selector); if (!node) throw new Error(`UI 구성 요소 누락: ${selector}`); return node; }
  message(text: string): void { this.toast.textContent = text.replace(/골드/g, '금화'); this.toast.classList.add('visible'); clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => this.toast.classList.remove('visible'), 3200); }
  setSaveStatus(status: string): void { this.saveStatus = status; if (this.openModal === 'account') this.renderModal(); }
  showOfflineReward(reward: OfflineReward): void { this.offlineReward = reward; this.open('offline'); }

  renderStatus(): void { return renderStatus.call(this); }

  tick(): void { return tick.call(this); }

  renderBagBadge(): void { return renderBagBadge.call(this); }

  renderInventory(dialog: HTMLElement): void { return renderInventory.call(this, dialog); }

  itemDetail(save: Save, item: Item): HTMLElement { return itemDetail.call(this, save, item); }

  salvage(): void { return salvage.call(this); }

  pressSkillSlot(index: number): void { pressSkillSlot.call(this, index); }

  chooseSkill(id: SkillId): void { chooseSkill.call(this, id); }

  open(kind: Modal | null): void {
    if (this.market.busy || this.market.sync.locked || this.market.sync.pendingMarket || this.market.sync.pendingWarehouse) return;
    if (kind !== null && this.pendingSkill) cancelSkillSelection.call(this);
    if (kind !== 'skills') this.skillTarget = undefined;
    if (kind !== 'salvage') this.salvageIds = undefined;
    if (this.openModal === 'market' && kind !== 'market') this.market.close();
    const startMarket = kind === 'market' && this.openModal !== 'market';
    if (this.openModal !== kind) {
      resetModalDefaults(this);
      if (startMarket) this.market.resetView();
      const dialog = this.modal.querySelector<HTMLElement>('.modal-dialog')!;
      dialog.scrollTop = 0;
      // A previous bag's scroll must not be restored when constructing a new popup.
      const bag = dialog.querySelector<HTMLElement>('.bag-grid'); if (bag) bag.scrollTop = 0;
    }
    this.openModal = kind; this.confirmReset = false;
    if (kind === 'equipment') { this.newItems.clear(); this.renderBagBadge(); }
    this.renderModal();
    if (startMarket) this.market.open();
    if (kind === 'characters') void loadCharacters(this);
    if (kind === 'warehouse') { this.warehouseItems = undefined; void loadWarehouse(this); }
  }
  renderModal(): void {
    this.modal.hidden = this.openModal === null;
    if (!this.openModal) return;
    const dialog = this.modal.querySelector<HTMLElement>('.modal-dialog')!;
    dialog.classList.toggle('codex-modal', this.openModal === 'codex');
    dialog.classList.toggle('skills-modal', this.openModal === 'skills');
    dialog.classList.toggle('market-modal', this.openModal === 'market');
    dialog.classList.toggle('equipment-modal', this.openModal === 'equipment');
    const scroll = dialog.scrollTop, bagScroll = dialog.querySelector<HTMLElement>('.bag-grid')?.scrollTop ?? 0;
    dialog.replaceChildren();
    const heading = document.createElement('header');
    heading.innerHTML = `<h2>${{ status: '내 상태', equipment: '장비', skills: '스킬', account: '계정 정보', floor: '층 선택', offline: '오프라인 사냥 정산', market: '거래소', salvage: '분해 확인', codex: '장비 도감', characters: '캐릭터 선택', createCharacter: '새 캐릭터', warehouse: '공용창고' }[this.openModal]}</h2><button class="modal-close" aria-label="닫기">×</button>`;
    bindModalClose(heading.querySelector('button')!, () => this.open(null));
    if (this.openModal === 'equipment' || this.openModal === 'codex') {
      const title = heading.querySelector('h2')!, group = document.createElement('div'); group.className = 'modal-title-group';
      title.replaceWith(group); group.append(title);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'codex-open';
      button.textContent = this.openModal === 'equipment' ? '도감' : '장비';
      button.onclick = () => this.open(this.openModal === 'equipment' ? 'codex' : 'equipment'); group.append(button);
    }
    dialog.appendChild(heading);
    if (this.openModal === 'equipment') { this.renderEquipment(dialog); this.renderInventory(dialog); }
    if (this.openModal === 'codex') renderCodex.call(this, dialog);
    if (this.openModal === 'salvage') renderSalvage.call(this, dialog);
    if (this.openModal === 'market') renderMarket.call(this, dialog);
    if (this.openModal === 'characters') renderCharacters(this, dialog);
    if (this.openModal === 'createCharacter') renderCreateCharacter(this, dialog);
    if (this.openModal === 'warehouse') renderWarehouse(this, dialog);
    if (this.openModal === 'status') this.renderCharacter(dialog);
    if (this.openModal === 'skills') this.renderSkills(dialog);
    if (this.openModal === 'account') this.renderAccount(dialog);
    if (this.openModal === 'floor') this.renderFloor(dialog);
    if (this.openModal === 'offline' && this.offlineReward) renderOffline(dialog, this.offlineReward);
    dialog.scrollTop = scroll;
    const bagGrid = dialog.querySelector<HTMLElement>('.bag-grid');
    if (bagGrid) bagGrid.scrollTop = bagScroll;
    positionBagDetail(this);
    if (this.openModal === 'equipment' && this.equippedSlot) showEquippedDetail(this, this.equippedSlot, this.equippedPinned);
  }

  renderEquipment(dialog: HTMLElement): void { return renderEquipment.call(this, dialog); }

  renderCharacter(dialog: HTMLElement): void { return renderCharacter.call(this, dialog); }

  renderFloor(dialog: HTMLElement): void { return renderFloor.call(this, dialog); }

  renderAccount(dialog: HTMLElement): void { return renderAccount.call(this, dialog); }

  renderSkills(dialog: HTMLElement): void { return renderSkills.call(this, dialog); }


  salvageValue(item: Item): number { return salvageValue.call(this, item); }
  iconPath(slot: Slot | 'skillbook', item?: Item): string { return iconPath.call(this, slot, item); }
}
