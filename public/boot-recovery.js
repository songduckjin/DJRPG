// Vite emits this event when a dynamic module chunk cannot be loaded.
// One reload obtains the current deployment; a recent retry leaves the error visible.
(function () {
  const key = 'djrpg.boot-import-retry';
  const retryWindowMs = 60_000;
  window.addEventListener('vite:preloadError', event => {
    let last;
    try { last = Number(sessionStorage.getItem(key)); }
    catch { return; }
    const now = Date.now();
    if (last > 0 && now - last < retryWindowMs) return;
    try { sessionStorage.setItem(key, String(now)); }
    catch { return; }
    event.preventDefault();
    window.location.reload();
  });
  setTimeout(() => {
    try {
      const last = Number(sessionStorage.getItem(key));
      if (last > 0 && Date.now() - last >= retryWindowMs) sessionStorage.removeItem(key);
    } catch { /* Private mode may block storage. */ }
  }, retryWindowMs);
})();
