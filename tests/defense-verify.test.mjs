import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const {
  verifyDefenseRun, requiredDefenseSeconds, replayDefenseRun, defenseKillBounds,
  DEFENSE_MIN_SECONDS, DEFENSE_REPLAY_STEP_CAP
} = await import('../server/defense-verify.mjs');
const {
  DefenseBattle, DEFENSE_STEP, DEFENSE_MAX_STEPS, defenseBattleSummary
} = await import('../src/game/dungeon/defenseBattle.ts');
const { freshSave } = await import('../src/game/store.ts');

const armed = (level = 17, attack = 120, defense = 400) => {
  const save = freshSave('male', 'warrior');
  save.level = level;
  save.learned = ['slash2'];
  save.quickSlots = ['slash2', null, null];
  save.skillLevels = { slash2: 5 };
  save.equipment = {
    weapon: { id: 'verify-w', name: '시험 검', slot: 'weapon', rarity: 'rare', stats: { attack }, plus: 0 },
    armor: { id: 'verify-a', name: '시험 갑옷', slot: 'armor', rarity: 'rare', stats: { defense, health: 600 }, plus: 0 }
  };
  return save;
};
/** 실제 플레이처럼 그 시드로 끝까지 돌린 결과(클라이언트가 submit에 싣는 값). */
const play = (save, seed) => {
  const battle = new DefenseBattle(save, seed);
  while (!battle.finished && battle.steps < DEFENSE_MAX_STEPS) battle.advance(DEFENSE_STEP);
  return { battle, summary: defenseBattleSummary(battle) };
};

test('최소 시간: 스폰 하한만으로도 걸리는 시간보다 빠른 주장은 거부한다', () => {
  const save = armed();
  const required = requiredDefenseSeconds(save, 3);
  assert.ok(required >= DEFENSE_MIN_SECONDS);
  const fake = { stages: 3, kills: 27, seconds: 5, steps: 300, heroHp: 10, heroHpMax: 1000, items: 0, digest: '00000000' };
  const verdict = verifyDefenseRun({ save, stage: 3, seed: 1, summary: fake, elapsedSeconds: 1 });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'DEFENSE_TOO_FAST');
});

test('요약이 없으면 거부하고, 본문과 요약의 스테이지가 다르면 거부한다', () => {
  const save = armed();
  assert.equal(verifyDefenseRun({ save, stage: 2, seed: 1, summary: undefined, elapsedSeconds: 600 }).code, 'DEFENSE_SUMMARY_REQUIRED');
  const summary = { stages: 5, kills: 20, seconds: 300, steps: 18000, heroHp: 100, heroHpMax: 1000, items: 0, digest: 'abcdef12' };
  assert.equal(verifyDefenseRun({ save, stage: 4, seed: 1, summary, elapsedSeconds: 600 }).code, 'DEFENSE_SUMMARY_MISMATCH');
});

test('스텝 수·전투 시간·처치 수·체력·digest 형식이 어긋나면 거부한다', () => {
  const save = armed();
  const base = { stages: 2, kills: 9, seconds: 60, steps: 3600, heroHp: 100, heroHpMax: 1000, items: 0, digest: 'deadbeef' };
  const bad = (patch) => verifyDefenseRun({ save, stage: 2, seed: 1, summary: { ...base, ...patch }, elapsedSeconds: 600 }).code;
  assert.equal(bad({ steps: 999999 }), 'DEFENSE_SUMMARY_MISMATCH', '스텝 수가 전투 시간과 맞지 않는다');
  assert.equal(bad({ kills: 0 }), 'DEFENSE_SUMMARY_MISMATCH', '스테이지에 도달했는데 처치가 0일 수 없다');
  assert.equal(bad({ kills: 10_000 }), 'DEFENSE_SUMMARY_MISMATCH', '그 스테이지의 적 수보다 많이 처치할 수 없다');
  assert.equal(bad({ heroHpMax: 0 }), 'DEFENSE_SUMMARY_MISMATCH');
  assert.equal(bad({ heroHp: 2000 }), 'DEFENSE_SUMMARY_MISMATCH');
  assert.equal(bad({ digest: 'zzzz' }), 'DEFENSE_SUMMARY_MISMATCH');
  assert.equal(bad({ seconds: 4000, steps: 240000 }), 'DEFENSE_SUMMARY_MISMATCH', '30분 상한을 넘는 판은 없다');
});

