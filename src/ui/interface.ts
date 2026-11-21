import { DungeonLobby } from './dungeonLobby';
import { WorldBossPreview } from './worldBossPreview';
import { bindModalInteraction, type ModalRenderGate } from './modalInteraction';
import { Journey } from '../game/journey';
import { SkillFeedback } from './skillFeedback';
import { resetModalDefaults } from './modalDefaults';
import { readSalvageRarity, type SalvageRarity } from './salvageRarity';
import { AUTO_SALVAGE_OFF_NOTICE, AUTO_SALVAGE_ON_NOTICE, readAutoSalvage, saveAutoSalvage } from './autoSalvage';
import { isSalvagePlus, readSalvagePlus, SALVAGE_PLUS_DEFAULT, saveSalvagePlus } from './salvagePlus';
import { BAG_JOB_ONLY_KEY, MARKET_JOB_ONLY_KEY, readJobOnly } from './jobFilter';
import type { Item, Save, Slot } from '../game/store';
import { discoverEquipment } from '../game/codex';
import type { SkillId } from '../game/skills';
import { cancelSkillSelection, chooseSkill, closeSkillPicker, openSkillPicker, pressSkillSlot } from './skillLoadout';
import { LegendBoard } from '../game/legendBoard';
import { mountLegendBar, sharePouchLegend } from './legendBar';
import type { World } from '../game/world';
import type { Session } from './login';
import { renderStatus, tick, renderBagBadge } from './hud';
import { renderInventory, itemDetail, salvage, renderEquipment, salvageValue, iconPath } from './modals/equipModal';
import { renderFloor } from './modals/floorModal';
import { renderAccount } from './modals/accountModal';
import { renderSkills } from './modals/skillModal';
import type { OfflineReward } from '../game/offline';
import type { SaveSync } from '../game/sync';
import { Market } from '../game/market';
import { completeShopReturn, DIAMOND_PACK_ART, loadShop, type ShopCatalog, type ShopCheckout } from './modals/shopModal';
import { bindDomainEvents } from './domainBindings';
import type { CharacterSummary } from './modals/charactersModal';
// PR-4 분리 — 이 파일은 클래스(상태·창 열기)만 들고, 나머지는 도메인 모듈이 맡는다:
//   interfaceTypes  : 팝업 이름(Modal)·보기 상태 타입(BagFilter·SkillFilter)
//   modalRegistry   : 팝업 등록부 MODALS (예전 renderModal의 18갈래 if 대신 표 한 벌)
//   modalChrome     : 모든 팝업이 같이 쓰는 창틀(클래스·머리글·aria·스크롤)
//   interfaceControls: 메뉴 버튼·Esc·바깥 누르기·공격 패드
//   interfaceWiring : 거래소·여정·창고·월드의 화면 갱신 콜백
import type { BagFilter, Modal, SkillFilter, SkillSelection } from './interfaceTypes';
import { MODALS } from './modalRegistry';
import { renderModalPanel } from './modalChrome';
import { bindPanelInput, mountActionPad } from './interfaceControls';
import { wireDomains, wireWorld } from './interfaceWiring';
export type { BagFilter, SkillFilter } from './interfaceTypes';

const navIcons = {
  market: '<img class="nav-icon" src="/assets/icons/nav_market_v2.png" alt="" aria-hidden="true" />',
  equipment: '<img class="nav-icon" src="/assets/icons/nav_equipment_v2.png" alt="" aria-hidden="true" />',
  skills: '<img class="nav-icon" src="/assets/icons/nav_skills_v2.png" alt="" aria-hidden="true" />',
  warehouse: '<img class="nav-icon" src="/assets/icons/nav_warehouse_v1.png" alt="" aria-hidden="true" />'
};

/**
 * 지금 창을 열 수 없는가 — **결과를 확인하지 못한 요청은 자기 창만** 막는다(작업 260 · 설계서 PR-5).
 *
 * 거래소 거래가 걸려 있으면 거래소 창만 막히고(그 창의 `거래 결과 다시 확인`으로 풀어야 하므로 거래소 자체는 연다),
 * 우편·여정 대기(`pendingJourney`)는 어느 창도 막지 않는다. 예전에는 `pendingMarket` 하나가 거래소 외 모든 창을
 * 막아, 네트워크가 끊긴 동안 우편함·설정·내 정보까지 잠겼다(작업 226). 반면 보내는 중인 요청(`locked`·창고)은
 * 그 응답의 세이브·revision이 화면 기준과 엇갈리므로 창을 열지 않는다.
 */
