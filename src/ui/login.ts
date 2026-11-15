import { freshSave, saveStorageKey, type Gender } from '../game/store';

export type Session = { accountId: string; loginId: string; gender: Gender; guest: boolean };
type Account = { id: string; loginId: string; gender: Gender; salt: string; hash: string };
const accountsKey = 'djrpg.accounts.v1';
const lastLoginKey = 'djrpg.lastLogin.v1';

function accounts(): Account[] {
  const raw = localStorage.getItem(accountsKey);
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(value => typeof value === 'object' && value !== null && typeof value.id === 'string' && typeof value.loginId === 'string' && typeof value.salt === 'string' && typeof value.hash === 'string' && (value.gender === 'male' || value.gender === 'female'))) throw new Error('저장된 계정 목록을 읽을 수 없습니다.');
  return data as Account[];
}

function hex(bytes: Uint8Array): string { return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''); }
function unhex(value: string): Uint8Array { return Uint8Array.from(value.match(/.{2}/g) ?? [], part => Number.parseInt(part, 16)); }
async function passwordHash(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 120_000, hash: 'SHA-256' }, key, 256);
  return hex(new Uint8Array(bits));
}
function matches(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

export interface AuthProvider {
  lastLoginId(): string;
  login(loginId: string, password: string): Promise<Session>;
  register(loginId: string, password: string, gender: Gender): Promise<Session>;
  guest(): Session;
}

export const localAuth: AuthProvider = {
  lastLoginId: () => localStorage.getItem(lastLoginKey) ?? '',
  async login(loginId, password) {
    const account = accounts().find(record => record.loginId.toLocaleLowerCase('ko-KR') === loginId.trim().toLocaleLowerCase('ko-KR'));
    if (!account || !matches(await passwordHash(password, unhex(account.salt)), account.hash)) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
    localStorage.setItem(lastLoginKey, account.loginId);
    return { accountId: account.id, loginId: account.loginId, gender: account.gender, guest: false };
  },
  async register(loginId, password, gender) {
    const name = loginId.trim();
    if (!/^[가-힣a-zA-Z0-9_]{2,16}$/.test(name)) throw new Error('아이디는 한글·영문·숫자·밑줄 2~16자로 입력하세요.');
    if (password.length < 8 || password.length > 72) throw new Error('비밀번호는 8~72자로 입력하세요.');
    const existing = accounts();
    if (existing.some(record => record.loginId.toLocaleLowerCase('ko-KR') === name.toLocaleLowerCase('ko-KR'))) throw new Error('이미 사용 중인 아이디입니다.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const account: Account = { id: crypto.randomUUID(), loginId: name, gender, salt: hex(salt), hash: await passwordHash(password, salt) };
    const save = freshSave(gender); save.accountId = account.id; save.name = name;
    localStorage.setItem(saveStorageKey(account.id), JSON.stringify(save));
    try { localStorage.setItem(accountsKey, JSON.stringify([...existing, account])); }
    catch (error) { localStorage.removeItem(saveStorageKey(account.id)); throw error; }
    localStorage.setItem(lastLoginKey, name);
    return { accountId: account.id, loginId: name, gender, guest: false };
  },
  guest: () => ({ accountId: 'guest', loginId: '게스트', gender: 'male', guest: true })
};

export function openLogin(root: HTMLElement, auth: AuthProvider = localAuth): Promise<Session> {
  return new Promise(resolve => {
    const overlay = document.createElement('div'); overlay.className = 'login-screen';
    overlay.innerHTML = `<div class="login-panel"><small class="login-kicker">THE WASTELAND AWAITS</small><h1>DJRPG</h1><p class="login-subtitle">황야의 층계</p><div class="login-tabs"><button type="button" data-mode="login" class="active">로그인</button><button type="button" data-mode="register">신규 가입</button></div><form class="login-form"><label>아이디 · 닉네임<input name="loginId" autocomplete="username" maxlength="16" required></label><label>비밀번호<input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="72" required></label><div class="login-gender" hidden><span>전사 성별</span><button type="button" data-gender="male" class="active">남성 전사</button><button type="button" data-gender="female">여성 전사</button></div><p class="login-error" role="alert" aria-live="polite"></p><button class="login-submit" type="submit">로그인</button></form><button class="login-guest" type="button">게스트로 이어하기</button><p class="login-note">계정과 진행 상황은 현재 기기에 저장됩니다.</p></div>`;
    root.appendChild(overlay);
    const form = overlay.querySelector<HTMLFormElement>('.login-form')!;
    const idInput = form.elements.namedItem('loginId') as HTMLInputElement;
    const passwordInput = form.elements.namedItem('password') as HTMLInputElement;
    const error = overlay.querySelector<HTMLElement>('.login-error')!;
    const genderRow = overlay.querySelector<HTMLElement>('.login-gender')!;
    const submit = overlay.querySelector<HTMLButtonElement>('.login-submit')!;
    let mode: 'login' | 'register' = 'login', gender: Gender = 'male';
    try { idInput.value = auth.lastLoginId(); }
    catch (cause) { error.textContent = `계정 정보를 읽지 못했습니다: ${String(cause)}`; }
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
      try {
        const session = mode === 'login' ? await auth.login(idInput.value, passwordInput.value) : await auth.register(idInput.value, passwordInput.value, gender);
        overlay.remove(); resolve(session);
      } catch (cause) { error.textContent = cause instanceof Error ? cause.message : `로그인할 수 없습니다: ${String(cause)}`; }
      finally { submit.disabled = false; }
    };
    overlay.querySelector<HTMLButtonElement>('.login-guest')!.onclick = () => { overlay.remove(); resolve(auth.guest()); };
  });
}
