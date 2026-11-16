import type { Interface } from './interface';

export function dismissBagDetail(ui: Interface): void {
  ui.selected = undefined;
  ui.modal.querySelector('.bag-detail-overlay')?.remove();
  ui.modal.querySelectorAll('.bag-item.selected').forEach(cell => {
    cell.classList.remove('selected'); cell.setAttribute('aria-expanded', 'false');
  });
}

export function detailPosition(bounds: { left: number; right: number; top: number; bottom: number }, anchor: { top: number; bottom: number }, height: number) {
  const top = bounds.top + 8, bottom = bounds.bottom - 8;
  const maxHeight = Math.max(0, bottom - top);
  const fitted = Math.min(height, maxHeight);
  const below = anchor.bottom + 6;
  return { left: bounds.left + 8, width: Math.max(0, bounds.right - bounds.left - 16), maxHeight,
    top: below + fitted <= bottom ? Math.max(top, below) : Math.max(top, Math.min(bottom - fitted, anchor.top - fitted - 6)) };
}

export function positionBagDetail(ui: Interface): void {
  const panel = ui.modal.querySelector<HTMLElement>('.bag-detail-overlay');
  const selected = ui.modal.querySelector<HTMLElement>('.bag-item.selected');
  const dialog = ui.modal.querySelector<HTMLElement>('.modal-dialog');
  if (!panel || !selected || !dialog) return;
  const bounds = dialog.getBoundingClientRect();
  const grid = selected.parentElement!.getBoundingClientRect(), anchor = selected.getBoundingClientRect();
  if (anchor.bottom <= grid.top || anchor.top >= grid.bottom) { dismissBagDetail(ui); return; }
  panel.style.width = `${Math.max(0, bounds.width - 16)}px`;
  panel.style.maxHeight = `${Math.max(0, bounds.height - 16)}px`;
  const position = detailPosition(bounds, anchor, panel.getBoundingClientRect().height);
  panel.style.left = `${position.left}px`; panel.style.top = `${position.top}px`;
}
