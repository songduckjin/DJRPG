import type { CostumeMotionTemplate } from '../costume/skillMotion';

export function heroAnimationMode(moving: boolean, attackPose: number, hasAttackSheet: boolean): 'idle' | 'walk' | 'attack' {
  if (moving) return 'walk';
  return attackPose > 0 && hasAttackSheet ? 'attack' : 'idle';
}

// The attack sheets already carry the swing, so the body itself never stretches, squashes,
// tips over or rotates for the spin skill. Spin is shown by its VFX and afterimages.
export function heroMotion(
  attackPose: number
): { pulse: number; scaleX: number; scaleY: number; rotation: number } {
  return {
    pulse: attackPose > 0 ? Math.sin(Math.PI * (1 - attackPose / .32)) : 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0
  };
}

/**
 * 코스튬 렌더러의 모션 이름 (작업 140).
 *
 * `docs/COSTUME_SYSTEM.md` §3·§3.3의 기본 동작(대기 1·걷기 8·기본 공격 4)과 스킬 4대
 * 템플릿(`slash`·`spin`·`smash`·`cast`)을 그대로 쓴다. 프레임 수는 데이터이며 아래 표가
 * 유일한 정의다 — `src/game/costume/skillMotion.ts`의 템플릿 ID와 이름이 같다.
 */
export type HeroCostumeMotion = 'idle' | 'walk' | 'attack' | CostumeMotionTemplate;

/** 아틀라스 한 줄(파츠 하나)의 모션 순서. 인덱스가 곧 프레임 슬롯 오프셋이다. */
export const costumeMotionOrder: readonly HeroCostumeMotion[] = ['idle', 'walk', 'attack', 'slash', 'spin', 'smash', 'cast'];

/** 모션별 프레임 수. 대기 1 · 걷기 8 · 기본 공격 4 · 스킬 템플릿 4/6/4/3. */
export const costumeMotionFrames: Record<HeroCostumeMotion, number> = {
  idle: 1, walk: 8, attack: 4, slash: 4, spin: 6, smash: 4, cast: 3
};

/** 파츠 하나가 아틀라스에서 차지하는 프레임 슬롯 수(1+8+4+4+6+4+3 = 30). */
export const costumeFramesPerPart = costumeMotionOrder.reduce((sum, motion) => sum + costumeMotionFrames[motion], 0);

/** 모션이 시작하는 프레임 슬롯. */
export function costumeMotionFrameOffset(motion: HeroCostumeMotion): number {
  const index = costumeMotionOrder.indexOf(motion);
  return costumeMotionOrder.slice(0, index < 0 ? 0 : index).reduce((sum, entry) => sum + costumeMotionFrames[entry], 0);
}

/** 모션 안의 프레임 번호 → 파츠 안의 프레임 슬롯(0..29). 범위를 벗어난 값은 양끝으로 고정한다. */
export function costumeMotionSlot(motion: HeroCostumeMotion, frame: number): number {
  const count = costumeMotionFrames[motion] ?? 1;
  const index = Number.isFinite(frame) ? Math.min(count - 1, Math.max(0, Math.trunc(frame))) : 0;
  return costumeMotionFrameOffset(motion) + index;
}

/**
 * `world.ts` 상태 → 코스튬 모션. 대기·걷기·기본 공격·스킬 4종을 1:1로 잇는다.
 * 걷기가 공격보다 우선하는 기존 `heroAnimationMode` 규칙을 그대로 유지한다.
 * `skill`은 진행 중인 스킬의 템플릿이며, 없으면 기본 공격 모션이다.
 */
export function heroCostumeMotion(input: { moving: boolean; attackPose: number; skill?: CostumeMotionTemplate | null }): HeroCostumeMotion {
  if (input.moving) return 'walk';
  if (input.skill) return input.skill;
  if (input.attackPose > 0) return 'attack';
  return 'idle';
}

function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }

/** 시각 재생 배율 상한. 실기 FPS를 지키기 위해 3배까지만 올린다. */
export const costumePlaybackRateLimit = 3;

/**
 * 공격 속도 배율 → 시각 재생 배율 (작업 140 요구 3).
 *
 * `world.ts`의 공격 쿨다운(`cooldowns.attack / (1 + speed / 100)`, 광폭 시
 * `/ (1.5 + (berserkLevel - 1) * .08)`)과 **같은 식**을 역수로 쓴다. 즉 쿨다운이 짧아진
 * 비율만큼 모션 프레임이 빨리 넘어간다. 렌더러는 전투 판정·월드 위치를 바꾸지 않는다.
 */
export function costumePlaybackRate(input: { speed: number; berserk?: number; berserkLevel?: number }): number {
  const speed = Number.isFinite(input.speed) ? Math.max(0, input.speed) : 0;
  const base = 1 + speed / 100;
  const rage = input.berserk && input.berserk > 0 ? 1.5 + (Math.max(1, input.berserkLevel ?? 1) - 1) * .08 : 1;
  return clamp(base * rage, 1, costumePlaybackRateLimit);
}

/**
 * 모션 진행도(0..1) → 프레임 번호. 재생 배율을 곱해 빠른 공격에서 임팩트 프레임에
 * 더 일찍 도달하게 한다(그 뒤로는 마지막 프레임 유지).
 */
export function costumeFrameIndex(motion: HeroCostumeMotion, progress: number, rate = 1): number {
  const count = costumeMotionFrames[motion] ?? 1;
  if (count <= 1) return 0;
  const scale = Number.isFinite(rate) && rate > 0 ? rate : 1;
  const ratio = clamp(Number.isFinite(progress) ? progress : 0, 0, 1) * scale;
  return Math.min(count - 1, Math.floor(clamp(ratio, 0, 1) * count));
}
