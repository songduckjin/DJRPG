import type { Item } from '../game/store';
import type { Interface } from './interface';

const interactions = new WeakMap<Interface, { pinned: boolean; timer?: ReturnType<typeof setTimeout> }>();
function cancelBagDismiss(ui: Interface): void {
  clearTimeout(interactions.get(ui)?.timer);
}
export function bagDetailPinned(ui: Interface): boolean { return interactions.get(ui)?.pinned ?? false; }
export function deferBagDismiss(ui: Interface): void {
  cancelBagDismiss(ui);
  if (!bagDetailPinned(ui)) interactions.set(ui, { pinned: false, timer: setTimeout(() => dismissBagDetail(ui), 180) });
}
export function createBagDetail(ui: Interface, item: Item): HTMLElement {
  const detail = ui.itemDetail(ui.world.save, item); detail.classList.add('bag-detail-overlay');
  detail.setAttribute('role', 'region'); detail.setAttribute('aria-label', '선택한 아이템 설명');
  detail.onpointerenter = () => cancelBagDismiss(ui);
  detail.onpointerleave = () => deferBagDismiss(ui);
  detail.addEventListener('focusin', () => cancelBagDismiss(ui));
  detail.addEventListener('focusout', () => deferBagDismiss(ui));
  return detail;
}
// Open only the overlay: rebuilding the grid on pointerenter would replace the hovered cell.
export function showBagDetail(ui: Interface, id: string, pinned = false): void {
  const item = ui.world.save.bag.find(item => item.id === id);
  if (ui.openModal !== 'equipment' || !item) return;
  cancelBagDismiss(ui);
  interactions.set(ui, { pinned: pinned || (ui.selected === id && bagDetailPinned(ui)) });
  ui.selected = id;
  ui.modal.querySelectorAll<HTMLElement>('.bag-item').forEach(cell => {
    const selected = cell.dataset.itemId === id;
    cell.classList.toggle('selected', selected); cell.setAttribute('aria-expanded', String(selected));
  });
  let panel = ui.modal.querySelector<HTMLElement>('.bag-detail-overlay');
  if (panel?.dataset.itemId !== id) {
    panel?.remove(); panel = createBagDetail(ui, item); panel.dataset.itemId = id;
    ui.modal.querySelector('.modal-dialog')!.append(panel);
  }
  positionBagDetail(ui);
}
export function dismissBagDetail(ui: Interface): void {
  cancelBagDismiss(ui); interactions.delete(ui);
  ui.selected = undefined;
  ui.modal.querySelector('.bag-detail-overlay')?.remove();
  ui.modal.querySelectorAll('.bag-item.selected').forEach(cell => {
    cell.classList.remove('selected'); cell.setAttribute('aria-expanded', 'false');
  });
}

export function detailPosition(bounds: { left: number; right: number; top: number; bottom: number }, anchor: { top: number; bottom: number; left?: number }, height: number, contentWidth = bounds.right - bounds.left - 16) {
  const top = bounds.top + 8, bottom = bounds.bottom - 8;
  const maxHeight = Math.max(0, bottom - top);
  const fitted = Math.min(height, maxHeight);
  const below = anchor.bottom + 6;
  const width = Math.max(0, Math.min(contentWidth, bounds.right - bounds.left - 16));
  return { left: Math.max(bounds.left + 8, Math.min(anchor.left ?? bounds.left + 8, bounds.right - width - 8)), width, maxHeight,
    top: below + fitted <= bottom ? Math.max(top, below) : Math.max(top, Math.min(bottom - fitted, anchor.top - fitted - 6)) };
}

// Open toward the center, touching the anchor so no other item lies on the pointer path.
export function attachedDetailPosition(bounds: { left: number; right: number; top: number; bottom: number }, anchor: { left: number; right: number; top: number; bottom: number }, height: number, width: number) {
  const maxHeight = Math.max(0, bounds.bottom - bounds.top - 16);
  const fittedWidth = Math.min(width, Math.max(0, bounds.right - bounds.left - 16));
  const towardRight = (anchor.left + anchor.right) / 2 <= (bounds.left + bounds.right) / 2;
  const left = towardRight ? anchor.right - 1 : anchor.left - fittedWidth + 1;
  return { left: Math.max(bounds.left + 8, Math.min(left, bounds.right - fittedWidth - 8)),
    top: Math.max(bounds.top + 8, Math.min(anchor.top, bounds.bottom - 8 - Math.min(height, maxHeight))),
    width: fittedWidth, maxHeight };
}

export function positionBagDetail(ui: Interface): void {
  const panel = ui.modal.querySelector<HTMLElement>('.bag-detail-overlay');
  const selected = ui.modal.querySelector<HTMLElement>('.bag-item.selected');
  const dialog = ui.modal.querySelector<HTMLElement>('.modal-dialog');
  if (!panel || !selected || !dialog) return;
  const bounds = dialog.getBoundingClientRect();
  const grid = selected.parentElement!.getBoundingClientRect(), anchor = selected.getBoundingClientRect();
  if (anchor.bottom <= Math.max(grid.top, bounds.top) || anchor.top >= Math.min(grid.bottom, bounds.bottom)) { dismissBagDetail(ui); return; }
  panel.style.width = 'max-content';
  panel.style.maxWidth = `${Math.max(0, Math.min(400, bounds.width - 16))}px`;
  panel.style.maxHeight = `${Math.max(0, bounds.height - 16)}px`;
  const size = panel.getBoundingClientRect();
  const position = attachedDetailPosition(bounds, anchor, size.height, size.width);
  panel.style.left = `${position.left}px`; panel.style.top = `${position.top}px`;
}
