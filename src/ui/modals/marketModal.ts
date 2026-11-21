import {createSkillBookArt} from '../skillBookArt';
import { goldNode, coinMarkup } from '../currency';
import { filterSaleItems } from '../itemOrder';
import { equipmentImage, isBow, isEquipment, isSkillBook, itemDisplayName, itemJob, rarityNames, slotNames, statNames, usableByJob, type Item, type Stat } from '../../game/items';
import { extraOptionLines } from '../../game/extraOptions';
import { jobNames } from '../../game/skills';
import { MARKET_JOB_ONLY_KEY, jobOnlyLabel, jobOnlyVisible, saveJobOnly } from '../jobFilter';
import { type MarketView, type Listing, type Market } from '../../game/market';
import { compareEquipment } from '../../game/itemComparison';
import type { Interface } from '../interface';
import type { Save } from '../../game/store';
import { appendUpgradeArrow } from '../upgradeBadge';
import { appendPlusBadge } from '../plusBadge';
import { bagStacks, stackMembers } from '../bagStacks';
import { renderItemName } from '../itemName';

/** 판매 중 목록의 `간편 보기`/`상세 보기`(작업 248) — 고른 방식은 이 기기에 남긴다. */
export type MarketListingView = 'detail' | 'compact';
export const MARKET_LISTING_VIEW_KEY = 'djrpg.market.listingView';
export function loadListingView(storage: Pick<Storage,'getItem'>|undefined = globalThis.localStorage): MarketListingView {
  try { return storage?.getItem(MARKET_LISTING_VIEW_KEY) === 'compact' ? 'compact' : 'detail'; } catch { return 'detail'; }
}
export function saveListingView(view: MarketListingView, storage: Pick<Storage,'setItem'>|undefined = globalThis.localStorage): void {
  try { storage?.setItem(MARKET_LISTING_VIEW_KEY, view); } catch { /* 저장 실패는 무시 — 이번 실행에는 적용된다 */ }
}
let listingView: MarketListingView = loadListingView();
export const currentListingView = (): MarketListingView => listingView;
export function setListingView(view: MarketListingView): void { listingView = view; saveListingView(view); }
/** 테스트가 기기 저장값 없이 시작하도록 되돌린다. */
export function resetListingView(): void { listingView = loadListingView(); }
const money = (n: number) => n.toLocaleString('ko-KR');
const when = (n: number) => new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(n);
const stateNames: Record<string,string> = { active: '판매 중', sold: '판매 완료', cancelled: '취소', expired: '기간 만료', unavailable: '판매 종료 · 새로고침' };
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; }
function button(label: string, run: () => void, disabled = false): HTMLButtonElement { const node = el('button', '', label); node.type = 'button'; node.disabled = disabled; node.onclick = run; return node; }
function icon(item: Item, save?: Save): HTMLElement {
  if(isSkillBook(item)){const node=createSkillBookArt(item);node.classList.add('market-icon');return node;}
  const node = el('span', 'market-icon');
  // 보물 주머니(작업 207)는 팔 수 없다 — 장비 그림이 없는 아이템은 빈 칸으로 둔다.
  if(!isEquipment(item)) return node;
  const art = equipmentImage(item);
  node.style.backgroundImage = `url("${art.path}")`; node.style.backgroundSize = `${art.columns * 100}% 100%`; node.style.backgroundPosition = `${art.columns > 1 ? art.frame / (art.columns - 1) * 100 : 0}% center`;
  // 업그레이드 화살표(작업 241): 아이콘 상자의 우측 상단. `save`를 안 넘기는 곳(최근 거래·비교 패널)은 달지 않는다.
  if (save) appendUpgradeArrow(node, save, item);
  return node;
}
function itemInfo(item: Item): HTMLElement {
  const info = el('div', 'market-item-info');
  const titleRow = el('div', 'market-item-title');
  titleRow.append(renderItemName(el('b', `rarity-${item.rarity}`), item));
  // 직업 전용 매물에는 `전사`/`궁수`/`마법사` 배지를 달아, 내 캐릭터가 쓸 수 있는 물건인지 목록에서 바로 보이게 한다(작업 205).
  const owner = itemJob(item);
  if (owner) titleRow.append(el('span', `job-badge job-${owner}`, jobNames[owner]));
  info.append(titleRow, el('small', '', `${rarityNames[item.rarity]} · ${isSkillBook(item) ? '스킬북' : isEquipment(item) ? isBow(item) ? '활' : slotNames[item.slot] : '소모품'}`));
  const stats = Object.entries(item.stats).map(([key, amount]) => `${statNames[key as Stat]} +${amount}`).join(' · ');
  info.append(el('small', 'market-options', stats || '사용 시 습득 또는 스킬 +1레벨'));
  // 추가옵션(작업 238) — 목록에서도 매물의 옵션을 한 줄로 보여 준다.
  const extras = isEquipment(item) ? extraOptionLines(item) : [];
  if (extras.length) info.append(el('small', 'market-options item-extra', extras.join(' · ')));
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
/**
 * 메인 화면 하단 거래소 아이콘의 빨간 점(작업 247) — `.skill-nav-dot`과 같은 모양·자리.
 *
 * 거래소 창을 열기 전에는 120초 폴링(`journey-list`)이 실어 오는 `journey.data.marketInbox`로,
 * 한 번이라도 열었거나 거래를 처리했으면 거래소가 들고 있는 수령함 건수로 판단한다(둘 중 **더 최근에
 * 확인한 값**을 쓴다 — 수령 직후 바로 꺼지고, 새 배달도 다음 폴링에서 켜진다).
 */
export function updateMarketNavDot(ui: Interface): void {
  const dot = ui.root?.querySelector<HTMLElement>('.market-nav-dot');
  if (!dot) return;
  const marketCount = ui.market?.inboxCount, marketAt = ui.market?.inboxAt ?? 0;
  const journeyCount = ui.journey?.data?.marketInbox ?? 0, journeyAt = ui.journey?.inboxAt ?? 0;
  const count = marketCount !== undefined && marketAt >= journeyAt ? marketCount : journeyCount;
  dot.hidden = !(count > 0);
}
export function updateMarketLive(ui: Interface): void {
  const market = ui.market, data = market.data;
  const status = ui.root.querySelector<HTMLElement>('.market-connection');
  if (status) status.textContent = market.loading ? '목록 불러오는 중…' : market.error ? market.error : '자동 갱신 꺼짐 · 버튼 또는 탭 이동으로 갱신';
  const refresh = ui.root.querySelector<HTMLButtonElement>('.market-refresh');
  if (refresh) { refresh.textContent = market.newCount ? `새 매물 ${market.newCount}개 · 갱신` : '목록 새로고침'; refresh.disabled = market.busy || market.loading; }
  // 수령함 탭 표시(작업 247) — `수령함 N/30` 라벨과 빨간 점을 실제 수령함 건수로 다시 맞춘다.
  const inboxTab = ui.root.querySelector<HTMLElement>('[data-market-view="inbox"]');
  const inboxLabel = inboxTab?.querySelector<HTMLElement>('.market-tab-label');
  if (inboxLabel) inboxLabel.textContent = `수령함 ${data?.inbox.length ?? 0}/${data?.rules?.maxInbox ?? 30}`;
  const inboxDot = inboxTab?.querySelector<HTMLElement>('.market-inbox-dot');
  if (inboxDot) inboxDot.hidden = !data?.inbox.length;
  updateMarketNavDot(ui);
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
  // 판매 등록 화면만 모달을 **고정 높이 flex**로 바꿔, 물품을 골라도 모달 전체가 스크롤되지 않고
  // 그리드만 내부 스크롤 + 선택 카드는 아래 고정 바가 되게 한다(작업 249, "선택하면 스크롤생기지않게").
  dialog.classList.toggle('market-registering', market.view === 'register');
  // 헤더 한 줄(작업 248): `황야의 거래소`는 왼쪽, 보유 금화는 닫기(×) 바로 왼쪽. 탭은 제목 바로 아래 인덱스 탭으로.
  const head = dialog.querySelector?.<HTMLElement>(':scope > header');
  if (head) {
    head.classList.add('market-head');
    const title = head.querySelector<HTMLElement>('h2');
    if (title) { title.textContent = '황야의 거래소'; title.classList.add('market-title'); }
    const gold = goldNode(this.world.save.gold);
    gold.classList.add('market-head-gold');
    const close = head.querySelector('.modal-close');
    if (close) head.insertBefore(gold, close); else head.append(gold);
  }
  const tabs = el('div', 'market-tabs market-index-tabs');
  tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '거래소 메뉴');
  // 작업 247: `거래 완료`(`sold`) 탭은 없앴다(5탭) — 판매 완료 기록은 `최근 거래`가 최근 순서로 보여 준다.
  // 수령함 탭은 `수령함 N/30`으로 **보관 상한**을 함께 보여 주고, 받을 것이 남아 있으면 빨간 점을 붙인다.
  const inboxMax = data?.rules?.maxInbox ?? 30, inboxCount = data?.inbox.length ?? 0;
  const views: [MarketView,string][] = [['active','판매 중'],['recent','최근 거래'],['mine','내 거래'],['register','판매 등록'],['inbox',`수령함 ${inboxCount}/${inboxMax}`]];
  for (const [view, name] of views) {
    const tab = button('', () => market.switch(view), market.busy || !!market.sync.pendingMarket);
    tab.dataset.marketView = view; tab.classList.add('market-index-tab'); tab.classList.toggle('active', market.view === view);
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(market.view === view)); tab.setAttribute('aria-pressed', String(market.view === view));
    tab.append(el('span', 'market-tab-label', name));
    if (view === 'inbox') { const dot = el('i', 'market-inbox-dot'); dot.hidden = inboxCount === 0; dot.setAttribute('aria-hidden', 'true'); tab.append(dot); }
    tabs.append(tab);
  }
  dialog.append(tabs);
  const live = el('div', 'market-live'); live.append(el('span', 'market-connection'), button('목록 새로고침', () => market.refresh(), market.busy)); live.lastElementChild!.classList.add('market-refresh'); dialog.append(live);
  if (guest) dialog.append(el('p', 'market-notice', '게스트는 모든 매물과 시세를 볼 수 있습니다. 등록·구매는 정식 계정으로 로그인하세요.'));
  if (market.error) dialog.append(el('p', 'market-error', market.error));
  // 거래 결과를 확인하지 못해 `pendingMarket`이 남아 있으면 구매·수령·탭이 모두 잠긴다 — 왜 잠겼는지와
  // 어떻게 풀지(같은 requestId로 다시 확인)를 버튼 옆에 같이 보여 준다(작업 226).
  if (market.sync.pendingMarket && !market.busy) {
    dialog.append(el('p', 'market-notice', '이전 거래의 결과를 확인하지 못해 구매·수령 버튼이 잠겨 있습니다. 서버 연결이 돌아오면 `거래 결과 다시 확인`을 눌러 마무리하세요.'));
    dialog.append(button('거래 결과 다시 확인', () => { void market.retry(); }));
  }
  if (market.busy) dialog.append(el('p', 'market-notice', '거래를 안전하게 처리하고 있습니다…'));
  const blocked = guest || market.busy || market.sync.conflicted || !!market.sync.pendingMarket;
  if (market.view === 'register') renderRegister(this, dialog, blocked);
  else if (market.view === 'recent') renderRecent(this, dialog);
  else if (market.view === 'inbox') {
    dialog.append(button('모두 수령',()=>{void market.act('claim',{deliveryId:'all'});},blocked||!data?.inbox.length));
    dialog.append(el('p', 'market-notice', `구매품·취소품·만료품·판매대금을 보관합니다. 최대 ${inboxMax}건까지 보관하며 가득 차면 구매·판매 등록이 잠깁니다. 가방이 가득 차도 수령함의 물품은 사라지지 않습니다.`));
    for (const delivery of data?.inbox ?? []) {
      const row = el('article', 'market-row');
      if (delivery.item) row.append(icon(delivery.item, this.world.save), itemInfo(delivery.item));
      else { const coin = el('span', 'market-gold-icon'); coin.innerHTML = coinMarkup; row.append(coin, el('b', '', `${money(delivery.gold)} 금화`)); }
      const detail = el('div', 'market-row-bottom'); detail.append(el('small', '', `${delivery.reason} · ${when(delivery.createdAt)}`), button('수령', () => { void market.act('claim', { deliveryId: delivery.id }); }, blocked)); row.append(detail); dialog.append(row);
    }
    if (!data?.inbox.length) dialog.append(el('p', 'empty', '아직 수령할 물품이나 판매대금이 없습니다.'));
  } else {
    if(market.view==='mine'){
      // `판매 중인 물건만 보기`(작업 247) — **오른쪽 붙임**. 켜면 판매 중인 매물만, 끄면 판매 중·완료·취소·만료 내역 전체.
      const bar=el('div','market-mine-bar');
      const label=el('label','market-mine-filter','판매 중인 물건만 보기'),check=el('input');check.type='checkbox';check.checked=market.mineActiveOnly;check.disabled=market.busy;
      check.onchange=()=>{market.mineActiveOnly=check.checked;market.filters.page=0;market.refresh();};label.append(check);bar.append(label);dialog.append(bar);
    }
    renderFilters(market, dialog);
    // `내 직업만 보기` (작업 205): 판매 중·거래 완료 목록에서 다른 직업 전용 무기·스킬북을 걷어 낸다.
    // 내 거래(mine)는 내가 올리고 산 기록이므로 같은 필터를 적용하지 않는다.
    const listings = data?.listings ?? [];
    const jobFiltered = market.view !== 'mine';
    const visibleListings = jobOnlyVisible(listings, sale => sale.item, this.world.save.job, jobFiltered && this.marketJobOnly);
    const hiddenListings = listings.length - visibleListings.length;
    if (jobFiltered) dialog.append(jobOnlyToggle(this, market, hiddenListings));
    dialog.append(el('p', 'market-result', `${money(data?.total ?? 0)}건${hiddenListings ? ` · 이 페이지에서 다른 직업 ${hiddenListings}개 숨김` : ''}${market.view === 'mine' ? ` · 판매 중 ${data?.myActive ?? 0}/${data?.rules?.maxListings ?? 30} · 내 판매 및 구매 기록` : ''}`));
    // 판매 중 탭의 `간편 보기`/`상세 보기`(작업 248) — 간편 보기는 한 화면에 훨씬 많은 매물을 보여 준다.
    const compact = market.view === 'active' && listingView === 'compact';
    if (market.view === 'active') dialog.append(listingViewToggle(this));
    if (!data && market.loading) dialog.append(el('p', 'empty', '거래소를 불러오고 있습니다…'));
    for (const sale of visibleListings) { if (compact) renderListingCompact(this, dialog, sale, blocked); else renderListing(this, dialog, sale, blocked); }
    if (data && !listings.length) dialog.append(el('p', 'empty', '조건에 맞는 매물이 없습니다. 판매 등록에서 첫 물품을 올려보세요.'));
    else if (listings.length && !visibleListings.length) dialog.append(el('p', 'empty', '이 페이지의 매물은 모두 다른 직업 전용입니다. 내 직업만 보기를 끄면 보입니다.'));
    const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20)), page = Number(market.filters.page);
    const nav = el('div', 'market-pagination'); nav.append(button('이전', () => { market.filters.page = page - 1; market.refresh(); }, page <= 0 || market.busy), el('span', '', `${page + 1} / ${pages}`), button('다음', () => { market.filters.page = page + 1; market.refresh(); }, page + 1 >= pages || market.busy)); dialog.append(nav);
  }
  dialog.append(el('p', 'market-rules', `개당 고정가 금화 거래 · 등록비 없음 · 판매 수수료 5%(올림) · 최소 등록 금액 ${money(data?.rules?.minPrice ?? 1)} 금화 · 최대 ${data?.rules?.maxListings ?? 30}건 · 묶음 최대 ${data?.rules?.maxBundle ?? 10}개 · 72시간 후 반환 · 수령함 최대 ${inboxMax}건`));
  updateMarketLive(this);
}
/**
 * `최근 거래` 탭 (작업 224, 사용자 요청 `#6313`) — 성사된 거래를 **최근 순서로 한 화면에** 보여준다.
 *  서버의 `view:'sold'`(판매 완료)를 `sold_at` 내림차순으로 받아, 검색·필터·페이지 이동 없이
 *  아이템명·등급·가격·거래 시각을 바로 읽는다. 전체 목록이 필요하면 옆의 `거래 완료` 탭을 쓴다.
 */
