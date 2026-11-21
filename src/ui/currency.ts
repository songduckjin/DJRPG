export const coinMarkup = '<img class="currency-icon" src="/assets/icons/gold-coin.png" alt="금화">';
export function goldMarkup(amount: number): string {
  return `${coinMarkup}<span>${Math.max(0, Number.isFinite(amount) ? amount : 0).toLocaleString('ko-KR')}</span>`;
}
export function goldNode(amount: number): HTMLElement {
  const node = document.createElement('span'); node.className = 'currency-amount'; node.innerHTML = goldMarkup(amount); return node;
}

/**
 * 다이아 아이콘(작업 261) — 예전에는 `◆` 글자 하나를 썼는데, 작은 크기에서 "그냥 도형"으로 보인다는 지적을 받아
 * 사용자가 고른 보석 그림(은빛 테두리 + 푸른 크리스탈, `downloads/diamond_icon_preview/icon_v2_opt2.png` 128×128)을
 * 금화와 같은 방식(18px PNG)으로 넣었다. 글자가 아니라 그림이라 화면 읽기용 이름은 `alt`가 맡는다.
 */
export const diamondIconMarkup = '<img class="currency-icon currency-diamond" src="/assets/icons/diamond.png" alt="다이아">';
/** `◆` 대신 다이아 그림 + 숫자. `prefix`·`suffix`는 "다이아 1,000개"처럼 단위를 붙일 때만 쓴다. */
export function diamondMarkup(amount: number, { prefix = '', suffix = '' }: { prefix?: string; suffix?: string } = {}): string {
  const value = Math.max(0, Number.isFinite(amount) ? amount : 0).toLocaleString('ko-KR');
  return `${diamondIconMarkup}<span>${prefix}${value}${suffix}</span>`;
}
export function diamondNode(amount: number, prefix = '', suffix = ''): HTMLElement {
  const node = document.createElement('span'); node.className = 'currency-amount'; node.innerHTML = diamondMarkup(amount, { prefix, suffix }); return node;
}
