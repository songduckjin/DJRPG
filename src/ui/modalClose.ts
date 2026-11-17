// Wait for the native activation click: hiding on pointerdown exposes the game
// beneath a finger that is still held down. ModalRenderGate preserves this button
// through pointerup, while click dispatch keeps its original event target.
export function bindModalClose(button: HTMLButtonElement, close: () => void): void {
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.stopPropagation();
  });
  button.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation(); close();
  });
}
