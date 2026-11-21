/**
 * 배포 점검 모드(작업 256).
 *
 * 배포를 시작할 때 `public/maintenance.json`의 `active`를 `true`로, `eta`에 예상 완료 시간을 적어 올린다.
 * 화면은 이 파일을 시작할 때·플레이 중 20초마다·탭이 돌아올 때 다시 읽어서, 점검 중이면 접속 중인
 * 플레이어를 로그인 화면으로 돌려보내고 **"점검 진행 중입니다" + 예상 완료 시간** 모달로 막는다.
 *
 * 파일은 정적 자산이라 Worker·DB를 부르지 않는다(점검마다 추가 비용 없음). 반대로 파일을 읽지 못하면
 * **열린 상태**(`active:false`)로 본다 — 점검 파일 하나가 잘못됐다고 게임이 잠기면 안 된다.
 * 정책 절차는 `AGENTS.md`·`CONTRIBUTING.md` §16에 있다.
 */
export const MAINTENANCE_URL = '/maintenance.json';
export const MAINTENANCE_TITLE = '점검 진행 중입니다';
/** 플레이 중 다시 읽는 간격 — 배포 중에는 로그인 화면이든 사냥 중이든 20초 안에 안내가 뜬다. */
export const MAINTENANCE_REFRESH_MS = 20_000;
/** API가 점검으로 응답했을 때 보여 줄 문구(서버 `error`가 있으면 그것을 쓴다). */
export const MAINTENANCE_API_MESSAGE = '현재 서버 점검 중입니다. 잠시 후 다시 이용해 주세요.';
/** `djrpg-maintenance` — API가 503 점검을 돌려줬다는 신호. `main.ts`가 즉시 점검 파일을 다시 확인한다. */
export const MAINTENANCE_EVENT = 'djrpg-maintenance';

export type MaintenanceState = {
  active: boolean;
  /** 모달 제목 — 기본 `점검 진행 중입니다`. */
  title: string;
  /** 예상 완료 시간 — ISO 시각(`2026-11-21T16:30:00+09:00`) 또는 자유 문구(`오후 4시 30분쯤`). */
  eta: string;
  /** 추가 안내(선택). */
  message: string;
};

/** 파일이 없을 때의 기본값 — 저장소는 항상 열려 있다. */
export const MAINTENANCE_OFF: MaintenanceState = { active: false, title: MAINTENANCE_TITLE, eta: '', message: '' };

const text = (value: unknown, limit: number): string => typeof value === 'string' ? value.trim().slice(0, limit) : '';

/**
 * `maintenance.json`을 점검 상태로 읽는다.
 *
 * `active`는 **boolean `true`만** 점검으로 인정한다(문자열 `"true"`·숫자 1은 열린 상태). 오타·구버전
 * 형식·빈 파일이 와도 던지지 않고 열린 상태를 돌려주므로, 점검 파일이 깨져도 접속이 막히지 않는다.
 */
export function parseMaintenance(raw: unknown): MaintenanceState {
  const body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    active: body.active === true,
    title: text(body.title, 80) || MAINTENANCE_TITLE,
    eta: text(body.eta, 120),
    message: text(body.message, 400),
  };
}

/**
 * `eta`를 화면 문구로 바꾼다 — ISO 시각이면 한국 시간 `11월 21일 16:30`으로, 자유 문구는 그대로 둔다.
 * (서버·빌드 없이 파일만 고쳐 점검을 켜므로, 운영자가 "16:30"·"오후 4시"처럼 적어도 그대로 보인다.)
 */
export function maintenanceEtaText(eta: string): string {
  const raw = (eta ?? '').trim();
  if (!raw) return '';
  const at = /^\d{4}-\d{2}-\d{2}T/.test(raw) ? Date.parse(raw) : NaN;
  if (!Number.isFinite(at)) return raw;
  const parts = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(at));
  const pick = (type: string): string => parts.find(part => part.type === type)?.value ?? '';
  const hour = pick('hour') === '24' ? '00' : pick('hour');
  return `${pick('month')}월 ${pick('day')}일 ${hour}:${pick('minute')}`;
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] as string));

/**
 * 로그인 화면·사냥 화면 위에 얹는 점검 모달 마크업. 점검이 아니면 빈 문자열이라 아무것도 그리지 않는다.
 *
 * 제목·예상 시간·안내는 `maintenance.json`에서 오는 값이라 그대로 넣지 않고 이스케이프한다.
 * `[data-maintenance-check]`(다시 확인)는 호출한 화면이 점검 파일을 다시 읽는 데 쓴다.
 */
export function maintenancePopupMarkup(state: MaintenanceState): string {
  if (!state.active) return '';
  const eta = maintenanceEtaText(state.eta);
  const etaLine = eta
    ? `<p class="maintenance-eta"><span>예상 완료 시간</span><strong>${escapeHtml(eta)}</strong></p>`
    : `<p class="maintenance-eta is-unknown"><span>예상 완료 시간</span><strong>확인 중입니다</strong></p>`;
  const message = state.message ? `<p class="maintenance-note">${escapeHtml(state.message)}</p>` : '';
  return `<div class="maintenance-popup" role="dialog" aria-modal="true" aria-labelledby="maintenance-title">`
    + '<div class="maintenance-card">'
    + '<small class="maintenance-kicker">SERVER MAINTENANCE</small>'
    + `<h2 id="maintenance-title">🛠️ ${escapeHtml(state.title || MAINTENANCE_TITLE)}</h2>`
    + etaLine
    + message
    + '<p class="maintenance-lock">점검이 끝나면 자동으로 다시 열립니다.</p>'
    + '<button class="maintenance-check" type="button" data-maintenance-check>다시 확인</button>'
    + '</div></div>';
}

