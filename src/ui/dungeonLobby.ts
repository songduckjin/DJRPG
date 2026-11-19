export type DungeonRanking = { name: string; clearedFloor: number; clearedAt: number; mine?: boolean };
export function dungeonFloorInfo(floor: number) {
  const current = Math.max(1, Math.floor(floor));
  return { floor: current, seconds: 90, boss: current % 5 === 0, waves: current % 5 === 0 ? [1] : [3, 3, 1] };
}
export function dungeonRankings(records: DungeonRanking[]) {
  return records.filter(row => row.clearedFloor > 0).slice().sort((a,b) => b.clearedFloor - a.clearedFloor || a.clearedAt - b.clearedAt);
}
// Lobby prototype only: no save/progression or simulated live ranking.
export class DungeonLobby {
  tab: 'challenge' | 'ranking' = 'challenge';
  clearedFloor = 0;
  records: DungeonRanking[] = [];
  get floor() { return dungeonFloorInfo(this.clearedFloor + 1); }
}
