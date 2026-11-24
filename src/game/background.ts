/**
 * 자리 비움(백그라운드) 정산 — 탭을 내려 둔 시간을 **방치(오프라인)와 같은 규칙**으로 한 번 정산한다(작업 261).
 *
 * 지금까지는 탭을 내렸다 올리면 사냥만 멈춰 있고 보상이 없었다. 새로고침해야 앱 시작 때의 방치 정산이
 * 돌아 보상이 나왔다. 이 모듈은 그 사이 시간을 재는 **판정만** 맡는다 — 실제 정산은 기존
 * `applyOfflineRewards()`를 그대로 한 번 부르고(`src/main.ts`), 저장은 `SaveSync`가 맡는다.
 *
 * 확정 기준(2026-11-24 덕진 님):
 *  · 60초 미만 숨김 → 정산 없음(기존 방치 문턱과 같다).
 *  · 60~179초 → 토스트 한 줄. 180초 이상 → 기존 방치 정산 팝업.
 *  · 3분 미만이어도 **놓치면 아쉬운 결과**(유니크·전설 획득, 레벨업, 층 상승, 자동 분해)면 팝업.
 *  · 상한 12시간(43,200초) — 기존 방치·서버 `elapsedSince`와 같다.
 *
 * 정산 초는 **숨김이 시작된 순간부터** 재고, 서버가 알려 준 경과(`offlineSeconds`)를 상한으로 쓴다.
 * 숨김 진입 저장이 실패해 서버 경과에 숨기기 전 사냥 시간이 섞여도 그 시간을 두 번 주지 않는다.
 */
import type { OfflineReward } from './offline';
import type { Item } from './items';

/** 정산 최소 시간 — 이보다 짧게 숨겼다 돌아오면 아무것도 주지 않는다. */
export const BACKGROUND_MIN_SECONDS = 60;
/** 토스트와 정산 팝업의 경계 — 3분. */
export const BACKGROUND_POPUP_SECONDS = 180;
/** 상한 12시간 — `offline.ts`·서버 `elapsedSince`와 같은 값. */
export const BACKGROUND_MAX_SECONDS = 43_200;

/**
 * 이번 복귀에 정산할 초. 정산하지 않으면 0.
 *
 * `serverSeconds`는 복귀 때 `load`가 내려준 `offlineSeconds`(없으면 서버 경과를 모르는 것이므로 로컬 초를 쓴다).
 * 둘 중 **작은 값**이 항상 안전하다 — 숨김 진입 저장이 실패하면 서버 경과에 숨기기 전 사냥 시간이 섞이고,
 * 반대로 로컬 초가 서버 경과보다 크면 서버에 없는 진행을 만들어 낸다.
 */
export function backgroundSettleSeconds(hiddenSeconds: number, serverSeconds?: number): number {
  if (!Number.isFinite(hiddenSeconds) || hiddenSeconds < BACKGROUND_MIN_SECONDS) return 0;
  const local = Math.floor(hiddenSeconds);
  const cap = Number.isFinite(serverSeconds) ? Math.max(0, Math.floor(serverSeconds as number)) : BACKGROUND_MAX_SECONDS;
  const seconds = Math.min(BACKGROUND_MAX_SECONDS, local, cap);
  return seconds >= BACKGROUND_MIN_SECONDS ? seconds : 0;
}

/**
 * 토스트가 아니라 **정산 팝업**으로 보여 줄 결과인가.
 *
 * 3분 이상이면 언제나 팝업이고, 3분 미만이라도 놓치면 아쉬운 결과(유니크·전설 획득, 레벨업, 층 상승,
 * 자동 분해)가 있으면 팝업이다 — 토스트 3.2초로는 그 결과를 확인할 수 없다.
 */
export function backgroundNeedsPopup(seconds: number, reward: OfflineReward): boolean {
  if (seconds >= BACKGROUND_POPUP_SECONDS) return true;
  if (reward.levels > 0) return true;
  if (reward.endFloor > reward.startFloor) return true;
  if ((reward.salvaged?.count ?? 0) > 0) return true;
  return reward.items.some(item => item.rarity === 'unique' || item.rarity === 'legendary');
}

/** `2분`·`1시간 5분`처럼 짧게 적는다. */
export function backgroundDuration(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  if (!hours) return `${minutes}분`;
  return minutes % 60 ? `${hours}시간 ${minutes % 60}분` : `${hours}시간`;
}

/**
 * 짧은 복귀의 토스트 한 줄 — `자리 비운 2분 · 처치 31마리 · EXP +930 · +620금화`.
 * `Interface.message()`가 `골드→금화`를 바꾸므로 처음부터 `금화`로 쓴다.
 */
export function backgroundToast(reward: OfflineReward): string {
  const parts = [
    `자리 비운 ${backgroundDuration(reward.seconds)}`,
    `처치 ${reward.kills.toLocaleString('ko-KR')}마리`,
    `EXP +${reward.exp.toLocaleString('ko-KR')}`,
    `+${reward.gold.toLocaleString('ko-KR')}금화`,
  ];
  if (reward.items.length) parts.push(`아이템 ${reward.items.length}개`);
  if (reward.salvaged?.count) parts.push(`분해 ${reward.salvaged.count}개`);
  return parts.join(' · ');
}

/** 월드보스 도전을 마감했을 때 남기는 안내 — 필드 정산 대신 서버 결과로 도전이 끝난다. */
export const BACKGROUND_WORLD_BOSS_NOTICE = '자리를 비운 동안 전투 시간이 지나 서버에서 결과가 정산되었습니다.';
/** 정산 저장을 확인하지 못했을 때 — 보상은 메모리에 남아 다음 저장에 실리고, 새로고침 뒤 다음 접속이 같은 구간을 한 번 정산한다. */
export const BACKGROUND_SAVE_FAILED_NOTICE = '자리 비운 보상을 저장하지 못했습니다. 연결이 돌아오면 다시 저장합니다.';

/**
 * 저장 응답 세이브에 **실제로 남아 있는** 아이템만 골라 낸다(2026-11-24 오프라인 저장 오류 사고 규칙).
 *
 * 서버가 상한·충돌로 조정했으면 가방에서 빠진 아이템이 있다. 그것을 먼저 보여 주면 다음 접속에 다른 결과가
 * 나온 것처럼 보이므로, 정산서는 저장 성공 뒤의 가방을 기준으로 만든다.
 */
export function acceptedItems(items: Item[], bag: { id: string }[]): Item[] {
  const have = new Set(bag.map(item => item.id));
  return items.filter(item => have.has(item.id));
}