/**
 * 서버 응답이 **점검** 때문인지 판별한다 — `503`에 코드 `MAINTENANCE`이거나 `X-DJRPG-Maintenance` 헤더.
 * `503 DB_UNAVAILABLE`(DB 일시 장애)과 구분해야 한다: 그것은 점검이 아니라 잠시 뒤 재시도 안내다.
 */
export function isMaintenanceResponse(status: number, body?: unknown, headers?: { get(name: string): string | null }): boolean {
  const code = body && typeof body === 'object' ? String((body as Record<string, unknown>).code ?? '') : '';
  if (code === 'MAINTENANCE') return true;
  return status === 503 && !!headers?.get('x-djrpg-maintenance');
}

/**
 * `/maintenance.json`을 캐시 없이 읽는다. 실패(오프라인·404·JSON 아님)면 `null` — **모르는 상태**이지
 * 점검이 아니다. 호출한 쪽은 마지막으로 알던 상태를 그대로 유지해야 한다.
 */
export async function fetchMaintenance(fetcher?: typeof fetch): Promise<MaintenanceState | null> {
  try {
    const response = await (fetcher ?? fetch)(`${MAINTENANCE_URL}?t=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
    if (!response.ok) return null;
    return parseMaintenance(await response.json());
  } catch { return null; }
}

export type MaintenanceWatchOptions = {
  /** 점검이 **처음 켜진 순간** 한 번 부른다(이미 켜져 있으면 반복 호출하지 않는다). */
  onMaintenance: (state: MaintenanceState) => void;
  fetcher?: typeof fetch;
  intervalMs?: number;
  /** 테스트용 — 타이머를 갈아 끼울 때만 쓴다. */
  timers?: { setInterval: (fn: () => void, ms: number) => unknown; clearInterval: (id: unknown) => void };
  /** 테스트용 — `document`가 없는 환경(단위 테스트)에서 탭 복귀 감시를 끈다. */
  watchVisibility?: boolean;
};

/**
 * 점검 파일을 주기적으로 확인하는 감시자.
 *
 * - `start()`: 곧바로 한 번 확인하고 `intervalMs`(기본 20초)마다 다시 확인한다.
 * - 탭이 다시 보이면(`visibilitychange`) 곧바로 한 번 더 확인한다 — 배포 중에 앱을 내려 두었다 돌아온 경우.
 * - 점검이 켜진 **순간에만** `onMaintenance`를 부르고, 꺼졌다가 다시 켜지면 또 한 번 부른다.
 * - 읽지 못한 응답(`null`)은 상태를 바꾸지 않는다(점검 파일이 잠깐 404여도 접속을 끊지 않는다).
 */
export class MaintenanceWatch {
  private timer?: unknown;
  private listening = false;
  private active = false;
  private busy = false;
  private stopped = false;
  constructor(private options: MaintenanceWatchOptions) {}

  /** 지금 점검 중이라고 판단하고 있는가. */
  get maintenanceActive(): boolean { return this.active; }

  private get interval(): number { return Math.max(5_000, this.options.intervalMs ?? MAINTENANCE_REFRESH_MS); }

  private timers(): NonNullable<MaintenanceWatchOptions['timers']> {
    return this.options.timers ?? {
      setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
      clearInterval: (id: unknown) => clearInterval(id as ReturnType<typeof setInterval>),
    };
  }

  /** 한 번 확인한다. 읽은 상태(읽지 못했으면 `null`)를 돌려준다. */
  async check(): Promise<MaintenanceState | null> {
    if (this.busy) return null;
    this.busy = true;
    try {
      const state = await fetchMaintenance(this.options.fetcher);
      if (!state) return null;
      if (state.active) {
        if (!this.active) { this.active = true; this.options.onMaintenance(state); }
      } else {
        this.active = false;
      }
      return state;
    } finally { this.busy = false; }
  }

  start(): void {
    if (this.stopped || this.timer !== undefined) return;
    void this.check();
    this.timer = this.timers().setInterval(() => { void this.check(); }, this.interval);
    if (this.options.watchVisibility === false || this.listening || typeof document === 'undefined') return;
    this.listening = true;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void this.check(); });
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== undefined) this.timers().clearInterval(this.timer);
    this.timer = undefined;
  }
}

/** API가 503 점검을 돌려줬다고 화면에 알린다(`main.ts`가 듣고 점검 파일을 다시 확인한다). */
export function announceMaintenance(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try { window.dispatchEvent(new Event(MAINTENANCE_EVENT)); } catch { /* 이벤트를 못 보내도 응답 문구는 그대로 */ }
}