test('실제로 돌린 판의 요약은 통과하고, 같은 시드 리플레이와 일치해 verified가 선다', () => {
  // 1레벨 캐릭터의 판은 2분(리플레이 상한) 안에서 끝난다 — 이 판은 서버가 끝까지 다시 돌려 본다.
  const save = armed(1, 6, 5);
  const { battle, summary } = play(save, 1234);
  assert.ok(summary.steps <= DEFENSE_REPLAY_STEP_CAP, '이 판은 리플레이 대상(2분) 안이다');
  const elapsed = Math.max(600, summary.seconds + 10);
  const verdict = verifyDefenseRun({ save, stage: summary.stages, seed: 1234, summary, elapsedSeconds: elapsed });
  assert.equal(verdict.ok, true, JSON.stringify(verdict.diagnostics));
  assert.equal(verdict.verified, true);
  assert.equal(verdict.diagnostics.digestMatch, true);
  // 같은 시드로 다시 돌린 결과가 그대로 나온다.
  const replay = replayDefenseRun(save, 1234, summary.steps);
  assert.equal(replay.stage, battle.stage);
  assert.equal(replay.kills, battle.world.slain);
  // 처치 범위도 스테이지에서 계산한 값과 맞는다.
  const bounds = defenseKillBounds(summary.stages);
  assert.ok(summary.kills >= bounds.lower && summary.kills <= bounds.upper);
});

test('벽 구간(16웨이브 이상) 판도 서버 최소 시간을 넘긴다 — 정상 판이 TOO_FAST로 거부되지 않는다', () => {
  // 레벨 30에 가까운 세이브 — 개편 뒤에는 20~21웨이브에서 쓰러진다(벽 구간을 지나간다).
  const save = armed(30, 4200, 2600);
  const { summary } = play(save, 4242);
  assert.ok(summary.stages > 16, `벽 구간에 도달한다(${summary.stages}웨이브)`);
  const required = requiredDefenseSeconds(save, summary.stages);
  assert.ok(required <= summary.seconds, `최소 시간 ${required}초 ≤ 실제 ${Math.round(summary.seconds)}초`);
  const verdict = verifyDefenseRun({ save, stage: summary.stages, seed: 4242, summary, elapsedSeconds: summary.seconds + 2 });
  assert.equal(verdict.ok, true, JSON.stringify(verdict.diagnostics));
});

test('스테이지를 속이면(같은 요약으로 더 깊은 스테이지 주장) 거부한다', () => {
  const save = armed(1, 6, 5);
  const { summary } = play(save, 77);
  const lie = { ...summary, stages: summary.stages + 5, kills: summary.kills };
  const verdict = verifyDefenseRun({ save, stage: lie.stages, seed: 77, summary: lie, elapsedSeconds: 1800 });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'DEFENSE_SUMMARY_MISMATCH');
});

test('2분이 넘는 긴 판은 리플레이 없이 형식·최소 시간만 보고 verified=0으로 남긴다', () => {
  const save = armed(1, 6, 5);
  const stage = 3;
  const seconds = 300;
  const steps = Math.round(seconds * 60);
  const { summary } = play(save, 55);
  // 형식은 실제 판과 같은 모양으로, 스텝만 리플레이 상한을 넘기는 긴 판으로 바꾼다.
  const bounds = defenseKillBounds(stage);
  const long = { ...summary, stages: stage, kills: bounds.lower + 2, seconds, steps };
  const verdict = verifyDefenseRun({ save, stage, seed: 55, summary: long, elapsedSeconds: 900 });
  assert.ok(steps > DEFENSE_REPLAY_STEP_CAP);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.verified, false);
  assert.equal(verdict.diagnostics.replayed, false);
});
