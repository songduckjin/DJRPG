import type { Gender, Job, Save } from '../game/store';
import { jobNames, jobOrDefault } from '../game/skills';
import { apiHeaders, clearVersionReloadMark, isOutdatedResponse, reloadForNewVersion } from '../game/appVersion';
import { RECONNECT_LOGIN_ATTEMPTS, RECONNECT_MANUAL_ATTEMPTS, RECONNECT_RETRY_MS, isNetworkOffline, offlineError, reconnectStage, retryNetwork } from './reconnect';
import { MAINTENANCE_API_MESSAGE, MaintenanceWatch, announceMaintenance, isMaintenanceResponse, type MaintenanceState } from '../game/maintenance';
import { setLoginBlocked, showMaintenancePopup, type MaintenancePopup } from './maintenance';

export type Session = { accountId: string; loginId: string; gender: Gender; job?: Job; guest: boolean; token: string; save: Save; revision: number; characterSlot: number; offlineSeconds?: number; newAccount?: boolean; needsSetup?: boolean;
  /** 아직 캐릭터를 만들지 않은 계정(작업 216) — 가입 직후에는 사냥터 대신 캐릭터 생성 화면으로 간다. */
  needsCharacter?: boolean };
const tokenKey = 'djrpg.auth.token';
/**
 * 서버 점검·정적 폴백 안내(작업 256).
 *
 * [작업 242]의 하드코딩 배너(`2026-11-21T09:00`까지)는 한 번의 사고용이었고, 이제 점검은
 * `public/maintenance.json` 하나로 켜고 끈다(정책: `AGENTS.md`·`CONTRIBUTING.md` §16). API가 405나
 * 비 JSON(정적 폴백)을 돌려줄 때 쓰는 문구만 남긴다 — 시각을 박아 두지 않으므로 어느 배포에서든 맞다.
 */
export const SERVER_UNAVAILABLE_MESSAGE = '현재 서버 점검 중입니다. 잠시 후 다시 이용해 주세요.';
export function serverUnavailableMessage(): string { return SERVER_UNAVAILABLE_MESSAGE; }

// 저장소를 쓸 수 없는 환경(테스트·프라이빗 모드)에서도 토큰 정리가 예외로 번지지 않게 한다.
export function clearToken(): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(tokenKey); } catch { /* 저장소 접근 불가 */ }
}
/**
 * 탈퇴한 계정의 흔적을 이 기기에서 지운다(작업 223).
 *
 * 토큰만 지우면 로그인 화면이 옛 로컬 세이브(`djrpg.accounts.v1`·`djrpg.save.v1.*`)를 새 계정으로
 * 끌어오려 하고, 게스트 화면에는 지운 계정의 진행이 남는다. 세션 토큰과 함께 그 키들도 지운다.
 */
