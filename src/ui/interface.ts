import type { Item, Rarity, Save, Slot } from '../game/store';
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

const navIcons = {
  market: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h18l-2-5H5L3 9Zm1 0v11h16V9M9 20v-7h6v7M3 9c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0"/></svg>',
  status: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="6.5" r="3.5"/><path d="M4.5 20v-2.1c0-3.2 3.4-5.4 7.5-5.4s7.5 2.2 7.5 5.4V20H4.5Z"/></svg>',
  equipment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 3 4 2 4-2 4 4-2 3v10H6V10L4 7l4-4Z"/><path d="m8 3 1 6 3 2 3-2 1-6M6 10l3-1m9 1-3-1m-3 2v9"/></svg>',
  skills: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6L12 2Z"/><path d="m19 16 .6 1.8L21.5 18l-1.9.6L19 20.5l-.6-1.9L16.5 18l1.9-.2L19 16Z"/></svg>'
};
type Modal = 'status' | 'equipment' | 'skills' | 'account' | 'floor' | 'offline' | 'market';
export type BagFilter = 'all' | 'weapon' | 'armor' | 'accessory' | 'skillbook';

export class Interface {
  market: Market;
  selected?: string;
  bagFilter: BagFilter = 'all';
  salvageRarity: Exclude<Rarity, 'legendary'> = 'magic';
  openModal: Modal | null = null;
  top: HTMLElement;
  banner: HTMLElement;
  modal: HTMLElement;
  knownItems = new Set<string>();
  newItems = new Set<string>();
  attackButton!: HTMLButtonElement;
  slotButtons: HTMLButtonElement[] = [];
  toast: HTMLElement;
  toastTimer = 0;
  saveStatus = '저장됨';
  confirmReset = false;
  offlineReward?: OfflineReward;

  constructor(public root: HTMLElement, public world: World, public onSave: () => void, public session: Session, public onReset: () => Promise<void>, sync: SaveSync) {
    this.market = new Market(sync);
    root.innerHTML = `<main class="game-shell"><section class="battle"><div class="battle-canvas"></div><div class="top-hud"></div><div class="tutorial"></div><div class="controls"><div class="action-pad"></div></div></section><nav class="bottom-nav" aria-label="게임 메뉴"><button data-modal="status" type="button" aria-label="내 상태" title="내 상태">${navIcons.status}</button><button data-modal="equipment" type="button" aria-label="장비" title="장비">${navIcons.equipment}<i class="new-badge" hidden></i></button><button data-modal="skills" type="button" aria-label="스킬" title="스킬">${navIcons.skills}</button><button data-modal="market" type="button" aria-label="거래소" title="거래소">${navIcons.market}<i class="new-badge market-badge" hidden></i></button></nav><div class="modal-backdrop" hidden><div class="modal-dialog" role="dialog" aria-modal="true"></div></div><div class="toast" role="status"></div></main>`;
    this.top = this.get('.top-hud'); this.banner = this.get('.tutorial');
    this.modal = this.get('.modal-backdrop'); this.toast = this.get('.toast');
    this.market.onMessage = text => this.message(text);
    this.market.onChange = full => {
      if (this.openModal === 'market' && full) this.renderModal();
      updateMarketLive(this); this.renderStatus();
    };
    this.market.start();
    for (const item of [...world.save.bag, ...Object.values(world.save.equipment)]) if (item) this.knownItems.add(item.id);
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
    world.onChange = () => {
      this.onSave();
      for (const item of world.save.bag) if (!this.knownItems.has(item.id)) { this.knownItems.add(item.id); if (this.openModal !== 'equipment') this.newItems.add(item.id); }
      this.renderBagBadge(); this.renderStatus();
      if (this.openModal !== 'market' && (this.openModal !== 'account' || document.activeElement?.tagName !== 'INPUT')) this.renderModal();
    };
    world.onMessage = text => this.message(text);
    this.renderBagBadge(); this.renderStatus();
  }

