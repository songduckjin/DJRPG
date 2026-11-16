export const coinMarkup = '<img class="currency-icon" src="/assets/icons/gold-coin.png" alt="금화">';
export function goldMarkup(amount: number): string {
  return `${coinMarkup}<span>${Math.max(0, Number.isFinite(amount) ? amount : 0).toLocaleString('ko-KR')}</span>`;
}
export function goldNode(amount: number): HTMLElement {
  const node = document.createElement('span'); node.className = 'currency-amount'; node.innerHTML = goldMarkup(amount); return node;
}
