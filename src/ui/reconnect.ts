/**
 * 재접속 안내(작업 251).
 *
 * 모바일(iOS Safari·홈 화면 웹앱)은 창을 내렸다가 다시 올리면 그 사이에 떠 있던 요청을 끊는다.
 * 그 순간 저장이나 세션 복구가 실패하면 화면에 "서버에 연결할 수 없습니다. 네트워크 상태를 확인하세요."가
 * 빨갛게 떠서 마치 게임이 고장 난 것처럼 보였다(2026-11-21 11:34 KST 제보 — "창내렸다가 들어오면
 * 네트워크 연결할 수 없습니다 상태확인하라고 뜨는데 게임접속중입니다 팝업문구 띄우는걸로").
 *
 * 그래서 끊김은 **오류가 아니라 잠깐의 재연결**로 다룬다.
 *  ① 끊기면 `게임에 접속 중입니다…` 안내를 띄우고 몇 초마다 스스로 다시 보낸다(`ReconnectNotice`,
 *     `retryNetwork`).
 *  ② 다시 붙으면 안내가 저절로 사라지고 `다시 연결되었습니다.`만 아주 잠깐 보여 준다.
 *  ③ `RECONNECT_SLOW_AFTER_MS`(20초)가 지나도 붙지 않을 때만 "네트워크 상태를 확인한 뒤 다시 시도"
 *     안내와 `다시 시도` 버튼으로 바뀐다 — 잠깐의 끊김에 이용자가 할 일을 만들지 않는다.
 *
 * 이 파일은 DOM 없이도 쓸 수 있게 문구·판정·재시도 루프를 먼저 두고, 화면 부품은 맨 아래에 둔다.
 */

/** 끊긴 동안 보여 주는 안내 — 사용자가 요청한 문구 그대로. */
export const RECONNECT_MESSAGE = '게임에 접속 중입니다…';
/** 20초가 지나도 붙지 않을 때의 안내(진짜 장시간 오프라인). */
export const RECONNECT_SLOW_MESSAGE = '연결이 계속 끊겨 있습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.';
/** 다시 붙은 직후 잠깐 보여 주는 문구. */
export const RECONNECT_RECOVERED_MESSAGE = '다시 연결되었습니다.';
/** 이 시간이 지나면 '재연결 중'에서 '상태 확인' 안내로 바꾼다. */
export const RECONNECT_SLOW_AFTER_MS = 20_000;
/** 붙지 않은 동안 다시 보내는 간격(처음 20초). */
export const RECONNECT_RETRY_MS = 3_000;
/** 장시간 끊긴 뒤의 재시도 간격 — 요청을 아끼면서도 붙는 즉시 돌아오게 한다. */
export const RECONNECT_SLOW_RETRY_MS = 10_000;
/** 세션 자동 복구(창을 다시 열었을 때)에서 스스로 다시 보내는 횟수 — 약 21초(상태 확인 안내로 넘어가는 20초와 맞춘다). */
export const RECONNECT_LOGIN_ATTEMPTS = 7;
/** 이용자가 직접 '로그인'을 눌렀을 때의 재시도 횟수 — 기다리게 하지 않는다. */
export const RECONNECT_MANUAL_ATTEMPTS = 4;

/** 연결 자체가 끊겨 요청이 서버에 닿지 못한 오류의 코드. HTTP 오류(4xx·5xx)와 구분한다. */
export const NETWORK_OFFLINE = 'NETWORK_OFFLINE';

export type OfflineError = Error & { code: typeof NETWORK_OFFLINE; notice: true };

/**
 * 네트워크가 끊겨 요청을 보내지 못했을 때의 오류.
 *
 * `notice`를 달아 로그인 화면이 빨간 고장 문구가 아니라 안내 톤으로 보여 주게 한다(작업 242의
 * 점검 안내와 같은 표시 규칙).
 */
export function offlineError(message: string = RECONNECT_MESSAGE): OfflineError {
  const error = new Error(message) as OfflineError;
  error.code = NETWORK_OFFLINE;
  error.notice = true;
  return error;
}

