/**
 * 서버 여정 테스트용 시계 고정 — 2026-11-22 기념 우편(꾸러미 5개)이 우편함 단정에 끼어들지 않게 한다.
 *
 * 여정 보상은 앱의 실제 시계(`journeyState`의 `Date.now()`)로 지급되고, 기념 우편은 **지급 기간**
 * (2026-11-22 02:00 ~ 2026-11-23 05:00 KST)이 있어 그날 접속한 계정에만 붙는다. 이 파일을 import하는
 * 테스트는 지급 시작 전(2026-11-21 12:00 KST)을 "지금"으로 쓰므로, 기념 우편 없이 우편함 개수를 세던
 * 기존 단정이 그대로 유지된다. 기념 우편의 지급·수령은 `tests/patch-rewards-and-buff.test.mjs`가 본다.
 * (`new Date()`와 `Date.now()`를 같은 시각으로 묶어, 세이브 `updated_at`과 경과 시간 계산이 서로 어긋나지 않는다.)
 */
const RealDate = Date;
/** 테스트가 "지금"으로 쓰는 시각 — 2026-11-21 12:00 KST(기념 우편 지급 전). */
export const FROZEN_NOW = Date.parse('2026-11-21T12:00:00+09:00');

class FrozenDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(FROZEN_NOW);
    else super(...args);
  }
  static now() { return FROZEN_NOW; }
}

globalThis.Date = FrozenDate;
