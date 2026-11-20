import type { Save } from './store';

/**
 * 보스 업적 합산 (작업 208, 사용자 확정).
 *
 * 업적 `보스 처치`는 **모든 보스류를 하나로 센다** — 사냥터 층 보스, 필드 정예 몹, 던전 5·10층 보스,
 * 월드보스 도전/처치. 세이브에는 `bossKills` 하나만 남으므로, 각 화면이 보스를 잡은 그 순간 이 함수로
 * 한 번씩 더한다(같은 처치를 두 번 더하지 않도록 부르는 쪽이 시점을 지킨다).
 */
export function bossKillCount(save: Pick<Save, 'bossKills'>): number {
  const current = Number(save.bossKills);
  return Number.isFinite(current) && current > 0 ? Math.floor(current) : 0;
}
/** 보스 처치 1회를 세이브에 더한다. */
export function addBossKill(save: Pick<Save, 'bossKills'>): number {
  save.bossKills = bossKillCount(save) + 1;
  return save.bossKills;
}
/** 던전에서 보스가 나오는 층 — 5층마다(지금은 5·10층). */
export const DUNGEON_BOSS_FLOOR_STEP = 5;
export function isDungeonBossFloor(floor: number): boolean {
  const depth = Math.floor(Number(floor));
  return Number.isFinite(depth) && depth > 0 && depth % DUNGEON_BOSS_FLOOR_STEP === 0;
}
/** 던전 클리어가 보스 처치로 세지는가 — 5·10층 보스를 깼을 때만 1회. */
export function dungeonBossKills(floor: number, cleared: boolean): number {
  return cleared && isDungeonBossFloor(floor) ? 1 : 0;
}
