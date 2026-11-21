import { dismissBagDetail } from './bagDetail';
import { dismissEquippedDetail } from './equippedDetail';
import { resetFloorGroups } from './modals/floorModal';
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
  // 스킬 창 탭은 보기 상태다 — 창을 닫으면 `전체`로 돌아간다(작업 240).
  ui.skillFilter = 'all';
  ui.confirmReset = false;
  // 캐릭터 카드 펼침은 팝업을 닫으면 접힌다(작업 216).
  ui.characterFocus = undefined;
  // 층 선택 창은 열 때마다 `내 권장 층 구간만 펼친` 상태로 시작한다.
  resetFloorGroups();
  if(ui.dungeon)ui.dungeon.tab='challenge';
  if(ui.worldBoss)ui.worldBoss.tab='challenge';
}
