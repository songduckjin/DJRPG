import type { Interface } from '../interface';
import { apiHeaders, isOutdatedResponse, reloadForNewVersion } from '../../game/appVersion';
import { loadCharacters } from './charactersModal';

export type ShopCatalog = {
  wallet: { diamonds: number; maxSlots: number };
  diamondPacks: { id: string; diamonds: number; price: number }[];
  packages: { id: string; name: string; diamonds: number; available: boolean; expiresAt?: number }[];
  paymentReady: boolean;
};
export type ShopCheckout = { orderId: string; orderName: string; amount: number; customerKey: string; clientKey: string };

async function requestShop<T>(ui: Interface, action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch('/api/shop', { method: 'POST', headers: apiHeaders({ Authorization: `Bearer ${ui.session.token}`, 'Content-Type': 'application/json' }), body: JSON.stringify({ action, ...extra }) });
  const data = await response.json();
  if (isOutdatedResponse(response.status, data.code, data.expected)) { reloadForNewVersion(); throw new Error('새 버전으로 이동합니다.'); }
  if (!response.ok) throw new Error(data.error || '상점 요청을 처리하지 못했습니다.');
  return data as T;
}

export async function loadShop(ui: Interface): Promise<void> {
  try { ui.shopCatalog = await requestShop<ShopCatalog>(ui, 'catalog'); ui.renderStatus(); if (ui.openModal === 'shop') ui.renderModal(); }
  catch (error) { ui.message(error instanceof Error ? error.message : String(error)); }
}

function element(tag: string, className = '', label = ''): HTMLElement {
  const node = document.createElement(tag); node.className = className; node.textContent = label; return node;
}
function button(label: string, action: () => void): HTMLButtonElement {
  const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.onclick = action; return node;
}

export function renderShop(ui: Interface, dialog: HTMLElement): void {
  const catalog = ui.shopCatalog;
  if (!catalog) { dialog.append(element('p', 'shop-note', '상점을 불러오는 중…')); return; }
  dialog.append(element('p', 'shop-balance', `◆ 보유 다이아 ${catalog.wallet.diamonds.toLocaleString('ko-KR')}개`));
  const tabs = element('div', 'shop-tabs');
  for (const [key, label] of [['diamonds', '다이아'], ['packages', '패키지']] as const) {
    const tab = button(label, () => { ui.shopTab = key; ui.shopCheckout = undefined; ui.renderModal(); });
    tab.classList.toggle('selected', ui.shopTab === key); tabs.append(tab);
  }
  dialog.append(tabs);
  if (ui.shopCheckout) {
    dialog.append(element('p', 'shop-note', `${ui.shopCheckout.orderName} · ${ui.shopCheckout.amount.toLocaleString('ko-KR')}원`));
    const methods = element('div'); methods.id = 'shop-payment-methods';
    const agreement = element('div'); agreement.id = 'shop-payment-agreement';
    const pay = button('결제하기', () => { void ui.shopPay?.().catch(error => ui.message(error instanceof Error ? error.message : String(error))); });
    pay.disabled = true; pay.className = 'shop-buy'; pay.id = 'shop-payment-submit';
    dialog.append(methods, agreement, pay);
    void mountCheckout(ui, ui.shopCheckout).catch(error => ui.message(error instanceof Error ? error.message : String(error)));
    return;
  }
  const grid = element('div', 'shop-grid');
  if (ui.shopTab === 'diamonds') {
    for (const pack of catalog.diamondPacks) {
      const card = element('article', 'shop-card');
      card.append(element('strong', '', `◆ ${pack.diamonds.toLocaleString('ko-KR')}개`), element('span', '', `${pack.price.toLocaleString('ko-KR')}원`));
      const buy = button(catalog.paymentReady ? '구매' : '결제 준비 중', () => { void startCheckout(ui, pack.id).catch(error => ui.message(error instanceof Error ? error.message : String(error))); });
      buy.disabled = !catalog.paymentReady; buy.className = 'shop-buy'; card.append(buy); grid.append(card);
    }
  } else {
    for (const pack of catalog.packages) {
      const card = element('article', 'shop-card');
      card.append(element('strong', '', pack.name), element('span', '', `◆ ${pack.diamonds.toLocaleString('ko-KR')}개`));
      if (pack.id === 'all_idle_30d' && Number(pack.expiresAt ?? 0) > Date.now()) card.append(element('span', '', `이용 중 · ${new Date(pack.expiresAt!).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}까지`));
      const buy = button(pack.available ? pack.id === 'all_idle_30d' && Number(pack.expiresAt ?? 0) > Date.now() ? '30일 연장' : '구매' : pack.id === 'slot' ? '최대 슬롯' : '준비 중', () => { void buyPackage(ui, pack.id).catch(error => ui.message(error instanceof Error ? error.message : String(error))); });
      buy.disabled = !pack.available; buy.className = 'shop-buy'; card.append(buy); grid.append(card);
    }
  }
  dialog.append(grid);
}

