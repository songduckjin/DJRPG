/**
 * 층별 권장 전투력 — 「층 선택」 창의 `여유`/`적정`/`위험` 판정과 `★ 추천 M층`.
 *
 * 값은 **지금 코드의 층 곡선**에서 그대로 나온다. 별도 수치 표를 두지 않으므로 밸런스가 바뀌면
 * 이 파일을 고치지 않아도 권장 전투력이 따라 움직인다(`enemyMaxHp`·`enemyHitDamage`·`swarmCount`,
 * 근거는 `docs/FIELD_OFFLINE.md` 「층별 권장 전투력」). 화면(`ui/modals/floorModal.ts`)은 이 모듈을
 * 소비만 한다.
 *
 * 기준 빌드 = 그 층을 **편하게 사냥하는 최소선**이다. 전투 엔진이 실제로 쓰는 숫자만으로 만든다:
 *  · 레벨 — `ceil(층 × 0.8)` (예전 창의 `권장 Lv.` 규칙 그대로: 20층 Lv.16)
 *  · 방어·치명·공속 — 그 레벨의 **기본값**. 장비 기대치를 얹지 않는다(장비는 사람마다 다르고,
 *    권장값은 "장비가 없어도 이 정도면 된다"는 하한이어야 한다).
 *  · 공격 — 몹을 `KILL_HITS`대에 쓰러뜨리는 공격력(평타 1.6배 × 기준 치명 기대 배율)
 *  · 체력 — `SURVIVE_SECONDS`초 동안 몹에게 맞고 버티는 체력.
 *    엔진은 `STRIKE_WINDOW_SECONDS`마다 한 번 때리고, 그 한 번에 `swarmCount(층)`마리가 함께
 *    때린다(`combat/engine.ts` `tickEnemies`). 1타 위력은 `enemyHitDamage`가 이미 군집 배율을
 *    반영한 값이다.
 *
 * 그래서 1층 권장값은 장비 없는 새 캐릭터의 전투력과 같고(입문 완화), 위로 갈수록 몹 HP·1타·
 * 군집 수를 따라 오른다.
 */

import { CRIT_DAMAGE_SCALE, basicAttackPower, enemyHitDamage, enemyMaxHp, swarmCount } from './battle/formulas';
import { MAX_FLOOR, MAX_LEVEL } from './progress';

/**
 * 전투력 식·가중치는 `game/power.ts` 한 곳에만 둔다 — HUD·내 정보·상세 스탯·층 권장값이 같은 숫자를 말한다.
 * 여기서는 그대로 다시 내보내기만 한다(`floorModal.ts`가 이 모듈 하나로 층 판정·표기를 끝낸다).
 */
export { POWER_WEIGHTS } from './power';
import { combatPower } from './power';
export { combatPower };

export type CombatStats = { attack: number; defense: number; health: number; crit: number; speed: number };
/** `easy`=여유(충분) · `okay`=적정(권장 근처) · `danger`=위험(모자람). */
export type FloorPowerState = 'easy' | 'okay' | 'danger';

/** 기준 빌드가 몹 한 마리를 쓰러뜨리는 타수. */
export const KILL_HITS = 2;
/** 기준 빌드가 버텨야 하는 시간(초) — 밸런스 v2의 `표준 장비 16~30초 버팀`에서 잡은 하한. */
export const SURVIVE_SECONDS = 20;
/** 적이 플레이어를 때리는 간격(초) — `combat/engine.ts` `p.hit = .85`. */
export const STRIKE_WINDOW_SECONDS = .85;
/** 기준 치명 확률(%) — 장비가 없어도 평타 기대값에 치명을 넣는다. */
export const REFERENCE_CRIT = 25;
/** 이 배율 이상이면 `여유`, 이 배율 미만이면 `위험`, 사이가 `적정`. */
export const EASY_RATIO = 1.5;
export const DANGER_RATIO = .75;

/** 층을 1~`MAX_FLOOR` 정수로 다듬는다. */
export function clampFloor(floor: number): number {
  if (!Number.isFinite(floor)) return 1;
  return Math.max(1, Math.min(MAX_FLOOR, Math.floor(floor)));
}

