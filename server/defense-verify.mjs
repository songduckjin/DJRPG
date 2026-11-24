/**
 * 무한 방어전 서버 검증 (2026-11-24).
 *
 * 기록의 주인은 클라이언트가 보낸 숫자가 아니라 **서버가 검증한 submit**이다. 판은 `start`가 발급한
 * 시드로 고정 스텝(`DEFENSE_STEP`)에만 전진하므로, 서버가 같은 시드·같은 스텝 수로 다시 돌려 대조할 수 있다.
 * 세 단계로 막는다.
 *
 *  ① **물리적 최소 시간**(모든 submit) — 적은 스폰 간격보다 빨리 나올 수 없고, 그 스테이지의 적 체력 합을
 *     서버가 계산한 최대 DPS(`offlineHeroDps`)로 나눈 시간보다 빨리 끝날 수도 없다.
 *     `required = max(스폰 하한 × 0.75, 체력 합 / maxDps × 0.9)`.
 *  ② **요약 형식·스텝 대조**(모든 submit) — 본문과 요약의 스테이지 일치, 스텝 수 = 전투 시간, 처치 수가
 *     그 스테이지의 적 수 범위 안, 남은 체력·digest 형식.
 *  ③ **고정 스텝 리플레이**(짧은 판만) — 같은 시드·같은 스텝으로 다시 돌려 스테이지·처치 수를 ±12% 안에서
 *     맞춘다. 무한 모드는 판이 길어 리플레이 CPU가 크므로 2분(7,200스텝)을 넘는 판은 ①②만 보고
 *     `verified = 0`으로 남긴다(랭킹에는 그대로 오른다).
 *
 * 서버 리플레이는 `src/game/dungeon/defenseBattle.ts`의 순수 로직을 그대로 쓴다 — UI를 import하지 않는다.
 */
import { parseSave } from '../src/game/store.ts';
import {
  DEFENSE_STEP, DEFENSE_MAX_STEPS, DEFENSE_RUN_SECONDS, defenseBattleSummary, runDefenseBattle,
  defenseSpawnFloorSeconds, defenseStageHpSum, defenseStageEnemyCount, DEFENSE_MAX_STAGE
} from '../src/game/dungeon/defenseBattle.ts';
import { offlineHeroDps } from '../src/game/offline.ts';

/** 어떤 판이든 이 시간보다 빨리 끝날 수는 없다(판 시작 응답·연출 포함). */
export const DEFENSE_MIN_SECONDS = 5;
/** 서버 리플레이의 CPU 상한 — 2분 판(7,200스텝)까지만 다시 돌린다. */
export const DEFENSE_REPLAY_STEP_CAP = 60 * 120;
/** 리플레이·요약 대조의 허용 오차(비율). 브라우저 엔진 차이를 흡수하는 폭이다(던전과 같은 값). */
export const DEFENSE_SUMMARY_TOLERANCE = .12;

export { DEFENSE_STEP, DEFENSE_MAX_STEPS, DEFENSE_MAX_STAGE };

const int = value => (Number.isSafeInteger(value) ? value : Number.isFinite(Number(value)) ? Math.floor(Number(value)) : NaN);

/** 그 스테이지에 도달하려면 최소한 이만큼은 걸린다(초). */
export function requiredDefenseSeconds(save, stage) {
  const parsed = parseSave(save, save?.accountId);
  const spawnFloor = defenseSpawnFloorSeconds(stage) * .75;
  const maxDps = Math.max(1, offlineHeroDps(parsed));
  const hpFloor = defenseStageHpSum(stage) / maxDps * .9;
  return Math.max(DEFENSE_MIN_SECONDS, Math.round(Math.max(spawnFloor, hpFloor)));
}

/** 그 세이브로 그 시드의 판을 `steps` 스텝까지 리플레이한다. */
export function replayDefenseRun(save, seed, steps) {
  const parsed = parseSave(save, save?.accountId);
  const battle = runDefenseBattle(parsed, seed, Math.max(1, Math.min(DEFENSE_MAX_STEPS, steps)));
  return { stage: battle.stage, kills: battle.world.slain, steps: battle.steps, summary: defenseBattleSummary(battle), finished: battle.finished };
}

/** 그 스테이지까지 처치해야 하는 최소·최대 마리 수 — 도달했다면 앞 스테이지는 모두 막았다. */
export function defenseKillBounds(stage) {
  let cleared = 0;
  for (let s = 1; s < stage; s++) cleared += defenseStageEnemyCount(s);
  return { lower: cleared, upper: cleared + defenseStageEnemyCount(stage) };
}

