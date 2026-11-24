import { applyOfflineRewards, type OfflineReward, type OfflineRewardOptions } from './offline';
import type { Save } from './store';

/**
 * 방치 정산 **확정** 절차(2026-11-24).
 *
 * PR #358의 원칙(미확정 보상을 확정된 것처럼 보여 주지 않는다)은 그대로 지키되, 저장이 실패했을 때
 * 시작 화면·전환 화면에 **영구히 갇히지 않게** 한다는 것이 이 모듈의 책임이다. 예전에는 로그인·캐릭터
 * 전환 직후 `sync.flush()`가 한 번이라도 `false`면 `boot.fail()`/`location.reload()`로 끝나서, 서버가
 * 아이템 소유권·2차 스탯 불일치로 409를 돌려주면 재접속해도 같은 화면에서 같은 실패를 반복했다.
 *
 * 순서:
 *  ① 정산 결과를 세이브에 적용하고 저장**만** 한다(표시는 성공 뒤).
 *  ② 결과를 모르는 실패(끊김·5xx)는 같은 `requestId`로 다시 보낸다 — `SaveSync`가 스냅샷을 들고 있다.
 *  ③ 서버가 저장 자체를 거절(소유권·캐릭터·리비전 충돌)하면 **서버 세이브가 기준**이다. 서버 진행을 다시
 *     받아(`reloadLatest`) 미확정 보상을 버리고, 그 세이브에 정산을 한 번 더 적용해 재시도한다.
 *  ④ 그래도 실패하면 `confirmed: false`와 **실제 서버 오류**를 돌려준다 — 화면은 보상을 숨기고 이유를 보여 준다.
 *
 * 이 모듈은 `SaveSync`를 직접 알지 않고 최소 표면(`OfflineSettleSync`)만 받는다 — 테스트가 저장 큐 없이
 * 이 흐름을 검증한다.
 */
export type OfflineSettleSync = {
  markDirty(): void;
  flush(): Promise<boolean>;
  reloadLatest?(quiet?: boolean): Promise<void>;
  lastSaveClamped?: string[];
  lastSaveErrorCode?: string;
  lastSaveErrorStatus?: number;
  lastSaveFailure?: string;
  /** 결과를 모르는 실패(끊김·5xx)인가 — `SaveSync.lastSaveRetryable`. */
  readonly lastSaveRetryable?: boolean;
  readonly conflicted?: boolean;
};

export type OfflineSettleResult = {
  /** 서버가 받아들인 정산 결과 — 실패했거나 정산할 시간이 없으면 `undefined`. */
  reward?: OfflineReward;
  /** 서버가 이번 정산을 확정했는가. `false`면 화면에 보상을 보여 주지 않는다. */
  confirmed: boolean;
  /** `confirmed: false`일 때 그대로 보여 줄 사유(서버 오류 코드 포함). */
  reason?: string;
};

export type OfflineSettleSettings = {
  /** 정산할 시간이 없어도 저장을 한 번 보낸다(예전 진행 상황 이전처럼 저장 자체가 목적인 경우). */
  flushWhenIdle?: boolean;
  /** 다시 보내기 전 기다리는 시간(ms). 테스트는 0으로 넘긴다. */
  retryDelays?: number[];
  wait?: (ms: number) => Promise<void>;
};

/** 결과를 모르는 실패에서 다시 보내기까지의 간격 — 합계 4.5초. */
export const OFFLINE_SETTLE_RETRY_DELAYS = [1_500, 3_000];
/** 서버가 아이템·캐릭터 기준으로 저장을 **거절한** 코드 — 서버 세이브로 다시 맞추면 풀린다.
 *  `SAVE_CONFLICT`(다른 기기에서 진행이 바뀜)는 여기 넣지 않는다: 화면 잠금·새로고침 안내가 계약이다. */
const REJECTED_CODES = ['ITEM_CONFLICT', 'CHARACTER_CONFLICT'];
const defaultWait = (ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms); });

/** 확정된 보상만 남긴다 — 서버가 상한으로 자른 아이템은 목록에서 빼고, 조정 사실을 표시한다. */
function confirmedReward(sync: OfflineSettleSync, save: Save, reward?: OfflineReward): OfflineReward | undefined {
  if (!reward) return undefined;
  const accepted = new Set(save.bag.map(item => item.id));
  reward.items = reward.items.filter(item => accepted.has(item.id));
  if (sync.lastSaveClamped?.length) reward.adjusted = true;
  return reward;
}

export async function settleOfflineRewards(
  sync: OfflineSettleSync,
  save: Save,
  seconds: number,
  options: OfflineRewardOptions = {},
  settings: OfflineSettleSettings = {}
): Promise<OfflineSettleResult> {
  const retryDelays = settings.retryDelays ?? OFFLINE_SETTLE_RETRY_DELAYS;
  const wait = settings.wait ?? defaultWait;
  const flushWhenIdle = settings.flushWhenIdle === true;
  let reward = applyOfflineRewards(save, seconds, options);
  if (!reward && !flushWhenIdle) return { confirmed: true };
  let retries = 0;
  let resynced = false;
  for (;;) {
    sync.markDirty();
    if (await sync.flush()) return { reward: confirmedReward(sync, save, reward), confirmed: true };
    const code = sync.lastSaveErrorCode ?? '';
    const retryable = sync.lastSaveRetryable ?? Number(sync.lastSaveErrorStatus ?? 0) >= 500;
    // ② 끊김·5xx — 결과를 모르므로 같은 `requestId`로 다시 보낸다(보상을 다시 계산하지 않는다).
    if (retryable && retries < retryDelays.length) {
      await wait(retryDelays[retries++]);
      continue;
    }
    // ③ 서버가 거절 — 서버 진행이 기준이다. 미확정 보상을 버리고, 서버 세이브에 정산을 다시 적용해 한 번 더.
    if (!resynced && REJECTED_CODES.includes(code) && sync.reloadLatest) {
      resynced = true;
      await sync.reloadLatest(true);
      if (sync.conflicted) break;
      reward = applyOfflineRewards(save, seconds, options);
      if (!reward && !flushWhenIdle) return { confirmed: true };
      continue;
    }
    break;
  }
  return { confirmed: false, reason: sync.lastSaveFailure || '방치 보상을 서버에 저장하지 못했습니다.' };
}
