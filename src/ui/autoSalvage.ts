// Live auto-salvage (작업 196): a switch that turns each recovered piece at or below the chosen grade
// straight into gold and stones, without it ever reaching the bag.
//
// It only ever runs while the player is hunting in the field — never on offline rewards, which are
// settled by `game/offline.ts` from a saved timestamp and must keep every piece rolled for that time.
// That is why the switch says so out loud when it is turned on, and why the stored value is a plain
// on/off (아무것도 저장되지 않았으면 꺼진 상태) rather than something that could be mistaken for a
// permanent sweep.
//
// What it will never take: a skill book, a locked piece, anything above the chosen grade, a piece for
// a slot nothing is worn in, and anything that beats what is worn — the same protection 일괄 분해 asks
// about (`inventory.ts` `autoSalvageBlock`).

/** Where the switch is kept between sessions. */
export const AUTO_SALVAGE_KEY = 'djrpg-auto-salvage';
/** Shown when the switch is turned on: it works while connected, and only there. */
export const AUTO_SALVAGE_ON_NOTICE = '자동 분해가 켜졌습니다. 접속 중에만 적용됩니다.';
export const AUTO_SALVAGE_OFF_NOTICE = '자동 분해를 껐습니다.';
/** The small line under the switch, so the limit is readable after the toast is gone. */
export const AUTO_SALVAGE_HINT = '접속 중 사냥에서만 적용 · 오프라인 보상은 그대로 보관';

/** The switch as the player left it; off when nothing was ever stored or storage is unavailable. */
export function readAutoSalvage(): boolean {
  try { return localStorage.getItem(AUTO_SALVAGE_KEY) === 'on'; } catch { return false; }
}

export function saveAutoSalvage(on: boolean): void {
  try { localStorage.setItem(AUTO_SALVAGE_KEY, on ? 'on' : 'off'); } catch { /* this session only */ }
}
