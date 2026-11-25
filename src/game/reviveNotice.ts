/**
 * 부활 대기 표시(2026-11-25, B안 — 화면 중앙 상태 카드 + 92px 링 카운트다운).
 *
 * `reviveTimer`는 2026-11-24 방치 사냥 개선에서 엔진·필드에 들어왔지만(5초, 입문 1~4층 0초) 화면은
 * 아무도 읽지 않았다 — 유일한 안내가 3.2초짜리 토스트 한 줄이라 **5초 중 마지막 1.8초는 아무 표시가
 * 없었고**, 캐릭터는 서 있는 자세 그대로라 왜 사냥이 멈췄는지 알 수 없었다.
 *
 * 이 파일은 **판정·문구·상수만** 갖는다(DOM 없음 — 서버 번들·단위 테스트가 같은 값을 본다). 화면에
 * 그리는 일은 `src/ui/reviveNotice.ts`가 맡는다.
 *
 * 규칙(대장님·덕진 님 확정)
 *  · 5층부터 쓰러지면 5초를 기다린다. 그동안 카드가 남은 초를 **정수로** 보여 준다(5→4→…→1).
 *  · 0초가 되는 순간 `부활!`을 0.9초 플래시하고 카드가 사라진다. 그 뒤 자동 사냥이 다시 시작된다.
 *  · 입문 1~4층은 대기 자체가 0초라 카드를 띄우지 않는다(현행 유지).
 */
import { reviveSeconds } from './combat/engine';

/** `부활!` 플래시가 화면에 머무는 시간(초) — 카드가 사라지기까지의 마지막 한 호흡. */
export const REVIVE_FLASH_SECONDS = .9;
/** 카드 제목 — 쓰러진 동안. */
export const REVIVE_CARD_DOWN = '쓰러졌습니다';
/** 0초 플래시에 링 가운데에 쓰는 말. */
export const REVIVE_CARD_REVIVED = '부활!';
/** 카드 본문 둘째 줄 — 부활하면 자동 사냥이 이어지는 방치형 RPG의 약속. */
export const REVIVE_CARD_RESTART = '부활하면 자동 사냥이 다시 시작됩니다.';
/** 카드 바닥 각주 — 입문 구간 면제를 미리 알려 준다. */
export const REVIVE_CARD_NOTE = '1~4층은 대기 없이 바로 부활합니다.';
/** 0초 플래시에서 카드 본문을 대신하는 한 문장 — 대기 중 문장(`1초 뒤 만혈로 부활합니다`)을 그대로
 *  두면 링이 `부활!`인데 본문은 아직 기다리는 중이라 말이 엇갈린다(프리뷰 검수에서 확인). */
export const REVIVE_CARD_REVIVED_LINE = '만혈로 부활했습니다. 자동 사냥을 다시 시작합니다.';

/** 화면에 그릴 상태 — `waiting`(카운트다운) 또는 `flash`(부활!), 없으면 `null`. */
export type ReviveNoticeState =
  | { kind: 'waiting'; /** 그 층의 전체 대기 초(5). */ total: number; /** 링 가운데에 쓰는 남은 초(5~1). */ seconds: number; /** 링·막대가 채워진 비율(남은/전체). */ ratio: number }
  | { kind: 'flash'; total: number };

/**
 * 지금 그릴 부활 카드 상태.
 *
 * `flashLeft`는 화면이 들고 있는 플래시 잔여 시간이다 — 타이머가 0이 된 **뒤**에도 `부활!`을 0.9초
 * 보여 주려면 남은 초만으로는 알 수 없어서 밖에서 받는다. 입문 1~4층은 `reviveSeconds`가 0이라
 * 어떤 값이 들어와도 `null`이다(카드 없음 — 현행 유지).
 */
export function reviveNoticeState(reviveTimer: number, floor: number, flashLeft = 0): ReviveNoticeState | null {
  const total = reviveSeconds(floor);
  if (total <= 0) return null;
  const timer = Number.isFinite(reviveTimer) ? Math.max(0, reviveTimer) : 0;
  if (timer > 0) {
    // 5초에서 5,4,3,2,1을 차례로 — 4.98초에도 `5`가 보이도록 올림한다(마지막 1초는 내림 없이 `1`).
    const seconds = Math.max(1, Math.min(total, Math.ceil(timer)));
    return { kind: 'waiting', total, seconds, ratio: Math.max(0, Math.min(1, timer / total)) };
  }
  return flashLeft > 0 ? { kind: 'flash', total } : null;
}

/** `10금화 손실 · 6층` — 잃은 금화는 모자라면 실제 잃은 만큼(0~10)이다. */
export function reviveChipText(lostGold: number, floor: number): string {
  const lost = Math.max(0, Math.floor(Number.isFinite(lostGold) ? lostGold : 0));
  const at = Math.max(1, Math.floor(Number.isFinite(floor) ? floor : 1));
  return `${lost}금화 손실 · ${at}층`;
}

/** `4초 뒤 만혈로 부활합니다` — 카드 본문 첫 줄. */
export function reviveCountdownText(seconds: number): string {
  const left = Math.max(1, Math.floor(Number.isFinite(seconds) ? seconds : 1));
  return `${left}초 뒤 만혈로 부활합니다`;
}

/** 스크린리더에 한 번만 읽어 줄 문장 — 카드 안의 매초 바뀌는 숫자는 `aria-hidden`이다. */
export function reviveScreenReaderText(lostGold: number, floor: number, seconds: number): string {
  return `${REVIVE_CARD_DOWN}. ${reviveChipText(lostGold, floor)}. ${reviveCountdownText(seconds)}.`;
}

/**
 * 부활 대기 카드가 떠 있는 동안 **접는 토스트**인가.
 *
 * 쓰러진 순간의 안내와 부활 순간의 `부활했습니다.`는 카드가 같은 말을 더 정확히(남은 초·`부활!`)
 * 보여 주므로 토스트로 또 띄우면 화면 위아래에서 같은 문장이 두 번 보인다. 다만 **보스에게 진 경우**의
 * `1마리부터 다시 잡으면 보스가 다시 나타납니다`는 카드에 없는 정보라 그대로 토스트로 남긴다.
 */
export function isReviveToastSuppressed(text: string): boolean {
  const line = text.trim();
  if (line === '부활했습니다.') return true;
  return /^쓰러졌습니다\. 10골드를 잃었습니다\. \d+초 뒤 부활합니다\.(?: 자동 등반은 계속됩니다\.)?$/.test(line);
}