export function clearLocalAccount(): void {
  clearToken();
  if (typeof localStorage === 'undefined') return;
  try {
    const keys = ['djrpg.accounts.v1', 'djrpg.lastLogin.v1', 'djrpg-save-v1'];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key && key.startsWith('djrpg.save.v1')) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch { /* 저장소 접근 불가 */ }
}
/** 점검·정적 폴백 안내를 빨간 오류가 아닌 안내 톤으로 띄우기 위한 표시. */
type NoticeError = Error & { notice?: true };
function serverUnavailableError(): NoticeError {
  const error = new Error(serverUnavailableMessage()) as NoticeError;
  error.notice = true;
  return error;
}
export async function accountRequest<T>(action: string, data: Record<string, unknown> = {}, token?: string): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  // [작업 251] 창을 내렸다가 돌아온 직후에는 요청이 끊긴다 — 이때의 문구는 "서버에 연결할 수 없습니다"가 아니라
  // 재연결 안내(`게임에 접속 중입니다…`)다. 화면·저장 쪽이 `NETWORK_OFFLINE` 코드를 보고 스스로 다시 보낸다.
  try { response = await fetch('/api/account', { method: 'POST', headers: apiHeaders(token ? { Authorization: `Bearer ${token}` } : {}), body: JSON.stringify({ action, ...data }), keepalive: action === 'save', signal: controller.signal }); }
  catch { throw offlineError(); }
  finally { clearTimeout(timeout); }
  // [작업 242] API 일일 한도를 다 쓰면 `/api/account`가 빈 본문 405(정적 폴백)를 돌려준다 —
  // 이때 `response.json()`이 실패해 개발자용 문구가 빨갛게 떴다. 점검 안내로 바꾼다.
  if (response.status === 405) throw serverUnavailableError();
  // 본문을 받다가 끊긴 경우(창 전환·지하철)도 서버 점검이 아니라 재연결이다(작업 251).
  const result = await response.json().catch((cause: unknown) => { throw isNetworkOffline(cause) ? offlineError() : serverUnavailableError(); });
  if (!response.ok) {
    // 점검 응답(503 MAINTENANCE)은 서버 장애와 구분해 점검 안내로 보여 주고, 화면이 점검 파일을
    // 즉시 다시 읽도록 알린다(`main.ts`가 듣는다). DB 일시 장애(503 DB_UNAVAILABLE)는 그대로 둔다.
    if (isMaintenanceResponse(response.status, result, response.headers)) {
      announceMaintenance();
      const notice = new Error(typeof result.error === 'string' && result.error ? result.error : MAINTENANCE_API_MESSAGE) as Error & { status: number; code: string; notice?: true };
      notice.status = response.status; notice.code = 'MAINTENANCE'; notice.notice = true;
      throw notice;
    }
    const error = new Error(typeof result.error === 'string' ? result.error : `서버 요청 실패 (${response.status})`) as Error & { status: number; code: string; expected?: string };
    error.status = response.status; error.code = result.code; error.expected = result.expected;
    // 새 버전이 배포됐다는 응답이면 진행 중인 저장을 멈추고 새 번들을 내려받는다.
    if (isOutdatedResponse(response.status, result.code, result.expected)) reloadForNewVersion();
    throw error;
  }
  clearVersionReloadMark();
  return result as T;
}
async function begin(action: string, data: Record<string, unknown> = {}, token?: string): Promise<Session> {
  const session = await accountRequest<Session>(action, data, token);
  if (!session || typeof session.token !== 'string' || typeof session.accountId !== 'string' || !session.save || session.save.version !== 1 || !Number.isSafeInteger(session.revision) || !Number.isInteger(session.characterSlot)) throw new Error('계정 데이터가 올바르지 않습니다. 서버 상태를 확인하세요.');
  localStorage.setItem(tokenKey, session.token);
  session.newAccount = action === 'register';
  return session;
}

/** 새 시즌 설정 화면(작업 206) — 시즌 초기화로 비워진 계정이 로그인 직후 직업·성별을 고른다.
 *  고른 값은 `completeSetup`으로 보내고, 그 응답의 새 1층 캐릭터 세이브로 인계한다. */
