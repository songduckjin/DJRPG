export type Weapon = 'one' | 'great';
export type Motion = 'walk' | 'slash' | 'spin' | 'smash' | 'cast';
export const walkFrames = 8;
export const frameMs = 110;

/** 장비 부위. 지금은 갑옷·투구만 가림 검증 대상이다. */
export type GearSlot = 'armor' | 'helmet';
export type Gear = Record<GearSlot, boolean>;
/** 가림 방식: `hide` = 본체 파츠를 숨기고 장비 파츠를 덧그림, `replace` = 본체 파츠 텍스처를 장비 파츠로 교체. */
export type CoverMode = 'hide' | 'replace';
export const coverModes: readonly CoverMode[] = ['hide', 'replace'];

/** 본체 파츠(머리·몸통·팔·다리)와 장비 파츠(갑옷·투구). */
export type PartId = 'head' | 'torso' | 'arm' | 'legs' | 'armor' | 'helmet';
export type PartVariant = 'bare' | 'armored' | 'helmed';
export type PartState = { visible: boolean; variant: PartVariant };

/**
 * 가림 방식을 파츠 표시 표로 만든다.
 * - `hide`: 장비를 입은 부위의 본체 파츠를 `visible=false`로 끄고 장비 파츠를 별도 레이어로 그린다.
 * - `replace`: 본체 파츠는 계속 보이되 `variant`만 장비용 텍스처로 바뀌고 장비 레이어는 쓰지 않는다.
 * 팔·다리는 두 방식 모두 항상 표시한다(장비는 상체·머리만 덮는다).
 */
export function partPlan(gear: Gear, mode: CoverMode): Record<PartId, PartState> {
  const replace = mode === 'replace';
  return {
    head: replace
      ? { visible: true, variant: gear.helmet ? 'helmed' : 'bare' }
      : { visible: !gear.helmet, variant: 'bare' },
    torso: replace
      ? { visible: true, variant: gear.armor ? 'armored' : 'bare' }
      : { visible: !gear.armor, variant: 'bare' },
    arm: { visible: true, variant: 'bare' },
    legs: { visible: true, variant: 'bare' },
    armor: { visible: !replace && gear.armor, variant: 'armored' },
    helmet: { visible: !replace && gear.helmet, variant: 'helmed' },
  };
}

/** 화면·비교표에 그대로 쓰는 한 줄 설명. */
export function coverModeNote(mode: CoverMode, gear: Gear): string {
  if (mode === 'replace') {
    const swapped = [gear.helmet ? '머리→투구' : null, gear.armor ? '몸통→갑옷' : null].filter(Boolean);
    return `파츠 교체: ${swapped.length ? swapped.join(' · ') + ' 텍스처 교체' : '교체할 장비 없음(본체 그대로)'}`;
  }
  const hidden = [gear.helmet ? '머리 파츠 숨김' : null, gear.armor ? '몸통 파츠 숨김' : null].filter(Boolean);
  return `파츠 숨김: ${hidden.length ? hidden.join(' · ') + ' + 장비 레이어 덧그림' : '숨길 파츠 없음'}`;
}

export function pose(frame: number, weapon: Weapon, motion: Motion = 'walk') {
  const phase = (frame % walkFrames + walkFrames) % walkFrames;
  const step = Math.sin(phase * Math.PI / 4);
  const lift = Math.max(0, Math.cos(phase * Math.PI / 2));
  const attack = motion === 'smash' ? -26 : motion === 'slash' ? -12 : motion === 'cast' ? -8 : 0;
  const hand = { x: (weapon === 'great' ? 27 : 33) + step * 5, y: -96 + lift * 3 + attack };
  return {
    phase, hand,
    torso: { x: 0, y: -89 - lift * 2 },
    arm: { x: 22 + step * 3, y: -103 - lift * 2, rotation: (weapon === 'great' ? -.24 : -.08) + step * .12 + attack * .012 },
    legs: { x: step * 4, y: 0, rotation: step * .08 },
    weaponRotation: (weapon === 'great' ? -.25 : .13) + step * .08 + attack * .018,
    effect: motion === 'walk' ? 0 : motion === 'spin' ? 1 : .55
  };
}

export function estimateCanvas(weapon: Weapon, motions: Motion[] = ['walk','slash','spin','smash','cast']) {
  let left = -62, right = 62, top = -180, bottom = 8;
  for (const motion of motions) for (let frame = 0; frame < walkFrames; frame++) {
    const p = pose(frame, weapon, motion);
    const reach = weapon === 'great' ? 112 : 83;
    left = Math.min(left, p.hand.x - reach);
    right = Math.max(right, p.hand.x + reach);
    top = Math.min(top, p.hand.y - reach);
  }
  return { left: Math.floor(left), right: Math.ceil(right), top: Math.floor(top), bottom, width: Math.ceil(right-left), height: Math.ceil(bottom-top) };
}

export function productionFrames(armorCount: number, sharedArmor: boolean, genderVariants: number, skillFrames = 17) {
  const uniqueArmor = armorCount * (sharedArmor ? 1 : 2) * genderVariants;
  return { body: (1 + 8 + 4 + skillFrames) * 2 * genderVariants, armor: uniqueArmor * (1 + 8 + 4 + skillFrames) };
}
