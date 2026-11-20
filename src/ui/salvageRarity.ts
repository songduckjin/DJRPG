// The grade a bulk salvage sweeps up (작업 196).
//
// The equipment popup's "기준: 에픽 이하" button is not a view filter: it decides which equipment the
// 일괄 분해 button destroys. The user picks it (epic or below, say) and expects it to still be there
// after closing the popup or reloading the app — a reset back to "일반만" would make the next 일괄 분해
// hand out almost nothing, and resetting it up the other way could sweep gear they meant to keep. So
// the choice is kept on the device, under the same key the save reset already clears
// (`store.ts` `clearLegacySave`), and only the very first run falls back to the default.

import { rarityOrder, type Rarity } from '../game/items';

/** The grades a bulk salvage may take. Legendary is never swept up. */
export type SalvageRarity = Exclude<Rarity, 'legendary'>;
/** Where the user's own threshold is kept between sessions. */
export const SALVAGE_RARITY_KEY = 'djrpg-salvage-rarity';
/** The threshold used until the user picks one, the first time they open the popup. */
export const SALVAGE_RARITY_DEFAULT: SalvageRarity = 'common';

/** Every threshold the button cycles through, in grade order. */
export const salvageRarities: readonly SalvageRarity[] = rarityOrder.filter((rarity): rarity is SalvageRarity => rarity !== 'legendary');

export function isSalvageRarity(value: unknown): value is SalvageRarity {
  return typeof value === 'string' && (salvageRarities as readonly string[]).includes(value);
}

/** The threshold the user last set, or the default before they ever set one. A damaged or missing
 *  entry (private mode, cleared storage, an old build) is the default rather than an error. */
export function readSalvageRarity(): SalvageRarity {
  try {
    const raw = localStorage.getItem(SALVAGE_RARITY_KEY);
    return isSalvageRarity(raw) ? raw : SALVAGE_RARITY_DEFAULT;
  } catch { return SALVAGE_RARITY_DEFAULT; }
}

/** Keeps the chosen threshold for the next popup and the next session. Failing to store it (private
 *  mode, quota) still leaves the choice in the running session, so nothing is lost for the player. */
export function saveSalvageRarity(value: SalvageRarity): void {
  try { localStorage.setItem(SALVAGE_RARITY_KEY, value); } catch { /* keep it for this session only */ }
}

/** The threshold the button steps to next: 일반 → 매직 → 레어 → 에픽 → 유니크 → 일반. */
export function nextSalvageRarity(value: SalvageRarity): SalvageRarity {
  const index = salvageRarities.indexOf(value);
  return salvageRarities[(index + 1) % salvageRarities.length];
}
