import type { Item } from './items';
import type { SyncResult, SaveSync } from './sync';
export type MarketView = 'active' | 'sold' | 'mine' | 'register' | 'inbox';
export type Listing = { id: string; sellerName: string; item: Item; price: number; state: string; createdAt: number; expiresAt: number; soldAt: number | null; mine: boolean; purchased: boolean };
export type Delivery = { id: string; item: Item | null; gold: number; reason: string; createdAt: number };
export type MarketData = { watched: { id: string; state: string }[]; listings: Listing[]; inbox: Delivery[]; seq: number; total: number; page: number; myActive: number; revision: number; rules: { fee: number; maxListings: number; durationHours: number; maxPrice: number; pageSize: number } };
export class Market {
  view: MarketView = 'active';
  filters: Record<string, string | number> = { query: '', category: '', slot: '', rarity: '', sort: 'newest', page: 0 };
  data?: MarketData;
  candidate?: MarketData;
  selected?: Listing;
  selectedItem = '';
  mineActiveOnly = false;
  quote?: { itemId:string; loading:boolean; error?:string; lastPrice?:number; soldAt?:number; average?:number; count?:number };
  private quoteGeneration = 0;
  registerCategory = '';
  registerRarity = '';
  unlockItem?: string;
  price = '';
  busy = false;
  loading = false;
  error = '';
  connected = false;
  newCount = 0;
  opened = false;
  private generation = 0;
  private notified = new Set<string>();
  private initialized = false;
  private requests = new Map<string, string>();
  onChange: (full: boolean) => void = () => {};
  onMessage: (message: string) => void = () => {};
  constructor(public sync: SaveSync) {}
  resetView(): void {
    this.generation++; this.loading = false;
    this.view = 'active'; this.filters = { query: '', category: '', slot: '', rarity: '', sort: 'newest', page: 0 };
    this.selected = undefined; this.selectedItem = ''; this.price = ''; this.error = '';
    this.mineActiveOnly = false; this.quote = undefined; this.quoteGeneration++;
    this.registerCategory = ''; this.registerRarity = ''; this.unlockItem = undefined;
    this.data = undefined; this.candidate = undefined; this.newCount = 0;
  }
  open(): void {
    this.opened = true; this.error = ''; void this.load(true);
  }
  close(): void { this.opened = false; }
  async selectItem(item:Item):Promise<void> {
    this.selectedItem=item.id;this.unlockItem=undefined;
    const generation=++this.quoteGeneration;
    this.quote={itemId:item.id,loading:true};this.onChange(true);
    try{
      const response=await fetch('/api/market',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.sync.session.token}`},body:JSON.stringify({action:'recent-price',name:item.name,slot:item.slot,rarity:item.rarity})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'최근 거래가를 불러오지 못했습니다.');
      if(generation===this.quoteGeneration)this.quote={itemId:item.id,loading:false,...result};
    }catch(error){if(generation===this.quoteGeneration)this.quote={itemId:item.id,loading:false,error:error instanceof Error?error.message:String(error)};}
    finally{if(generation===this.quoteGeneration)this.onChange(true);}
  }
  async load(full: boolean): Promise<void> {
    if (this.busy) return;
    const generation = ++this.generation;
    this.loading = true;
    if (full) this.onChange(false);
    try {
      const response = await fetch('/api/market', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.sync.session.token}` }, body: JSON.stringify({ action: 'list', ...this.filters, mineActiveOnly:this.view==='mine'&&this.mineActiveOnly, watchIds: this.data?.listings.map(entry => entry.id), view: !this.opened ? 'mine' : this.view }) });
      const result = await response.json();
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
    } catch (error) { if (generation === this.generation) { this.error = error instanceof Error ? error.message : String(error); this.connected = false; this.onChange(full); } }
    finally { if (generation === this.generation) { this.loading = false; this.onChange(false); } }
  }
  refresh(): void { this.selected = undefined; void this.load(true); }
  switch(view: MarketView): void { if (this.busy) return; this.view = view; this.unlockItem = undefined; this.filters.page = 0; this.selected = undefined; this.onChange(true); void this.load(true); }
  private applyEffect(result: SyncResult): void {
    if (!this.data || !result.effect) return;
    const { listing, deliveries, claimedId, claimedIds } = result.effect;
    if (listing) {
      const sale = this.data.listings.find(entry => entry.id === listing.id);
      if (sale) { sale.state = listing.state; sale.soldAt = listing.soldAt ?? sale.soldAt; }
      if (listing.state === 'cancelled') this.data.myActive = Math.max(0, this.data.myActive - 1);
      else if (listing.state === 'active') this.data.myActive++;
    }
    const removed = new Set(claimedIds ?? (claimedId ? [claimedId] : []));
    if (removed.size) { this.data.inbox = this.data.inbox.filter(entry => !removed.has(entry.id)); removed.forEach(id=>this.notified.delete(id)); }
    for (const delivery of deliveries) if (!this.data.inbox.some(entry => entry.id === delivery.id)) { this.data.inbox.unshift(delivery); this.notified.add(delivery.id); }
    this.data.revision = result.revision;
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
    this.generation++; this.loading = false; this.busy = true; this.error = ''; this.onChange(true);
    try {
      const result = await this.sync.mutate(action, data, requestId);
      this.requests.delete(key); this.applyEffect(result); this.onMessage(result.message || '처리했습니다.');
      this.selected = undefined; if (action === 'register') { this.unlockItem = undefined; this.selectedItem = ''; this.price = ''; this.view = 'mine'; }
      this.busy = false; this.onChange(true);
      if (action === 'register' || !result.effect) void this.load(true);
    } catch (error) { this.error = error instanceof Error ? error.message : String(error); }
    finally { this.busy = false; this.onChange(true); }
  }
}
