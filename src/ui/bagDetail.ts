import type { Interface } from './interface';

export function dismissBagDetail(ui: Interface): void {
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

export function positionBagDetail(ui: Interface): void {
  const panel = ui.modal.querySelector<HTMLElement>('.bag-detail-overlay');
  const selected = ui.modal.querySelector<HTMLElement>('.bag-item.selected');
  const dialog = ui.modal.querySelector<HTMLElement>('.modal-dialog');
  if (!panel || !selected || !dialog) return;
  const bounds = dialog.getBoundingClientRect();
  const grid = selected.parentElement!.getBoundingClientRect(), anchor = selected.getBoundingClientRect();
  if (anchor.bottom <= grid.top || anchor.top >= grid.bottom) { dismissBagDetail(ui); return; }
  panel.style.width = 'max-content';
  panel.style.maxWidth = `${Math.max(0, Math.min(400, bounds.width - 16))}px`;
  panel.style.maxHeight = `${Math.max(0, bounds.height - 16)}px`;
  const size = panel.getBoundingClientRect();
  const position = detailPosition(bounds, anchor, size.height, size.width);
  panel.style.left = `${position.left}px`; panel.style.top = `${position.top}px`;
}
