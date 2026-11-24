import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { parseSave } = await import('../src/game/store.ts');
const { migrateItem } = await import('../src/game/items.ts');
const { settleOfflineRewards } = await import('../src/game/offlineSettle.ts');
const { NETWORK_OFFLINE } = await import('../src/ui/reconnect.ts');

/**
 * 방치 정산 확정 절차(2026-11-24) — 저장이 실패해도 시작 화면·전환 화면에 갇히지 않는다.
 *
 * PR #358의 원칙(미확정 보상을 보여 주지 않는다)은 유지하고, 실패 뒤의 복구만 바꿨다:
 * 끊김·5xx는 같은 `requestId`로 다시 보내고, 서버가 거절하면 서버 세이브로 맞춘 뒤 한 번 더 시도한다.
 */

/** 저장 큐를 흉내 내는 최소 `SaveSync` — 실패 시나리오를 그대로 재생한다. */
function syncStub(failures, { reload = true } = {}) {
  const queue = [...failures];
  const state = {
    marks: 0, flushes: 0, reloads: [], lastSaveClamped: [], lastSaveErrorCode: '', lastSaveErrorStatus: 0,
    lastSaveFailure: '', lastSaveRetryable: false, conflicted: false,
    markDirty() { this.marks++; },
    async flush() {
      this.flushes++;
      const failure = queue.shift();
      if (!failure) { this.lastSaveErrorCode = ''; this.lastSaveErrorStatus = 0; this.lastSaveRetryable = false; this.lastSaveFailure = ''; return true; }
      this.lastSaveErrorCode = failure.code ?? '';
      this.lastSaveErrorStatus = failure.status ?? 0;
      this.lastSaveRetryable = (failure.code === NETWORK_OFFLINE) || (failure.status ?? 0) >= 500;
      this.lastSaveFailure = `${failure.code} (오류 코드: ${failure.code})`;
      return false;
    }
  };
  if (reload) state.reloadLatest = async quiet => { state.reloads.push(quiet); };
  return state;
}

/** 8시간 방치한 캐릭터 세이브 — 정산이 아이템을 만들 수 있도록 튜토리얼을 끝낸 상태. */
function idleSave() {
  const save = parseSave({ version: 1, name: '관우', gender: 'male', job: 'warrior', level: 16, floor: 20, maxFloor: 20, autoClimb: true, tutorial: 3, gold: 0, bag: [], equipment: {}, equipmentCollection: [] }, 'gwanu');
  return save;
}

test('저장이 첫 번에 통과하면 보상을 확정해 돌려준다', async () => {
  const sync = syncStub([]);
  const save = idleSave();
  const result = await settleOfflineRewards(sync, save, 3600, {}, { retryDelays: [0], wait: async () => {} });
  assert.equal(result.confirmed, true);
  assert(result.reward, '정산 결과를 돌려준다');
  assert.equal(sync.marks, 1, '저장을 한 번만 표시한다');
  assert.equal(sync.flushes, 1);
  assert.deepEqual(sync.reloads, []);
});

test('끊김·5xx는 같은 저장을 다시 보낸 뒤 확정한다', async () => {
  const sync = syncStub([{ code: NETWORK_OFFLINE }, { status: 503 }]);
  const save = idleSave();
  const result = await settleOfflineRewards(sync, save, 3600, {}, { retryDelays: [0, 0], wait: async () => {} });
  assert.equal(result.confirmed, true);
  assert.equal(sync.flushes, 3, '두 번 다시 보낸 뒤 성공한다');
  assert.deepEqual(sync.reloads, [], '끊김은 서버 세이브를 다시 받지 않는다(보상을 다시 굴리지 않는다)');
});

test('서버가 저장을 거절하면 서버 세이브로 다시 맞춘 뒤 한 번 더 시도한다', async () => {
  const sync = syncStub([{ code: 'ITEM_CONFLICT', status: 409 }]);
  const save = idleSave();
  const result = await settleOfflineRewards(sync, save, 3600, {}, { retryDelays: [], wait: async () => {} });
  assert.equal(result.confirmed, true, '재동기화 뒤 저장이 통과하면 확정이다');
  assert.deepEqual(sync.reloads, [true], '최신 서버 세이브를 조용히 다시 받는다');
  assert.equal(sync.flushes, 2);
  assert(result.reward, '서버 세이브에 다시 적용한 정산을 돌려준다');
});

test('끝내 실패하면 미확정으로 돌려주고 실제 서버 오류를 남긴다', async () => {
  const sync = syncStub([{ code: 'ITEM_CONFLICT', status: 409 }, { code: 'ITEM_CONFLICT', status: 409 }]);
  const save = idleSave();
  const result = await settleOfflineRewards(sync, save, 3600, {}, { retryDelays: [], wait: async () => {} });
  assert.equal(result.confirmed, false);
  assert.equal(result.reward, undefined, '미확정 보상은 화면에 넘기지 않는다');
  assert.match(result.reason ?? '', /ITEM_CONFLICT/, '원인 코드를 숨기지 않는다');
});

test('정산할 시간이 없으면 네트워크를 쓰지 않는다(예전 진행 이전처럼 저장이 필요할 때만 보낸다)', async () => {
  const sync = syncStub([]);
  const idle = await settleOfflineRewards(sync, idleSave(), 30, {}, { retryDelays: [], wait: async () => {} });
  assert.equal(idle.confirmed, true);
  assert.equal(sync.flushes, 0, '60초 미만은 정산도 저장도 없다');

  const migrating = await settleOfflineRewards(sync, idleSave(), 30, {}, { flushWhenIdle: true, retryDelays: [], wait: async () => {} });
  assert.equal(migrating.confirmed, true);
  assert.equal(sync.flushes, 1, '이전할 진행이 있으면 저장은 한 번 보낸다');
});

test('저장된 2차 스탯은 화면 파서가 다시 계산하지 않는다(저장↔화면 왕복이 같다)', () => {
  // 관우 슬롯 5 실데이터: 저장값 crit 2, 예전 파서는 강화·쯔바이핸드 보너스를 빼고 1로 깎아 409를 만들었다.
  const belt = { id: 'belt-1', name: '황혼의 용가죽 벨트', slot: 'belt', rarity: 'rare', stats: { attack: 4, defense: 28, health: 124, crit: 2, speed: 1 }, plus: 1, sec: 2 };
  assert.equal(migrateItem(belt).stats.crit, 2, 'sec:2 장비의 치명을 그대로 쓴다');
  const zweihander = { id: 'zw-1', name: '고대의 쯔바이핸드', slot: 'weapon', rarity: 'unique', stats: { attack: 41, defense: 9, health: 46, crit: 5, speed: 2 }, sec: 2 };
  assert.equal(migrateItem(zweihander).stats.crit, 5, '쯔바이핸드 보너스도 저장값을 지킨다');
  // 옛 척도(sec 없음)는 한 번만 새 식으로 바꾼다 — 그 뒤로는 값이 고정된다.
  const legacy = { id: 'legacy-1', name: '낡은 벨트', slot: 'belt', rarity: 'rare', stats: { attack: 1, defense: 2, health: 3, crit: 800, speed: 1200 } };
  const migrated = migrateItem(legacy);
  assert.equal(migrated.sec, 2, '옛 장비는 새 척도로 표시된다');
  assert(migrated.stats.crit < 800 && migrated.stats.speed < 1200, '옛 척도의 큰 값은 새 식으로 다시 계산한다');
  assert.equal(migrateItem(migrated).stats.crit, migrated.stats.crit, '한 번 바꾼 값은 다음 로드에서도 그대로다');
});