/**
 * 이 오류가 '서버에 닿지 못함'인지.
 *
 * 우리가 만든 `offlineError`는 코드로, 브라우저가 던지는 `TypeError: Failed to fetch`(Chrome)·
 * `TypeError: Load failed`(Safari)·본문이 잘려 난 `network error`는 문구로 알아본다. JSON 파싱
 * 실패("Unexpected token")나 HTTP 오류는 여기에 걸리지 않아야 한다 — 그것들은 재시도로 풀리지 않는다.
 */
const offlineMessages = /Failed to fetch|Load failed|NetworkError|network error|network connection was lost|Internet connection appears to be offline|ERR_INTERNET_DISCONNECTED|net::ERR_|네트워크/i;
export function isNetworkOffline(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === NETWORK_OFFLINE) return true;
  return typeof message === 'string' && offlineMessages.test(message);
}

export type ReconnectStage = { kind: 'connecting' | 'slow'; message: string; retry: boolean };

/** 끊긴 지 얼마나 지났는지로 안내 단계를 고른다 — 화면과 테스트가 같은 경계를 본다. */
export function reconnectStage(elapsedMs: number): ReconnectStage {
  return elapsedMs >= RECONNECT_SLOW_AFTER_MS
    ? { kind: 'slow', message: RECONNECT_SLOW_MESSAGE, retry: true }
    : { kind: 'connecting', message: RECONNECT_MESSAGE, retry: false };
}

export type NetworkRetryOptions = {
  /** 전체 시도 횟수(첫 시도 포함). */
  attempts?: number;
  /** 시도 사이 간격. */
  delayMs?: number;
  /** 기다리기 — 테스트가 타이머 없이 돌 수 있게 갈아 끼울 수 있다. */
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  /** 한 번 실패하고 다시 보내기 전에 불린다 — 화면은 여기서 안내 단계를 바꾼다. */
  onWait?: (attempt: number, elapsedMs: number) => void;
};

/**
 * 네트워크가 끊긴 동안 같은 요청을 스스로 다시 보낸다.
 *
 * HTTP 오류(서버가 답한 오류)는 그대로 던진다 — 다시 보내도 결과가 같고, 이용자에게 바로 알려야 한다.
 * 횟수를 다 쓰면 `RECONNECT_SLOW_MESSAGE`를 단 `offlineError`로 끝나 '상태 확인' 안내로 이어진다.
 */
export async function retryNetwork<T>(run: (attempt: number) => Promise<T>, options: NetworkRetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? RECONNECT_LOGIN_ATTEMPTS);
  const delayMs = options.delayMs ?? RECONNECT_RETRY_MS;
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((ms: number) => new Promise<void>(resolve => { setTimeout(resolve, ms); }));
  const startedAt = now();
  for (let attempt = 0; ; attempt++) {
    try { return await run(attempt); }
    catch (error) {
      if (!isNetworkOffline(error)) throw error;
      if (attempt >= attempts - 1) throw offlineError(RECONNECT_SLOW_MESSAGE);
      options.onWait?.(attempt + 1, now() - startedAt);
      await wait(delayMs);
    }
  }
}

export type ReconnectNoticeOptions = {
  /** 다시 보내기 — 게임에서는 저장(`sync.flushIfDirty`), 로그인에서는 세션 복구. */
  onRetry?: () => void;
  doc?: Document;
  slowAfterMs?: number;
  retryMs?: number;
  slowRetryMs?: number;
  recoveredMs?: number;
};

/**
 * 게임 화면 위에 뜨는 재접속 안내(요청한 '게임에 접속 중입니다…' 팝업).
 *
 * 화면을 막지 않는다 — 사냥은 계속 돌고, 안내만 위에 떠 있다. 다시 붙으면 저절로 사라지고,
 * 20초가 지나면 같은 자리가 '다시 시도' 버튼이 있는 안내로 바뀐다.
 */
