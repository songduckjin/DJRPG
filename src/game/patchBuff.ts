/**
 * 밸런스·UI 개편 기념 **종일 버프** — 공격력·방어력·최대 체력 +30%(2026-11-22).
 *
 * 사용자 요청(2026-11-21 23:38 KST): "밸런스패치보상 주자 꾸러미5개랑 일일 버프 공 방 체 30퍼 종일 버프".
 * 새벽 2시 배포 직후부터 **다음 날 05:00 일일 초기화까지 하루 종일** 세 능력치를 30% 올린다.
 *
 * 이 파일이 **기간과 배율의 단일 기준**이다. 필드 전투(`combat/engine`)·던전(`dungeon/battle`)·
 * 방치 정산(`offline`)·월드보스 연습(`worldBossRehearsal`)·HUD·장비창의 숫자가 모두
 * `items.ts`의 `totalStats`를 지나므로, 버프는 그 한 곳에서만 곱해진다 — 화면과 전투가 갈라질 자리가 없다.
 * 기간이 지나면 배율이 곧바로 1로 돌아오고(`patchBuffScale`), HUD 알약도 스스로 사라진다.
 *
 * `server/save-guard.mjs`는 세이브에서 **아이템 능력치·금화·경험치·층**만 상한으로 자르고
 * 플레이어의 공·방·체는 계산하지 않는다(세이브의 `health`는 현재 체력이다). 그래서 이 버프가
 * 켜져도 저장 검증과 부딪히지 않는다 — `tests/patch-rewards-and-buff.test.mjs`가 그 계약을 고정한다.
 */

/** 새벽 2시 배포 직후 = 2026-11-22 02:00 KST. */
export const PATCH_BUFF_START = Date.parse('2026-11-22T02:00:00+09:00');
/** 다음 날 일일 초기화(05:00 KST)까지 = 2026-11-23 05:00 KST. */
export const PATCH_BUFF_END = Date.parse('2026-11-23T05:00:00+09:00');
/** 세 능력치에 곱하는 상승분(%)과 배율. */
export const PATCH_BUFF_PERCENT = 30;
export const PATCH_BUFF_SCALE = 1 + PATCH_BUFF_PERCENT / 100;
/** HUD 알약 문구 — 사용자가 정한 이름 그대로다. */
export const PATCH_BUFF_TAG = '패치 버프 공·방·체 +30%';
export const PATCH_BUFF_ICON = '🔥';
export const PATCH_BUFF_PILL_TEXT = `${PATCH_BUFF_ICON} ${PATCH_BUFF_TAG}`;

/**
 * 지금 시각을 읽는 시계 — 운영 경로는 언제나 `Date.now()`다.
 *
 * 스냅샷 테스트(`tests/progress-parity.test.mjs` 등)는 "버프가 꺼진 날"의 밸런스 값을 고정하고 있으므로,
 * 그 테스트들만 `setPatchBuffClock`으로 시계를 버프 기간 밖에 묶는다. 그 밖의 코드는 이 함수를 쓰지 않는다.
 */
let clock: () => number = () => Date.now();
export function patchBuffNow(): number { return clock(); }
export function setPatchBuffClock(next?: () => number): void { clock = typeof next === 'function' ? next : () => Date.now(); }

/** 이 시각에 종일 버프가 켜져 있는가 — 시작 시각 포함, 종료 시각 제외. */
export function isPatchBuffActive(now: number = patchBuffNow()): boolean {
  return Number.isFinite(now) && now >= PATCH_BUFF_START && now < PATCH_BUFF_END;
}

/** 이 시각의 공·방·체 배율 — 켜져 있으면 1.3, 아니면 1. */
export function patchBuffScale(now: number = patchBuffNow()): number {
  return isPatchBuffActive(now) ? PATCH_BUFF_SCALE : 1;
}

/** 남은 시간(ms) — 꺼져 있으면 0. */
export function patchBuffRemainingMs(now: number = patchBuffNow()): number {
  return isPatchBuffActive(now) ? Math.max(0, PATCH_BUFF_END - now) : 0;
}

/** 남은 시간 문구 — '26시간 12분' / '12분' / '곧 종료'. */
export function patchBuffRemainingText(now: number = patchBuffNow()): string {
  const minutes = Math.ceil(patchBuffRemainingMs(now) / 60_000);
  if (minutes <= 0) return '곧 종료';
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours ? `${hours}시간 ${rest}분` : `${rest}분`;
}

/** 알약·장비창의 `title`(읽기 이름) — 켜져 있을 때만 채운다. */
export function patchBuffTitle(now: number = patchBuffNow()): string {
  return isPatchBuffActive(now) ? `${PATCH_BUFF_PILL_TEXT} · ${patchBuffRemainingText(now)} 남음` : '';
}

/**
 * 능력치 한 벌에 버프를 곱한다 — **공격력·방어력·최대 체력만**이고 치명타·공속은 그대로다.
 * 다른 % 보정(추가옵션·패시브)과 같은 방식으로 올림한다.
 */
export function applyPatchBuff<T extends { attack: number; defense: number; health: number }>(stats: T, now: number = patchBuffNow()): T {
  if (!isPatchBuffActive(now)) return stats;
  stats.attack = Math.ceil(stats.attack * PATCH_BUFF_SCALE);
  stats.defense = Math.ceil(stats.defense * PATCH_BUFF_SCALE);
  stats.health = Math.ceil(stats.health * PATCH_BUFF_SCALE);
  return stats;
}

/**
 * HUD 알약 마크업 — 꺼져 있으면 빈 문자열(요소를 만들지 않는다).
 * 남은 시간은 `.patch-buff-time`이 들고, `hud.ts`가 30초에 한 번만 다시 쓴다.
 */
export function patchBuffPillMarkup(now: number = patchBuffNow()): string {
  if (!isPatchBuffActive(now)) return '';
  return `<div class="patch-buff-pill" role="status" aria-label="${PATCH_BUFF_PILL_TEXT} · ${patchBuffRemainingText(now)} 남음" title="${patchBuffTitle(now)}" data-at="${now}"><span class="patch-buff-icon" aria-hidden="true">${PATCH_BUFF_ICON}</span><span class="patch-buff-label">${PATCH_BUFF_TAG}</span><span class="patch-buff-time">${patchBuffRemainingText(now)}</span></div>`;
}

/** 장비창 스탯 아래 한 줄 — 숫자가 왜 30% 높은지 알려 준다. */
export function patchBuffSummaryMarkup(now: number = patchBuffNow()): string {
  if (!isPatchBuffActive(now)) return '';
  return `<div class="equipment-info-buff" title="${patchBuffTitle(now)}">${PATCH_BUFF_ICON} ${PATCH_BUFF_TAG} <span>· ${patchBuffRemainingText(now)} 남음</span></div>`;
}
