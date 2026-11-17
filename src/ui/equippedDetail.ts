import type { Interface } from './interface';
import { rarityNames, slotNames, statNames, type Slot, type Stat } from '../game/store';
import { unequipItem } from '../game/appearance';
import { detailPosition, dismissBagDetail } from './bagDetail';

const timers = new WeakMap<Interface, ReturnType<typeof setTimeout>>();
function cancelDismiss(ui: Interface): void { clearTimeout(timers.get(ui)); timers.delete(ui); }
export function dismissEquippedDetail(ui: Interface): void {
  cancelDismiss(ui); ui.equippedSlot = undefined; ui.equippedPinned = false;
  ui.modal?.querySelector('.equipped-detail')?.remove();
  ui.modal?.querySelectorAll('.equipment-slot').forEach(cell => cell.setAttribute('aria-expanded', 'false'));
}
export function deferEquippedDismiss(ui: Interface): void {
  cancelDismiss(ui);
  if (!ui.equippedPinned) timers.set(ui, setTimeout(() => dismissEquippedDetail(ui), 180));
}
export function positionEquippedDetail(ui: Interface): void {
  const panel = ui.modal.querySelector<HTMLElement>('.equipped-detail');
  const anchor = ui.modal.querySelector<HTMLElement>(`[data-equipped-slot="${ui.equippedSlot}"]`);
  const dialog = ui.modal.querySelector<HTMLElement>('.modal-dialog');
  if (!panel || !anchor || !dialog) return;
  const bounds = dialog.getBoundingClientRect(), rect = anchor.getBoundingClientRect();
  if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) { dismissEquippedDetail(ui); return; }
  panel.style.maxWidth = `${Math.max(0, Math.min(340, bounds.width - 16))}px`;
  panel.style.maxHeight = `${Math.max(0, bounds.height - 16)}px`;
  const size = panel.getBoundingClientRect(), position = detailPosition(bounds, rect, size.height, size.width);
  panel.style.left = `${position.left}px`; panel.style.top = `${position.top}px`;
}
export function showEquippedDetail(ui: Interface, slot: Slot, pinned = false): void {
  const item = ui.world.save.equipment[slot];
  if (ui.openModal !== 'equipment' || !item) { dismissEquippedDetail(ui); return; }
  cancelDismiss(ui); dismissBagDetail(ui);
  const same = ui.equippedSlot === slot;
  ui.equippedPinned = pinned || (same && ui.equippedPinned); ui.equippedSlot = slot;
  ui.modal.querySelectorAll<HTMLElement>('.equipment-slot').forEach(cell => cell.setAttribute('aria-expanded', String(cell.dataset.equippedSlot === slot)));
  let panel = ui.modal.querySelector<HTMLElement>('.equipped-detail');
  if (!panel || panel.dataset.itemId !== item.id) {
    panel?.remove(); panel = document.createElement('div');
    panel.className = `item-detail equipped-detail ${item.rarity}`; panel.dataset.itemId = item.id;
    panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', '장착 장비 설명');
    const title = document.createElement('h2'); title.textContent = item.name;
    const grade = document.createElement('p'); grade.textContent = `${rarityNames[item.rarity]} · ${slotNames[slot]}`;
    panel.append(title, grade);
    for (const stat of Object.keys(item.stats) as Stat[]) {
      const line = document.createElement('span'); line.textContent = `${statNames[stat]} +${item.stats[stat]}`; panel.append(line);
    }
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '장착 해제';
    remove.onclick = () => {
      if (ui.world.paused) { ui.message('현재 장비를 변경할 수 없습니다. 잠시 후 다시 시도해 주세요.'); return; }
      const result = unequipItem(ui.world.save, slot);
      if (result.ok) { dismissEquippedDetail(ui); ui.world.onChange(); }
      ui.message(result.message);
    };
    panel.append(remove);
    panel.onpointerenter = () => cancelDismiss(ui); panel.onpointerleave = () => deferEquippedDismiss(ui);
    panel.addEventListener('focusin', () => cancelDismiss(ui)); panel.addEventListener('focusout', () => deferEquippedDismiss(ui));
    ui.modal.querySelector('.modal-dialog')!.append(panel);
  }
  positionEquippedDetail(ui);
}
