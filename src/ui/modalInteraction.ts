/**
 * 창을 다시 그리는 시점을 붙잡는 그물 — 누른 요소가 클릭/체인지 처리를 마칠 때까지 살려 둔다.
 *
 * 2026-11-25 `스킬 창 트리 스크롤 버벅임` 뒤로 **스크롤도 같은 그물에 걸린다**(`holdScroll`, A-4).
 * iOS 관성 스크롤은 `scroll` 이벤트를 매 프레임 보내므로, 스크롤이 살아 있는 동안은 창을 다시 그리지
 * 않는다 — 창 내용을 통째로 새로 만들면 스크롤 중이던 엘리먼트가 사라져 관성이 그 자리에서 죽는다.
 *
 * Keep the pressed element alive until click/change dispatch finishes; never fire actions on press.
 */
/** 마지막 `scroll` 뒤 이만큼은 더 붙잡는다 — `pointercancel`로 손을 뗀 직후에도 관성이 남아 있다. */
const SCROLL_HOLD_MS = 140;

export class ModalRenderGate {
  private held = new Set<string>();
  private queued = false;
  private settling = false;
  private timer?: ReturnType<typeof setTimeout>;
  private scrollTimer?: ReturnType<typeof setTimeout>;
  constructor(private render: () => void) {}
  begin(key: string): void { clearTimeout(this.timer); this.settling = false; this.held.add(key); }
  end(key: string): void { this.held.delete(key); this.flushLater(); }
  cancel(): void { this.held.clear(); this.flushLater(); }
  /**
   * 스크롤 중 — 마지막 스크롤에서 `SCROLL_HOLD_MS`가 지날 때까지 다시 그리지 않는다.
   * 관성 구간에서도 `scroll`은 매 프레임 오므로, 손가락을 떼지 않은 것과 같은 효과가 난다.
   */
  holdScroll(): void {
    this.begin('scroll');
    clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => this.end('scroll'), SCROLL_HOLD_MS);
  }
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
  // `scroll`은 버블링하지 않으므로 캡처로 받는다 — 창 안 어느 스크롤 영역(트리·상세)이 움직여도 잡힌다.
  modal.addEventListener('scroll', () => gate.holdScroll(), true);
  modal.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') gate.begin(`k${event.key}`); }, true);
  surface.addEventListener('keyup', event => { if (event.key === 'Enter' || event.key === ' ') gate.end(`k${event.key}`); });
  surface.addEventListener('blur', () => gate.cancel());
  return gate;
}