export function openSeasonSetup(root: HTMLElement, session: Session): Promise<Session> {
  return new Promise(resolve => {
    const overlay = document.createElement('div'); overlay.className = 'login-screen season-setup';
    overlay.innerHTML = `<div class="login-panel"><small class="login-kicker">NEW SEASON</small><h1>새 시즌 시작</h1><p class="login-subtitle">직업과 성별을 선택해 주세요</p><p class="login-note season-note">대공사 업데이트로 새 시즌이 시작되었습니다. 지난 시즌의 레벨·장비·가방·다이아·층수·거래소·창고·던전·월드보스·우편 기록은 모두 초기화되었고, 아이디와 비밀번호는 그대로입니다.<br>직업과 성별을 새로 선택해 모험을 시작하세요! 고른 직업의 무기를 드리며 1층부터 다시 출발합니다. 초기화 보상으로 다이아 5,000개와 무작위 보물 주머니 30개를 우편함에 넣어 두었습니다.</p><div class="login-gender login-job"><span>직업</span><button type="button" data-job="warrior" class="active">전사</button><button type="button" data-job="archer">궁수</button><button type="button" data-job="mage">마법사</button></div><div class="login-gender"><span>성별</span><button type="button" data-gender="male" class="active">남성 전사</button><button type="button" data-gender="female">여성 전사</button></div><p class="login-error" role="alert" aria-live="polite"></p><button class="login-submit" type="button">이 직업·성별로 시작</button><button class="login-guest" type="button" data-signout>다른 계정으로 로그인</button></div>`;
    root.appendChild(overlay);
    const error = overlay.querySelector<HTMLElement>('.login-error')!;
    const submit = overlay.querySelector<HTMLButtonElement>('.login-submit')!;
    const genderButtons = overlay.querySelectorAll<HTMLButtonElement>('[data-gender]');
    let gender: Gender = 'male', job: Job = jobOrDefault(session.save?.job);
    const labelGenders = () => genderButtons.forEach(button => { button.textContent = `${button.dataset.gender === 'female' ? '여성' : '남성'} ${jobNames[job]}`; });
    labelGenders();
    overlay.querySelectorAll<HTMLButtonElement>('[data-job]').forEach(button => {
      button.classList.toggle('active', jobOrDefault(button.dataset.job) === job);
      button.onclick = () => {
        job = jobOrDefault(button.dataset.job);
        overlay.querySelectorAll('[data-job]').forEach(choice => choice.classList.toggle('active', choice === button));
        labelGenders();
      };
    });
    overlay.querySelectorAll<HTMLButtonElement>('[data-gender]').forEach(button => button.onclick = () => {
      gender = button.dataset.gender === 'female' ? 'female' : 'male';
      overlay.querySelectorAll('[data-gender]').forEach(choice => choice.classList.toggle('active', choice === button));
    });
    overlay.querySelector<HTMLButtonElement>('[data-signout]')!.onclick = () => { clearToken(); location.reload(); };
    submit.onclick = async () => {
      error.textContent = ''; submit.disabled = true; submit.textContent = '새 캐릭터를 만드는 중…';
      try {
        const next = await accountRequest<Session>('completeSetup', { gender, job }, session.token);
        overlay.remove();
        localStorage.setItem(tokenKey, session.token);
        resolve({ ...session, ...next, token: session.token, newAccount: false, needsSetup: false });
      } catch (cause) {
        submit.textContent = '이 직업·성별로 시작';
        error.textContent = cause instanceof Error ? cause.message : '새 시즌을 시작할 수 없습니다. 잠시 뒤 다시 시도해 주세요.';
        submit.disabled = false;
      }
    };
  });
}

/**
 * 신규 가입 뒤(또는 아직 캐릭터를 만들지 않은 계정의 접속 뒤) 캐릭터 생성 단계(작업 216).
 *
 * 가입 단계에서는 아이디·비밀번호만 받으므로, 이 화면에서 **닉네임·직업·성별**을 정해 첫 캐릭터를
 * 만든다(성별 버튼은 `남`/`여`만). 만들고 나면 그 캐릭터의 세이브·리비전으로 세션을 갱신해 바로
 * 사냥터로 이어진다. 기존 계정 로그인·게스트 흐름은 이 단계를 거치지 않는다.
 */
function characterStep(overlay: HTMLElement, session: Session): Promise<Session> {
  return new Promise(resolve => {
    const panel = overlay.querySelector<HTMLElement>('.login-panel')!;
    panel.querySelectorAll<HTMLElement>('.login-tabs, .login-form, .login-guest, .login-note').forEach(node => { node.hidden = true; });
    const step = document.createElement('form'); step.className = 'login-create';
    step.innerHTML = '<p class="login-create-title">캐릭터 만들기</p><p class="login-create-note">닉네임과 직업, 성별을 정하면 사냥터로 입장합니다.</p>'
      + `<label>닉네임<input name="characterName" required minlength="2" maxlength="16" pattern="[가-힣a-zA-Z0-9_]{2,16}" autocomplete="off" enterkeyhint="done"></label>`
      + '<div class="login-gender login-job"><span>직업</span><button type="button" data-job="warrior" class="active">전사</button><button type="button" data-job="archer">궁수</button><button type="button" data-job="mage">마법사</button></div>'
      + '<div class="login-gender"><span>성별</span><button type="button" data-gender="male" class="active">남</button><button type="button" data-gender="female">여</button></div>'
      + '<p class="login-error" role="alert" aria-live="polite"></p><button class="login-submit" type="submit">캐릭터 생성</button>';
    panel.append(step);
    const nameInput = step.elements.namedItem('characterName') as HTMLInputElement;
    const error = step.querySelector<HTMLElement>('.login-error')!;
    const submit = step.querySelector<HTMLButtonElement>('.login-submit')!;
    let job: Job = 'warrior', gender: Gender = 'male';
    step.querySelectorAll<HTMLButtonElement>('[data-job]').forEach(button => button.onclick = () => {
      job = jobOrDefault(button.dataset.job);
      step.querySelectorAll('[data-job]').forEach(choice => choice.classList.toggle('active', choice === button));
    });
    step.querySelectorAll<HTMLButtonElement>('[data-gender]').forEach(button => button.onclick = () => {
      gender = button.dataset.gender === 'female' ? 'female' : 'male';
      step.querySelectorAll('[data-gender]').forEach(choice => choice.classList.toggle('active', choice === button));
    });
    step.onsubmit = async event => {
      event.preventDefault(); error.textContent = ''; submit.disabled = true;
      try {
        const created = await accountRequest<{ characterSlot: number; revision: number; save: Save }>('createCharacter',
          { slot: session.characterSlot, name: nameInput.value.trim(), gender, job, revision: session.revision }, session.token);
        resolve({ ...session, save: created.save, revision: created.revision, characterSlot: created.characterSlot, gender, job, needsCharacter: false });
      } catch (cause) { error.textContent = cause instanceof Error ? cause.message : String(cause); submit.disabled = false; }
    };
    try { nameInput.focus({ preventScroll: true }); } catch { /* 자동 포커스 불가 */ }
  });
}

