import type { Gender, Save } from '../game/store';

export type Session = { accountId: string; loginId: string; gender: Gender; guest: boolean; token: string; save: Save; revision: number; characterSlot: number; offlineSeconds?: number; newAccount?: boolean };
const tokenKey = 'djrpg.auth.token';
export function clearToken(): void { localStorage.removeItem(tokenKey); }
export async function accountRequest<T>(action: string, data: Record<string, unknown> = {}, token?: string): Promise<T> {
  let response: Response;
  try { response = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action, ...data }), keepalive: action === 'save' }); }
  catch { throw new Error('서버에 연결할 수 없습니다. 네트워크 상태를 확인하세요.'); }
  const result = await response.json().catch(() => { throw new Error('서버 응답 형식이 올바르지 않습니다. API 배포를 확인하세요.'); });
  if (!response.ok) { const error = new Error(typeof result.error === 'string' ? result.error : `서버 요청 실패 (${response.status})`) as Error & { status: number; code: string }; error.status = response.status; error.code = result.code; throw error; }
  return result as T;
}
async function begin(action: string, data: Record<string, unknown> = {}, token?: string): Promise<Session> {
  const session = await accountRequest<Session>(action, data, token);
  if (!session || typeof session.token !== 'string' || typeof session.accountId !== 'string' || !session.save || session.save.version !== 1 || !Number.isSafeInteger(session.revision) || !Number.isInteger(session.characterSlot)) throw new Error('계정 데이터가 올바르지 않습니다. 서버 상태를 확인하세요.');
  localStorage.setItem(tokenKey, session.token);
  session.newAccount = action === 'register';
  return session;
}

export function openLogin(root: HTMLElement): Promise<Session> {
  return new Promise(resolve => {
    const overlay = document.createElement('div'); overlay.className = 'login-screen';
    overlay.innerHTML = `<div class="login-panel"><small class="login-kicker">THE WASTELAND AWAITS</small><h1>DJRPG</h1><p class="login-subtitle">황야의 층계</p><div class="login-tabs"><button type="button" data-mode="login" class="active">로그인</button><button type="button" data-mode="register">신규 가입</button></div><form class="login-form"><label>아이디 · 닉네임<input name="loginId" autocomplete="username" maxlength="16" required></label><label>비밀번호<input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="72" required></label><div class="login-gender" hidden><span>전사 성별</span><button type="button" data-gender="male" class="active">남성 전사</button><button type="button" data-gender="female">여성 전사</button></div><p class="login-error" role="alert" aria-live="polite"></p><button class="login-submit" type="submit">로그인</button></form><button class="login-guest" type="button">게스트로 시작하기</button><p class="login-note">계정과 진행 상황은 서버에 저장됩니다.</p></div>`;
    root.appendChild(overlay);
    const form = overlay.querySelector<HTMLFormElement>('.login-form')!;
    const idInput = form.elements.namedItem('loginId') as HTMLInputElement;
    const passwordInput = form.elements.namedItem('password') as HTMLInputElement;
    const error = overlay.querySelector<HTMLElement>('.login-error')!;
    const genderRow = overlay.querySelector<HTMLElement>('.login-gender')!;
    const submit = overlay.querySelector<HTMLButtonElement>('.login-submit')!;
    const guest = overlay.querySelector<HTMLButtonElement>('.login-guest')!;
    let mode: 'login' | 'register' = 'login', gender: Gender = 'male';
    const finish = (session: Session) => { overlay.remove(); resolve(session); };
    const fail = (cause: unknown) => { error.textContent = cause instanceof Error ? cause.message : `로그인할 수 없습니다: ${String(cause)}`; };
    const stored = localStorage.getItem(tokenKey);
    if (stored) { submit.disabled = guest.disabled = true; error.textContent = '지난 계정 확인 중…'; begin('load', {}, stored).then(finish).catch(cause => { if (cause instanceof Error && 'status' in cause && cause.status === 401) clearToken(); fail(cause); }).finally(() => { submit.disabled = guest.disabled = false; }); }
    overlay.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.onclick = () => {
      mode = button.dataset.mode === 'register' ? 'register' : 'login';
      overlay.querySelectorAll('[data-mode]').forEach(tab => tab.classList.toggle('active', tab === button));
      genderRow.hidden = mode !== 'register';
      passwordInput.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
      submit.textContent = mode === 'register' ? '계정 만들기' : '로그인';
      error.textContent = '';
    });
    overlay.querySelectorAll<HTMLButtonElement>('[data-gender]').forEach(button => button.onclick = () => {
      gender = button.dataset.gender === 'female' ? 'female' : 'male';
      overlay.querySelectorAll('[data-gender]').forEach(choice => choice.classList.toggle('active', choice === button));
    });
    form.onsubmit = async event => {
      event.preventDefault(); error.textContent = ''; submit.disabled = true;
      try { finish(await begin(mode, { loginId: idInput.value, password: passwordInput.value, gender })); }
      catch (cause) { fail(cause); }
      finally { submit.disabled = false; }
    };
    guest.onclick = async () => { error.textContent = ''; guest.disabled = true; try { finish(await begin('guest')); } catch (cause) { fail(cause); } finally { guest.disabled = false; } };
  });
}
