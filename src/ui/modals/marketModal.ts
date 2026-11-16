import { equipmentImage, isSkillBook, rarityNames, slotNames, statNames, type Item, type Stat } from '../../game/items';
import { type MarketView, type Listing, type Market } from '../../game/market';
import { compareEquipment } from '../../game/itemComparison';
import type { Interface } from '../interface';

const money = (n: number) => n.toLocaleString('ko-KR');
const when = (n: number) => new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(n);
const stateNames: Record<string,string> = { active: '판매 중', sold: '판매 완료', cancelled: '취소', expired: '기간 만료', unavailable: '판매 종료 · 새로고침' };
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; }
function button(label: string, run: () => void, disabled = false): HTMLButtonElement { const node = el('button', '', label); node.type = 'button'; node.disabled = disabled; node.onclick = run; return node; }
function icon(item: Item): HTMLElement {
  const node = el('span', 'market-icon');
  const art = isSkillBook(item) ? { path: '/assets/icons/icon_skillbook.png', columns: 1, frame: 0 } : equipmentImage(item);
  node.style.backgroundImage = `url("${art.path}")`; node.style.backgroundSize = `${art.columns * 100}% 100%`; node.style.backgroundPosition = `${art.columns > 1 ? art.frame / (art.columns - 1) * 100 : 0}% center`;
  return node;
}
function itemInfo(item: Item): HTMLElement {
  const info = el('div', 'market-item-info');
  info.append(el('b', `rarity-${item.rarity}`, item.name), el('small', '', `${rarityNames[item.rarity]} · ${isSkillBook(item) ? '스킬북' : slotNames[item.slot]}`));
  const stats = Object.entries(item.stats).map(([key, amount]) => `${statNames[key as Stat]} +${amount}`).join(' · ');
  info.append(el('small', 'market-options', stats || '사용 시 습득 또는 스킬 +1레벨'));
  return info;
}
function select(label: string, values: [string,string][], market: Market, key: string): HTMLElement {
  const field = el('label', 'market-field', label), node = el('select');
  node.setAttribute('aria-label', label);
  for (const [value, text] of values) { const option = el('option', '', text); option.value = value; node.append(option); }
  node.value = String(market.filters[key] ?? '');
  node.onchange = () => { market.filters[key] = node.value; };
  field.append(node); return field;
}
function numberField(label: string, market: Market, key: string): HTMLElement {
  const field = el('label', 'market-field', label), node = el('input'); node.type = 'number'; node.min = '0'; node.max = '1000000000'; node.step = '1'; node.inputMode = 'numeric'; node.placeholder = '제한 없음'; node.value = String(market.filters[key] ?? '');
  node.oninput = () => { market.filters[key] = node.value === '' ? '' : Number(node.value); }; field.append(node); return field;
}
export function updateMarketLive(ui: Interface): void {
  const market = ui.market, data = market.data;
  const status = ui.root.querySelector<HTMLElement>('.market-connection');
  if (status) status.textContent = market.loading ? '목록 불러오는 중…' : market.error ? market.error : market.connected ? '● 실시간 연결됨' : '○ 연결 확인 중 · 2초마다 자동 갱신';
  const refresh = ui.root.querySelector<HTMLButtonElement>('.market-refresh');
  if (refresh) { refresh.textContent = market.newCount ? `새 매물 ${market.newCount}개 · 갱신` : '목록 새로고침'; refresh.disabled = market.busy || market.loading; }
  const count = ui.root.querySelector<HTMLElement>('[data-market-view="inbox"]'); if (count) count.textContent = `수령함 ${data?.inbox.length ?? 0}`;
  const badge = ui.root.querySelector<HTMLElement>('.market-badge'); if (badge) { badge.hidden = !data?.inbox.length; badge.textContent = String(data?.inbox.length ?? 0); }
  if (data) for (const sale of data.listings) {
    const row = ui.root.querySelector<HTMLElement>(`[data-listing="${CSS.escape(sale.id)}"]`);
    if (!row) continue;
    const state = row.querySelector<HTMLElement>('.market-state'); if (state) state.textContent = stateNames[sale.state] || sale.state;
    if (sale.state !== 'active') { row.classList.add('market-ended'); row.querySelectorAll<HTMLButtonElement>('.market-buy, .market-detail button').forEach(button => { button.disabled = true; }); }
  }
}
export function renderMarket(this: Interface, dialog: HTMLElement): void {
  const market = this.market, data = market.data, guest = this.session.guest;
  dialog.classList.add('market-modal');
  const hero = el('div', 'market-hero'); hero.append(el('small', '', 'THE WASTELAND EXCHANGE'), el('p', '', '황야의 거래소'), el('span', '', `보유 골드 ◆ ${money(this.world.save.gold)}`)); dialog.append(hero);
  const tabs = el('div', 'market-tabs');
  const views: [MarketView,string][] = [['active','판매 중'],['sold','거래 완료'],['mine','내 거래'],['register','판매 등록'],['inbox',`수령함 ${data?.inbox.length ?? 0}`]];
  for (const [view, name] of views) { const tab = button(name, () => market.switch(view), market.busy || !!market.sync.pendingMarket); tab.dataset.marketView = view; tab.classList.toggle('active', market.view === view); tab.setAttribute('aria-pressed', String(market.view === view)); tabs.append(tab); }
  dialog.append(tabs);
  const live = el('div', 'market-live'); live.append(el('span', 'market-connection'), button('목록 새로고침', () => market.refresh(), market.busy)); live.lastElementChild!.classList.add('market-refresh'); dialog.append(live);
  if (guest) dialog.append(el('p', 'market-notice', '게스트는 모든 매물과 시세를 볼 수 있습니다. 등록·구매는 정식 계정으로 로그인하세요.'));
  if (market.error) dialog.append(el('p', 'market-error', market.error));
  if (market.sync.pendingMarket && !market.busy) dialog.append(button('거래 결과 다시 확인', () => { void market.retry(); }));
  if (market.busy) dialog.append(el('p', 'market-notice', '거래를 안전하게 처리하고 있습니다…'));
  const blocked = guest || market.busy || market.sync.conflicted || !!market.sync.pendingMarket;
  if (market.view === 'register') renderRegister(this, dialog, blocked);
  else if (market.view === 'inbox') {
    dialog.append(el('p', 'market-notice', '구매품·취소품·만료품·판매대금을 보관합니다. 가방이 가득 차도 수령함의 물품은 사라지지 않습니다.'));
    for (const delivery of data?.inbox ?? []) {
      const row = el('article', 'market-row');
      if (delivery.item) row.append(icon(delivery.item), itemInfo(delivery.item));
      else { row.append(el('span', 'market-gold-icon', '◆'), el('b', '', `${money(delivery.gold)} 골드`)); }
      const detail = el('div', 'market-row-bottom'); detail.append(el('small', '', `${delivery.reason} · ${when(delivery.createdAt)}`), button('수령', () => { void market.act('claim', { deliveryId: delivery.id }); }, blocked)); row.append(detail); dialog.append(row);
    }
    if (!data?.inbox.length) dialog.append(el('p', 'empty', '아직 수령할 물품이나 판매대금이 없습니다.'));
  } else {
    renderFilters(market, dialog);
    dialog.append(el('p', 'market-result', `${money(data?.total ?? 0)}건${market.view === 'mine' ? ` · 판매 중 ${data?.myActive ?? 0}/10 · 내 판매 및 구매 기록` : ''}`));
    if (!data && market.loading) dialog.append(el('p', 'empty', '거래소를 불러오고 있습니다…'));
    for (const sale of data?.listings ?? []) renderListing(this, dialog, sale, blocked);
    if (data && !data.listings.length) dialog.append(el('p', 'empty', market.view === 'sold' ? '아직 거래 완료 기록이 없습니다.' : '조건에 맞는 매물이 없습니다. 판매 등록에서 첫 물품을 올려보세요.'));
    const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20)), page = Number(market.filters.page);
    const nav = el('div', 'market-pagination'); nav.append(button('이전', () => { market.filters.page = page - 1; market.refresh(); }, page <= 0 || market.busy), el('span', '', `${page + 1} / ${pages}`), button('다음', () => { market.filters.page = page + 1; market.refresh(); }, page + 1 >= pages || market.busy)); dialog.append(nav);
  }
  dialog.append(el('p', 'market-rules', '고정가 골드 거래 · 등록비 없음 · 판매 수수료 5%(올림) · 최대 10건 · 72시간 후 반환'));
  updateMarketLive(this);
}
function renderFilters(market: Market, dialog: HTMLElement): void {
  const form = el('form', 'market-search');
  const search = el('input'); search.type = 'search'; search.placeholder = '아이템·스킬북 이름 검색'; search.setAttribute('aria-label', '아이템 이름 검색'); search.maxLength = 80; search.value = String(market.filters.query); search.oninput = () => { market.filters.query = search.value; };
  const submit = el('button', '', '검색'); submit.type = 'submit'; submit.disabled = market.busy; form.append(search, submit);
  const advanced = el('details'); advanced.append(el('summary', '', '분류 · 옵션 · 가격 필터'));
  const grid = el('div', 'market-filter-grid');
  grid.append(select('분류', [['','전체'],['weapon','무기·문장'],['armor','방어구'],['accessory','장신구'],['skillbook','스킬북']], market, 'category'), select('등급', [['','전체'], ...Object.entries(rarityNames)], market, 'rarity'), select('부위', [['','전체'], ...Object.entries(slotNames),['skillbook','스킬북']], market, 'slot'), select('정렬', [['newest','최신순'],['priceAsc','낮은 가격순'],['priceDesc','높은 가격순']], market, 'sort'), numberField('최소 가격', market, 'minPrice'), numberField('최대 가격', market, 'maxPrice'), select('옵션', [['','전체'], ...Object.entries(statNames)], market, 'stat'), numberField('옵션 최솟값', market, 'minStat'));
  advanced.append(grid); const reset = button('조건 초기화', () => { market.filters = { query: '', category: '', slot: '', rarity: '', sort: 'newest', page: 0 }; market.refresh(); }); reset.className = 'market-reset'; form.append(advanced, reset);
  form.onsubmit = e => { e.preventDefault(); market.filters.page = 0; market.refresh(); }; dialog.append(form);
}
function renderListing(ui: Interface, dialog: HTMLElement, sale: Listing, blocked: boolean): void {
  const market = ui.market, row = el('article', 'market-row'); row.dataset.listing = sale.id;
  row.append(icon(sale.item), itemInfo(sale.item));
  const meta = el('div', 'market-meta'); meta.append(el('strong', '', `◆ ${money(sale.price)}`), el('small', 'market-state', stateNames[sale.state] || sale.state)); row.append(meta);
  const bottom = el('div', 'market-row-bottom');
  bottom.append(el('small', '', `판매자 ${sale.sellerName} · ${sale.state === 'sold' ? `판매 ${when(sale.soldAt!)}` : `만료 ${when(sale.expiresAt)}`}${sale.purchased ? ' · 내가 구매' : ''}`));
  if (sale.state === 'active') {
    const action = button(sale.mine ? '등록 취소' : '상세 / 구매', () => { market.selected = market.selected?.id === sale.id ? undefined : sale; market.onChange(true); }, market.busy || !!market.sync.pendingMarket); action.className = 'market-buy'; bottom.append(action);
  }
  row.append(bottom);
  if (market.selected?.id === sale.id && sale.state === 'active') {
    const detail = el('div', 'market-detail'); detail.append(el('p', '', sale.mine ? '등록을 취소하면 수령함으로 반환됩니다.' : `구매 가격 ◆ ${money(sale.price)} · 구매 후 수령함에 보관됩니다.`));
    if (!sale.mine && !isSkillBook(sale.item)) {
      const comparison = compareEquipment(ui.world.save, sale.item)!;
      detail.append(el('small', '', comparison.equipped ? `현재 장착: ${comparison.equipped.name}` : '현재 이 부위에 장착한 장비가 없습니다. (능력치 0 기준)'));
      const table = el('table', 'market-comparison'), caption = el('caption', '', '같은 부위 착용 장비와 비교'); table.append(caption);
      const head = el('thead'), headings = el('tr');
      for (const label of ['능력치', '현재 장비', '구매 장비', '증감']) { const th = el('th', '', label); th.scope = 'col'; headings.append(th); }
      head.append(headings); table.append(head);
      const body = el('tbody');
      for (const { stat, current, candidate, difference } of comparison.stats) {
        const line = el('tr'), name = el('th', '', statNames[stat]); name.scope = 'row';
        line.append(name, el('td', '', String(current)), el('td', '', String(candidate)), el('td', difference > 0 ? 'market-up' : difference < 0 ? 'market-down' : 'market-same', difference > 0 ? `▲ +${difference}` : difference < 0 ? `▼ ${difference}` : '— 0'));
        body.append(line);
      }
      table.append(body); detail.append(table);
    }
    detail.append(button(sale.mine ? '취소하고 수령함으로 반환' : `◆ ${money(sale.price)} 구매 확정`, () => { void market.act(sale.mine ? 'cancel' : 'buy', { listingId: sale.id }); }, blocked || (!sale.mine && ui.world.save.gold < sale.price)));
    if (!sale.mine && ui.world.save.gold < sale.price) detail.append(el('small', 'market-error', '골드가 부족합니다.'));
    row.append(detail);
  }
  dialog.append(row);
}
function renderRegister(ui: Interface, dialog: HTMLElement, blocked: boolean): void {
  const market = ui.market, form = el('form', 'market-register');
  form.append(el('p', 'market-notice', '미장착 장비와 미사용 스킬북만 등록할 수 있습니다. 등록 즉시 거래소에 보관되며, 장착·분해·사용할 수 없습니다.'));
  const grid = el('div', 'market-register-grid');
  for (const item of ui.world.save.bag) {
    const pick = button('', () => { market.selectedItem = item.id; market.onChange(true); }, blocked); pick.className = `market-pick${market.selectedItem === item.id ? ' selected' : ''}`; pick.append(icon(item), el('small', '', item.name)); pick.setAttribute('aria-label', `${item.name} 판매 선택`); grid.append(pick);
  }
  form.append(grid);
  if (!ui.world.save.bag.length) form.append(el('p', 'empty', '가방에 판매할 아이템이 없습니다.'));
  const item = ui.world.save.bag.find(entry => entry.id === market.selectedItem);
  if (item) {
    form.append(itemInfo(item));
    const field = el('label', 'market-field', '판매 가격 (골드)'), input = el('input'); input.type = 'number'; input.required = true; input.min = '1'; input.max = '1000000000'; input.step = '1'; input.inputMode = 'numeric'; input.placeholder = '1 ~ 1,000,000,000'; input.value = market.price; input.disabled = blocked;
    const proceeds = el('p', 'market-proceeds');
    const update = () => { market.price = input.value; const price = Number(input.value); proceeds.textContent = Number.isSafeInteger(price) && price > 0 ? `수수료 ◆ ${money(Math.ceil(price * 5 / 100))} · 예상 수령 ◆ ${money(price - Math.ceil(price * 5 / 100))}` : '가격을 입력하면 예상 수령액을 확인할 수 있습니다.'; }; input.oninput = update; update(); field.append(input); form.append(field, proceeds);
    const submit = el('button', 'market-primary', '72시간 판매 등록'); submit.type = 'submit'; submit.disabled = blocked || (market.data?.myActive ?? 0) >= 10; form.append(submit);
  }
  form.onsubmit = e => { e.preventDefault(); if (blocked || !item) return; void market.act('register', { itemId: item.id, price: Number(market.price) }); }; dialog.append(form);
}
