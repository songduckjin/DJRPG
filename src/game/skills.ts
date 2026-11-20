export const UNLOCK_ALL_SKILLS_FOR_TEST = false;

export type Job = 'warrior' | 'archer' | 'mage';
export const jobs: readonly Job[] = ['warrior', 'archer', 'mage'];
export const jobNames: Record<Job, string> = { warrior: '전사', archer: '궁수', mage: '마법사' };
/** 저장·서버 응답의 직업 값 정규화 — 모르는 값과 없는 값은 전사다(기존 세이브 호환). */
export function jobOrDefault(value: unknown): Job { return value === 'archer' || value === 'mage' ? value : 'warrior'; }

export type WarriorSkillId = 'slash2' | 'spin' | 'crushing' | 'slam' | 'warcry' | 'power' | 'destroy' | 'hell';
export type ArcherSkillId = 'doubleShot' | 'multiShot' | 'pierceShot' | 'iceArrow' | 'hawkEye' | 'snipe' | 'stormVolley' | 'arrowRain';
export type MageSkillId = 'fireBolt' | 'iceBolt' | 'chainLightning' | 'manaBurst' | 'frostNova' | 'arcaneShield' | 'meteorStrike' | 'arcaneOverlord';
export type SkillId = WarriorSkillId | ArcherSkillId | MageSkillId;
export type WarriorPassiveId = 'mastery' | 'body' | 'instinct';
export type ArcherPassiveId = 'bowMastery' | 'swiftStep' | 'hawkSight';
export type MagePassiveId = 'staffMastery' | 'manaCircuit' | 'arcaneSense';
export type PassiveId = WarriorPassiveId | ArcherPassiveId | MagePassiveId;
export type SkillLevelId = SkillId | PassiveId;
export const MAX_SKILL_LEVEL = 30;
export function skillUpgradeCost(level: number): number { return 40 * level * level; }
export type Skill = { id: SkillId; name: string; level: number; icon: string; cooldown: number; power: string; description: string; range: number };
export type Passive = { id: PassiveId; name: string; level: number; icon: string; description: string };

/** 전사 액티브 8종 — 배열 순서가 스킬창·퀵슬롯·스킬북 순서다.
 *  작업 212에서 사용자가 정한 순서로 바꿨다: **딜레이 크러싱·드래곤 트위스터가 마지막 두 자리**이고,
 *  그 앞은 slam·warcry·power·destroy·hell 이 해금 레벨 순(4·5·7·10·14)으로 이어진다. */
export const skillOrder: WarriorSkillId[] = ['slash2', 'slam', 'warcry', 'power', 'destroy', 'hell', 'crushing', 'spin'];
/** 궁수 액티브 8종 — 붉은보석식 원거리 사격 트리. */
export const archerSkillOrder: ArcherSkillId[] = ['doubleShot', 'multiShot', 'pierceShot', 'iceArrow', 'hawkEye', 'snipe', 'stormVolley', 'arrowRain'];
/** 마법사 액티브 8종 — 원거리 마법탄 트리(스킬 연출은 추후 고도화, 지금은 뼈대). */
export const mageSkillOrder: MageSkillId[] = ['fireBolt', 'iceBolt', 'chainLightning', 'manaBurst', 'frostNova', 'arcaneShield', 'meteorStrike', 'arcaneOverlord'];
export const allSkillIds: SkillId[] = [...skillOrder, ...archerSkillOrder, ...mageSkillOrder];
export function skillOrderFor(job: Job): SkillId[] { return job === 'archer' ? archerSkillOrder : job === 'mage' ? mageSkillOrder : skillOrder; }

