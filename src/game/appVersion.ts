// 빌드 시 주입되는 배포 버전(vite.config.ts의 __APP_VERSION__)과, 구버전 응답을 받았을 때의 복구 절차.
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION = typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : 'dev';
export const OUTDATED_MESSAGE = '새 버전이 배포되었습니다. 최신 버전으로 다시 불러옵니다.';
const reloadMarkKey = 'djrpg.version.reload';

export function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-App-Version': APP_VERSION, ...extra };
}

export function isOutdatedResponse(status: number, code?: unknown, expected?: unknown): boolean {
  // 서버가 자기 버전을 모를 때(expected='dev')는 전 클라이언트 차단 사고를 막기 위해 업데이트 판정을 하지 않는다.
  const declared = typeof expected === 'string' ? expected.trim() : '';
  return (status === 426 || code === 'VERSION_OUTDATED') && declared !== 'dev';
}

function sessionValue(key: string, value?: string): string {
  try {
    if (typeof sessionStorage === 'undefined') return '';
    if (value === undefined) { const stored = sessionStorage.getItem(key) ?? ''; return stored; }
    sessionStorage.setItem(key, value); return value;
  } catch { return ''; }
}

// 이번 번들이 서버와 맞는 응답을 받았으면 새로고침 시도를 초기화해, 다음 배포에서도 한 번은 자동 새로고침되게 한다.
export function clearVersionReloadMark(): void {
  try { sessionStorage.removeItem(reloadMarkKey); } catch { /* 저장소 접근 불가 */ }
}

function showOutdatedNotice(): void {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
  if (document.querySelector('.version-outdated')) return;
  const overlay = document.createElement('div'); overlay.className = 'sync-conflict version-outdated';
  const note = document.createElement('p'); note.textContent = '새 버전이 배포되었습니다. 페이지를 새로 고쳐 주세요.';
  const button = document.createElement('button'); button.textContent = '최신 버전 불러오기'; button.onclick = () => location.reload();
  overlay.append(note, button); document.body.appendChild(overlay);
}

// 새 배포를 만나면 한 번만 자동 새로고침한다. 같은 번들로 되돌아오면(캐시된 옛 화면) 반복하지 않고 안내만 남긴다.
export function reloadForNewVersion(): void {
  if (typeof location === 'undefined' || typeof location.reload !== 'function') return;
  if (sessionValue(reloadMarkKey) === APP_VERSION) { showOutdatedNotice(); return; }
  sessionValue(reloadMarkKey, APP_VERSION);
  location.reload();
}
