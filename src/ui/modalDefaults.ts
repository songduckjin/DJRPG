import { dismissBagDetail } from './bagDetail';
import { dismissEquippedDetail } from './equippedDetail';
import type { Interface } from './interface';

// Only view state is reset. Equipped items, skills and account settings are saved game data.
export function resetModalDefaults(ui: Interface): void {
  dismissEquippedDetail(ui);
  dismissBagDetail(ui);
  ui.bagFilter = 'all'; ui.bagRaritySort = false;
  // The bulk-salvage threshold is the user's own setting, not a view filter: it decides which gear
  // 일괄 분해 destroys, so it is kept as they left it (작업 196) and never reset here.
  ui.codexQuery = ''; ui.codexSlot = ''; ui.codexRarity = ''; ui.codexState = 'all';
  ui.codexSelected = undefined;
  ui.confirmReset = false;
  if(ui.dungeon)ui.dungeon.tab='challenge';
  if(ui.worldBoss)ui.worldBoss.tab='challenge';
}
