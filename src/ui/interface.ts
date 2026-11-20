import { DungeonLobby } from './dungeonLobby';
import { renderDungeonLobby } from './modals/dungeonModal';
import {WorldBossPreview} from './worldBossPreview';
import {renderWorldBoss} from './modals/worldBossModal';
import { isSkillBook } from '../game/items';
import {bindModalInteraction, type ModalRenderGate} from './modalInteraction';
import { Journey } from '../game/journey';
import { renderSettings, renderUtility, updateUtilityBadges } from './modals/utilityModal';
import { dismissEquippedDetail, positionEquippedDetail, showEquippedDetail } from './equippedDetail';
import { SkillFeedback } from './skillFeedback';
import { bindModalClose } from './modalClose';
import { resetModalDefaults } from './modalDefaults';
import { readSalvageRarity, type SalvageRarity } from './salvageRarity';
import { AUTO_SALVAGE_OFF_NOTICE, AUTO_SALVAGE_ON_NOTICE, readAutoSalvage, saveAutoSalvage } from './autoSalvage';
import { dismissBagDetail, positionBagDetail } from './bagDetail';
import type { Item, Save, Slot } from '../game/store';
import { discoverEquipment } from '../game/codex';
import { renderCodex } from './modals/codexModal';
import type { SkillId } from '../game/skills';
import { cancelSkillSelection, chooseSkill, pressSkillSlot } from './skillLoadout';
import { renderSalvage } from './modals/salvageModal';
import type { World } from '../game/world';

import type { Session } from './login';
import { renderStatus, tick, renderBagBadge } from './hud';
import { renderInventory, itemDetail, salvage, renderEquipment, salvageValue, iconPath } from './modals/equipModal';
import { renderFloor } from './modals/floorModal';
import { renderAccount } from './modals/accountModal';
import { renderSkills } from './modals/skillModal';
import { renderOffline } from './modals/offlineModal';
import type { OfflineReward } from '../game/offline';
import type { SaveSync } from '../game/sync';
import { Market } from '../game/market';
import { renderMarket, updateMarketLive } from './modals/marketModal';
import { loadCharacters, loadWarehouse, renderCharacters, renderCreateCharacter, renderWarehouse, type CharacterSummary } from './modals/charactersModal';
import { completeShopReturn, loadShop, renderShop, type ShopCatalog, type ShopCheckout } from './modals/shopModal';

const navIcons = {
  market: '<img class="nav-icon" src="/assets/icons/nav_market_v2.png" alt="" aria-hidden="true" />',
  equipment: '<img class="nav-icon" src="/assets/icons/nav_equipment_v2.png" alt="" aria-hidden="true" />',
  skills: '<img class="nav-icon" src="/assets/icons/nav_skills_v2.png" alt="" aria-hidden="true" />'
};
type Modal = 'dungeon' | 'worldBoss' | 'equipment' | 'skills' | 'account' | 'floor' | 'offline' | 'market' | 'salvage' | 'codex' | 'characters' | 'createCharacter' | 'warehouse' | 'settings' | 'mail' | 'rewards' | 'achievements' | 'shop';
export type BagFilter = 'all' | 'weapon' | 'armor' | 'accessory';

export class Interface {
  dungeon = new DungeonLobby();
  worldBoss = new WorldBossPreview();
  worldBossField?: () => void;
  suspendMainField?: () => () => void;
  market: Market;
  journey: Journey;
  private modalRenderGate?: ModalRenderGate;
  selected?: string;
  equippedSlot?: Slot;
  equippedPinned = false;
  bagFilter: BagFilter = 'all';
  bagRaritySort = false;
  /** The user's own bulk-salvage threshold, read back from the device so closing the popup or
   *  reloading never resets it (작업 196). */
  salvageRarity: SalvageRarity = readSalvageRarity();
  /** 접속 중 자동 분해 (작업 196): kept on the device with the threshold, and off until turned on. */
  autoSalvage = readAutoSalvage();
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
  shopCatalog?: ShopCatalog;
  shopCheckout?: ShopCheckout;
  shopPay?: () => Promise<unknown>;
  shopTab: 'diamonds' | 'packages' = 'diamonds';

