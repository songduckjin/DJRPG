// Close on press, before a combat update can replace the pressed button on release.
// Keep click for keyboard and assistive technology activation.
export function bindModalClose(button: HTMLButtonElement, close: () => void): void {
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); event.stopPropagation(); close();
  });
  button.addEventListener('click', event => { if (event.detail === 0) close(); });
}
