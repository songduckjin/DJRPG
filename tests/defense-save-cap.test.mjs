import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { freshSave, parseSave, DEFENSE_MAX_STAGE } = await import('../src/game/store.ts');
const { defenseReachedStage, defenseReachedAt, recordDefenseRun, claimDefenseRewards } = await import('../src/game/defenseProgress.ts');
const { clampSaveProgress } = await import('../server/save-guard.mjs');
const { initialSave } = await import('../server/save-seed.mjs');
const { DEFENSE_MAX_STAGE: SERVER_MAX_STAGE } = await import('../server/defense-schema.mjs');
const { DEFENSE_MAX_STAGE: GUARD_MAX_STAGE } = await import('../server/save-guard.mjs');

test('세이브는 무한 방어전 도달 스테이지를 0에서 시작하고 0~999 정수로 읽는다', () => {
  const save = freshSave();
  assert.equal(save.defenseStage, 0);
  assert.equal(save.defenseStageAt, 0);
  assert.equal(parseSave(save).defenseStage, 0);
  assert.equal(parseSave({ ...save, defenseStage: 12, defenseStageAt: 1000 }).defenseStage, 12);
  assert.equal(parseSave({ ...save, defenseStage: 12, defenseStageAt: 1000 }).defenseStageAt, 1000);
  assert.equal(parseSave({ ...save, defenseStage: 4000 }).defenseStage, DEFENSE_MAX_STAGE);
  assert.equal(parseSave({ ...save, defenseStage: -3 }).defenseStage, 0);
  assert.equal(parseSave({ ...save, defenseStage: 7.6 }).defenseStage, 7);
  assert.equal(parseSave({ ...save, defenseStage: '9' }).defenseStage, 0, '문자열 스테이지는 기록이 아니다');
  assert.equal(parseSave({ ...save, defenseStage: 0, defenseStageAt: 777 }).defenseStageAt, 0);
  // 새 계정 세이브(서버 시드)도 같은 필드를 갖는다 — 없으면 저장 때 500이 난다.
  const seeded = initialSave('ACC', 'male', '모험가');
  assert.equal(seeded.defenseStage, 0);
  assert.equal(seeded.defenseStageAt, 0);
});

test('최고 스테이지는 오르기만 하고, 같은 스테이지의 최초 도달 시각을 지킨다', () => {
  const save = freshSave();
  assert.equal(recordDefenseRun(save, 2, 100), true);
  assert.equal(save.defenseStage, 2);
  assert.equal(save.defenseStageAt, 100);
  assert.equal(recordDefenseRun(save, 2, 900), false, '같은 스테이지 재도전은 기록을 바꾸지 않는다');
  assert.equal(save.defenseStageAt, 100);
  assert.equal(recordDefenseRun(save, 5, 200), true);
  assert.equal(save.defenseStage, 5);
  assert.equal(recordDefenseRun(save, 4, 300), false, '낮은 스테이지는 최고 기록을 되돌리지 않는다');
  assert.equal(save.defenseStage, 5);
  assert.equal(recordDefenseRun(save, 100000, 400), true);
  assert.equal(save.defenseStage, DEFENSE_MAX_STAGE);
  assert.equal(recordDefenseRun(save, 0, 500), false);
  assert.equal(defenseReachedStage({ defenseStage: 1200 }), DEFENSE_MAX_STAGE);
  assert.equal(defenseReachedAt({ defenseStageAt: -5 }), 0);
});

test('저장 가드는 검증된 순위 기록(+1)까지만 세이브의 스테이지를 인정한다', () => {
  const previous = { ...freshSave(), gold: 0, kills: 0, maxFloor: 1, floor: 1, level: 1, exp: 0, defenseStage: 4, defenseStageAt: 10 };
  const verified = { ...previous, defenseStage: 9, defenseStageAt: 20 };
  const result = clampSaveProgress(previous, verified, { elapsedSeconds: 60, defenseStageCap: 5 });
  assert.equal(verified.defenseStage, 6, '검증된 기록(5) + 1까지만 저장된다');
  assert.ok(result.clamped.includes('defenseStage'));
  // 저장 가드는 넘치는 값만 자른다(내려간 값을 올려 주지는 않는다) — 되돌리지 않는 규칙은
  // `server/db/save.mjs`의 `Math.max(previousDefense, incomingDefense)`가 맡는다.
  const lower = { ...previous, defenseStage: 3 };
  const lowerResult = clampSaveProgress(previous, lower, { elapsedSeconds: 60, defenseStageCap: 5 });
  assert.equal(lower.defenseStage, 3);
  assert.equal(lowerResult.clamped.includes('defenseStage'), false);
  // 기록이 아직 없으면 지금 값에서 한 스테이지만 오른다 — 세이브만 고쳐 900을 주장할 수 없다.
  const noRecord = { ...previous, defenseStage: 900 };
  clampSaveProgress(previous, noRecord, { elapsedSeconds: 60 });
  assert.equal(noRecord.defenseStage, 5);
  // 시각은 미래일 수 없고, 스테이지가 0이면 시각도 0이다.
  const future = { ...previous, defenseStageAt: Date.now() + 10_000_000 };
  clampSaveProgress(previous, future, { elapsedSeconds: 60, defenseStageCap: 4 });
  assert.ok(future.defenseStageAt <= Date.now());
});

test('스테이지 상한 999는 세 곳(세이브·서버 DDL·저장 가드)에서 같은 값이다', () => {
  assert.equal(DEFENSE_MAX_STAGE, 999);
  assert.equal(SERVER_MAX_STAGE, DEFENSE_MAX_STAGE);
  assert.equal(GUARD_MAX_STAGE, DEFENSE_MAX_STAGE);
  const store = readFileSync(new URL('../src/game/store.ts', import.meta.url), 'utf8');
  assert.match(store, /export const DEFENSE_MAX_STAGE = 999/);
});

test('판 보상은 실패해도 지급되고, 경험치는 레벨업까지 store의 addExperience가 처리한다', () => {
  const save = freshSave('male', 'warrior');
  const before = { gold: save.gold, kills: save.kills, level: save.level };
  const receipt = claimDefenseRewards(save, {
    gold: 120, exp: 300, kills: 6, bossKills: 0,
    items: [{ id: 'drop-1', name: '녹슨 검', slot: 'weapon', rarity: 'common', stats: { attack: 4 }, plus: 0 }]
  });
  assert.equal(receipt.gold, 120);
  assert.equal(save.gold, before.gold + 120);
  assert.equal(save.kills, before.kills + 6);
  assert.equal(save.exp, 300);
  assert.equal(receipt.items.length, 1);
  assert.equal(save.bag.length, 1);
  assert.equal(receipt.missed, 0);
  // 큰 경험치는 레벨업으로 이어지고 최대 체력이 새 레벨로 채워진다.
  const big = freshSave('male', 'warrior');
  claimDefenseRewards(big, { gold: 0, exp: 200000, kills: 0, bossKills: 0, items: [] });
  assert.ok(big.level > before.level);
});
