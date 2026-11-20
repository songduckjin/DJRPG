import {createSkillBookArt} from '../skillBookArt';
import { goldNode, coinMarkup } from '../currency';
import { filterSaleItems } from '../itemOrder';
import { equipmentImage, isBow, isSkillBook, rarityNames, slotNames, statNames, type Item, type Stat } from '../../game/items';
import { type MarketView, type Listing, type Market } from '../../game/market';
import { compareEquipment } from '../../game/itemComparison';
import type { Interface } from '../interface';

const money = (n: number) => n.toLocaleString('ko-KR');
const when = (n: number) => new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(n);
const stateNames: Record<string,string> = { active: '판매 중', sold: '판매 완료', cancelled: '취소', expired: '기간 만료', unavailable: '판매 종료 · 새로고침' };
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; }
function button(label: string, run: () => void, disabled = false): HTMLButtonElement { const node = el('button', '', label); node.type = 'button'; node.disabled = disabled; node.onclick = run; return node; }
function icon(item: Item): HTMLElement {
  if(isSkillBook(item)){const node=createSkillBookArt(item);node.classList.add('market-icon');return node;}
  const node = el('span', 'market-icon');
  const art = equipmentImage(item);
  node.style.backgroundImage = `url("${art.path}")`; node.style.backgroundSize = `${art.columns * 100}% 100%`; node.style.backgroundPosition = `${art.columns > 1 ? art.frame / (art.columns - 1) * 100 : 0}% center`;
  return node;
}
function itemInfo(item: Item): HTMLElement {
  const info = el('div', 'market-item-info');
  info.append(el('b', `rarity-${item.rarity}`, item.name), el('small', '', `${rarityNames[item.rarity]} · ${isSkillBook(item) ? '스킬북' : isBow(item) ? '활' : slotNames[item.slot]}`));
  const stats = Object.entries(item.stats).map(([key, amount]) => `${statNames[key as Stat]} +${amount}`).join(' · ');
  info.append(el('small', 'market-options', stats || '사용 시 습득 또는 스킬 +1레벨'));
  return info;
}
function select(label: string, values: [string,string][], market: Market, key: string): HTMLElement {
  const field = el('label', 'market-field', label), node = el('select');
  node.setAttribute('aria-label', label);
  for (const [value, text] of values) { const option = el('option', '', text); option.value = value; node.append(option); }
  node.value = String(market.filters[key] ?? '');
  node.onchange = () => { market.filters[key] = node.value; if (key === 'stat') { market.filters.sort = 'newest'; market.filters.page = 0; market.refresh(); } };
  field.append(node); return field;
}
export function updateMarketLive(ui: Interface): void {
  const market = ui.market, data = market.data;
  const status = ui.root.querySelector<HTMLElement>('.market-connection');
  if (status) status.textContent = market.loading ? '목록 불러오는 중…' : market.error ? market.error : '자동 갱신 꺼짐 · 버튼 또는 탭 이동으로 갱신';
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
  const hero = el('div', 'market-hero'); hero.append(el('small', '', 'THE WASTELAND EXCHANGE'), el('p', '', '황야의 거래소'), goldNode(this.world.save.gold)); dialog.append(hero);
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
    dialog.append(button('모두 수령',()=>{void market.act('claim',{deliveryId:'all'});},blocked||!data?.inbox.length));
    dialog.append(el('p', 'market-notice', '구매품·취소품·만료품·판매대금을 보관합니다. 가방이 가득 차도 수령함의 물품은 사라지지 않습니다.'));
    for (const delivery of data?.inbox ?? []) {
      const row = el('article', 'market-row');
      if (delivery.item) row.append(icon(delivery.item), itemInfo(delivery.item));
      else { const coin = el('span', 'market-gold-icon'); coin.innerHTML = coinMarkup; row.append(coin, el('b', '', `${money(delivery.gold)} 금화`)); }
      const detail = el('div', 'market-row-bottom'); detail.append(el('small', '', `${delivery.reason} · ${when(delivery.createdAt)}`), button('수령', () => { void market.act('claim', { deliveryId: delivery.id }); }, blocked)); row.append(detail); dialog.append(row);
    }
    if (!data?.inbox.length) dialog.append(el('p', 'empty', '아직 수령할 물품이나 판매대금이 없습니다.'));
  } else {
    if(market.view==='mine'){
      const label=el('label','market-mine-filter','판매 중인 물건만 보기'),check=el('input');check.type='checkbox';check.checked=market.mineActiveOnly;check.disabled=market.busy;
      check.onchange=()=>{market.mineActiveOnly=check.checked;market.filters.page=0;market.refresh();};label.append(check);dialog.append(label);
    }
    renderFilters(market, dialog);
    dialog.append(el('p', 'market-result', `${money(data?.total ?? 0)}건${market.view === 'mine' ? ` · 판매 중 ${data?.myActive ?? 0}/${data?.rules?.maxListings ?? 30} · 내 판매 및 구매 기록` : ''}`));
    if (!data && market.loading) dialog.append(el('p', 'empty', '거래소를 불러오고 있습니다…'));
    for (const sale of data?.listings ?? []) renderListing(this, dialog, sale, blocked);
    if (data && !data.listings.length) dialog.append(el('p', 'empty', market.view === 'sold' ? '아직 거래 완료 기록이 없습니다.' : '조건에 맞는 매물이 없습니다. 판매 등록에서 첫 물품을 올려보세요.'));
    const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20)), page = Number(market.filters.page);
    const nav = el('div', 'market-pagination'); nav.append(button('이전', () => { market.filters.page = page - 1; market.refresh(); }, page <= 0 || market.busy), el('span', '', `${page + 1} / ${pages}`), button('다음', () => { market.filters.page = page + 1; market.refresh(); }, page + 1 >= pages || market.busy)); dialog.append(nav);
  }
  dialog.append(el('p', 'market-rules', `고정가 금화 거래 · 등록비 없음 · 판매 수수료 5%(올림) · 최대 ${data?.rules?.maxListings ?? 30}건 · 72시간 후 반환`));
  updateMarketLive(this);
}
function renderFilters(market: Market, dialog: HTMLElement): void {
  const form = el('form', 'market-search');
  const search = el('input'); search.type = 'search'; search.placeholder = '아이템·스킬북 이름 검색'; search.setAttribute('aria-label', '아이템 이름 검색'); search.maxLength = 80; search.value = String(market.filters.query); search.oninput = () => { market.filters.query = search.value; };
  const submit = el('button', '', '검색'); submit.type = 'submit'; submit.disabled = market.busy; form.append(search, submit);
  const advanced = el('details'); advanced.append(el('summary', '', '분류 · 등급 · 옵션 필터'));
  const grid = el('div', 'market-filter-grid');
  grid.append(select('분류', [['','전체'],['weapon','무기·문장'],['armor','방어구'],['accessory','장신구'],['skillbook','스킬북']], market, 'category'), select('등급', [['','전체'], ...Object.entries(rarityNames)], market, 'rarity'), select('옵션', [['','전체'], ...Object.entries(statNames)], market, 'stat'));
  grid.append(el('small', 'market-option-hint', '옵션 선택 시 해당 능력치가 높은 순서로 표시됩니다.'));
  advanced.append(grid); const reset = button('조건 초기화', () => { market.filters = { query: '', category: '', slot: '', rarity: '', sort: 'newest', page: 0 }; market.refresh(); }); reset.className = 'market-reset'; form.append(advanced, reset);
  form.onsubmit = e => { e.preventDefault(); market.filters.page = 0; market.refresh(); }; dialog.append(form);
}
function renderListing(ui: Interface, dialog: HTMLElement, sale: Listing, blocked: boolean): void {
  const market = ui.market, row = el('article', 'market-row'); row.dataset.listing = sale.id;
  row.append(icon(sale.item), itemInfo(sale.item));
  const meta = el('div', 'market-meta'); meta.append(goldNode(sale.price), el('small', 'market-state', stateNames[sale.state] || sale.state)); row.append(meta);
  const bottom = el('div', 'market-row-bottom');
  bottom.append(el('small', '', `판매자 ${sale.sellerName} · ${sale.state === 'sold' ? `판매 ${when(sale.soldAt!)}` : `만료 ${when(sale.expiresAt)}`}${sale.purchased ? ' · 내가 구매' : ''}`));
  if (sale.state === 'active') {
    const action = button(sale.mine ? '등록 취소' : '상세 / 구매', () => { market.selected = market.selected?.id === sale.id ? undefined : sale; market.onChange(true); }, market.busy || !!market.sync.pendingMarket); action.className = 'market-buy'; bottom.append(action);
  }
  row.append(bottom);
  if (market.selected?.id === sale.id && sale.state === 'active') {
    const detail = el('div', 'market-detail');
    if (sale.mine) detail.append(el('p', '', '등록을 취소하면 수령함으로 반환됩니다.'));
    if (!sale.mine && !isSkillBook(sale.item)) {
      const comparison = compareEquipment(ui.world.save, sale.item)!;
      const equipped = el('div', 'market-equipped');
      if (comparison.equipped) {
        const info = el('div', 'market-equipped-info');
        info.append(el('small', '', '현재 장착 중'), el('b', `rarity-${comparison.equipped.rarity}`, comparison.equipped.name), el('small', '', `${rarityNames[comparison.equipped.rarity]} · ${isBow(comparison.equipped) ? '활' : slotNames[comparison.equipped.slot]}`));
        equipped.append(icon(comparison.equipped), info);
      } else equipped.append(el('small', '', '현재 이 부위에 장착한 장비가 없습니다. (능력치 0 기준)'));
      detail.append(equipped);
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
    const confirm = button(sale.mine ? '취소하고 수령함으로 반환' : ' 구매 확정', () => { void market.act(sale.mine ? 'cancel' : 'buy', { listingId: sale.id }); }, blocked || (!sale.mine && ui.world.save.gold < sale.price));
    if (!sale.mine) confirm.prepend(goldNode(sale.price)); detail.append(confirm);
    if (!sale.mine && ui.world.save.gold < sale.price) detail.append(el('small', 'market-error', '금화가 부족합니다.'));
    row.append(detail);
  }
  dialog.append(row);
}
function renderRegister(ui: Interface, dialog: HTMLElement, blocked: boolean): void {
  const market = ui.market, form = el('form', 'market-register');
  const limitNotice = el('p', 'market-error'); limitNotice.setAttribute('role', 'alert');
  const checkLimit = (): boolean => {
    const limit = market.data?.rules?.maxListings ?? 30;
    if ((market.data?.myActive ?? 0) < limit) return false;
    const message = `동시에 ${limit}개까지 등록할 수 있습니다. 판매 중인 물품을 취소하거나 판매 완료 후 다시 등록하세요.`;
    limitNotice.textContent = message; ui.message(message); return true;
  };
  form.append(el('p', 'market-notice', `판매 중 ${market.data?.myActive ?? 0}/${market.data?.rules?.maxListings ?? 30}`));
  form.append(el('p', 'market-notice', '미장착 장비와 미사용 스킬북만 등록할 수 있습니다. 등록 즉시 거래소에 보관되며, 장착·분해·사용할 수 없습니다.'));
  const filters = el('div', 'market-register-filters');
  for (const [key, label, values] of [
    ['registerCategory', '분류', [['', '전체'], ['weapon', '무기·문장'], ['armor', '방어구'], ['accessory', '장신구'], ['skillbook', '스킬북']]],
    ['registerRarity', '등급', [['', '전체'], ...Object.entries(rarityNames)]]
  ] as const) {
    const field = el('label', 'market-field', label), select = el('select'); select.setAttribute('aria-label', `판매 등록 ${label}`);
    for (const [value, name] of values) { const option = el('option', '', name); option.value = value; select.append(option); }
    select.value = market[key]; select.disabled = blocked;
    select.onchange = () => { market[key] = select.value; market.selectedItem = ''; market.unlockItem = undefined; market.onChange(true); };
    field.append(select); filters.append(field);
  }
  form.append(filters);
  const grid = el('div', 'market-register-grid');
  const visible = filterSaleItems(ui.world.save.bag, market.registerCategory, market.registerRarity);
  for (const item of visible) {
    const pick = button('', () => { void market.selectItem(item); }, blocked);
    pick.className = `market-pick rarity-${item.rarity}${market.selectedItem === item.id ? ' selected' : ''}`;
    pick.append(icon(item), el('small', `rarity-${item.rarity}`, rarityNames[item.rarity]), el('small', '', item.name));
    if (!isSkillBook(item) && item.locked) { const locked = el('span', 'lock-icon is-locked'); locked.setAttribute('aria-label', '잠긴 장비'); pick.append(locked); }
    pick.setAttribute('aria-label', `${item.name} · ${rarityNames[item.rarity]} 판매 선택`); grid.append(pick);
  }
  form.append(grid);
  if (!visible.length) form.append(el('p', 'empty', '조건에 맞는 판매 가능 아이템이 없습니다.'));
  const item = visible.find(entry => entry.id === market.selectedItem);
  if (item) {
    form.append(itemInfo(item));
    const quote=market.quote,prices=el('p','market-recent-price');
    if(quote?.itemId===item.id){
      if(quote.loading)prices.textContent='최근 거래가 확인 중…';
      else if(quote.error)prices.textContent=quote.error;
      else if(!quote.count)prices.textContent='최근거래기록이 없습니다.';
      else {prices.append('최근 거래 ',goldNode(quote.lastPrice!),` (${when(quote.soldAt!)}) · 최근 ${quote.count}건 평균 `,goldNode(quote.average!));}
    }else prices.textContent='아이템을 선택하면 최근 거래가를 확인합니다.';
    form.append(prices);
    const field = el('label', 'market-field', '판매 가격 (금화)'), input = el('input'); input.type = 'number'; input.required = true; input.min = '1'; input.max = '1000000000'; input.step = '1'; input.inputMode = 'numeric'; input.placeholder = '1 ~ 1,000,000,000'; input.value = market.price; input.disabled = blocked;
    const proceeds = el('p', 'market-proceeds');
    const update = () => { market.price = input.value; const price = Number(input.value); proceeds.replaceChildren(); if (Number.isSafeInteger(price) && price > 0) proceeds.append('수수료 ', goldNode(Math.ceil(price * 5 / 100)), ' · 예상 수령 ', goldNode(price - Math.ceil(price * 5 / 100))); else proceeds.textContent = '가격을 입력하면 예상 수령액을 확인할 수 있습니다.'; }; input.oninput = update; update(); field.append(input); form.append(field, proceeds);
    const submit = el('button', 'market-primary', '72시간 판매 등록'); submit.type = 'submit'; submit.disabled = blocked;
    submit.onclick = event => { if (checkLimit()) event.preventDefault(); }; form.append(submit, limitNotice);
  }
  if (item && market.unlockItem === item.id) {
    const confirmation = el('section', 'market-unlock-confirm'); confirmation.setAttribute('role', 'alertdialog'); confirmation.setAttribute('aria-label', '판매할 장비 잠금 해제 확인');
    confirmation.append(el('p', '', '잠긴 장비입니다. 잠금을 해제하고 판매 등록할까요?'));
    confirmation.append(button('취소 · 잠금 유지', () => { market.unlockItem = undefined; market.onChange(true); }, blocked), button('잠금 해제 후 판매 등록', () => { if (!checkLimit()) void market.act('register', { itemId: item.id, price: Number(market.price), unlockItem: true }); }, blocked));
    form.append(confirmation);
  }
  form.onsubmit = e => {
    e.preventDefault(); if (blocked || !item || checkLimit()) return;
    if (!isSkillBook(item) && item.locked) { market.unlockItem = item.id; market.onChange(true); ui.root.querySelector<HTMLElement>('.market-unlock-confirm')?.scrollIntoView({ block: 'nearest' }); return; }
    void market.act('register', { itemId: item.id, price: Number(market.price) });
  }; dialog.append(form);
}
