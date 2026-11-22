import type { Item } from './items';
import type { SyncResult, SaveSync } from './sync';
import { apiHeaders, isOutdatedResponse, reloadForNewVersion } from './appVersion';
// 작업 247: `거래 완료`(`sold`) 탭은 없앴다 — 판매 완료 목록은 `최근 거래` 탭이 최근 순서로 보여 준다.
// 서버 계약(`view:'sold'`)은 `최근 거래` 요청에 그대로 쓴다(`load`).
export type MarketView = 'active' | 'recent' | 'mine' | 'register' | 'inbox';
/**
 * 판매 중 목록의 서브 필터(작업 257 → 파트 B) — `전체`·`장비`·`영구 스탯북`.
 *
 * 서버 `filters` 계약(`category`는 한 값만 받는다)을 건드리지 않고, 이미 받은 한 페이지의 매물을
 * 화면에서 거른다(`내 직업만 보기`와 같은 방식). 장비는 `weapon`·`armor`·`accessory` 셋을 모두 뜻한다.
 */
export type MarketKind = 'all' | 'equipment' | 'statbook';
export const MARKET_KIND_LABELS: Record<MarketKind,string> = { all: '전체', equipment: '장비', statbook: '영구 스탯북' };
/** 화면 탭으로 열 수 있는 뷰 — 옛 상태(예: `sold`)가 남아 있으면 `active`로 안전 폴백한다. */
export const MARKET_VIEWS: MarketView[] = ['active', 'recent', 'mine', 'register', 'inbox'];
/**
 * 매물 한 건. `price`는 **개당 가격**(서버 `unitPrice`와 같은 값, 기존 계약 호환), `quantity`는 남은 수량
 * (판매 완료 행은 팔린 수량)이다 — 묶음 매물은 `개당 N 골드 (총 N개)`로 보여 준다(작업 249).
 */
