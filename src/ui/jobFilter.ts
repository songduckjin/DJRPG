// `내 직업만 보기` (작업 205).
//
// 가방과 경매장은 세 직업의 무기·스킬북을 함께 보여 준다(작업 204: 드롭은 3직업 동일 확률). 내 캐릭터가
// 쓸 수 없는 것이 섞여 있으면 가방은 금방 차고, 경매장에서는 살 수 없는 매물이 눈에 먼저 들어온다. 그래서
// 두 화면에 같은 토글을 두고, 켜면 **다른 직업 전용 무기·스킬북만** 숨긴다. 공용 방어구·장신구는 그대로
// 보인다 — 세 직업이 같은 것을 입기 때문이다.
//
// 이 스위치는 보기 방식일 뿐이고, 껐다 켜도 아이템·세이브는 건드리지 않는다. 기본값은 전체 보기다.
// 켠 상태는 기기에 남겨 두어 창을 닫거나 새로고침해도 같은 화면으로 돌아온다(등급 기준·자동 분해 스위치와
// 같은 방식, `salvageRarity.ts`). 저장이 막힌 사생활 모드에서는 이번 세션에만 적용된다.

import { usableByJob, type Item } from '../game/items';
import { jobOrDefault, type Job } from '../game/skills';

/** Where each screen's switch is kept between sessions. */
export const BAG_JOB_ONLY_KEY = 'djrpg-bag-job-only';
export const MARKET_JOB_ONLY_KEY = 'djrpg-market-job-only';

/** 엔트리에서 아이템을 꺼내는 함수 — 가방은 슬롯 스택, 경매장은 매물·수령품이다. */
type ItemOf<T> = (entry: T) => Item | undefined;

/** 켜져 있으면 다른 직업 전용 아이템만 걷어 낸다. 아이템이 없는 줄(금화 수령 등)은 그대로 둔다. */
export function jobOnlyVisible<T>(entries: readonly T[], item: ItemOf<T>, job: Job | undefined, on: boolean): T[] {
  if (!on) return entries.slice();
  const mine = jobOrDefault(job);
  return entries.filter(entry => { const value = item(entry); return !value || usableByJob(value, mine); });
}

/** 걷어 낸 개수 — `N개 숨김` 안내에 쓴다. */
export function jobOnlyHidden<T>(entries: readonly T[], item: ItemOf<T>, job: Job | undefined, on: boolean): number {
  return on ? entries.length - jobOnlyVisible(entries, item, job, on).length : 0;
}

/** The switch as the player left it; off (전체 보기) when nothing was ever stored or storage is unavailable. */
export function readJobOnly(key: string): boolean {
  try { return localStorage.getItem(key) === 'on'; } catch { return false; }
}

export function saveJobOnly(key: string, on: boolean): void {
  try { localStorage.setItem(key, on ? 'on' : 'off'); } catch { /* this session only */ }
}

/** 토글 문구 — 켜짐/꺼짐을 버튼 하나에서 읽을 수 있게 한다. */
export function jobOnlyLabel(on: boolean): string {
  return on ? '내 직업만 보기: 켬' : '내 직업만 보기: 끔';
}
