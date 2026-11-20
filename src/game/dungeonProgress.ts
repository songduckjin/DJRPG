import { DUNGEON_MAX_FLOOR, type Save } from './store';

/** 계정 세이브에 남은 던전 최고 클리어 층(0~10). 예전 세이브는 0층이다. */
export function dungeonClearedFloor(save: Pick<Save, 'dungeonFloor'>): number {
  const floor = Number(save.dungeonFloor ?? 0);
  return Number.isFinite(floor) ? Math.max(0, Math.min(DUNGEON_MAX_FLOOR, Math.floor(floor))) : 0;
}

/** 그 층을 처음 깬 시각. 순위에서 같은 층일 때 누가 먼저인지 가리는 근거다. */
export function dungeonClearTime(save: Pick<Save, 'dungeonClearAt'>): number {
  const at = Number(save.dungeonClearAt ?? 0);
  return Number.isFinite(at) && at > 0 ? Math.floor(at) : 0;
}

/**
 * 클리어를 세이브에 적는다. 최고층은 오르기만 하고, 같은 층의 최초 클리어 시각은 그대로 둔다.
 * 적을 것이 없으면 false를 돌려주므로 호출한 쪽이 저장 요청을 아낄 수 있다.
 */
export function recordDungeonClear(save: Save, floor: number, now = Date.now()): boolean {
  if (!Number.isFinite(floor) || floor < 1) return false;
  const target = Math.min(DUNGEON_MAX_FLOOR, Math.floor(floor));
  const previous = dungeonClearedFloor(save);
  if (target > previous) {
    save.dungeonFloor = target;
    save.dungeonClearAt = Math.max(1, Math.floor(now));
    return true;
  }
  if (target === previous) {
    // 예전 세이브처럼 층만 있고 시각이 비어 있으면 지금 시각으로 한 번만 채운다.
    if (!dungeonClearTime(save)) {
      save.dungeonClearAt = Math.max(1, Math.floor(now));
      return true;
    }
  }
  return false;
}
