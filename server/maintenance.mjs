import { json } from './http.mjs';

/**
 * 점검 모드 서버 스위치(작업 256).
 *
 * 평소 배포 점검은 `public/maintenance.json`(`active: true` + `eta`) 하나로 끝난다 — 정적 파일이라
 * Worker·DB를 부르지 않으므로 비용이 없고, 파일이 없거나 잘못돼도 게임은 **열린 상태**로 남는다.
 * 이 모듈은 그 위의 **선택** 안전장치다: Cloudflare Pages 환경변수 `DJRPG_MAINTENANCE=1`(또는 `true`)을
 * 두면 계정 API 입구가 DB에 닿기 전에 `503 MAINTENANCE`를 돌려줘, 점검 중 로그인·가입·게스트·저장이
 * 서버에서도 막힌다. 환경변수를 두지 않으면 동작은 종전과 완전히 같다.
 */
export const MAINTENANCE_API_MESSAGE = '현재 서버 점검 중입니다. 잠시 후 다시 이용해 주세요.';
export const MAINTENANCE_HEADER = 'X-DJRPG-Maintenance';

/** `DJRPG_MAINTENANCE`가 켜져 있는가 — `1`·`true`·`on`만 켜짐으로 본다. */
export function maintenanceMode(env) {
  const value = String(env?.DJRPG_MAINTENANCE ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'on';
}

/** 켜져 있으면 점검 응답(503), 아니면 `undefined`(그대로 진행). */
export function maintenanceResponse(env) {
  if (!maintenanceMode(env)) return undefined;
  return json({ code: 'MAINTENANCE', error: MAINTENANCE_API_MESSAGE }, 503, {
    'Cache-Control': 'no-store',
    [MAINTENANCE_HEADER]: '1',
  });
}