/**
 * 클라이언트가 보낸 판 결과를 검증한다.
 *
 * 돌려주는 값:
 *  - `ok`: 기록해도 되는 판인지
 *  - `code`: 거부 사유(`DEFENSE_TOO_FAST`·`DEFENSE_SUMMARY_REQUIRED`·`DEFENSE_SUMMARY_MISMATCH`)
 *  - `verified`: 리플레이까지 통과했는지(순위 근거의 강도)
 *  - `diagnostics`: 로그에 남길 값 — 세이브 본문·토큰은 넣지 않는다.
 */
export function verifyDefenseRun({ save, stage, seed, summary, elapsedSeconds }) {
  const parsed = parseSave(save, save?.accountId);
  const depth = int(stage);
  const diagnostics = {
    stage: Number.isFinite(depth) ? depth : null, required: 0, elapsed: Math.round(Number(elapsedSeconds) || 0),
    replayStage: null, replayKills: null, stepDelta: null, digestMatch: false, verified: false, replayed: false
  };
  if (!Number.isSafeInteger(depth) || depth < 1 || depth > DEFENSE_MAX_STAGE) return { ok: false, code: 'DEFENSE_SUMMARY_MISMATCH', diagnostics };
  const required = requiredDefenseSeconds(parsed, depth);
  diagnostics.required = required;
  if (!(Number(elapsedSeconds) + 2 >= required)) return { ok: false, code: 'DEFENSE_TOO_FAST', required, diagnostics };
  if (!summary || typeof summary !== 'object') return { ok: false, code: 'DEFENSE_SUMMARY_REQUIRED', required, diagnostics };
  if (int(summary.stages) !== depth) return { ok: false, code: 'DEFENSE_SUMMARY_MISMATCH', required, diagnostics };
  const steps = int(summary.steps);
  if (!Number.isSafeInteger(steps) || steps < 1 || steps > DEFENSE_MAX_STEPS) return { ok: false, code: 'DEFENSE_SUMMARY_MISMATCH', required, diagnostics };
  const seconds = Number(summary.seconds);
  // 고정 스텝으로 실제로 돌린 판인가 — 스텝 수와 전투 시간이 2초 안에서 맞아야 한다.
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > DEFENSE_RUN_SECONDS + 1) return { ok: false, code: 'DEFENSE_SUMMARY_MISMATCH', required, diagnostics };
  if (Math.abs(steps * DEFENSE_STEP - seconds) > 2) return { ok: false, code: 'DEFENSE_SUMMARY_MISMATCH', required, diagnostics };
  // 서버가 흘려보낸 시간보다 긴 전투는 없다(새로고침으로 시작 시각을 되돌릴 수 없다).
  if (seconds > Number(elapsedSeconds) + 3) return { ok: false, code: 'DEFENSE_SUMMARY_MISMATCH', required, diagnostics };
  const { lower, upper } = defenseKillBounds(depth);
  const kills = int(summary.kills);
  if (!Number.isSafeInteger(kills) || kills < lower || kills > upper) return { ok: false, code: 'DEFENSE_SUMMARY_MISMATCH', required, diagnostics };
  const heroHp = Number(summary.heroHp), heroHpMax = Number(summary.heroHpMax);
  if (!Number.isFinite(heroHpMax) || heroHpMax <= 0 || !Number.isFinite(heroHp) || heroHp < 0 || heroHp > heroHpMax) return { ok: false, code: 'DEFENSE_SUMMARY_MISMATCH', required, diagnostics };
  if (!/^[0-9a-f]{8}$/.test(String(summary.digest ?? ''))) return { ok: false, code: 'DEFENSE_SUMMARY_MISMATCH', required, diagnostics };
  if (summary.items !== undefined && (!Number.isSafeInteger(int(summary.items)) || int(summary.items) < 0)) return { ok: false, code: 'DEFENSE_SUMMARY_MISMATCH', required, diagnostics };
  // ③ 고정 스텝 리플레이 — 짧은 판만. 긴 판은 ①②로만 판정하고 verified=0으로 남긴다.
  if (steps > DEFENSE_REPLAY_STEP_CAP) return { ok: true, verified: false, required, diagnostics };
  const replay = replayDefenseRun(parsed, Number(seed) >>> 0, steps);
  diagnostics.replayed = true;
  diagnostics.replayStage = replay.stage;
  diagnostics.replayKills = replay.kills;
  diagnostics.stepDelta = steps - replay.steps;
  diagnostics.digestMatch = replay.summary.digest === String(summary.digest);
  const stageTolerance = 1;
  const killTolerance = Math.max(3, Math.round(Math.max(1, replay.kills) * DEFENSE_SUMMARY_TOLERANCE));
  if (Math.abs(replay.stage - depth) > stageTolerance || Math.abs(replay.kills - kills) > killTolerance) return { ok: false, code: 'DEFENSE_SUMMARY_MISMATCH', required, diagnostics };
  diagnostics.verified = true;
  return { ok: true, verified: true, required, diagnostics };
}
