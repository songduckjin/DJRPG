import type { Interface } from './interface';

// Only view state is reset. Equipped items, skills and account settings are saved game data.
export function resetModalDefaults(ui: Interface): void {
  ui.selected = undefined;
  ui.bagFilter = 'all';
  ui.salvageRarity = 'common';
  ui.codexQuery = ''; ui.codexSlot = ''; ui.codexRarity = ''; ui.codexState = 'all';
  ui.codexSelected = undefined;
  ui.confirmReset = false;
}
