import { equipDeltaLabel, equipmentImage, itemDisplayName } from '../game/items';
import type { SalvageUpgrade } from '../game/inventory';
import { rarityNames, slotNames, type Slot } from '../game/store';
import type { Interface } from './interface';
import { renderItemName } from './itemName';

/** 분해 보호 팝업의 버튼: 보호할 장비를 빼고 나머지를 분해 / 그대로 전부 분해 / 그만두기. */
export type SalvageProtectionActions = { exclude: () => void; confirm: () => void; cancel: () => void };
const rarityInk: Record<string, string> = { common: '#cdd6e0', magic: '#2f7bff', rare: '#ffd400', epic: '#a855f7', unique: '#ff8a00', legendary: '#ff2d2d' };

function element(tag: string, className = '', text = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** 장비 그림: 아틀라스 시트면 한 칸만, 아니면 아이콘 한 장(장비창·던전 드롭과 같은 아트). */
function itemArt(item: SalvageUpgrade['item']): HTMLElement {
  const art = equipmentImage(item), box = element('span', 'salvage-protect-art');
  if (art.columns > 1) {
    const sheet = element('span', 'salvage-protect-sheet');
    sheet.style.backgroundImage = `url("${art.path}")`;
    sheet.style.backgroundPosition = `${art.frame / (art.columns - 1) * 100}% center`;
    box.append(sheet);
  } else {
    const image = document.createElement('img');
    image.src = art.path; image.alt = ''; box.append(image);
  }
  box.style.setProperty?.('--salvage-ink', rarityInk[item.rarity] ?? rarityInk.common);
  return box;
}

/**
 * 일괄 분해가 장착품보다 좋은 장비를 삼키려 할 때, 장비창을 덮는 긴 확인창 대신 **작은 팝업 하나**를
 * 띄운다(작업 197). 보호할 장비만 카드로 보여 주고(그림·이름·부위, 현재 투력 → 이 장비 투력),
 * '이 아이템 분해 제외'를 가장 큰 버튼으로 둔다. 나머지 분해·취소는 보조 버튼이다.
 */
export function openSalvageProtection(ui: Interface, upgrades: SalvageUpgrade[], actions: SalvageProtectionActions): HTMLElement {
  const overlay = element('div', 'salvage-protect');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '분해 보호');
  const card = element('div', 'salvage-protect-card');
  card.append(element('h3', 'salvage-protect-title', upgrades.length > 1 ? `더 좋은 장비 ${upgrades.length}개가 들어 있어요` : '더 좋은 장비가 들어 있어요'));
  card.append(element('p', 'salvage-protect-note', '지금 장착한 장비보다 강합니다. 이 장비만 빼고 분해할 수 있어요.'));
  const list = element('ul', 'salvage-protect-list');
  for (const upgrade of upgrades) {
    const row = element('li', 'salvage-protect-item');
    row.append(itemArt(upgrade.item));
    const info = element('div', 'salvage-protect-info');
    info.append(renderItemName(element('strong'), upgrade.item));
    info.append(element('small', '', `${slotNames[upgrade.slot as Slot]} · ${rarityNames[upgrade.item.rarity]} · 장착 중 ${itemDisplayName(upgrade.equipped)}`));
    const power = element('span', 'salvage-protect-power');
    power.append(document.createTextNode('장착 시 '));
    power.append(element('b', '', equipDeltaLabel(upgrade.delta)));
    info.append(power);
    row.append(info); list.append(row);
  }
  card.append(list);
  const buttons = element('div', 'salvage-protect-actions');
  const keep = element('button', 'salvage-protect-keep', upgrades.length > 1 ? `보호할 장비 ${upgrades.length}개 빼고 분해` : '이 아이템 분해 제외');
  keep.setAttribute('type', 'button');
  const all = element('button', 'salvage-protect-all', '그대로 분해');
  all.setAttribute('type', 'button');
  const cancel = element('button', 'salvage-protect-cancel', '취소');
  cancel.setAttribute('type', 'button');
  buttons.append(keep, all, cancel);
  card.append(buttons);
  overlay.append(card);
  // Escape는 이 팝업만 닫는다(뒤의 장비창은 그대로). 장비창이 닫히면 팝업도 함께 사라진다.
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
  keep.onclick = () => { close(); actions.exclude(); };
  all.onclick = () => { close(); actions.confirm(); };
  cancel.onclick = () => { close(); actions.cancel(); };
  overlay.onclick = event => { if (event.target === overlay) { close(); actions.cancel(); } };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('keydown', onKey, true);
  if (typeof MutationObserver !== 'undefined' && ui.modal) {
    observer = new MutationObserver(() => { if (ui.modal.hidden) close(); });
    observer.observe(ui.modal, { attributes: true, attributeFilter: ['hidden'] });
  }
  // 장비창 위에 한 겹만 얹는다: 뒤의 장비창은 그대로 보이고, 이 팝업만 따로 스크롤된다.
  (ui.root ?? document.body).append(overlay);
  return overlay;
}
