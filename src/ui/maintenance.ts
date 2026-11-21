import { maintenancePopupMarkup, type MaintenanceState } from '../game/maintenance';

/**
 * 점검 모달을 화면에 얹는 DOM 조각(작업 256).
 *
 * 로그인 화면과 사냥 화면이 같은 모달을 쓴다 — 마크업은 `game/maintenance.ts`의 `maintenancePopupMarkup`
 * 하나이고(단위 테스트가 문자열을 고정), 여기서는 붙이고 떼는 일만 한다. 모달은 화면 전체를 덮는
 * `.maintenance-layer` 안에 있어 아래 화면(로그인 폼·HUD)을 누를 수 없다.
 */
export type MaintenancePopup = {
  element: HTMLElement;
  /** 안내 줄 문구를 바꾼다(예: "로그인 화면으로 이동합니다…"). */
  note: (text: string) => void;
  /** `다시 확인` 버튼을 잠그거나 되돌린다. */
  busy: (busy: boolean) => void;
  remove: () => void;
};

/** 점검 중일 때만 모달을 만든다. `active:false`면 `null`. `onCheck`는 `다시 확인`을 눌렀을 때. */
export function showMaintenancePopup(root: HTMLElement, state: MaintenanceState, onCheck: () => void): MaintenancePopup | null {
  if (!state.active) return null;
  const layer = document.createElement('div');
  layer.className = 'maintenance-layer';
  layer.innerHTML = maintenancePopupMarkup(state);
  const button = layer.querySelector<HTMLButtonElement>('[data-maintenance-check]');
  if (button) button.onclick = () => { button.disabled = true; button.textContent = '확인 중…'; onCheck(); };
  root.appendChild(layer);
  return {
    element: layer,
    note(text: string) { const lock = layer.querySelector<HTMLElement>('.maintenance-lock'); if (lock) lock.textContent = text; },
    busy(flag: boolean) { if (!button) return; button.disabled = flag; button.textContent = flag ? '확인 중…' : '다시 확인'; },
    remove() { layer.remove(); },
  };
}

/**
 * 점검 중 로그인 화면의 입력·버튼을 잠근다.
 *
 * 점검 모달이 화면을 덮고 있지만, 모달이 뜨는 순간 이미 포커스가 폼에 있어 Enter로 제출되는 경우와
 * 키보드·보조기기 경로를 함께 막는다. 점검이 풀리면 같은 함수로 되돌린다.
 */
export function setLoginBlocked(overlay: HTMLElement, blocked: boolean): void {
  overlay.classList.toggle('is-maintenance', blocked);
  overlay.querySelectorAll<HTMLButtonElement>('.login-submit, .login-guest, [data-mode]').forEach(button => { button.disabled = blocked; });
  overlay.querySelectorAll<HTMLInputElement>('.login-form input').forEach(input => { input.disabled = blocked; });
}