function renderRecent(ui: Interface, dialog: HTMLElement): void {
  const market = ui.market, data = market.data;
  const trades = (data?.listings ?? []).slice().sort((a, b) => (b.soldAt ?? 0) - (a.soldAt ?? 0));
  dialog.append(el('p', 'market-recent-summary', `최근 성사된 거래 ${money(trades.length)}건 · 최근 거래부터 보여줍니다.`));
  if (!data && market.loading) { dialog.append(el('p', 'empty', '최근 거래를 불러오고 있습니다…')); return; }
  if (!trades.length) { dialog.append(el('p', 'empty', '아직 거래 완료 기록이 없습니다. 첫 거래가 성사되면 여기에 남습니다.')); return; }
  const list = el('div', 'market-recent-list');
  for (const sale of trades) {
    const row = el('article', 'market-recent-row'); row.dataset.listing = sale.id;
    row.append(icon(sale.item), itemInfo(sale.item));
    const meta = el('div', 'market-recent-meta');
    meta.append(goldNode(sale.price), el('small', 'market-recent-time', sale.soldAt ? `${when(sale.soldAt)} 거래` : '거래 시각 없음'));
    const mine = [sale.mine ? '내 판매' : '', sale.purchased ? '내 구매' : ''].filter(Boolean).join(' · ');
    if (mine) meta.append(el('small', 'market-recent-owner', mine));
    row.append(meta); list.append(row);
  }
  dialog.append(list);
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
/** 목록 위 `내 직업만 보기` 토글 (작업 205). 켜면 다른 직업 전용 무기·스킬북만 목록에서 빠지고,
 *  공용 방어구·장신구는 그대로 남는다. 켠 상태는 기기에 남긴다. */
function jobOnlyToggle(ui: Interface, market: Market, hidden: number): HTMLElement {
  const label = el('label', 'market-job-only');
  const check = el('input'); check.type = 'checkbox'; check.checked = ui.marketJobOnly; check.disabled = market.busy;
  check.onchange = () => { ui.marketJobOnly = check.checked; saveJobOnly(MARKET_JOB_ONLY_KEY, check.checked); ui.renderModal(); };
  label.append(check, el('span', '', `${jobOnlyLabel(ui.marketJobOnly)}${ui.marketJobOnly && hidden ? ` · ${hidden}개 숨김` : ''}`));
  label.title = '내 직업이 쓸 수 없는 무기·스킬북을 목록에서 숨깁니다. 공용 방어구·장신구는 그대로 보입니다.';
  return label;
}
/**
 * 판매 중 탭의 `간편 보기`/`상세 보기` 토글(작업 248, 사용자 요청).
 * 사용자가 준 아이콘 두 장을 그대로 쓰고, 고른 방식은 `localStorage`에 남긴다(`aria-pressed`로 상태 표시).
 */
function listingViewToggle(ui: Interface): HTMLElement {
  const market = ui.market, bar = el('div', 'market-view-toggle');
  bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', '매물 보기 방식');
  for (const [view, label, art] of [['compact', '간편 보기', '/assets/icons/market-view-compact.png'], ['detail', '상세 보기', '/assets/icons/market-view-detail.png']] as const) {
    const pick = button('', () => { setListingView(view); ui.renderModal(); }, market.busy);
    pick.className = `market-view-button${listingView === view ? ' is-on' : ''}`;
    pick.dataset.view = view;
    pick.setAttribute('aria-label', label); pick.setAttribute('aria-pressed', String(listingView === view)); pick.title = label;
    const img = el('img'); img.src = art; img.alt = ''; img.draggable = false; pick.append(img);
    bar.append(pick);
  }
  return bar;
}
/** 매물 상세(작업 205·238) — 내 장비 비교·직업 안내·구매 확정. 상세/간편 두 보기가 함께 쓴다. */
function listingDetail(ui: Interface, sale: Listing, blocked: boolean): HTMLElement {
  const market = ui.market, detail = el('div', 'market-detail');
  if (sale.mine) detail.append(el('p', '', '등록을 취소하면 수령함으로 반환됩니다.'));
  // 어느 직업의 물건인지, 내가 쓸 수 있는지 한 줄로 알린다(작업 205).
  const ownerJob = itemJob(sale.item);
  if (ownerJob && !usableByJob(sale.item, ui.world.save.job)) {
    detail.append(el('p', 'market-job-warning', isSkillBook(sale.item) ? `${jobNames[ownerJob]} 전용 스킬북 (내 직업 아님)` : `장착 불가 (${jobNames[ownerJob]} 전용)`));
  }
  if (!sale.mine && !isSkillBook(sale.item)) {
    const comparison = compareEquipment(ui.world.save, sale.item)!;
    const equipped = el('div', 'market-equipped');
    if (comparison.equipped) {
      const info = el('div', 'market-equipped-info');
      info.append(el('small', '', '현재 장착 중'), renderItemName(el('b', `rarity-${comparison.equipped.rarity}`), comparison.equipped), el('small', '', `${rarityNames[comparison.equipped.rarity]} · ${isBow(comparison.equipped) ? '활' : slotNames[comparison.equipped.slot]}`));
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
  // 묶음 매물(수량 2개 이상)은 **전체 구매**와 **개당(수량) 구매**를 골라서 산다(작업 249).
  const quantity = Math.max(1, Number(sale.quantity ?? 1));
  if (!sale.mine && quantity > 1) detail.append(buyQuantityBox(ui, market, sale, quantity, blocked));
  else {
    const confirm = button(sale.mine ? '취소하고 수령함으로 반환' : ' 구매 확정', () => { void market.act(sale.mine ? 'cancel' : 'buy', { listingId: sale.id }); }, blocked || (!sale.mine && ui.world.save.gold < sale.price));
    if (!sale.mine) confirm.prepend(goldNode(sale.price)); detail.append(confirm);
    if (!sale.mine && ui.world.save.gold < sale.price) detail.append(el('small', 'market-error', '금화가 부족합니다.'));
  }
  return detail;
}
/**
 * 묶음 매물의 구매 수량 선택(작업 249) — 사용자 확정 "구매할때는 묶음전체구매할지 개당구매할지 선택할수있어야함".
 * 수량 입력(1~남은 수량)으로 **선택 수량 구매**를 하고, **전체 구매**는 한 번에 남은 전부를 산다.
 * 상세·간편 두 보기가 같은 상세(`listingDetail`)를 쓰므로 이 상자 하나로 양쪽에 적용된다.
 */
function buyQuantityBox(ui: Interface, market: Market, sale: Listing, quantity: number, blocked: boolean): HTMLElement {
  const box = el('div', 'market-buy-quantity'), gold = ui.world.save.gold;
  const chosen = Math.min(Math.max(1, Math.floor(market.buyQuantity.get(sale.id) ?? 1)), quantity);
  const field = el('label', 'market-field', `구매 수량 (1~${quantity}개)`);
  const input = el('input'); input.type = 'number'; input.min = '1'; input.max = String(quantity); input.step = '1'; input.inputMode = 'numeric'; input.value = String(chosen); input.disabled = blocked;
  field.append(input);
  const read = () => Math.min(quantity, Math.max(1, Math.floor(Number(input.value) || 1)));
  const selected = button('', () => { void market.act('buy', { listingId: sale.id, quantity: read() }); }, blocked);
  selected.className = 'market-primary'; selected.dataset.marketBuy = 'selected';
  const whole = button('', () => { void market.act('buy', { listingId: sale.id, quantity }); }, blocked || gold < sale.price * quantity);
  whole.className = 'market-primary'; whole.dataset.marketBuy = 'whole';
  const line = el('p', 'market-proceeds');
  const update = () => {
    const count = read();
    market.buyQuantity.set(sale.id, count);
    const total = sale.price * count;
    selected.replaceChildren(`선택 수량 구매 (${count}개) · `, goldNode(total));
    selected.disabled = blocked || gold < total;
    line.replaceChildren(`총 ${count}개 · `, goldNode(total), ` · 판매자 수령 `, goldNode(total - Math.ceil(total * 5 / 100)));
  };
  input.oninput = update;
  whole.append(`전체 구매 (${quantity}개) · `, goldNode(sale.price * quantity));
  update();
  box.append(field, selected, whole, line);
  if (gold < sale.price) box.append(el('small', 'market-error', '금화가 부족합니다.'));
  return box;
}
function renderListing(ui: Interface, dialog: HTMLElement, sale: Listing, blocked: boolean): void {
  const market = ui.market, row = el('article', 'market-row'); row.dataset.listing = sale.id;
  const quantity = Math.max(1, Number(sale.quantity ?? 1));
  row.append(icon(sale.item, ui.world.save), itemInfo(sale.item));
  // 묶음 매물은 **개당 가격**과 **총 수량**을 함께 보여 준다(작업 249).
  const meta = el('div', 'market-meta');
  if (quantity > 1) meta.append(el('small', 'market-unit-label', '개당'));
  meta.append(goldNode(sale.price));
  if (quantity > 1) meta.append(el('small', 'market-bundle-count', `총 ${quantity}개`));
  meta.append(el('small', 'market-state', stateNames[sale.state] || sale.state)); row.append(meta);
  const bottom = el('div', 'market-row-bottom');
  bottom.append(el('small', '', `판매자 ${sale.sellerName} · ${sale.state === 'sold' ? `판매 ${when(sale.soldAt!)}` : `만료 ${when(sale.expiresAt)}`}${sale.purchased ? ' · 내가 구매' : ''}`));
  if (sale.state === 'active') {
    const action = button(sale.mine ? '등록 취소' : '상세 / 구매', () => { market.selected = market.selected?.id === sale.id ? undefined : sale; market.onChange(true); }, market.busy || !!market.sync.pendingMarket); action.className = 'market-buy'; bottom.append(action);
  }
  row.append(bottom);
  if (market.selected?.id === sale.id && sale.state === 'active') row.append(listingDetail(ui, sale, blocked));
  dialog.append(row);
}
/**
 * 간편 보기 한 줄(작업 248) — 아이콘(등급 테두리·`+N`·추천 화살표) + 이름 + 가격 + 구매 버튼만 남겨
 * 한 화면에 훨씬 많은 매물을 담는다. 카드를 누르면 그 매물의 상세(능력치·비교·구매 확정)가 아래에 펼쳐진다.
 */
function renderListingCompact(ui: Interface, dialog: HTMLElement, sale: Listing, blocked: boolean): void {
  const market = ui.market, row = el('article', 'market-row market-row-compact'); row.dataset.listing = sale.id;
  const pic = icon(sale.item, ui.world.save); pic.classList.add(`rarity-${sale.item.rarity}`); appendPlusBadge(pic, sale.item);
  const name = el('div', 'market-compact-name');
  name.append(renderItemName(el('b', `rarity-${sale.item.rarity}`), sale.item));
  name.append(el('small', 'market-compact-meta', `${rarityNames[sale.item.rarity]} · ${isSkillBook(sale.item) ? '스킬북' : isEquipment(sale.item) ? (isBow(sale.item) ? '활' : slotNames[sale.item.slot]) : '소모품'}${sale.purchased ? ' · 내가 구매' : ''}`));
  const quantity = Math.max(1, Number(sale.quantity ?? 1));
  const price = el('div', 'market-compact-price');
  if (quantity > 1) price.append(el('small', 'market-unit-label', '개당'));
  price.append(goldNode(sale.price));
  if (quantity > 1) price.append(el('small', 'market-compact-qty', `총 ${quantity}개`));
  const action = button(sale.mine ? '취소' : '구매', () => { market.selected = market.selected?.id === sale.id ? undefined : sale; market.onChange(true); }, market.busy || !!market.sync.pendingMarket);
  action.className = 'market-buy';
  action.setAttribute('aria-label', `${itemDisplayName(sale.item)} ${sale.mine ? '등록 취소' : '구매'} 상세`);
  action.title = sale.mine ? '등록 취소 상세' : '구매 확인 창을 엽니다';
  row.append(pic, name, price, action);
  if (market.selected?.id === sale.id && sale.state === 'active') row.append(listingDetail(ui, sale, blocked));
  dialog.append(row);
}
/**
 * 판매 등록 화면(작업 249 개편).
 *
 * 사용자 요청: "판매할템 선택하면 스크롤생기지않게해야함 묶음템은 한번에 개당갯수 적어서 등록할수있어야하고".
 * ① 모달(`.market-registering`)을 고정 높이 flex로 두어 **물품 그리드만 내부 스크롤**하고, 물품을 골라도
 *    모달 전체 스크롤이 새로 생기지 않는다. 선택한 물품의 등록 카드(`.market-register-detail`)는 그리드 아래
 *    고정 바이고, 카드가 길어지면 카드 안에서만 스크롤된다.
 * ② 같은 스킬북처럼 한 칸에 `×N`으로 묶인 물품은 **수량(1~min(보유,10))과 개당 가격**을 적어 한 매물로 등록한다.
 *    보내는 값은 `itemIds`(묶음의 실제 아이템 id 전부) + `price`(개당)다.
 */
function renderRegister(ui: Interface, dialog: HTMLElement, blocked: boolean): void {
  const market = ui.market, form = el('form', 'market-register');
  const maxBundle = market.data?.rules?.maxBundle ?? 10;
  const limitNotice = el('p', 'market-error'); limitNotice.setAttribute('role', 'alert');
  const checkLimit = (): boolean => {
    const limit = market.data?.rules?.maxListings ?? 30;
    if ((market.data?.myActive ?? 0) < limit) return false;
    const message = `동시에 ${limit}개까지 등록할 수 있습니다. 판매 중인 물품을 취소하거나 판매 완료 후 다시 등록하세요.`;
    limitNotice.textContent = message; ui.message(message); return true;
  };
  // 안내는 **한 줄**로 줄인다 — 세로 공간을 물품 그리드에 남겨야 선택해도 스크롤이 생기지 않는다.
  form.append(el('p', 'market-notice', `판매 중 ${market.data?.myActive ?? 0}/${market.data?.rules?.maxListings ?? 30} · 묶음은 한 번에 최대 ${maxBundle}개 · 미장착 장비와 미사용 스킬북만 등록됩니다.`));
  const filters = el('div', 'market-register-filters');
  for (const [key, label, values] of [
    ['registerCategory', '분류', [['', '전체'], ['weapon', '무기·문장'], ['armor', '방어구'], ['accessory', '장신구'], ['skillbook', '스킬북']]],
    ['registerRarity', '등급', [['', '전체'], ...Object.entries(rarityNames)]]
  ] as const) {
    const field = el('label', 'market-field', label), select = el('select'); select.setAttribute('aria-label', `판매 등록 ${label}`);
    for (const [value, name] of values) { const option = el('option', '', name); option.value = value; select.append(option); }
    select.value = market[key]; select.disabled = blocked;
    select.onchange = () => { market[key] = select.value; market.selectedItem = ''; market.unlockItem = undefined; market.quantity = '1'; market.onChange(true); };
    field.append(select); filters.append(field);
  }
  form.append(filters);
  // 물품 칸 — 이 그리드만 내부 스크롤한다(작업 249). 칸 모양·배지 배치는 작업 248 그대로다.
  const grid = el('div', 'market-register-grid');
  const visible = filterSaleItems(ui.world.save.bag, market.registerCategory, market.registerRarity);
  const stacks = bagStacks(visible);
  for (const stack of stacks) {
    const { item, count } = stack;
    // [작업 248] 가방 칸과 같은 **정사각형 아이콘 칸**만 남긴다 — 이름 글자(스킬북 `[스킬북]` 포함)는 빼고
    // 툴팁(`title`)으로만 알린다. 배지는 모두 절대 위치라 칸 크기를 밀지 않는다.
    const pick = button('', () => { void market.selectItem(item); }, blocked);
    pick.className = `market-pick rarity-${item.rarity}${market.selectedItem === item.id ? ' selected' : ''}`;
    pick.dataset.itemId = item.id;
    pick.append(icon(item));
    appendPlusBadge(pick, item);
    // 초록 추천 화살표(작업 241)는 **칸**의 오른쪽 위에 고정 크기로 붙인다(아이콘 상자 기준이면 칸 밖으로 밀린다).
    appendUpgradeArrow(pick, ui.world.save, item);
    const pickOwner = itemJob(item);
    if (pickOwner) pick.append(el('span', `job-badge job-${pickOwner}`, jobNames[pickOwner]));
    if (count > 1) { const badge = el('span', 'market-pick-count', `×${count}`); badge.setAttribute('aria-hidden', 'true'); pick.append(badge); }
    if (isEquipment(item) && item.locked) { const locked = el('span', 'lock-icon is-locked market-pick-lock'); locked.setAttribute('aria-label', '잠긴 장비'); pick.append(locked); }
    pick.title = `${itemDisplayName(item)} · ${rarityNames[item.rarity]}${pickOwner ? ` · ${jobNames[pickOwner]} 전용` : ''}${count > 1 ? ` · ${count}개` : ''}`;
    pick.setAttribute('aria-label', `${itemDisplayName(item)} · ${rarityNames[item.rarity]}${count > 1 ? ` · ${count}개` : ''} 판매 선택`); grid.append(pick);
  }
  form.append(grid);
  if (!visible.length) form.append(el('p', 'empty', '조건에 맞는 판매 가능 아이템이 없습니다.'));

  const stack = stacks.find(entry => entry.item.id === market.selectedItem);
  const item = stack?.item;
  if (stack && item) {
    const members = stackMembers(visible, stack);
    // 한 번에 묶을 수 있는 최대 수량 = min(보유 수량, 서버 규칙 10개).
    const limit = Math.min(stack.count, maxBundle);
    const clamp = () => Math.min(limit, Math.max(1, Math.floor(Number(market.quantity) || 1)));
    const detail = el('section', 'market-register-detail');
    const picked = el('div', 'market-register-picked');
    picked.append(icon(item, ui.world.save));
    const info = el('div', 'market-register-picked-info');
    const titleRow = el('div', 'market-item-title');
    titleRow.append(renderItemName(el('b', `rarity-${item.rarity}`), item));
    if (stack.count > 1) titleRow.append(el('span', 'market-pick-count-inline', `보유 ×${stack.count}`));
    info.append(titleRow, el('small', '', `${rarityNames[item.rarity]} · ${isSkillBook(item) ? '스킬북' : isEquipment(item) ? (isBow(item) ? '활' : slotNames[item.slot]) : '소모품'}`));
    picked.append(info); detail.append(picked);

    const quote = market.quote, prices = el('p', 'market-recent-price');
    if (quote?.itemId === item.id) {
      if (quote.loading) prices.textContent = '최근 거래가 확인 중…';
      else if (quote.error) prices.textContent = quote.error;
      else if (!quote.count) prices.textContent = '최근거래기록이 없습니다.';
      else { prices.append('최근 거래 ', goldNode(quote.lastPrice!), ` (${when(quote.soldAt!)}) · 최근 ${quote.count}건 평균 `, goldNode(quote.average!)); }
    } else prices.textContent = '아이템을 선택하면 최근 거래가를 확인합니다.';
    detail.append(prices);

    const minPrice = market.data?.rules?.minPrice ?? 1;
    const inputs = el('div', 'market-register-inputs');
    // ① 수량 — 보유가 1개(장비)면 1로 고정해 보여만 준다.
    const quantityField = el('label', 'market-field', '수량');
    const quantityInput = el('input'); quantityInput.type = 'number'; quantityInput.min = '1'; quantityInput.max = String(limit); quantityInput.step = '1'; quantityInput.inputMode = 'numeric';
    quantityInput.value = String(clamp()); quantityInput.disabled = blocked || limit === 1;
    quantityField.append(quantityInput);
    const maxButton = button('최대', () => { quantityInput.value = String(limit); market.quantity = String(limit); update(); }, blocked || limit === 1);
    maxButton.className = 'market-max-button';
    const quantityRow = el('div', 'market-register-quantity'); quantityRow.append(quantityField, maxButton);
    // ② 개당 가격 — 묶음이면 총액이 개당 × 수량이라는 것을 아래 `proceeds`가 같이 보여 준다.
    const priceField = el('label', 'market-field', limit > 1 ? '개당 가격 (금화)' : '판매 가격 (금화)');
    const priceInput = el('input'); priceInput.type = 'number'; priceInput.required = true; priceInput.min = String(minPrice); priceInput.max = '1000000000'; priceInput.step = '1'; priceInput.inputMode = 'numeric';
    priceInput.placeholder = `${money(minPrice)} ~ 1,000,000,000`; priceInput.value = market.price; priceInput.disabled = blocked;
    priceField.append(priceInput);
    inputs.append(quantityRow, priceField);
    detail.append(inputs, el('p', 'market-min-price', `최소 등록 금액 ${money(minPrice)} 금화 · 한 번에 최대 ${maxBundle}개`));
    const proceeds = el('p', 'market-proceeds');
    const submit = el('button', 'market-primary', '72시간 판매 등록'); submit.type = 'submit'; submit.disabled = blocked;
    submit.onclick = event => { if (checkLimit()) event.preventDefault(); };
    function update(): void {
      const count = clamp();
      market.quantity = String(count);
      market.price = priceInput.value;
      const price = Number(priceInput.value);
      proceeds.replaceChildren();
      if (Number.isSafeInteger(price) && price > 0) {
        const total = price * count;
        proceeds.append(`총 ${count}개 · `, goldNode(total), ` · 수수료 `, goldNode(Math.ceil(total * 5 / 100)), ' · 예상 수령 ', goldNode(total - Math.ceil(total * 5 / 100)));
      } else proceeds.textContent = priceInput.value === '' ? '가격을 입력하면 예상 수령액을 확인할 수 있습니다.' : '가격은 1 금화 이상 정수로 입력하세요.';
      submit.textContent = count > 1 ? `${count}개 묶음 등록` : '72시간 판매 등록';
    }
    quantityInput.oninput = update;
    priceInput.oninput = update;
    detail.append(proceeds, submit, limitNotice);
    update();

    if (market.unlockItem === item.id) {
      const chosen = members.slice(0, clamp());
      const confirmation = el('section', 'market-unlock-confirm'); confirmation.setAttribute('role', 'alertdialog'); confirmation.setAttribute('aria-label', '판매할 장비 잠금 해제 확인');
      confirmation.append(el('p', '', `잠긴 장비입니다. 잠금을 해제하고${chosen.length > 1 ? ` ${chosen.length}개를 묶어` : ''} 판매 등록할까요?`));
      confirmation.append(
        button('취소 · 잠금 유지', () => { market.unlockItem = undefined; market.onChange(true); }, blocked),
        button('잠금 해제 후 판매 등록', () => { if (!checkLimit()) void market.act('register', { itemIds: chosen.map(entry => entry.id), price: Number(market.price), unlockItem: true }); }, blocked)
      );
      detail.append(confirmation);
    }
    form.append(detail);
  }
  form.onsubmit = e => {
    e.preventDefault(); if (blocked || !item || !stack || checkLimit()) return;
    const chosen = stackMembers(visible, stack).slice(0, Math.min(stack.count, maxBundle, Math.max(1, Math.floor(Number(market.quantity) || 1))));
    if (chosen.some(entry => isEquipment(entry) && entry.locked)) {
      market.unlockItem = item.id; market.onChange(true);
      ui.root.querySelector<HTMLElement>('.market-unlock-confirm')?.scrollIntoView({ block: 'nearest' }); return;
    }
    void market.act('register', { itemIds: chosen.map(entry => entry.id), price: Number(market.price) });
  };
  dialog.append(form);
}
