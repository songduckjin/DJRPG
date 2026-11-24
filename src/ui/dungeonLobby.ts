import type { DungeonLive, DungeonRecord } from '../game/dungeonLive';
import { dungeonClearedFloor, dungeonClearTime, recordDungeonClear } from '../game/dungeonProgress';
import { DUNGEON_SECONDS } from '../game/dungeon/battle';
import { DUNGEON_MAX_FLOOR, type Save } from '../game/store';
export { DUNGEON_MAX_FLOOR } from '../game/store';
export type DungeonRanking = DungeonRecord;
/** 로비가 그리는 한 줄: 지금 도전할 층과, 마지막 층을 깬 뒤의 커밍순 안내. */
export type DungeonLobbyStatus = { completed: boolean; headline: string; detail: string; button: string; badge: string };
export function dungeonFloorInfo(floor: number) {
  const current = Math.min(DUNGEON_MAX_FLOOR,Math.max(1, Math.floor(floor)));
  return { floor: current, seconds: DUNGEON_SECONDS, boss: current % 5 === 0, waves: current % 5 === 0 ? [1] : [3, 3, 1] };
}
export function dungeonRankings(records: DungeonRanking[]) {
  return records.filter(row => row.clearedFloor > 0).slice().sort((a,b) => b.clearedFloor - a.clearedFloor || a.clearedAt - b.clearedAt);
}
// 최고층을 모두 깨면 다음 층은 아직 없다: 로비와 결과창이 같은 문구로 커밍순을 알린다.
export function dungeonLobbyStatus(clearedFloor: number): DungeonLobbyStatus {
  const floor = dungeonFloorInfo(clearedFloor + 1), completed = clearedFloor >= DUNGEON_MAX_FLOOR;
  return completed
    ? { completed, headline: `${DUNGEON_MAX_FLOOR}층 정복 완료`, detail: `${DUNGEON_MAX_FLOOR + 1}층부터의 더 깊은 던전은 준비 중입니다.`, button: '다음 층 준비 중', badge: 'Coming Soon' }
    : { completed, headline: `제 ${floor.floor} 층`, detail: '', button: '도전하기', badge: '' };
}
// 로비의 진행은 계정 세이브가 소유한다. 새로고침해도 이 값에서 되살아난다.
export class DungeonLobby {
  /** 첫 화면은 **던전 허브**(두 모드 선택)다. 카드를 고르면 기존 화면(`endless`)이나 무한 방어전으로 간다. */
  mode: 'hub' | 'endless' | 'defense' = 'hub';
  tab: 'challenge' | 'ranking' = 'challenge';
  clearedFloor = 0;
  clearedAt = 0;
  /** 서버에서 받은 최근 순위(던전 순위 탭이 그대로 그린다). */
  records: DungeonRanking[] = [];
  live?: DungeonLive;
  get completed() { return this.clearedFloor >= DUNGEON_MAX_FLOOR; }
  get floor() { return dungeonFloorInfo(this.clearedFloor + 1); }
  get status() { return dungeonLobbyStatus(this.clearedFloor); }
  load(save: Pick<Save,'dungeonFloor'|'dungeonClearAt'>): void {
    this.clearedFloor = dungeonClearedFloor(save);
    this.clearedAt = dungeonClearTime(save);
  }
  /** 서버 순위를 로비 상태에 옮겨 적는다(탭 렌더가 이 목록을 쓴다). */
  syncStanding(records?: DungeonRecord[]): void { this.records = records ? records.slice() : []; }
  /** 클리어를 세이브와 로비 상태에 함께 적는다. 세이브가 바뀌었으면 true. */
  clear(save: Save, floor: number, now = Date.now()): boolean {
    const changed = recordDungeonClear(save, floor, now);
    this.load(save);
    return changed;
  }
}
