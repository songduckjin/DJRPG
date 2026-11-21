/**
 * **[미리보기 전용 · main 운영 배포 금지]**
 *
 * 미리보기(`preview/gravel-background-fks3997` → `preview-…djrpg.pages.dev`)에서만 켜는 화면 기능의
 * 호스트 판정이다. 서버 쪽 같은 규칙은 `server/season.mjs`의 `isPreviewHost`이고(운영
 * `djrpg.pages.dev`는 절대 포함되지 않는다), 여기서는 화면이 그 판정을 그대로 흉내 낸다.
 *
 * 작업 251에서 이 가드를 쓰는 것: **보물 주머니 `버리기`/`모두 버리기`**(작업 212의 미리보기 테스트
 * 우편 100개를 정리하라고 사용자가 요청한 임시 기능). 사용자가 "버리기도 미리보기 전용이다 절대(운영)
 * 배포 금지"라고 못박았으므로, 나중에 `main`으로 올릴 때 **이 파일과 이 함수를 부르는 자리만 지우면**
 * 합성 기능은 그대로 남는다.
 */
export function isPreviewHostname(hostname: string | null | undefined): boolean {
  const host = String(hostname ?? '').trim().toLowerCase();
  if (!host) return false;
  return host.includes('preview') && host !== 'djrpg.pages.dev';
}

/** 지금 화면이 미리보기 호스트인가 — 서버 없이(브라우저 주소만으로) 판정한다. */
export function isPreviewClient(): boolean {
  if (typeof window === 'undefined') return false;
  try { return isPreviewHostname(window.location?.hostname); } catch { return false; }
}
