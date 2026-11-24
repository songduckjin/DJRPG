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
  pierceShot: { kind: 'projectile', projectileRadius: 24 },
  iceArrow: { kind: 'projectile', projectileRadius: 62 },
  hawkEye: { kind: 'buff' },
  snipe: { kind: 'projectile', projectileRadius: 38 },
  stormVolley: { kind: 'projectile', projectileRadius: 34 },
  arrowRain: { kind: 'circle', radius: 92 },
  fireBolt: { kind: 'projectile', projectileRadius: 36 },
  iceBolt: { kind: 'projectile', projectileRadius: 52 },
  chainLightning: { kind: 'projectile', projectileRadius: 40 },
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
  const radius = id === 'arrowRain' ? (rule.radius ?? 0) + (level - 1) * 6 : rule.radius ?? skillRange(id, level);
  const projectileRadius = id === 'iceArrow' ? (rule.projectileRadius ?? 0) + (level - 1) * 2 : rule.projectileRadius;
  return { ...rule, projectileRadius, range: skillRange(id, level), radius, duration: skillDuration(id, level) };
}

/** 멀티 샷은 Lv.1/4/7/10에 5/7/9/11발로 늘고, 양쪽 퍼짐도 레벨마다 커진다. */
export function multiShotPattern(level: number): { count: number; halfArc: number } {
  const lv = Math.max(1, Math.min(10, Math.floor(Number.isFinite(level) ? level : 1)));
  return { count: 5 + 2 * Math.floor((lv - 1) / 3), halfArc: .34 + (lv - 1) * .04 };
}

/** 빙결 화살의 둔화 시간과 이동 배율. 수치가 작을수록 느려진다. */
export function iceArrowSlow(level: number): { duration: number; speedScale: number } {
  const lv = Math.max(1, Math.min(10, Math.floor(Number.isFinite(level) ? level : 1)));
  return { duration: 2.4 + (lv - 1) * .18, speedScale: .55 - (lv - 1) * .03 };
}

/** 체인 라이트닝의 다음 표적은 직전 표적에서 이 거리 안의 가장 가까운 미피격 적이다. */
export const CHAIN_LIGHTNING_JUMP_RADIUS = 108;

/** 붉은 검기는 시전 초반에 빠르게 끝까지 뻗고, 남은 시간은 잔상으로 남는다. */
export function destroyTravelProgress(age: number, duration: number): number { return Math.min(1, age / duration * 2.2); }

/** 월드 원을 전투 화면의 아이소 투영(.86/.43)에 옮긴 정확한 바닥 타원. */
export function projectedAreaRadii(radius: number): { x: number; y: number } {
  return { x: radius * Math.SQRT2 * .86, y: radius * Math.SQRT2 * .43 };
}
