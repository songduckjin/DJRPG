export function createBootOverlay(root: HTMLElement) {
  const overlay = document.createElement('div');
  overlay.className = 'boot-loading';
  overlay.hidden = true;
  overlay.setAttribute('role', 'status');
  overlay.innerHTML = `<div class="boot-panel"><small class="boot-kicker">THE WASTELAND AWAITS</small><h1>DJRPG</h1><p class="boot-subtitle">황야의 층계</p><div class="boot-meter" role="progressbar" aria-label="리소스 로딩" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="boot-meter-fill"></span></div><p class="boot-status">리소스 불러오는 중… 0%</p><p class="boot-reason" hidden></p><button class="boot-retry" type="button" hidden>새로고침</button></div>`;
  const meter = overlay.querySelector<HTMLElement>('.boot-meter')!;
  const fill = overlay.querySelector<HTMLElement>('.boot-meter-fill')!;
  const status = overlay.querySelector<HTMLElement>('.boot-status')!;
  const reason = overlay.querySelector<HTMLElement>('.boot-reason')!;
  const retry = overlay.querySelector<HTMLButtonElement>('.boot-retry')!;
  retry.onclick = () => location.reload();
  let failed = false;
  const attach = () => { if (overlay.parentElement !== root) root.appendChild(overlay); };
  return {
    get failed() { return failed; },
    show() { attach(); overlay.hidden = false; },
    attach,
    update(loaded: number, total: number) {
      if (failed) return;
      const percent = total > 0 ? Math.max(0, Math.min(100, Math.round(loaded / total * 100))) : 100;
      fill.style.width = `${percent}%`;
      meter.setAttribute('aria-valuenow', String(percent));
      status.textContent = `리소스 불러오는 중… ${percent}%`;
    },
    fail(cause: unknown) {
      if (failed) return;
      failed = true;
      attach(); overlay.hidden = false;
      overlay.classList.add('boot-error'); overlay.setAttribute('role', 'alert');
      status.textContent = '초기화에 실패했습니다.';
      reason.textContent = cause instanceof Error ? (cause.message || cause.name) : String(cause ?? '알 수 없는 오류');
      reason.hidden = false; retry.hidden = false; meter.hidden = true;
    },
    async complete() {
      if (failed) return false;
      await new Promise(resolve => setTimeout(resolve, 120));
      if (failed) return false;
      overlay.classList.add('boot-done');
      await new Promise(resolve => setTimeout(resolve, 240));
      if (failed) return false;
      overlay.remove();
      return true;
    }
  };
}