/** 그 층의 기준 레벨 — 예전 창의 `권장 Lv.ceil(층 × 0.8)` 규칙. */
export function referenceLevel(floor: number): number {
  return Math.max(1, Math.min(MAX_LEVEL, Math.ceil(clampFloor(floor) * .8)));
}


/** 장비 없는 캐릭터의 그 레벨 기본 스탯 — `items.ts` `totalStats`의 기본값과 같은 식이다. */
export function baseStats(level: number): CombatStats {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1));
  return { attack: 8 + lv * 2, defense: 2 + lv, health: 140 + (lv - 1) * 12, crit: 2 + (lv - 1) * .6, speed: 0 };
}

/** 평타 한 방의 기대 배율 — 평타 1.6배에 기준 치명(25%)을 얹는다. */
function expectedHitScale(): number {
  return basicAttackPower * (1 + Math.min(100, REFERENCE_CRIT) / 100 * (CRIT_DAMAGE_SCALE - 1));
}

/** 0.85초 창 한 번에 들어오는 피해 — 군집 수를 곱한 값(`enemyHitDamage`는 이미 군집 1타 위력). */
function incomingPerWindow(floor: number, defense: number): number {
  return swarmCount(floor) * enemyHitDamage(floor, false, defense);
}

/** 그 층을 `적정`으로 사냥하는 기준 빌드의 스탯. */
export function recommendedBuild(floor: number): CombatStats {
  const depth = clampFloor(floor);
  const base = baseStats(referenceLevel(depth));
  const attack = Math.ceil(enemyMaxHp(depth, false) / (KILL_HITS * expectedHitScale()));
  const health = Math.ceil(incomingPerWindow(depth, base.defense) * (SURVIVE_SECONDS / STRIKE_WINDOW_SECONDS));
  return { ...base, attack: Math.max(base.attack, attack), health: Math.max(base.health, health) };
}

/** 그 층의 권장 전투력. 1~`MAX_FLOOR` 밖의 값은 경계로 다듬는다. */
export function recommendedFloorPower(floor: number): number {
  return combatPower(recommendedBuild(floor));
}

/** 내 전투력이 그 층에서 어느 상태인가 — 권장값 대비 비율로 판정한다. */
export function floorPowerState(power: number, floor: number): FloorPowerState {
  const recommended = recommendedFloorPower(floor);
  const value = Number.isFinite(power) ? power : 0;
  if (value >= recommended * EASY_RATIO) return 'easy';
  if (value < recommended * DANGER_RATIO) return 'danger';
  return 'okay';
}

/**
 * `★ 추천 M층` — 내 전투력이 `적정` 이상인 가장 깊은 층(최고 층까지만).
 * 어느 층도 못 넘으면 1층(지금 사냥할 수 있는 가장 얕은 층)이다.
 */
export function recommendedFloorFor(power: number, maxFloor = MAX_FLOOR): number {
  const top = clampFloor(maxFloor);
  for (let floor = top; floor > 1; floor--) {
    if (floorPowerState(power, floor) !== 'danger') return floor;
  }
  return 1;
}

/** 10층 단위 구간 — `1~10층`, `11~20층` … `MAX_FLOOR`까지만 만든다(확장 시 상수 하나로 늘어난다). */
export type FloorGroup = { lo: number; hi: number; label: string };
export function floorGroups(size = 10): FloorGroup[] {
  const groups: FloorGroup[] = [];
  for (let lo = 1; lo <= MAX_FLOOR; lo += size) {
    const hi = Math.min(MAX_FLOOR, lo + size - 1);
    groups.push({ lo, hi, label: `${lo}~${hi}층` });
  }
  return groups;
}

/** 이 층이 속한 구간의 시작 층(`1~10층`의 1). */
export function groupStart(floor: number, size = 10): number {
  return Math.floor((clampFloor(floor) - 1) / size) * size + 1;
}

/** `1,234` — 권장 전투력 표기. */
export function formatPower(value: number): string {
  return Math.round(value).toLocaleString('ko-KR');
}

/** 구간 안에서 가장 낮은·높은 권장 전투력 — 접힌 구간 머리에 `권장 X ~ Y`로 쓴다. */
export function groupPowerRange(group: FloorGroup): { lo: number; hi: number } {
  return { lo: recommendedFloorPower(group.lo), hi: recommendedFloorPower(group.hi) };
}