export function openLogin(root: HTMLElement): Promise<Session> {
  return new Promise(resolve => {
    const overlay = document.createElement('div'); overlay.className = 'login-screen';
    overlay.innerHTML = `<div class="login-panel"><small class="login-kicker">THE WASTELAND AWAITS</small><h1>DJRPG</h1><p class="login-subtitle">황야의 층계</p><div class="login-tabs"><button type="button" data-mode="login" class="active">로그인</button><button type="button" data-mode="register">신규 가입</button></div><form class="login-form"><label>아이디<input name="loginId" autocomplete="username" maxlength="16" required></label><label>비밀번호<input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="72" required></label><p class="login-error" role="alert" aria-live="polite"></p><button class="login-submit" type="submit">로그인</button></form><button class="login-guest" type="button">게스트로 시작하기</button><p class="login-note">계정과 진행 상황은 서버에 저장됩니다.</p></div>`;
    root.appendChild(overlay);
    const form = overlay.querySelector<HTMLFormElement>('.login-form')!;
    const idInput = form.elements.namedItem('loginId') as HTMLInputElement;
    const passwordInput = form.elements.namedItem('password') as HTMLInputElement;
    const error = overlay.querySelector<HTMLElement>('.login-error')!;
    const submit = overlay.querySelector<HTMLButtonElement>('.login-submit')!;
    const guest = overlay.querySelector<HTMLButtonElement>('.login-guest')!;
    let mode: 'login' | 'register' = 'login';
    // 점검 모드(작업 256): 시작할 때 `maintenance.json`을 읽고, 켜져 있으면 로그인·게스트를 잠근 채
    // "점검 진행 중입니다" + 예상 시간 모달로 막는다. 점검이 풀리면 모달을 내리고 다시 열린다.
    let popup: MaintenancePopup | null = null;
    const applyMaintenance = (state: MaintenanceState) => {
      popup?.remove(); popup = null;
      setLoginBlocked(overlay, state.active);
      if (state.active) popup = showMaintenancePopup(overlay, state, () => { void recheck(); });
    };
    const recheck = async () => {
      const state = await watch.check();
      if (!state) { popup?.busy(false); say('점검 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.', true); return; }
      applyMaintenance(state);
    };
    const watch = new MaintenanceWatch({ onMaintenance: applyMaintenance });
    // 시즌 초기화된 계정은 로그인·자동 복원 직후 새 시즌 설정을 받는다(작업 206).
    // 가입 직후(또는 아직 캐릭터가 없는 계정)는 캐릭터 생성 화면을 먼저 거친다(작업 216).
    const finish = async (session: Session) => {
      if (watch.maintenanceActive) { say(MAINTENANCE_API_MESSAGE, true); return; }
      let ready = session;
      if (ready.needsSetup === true || ready.save?.needsSetup === true) {
        overlay.style.display = 'none';
        try { ready = await openSeasonSetup(root, ready); } catch { overlay.style.display = ''; return; }
      }
      if (ready.needsCharacter === true) {
        try { ready = await characterStep(overlay, ready); } catch (cause) { fail(cause); return; }
      }
      watch.stop(); popup?.remove(); popup = null;
      overlay.remove(); resolve(ready);
    };
    // 점검 안내는 빨간 오류가 아니라 안내 톤(주황)으로 띄운다 — 이용자가 고장으로 읽지 않게 한다.
    // `busy`면 문구 앞에 도는 표시를 붙여 "멈춘 화면"이 아니라 "붙는 중"으로 보이게 한다(작업 251).
    const say = (text: string, notice = false, busy = false) => { error.textContent = text; error.classList.toggle('is-notice', notice); error.classList.toggle('is-connecting', busy); };
    const fail = (cause: unknown) => say(cause instanceof Error ? cause.message : `로그인할 수 없습니다: ${String(cause)}`, cause instanceof Error && (cause as NoticeError).notice === true);
    /**
     * 연결 요청(작업 251) — 창을 내렸다가 돌아오면 iOS가 그 사이 요청을 끊는다.
     *
     * 끊김은 빨간 오류가 아니라 `게임에 접속 중입니다…` 안내로 보여 주고 몇 초마다 스스로 다시 보낸다.
     * 20초가 지나도 붙지 않으면 '네트워크 상태를 확인한 뒤 다시 시도' 안내로 바뀌고, 그때는 이용자가
     * 로그인 버튼을 다시 누르면 된다. 이용자가 직접 누른 경우(MANUAL_ATTEMPTS)에는 오래 기다리게 하지 않는다.
     */
    const connect = (action: string, data: Record<string, unknown> = {}, token?: string, attempts = RECONNECT_MANUAL_ATTEMPTS): Promise<Session> => (
      retryNetwork(() => begin(action, data, token), {
        attempts,
        delayMs: RECONNECT_RETRY_MS,
        onWait: (_attempt, elapsedMs) => { const stage = reconnectStage(elapsedMs); say(stage.message, true, stage.kind === 'connecting'); },
      })
    );
    const stored = localStorage.getItem(tokenKey);
    // 저장된 토큰의 자동 복원은 **첫 점검 확인 뒤에** 시작한다 — 점검 중이면 예전 진행으로 조용히
    // 사냥터에 들어가지 않고, 모달이 뜬 로그인 화면에 머문다.
    const restoreStored = () => {
      if (!stored) return;
      submit.disabled = guest.disabled = true; say('지난 계정 확인 중…');
      connect('load', {}, stored, RECONNECT_LOGIN_ATTEMPTS).then(finish).catch(cause => { if (cause instanceof Error && 'status' in cause && cause.status === 401) clearToken(); fail(cause); }).finally(() => { submit.disabled = guest.disabled = false; error.classList.remove('is-connecting'); });
    };
    void watch.check().then(state => {
      if (state) applyMaintenance(state);
      if (watch.maintenanceActive) { watch.start(); return; }
      restoreStored();
      watch.start();
    });
    overlay.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.onclick = () => {
      mode = button.dataset.mode === 'register' ? 'register' : 'login';
      overlay.querySelectorAll('[data-mode]').forEach(tab => tab.classList.toggle('active', tab === button));
      // [작업 216] 가입 탭은 아이디·비밀번호만 받는다 — 직업·성별은 캐릭터 생성 화면에서 고른다.
      passwordInput.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
      submit.textContent = mode === 'register' ? '계정 만들기' : '로그인';
      say('');
    });
    form.onsubmit = async event => {
      event.preventDefault(); say('');
      if (watch.maintenanceActive) { say(MAINTENANCE_API_MESSAGE, true); return; }
      submit.disabled = true;
      try { await finish(await connect(mode, { loginId: idInput.value, password: passwordInput.value })); }
      catch (cause) { fail(cause); }
      finally { submit.disabled = watch.maintenanceActive; error.classList.remove('is-connecting'); }
    };
    guest.onclick = async () => { say(''); if (watch.maintenanceActive) { say(MAINTENANCE_API_MESSAGE, true); return; } guest.disabled = true; try { await finish(await connect('guest')); } catch (cause) { fail(cause); } finally { guest.disabled = watch.maintenanceActive; error.classList.remove('is-connecting'); } };
  });
}