  constructor(public root: HTMLElement, public world: World, public onSave: () => void, public session: Session, public onReset: () => Promise<void>, sync: SaveSync) {
    // The world asks on every pickup rather than keeping a copy, so the switch and the threshold are
    // always the latest thing the player set.
    world.autoSalvage = () => this.autoSalvage ? this.salvageRarity : undefined;
    this.market = new Market(sync);
    this.journey = new Journey(sync, world);
    discoverEquipment(world.save);
    root.innerHTML = `<main class="game-shell"><section class="battle"><div class="battle-canvas"></div><div class="top-hud"></div><button class="world-boss-entry" data-modal="worldBoss" type="button" aria-label="월드보스 미리보기" title="체력과 남은 도전 횟수는 시안입니다"><span class="wb-entry-art" aria-hidden="true"></span><span class="wb-entry-health" aria-hidden="true"><i></i></span><span class="wb-entry-count" aria-hidden="true">3/3</span></button><nav class="utility-nav" aria-label="편의 메뉴">${(['settings','mail','rewards','achievements','dungeon'] as const).map((kind,index)=>`<button type="button" data-modal="${kind}" aria-label="${['설정','우편함','보상','업적','던전'][index]}" title="${['설정','우편함','보상','업적','던전'][index]}"><img src="/assets/icons/utility_${kind}.png" alt="">${(kind==='settings'||kind==='dungeon')?'':`<i data-utility-dot="${kind}" hidden></i>`}</button>`).join('')}</nav><div class="tutorial"></div><div class="controls"><div class="action-pad"></div></div></section><nav class="bottom-nav" aria-label="게임 메뉴"><button data-modal="equipment" type="button" aria-label="내 정보" title="내 정보">${navIcons.equipment}<i class="new-badge" hidden></i></button><button data-modal="skills" type="button" aria-label="스킬" title="스킬">${navIcons.skills}<i class="skill-nav-dot" hidden aria-label="장착 또는 강화 가능한 스킬 있음"></i></button><button data-modal="market" type="button" aria-label="거래소" title="거래소">${navIcons.market}<i class="new-badge market-badge" hidden></i></button></nav><div class="modal-backdrop" hidden><div class="modal-dialog" role="dialog" aria-modal="true"></div></div><div class="toast" role="status"></div></main>`;
    const shopEntry = document.createElement('button'); shopEntry.type = 'button'; shopEntry.dataset.modal = 'shop'; shopEntry.className = 'shop-entry'; shopEntry.setAttribute('aria-label', '상점'); shopEntry.title = '상점'; shopEntry.textContent = '◆';
    this.root.querySelector('.utility-nav')?.append(shopEntry);
    this.top = this.get('.top-hud'); this.banner = this.get('.tutorial');
    this.modal = this.get('.modal-backdrop'); this.toast = this.get('.toast');
    this.modalRenderGate = bindModalInteraction(this.modal, window, () => this.renderModal());
    this.market.onMessage = text => this.message(text);
    sync.onWarehouseRecovered = () => { this.renderStatus(); this.renderBagBadge(); if (this.openModal === 'warehouse') void loadWarehouse(this); this.message('공용창고 이동 결과를 확인했습니다.'); };
    this.market.onChange = full => {
      if (this.openModal === 'market' && full) this.renderModal();
      updateMarketLive(this); this.renderStatus();
    };
    this.journey.onMessage = text => this.message(text);
    this.journey.onChange = () => { this.renderStatus(); this.renderBagBadge(); updateUtilityBadges(this); if (['mail','rewards','achievements'].includes(this.openModal ?? '')) this.renderModal(); };
    void this.journey.load();
    window.setInterval(() => { if (!document.hidden) void this.journey.load(); }, 30000);
    for (const item of [...world.save.bag, ...Object.values(world.save.equipment)]) if (item) this.knownItems.add(item.id);
    this.root.querySelectorAll<HTMLButtonElement>('[data-modal]').forEach(button => button.onclick = () => { cancelSkillSelection.call(this); this.open(button.dataset.modal as Modal); });
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
    this.root.addEventListener('keydown',event=>{if(this.openModal==='worldBoss'&&event.key==='Escape'){event.preventDefault();event.stopPropagation();this.open(null);}});
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
      for (const item of world.save.bag) if (!this.knownItems.has(item.id)) { this.knownItems.add(item.id); if (this.openModal !== 'equipment' && !isSkillBook(item)) this.newItems.add(item.id); }
      this.renderBagBadge(); this.renderStatus();
      if (!(this.openModal === 'codex' && ['INPUT','SELECT'].includes(document.activeElement?.tagName ?? '')) && !['dungeon','market','worldBoss','createCharacter','settings','mail','rewards','achievements','shop'].includes(this.openModal ?? '') && (this.openModal !== 'account' || document.activeElement?.tagName !== 'INPUT')) this.renderModal();
    };
    world.onMessage = text => this.message(text);
    this.renderBagBadge(); this.renderStatus();
    void loadShop(this);
    void completeShopReturn(this);
  }

  get canvasHost(): HTMLElement { return this.get('.battle-canvas'); }
  get(selector: string): HTMLElement { const node = this.root.querySelector<HTMLElement>(selector); if (!node) throw new Error(`UI 구성 요소 누락: ${selector}`); return node; }
  message(text: string): void { this.toast.textContent = text.replace(/골드/g, '금화'); this.toast.classList.add('visible'); clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => this.toast.classList.remove('visible'), 3200); }
  setSaveStatus(status: string): void { this.saveStatus = status; const label = this.modal.querySelector<HTMLElement>('[data-save-status]'); if (label) label.textContent = `서버 ${status}`; }
  showOfflineReward(reward: OfflineReward): void { this.offlineReward = reward; this.open('offline'); }

  renderStatus(): void { return renderStatus.call(this); }

  tick(): void { return tick.call(this); }

  renderBagBadge(): void { return renderBagBadge.call(this); }

  renderInventory(dialog: HTMLElement): void { return renderInventory.call(this, dialog); }

  itemDetail(save: Save, item: Item): HTMLElement { return itemDetail.call(this, save, item); }

  salvage(): void { return salvage.call(this); }

  pressSkillSlot(index: number): void { pressSkillSlot.call(this, index); }

  chooseSkill(id: SkillId): void { chooseSkill.call(this, id); }

  /** Turns live auto-salvage on or off, stores the choice, and says out loud that it only works while
   *  the player is in the field (작업 196). */
  setAutoSalvage(on: boolean): void {
    this.autoSalvage = on; saveAutoSalvage(on);
    this.message(on ? AUTO_SALVAGE_ON_NOTICE : AUTO_SALVAGE_OFF_NOTICE);
  }

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
    if (this.openModal !== kind && this.journey) { this.journey.tab = 'daily'; }
    this.openModal = kind; this.confirmReset = false;
    if (kind === 'equipment') { this.newItems.clear(); this.renderBagBadge(); }
    this.renderModal();
    if (startMarket) this.market.open();
    if (kind === 'characters') void loadCharacters(this);
    if (kind === 'shop' && !this.shopCatalog) void loadShop(this);
    if (kind === 'warehouse') { this.warehouseItems = undefined; void loadWarehouse(this); }
    if (kind && ['mail','rewards','achievements'].includes(kind)) void this.journey.load();
  }
  renderModal(): void {
    if(this.openModal!=='worldBoss')this.worldBoss?.dispose();
    if (this.openModal && this.modalRenderGate?.defer()) return;
    this.modal.hidden = this.openModal === null;
    if (!this.openModal) return;
    const dialog = this.modal.querySelector<HTMLElement>('.modal-dialog')!;
    dialog.classList.toggle('dungeon-modal', this.openModal === 'dungeon');
    dialog.classList.toggle('world-boss-modal', this.openModal === 'worldBoss');
    dialog.classList.toggle('codex-modal', this.openModal === 'codex');
    dialog.classList.toggle('skills-modal', this.openModal === 'skills');
    dialog.classList.toggle('market-modal', this.openModal === 'market');
    dialog.classList.toggle('utility-modal', ['settings','mail','rewards','achievements'].includes(this.openModal));
    dialog.classList.toggle('settings-modal', this.openModal === 'settings');
    dialog.classList.toggle('equipment-modal', this.openModal === 'equipment');
    const scroll = dialog.scrollTop, bagScroll = dialog.querySelector<HTMLElement>('.bag-grid')?.scrollTop ?? 0;
    dialog.replaceChildren();
    const heading = document.createElement('header');
    heading.innerHTML = `<h2>${{ dungeon: '끝없는 던전', worldBoss: '월드보스', equipment: '내 정보', skills: '스킬', account: '계정 정보', floor: '층 선택', offline: '오프라인 사냥 정산', market: '거래소', salvage: '분해 확인', codex: '장비 도감', characters: '캐릭터 선택', createCharacter: '새 캐릭터', warehouse: '공용창고', settings: '설정', mail: '우편함', rewards: '보상', achievements: '업적', shop: '상점' }[this.openModal]}</h2><button class="modal-close" aria-label="닫기">×</button>`;
    bindModalClose(heading.querySelector('button')!, () => this.open(null));
    if (this.openModal === 'equipment' || this.openModal === 'codex') {
      const title = heading.querySelector('h2')!, group = document.createElement('div'); group.className = 'modal-title-group';
      title.replaceWith(group); group.append(title);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'codex-open';
      button.textContent = this.openModal === 'equipment' ? '도감' : '장비';
      button.onclick = () => this.open(this.openModal === 'equipment' ? 'codex' : 'equipment'); group.append(button);
    }
    if(this.openModal!=='worldBoss'&&this.openModal!=='dungeon')dialog.appendChild(heading);
    if(this.openModal==='dungeon')dialog.setAttribute('aria-label','끝없는 던전');else if(this.openModal==='worldBoss')dialog.setAttribute('aria-label','월드보스');else dialog.removeAttribute('aria-label');
    if (this.openModal === 'equipment') { this.renderEquipment(dialog); this.renderInventory(dialog); }
    if (this.openModal === 'dungeon') renderDungeonLobby(this,dialog);
    if (this.openModal === 'worldBoss') renderWorldBoss(this,dialog);
    if (this.openModal === 'settings') renderSettings(this, dialog);
    if (this.openModal === 'mail' || this.openModal === 'rewards' || this.openModal === 'achievements') renderUtility(this, dialog, this.openModal);
    if (this.openModal === 'codex') renderCodex.call(this, dialog);
    if (this.openModal === 'salvage') renderSalvage.call(this, dialog);
    if (this.openModal === 'market') renderMarket.call(this, dialog);
    if (this.openModal === 'characters') renderCharacters(this, dialog);
    if (this.openModal === 'shop') renderShop(this, dialog);
    if (this.openModal === 'createCharacter') renderCreateCharacter(this, dialog);
    if (this.openModal === 'warehouse') renderWarehouse(this, dialog);
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

  renderFloor(dialog: HTMLElement): void { return renderFloor.call(this, dialog); }

  renderAccount(dialog: HTMLElement): void { return renderAccount.call(this, dialog); }

  renderSkills(dialog: HTMLElement): void { return renderSkills.call(this, dialog); }


  salvageValue(item: Item): number { return salvageValue.call(this, item); }
  iconPath(slot: Slot | 'skillbook', item?: Item): string { return iconPath.call(this, slot, item); }
}
