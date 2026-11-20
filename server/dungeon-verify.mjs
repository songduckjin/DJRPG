/**
 * 던전 클리어 서버 검증 (작업 209 → 210).
 *
 * 던전 전투(`src/ui/dungeonBattle.ts` `DungeonBattle`)는 DOM을 쓰지 않는 순수 로직이라 서버가 그대로
 * 리플레이할 수 있다(월드보스 `replayBoss`와 같은 방식). 서버는 **그 계정 세이브로 그 층을 깰 수 있는지**
 * 와 **가장 빠른 클리어 시간**을 계산해, 들어온 클리어 주장이 그 시간만큼 실제로 흘렀는지 확인한다.
 * 리플레이 결과를 그대로 요구하지 않고 절반만 요구하는 이유: 실제 화면은 프레임 단위로 흔들리고,
 * 리플레이의 적 스폰 각도는 난수라 초 단위가 어긋날 수 있다. 그래서 "물리적으로 불가능한 속도"만 막는다.
 *
 * 작업 211에서 던전이 **시간만 기다렸다가 submit하는 스크립트**로 뚫리던 구멍을 막았다:
 *  ① `start`가 시드(난수)와 서버 시각을 함께 발급하고(`server/dungeon.mjs`), 클라이언트는 그 시드로
 *     전투를 돌린 뒤 결과 요약(`won`·`steps`·`heroHp`·`enemyHp`·`slain`·`digest`)을 `submit`에 싣는다.
 *  ② 서버는 **같은 시드·같은 고정 스텝**(`DUNGEON_STEP`)으로 전투를 다시 돌려, 그 층을 실제로 깰 수 있는지
 *     (`outcome === 'clear'`)와 클라이언트가 보낸 요약이 그 결과와 맞는지 확인한다.
 *  그래서 시간만 흘려보낸 요청은 어떤 체력·스텝 수를 적어야 할지 알 수 없어 통과하지 못한다.
 *
 * 리플레이가 그 층을 깨지 못하는 세이브(`unverified`)는 예전처럼 더 긴 시간(`DUNGEON_UNVERIFIED_SECONDS`)만
 * 요구하고 요약의 형식만 본다 — 브라우저 엔진(JavaScriptCore·V8)의 부동소수 계산 차이로 **정상 클리어가
 * 거부되는 일**을 만들지 않기 위해서다. 이 경로는 예전과 같은 관대함이라 새 구멍이 아니다.
 */
import { parseSave } from '../src/game/store.ts';
import { DUNGEON_STEP, DUNGEON_MAX_STEPS, dungeonBattleSummary, runDungeonBattle } from '../src/ui/dungeonBattle.ts';

/** 어떤 층이든 이 시간보다 빨리 클리어할 수는 없다고 본다(방 입장·연출 포함). */
export const DUNGEON_MIN_SECONDS = 10;
/** 리플레이가 클리어하지 못한 세이브가 클리어를 주장할 때 요구하는 시간 — 근거가 약하므로 더 길게 본다. */
export const DUNGEON_UNVERIFIED_SECONDS = 30;
/** 서버 리플레이와 클라이언트 요약을 대조할 때 허용하는 오차(비율). 브라우저 엔진 차이를 흡수하는 폭이다. */
export const DUNGEON_SUMMARY_TOLERANCE = .12;
/** 시드를 받지 못한 예전 도전(시드 없는 리플레이)에 쓰는 기본 시드. */
export const DUNGEON_DEFAULT_SEED = 0;

export { DUNGEON_STEP, DUNGEON_MAX_STEPS };

/** 그 세이브로 그 층을 `seed`로 리플레이했을 때의 결과·스텝 수·요약. */
export function replayDungeonFloor(save, floor, seed = DUNGEON_DEFAULT_SEED) {
  const battle = runDungeonBattle(parseSave(save, save?.accountId), floor, seed);
  return {
    outcome: battle.outcome,
    seconds: Math.round(battle.elapsed * 10) / 10,
    steps: battle.steps,
    summary: dungeonBattleSummary(battle),
    clearable: battle.outcome === 'clear'
  };
}

/** 클리어 주장에 요구하는 최소 경과 초. 리플레이가 클리어 가능하면 그 시간의 절반, 아니면 보수적으로 더 긴 시간. */
export function requiredClearSeconds(save, floor, seed = DUNGEON_DEFAULT_SEED) {
  const { outcome, seconds } = replayDungeonFloor(save, floor, seed);
  if (outcome === 'clear' && Number.isFinite(seconds) && seconds > 0) return Math.max(DUNGEON_MIN_SECONDS, Math.round(seconds * .5));
  return DUNGEON_UNVERIFIED_SECONDS;
}