export const skills: Record<SkillId, Skill> = {
  slash2: { id: 'slash2', name: '휘두르기', level: 2, icon: '⚔', cooldown: 4, power: '공격력 × 2.15', description: '대검을 한 번 크게 휘둘러 전방의 적을 공격한다.', range: 96 },
  // 1번 다음 다섯 자리는 작업 212에서 해금 레벨을 앞당겼다(4·5·7·10·14) — 크러싱·트위스터가 마지막 두 자리다.
  slam: { id: 'slam', name: '와일드 스탬프', level: 4, icon: '💥', cooldown: 8, power: '공격력 × 2.2', description: '지면을 내리찍어 붉은 균열을 만들고 적을 밀쳐 둔화시킨다.', range: 126 },
  warcry: { id: 'warcry', name: '블러드 레이지', level: 5, icon: '🩸', cooldown: 14, power: '공격력 × 1.5 · 공격속도 상승', description: '6초 동안 붉은 투기로 공격력·공격속도·이동속도가 상승한다.', range: 120 },
  power: { id: 'power', name: '파워 스트라이크', level: 7, icon: '⚡', cooldown: 6, power: '공격력 × 4.0', description: '좁은 전방에 강력한 일격을 꽂아 보스를 노린다.', range: 100 },
  destroy: { id: 'destroy', name: '디스트로이 스윙', level: 10, icon: '☄', cooldown: 9, power: '공격력 × 2.7', description: '전방으로 거대한 붉은 검기 충격파를 날린다.', range: 175 },
  hell: { id: 'hell', name: '헬 파이어 소드', level: 14, icon: '🔥', cooldown: 16, power: '공격력 × 3.2', description: '불타는 대검 폭발로 넓은 범위의 적을 태운다.', range: 185 },
  // [작업 212] 딜레이 크러싱 — 붉은보석1식 단일 타겟 10연타. 총 위력은 예전 한 방(× 3.4)과 같다.
  crushing: { id: 'crushing', name: '딜레이 크러싱', level: 18, icon: '◉', cooldown: 10, power: '공격력 × 3.4 · 단일 타겟 10연타', description: '적 하나에게 잔상을 남기며 빠르게 10번 내려친다.', range: 125 },
  spin: { id: 'spin', name: '드래곤 트위스터', level: 24, icon: '🐉', cooldown: 6, power: '공격력 × 1.65', description: '굵은 용이 넓게 선회하다 궤도를 좁혀 하늘로 솟는다.', range: 170 },
  doubleShot: { id: 'doubleShot', name: '더블 샷', level: 2, icon: '🏹', cooldown: 4, power: '공격력 × 1.35 · 2발', description: '시위를 두 번 당겨 두 발의 화살을 빠르게 날린다.', range: 232 },
  multiShot: { id: 'multiShot', name: '멀티 샷', level: 4, icon: '🎯', cooldown: 7, power: '공격력 × 0.95 · 5발', description: '부채꼴로 다섯 발의 화살을 흩뿌려 여러 적을 동시에 맞힌다.', range: 226 },
  pierceShot: { id: 'pierceShot', name: '관통 사격', level: 5, icon: '➳', cooldown: 8, power: '공격력 × 2.6 · 관통', description: '강하게 당긴 화살이 여러 적을 꿰뚫고 지나간다.', range: 268 },
  iceArrow: { id: 'iceArrow', name: '빙결 화살', level: 7, icon: '❄', cooldown: 9, power: '공격력 × 1.9 · 둔화', description: '서리 화살이 맞은 적을 얼려 잠시 느리게 만든다.', range: 236 },
  hawkEye: { id: 'hawkEye', name: '호크아이', level: 10, icon: '🦅', cooldown: 16, power: '공격력 × 1.35 · 공격속도 상승', description: '8초 동안 매의 눈으로 공격력과 공격속도가 크게 오른다.', range: 200 },
  snipe: { id: 'snipe', name: '저격 일격', level: 14, icon: '👁', cooldown: 11, power: '공격력 × 4.3', description: '숨을 멈추고 먼 거리의 적 하나를 정확히 꿰뚫는다.', range: 300 },
  stormVolley: { id: 'stormVolley', name: '폭풍 연사', level: 18, icon: '🌪', cooldown: 12, power: '공격력 × 0.8 · 6발', description: '폭풍 같은 연사로 여섯 발의 화살을 연달아 퍼붓는다.', range: 248 },
  arrowRain: { id: 'arrowRain', name: '애로우 레인', level: 24, icon: '☔', cooldown: 18, power: '공격력 × 0.85 · 화살비', description: '하늘로 쏘아 올린 화살이 적의 진영에 비처럼 쏟아진다.', range: 258 },
  fireBolt: { id: 'fireBolt', name: '파이어 볼트', level: 2, icon: '🔥', cooldown: 4, power: '공격력 × 2.0', description: '지팡이 끝에서 불꽃 구슬을 날려 적 하나를 태운다.', range: 228 },
  iceBolt: { id: 'iceBolt', name: '아이스 볼트', level: 4, icon: '❄', cooldown: 7, power: '공격력 × 1.7 · 둔화', description: '서리 구슬이 맞은 적을 얼려 잠시 느리게 만든다.', range: 236 },
  chainLightning: { id: 'chainLightning', name: '체인 라이트닝', level: 5, icon: '⚡', cooldown: 8, power: '공격력 × 1.25 · 연쇄', description: '번개가 적에게 튀어 가까운 적 여럿을 연달아 감전시킨다.', range: 240 },
  manaBurst: { id: 'manaBurst', name: '마력 폭발', level: 7, icon: '◉', cooldown: 10, power: '공격력 × 2.5 · 폭발', description: '적의 위치에 마력을 응축했다가 터뜨려 주변을 함께 삼킨다.', range: 220 },
  frostNova: { id: 'frostNova', name: '프로스트 노바', level: 10, icon: '✳', cooldown: 12, power: '공격력 × 1.5 · 둔화', description: '발밑에서 서리 파동이 퍼져 가까운 적을 얼리고 밀어낸다.', range: 150 },
  arcaneShield: { id: 'arcaneShield', name: '아케인 실드', level: 14, icon: '⛨', cooldown: 16, power: '공격력 × 1.3 · 공격속도 상승', description: '8초 동안 비전 보호막을 두르고 공격력과 공격속도가 오른다.', range: 120 },
  meteorStrike: { id: 'meteorStrike', name: '메테오 스트라이크', level: 18, icon: '☄', cooldown: 13, power: '공격력 × 3.6', description: '하늘에서 불덩이를 떨어뜨려 적의 자리를 크게 내리친다.', range: 250 },
  arcaneOverlord: { id: 'arcaneOverlord', name: '아르카나 오버로드', level: 24, icon: '✵', cooldown: 18, power: '공격력 × 3.0', description: '지팡이의 마력을 한꺼번에 터뜨려 주변을 비전 폭풍으로 휩쓴다.', range: 210 }
};

