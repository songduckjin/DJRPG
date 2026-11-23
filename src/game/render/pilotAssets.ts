/**
 * `public/assets/pilot-25d/**` 시트의 배포본 버전 (작업 227).
 *
 * `/assets/*`는 `public/_headers`가 1년 불변(`immutable`) 캐시로 고정한다. 그래서 같은 파일명으로
 * 내용을 바꿔 배포하면 브라우저는 옛 PNG를 계속 쓴다 — 파일명을 바꾸지 않는 한 URL에 버전을
 * 붙여야 새 그림이 내려간다.
 *
 * 작업 227은 2.5D 캐릭터·장비 시트의 **알파 채널**을 고쳤다(내부 반투명 → 불투명, 황야 바닥이
 * 몸통 뒤로 비치던 문제). 서기·걷기·공격과 파츠까지 거의 모든 시트가 바뀌었으므로, 예전처럼
 * 서기(`idle`)에만 `?v=2`를 붙이던 규칙 대신 **pilot-25d 경로 전체**에 이 버전을 붙인다.
 *
 * [작업 229]는 전사 서기 시트를 222 이전 그립으로 되돌렸다 — 파일명이 같으므로 3 → 4로 올린다.
 * [작업 247]은 마법사 모자·투구 파츠 20장에서 상반신을 걷어냈다 — 같은 파일명이므로 4 → 5.
 *
 * 새 시트를 같은 파일명으로 다시 구울 때는 이 값만 올린다(6 → 7).
 */
export const PILOT_ASSET_VERSION = 6;

/** pilot-25d 시트 URL 하나에 배포본 버전을 붙인다(기존 `?v=N`은 교체). */
export function pilotSheet(path: string): string {
  return `${path.replace(/[?&]v=\d+$/, '')}?v=${PILOT_ASSET_VERSION}`;
}

/** 경로 표(Record) 전체를 같은 규칙으로 버전 처리한다 — 표를 손으로 고치지 않기 위한 것. */
export function pilotSheets<T extends Record<string, string>>(table: T): { [K in keyof T]: string } {
  const out = {} as { [K in keyof T]: string };
  for (const key of Object.keys(table) as (keyof T)[]) out[key] = pilotSheet(table[key]);
  return out;
}
