// 첫 화면(부팅) 청크 로딩 실패를 **한 번만** 캐시를 우회해 다시 시도한다 (작업 219 → 224).
//
// Vite는 동적 import 청크가 실패하면 `vite:preloadError`를 보내지만, pixi의 `WebGLRenderer-*.js`처럼
// 정적 의존성 안에서 갈라진 청크는 그 이벤트 없이 `Failed to fetch dynamically imported module: …`만
// 남기고 죽는다(사용자 제보 `#6335`·`#6370`). 그래서 세 가지 길을 모두 본다:
//  - `vite:preloadError`
//  - `error`(모듈 스크립트 로딩 실패)
//  - `unhandledrejection`(동적 import Promise 거절)
// 최근 60초 안에 이미 한 번 다시 시도했으면 아무것도 하지 않고 오류를 화면에 남긴다 — 무한 새로고침 방지.
(function () {
  var key = 'djrpg.boot-import-retry';
  var retryWindowMs = 60_000;
  var failure = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;
  var retried = false;
  function messageOf(event) {
    try {
      var reason = event && event.reason;
      return String((event && event.message) || (reason && reason.message) || reason || '');
    } catch (error) { return ''; }
  }
  function retry(event) {
    if (retried) return false;
    var now = Date.now(), last = 0;
    try { last = Number(sessionStorage.getItem(key)) || 0; } catch (error) { return false; }
    if (last > 0 && now - last < retryWindowMs) return false;
    try { sessionStorage.setItem(key, String(now)); } catch (error) { return false; }
    retried = true;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    // 브라우저 캐시에 남은 index.html이 지난 배포의 청크 이름을 가리키는 경우가 있으므로,
    // 주소에 표식을 붙여 문서와 청크를 새로 받는다. 같은 주소의 앱이라 동작은 그대로다.
    var url = location.href;
    try { var next = new URL(location.href); next.searchParams.set('_boot', String(now)); url = next.href; } catch (error) { /* 구형 브라우저는 그대로 새로고침 */ }
    location.replace(url);
    return true;
  }
  window.addEventListener('vite:preloadError', retry);
  window.addEventListener('error', function (event) { if (failure.test(messageOf(event))) retry(event); }, true);
  window.addEventListener('unhandledrejection', function (event) { if (failure.test(messageOf(event))) retry(event); });
  setTimeout(function () {
    try {
      var last = Number(sessionStorage.getItem(key));
      if (last > 0 && Date.now() - last >= retryWindowMs) sessionStorage.removeItem(key);
    } catch (error) { /* 사생활 보호 모드는 저장소를 막는다. */ }
  }, retryWindowMs);
})();
