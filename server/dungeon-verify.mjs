/**
 * 던전 클리어 서버 검증 (작업 209).
 *
 * 던전 전투(`src/ui/dungeonBattle.ts` `DungeonBattle`)는 DOM을 쓰지 않는 순수 로직이라 서버가 그대로
 * 리플레이할 수 있다(월드보스 `replayBoss`와 같은 방식). 서버는 **그 계정 세이브로 그 층을 깰 수 있는지**
 * 와 **가장 빠른 클리어 시간**을 계산해, 들어온 클리어 주장이 그 시간만큼 실제로 흘렀는지 확인한다.
 * 리플레이 결과를 그대로 요구하지 않고 절반만 요구하는 이유: 실제 화면은 프레임 단위로 흔들리고,
 * 리플레이의 적 스폰 각도는 난수라 초 단위가 어긋날 수 있다. 그래서 "물리적으로 불가능한 속도"만 막는다.
 */
import { parseSave } from '../src/game/store.ts';
import { DungeonBattle } from '../src/ui/dungeonBattle.ts';

/** 어떤 층이든 이 시간보다 빨리 클리어할 수는 없다고 본다(방 입장·연출 포함). */
export const DUNGEON_MIN_SECONDS = 10;
/** 리플레이가 클리어하지 못한 세이브가 클리어를 주장할 때 요구하는 시간 — 근거가 약하므로 더 길게 본다. */
export const DUNGEON_UNVERIFIED_SECONDS = 30;

/** 그 세이브로 그 층을 리플레이했을 때의 결과와 걸린 시간(초). */
export function replayDungeonFloor(save, floor) {
  const battle = new DungeonBattle(parseSave(save, save?.accountId), floor);
  const limit = Math.ceil(90 * 20) + 20;
  for (let step = 0; step < limit && !battle.finished; step++) battle.advance(.05);
  return { outcome: battle.outcome, seconds: Math.round(battle.elapsed * 10) / 10 };
}

/**
 * 클리어 주장에 요구하는 최소 경과 초. `startedAt`(서버가 도전 시작을 받은 시각)부터 이만큼 흘러야
 * 기록을 올린다. 리플레이가 클리어 가능하면 그 시간의 절반, 아니면 보수적으로 더 긴 시간을 쓴다.
 */
export function requiredClearSeconds(save, floor) {
  const { outcome, seconds } = replayDungeonFloor(save, floor);
  if (outcome === 'clear' && Number.isFinite(seconds) && seconds > 0) return Math.max(DUNGEON_MIN_SECONDS, Math.round(seconds * .5));
  return DUNGEON_UNVERIFIED_SECONDS;
}
