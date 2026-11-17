import { dismissBagDetail } from './bagDetail';
import { dismissEquippedDetail } from './equippedDetail';
import type { Interface } from './interface';

// Only view state is reset. Equipped items, skills and account settings are saved game data.
export function resetModalDefaults(ui: Interface): void {
  dismissEquippedDetail(ui);
  dismissBagDetail(ui);
  ui.bagFilter = 'all'; ui.bagRaritySort = false;
  ui.salvageRarity = 'common';
  ui.codexQuery = ''; ui.codexSlot = ''; ui.codexRarity = ''; ui.codexState = 'all';
  ui.codexSelected = undefined;
  ui.confirmReset = false;
}