const int = value => (Number.isSafeInteger(value) ? value : Number.isFinite(Number(value)) ? Math.floor(Number(value)) : NaN);

/**
 * 클라이언트가 보낸 클리어 요약을 서버 리플레이와 대조한다.
 *
 * 돌려주는 값:
 *  - `ok`: 기록해도 되는 클리어인지
 *  - `code`: 거부 사유(`DUNGEON_TOO_FAST`·`DUNGEON_SUMMARY_REQUIRED`·`DUNGEON_SUMMARY_MISMATCH`)
 *  - `verified`: 서버 리플레이가 그 층을 깰 수 있고 요약이 그 결과와 맞았는지(순위 근거의 강도)
 *  - `diagnostics`: 로그에 남길 값(스텝 차이·digest 일치 여부) — 세이브 본문·토큰은 넣지 않는다.
 */
export function verifyDungeonClear({ save, floor, seed, summary, elapsedSeconds }) {
  const replay = replayDungeonFloor(save, floor, seed);
  const required = replay.clearable ? Math.max(DUNGEON_MIN_SECONDS, Math.round(replay.seconds * .5)) : DUNGEON_UNVERIFIED_SECONDS;
  const diagnostics = {
    outcome: replay.outcome,
    replaySteps: replay.steps,
    required,
    elapsed: Math.round(Number(elapsedSeconds) || 0),
    clearable: replay.clearable,
    verified: false,
    digestMatch: false,
    stepDelta: null
  };
  if (!(Number(elapsedSeconds) + 1 >= required)) return { ok: false, code: 'DUNGEON_TOO_FAST', required, replay, diagnostics };
  if (!summary || typeof summary !== 'object' || summary.won !== true) return { ok: false, code: 'DUNGEON_SUMMARY_REQUIRED', required, replay, diagnostics };
  const steps = int(summary.steps);
  if (!Number.isSafeInteger(steps) || steps < 1 || steps > DUNGEON_MAX_STEPS) return { ok: false, code: 'DUNGEON_SUMMARY_MISMATCH', required, replay, diagnostics };
  // 주장한 전투 시간(스텝 × 고정 스텝)이 요구 시간보다 짧으면, 시간을 흘려보낸 요청이거나 서버가 아는 것보다
  // 빠른 전투다. 어느 쪽이든 기록할 근거가 없다.
  if (steps * DUNGEON_STEP + 1 < required) return { ok: false, code: 'DUNGEON_SUMMARY_MISMATCH', required, replay, diagnostics };
  const heroHp = Number(summary.heroHp);
  if (!Number.isFinite(heroHp) || heroHp <= 0) return { ok: false, code: 'DUNGEON_SUMMARY_MISMATCH', required, replay, diagnostics };
  diagnostics.digestMatch = typeof summary.digest === 'string' && summary.digest === replay.summary.digest;
  if (!replay.clearable) {
    // 리플레이가 못 깬 세이브: 예전처럼 형식만 보고 더 긴 시간을 요구한다(엔진 차이로 정상 클리어를 막지 않는다).
    return { ok: true, verified: false, required, replay, diagnostics };
  }
  diagnostics.stepDelta = steps - replay.steps;
  const stepTolerance = Math.max(12, Math.round(replay.steps * DUNGEON_SUMMARY_TOLERANCE));
  if (Math.abs(steps - replay.steps) > stepTolerance) return { ok: false, code: 'DUNGEON_SUMMARY_MISMATCH', required, replay, diagnostics };
  const hpTolerance = Math.max(2, Math.round(replay.summary.heroHpMax * DUNGEON_SUMMARY_TOLERANCE));
  if (Math.abs(heroHp - replay.summary.heroHp) > hpTolerance) return { ok: false, code: 'DUNGEON_SUMMARY_MISMATCH', required, replay, diagnostics };
  if (Number.isFinite(Number(summary.enemyHp)) && Math.abs(Number(summary.enemyHp) - replay.summary.enemyHp) > hpTolerance) return { ok: false, code: 'DUNGEON_SUMMARY_MISMATCH', required, replay, diagnostics };
  diagnostics.verified = true;
  return { ok: true, verified: true, required, replay, diagnostics };
}