export type Listing = { id: string; sellerName: string; item: Item; price: number; quantity: number; unitPrice?: number; totalPrice?: number; state: string; createdAt: number; expiresAt: number; soldAt: number | null; mine: boolean; purchased: boolean };
export type Delivery = { id: string; item: Item | null; gold: number; reason: string; createdAt: number };
export type MarketData = { watched: { id: string; state: string }[]; listings: Listing[]; inbox: Delivery[]; seq: number; total: number; page: number; myActive: number; revision: number; rules: { fee: number; maxListings: number; durationHours: number; maxPrice: number; minPrice: number; pageSize: number; maxInbox?: number; maxBundle?: number } };
export class Market {
  view: MarketView = 'active';
  filters: Record<string, string | number> = { query: '', category: '', slot: '', rarity: '', sort: 'newest', page: 0 };
  data?: MarketData;
  candidate?: MarketData;
  selected?: Listing;
  selectedItem = '';
  /** 판매 중 서브 필터(작업 257) — 기기·서버에 저장하지 않는 이번 화면의 선택. */
  kind: MarketKind = 'all';
  mineActiveOnly = false;
  quote?: { itemId:string; loading:boolean; error?:string; lastPrice?:number; soldAt?:number; average?:number; count?:number };
  private quoteGeneration = 0;
  registerCategory = '';
  registerRarity = '';
  unlockItem?: string;
  price = '';
  /** 판매 등록 수량(묶음, 작업 249) — 문자열로 들고 있다가 등록 요청에서 숫자로 바꾼다. */
  quantity = '1';
  /** 구매할 수량(부분 구매, 작업 249) — 상세를 펼친 매물마다 따로 기억한다. */
  buyQuantity = new Map<string, number>();
  busy = false;
  loading = false;
  error = '';
  connected = false;
  newCount = 0;
  opened = false;
  /** 수령함 건수와 그것을 확인한 시각(작업 247) — 거래소 아이콘 빨간 점이 여정 폴링 값과 비교해 고른다. */
  inboxCount?: number;
  inboxAt = 0;
  private generation = 0;
  private listRequest?: AbortController;
  private notified = new Set<string>();
  private initialized = false;
  private requests = new Map<string, string>();
  onChange: (full: boolean) => void = () => {};
  onMessage: (message: string) => void = () => {};
  constructor(public sync: SaveSync) {}
  resetView(): void {
    this.listRequest?.abort(); this.generation++; this.loading = false;
    this.view = 'active'; this.filters = { query: '', category: '', slot: '', rarity: '', sort: 'newest', page: 0 };
    this.selected = undefined; this.selectedItem = ''; this.price = ''; this.quantity = '1'; this.buyQuantity = new Map(); this.error = '';
    this.mineActiveOnly = false; this.kind = 'all'; this.quote = undefined; this.quoteGeneration++;
    this.unlockItem = undefined;
    this.registerCategory = ''; this.registerRarity = ''; this.unlockItem = undefined;
    this.data = undefined; this.candidate = undefined; this.newCount = 0;
  }
  /**
   * 캐릭터를 바꿨을 때 **이전 캐릭터의 화면 선택**만 버린다(작업 239).
   *
   * 거래소 데이터(`data`)는 계정 공용(판매 중 매물·내 거래·수령함·판매 한도)이라 그대로 두고, 새 캐릭터에는
   * 의미가 없는 것만 지운다 — 등록 탭에서 고른 아이템·입력한 가격·최근 거래가, 펼친 상세, 오류 문구다.
   * 그대로 두면 새 캐릭터의 가방에 없는 아이템의 가격표·시세가 남아 등록 버튼이 헷갈린다.
   */
  resetForCharacterSwitch(): void {
    this.listRequest?.abort(); this.generation++; this.loading = false;
    this.selected = undefined; this.selectedItem = ''; this.price = ''; this.quantity = '1'; this.buyQuantity = new Map(); this.unlockItem = undefined;
    this.quote = undefined; this.quoteGeneration++;
    this.candidate = undefined; this.newCount = 0; this.error = '';
  }
  open(): void {
    this.opened = true; this.error = ''; void this.load(true);
  }
  close(): void { this.opened = false; }
  async selectItem(item:Item):Promise<void> {
    if (this.selectedItem !== item.id) this.quantity = '1';
    this.selectedItem=item.id;this.unlockItem=undefined;
    const generation=++this.quoteGeneration;
    this.quote={itemId:item.id,loading:true};this.onChange(true);
    try{
      const response=await fetch('/api/market',{method:'POST',headers:apiHeaders({Authorization:`Bearer ${this.sync.session.token}`}),body:JSON.stringify({action:'recent-price',name:item.name,slot:item.slot,rarity:item.rarity})});
      const result=await response.json();
      if (isOutdatedResponse(response.status,result.code,result.expected)) { reloadForNewVersion(); return; }
      if(!response.ok)throw new Error(result.error||'최근 거래가를 불러오지 못했습니다.');
      if(generation===this.quoteGeneration)this.quote={itemId:item.id,loading:false,...result};
    }catch(error){if(generation===this.quoteGeneration)this.quote={itemId:item.id,loading:false,error:error instanceof Error?error.message:String(error)};}
    finally{if(generation===this.quoteGeneration)this.onChange(true);}
  }
  async load(full: boolean): Promise<void> {
    if (this.busy) return;
    const generation = ++this.generation;
    this.listRequest?.abort();
    const controller = new AbortController(); this.listRequest = controller;
    this.loading = true;
    if (full) this.onChange(false);
    try {
      const response = await fetch('/api/market', { method: 'POST', headers: apiHeaders({ Authorization: `Bearer ${this.sync.session.token}` }), body: JSON.stringify({ action: 'list', ...this.filters, mineActiveOnly:this.view==='mine'&&this.mineActiveOnly, watchIds: this.data?.listings.map(entry => entry.id), view: !this.opened ? 'mine' : this.view === 'recent' ? 'sold' : this.view }), signal: controller.signal });
      const result = await response.json();
      if (isOutdatedResponse(response.status, result.code, result.expected)) { reloadForNewVersion(); return; }
      if (!response.ok) throw new Error(result.error || '거래소를 불러오지 못했습니다.');
      if (generation !== this.generation) return;
      const next = result as MarketData;
      const fresh = next.inbox.filter(entry => !this.notified.has(entry.id));
      if (this.initialized && fresh.length) this.onMessage(`거래소 수령함에 ${fresh.length}건이 도착했습니다. 판매대금과 아이템을 확인하세요.`);
      this.notified = new Set(next.inbox.map(entry => entry.id)); this.initialized = true;
      const previousSeq = this.data?.seq;
      const inboxChanged = this.data?.inbox.map(entry => entry.id).join(',') !== next.inbox.map(entry => entry.id).join(',');
      if (full || !this.data || !this.opened || ['mine','inbox'].includes(this.view)) { this.data = next; this.candidate = undefined; this.newCount = 0; }
      else {
        const oldIds = new Set(this.data.listings.map(entry => entry.id));
        this.newCount = next.listings.filter(entry => !oldIds.has(entry.id)).length;
        for (const watched of next.watched) { const old = this.data.listings.find(entry => entry.id === watched.id); if (old) old.state = watched.state; }
        this.data.inbox = next.inbox; this.data.myActive = next.myActive; this.data.seq = next.seq;
        this.candidate = next;
      }
      this.error = ''; this.onChange(full || (this.opened && ['mine','inbox'].includes(this.view) && (inboxChanged || previousSeq !== next.seq)));
      // 메인 화면 거래소 빨간 점(작업 247)이 쓰는 수령함 건수·갱신 시각.
      this.inboxCount = next.inbox.length; this.inboxAt = Date.now();
    } catch (error) { if (generation === this.generation) { this.error = error instanceof Error ? error.message : String(error); this.connected = false; this.onChange(full); } }
    finally { if (generation === this.generation) { this.loading = false; this.onChange(false); } }
  }
  refresh(): void { this.selected = undefined; void this.load(true); }
  /**
   * 화면 선택을 모두 버린다(작업 257, 사용자 피드백 `#9089`).
   *
   * 탭·보기 방식·종류 필터를 바꿀 때 이전 화면의 **선택된 매물·상세 바·판매 등록 하이라이트·
   * 구매 수량·시세 상자**가 남아 있으면 지금 보이는 목록과 어긋난다(예: `전체`에서 연 상세가
   * `장비`로 바꿔도 남아 있거나, 다른 탭에서 고른 물품이 포커스된 채 돌아온다).
   * 서버 데이터(`data`)와 필터 값은 건드리지 않는다.
   */
  clearSelection(): void {
    this.selected = undefined;
    this.selectedItem = ''; this.unlockItem = undefined; this.price = ''; this.quantity = '1';
    this.buyQuantity.clear(); this.quote = undefined; this.quoteGeneration++;
  }
  switch(view: MarketView): void {
    if (this.busy) return;
    this.view = MARKET_VIEWS.includes(view) ? view : 'active'; this.filters.page = 0;
    if (view === 'recent') { this.filters.stat = ''; this.filters.sort = 'newest'; }
    this.clearSelection();
    this.onChange(true); void this.load(true);
  }
  private applyEffect(result: SyncResult): void {
    if (!this.data || !result.effect) return;
    const { listing, deliveries, claimedId, claimedIds } = result.effect;
    if (listing) {
      const sale = this.data.listings.find(entry => entry.id === listing.id);
      if (sale) {
        sale.state = listing.state; sale.soldAt = listing.soldAt ?? sale.soldAt;
        // 부분 구매 뒤에는 남은 수량이 바뀐다(작업 249) — 목록·상세의 `총 N개`와 구매 가능 수량을 즉시 맞춘다.
        if (typeof listing.quantity === 'number') { sale.quantity = listing.quantity; sale.totalPrice = sale.price * listing.quantity; }
      }
      if (listing.state === 'cancelled') this.data.myActive = Math.max(0, this.data.myActive - 1);
      // 새로 등록한 매물만 판매 중 수를 올린다. 부분 구매(작업 249)도 상태가 `active`로 오지만 그것은
      // **남의 매물**이므로 세지 않는다 — 서버는 등록에만 `mine: true`를 싣고, 옛 응답에는 이 값이 없어
      // 목록에 없던 매물(=새 등록)로 대신 판별한다.
      else if (listing.state === 'active' && (listing.mine === true || (listing.mine === undefined && !sale))) this.data.myActive++;
    }
    const removed = new Set(claimedIds ?? (claimedId ? [claimedId] : []));
    if (removed.size) { this.data.inbox = this.data.inbox.filter(entry => !removed.has(entry.id)); removed.forEach(id=>this.notified.delete(id)); }
    for (const delivery of deliveries) if (!this.data.inbox.some(entry => entry.id === delivery.id)) { this.data.inbox.unshift(delivery); this.notified.add(delivery.id); }
    this.data.revision = result.revision;
    this.inboxCount = this.data.inbox.length; this.inboxAt = Date.now();
  }
  async retry(): Promise<void> {
    const pending = this.sync.pendingMarket;
    if (pending) await this.act(pending.action, pending.data);
  }
  async act(action: string, data: Record<string, unknown>): Promise<void> {
    if (this.busy || this.sync.conflicted) return;
    const key = JSON.stringify({ action, data });
    let requestId = this.requests.get(key);
    if (!requestId) { requestId = crypto.randomUUID(); this.requests.set(key, requestId); }
    this.listRequest?.abort(); this.generation++; this.loading = false; this.busy = true; this.error = ''; this.onChange(true);
    try {
      const result = await this.sync.mutate(action, data, requestId);
      this.requests.delete(key); this.applyEffect(result); this.onMessage(result.message || '처리했습니다.');
      this.selected = undefined; if (action === 'register') { this.unlockItem = undefined; this.selectedItem = ''; this.price = ''; this.quantity = '1'; }
      this.busy = false; this.onChange(true);
      if (!result.effect) void this.load(true);
    } catch (error) { this.error = error instanceof Error ? error.message : String(error); }
    finally { this.busy = false; this.onChange(true); }
  }
}
