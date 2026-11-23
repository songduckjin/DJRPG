/** 액티브 24종의 판정·지면 표시 공용 규격. 단위는 월드 좌표(px), arc는 중심선 양쪽 각도(rad). */
import { skillDuration, skillRange, type PassiveId, type SkillId } from '../skills';

export type SkillAreaKind = 'arc' | 'box' | 'circle' | 'projectile' | 'buff' | 'single';
export type SkillAreaRule = { kind: SkillAreaKind; radius?: number; arc?: number; halfWidth?: number; projectileRadius?: number };
export type SkillArea = SkillAreaRule & { range: number; duration: number };

/** 고정 반경만 기록한다. 레벨에 따라 커지는 사거리는 skillRange가 계산한다. */
export const SKILL_AREAS: Record<SkillId, SkillAreaRule> = {
  slash2: { kind: 'box', halfWidth: 90 }, slam: { kind: 'circle' },
  warcry: { kind: 'buff', radius: 115 }, power: { kind: 'single' },
  destroy: { kind: 'box', halfWidth: 80 }, hell: { kind: 'circle' },
  crushing: { kind: 'single' }, spin: { kind: 'circle' },
  doubleShot: { kind: 'projectile', projectileRadius: 40 },
  multiShot: { kind: 'projectile', projectileRadius: 34 },
  pierceShot: { kind: 'projectile', projectileRadius: 52 },
  iceArrow: { kind: 'projectile', projectileRadius: 54 },
  hawkEye: { kind: 'buff' },
  snipe: { kind: 'projectile', projectileRadius: 38 },
  stormVolley: { kind: 'projectile', projectileRadius: 34 },
  arrowRain: { kind: 'circle', radius: 92 },
  fireBolt: { kind: 'projectile', projectileRadius: 36 },
  iceBolt: { kind: 'projectile', projectileRadius: 52 },
  chainLightning: { kind: 'projectile', projectileRadius: 70 },
  manaBurst: { kind: 'circle', radius: 96 },
  frostNova: { kind: 'circle' }, arcaneShield: { kind: 'buff' },
  meteorStrike: { kind: 'circle', radius: 110 },
  arcaneOverlord: { kind: 'circle' }
};

/** 패시브는 타격 범위가 없지만 전수 감사에서 누락되지 않게 같은 장부에 둔다. */
export const PASSIVE_AREAS: Record<PassiveId, { kind: 'passive'; radius: 0 }> = {
  mastery: { kind: 'passive', radius: 0 }, body: { kind: 'passive', radius: 0 }, instinct: { kind: 'passive', radius: 0 },
  bowMastery: { kind: 'passive', radius: 0 }, swiftStep: { kind: 'passive', radius: 0 }, hawkSight: { kind: 'passive', radius: 0 },
  staffMastery: { kind: 'passive', radius: 0 }, manaCircuit: { kind: 'passive', radius: 0 }, arcaneSense: { kind: 'passive', radius: 0 }
};

export function skillArea(id: SkillId, level: number): SkillArea {
  const rule = SKILL_AREAS[id];
  return { ...rule, range: skillRange(id, level), radius: rule.radius ?? skillRange(id, level), duration: skillDuration(id, level) };
}

/** 검기가 수명 마지막 20% 전에 끝까지 도달해 마지막 판정이 빠지지 않게 한다. */
export function destroyTravelProgress(age: number, duration: number): number { return Math.min(1, age / duration * 1.25); }

/** 월드 원을 전투 화면의 아이소 투영(.86/.43)에 옮긴 정확한 바닥 타원. */
export function projectedAreaRadii(radius: number): { x: number; y: number } {
  return { x: radius * Math.SQRT2 * .86, y: radius * Math.SQRT2 * .43 };
}
