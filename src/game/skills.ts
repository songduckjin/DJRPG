export const UNLOCK_ALL_SKILLS_FOR_TEST = true;

export type SkillId = 'slash2' | 'spin' | 'slam' | 'warcry' | 'power' | 'destroy' | 'hell';
export type PassiveId = 'mastery' | 'body' | 'instinct';
export type SkillLevelId = SkillId | PassiveId;
export const MAX_SKILL_LEVEL = 10;
export function skillUpgradeCost(level: number): number { return 40 * level * level; }
export type Skill = { id: SkillId; name: string; level: number; icon: string; cost: number; cooldown: number; power: string; description: string; range: number };
export type Passive = { id: PassiveId; name: string; level: number; icon: string; description: string };

export const skillOrder: SkillId[] = ['slash2', 'spin', 'slam', 'warcry', 'power', 'destroy', 'hell'];
export const skills: Record<SkillId, Skill> = {
  slash2: { id: 'slash2', name: '소드 슬래시', level: 2, icon: '⚔', cost: 12, cooldown: 4, power: '공격력 × 0.9 · 2회', description: '전방을 빠르게 두 번 가르는 연속 대검 베기.', range: 96 },
  spin: { id: 'spin', name: '드래곤 트위스터', level: 4, icon: '🐉', cost: 20, cooldown: 6, power: '공격력 × 1.65', description: '붉은·황금빛 용오름 검기로 주변 360도를 휩쓴다.', range: 108 },
  slam: { id: 'slam', name: '와일드 스탬프', level: 7, icon: '💥', cost: 24, cooldown: 8, power: '공격력 × 2.2', description: '지면을 내리찍어 붉은 균열을 만들고 적을 밀쳐 둔화시킨다.', range: 126 },
  warcry: { id: 'warcry', name: '블러드 레이지', level: 10, icon: '🩸', cost: 30, cooldown: 14, power: '공격력 × 1.5 · 공격속도 상승', description: '6초 동안 붉은 투기로 공격력·공격속도·이동속도가 상승한다.', range: 120 },
  power: { id: 'power', name: '파워 스트라이크', level: 14, icon: '⚡', cost: 18, cooldown: 6, power: '공격력 × 4.0', description: '좁은 전방에 강력한 일격을 꽂아 보스를 노린다.', range: 100 },
  destroy: { id: 'destroy', name: '디스트로이 스윙', level: 18, icon: '☄', cost: 28, cooldown: 9, power: '공격력 × 2.7', description: '전방으로 거대한 붉은 검기 충격파를 날린다.', range: 175 },
  hell: { id: 'hell', name: '헬 파이어 소드', level: 24, icon: '🔥', cost: 40, cooldown: 16, power: '공격력 × 3.2', description: '불타는 대검 폭발로 넓은 범위의 적을 태운다.', range: 185 }
};

export const passiveOrder: PassiveId[] = ['mastery', 'body', 'instinct'];
export const passives: Record<PassiveId, Passive> = {
  mastery: { id: 'mastery', name: '대검 숙련', level: 3, icon: '✥', description: '공격력 영구 +15%' },
  body: { id: 'body', name: '강인한 육체', level: 6, icon: '⬟', description: '최대 HP·방어력 영구 +15%' },
  instinct: { id: 'instinct', name: '전투 본능', level: 12, icon: '◈', description: '치명타 확률 +8% · 공격속도 +12%' }
};

export function canLearn(level: number, required: number): boolean { return UNLOCK_ALL_SKILLS_FOR_TEST || level >= required; }
export function skillRange(id: SkillId, level: number): number { return skills[id].range + (id === 'warcry' ? 0 : id === 'destroy' ? 7 : 4) * (level - 1); }
export function skillDuration(id: SkillId, level: number): number {
  if (id === 'spin') return 1 + (level - 1) * .22;
  if (id === 'warcry') return 6 + (level - 1) * 1.2;
  if (id === 'slam') return .65 + (level - 1) * .12;
  if (id === 'hell') return .8 + (level - 1) * .16;
  if (id === 'slash2') return .35 + (level - 1) * .04;
  if (id === 'power') return .4 + (level - 1) * .04;
  return .55 + (level - 1) * .05;
}
export function skillDamageScale(level: number): number { return 1 + (level - 1) * .1; }