export function modalBlocked(market: Pick<Market, 'busy' | 'sync'>, kind: Modal | null): boolean {
  const sync = market.sync;
  if (market.busy || sync.locked || sync.pendingWarehouse) return true;
  return !!sync.pendingMarket && kind !== 'market';
}

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
  /** `내 직업만 보기` (작업 205): 가방과 경매장이 각자 기억하는 보기 스위치다. 켜면 다른 직업 전용
   *  무기·스킬북만 감추고 공용 장비는 그대로 둔다. 기본값은 전체 보기. */
  bagJobOnly = readJobOnly(BAG_JOB_ONLY_KEY);
  marketJobOnly = readJobOnly(MARKET_JOB_ONLY_KEY);
  /** The user's own bulk-salvage threshold, read back from the device so closing the popup or
   *  reloading never resets it (작업 196). */
  salvageRarity: SalvageRarity = readSalvageRarity();
  /** 자동 분해 (작업 196): kept on the device with the threshold, and off until turned on. 작업 254부터
   *  접속·방치 사냥 모두에 적용된다. */
  autoSalvage = readAutoSalvage();
  /** 자동 분해가 갈 `+단계` 상한 (작업 203): 41층부터만 쓰이고, 기기에 저장된 값을 시작 시 읽는다. */
  salvagePlus = readSalvagePlus();
  salvageIds?: string[];
  skillTarget?: number;
  pendingSkill?: SkillId;
  /** 스킬 창의 `전체/액티브/패시브` 탭(작업 240) — 창을 닫으면 `modalDefaults`가 `전체`로 되돌린다. */
  skillFilter: SkillFilter = 'all';
  /** 스킬 창 B안(작업 266) — 하단 액션 바가 다루는 타일과 `정보` 펼침, 스크롤 자리. 모두 보기 상태다. */
  skillSelected?: SkillSelection;
  skillInfoOpen = false;
  skillScroll = 0;
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
  /** 보물 주머니 레전드 전광판 대기열(작업 208) — 접속 중 모두에게 같은 줄이 뜨다. */
  legend = new LegendBoard();
  toast: HTMLElement;
  toastTimer = 0;
  saveStatus = '저장됨';
  confirmReset = false;
  offlineReward?: OfflineReward;
  characterList?: { characters: CharacterSummary[]; activeSlot: number; maxSlots: number; revision: number; allIdleExpiresAt?: number; loadedAt?: number };
  characterPage = 0;
  /** 지금 눌러서 펼친 캐릭터 카드의 슬롯(작업 216) — 그 카드에만 `선택`·`방치`·`삭제`가 보인다. */
  characterFocus?: number;
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
    world.autoSalvagePlus = () => this.salvagePlus;
    this.market = new Market(sync);
    this.journey = new Journey(sync, world);
    discoverEquipment(world.save);
    root.innerHTML = `<main class="game-shell"><section class="battle"><div class="battle-canvas"></div><div class="top-hud"></div><button class="world-boss-entry" data-modal="worldBoss" type="button" aria-label="월드보스 미리보기" title="체력과 남은 도전 횟수는 시안입니다"><span class="wb-entry-art" aria-hidden="true"></span><span class="wb-entry-health" aria-hidden="true"><i></i></span><span class="wb-entry-count" aria-hidden="true">3/3</span></button><nav class="utility-nav" aria-label="편의 메뉴">${(['settings','mail','rewards','achievements','dungeon'] as const).map((kind,index)=>`<button type="button" data-modal="${kind}" aria-label="${['설정','우편함','보상','업적','던전'][index]}" title="${['설정','우편함','보상','업적','던전'][index]}"><img src="/assets/icons/utility_${kind}.png" alt="">${(kind==='settings'||kind==='dungeon')?'':`<i data-utility-dot="${kind}" hidden></i>`}</button>`).join('')}</nav><div class="tutorial"></div><div class="controls"><div class="action-pad"></div></div></section><nav class="bottom-nav" aria-label="게임 메뉴"><button data-modal="equipment" type="button" aria-label="내 정보" title="내 정보">${navIcons.equipment}<i class="new-badge" hidden></i><i class="bag-full-badge" hidden></i></button><button data-modal="skills" type="button" aria-label="스킬" title="스킬">${navIcons.skills}<i class="skill-nav-dot" hidden aria-label="장착 또는 강화 가능한 스킬 있음"></i></button><button data-modal="market" type="button" aria-label="거래소" title="거래소">${navIcons.market}<i class="market-nav-dot" hidden aria-label="거래소 수령함에 받을 물건 있음"></i></button><button data-modal="warehouse" type="button" aria-label="공용창고" title="공용창고">${navIcons.warehouse}</button></nav><div class="modal-backdrop" hidden><div class="modal-dialog" role="dialog" aria-modal="true"></div></div><div class="toast" role="status"></div></main>`;
    const shopEntry = document.createElement('button'); shopEntry.type = 'button'; shopEntry.dataset.modal = 'shop'; shopEntry.className = 'shop-entry'; shopEntry.setAttribute('aria-label', '상점'); shopEntry.title = '상점';
    // 작업 261: 글자 `◆` 대신 다이아가 가득 든 보물상자 그림(상점 대표 그림과 같은 에셋)을 버튼에 꽉 채운다.
    const shopEntryArt = document.createElement('img'); shopEntryArt.src = DIAMOND_PACK_ART; shopEntryArt.alt = ''; shopEntryArt.decoding = 'async'; shopEntry.append(shopEntryArt);
    this.root.querySelector('.utility-nav')?.append(shopEntry);
    this.top = this.get('.top-hud'); this.banner = this.get('.tutorial');
    this.modal = this.get('.modal-backdrop'); this.toast = this.get('.toast');
    mountLegendBar(this);
    // 도메인 신호 구독(작업 256) — 화면은 사건을 듣기만 한다.
    bindDomainEvents(this);
    this.modalRenderGate = bindModalInteraction(this.modal, window, () => this.renderModal());
    // 도메인 콜백·입력은 각자의 모듈이 붙인다(PR-4): 거래소·여정·창고·월드 → interfaceWiring,
    // 메뉴 버튼·Esc·바깥 누르기·공격 패드 → interfaceControls.
    wireDomains(this);
    for (const item of [...world.save.bag, ...Object.values(world.save.equipment)]) if (item) this.knownItems.add(item.id);
    bindPanelInput(this);
    mountActionPad(this, world);
    wireWorld(this, world);
    this.renderBagBadge(); this.renderStatus();
    void loadShop(this);
    void completeShopReturn(this);
  }

  get canvasHost(): HTMLElement { return this.get('.battle-canvas'); }
  get(selector: string): HTMLElement { const node = this.root.querySelector<HTMLElement>(selector); if (!node) throw new Error(`UI 구성 요소 누락: ${selector}`); return node; }
  message(text: string): void { this.toast.textContent = text.replace(/골드/g, '금화'); this.toast.classList.add('visible'); clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => this.toast.classList.remove('visible'), 3200); }
  /** 내가 주머니에서 레전드를 뽑았다 — 전광판에 올린다(게스트는 내 화면에만). */
  sharePouchLegend(itemName: string): void { void sharePouchLegend(this, itemName); }
  setSaveStatus(status: string): void { this.saveStatus = status; const label = this.modal.querySelector<HTMLElement>('[data-save-status]'); if (label) label.textContent = `서버 ${status}`; }
  showOfflineReward(reward: OfflineReward): void { this.offlineReward = reward; this.open('offline'); }

  renderStatus(): void { return renderStatus.call(this); }

  tick(): void { return tick.call(this); }

  renderBagBadge(): void { return renderBagBadge.call(this); }

  renderInventory(dialog: HTMLElement): void { return renderInventory.call(this, dialog); }

  itemDetail(save: Save, item: Item): HTMLElement { return itemDetail.call(this, save, item); }

  salvage(): void { return salvage.call(this); }

  pressSkillSlot(index: number): void { pressSkillSlot.call(this, index); }

  openSkillPicker(index: number): void { openSkillPicker.call(this, index); }

  closeSkillPicker(): void { closeSkillPicker.call(this); }

  chooseSkill(id: SkillId): void { chooseSkill.call(this, id); }

  /** Turns live auto-salvage on or off, stores the choice, and says out loud that it now applies both
   *  while hunting and while away (작업 196·254). */
  setAutoSalvage(on: boolean): void {
    this.autoSalvage = on; saveAutoSalvage(on);
    this.message(on ? AUTO_SALVAGE_ON_NOTICE : AUTO_SALVAGE_OFF_NOTICE);
  }

  /** 고른 `+N까지` 상한을 기기에 남긴다 (작업 203) — 창을 닫아도·새로고침해도 무엇이 지워질지 그대로다. */
  setSalvagePlus(value: number): void {
    this.salvagePlus = isSalvagePlus(value) ? value : SALVAGE_PLUS_DEFAULT;
    saveSalvagePlus(this.salvagePlus);
  }


  open(kind: Modal | null): void {
    if (modalBlocked(this.market, kind)) return;
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
    // 창을 여는 순간 할 일(새 장비 표시 지우기 등)은 그 창의 등록부 항목이 안다.
    if (kind) MODALS[kind].prepare?.(this);
    this.renderModal();
    if (startMarket) this.market.open();
    // 첫 그리기 뒤에 할 일도 등록부가 안다 — 캐릭터 목록·상점 목록·창고 초기화·여정 읽기(예전 open()의 꼬리).
    if (kind) MODALS[kind].load?.(this);
  }

  renderModal(): void {
    if(this.openModal!=='worldBoss')this.worldBoss?.dispose();
    if (this.openModal && this.modalRenderGate?.defer()) return;
    this.modal.hidden = this.openModal === null;
    if (!this.openModal) return;
    const dialog = this.modal.querySelector<HTMLElement>('.modal-dialog')!;
    renderModalPanel(this, dialog, MODALS[this.openModal]);
  }


  renderEquipment(dialog: HTMLElement): void { return renderEquipment.call(this, dialog); }

  renderFloor(dialog: HTMLElement): void { return renderFloor.call(this, dialog); }

  renderAccount(dialog: HTMLElement): void { return renderAccount.call(this, dialog); }

  renderSkills(dialog: HTMLElement): void { return renderSkills.call(this, dialog); }


  salvageValue(item: Item): number { return salvageValue.call(this, item); }
  iconPath(slot: Slot | 'skillbook' | 'pouch', item?: Item): string { return iconPath.call(this, slot, item); }
}

