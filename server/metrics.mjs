/**
 * API 계측 (작업 209).
 *
 * ① `Server-Timing` 헤더: 브라우저 개발자도구에서 어느 단계(연결·스키마·트랜잭션·응답)가 느린지 바로 보인다.
 * ② 구조화 로그 한 줄: 경로·액션·상태·소요시간·DB 시간·에러 코드·클램프 항목 수만 남긴다.
 *    **세이브 본문·토큰·접속 문자열은 절대 넣지 않는다** — 요청 본문도 로그에 찍지 않는다.
 */
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

export function createTrace() {
  const parts = new Map();
  const started = now();
  const trace = {
    /** 한 단계를 재고, 그 시간을 이름으로 남긴다. */
    async step(name, run) {
      const at = now();
      try { return await run(); }
      finally { trace.add(name, now() - at); }
    },
    add(name, ms) {
      if (!Number.isFinite(ms) || ms < 0) return;
      parts.set(name, (parts.get(name) ?? 0) + ms);
    },
    /** 이름 하나의 누적 시간(ms). */
    get(name) { return parts.get(name) ?? 0; },
    total() { return now() - started; },
    header() {
      const entries = [...parts.entries()].map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`);
      entries.push(`total;dur=${trace.total().toFixed(1)}`);
      return entries.join(', ');
    }
  };
  return trace;
}

/** `json()`에 넘길 헤더. 캐시 관련 헤더와 함께 써도 된다. */
export function timingHeaders(trace, headers = {}) {
  return trace ? { ...headers, 'Server-Timing': trace.header() } : headers;
}

/**
 * 요청 한 건의 구조화 로그. 값은 숫자·코드뿐이고 식별자(계정·토큰)는 넣지 않는다.
 * 배포 후 `wrangler pages deployment tail`이나 로그 검색에서 `"event":"api"`로 걸러 본다.
 */
export function logRequest({ path, action, status, trace, code, clamped, extra }) {
  const line = { event: 'api', path, action: typeof action === 'string' ? action.slice(0, 32) : undefined, status, ms: trace ? Math.round(trace.total()) : undefined };
  if (trace) {
    line.dbMs = Math.round(trace.get('db'));
    line.txMs = Math.round(trace.get('tx'));
    if (trace.get('replay')) line.replayMs = Math.round(trace.get('replay'));
    if (trace.get('settle')) line.settleMs = Math.round(trace.get('settle'));
  }
  if (code) line.code = String(code).slice(0, 40);
  if (clamped) line.clamped = clamped;
  if (extra) Object.assign(line, extra);
  try { console.log(JSON.stringify(line)); } catch { /* 로그 실패가 요청을 막지 않는다 */ }
}
