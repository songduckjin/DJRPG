// 일괄 분해 전 확인 팝업 B안(내역형) — 백로그 12번.
//
// 가방 아래 [일괄 분해]는 한 번에 여러 개를 지운다. 지금까지는 보호 팝업(작업 197)과 빈 장착칸
// 경고를 지나면 곧바로 분해가 실행되어, 무엇이 몇 개 사라지는지 마지막으로 볼 자리가 없었다.
// 이 팝업은 **2개 이상**을 분해하기 직전에 한 번 멈춰 세우고, 실제 대상의 등급별 개수와 그 대가로
// 받을 강화석·금화를 보여 준다. 단품 분해(1개)와 자동 분해(백그라운드)는 이 팝업을 거치지 않는다.
//
// 순서가 중요하다: 더 좋은 장비 보호 팝업과 빈 장착칸 경고를 **먼저** 지나고, 그 뒤에 남은 실제
// 대상으로 이 팝업을 띄운다. 보호 제외로 개수가 줄었다면 줄어든 숫자가 여기에 그대로 보인다.

import { rarityNames, rarityOrder, salvageGold, salvageStones, type EquipmentItem, type Rarity } from '../game/items';
import type { Interface } from './interface';

/** 분해 대상의 등급별 개수 — 실제로 포함된 등급만, 등급이 낮은 순서대로. */
export function salvageBreakdown(items: EquipmentItem[]): { rarity: Rarity; count: number }[] {
  const counts = new Map<Rarity, number>();
  for (const item of items) counts.set(item.rarity, (counts.get(item.rarity) ?? 0) + 1);
  return rarityOrder.filter(rarity => counts.has(rarity)).map(rarity => ({ rarity, count: counts.get(rarity) ?? 0 }));
}

/** 분해하면 실제로 받는 강화석·금화 — `salvageItems`와 같은 표(`items.ts`)를 쓴다. */
export function salvageReward(items: EquipmentItem[]): { gold: number; stones: number } {
  return {
    gold: items.reduce((sum, item) => sum + salvageGold[item.rarity], 0),
    stones: items.reduce((sum, item) => sum + salvageStones[item.rarity], 0),
  };
}

export type SalvageConfirmActions = { confirm: () => void; cancel: () => void };

function element(tag: string, className = '', text = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const STONE_ICON = '/assets/icons/dungeon-stone.svg';
const GOLD_ICON = '/assets/icons/gold-coin.png';

/**
 * 일괄 분해 직전의 확인 팝업(B안 내역형). 장비창 위에 한 겹 얹고, 뒤의 창은 그대로 둔다.
 * `threshold`는 사용자가 고른 기준 등급(`salvageRarity`) — 부제와 안내 줄에 등급 이름으로 쓰인다.
 */
export function openSalvageConfirm(ui: Interface, threshold: Rarity, items: EquipmentItem[], actions: SalvageConfirmActions): HTMLElement {
  const total = items.length;
  const reward = salvageReward(items);
  const bound = rarityNames[threshold];

  const overlay = element('div', 'salvage-protect bulk-confirm');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '일괄 분해 확인');
  const card = element('div', 'salvage-protect-card bulk-confirm-card');
  overlay.append(card);

  const head = element('div', 'bulk-confirm-head');
  const emblem = element('span', 'bulk-confirm-emblem');
  const emblemIcon = document.createElement('img'); emblemIcon.className = 'bulk-confirm-ico'; emblemIcon.src = STONE_ICON; emblemIcon.alt = '';
  emblem.append(emblemIcon);
  const title = element('h3', 'bulk-confirm-title', '일괄 분해');
  title.append(element('small', '', `기준 ${bound} 이하 · 장비 ${total}개`));
  head.append(emblem, title);
  card.append(head);

  const question = element('p', 'bulk-confirm-q', '총 ');
  question.append(element('b', '', String(total)), document.createTextNode('개의 아이템이 분해됩니다.'), document.createElement('br'), document.createTextNode('분해하시겠습니까?'));
  card.append(question);

  const breakdown = element('div', 'bulk-confirm-breakdown');
  breakdown.append(element('div', 'bulk-confirm-breakdown-head', '등급별 내역'));
  const grid = element('ul', 'bulk-confirm-grid');
  for (const { rarity, count } of salvageBreakdown(items)) {
    const row = element('li', `bulk-confirm-row bulk-r-${rarity}`);
    const name = element('span', 'bulk-confirm-name');
    name.append(element('i', 'bulk-confirm-dot'), document.createTextNode(rarityNames[rarity]));
    row.append(name, element('b', '', String(count)));
    grid.append(row);
  }
  breakdown.append(grid);
  card.append(breakdown);

  const gain = element('div', 'bulk-confirm-gain');
  const cap = element('span', 'bulk-confirm-cap', '예상');
  cap.append(document.createElement('br'), document.createTextNode('획득'));
  gain.append(cap);
  for (const [name, icon, value, sub] of [
    ['강화석', STONE_ICON, reward.stones, false],
    ['금화', GOLD_ICON, reward.gold, true]
  ] as [string, string, number, boolean][]) {
    const cell = element('span', sub ? 'bulk-confirm-val is-sub' : 'bulk-confirm-val');
    const image = document.createElement('img'); image.className = 'bulk-confirm-ico'; image.src = icon; image.alt = '';
    cell.append(image, element('span', '', name), element('b', '', `+${value.toLocaleString('ko-KR')}`));
    gain.append(cell);
  }
  card.append(gain);

  card.append(element('p', 'bulk-confirm-note', `잠긴 장비 · 기준(${bound})보다 높은 등급은 제외됩니다.`));

  const actionsRow = element('div', 'bulk-confirm-actions');
  const cancel = element('button', 'bulk-confirm-cancel', '취소');
  cancel.setAttribute('type', 'button');
  const confirm = element('button', 'bulk-confirm-ok', '분해하기');
  confirm.setAttribute('type', 'button');
  actionsRow.append(cancel, confirm);
  card.append(actionsRow);

  // Escape는 이 팝업만 닫는다(뒤의 장비창·경고창은 그대로). 창이 닫히면 팝업도 함께 사라진다.
  const onKey = (event: Event): void => {
    if ((event as KeyboardEvent).key !== 'Escape') return;
    event.preventDefault(); event.stopImmediatePropagation?.();
    close(); actions.cancel();
  };
  let observer: MutationObserver | undefined;
  const detach = (): void => {
    observer?.disconnect();
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') window.removeEventListener('keydown', onKey, true);
  };
  function close(): void { detach(); overlay.remove?.(); }
  cancel.onclick = () => { close(); actions.cancel(); };
  confirm.onclick = () => { close(); actions.confirm(); };
  overlay.onclick = event => { if (event.target === overlay) { close(); actions.cancel(); } };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('keydown', onKey, true);
  if (typeof MutationObserver !== 'undefined' && ui.modal) {
    observer = new MutationObserver(() => { if (ui.modal.hidden) close(); });
    observer.observe(ui.modal, { attributes: true, attributeFilter: ['hidden'] });
  }
  (ui.root ?? document.body).append(overlay);
  return overlay;
}
