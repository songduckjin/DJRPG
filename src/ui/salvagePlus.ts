// How far down live auto-salvage may reach from 21층 (작업 203 → 21~40층 확장).
//
// A drop can carry a 강화 단계 (`+0` ~ `+7`) from 10층 단위로 열리고, 21층부터는 `+2`가 실제로
// 보인다. 그런 고단계 장비는 지금 낀 장비보다 약해도 경매장에 팔 수 있는 값이므로, 자동 분해가 등급만
// 보고 지워 버리면 손해다. 그래서 플레이어가 **`+N까지`**를 고르고, 그 단계까지(`+0 ~ +N`)만 자동
// 분해되며 그 위는 가방에 남는다 — 기본값 `+4까지`면 `+5`부터 보관.
//
// 20층 이하에서는 어떤 장비도 `+0`(맨 아래 두 구간)이라 이 상한이 의미가 없다. 그 구간에서는 설정이
// 보이지도, 적용되지도 않고 예전처럼 등급·장착품 비교만 동작한다(`inventory.ts` `AUTO_SALVAGE_PLUS_FLOOR`).
//
// 고른 값은 등급 기준(`salvageRarity.ts`)과 같은 방식으로 기기에 남긴다 — 창을 닫거나 새로고침해도 무엇이
// 지워질지 조용히 바뀌면 안 되기 때문이다. 세이브를 새로 시작하면 `store.ts` `clearLegacySave`가 함께 지운다.

import { MAX_PLUS } from '../game/items';
import { AUTO_SALVAGE_PLUS_FLOOR } from '../game/inventory';

/** Where the player's own cap is kept between sessions. */
export const SALVAGE_PLUS_KEY = 'djrpg-auto-salvage-plus';
/** Until the player picks one: `+4까지`, so `+5` 이상 희귀 장비는 아무 설정 없이도 남는다. */
export const SALVAGE_PLUS_DEFAULT = 4;
/** Every cap the player can choose, `+0까지` ~ `+7까지`. */
export const salvagePlusValues: readonly number[] = Array.from({ length: MAX_PLUS + 1 }, (_, value) => value);

export function isSalvagePlus(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_PLUS;
}

/** The label the player reads: `+0까지` ~ `+7까지`. */
export function salvagePlusLabel(value: number): string {
  return `+${isSalvagePlus(value) ? value : SALVAGE_PLUS_DEFAULT}까지`;
}

/** Is the filter live at this save's highest floor? 21층에 닿기 전에는 `+단계`가 붙을 수 없으므로 숨긴다. */
export function salvagePlusUnlocked(maxFloor: number): boolean {
  return maxFloor >= AUTO_SALVAGE_PLUS_FLOOR;
}

/** The cap the player last set, or `+4까지` before they ever set one. A damaged or missing entry (private
 *  mode, cleared storage, an old build) is the default rather than an error. */
export function readSalvagePlus(): number {
  try {
    const raw = localStorage.getItem(SALVAGE_PLUS_KEY);
    if (raw === null || raw.trim() === '') return SALVAGE_PLUS_DEFAULT;
    const value = Number(raw);
    return isSalvagePlus(value) ? value : SALVAGE_PLUS_DEFAULT;
  } catch { return SALVAGE_PLUS_DEFAULT; }
}

/** Keeps the chosen cap for the next popup and the next session. Failing to store it (private mode, quota)
 *  still leaves the choice in the running session, so nothing is lost for the player. */
export function saveSalvagePlus(value: number): void {
  const safe = isSalvagePlus(value) ? value : SALVAGE_PLUS_DEFAULT;
  try { localStorage.setItem(SALVAGE_PLUS_KEY, String(safe)); } catch { /* keep it for this session only */ }
}