  get canvasHost(): HTMLElement { return this.get('.battle-canvas'); }
  get(selector: string): HTMLElement { const node = this.root.querySelector<HTMLElement>(selector); if (!node) throw new Error(`UI 구성 요소 누락: ${selector}`); return node; }
  message(text: string): void { this.toast.textContent = text; this.toast.classList.add('visible'); clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => this.toast.classList.remove('visible'), 3200); }
  setSaveStatus(status: string): void { this.saveStatus = status; if (this.openModal === 'account') this.renderModal(); }
  showOfflineReward(reward: OfflineReward): void { this.offlineReward = reward; this.open('offline'); }

  renderStatus(): void { return renderStatus.call(this); }

  tick(): void { return tick.call(this); }

  renderBagBadge(): void { return renderBagBadge.call(this); }

  renderInventory(dialog: HTMLElement): void { return renderInventory.call(this, dialog); }

  itemDetail(save: Save, item: Item): HTMLElement { return itemDetail.call(this, save, item); }

  salvage(): void { return salvage.call(this); }

  open(kind: Modal | null): void {
    if (this.market.busy || this.market.sync.locked || this.market.sync.pendingMarket) return;
    if (this.openModal === 'market' && kind !== 'market') this.market.close();
    const startMarket = kind === 'market' && this.openModal !== 'market';
    if (this.openModal !== kind) this.modal.querySelector<HTMLElement>('.modal-dialog')!.scrollTop = 0;
    this.openModal = kind; this.confirmReset = false;
    if (kind === 'equipment') { this.newItems.clear(); this.renderBagBadge(); }
    this.renderModal();
    if (startMarket) this.market.open();
  }
  renderModal(): void {
    this.modal.hidden = this.openModal === null;
    if (!this.openModal) return;
    const dialog = this.modal.querySelector<HTMLElement>('.modal-dialog')!;
    dialog.classList.toggle('market-modal', this.openModal === 'market');
    dialog.classList.toggle('equipment-modal', this.openModal === 'equipment');
    const scroll = dialog.scrollTop, bagScroll = dialog.querySelector<HTMLElement>('.bag-grid')?.scrollTop ?? 0;
    dialog.replaceChildren();
    const heading = document.createElement('header');
    heading.innerHTML = `<h2>${{ status: '내 상태', equipment: '장비', skills: '스킬', account: '계정 정보', floor: '층 선택', offline: '오프라인 사냥 정산', market: '거래소' }[this.openModal]}</h2><button class="modal-close" aria-label="닫기">×</button>`;
    heading.querySelector('button')!.addEventListener('click', () => this.open(null)); dialog.appendChild(heading);
    if (this.openModal === 'equipment') { this.renderEquipment(dialog); this.renderInventory(dialog); }
    if (this.openModal === 'market') renderMarket.call(this, dialog);
    if (this.openModal === 'status') this.renderCharacter(dialog);
    if (this.openModal === 'skills') this.renderSkills(dialog);
    if (this.openModal === 'account') this.renderAccount(dialog);
    if (this.openModal === 'floor') this.renderFloor(dialog);
    if (this.openModal === 'offline' && this.offlineReward) renderOffline(dialog, this.offlineReward);
    dialog.scrollTop = scroll;
    const bagGrid = dialog.querySelector<HTMLElement>('.bag-grid');
    if (bagGrid) bagGrid.scrollTop = bagScroll;
  }

  renderEquipment(dialog: HTMLElement): void { return renderEquipment.call(this, dialog); }

  renderCharacter(dialog: HTMLElement): void { return renderCharacter.call(this, dialog); }

  renderFloor(dialog: HTMLElement): void { return renderFloor.call(this, dialog); }

  renderAccount(dialog: HTMLElement): void { return renderAccount.call(this, dialog); }

  renderSkills(dialog: HTMLElement): void { return renderSkills.call(this, dialog); }


  salvageValue(item: Item): number { return salvageValue.call(this, item); }
  iconPath(slot: Slot | 'skillbook', item?: Item): string { return iconPath.call(this, slot, item); }
}