async function buyPackage(ui: Interface, id: string): Promise<void> {
  if (id !== 'slot' && id !== 'all_idle_30d') return;
  const result = await requestShop<{ wallet: ShopCatalog['wallet'] }>(ui, id === 'slot' ? 'buySlot' : 'buyAllIdle', { requestId: crypto.randomUUID() });
  if (ui.shopCatalog) ui.shopCatalog.wallet = result.wallet;
  await loadShop(ui); await loadCharacters(ui);
  ui.message(id === 'slot' ? '캐릭터 슬롯이 추가되었습니다.' : '전 슬롯 방치가 활성화되었습니다.');
}

async function startCheckout(ui: Interface, packId: string): Promise<void> {
  ui.shopCheckout = await requestShop<ShopCheckout>(ui, 'createOrder', { packId });
  ui.renderModal();
}

type Widgets = { setAmount(value: { value: number; currency: 'KRW' }): Promise<unknown>; renderPaymentMethods(value: { selector: string }): Promise<unknown>; renderAgreement(value: { selector: string }): Promise<unknown>; requestPayment(value: { orderId: string; orderName: string; successUrl: string; failUrl: string }): Promise<unknown> };
let sdkPromise: Promise<void> | undefined;
function loadTossSdk(): Promise<void> {
  if ((window as unknown as { TossPayments?: unknown }).TossPayments) return Promise.resolve();
  sdkPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://js.tosspayments.com/v2/standard';
    script.onload = () => resolve(); script.onerror = () => reject(new Error('결제 화면을 불러오지 못했습니다.'));
    document.head.append(script);
  });
  return sdkPromise;
}
async function mountCheckout(ui: Interface, checkout: ShopCheckout): Promise<void> {
  await loadTossSdk();
  if (ui.openModal !== 'shop' || ui.shopCheckout?.orderId !== checkout.orderId) return;
  const factory = (window as unknown as { TossPayments: (key: string) => { widgets(value: { customerKey: string }): Widgets } }).TossPayments;
  const widgets = factory(checkout.clientKey).widgets({ customerKey: checkout.customerKey });
  await widgets.setAmount({ value: checkout.amount, currency: 'KRW' });
  await widgets.renderPaymentMethods({ selector: '#shop-payment-methods' });
  await widgets.renderAgreement({ selector: '#shop-payment-agreement' });
  const pay = document.getElementById('shop-payment-submit') as HTMLButtonElement | null;
  if (!pay || ui.shopCheckout?.orderId !== checkout.orderId) return;
  pay.disabled = false;
  ui.shopPay = () => widgets.requestPayment({ orderId: checkout.orderId, orderName: checkout.orderName, successUrl: `${location.origin}/?shop=success`, failUrl: `${location.origin}/?shop=fail` });
}

export async function completeShopReturn(ui: Interface): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (!params.has('shop')) return;
  const status = params.get('shop');
  history.replaceState(null, '', location.pathname + location.hash);
  ui.open('shop');
  if (status !== 'success') { ui.message('결제가 취소되었거나 완료되지 않았습니다.'); return; }
  try {
    const result = await requestShop<{ wallet: ShopCatalog['wallet'] }>(ui, 'confirmOrder', { orderId: params.get('orderId'), paymentKey: params.get('paymentKey'), amount: Number(params.get('amount')) });
    if (ui.shopCatalog) ui.shopCatalog.wallet = result.wallet;
    await loadShop(ui);
    ui.message('다이아가 지급되었습니다.');
  } catch (error) { ui.message(error instanceof Error ? error.message : String(error)); }
}
