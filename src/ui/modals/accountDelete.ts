import type { Interface } from '../interface';
import { accountRequest, clearLocalAccount } from '../login';

/**
 * 계정 탈퇴(아이디 삭제) 확인창 — 작업 223.
 *
 * 캐릭터 삭제 확인창(작업 206)과 같은 이유로 브라우저 기본 입력창을 쓰지 않는다. iOS 인앱 브라우저에서는
 * 시스템 얼럿으로 떠 게임 UI와 어긋나고, 비밀번호를 잘못 넣었을 때 아무 말 없이 끝난다. 확인은
 * **비밀번호 재확인 + 아이디 입력** 두 가지이고, 실패 안내는 확인창 안에 남긴다.
 *
 * 계정 정보 모달은 사냥 중에도 다시 그려지므로(로비 저장이 끝날 때마다), 이 확인창은 모달 안이 아니라
 * 같은 화면 위에 한 겹 따로 얹는다. 목록 모달이 닫히면 함께 닫힌다.
 */

function element(tag: string, className = '', text = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const mismatch = (label: string): string => `${label}를 정확히 입력해 주세요.`;

/** 탈퇴 확인에 필요한 입력(비밀번호·아이디)을 실제로 채웠는지 — 버튼 강조와 제출 검사가 같이 쓴다. */
export function deleteAccountReady(typed: string, expected: string, password: string, guest: boolean): boolean {
  return typed.trim().toLocaleLowerCase('ko-KR') === expected.trim().toLocaleLowerCase('ko-KR') && (guest || password.length > 0);
}

export function openDeleteAccount(ui: Interface): HTMLElement {
  // 빠르게 두 번 눌러도 확인창은 하나만 — 이미 떠 있으면 그 하나를 새로 그린다.
  ui.root?.querySelectorAll?.('.account-delete-overlay').forEach(node => node.remove());
  const guest = ui.session.guest === true;
  const expected = guest ? '게스트' : ui.session.loginId;
  const overlay = element('div', 'account-delete-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '계정 탈퇴 확인');
  const card = element('div', 'account-delete-card');
  card.append(element('h3', 'account-delete-title', '계정 탈퇴'));
  card.append(element('p', 'account-delete-warning',
    `${expected} 계정의 캐릭터·장비·금화·다이아·창고·거래소 매물과 모든 기록이 영구 삭제됩니다. ` +
    '판매 중인 매물은 자동으로 취소되고, 남은 다이아는 돌려받을 수 없습니다. ' +
    '같은 아이디로는 곧바로 다시 가입할 수 있습니다.'));

  const form = document.createElement('form');
  form.className = 'account-delete-form';

  const passwordField = element('label', 'account-delete-field', '비밀번호');
  const password = document.createElement('input');
  password.type = 'password';
  password.name = 'deleteAccountPassword';
  password.value = '';
  // iOS는 16px 미만 입력창에 포커스하면 화면을 확대하고, 자동 완성이 비밀번호를 바꿔 넣는다.
  password.autocomplete = 'current-password';
  password.spellcheck = false;
  password.setAttribute('aria-label', '탈퇴 확인 비밀번호');
  password.setAttribute('enterkeyhint', 'next');
  if (!guest) passwordField.append(password);

  const idField = element('label', 'account-delete-field', `확인을 위해 ${guest ? '게스트' : '아이디'} '${expected}'를 입력하세요`);
  const typed = document.createElement('input');
  typed.type = 'text';
  typed.name = 'deleteAccountId';
  typed.value = '';
  typed.autocomplete = 'off'; typed.spellcheck = false;
  typed.setAttribute('autocapitalize', 'off'); typed.setAttribute('autocorrect', 'off');
  typed.setAttribute('enterkeyhint', 'done'); typed.setAttribute('aria-label', '아이디 확인');
  idField.append(typed);

  const error = element('p', 'account-delete-error');
  error.setAttribute('role', 'alert');
  const actions = element('div', 'account-delete-actions');
  const cancel = element('button', 'account-delete-cancel', '취소') as HTMLButtonElement;
  cancel.type = 'button';
  const confirm = element('button', 'account-delete-confirm', '계정 삭제') as HTMLButtonElement;
  confirm.type = 'submit';
  actions.append(cancel, confirm);
  form.append(...(guest ? [idField] : [passwordField, idField]), error, actions);
  card.append(form);
  overlay.append(card);

  let busy = false;
  let observer: MutationObserver | undefined;
  const onKey = (event: Event): void => {
    if ((event as KeyboardEvent).key !== 'Escape' || busy) return;
    event.preventDefault(); event.stopImmediatePropagation?.();
    close();
  };
  const detach = (): void => {
    observer?.disconnect();
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') window.removeEventListener('keydown', onKey, true);
  };
  function close(): void { detach(); overlay.remove?.(); }
  const setError = (text: string): void => { error.textContent = text; };
  const refresh = (): void => { confirm.classList.toggle('ready', deleteAccountReady(typed.value, expected, password.value, guest)); };
  const setBusy = (next: boolean): void => {
    busy = next;
    confirm.disabled = next; cancel.disabled = next;
    confirm.textContent = next ? '삭제 중…' : '계정 삭제';
    if (next) setError('');
  };
  typed.addEventListener('input', () => { refresh(); if (error.textContent) setError(''); });
  password.addEventListener('input', () => { refresh(); if (error.textContent) setError(''); });
  form.onsubmit = event => { event.preventDefault(); void submit(); };
  cancel.onclick = () => { if (!busy) close(); };
  overlay.onclick = event => { if (event.target === overlay && !busy) close(); };
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('keydown', onKey, true);
  if (typeof MutationObserver !== 'undefined' && ui.modal) {
    observer = new MutationObserver(() => { if (ui.modal.hidden) close(); });
    observer.observe(ui.modal, { attributes: true, attributeFilter: ['hidden'] });
  }

  async function submit(): Promise<void> {
    if (busy) return;
    // 틀린 입력은 조용히 돌려보내지 않는다 — 확인창 안에 바로 안내하고 해당 입력으로 되돌린다.
    if (!guest && !password.value) { setError('비밀번호를 입력해 주세요.'); try { password.focus({ preventScroll: true }); } catch { /* 포커스 불가 */ } return; }
    if (typed.value.trim().toLocaleLowerCase('ko-KR') !== expected.trim().toLocaleLowerCase('ko-KR')) {
      setError(mismatch(guest ? '게스트' : '아이디'));
      try { typed.focus({ preventScroll: true }); } catch { /* 포커스 불가 */ }
      return;
    }
    setBusy(true);
    try {
      // 지우려는 계정이라 마지막 저장 실패로 막지 않는다 — 진행 중이던 저장은 계정이 사라진 뒤 401로 끝난다.
      await ui.market.sync.flush().catch(() => false);
      await accountRequest('deleteAccount', { password: guest ? undefined : password.value, confirmId: typed.value.trim() }, ui.session.token);
      clearLocalAccount();
      close();
      // 지운 계정 화면을 남기지 않고 로그인(가입) 화면으로 돌아간다.
      if (typeof location !== 'undefined') location.reload();
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  (ui.root ?? document.body).append(overlay);
  // 이미 아는 아이디를 먼저 채워 두지 않는다 — '확인'의 의미가 없어지기 때문이다. 비밀번호가 있으면 그 칸부터.
  try { (guest ? typed : password).focus({ preventScroll: true }); } catch { /* 자동 포커스 불가 */ }
  return overlay;
}
