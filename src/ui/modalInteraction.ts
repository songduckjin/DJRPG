// Keep the pressed element alive until click/change dispatch finishes; never fire actions on press.
export class ModalRenderGate {
  private held = new Set<string>();
  private queued = false;
  private settling = false;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private render: () => void) {}
  begin(key: string): void { clearTimeout(this.timer); this.settling = false; this.held.add(key); }
  end(key: string): void { this.held.delete(key); this.flushLater(); }
  cancel(): void { this.held.clear(); this.flushLater(); }
  defer(): boolean {
    if (!this.held.size && !this.settling) return false;
    this.queued = true; return true;
  }
  private flushLater(): void {
    clearTimeout(this.timer);
    if (!this.held.size) { this.settling = true; this.timer = setTimeout(() => {
      this.settling = false;
      if (this.held.size || !this.queued) return;
      this.queued = false; this.render();
    }, 0); }
  }
}
export function bindModalInteraction(modal: HTMLElement, surface: Window, render: () => void): ModalRenderGate {
  const gate = new ModalRenderGate(render);
  modal.addEventListener('pointerdown', event => gate.begin(`p${event.pointerId}`), true);
  surface.addEventListener('pointerup', event => gate.end(`p${event.pointerId}`));
  surface.addEventListener('pointercancel', event => gate.end(`p${event.pointerId}`));
  modal.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') gate.begin(`k${event.key}`); }, true);
  surface.addEventListener('keyup', event => { if (event.key === 'Enter' || event.key === ' ') gate.end(`k${event.key}`); });
  surface.addEventListener('blur', () => gate.cancel());
  return gate;
}
