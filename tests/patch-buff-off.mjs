/**
 * 밸런스·스냅샷 테스트용 시계 고정 — 2026-11-22 기념 종일 버프(공·방·체 +30%)를 끈 시각으로 묶는다.
 *
 * 버프는 `src/game/patchBuff.ts`의 **실제 시계 구간**(2026-11-22 02:00 ~ 2026-11-23 05:00 KST)으로 켜진다.
 * 이 파일을 import하는 테스트는 그 구간 밖(2026-11-21 12:00 KST)을 "지금"으로 쓰므로, 버프가 켜진 날에도
 * 밸런스 스냅샷(공격력·처치 수·클리어 시간·HP)이 흔들리지 않는다. 버프 자체는
 * `tests/patch-rewards-and-buff.test.mjs`가 명시적인 시각을 넣어 검증한다.
 */
import './ts-loader.mjs';

/** 테스트가 "지금"으로 쓰는 시각 — 2026-11-21 12:00 KST(버프 시작 전). */
export const PATCH_BUFF_OFF_AT = Date.parse('2026-11-21T12:00:00+09:00');

const { setPatchBuffClock } = await import('../src/game/patchBuff.ts');
setPatchBuffClock(() => PATCH_BUFF_OFF_AT);
export { setPatchBuffClock };