export class ReconnectNotice {
  private element?: HTMLElement;
  private text?: HTMLElement;
  private button?: HTMLButtonElement;
  private slowTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;
  private opened = false;
  private slow = false;
  constructor(private options: ReconnectNoticeOptions = {}) {}

  get visible(): boolean { return this.opened; }

  private build(): HTMLElement {
    const doc = this.options.doc ?? document;
    const element = doc.createElement('div');
    element.className = 'reconnect-notice';
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    const spinner = doc.createElement('span');
    spinner.className = 'reconnect-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const text = doc.createElement('p');
    text.className = 'reconnect-text';
    text.textContent = RECONNECT_MESSAGE;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'reconnect-retry';
    button.textContent = '다시 시도';
    button.hidden = true;
    button.onclick = () => { this.retryNow(); };
    element.append(spinner, text, button);
    doc.body.appendChild(element);
    this.element = element; this.text = text; this.button = button;
    return element;
  }

  /** 끊김을 알았다 — 안내를 띄우고 20초 뒤 상태 확인 안내로 넘어갈 준비를 한다. */
  show(): void {
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = undefined; }
    // 이미 떠 있으면 20초 시계를 새로 걸지 않는다 — 3초마다 재시도가 실패해 `show()`가 다시 불리면
    // 장시간 끊김 안내로 넘어갈 시점이 계속 미뤄진다.
    if (this.opened) return;
    const element = this.element ?? this.build();
    this.opened = true;
    this.slow = false;
    element.classList.add('visible');
    element.classList.remove('slow', 'recovered');
    if (this.text) this.text.textContent = RECONNECT_MESSAGE;
    if (this.button) this.button.hidden = true;
    this.scheduleSlow();
    this.scheduleRetry(this.options.retryMs ?? RECONNECT_RETRY_MS);
  }

  /** 다시 붙었다 — 안내를 내리고 복구 문구만 잠깐 남긴다. */
  recovered(): void {
    this.clearTimers();
    if (!this.opened) return;
    this.opened = false; this.slow = false;
    const element = this.element;
    if (!element) return;
    element.classList.remove('slow');
    element.classList.add('recovered');
    if (this.text) this.text.textContent = RECONNECT_RECOVERED_MESSAGE;
    if (this.button) this.button.hidden = true;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = undefined;
      element.classList.remove('visible', 'recovered');
    }, this.options.recoveredMs ?? 1_600);
  }

  /** 안내를 곧바로 내린다(로그아웃·세션 종료처럼 다시 보내도 소용없을 때). */
  hide(): void {
    this.clearTimers();
    this.opened = false; this.slow = false;
    this.element?.classList.remove('visible', 'slow', 'recovered');
  }

  private retryNow(): void {
    if (this.text) this.text.textContent = RECONNECT_MESSAGE;
    if (this.button) this.button.hidden = true;
    this.options.onRetry?.();
    this.scheduleRetry(this.options.retryMs ?? RECONNECT_RETRY_MS);
  }

  private scheduleSlow(): void {
    if (this.slowTimer) clearTimeout(this.slowTimer);
    this.slowTimer = setTimeout(() => { this.slowTimer = undefined; this.escalate(); }, this.options.slowAfterMs ?? RECONNECT_SLOW_AFTER_MS);
  }

  private scheduleRetry(ms: number): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (!this.opened) return;
      this.options.onRetry?.();
      this.scheduleRetry(this.slow ? (this.options.slowRetryMs ?? RECONNECT_SLOW_RETRY_MS) : (this.options.retryMs ?? RECONNECT_RETRY_MS));
    }, ms);
  }

  private escalate(): void {
    if (!this.opened) return;
    this.slow = true;
    this.element?.classList.add('slow');
    if (this.text) this.text.textContent = RECONNECT_SLOW_MESSAGE;
    if (this.button) this.button.hidden = false;
    this.scheduleRetry(this.options.slowRetryMs ?? RECONNECT_SLOW_RETRY_MS);
  }

  private clearTimers(): void {
    if (this.slowTimer) { clearTimeout(this.slowTimer); this.slowTimer = undefined; }
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = undefined; }
    if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = undefined; }
  }
}
