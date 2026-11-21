/**
 * 전투력 — 화면 세 곳이 **같은 식**을 쓴다(내 정보 `전투력` 칸 · HUD 닉네임 아래 전투력 표기 ·
 * LV 배지를 눌러 여는 `상세 스탯`).
 *
 * 예전에는 `src/ui/modals/equipModal.ts`의 `const power = Math.round(stats.attack * 3 + …)` 한 줄이
 * 유일한 정의였다. HUD와 상세 스탯이 같은 숫자를 말해야 하는데 식을 세 번 적으면 한 곳만 고쳐도
 * 화면마다 다른 전투력이 뜨므로 순수 모듈 하나로 옮겼다(`AGENTS.md` SRP — 판정·상수는 한 곳).
 *
 * DOM을 쓰지 않고 `src/ui/**`를 import하지 않는다 — 서버 클로저 규칙(`tests/architecture-boundaries`)
 * 과 무관하게 순수 계산만 남긴다.
 */
import type { Stat } from './items';

/** 전투력 가중치 — `층 선택`의 권장 전투력(`game/floorPower.ts`)도 이 값을 그대로 쓴다. */
export const POWER_WEIGHTS = { attack: 3, defense: 2, health: .2, crit: 2, speed: 2 } as const;

/**
 * 전투력 = 공격 × 3 + 방어 × 2 + 최대 체력 × 0.2 + 치명타 확률 × 2 + 공격속도 × 2 (반올림).
 *
 * 가중치는 작업 238의 `itemPower`와 같은 취지다 — 공격·방어가 오르면 확실히 세지고, 체력은
 * 1/5만, 확률·속도(%)는 스탯 1점과 같은 무게로 센다.
 */
export function combatPower(stats: Partial<Record<Stat, number>>): number {
  return Math.round((stats.attack ?? 0) * POWER_WEIGHTS.attack + (stats.defense ?? 0) * POWER_WEIGHTS.defense
    + (stats.health ?? 0) * POWER_WEIGHTS.health + (stats.crit ?? 0) * POWER_WEIGHTS.crit
    + (stats.speed ?? 0) * POWER_WEIGHTS.speed);
}
