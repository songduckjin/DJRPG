// 배포 버전 식별자와 구버전 클라이언트 판정. 클라이언트 번들의 __APP_VERSION__과 같은 값을 쓴다.
import { BUILD_VERSION } from './version.generated.mjs';

const short = value => String(value ?? '').trim().slice(0, 24);

export const APP_VERSION = short(BUILD_VERSION) || 'dev';
export const OUTDATED_MESSAGE = '새 버전이 배포되었습니다. 최신 버전으로 다시 불러옵니다.';

export function requestVersion(request) {
  try { return short(request?.headers?.get?.('x-app-version')); } catch { return ''; }
}

// 클라이언트 번들과 Functions는 같은 version.generated.mjs에서 버전을 읽으므로 한 배포 안에서는 항상 일치한다.
// 헤더가 아예 없는 직접 API 호출(테스트·스크립트·구버전 이전 도구)은 통과시키고, 배포본과 다른 헤더만 구버전으로 본다.
export function versionMismatch(request) {
  const version = requestVersion(request);
  return Boolean(version) && version !== APP_VERSION;
}
