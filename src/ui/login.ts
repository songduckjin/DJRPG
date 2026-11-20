import type { Gender, Job, Save } from '../game/store';
import { jobNames, jobOrDefault } from '../game/skills';
import { apiHeaders, clearVersionReloadMark, isOutdatedResponse, reloadForNewVersion } from '../game/appVersion';

export type Session = { accountId: string; loginId: string; gender: Gender; guest: boolean; token: string; save: Save; revision: number; characterSlot: number; offlineSeconds?: number; newAccount?: boolean; needsSetup?: boolean };
const tokenKey = 'djrpg.auth.token';
// 저장소를 쓸 수 없는 환경(테스트·프라이빗 모드)에서도 토큰 정리가 예외로 번지지 않게 한다.
export function clearToken(): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(tokenKey); } catch { /* 저장소 접근 불가 */ }
}
export async function accountRequest<T>(action: string, data: Record<string, unknown> = {}, token?: string): Promise<T> {
  let response: Response;
  try { response = await fetch('/api/account', { method: 'POST', headers: apiHeaders(token ? { Authorization: `Bearer ${token}` } : {}), body: JSON.stringify({ action, ...data }), keepalive: action === 'save' }); }
  catch { throw new Error('서버에 연결할 수 없습니다. 네트워크 상태를 확인하세요.'); }
  const result = await response.json().catch(() => { throw new Error('서버 응답 형식이 올바르지 않습니다. API 배포를 확인하세요.'); });
  if (!response.ok) {
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
    overlay.innerHTML = `<div class="login-panel"><small class="login-kicker">NEW SEASON</small><h1>새 시즌 시작</h1><p class="login-subtitle">직업과 성별을 선택해 주세요</p><p class="login-note season-note">대공사 업데이트로 새 시즌이 시작되었습니다. 지난 시즌의 레벨·장비·가방·다이아·층수·거래소·창고·던전·월드보스·우편 기록은 모두 초기화되었고, 아이디와 비밀번호는 그대로입니다.<br>직업과 성별을 새로 선택해 모험을 시작하세요! 고른 직업의 무기를 드리며 1층부터 다시 출발합니다. 새 시즌 오픈 기념으로 금화 1,000과 무작위 보물 주머니 1개를 우편으로 보내 드렸습니다.</p><div class="login-gender login-job"><span>직업</span><button type="button" data-job="warrior" class="active">전사</button><button type="button" data-job="archer">궁수</button><button type="button" data-job="mage">마법사</button></div><div class="login-gender"><span>성별</span><button type="button" data-gender="male" class="active">남성 전사</button><button type="button" data-gender="female">여성 전사</button></div><p class="login-error" role="alert" aria-live="polite"></p><button class="login-submit" type="button">이 직업·성별로 시작</button><button class="login-guest" type="button" data-signout>다른 계정으로 로그인</button></div>`;
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

export function openLogin(root: HTMLElement): Promise<Session> {
  return new Promise(resolve => {
    const overlay = document.createElement('div'); overlay.className = 'login-screen';
    overlay.innerHTML = `<div class="login-panel"><small class="login-kicker">THE WASTELAND AWAITS</small><h1>DJRPG</h1><p class="login-subtitle">황야의 층계</p><div class="login-tabs"><button type="button" data-mode="login" class="active">로그인</button><button type="button" data-mode="register">신규 가입</button></div><form class="login-form"><label>아이디 · 닉네임<input name="loginId" autocomplete="username" maxlength="16" required></label><label>비밀번호<input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="72" required></label><div class="login-gender login-job" hidden><span>직업</span><button type="button" data-job="warrior" class="active">전사</button><button type="button" data-job="archer">궁수</button><button type="button" data-job="mage">마법사</button></div><div class="login-gender" hidden><span>성별</span><button type="button" data-gender="male" class="active">남성 전사</button><button type="button" data-gender="female">여성 전사</button></div><p class="login-error" role="alert" aria-live="polite"></p><button class="login-submit" type="submit">로그인</button></form><button class="login-guest" type="button">게스트로 시작하기</button><p class="login-note">계정과 진행 상황은 서버에 저장됩니다.</p></div>`;
    root.appendChild(overlay);
    const form = overlay.querySelector<HTMLFormElement>('.login-form')!;
    const idInput = form.elements.namedItem('loginId') as HTMLInputElement;
    const passwordInput = form.elements.namedItem('password') as HTMLInputElement;
    const error = overlay.querySelector<HTMLElement>('.login-error')!;
    const genderRow = overlay.querySelector<HTMLElement>('.login-gender:not(.login-job)')!;
    const jobRow = overlay.querySelector<HTMLElement>('.login-job')!;
    const genderButtons = overlay.querySelectorAll<HTMLButtonElement>('[data-gender]');
    const labelGenders = () => genderButtons.forEach(button => { button.textContent = `${button.dataset.gender === 'female' ? '여성' : '남성'} ${jobNames[job]}`; });
    const submit = overlay.querySelector<HTMLButtonElement>('.login-submit')!;
    const guest = overlay.querySelector<HTMLButtonElement>('.login-guest')!;
    let mode: 'login' | 'register' = 'login', gender: Gender = 'male', job: Job = 'warrior';
    // 시즌 초기화된 계정은 로그인·자동 복원 직후 새 시즌 설정을 받는다(작업 206).
    const finish = async (session: Session) => {
      let ready = session;
      if (session.needsSetup === true || session.save?.needsSetup === true) {
        overlay.style.display = 'none';
        try { ready = await openSeasonSetup(root, session); } catch { overlay.style.display = ''; return; }
      }
      overlay.remove(); resolve(ready);
    };
    const fail = (cause: unknown) => { error.textContent = cause instanceof Error ? cause.message : `로그인할 수 없습니다: ${String(cause)}`; };
    const stored = localStorage.getItem(tokenKey);
    if (stored) { submit.disabled = guest.disabled = true; error.textContent = '지난 계정 확인 중…'; begin('load', {}, stored).then(finish).catch(cause => { if (cause instanceof Error && 'status' in cause && cause.status === 401) clearToken(); fail(cause); }).finally(() => { submit.disabled = guest.disabled = false; }); }
    overlay.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.onclick = () => {
      mode = button.dataset.mode === 'register' ? 'register' : 'login';
      overlay.querySelectorAll('[data-mode]').forEach(tab => tab.classList.toggle('active', tab === button));
      genderRow.hidden = jobRow.hidden = mode !== 'register';
      passwordInput.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
      submit.textContent = mode === 'register' ? '계정 만들기' : '로그인';
      error.textContent = '';
    });
    overlay.querySelectorAll<HTMLButtonElement>('[data-gender]').forEach(button => button.onclick = () => {
      gender = button.dataset.gender === 'female' ? 'female' : 'male';
      overlay.querySelectorAll('[data-gender]').forEach(choice => choice.classList.toggle('active', choice === button));
    });
    overlay.querySelectorAll<HTMLButtonElement>('[data-job]').forEach(button => button.onclick = () => {
      job = jobOrDefault(button.dataset.job);
      overlay.querySelectorAll('[data-job]').forEach(choice => choice.classList.toggle('active', choice === button));
      labelGenders();
    });
    form.onsubmit = async event => {
      event.preventDefault(); error.textContent = ''; submit.disabled = true;
      try { finish(await begin(mode, { loginId: idInput.value, password: passwordInput.value, gender, job })); }
      catch (cause) { fail(cause); }
      finally { submit.disabled = false; }
    };
    guest.onclick = async () => { error.textContent = ''; guest.disabled = true; try { finish(await begin('guest')); } catch (cause) { fail(cause); } finally { guest.disabled = false; } };
  });
}
