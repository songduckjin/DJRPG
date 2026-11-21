// Auto-salvage (작업 196): a switch that turns each recovered piece at or below the chosen grade
// straight into gold and stones, without it ever reaching the bag.
//
// 작업 254(2026-11-21)부터는 **접속 사냥과 방치 사냥 모두**에 적용된다. 필드는 `world.ts`가 주운
// 그 자리에서, 던전은 `dungeonRewards.ts`가, 방치는 `game/offline.ts`의 정산이 같은 규칙
// (`inventory.ts` `autoSalvageRecovered`)으로 분해한다 — 방치 보상도 가방을 채우지 않고 금화·강화석이
// 되며, 보상 팝업이 분해된 개수와 환산량을 함께 보여 준다(`offlineModal.ts`).
//
// What it will never take: a skill book, a locked piece, anything above the chosen grade, a piece for
// a slot nothing is worn in, and anything that beats what is worn — the same protection 일괄 분해 asks
// about (`inventory.ts` `autoSalvageBlock`).

/** Where the switch is kept between sessions. */
export const AUTO_SALVAGE_KEY = 'djrpg-auto-salvage';
/** Shown when the switch is turned on: it works while connected and while away. */
export const AUTO_SALVAGE_ON_NOTICE = '자동 분해가 켜졌습니다. 접속·방치 사냥 모두 적용됩니다.';
export const AUTO_SALVAGE_OFF_NOTICE = '자동 분해를 껐습니다.';
/** The small line under the switch, so the limit is readable after the toast is gone. */
export const AUTO_SALVAGE_HINT = '접속·방치 사냥 모두 적용 · 방치 보상도 분해됩니다';

/** The switch as the player left it; off when nothing was ever stored or storage is unavailable. */
export function readAutoSalvage(): boolean {
  try { return localStorage.getItem(AUTO_SALVAGE_KEY) === 'on'; } catch { return false; }
}

export function saveAutoSalvage(on: boolean): void {
  try { localStorage.setItem(AUTO_SALVAGE_KEY, on ? 'on' : 'off'); } catch { /* this session only */ }
}