export const passiveOrder: WarriorPassiveId[] = ['mastery', 'body', 'instinct'];
export const archerPassiveOrder: ArcherPassiveId[] = ['bowMastery', 'swiftStep', 'hawkSight'];
export const magePassiveOrder: MagePassiveId[] = ['staffMastery', 'manaCircuit', 'arcaneSense'];
export const allPassiveIds: PassiveId[] = [...passiveOrder, ...archerPassiveOrder, ...magePassiveOrder];
export function passiveOrderFor(job: Job): PassiveId[] { return job === 'archer' ? archerPassiveOrder : job === 'mage' ? magePassiveOrder : passiveOrder; }

export const passives: Record<PassiveId, Passive> = {
  mastery: { id: 'mastery', name: '대검 숙련', level: 3, icon: '✥', description: '공격력 영구 +15%' },
  body: { id: 'body', name: '강인한 육체', level: 6, icon: '⬟', description: '최대 HP·방어력 영구 +15%' },
  instinct: { id: 'instinct', name: '전투 본능', level: 12, icon: '◈', description: '치명타 확률 +8% · 공격속도 +12%' },
  bowMastery: { id: 'bowMastery', name: '궁술 숙련', level: 3, icon: '✥', description: '공격력 영구 +15%' },
  swiftStep: { id: 'swiftStep', name: '신속의 발걸음', level: 6, icon: '➤', description: '이동속도·공격속도 영구 +12%' },
  hawkSight: { id: 'hawkSight', name: '매의 눈', level: 12, icon: '◈', description: '치명타 확률 +8% · 사거리 +8%' },
  staffMastery: { id: 'staffMastery', name: '지팡이 숙련', level: 3, icon: '✥', description: '공격력 영구 +15%' },
  manaCircuit: { id: 'manaCircuit', name: '마나 회로', level: 6, icon: '➤', description: '이동속도·공격속도 영구 +12%' },
  arcaneSense: { id: 'arcaneSense', name: '비전 감응', level: 12, icon: '◈', description: '치명타 확률 +8% · 사거리 +8%' }
};

export function canLearn(level: number, required: number): boolean { return UNLOCK_ALL_SKILLS_FOR_TEST || level >= required; }
/** 스킬 레벨당 사거리 증가폭. */
const rangeGrowth: Partial<Record<SkillId, number>> = { warcry: 0, destroy: 7, hawkEye: 0, arrowRain: 6, snipe: 8, stormVolley: 5, pierceShot: 6, arcaneShield: 0, frostNova: 4, fireBolt: 5, iceBolt: 5, chainLightning: 6, manaBurst: 5, meteorStrike: 7, arcaneOverlord: 6 };
export function skillRange(id: SkillId, level: number): number { return skills[id].range + (rangeGrowth[id] ?? 4) * (level - 1); }
export function skillDuration(id: SkillId, level: number): number {
  if (id === 'spin') return 1 + (level - 1) * .22;
  if (id === 'warcry') return 6 + (level - 1) * 1.2;
  if (id === 'slam') return .65 + (level - 1) * .12;
  if (id === 'hell') return .8 + (level - 1) * .16;
  if (id === 'slash2') return .55 + (level - 1) * .04;
  if (id === 'crushing') return .9 + (level - 1) * .06;
  if (id === 'power') return .4 + (level - 1) * .04;
  if (id === 'hawkEye') return 8 + (level - 1) * 1.1;
  if (id === 'stormVolley') return 1.1 + (level - 1) * .05;
  if (id === 'arrowRain') return 1.6 + (level - 1) * .07;
  if (id === 'iceArrow') return .8 + (level - 1) * .05;
  if (id === 'arcaneShield') return 8 + (level - 1) * 1.1;
  if (id === 'manaBurst') return .9 + (level - 1) * .06;
  if (id === 'meteorStrike') return 1 + (level - 1) * .06;
  if (id === 'frostNova') return .8 + (level - 1) * .05;
  if (id === 'arcaneOverlord') return 1.4 + (level - 1) * .07;
  if (id === 'chainLightning') return .55 + (level - 1) * .04;
  if (id === 'fireBolt' || id === 'iceBolt') return .5 + (level - 1) * .04;
  return .55 + (level - 1) * .05;
}
export function skillDamageScale(level: number): number { return 1 + (level - 1) * .1; }

function ease(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
export function dragonOrbitFactor(progress: number): number {
  if (progress < .38) return .12 + .88 * ease(progress / .38);
  if (progress <= .5) return 1;
  return 1 - .72 * ease((progress - .5) / .45);
}
export function dragonRise(progress: number): number { return 120 * ease((progress - .5) / .45); }
