export const UNLOCK_ALL_SKILLS_FOR_TEST = false;

export type Job = 'warrior' | 'archer' | 'mage';
export const jobs: readonly Job[] = ['warrior', 'archer', 'mage'];
export const jobNames: Record<Job, string> = { warrior: '전사', archer: '궁수', mage: '마법사' };
/**
 * 좁은 칸(가방·공용창고·거래소 판매 칸)용 한 글자 직업 표기 — 사용자가 부르던 `전·궁·법` 그대로.
 * 30~40px 칸에서는 두 글자 `전사`가 칸을 다 덮어 `+N`·등급 배지와 겹치므로, 칸 안 배지만 한 글자를 쓴다.
 * 전체 이름은 `jobNames`(상세·툴팁·`aria-label`)가 계속 맡는다.
 */
export const jobShortNames: Record<Job, string> = { warrior: '전', archer: '궁', mage: '법' };
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
/**
 * 스킬 최대 레벨 — 4단계 스킬 트리(2026-11-22 스펙)부터 **10**이다. 예전에는 30이었고 랭크가 스킬북
 * 중복으로만 올라 갔지만, 이제 SP를 넣어 Lv.10까지 올린다(`src/game/skillPoints.ts`).
 * 랭크 하나에 SP 1이고 11종을 모두 10으로 올리면 110pt, 만렙(30)의 가용 SP는 90pt다(스킬의 서로 +30).
 */
export const MAX_SKILL_LEVEL = 10;
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
  slash2: { id: 'slash2', name: '이단참', level: 2, icon: '⚔', cooldown: 4, power: '공격력 × 1.1 · 2연격', description: '전방을 두 번 교차해 X자 검기를 만든다. 정방향 일격 뒤 되받아 베는 일격이 따로 들어간다.', range: 130 },
  // 1번 다음 다섯 자리는 작업 212에서 해금 레벨을 앞당겼다(4·5·7·10·14) — 크러싱·트위스터가 마지막 두 자리다.
  slam: { id: 'slam', name: '와일드 스탬프', level: 4, icon: '💥', cooldown: 8, power: '공격력 × 2.2', description: '주변 지면을 내리찍어 원형 용암 균열을 만들고 적을 밀쳐 둔화시킨다.', range: 90 },
  warcry: { id: 'warcry', name: '블러드 레이지', level: 5, icon: '🩸', cooldown: 14, power: '공격력 × 1.2 · 공격속도 상승', description: '6초 동안(레벨당 +0.2초) 붉은 투기로 공격력·공격속도·이동속도가 상승한다.', range: 120 },
  power: { id: 'power', name: '파워 스트라이크', level: 7, icon: '⚡', cooldown: 6, power: '공격력 × 5.5', description: '사거리 안의 적 하나를 정확히 겨눠 강력한 일격을 꽂는다.', range: 100 },
  destroy: { id: 'destroy', name: '디스트로이 스윙', level: 10, icon: '☄', cooldown: 9, power: '공격력 × 2.7', description: '전방으로 거대한 붉은 검기 충격파를 날린다.', range: 175 },
  hell: { id: 'hell', name: '회전참격', level: 14, icon: '🌀', cooldown: 16, power: '공격력 × 3.2 · 360° 회전', description: '대검을 크게 휘둘러 제자리에서 360° 회전하며, 사방의 적을 암흑·진홍 혈풍과 함께 한 번에 베어낸다.', range: 185 },
  // [작업 212] 딜레이 크러싱 — 붉은보석1식 단일 타겟 10연타. 총 위력은 예전 한 방(× 3.4)과 같다.
  crushing: { id: 'crushing', name: '딜레이 크러싱', level: 18, icon: '◉', cooldown: 10, power: '공격력 × 3.4 · 단일 타겟 10연타', description: '적 하나에게 잔상을 남기며 빠르게 10번 내려친다.', range: 125 },
  spin: { id: 'spin', name: '드래곤 트위스터', level: 24, icon: '🐉', cooldown: 6, power: '공격력 × 1.65', description: '굵은 용이 넓게 선회하다 궤도를 좁혀 하늘로 솟는다.', range: 170 },
  // [작업 244] 궁수·마법사 평타 사거리를 330/285로 올리면서(작업 244, world.ts) **날아가는 공격 스킬의
  // 사거리도 약 15% 함께 올렸다** — 평타만 멀어지고 스킬은 Lv.1 사거리가 그대로면(예: 더블 샷 232 < 평타 330)
  // 평타는 닿는데 스킬은 닿지 않는 자리가 생긴다. 자기 몸을 중심으로 퍼지는 기술(프로스트 노바·아르카나
  // 오버로드)과 버프(호크아이·아케인 실드)는 `range`가 곧 효과 반경이라 그대로 두었다.
  doubleShot: { id: 'doubleShot', name: '더블 샷', level: 2, icon: '🏹', cooldown: 4, power: '공격력 × 1.35 · 2발', description: '시위를 두 번 당겨 두 발의 화살을 빠르게 날린다.', range: 265 },
  multiShot: { id: 'multiShot', name: '멀티 샷', level: 4, icon: '🎯', cooldown: 7, power: '공격력 × 0.95 · 5~11발', description: '레벨에 따라 넓어지는 부채꼴로 5~11발의 관통 화살을 날린다. 한 적은 시전당 한 번 맞는다.', range: 260 },
  pierceShot: { id: 'pierceShot', name: '관통 사격', level: 5, icon: '➳', cooldown: 8, power: '공격력 × 2.6 · 관통', description: '강하게 당긴 화살이 여러 적을 꿰뚫고 지나간다.', range: 305 },
  iceArrow: { id: 'iceArrow', name: '빙결 화살', level: 7, icon: '❄', cooldown: 9, power: '공격력 × 1.9 · 광역 둔화', description: '얼음 화살 한 발이 착탄해 눈싸라기와 함께 터지고, 주변 적의 이동속도를 낮춘다. 레벨이 오르면 더 느리고 오래 지속된다.', range: 270 },
  hawkEye: { id: 'hawkEye', name: '호크아이', level: 10, icon: '🦅', cooldown: 16, power: '공격력 × 1.2 · 공격속도 상승', description: '7초 동안(레벨당 +0.17초) 매의 눈으로 공격력과 공격속도가 크게 오른다.', range: 200 },
  snipe: { id: 'snipe', name: '저격 일격', level: 14, icon: '👁', cooldown: 11, power: '공격력 × 6.5 · 단일', description: '목표에 붉은 십자 조준표를 띄운 뒤 한 발로 강하게 저격한다.', range: 340 },
  stormVolley: { id: 'stormVolley', name: '폭풍 연사', level: 18, icon: '🌪', cooldown: 12, power: '공격력 × 0.8 · 6발', description: '화살을 한 발씩 연속 발사한다. 적을 처치하면 남은 화살은 다음 적을 겨눈다.', range: 285 },
  arrowRain: { id: 'arrowRain', name: '애로우 레인', level: 24, icon: '☔', cooldown: 18, power: '공격력 × 0.85 · 화살비', description: '넓어지는 범위에 화살이 위에서 수직으로 오래 쏟아진다.', range: 295 },
  fireBolt: { id: 'fireBolt', name: '파이어 볼트', level: 2, icon: '🔥', cooldown: 4, power: '공격력 × 2.0', description: '지팡이 끝에서 불꽃 구슬을 날려 적 하나를 태운다.', range: 260 },
  iceBolt: { id: 'iceBolt', name: '아이스 볼트', level: 4, icon: '❄', cooldown: 7, power: '공격력 × 1.7 · 둔화', description: '서리 구슬이 맞은 적을 얼려 잠시 느리게 만든다.', range: 270 },
  chainLightning: { id: 'chainLightning', name: '체인 라이트닝', level: 5, icon: '⚡', cooldown: 8, power: '공격력 × 1.25 · 연쇄', description: '번개가 적에게 튀어 가까운 적 여럿을 연달아 감전시킨다.', range: 275 },
  manaBurst: { id: 'manaBurst', name: '마력 폭발', level: 7, icon: '◉', cooldown: 10, power: '공격력 × 2.5 · 폭발', description: '적의 위치에 마력을 응축했다가 터뜨려 주변을 함께 삼킨다.', range: 250 },
  frostNova: { id: 'frostNova', name: '프로스트 노바', level: 10, icon: '✳', cooldown: 12, power: '공격력 × 1.5 · 둔화', description: '발밑에서 서리 파동이 퍼져 가까운 적을 얼리고 밀어낸다.', range: 150 },
  arcaneShield: { id: 'arcaneShield', name: '아케인 실드', level: 14, icon: '⛨', cooldown: 16, power: '공격력 × 1.2 · 공격속도 상승', description: '7초 동안(레벨당 +0.17초) 비전 보호막을 두르고 공격력과 공격속도가 오른다.', range: 120 },
  meteorStrike: { id: 'meteorStrike', name: '메테오 스트라이크', level: 18, icon: '☄', cooldown: 13, power: '공격력 × 3.6', description: '하늘에서 불덩이를 떨어뜨려 적의 자리를 크게 내리친다.', range: 285 },
  arcaneOverlord: { id: 'arcaneOverlord', name: '아르카나 오버로드', level: 24, icon: '✵', cooldown: 18, power: '공격력 × 3.0', description: '지팡이의 마력을 한꺼번에 터뜨려 주변을 비전 폭풍으로 휩쓴다.', range: 210 }
};

/**
 * 스킬 한 타의 위력(공격력 배수) — **엔진과 방치 정산이 함께 읽는 단일 표**(2026-11-24 방치 사냥 개선).
 *
 * `combat/engine.ts` `action()`이 이 값을 그대로 `attack * … * damageScale`에 넣고, `offline.ts`의
 * 방치 DPS도 같은 값을 쓴다. 종전에는 방치 쪽에 따로 적어 둔 사본이 있어, 11/23 스킬 개편에서
 * 파워 스트라이크가 ×4.0 → ×5.5가 됐는데도 방치만 ×4로 남아 있었다(접속만 세지고 방치는 그대로).
 * 이제 값을 여기 한 곳에서만 고치면 접속·방치·스킬 추천 순위가 함께 움직인다.
 *
 * 세는 법: **한 번 발동이 한 마리에게 넣는 몫**이다. 여러 발로 나뉘는 스킬(더블 샷 2발·폭풍 연사
 * 6발·파이어 볼트 여러 발)은 **한 발의 값**을 적고, 10연타(딜레이 크러싱)는 합계를 적는다.
 * 지속 시간 동안 되풀이되는 추가 타격(회전참격·트위스터·와일드 스탬프·애로우 레인)은 이 표의 첫
 * 타격 위력만 두고, 되풀이 몫은 `engine.ts`와 `loadout.ts` `skillCastScale`이 따로 센다.
 * 버프(블러드 레이지·호크아이·아케인 실드)는 위력이 없어 0이다.
 */
export const SKILL_HIT_POWER: Record<SkillId, number> = {
  slash2: 1.1, slam: 2.2, warcry: 0, power: 5.5, destroy: 2.7, hell: 3.2, crushing: 3.4, spin: 1.65,
  doubleShot: 1.35, multiShot: .95, pierceShot: 2.6, iceArrow: 1.9, hawkEye: 0, snipe: 6.5, stormVolley: .8, arrowRain: .85,
  fireBolt: 2, iceBolt: 1.7, chainLightning: 1.25, manaBurst: 2.5, frostNova: 1.5, arcaneShield: 0, meteorStrike: 3.6, arcaneOverlord: 3
};

/**
 * 이단참(작업 213) — 좌우 횡베기 2연격의 두 타격.
 *
 * 발동 즉시 1타가 정방향으로, 0.18초 뒤 2타가 되받아(역방향) 들어간다. 두 타격은 각각 따로
 * 사거리·부채꼴을 다시 재는 독립 판정이라 데미지 팝업도 두 번 뜬다. 타당 위력은 기존 단타
 * (2.15배)를 둘로 나눈 1.1배씩이고, 합은 2.2배다(밸런스는 사실상 그대로 — `server/save-guard.mjs`
 * 의 아이템·피해 상한과도 겹치지 않는다).
 */
export type Slash2Hit = { at: number; power: number; knockback: number };
export const slash2Hits: readonly Slash2Hit[] = [
  { at: 0, power: 1.1, knockback: 6 },
  { at: .18, power: 1.1, knockback: 12 }
];
/** 2연격 모션 창(초) — 두 스윙이 끝나는 시간. `world.attackPose`가 이만큼 흐른다. */
export const slash2SwingSeconds = .44;

/**
 * 두 번째 타격의 시작 시각(초). 모션과 검기 연출이 같은 시각을 쓰도록 여기서 한 번만 정한다.
 */
export const slash2SecondHit = slash2Hits[1].at;
/** 이단참 전체 위력 배율(두 타 합) — 기존 단타 2.15배와 견줄 때의 값. */
export const slash2TotalPower = slash2Hits.reduce((sum, hit) => sum + hit.power, 0);

export const passiveOrder: WarriorPassiveId[] = ['mastery', 'body', 'instinct'];
export const archerPassiveOrder: ArcherPassiveId[] = ['bowMastery', 'swiftStep', 'hawkSight'];
export const magePassiveOrder: MagePassiveId[] = ['staffMastery', 'manaCircuit', 'arcaneSense'];
export const allPassiveIds: PassiveId[] = [...passiveOrder, ...archerPassiveOrder, ...magePassiveOrder];
export function passiveOrderFor(job: Job): PassiveId[] { return job === 'archer' ? archerPassiveOrder : job === 'mage' ? magePassiveOrder : passiveOrder; }

export const passives: Record<PassiveId, Passive> = {
  mastery: { id: 'mastery', name: '대검 숙련', level: 3, icon: '✥', description: '공격력 영구 +15%' },
  body: { id: 'body', name: '강인한 육체', level: 6, icon: '⬟', description: '최대 HP·방어력 영구 +15%' },
  // 밸런스 v2: 치명 4% + 레벨당 0.9%p, 공속 6% + 레벨당 0.35%p(Lv.30 치명 30.1% · 공속 16.2%).
  instinct: { id: 'instinct', name: '전투 본능', level: 12, icon: '◈', description: '치명타 확률 +4%(레벨당 +0.9%) · 공격속도 +6%(레벨당 +0.35%)' },
  bowMastery: { id: 'bowMastery', name: '궁술 숙련', level: 3, icon: '✥', description: '공격력 영구 +15%' },
  // 밸런스 v2: 공속 6% + 레벨당 0.35%p.
  swiftStep: { id: 'swiftStep', name: '신속의 발걸음', level: 6, icon: '➤', description: '공격속도 +6%(레벨당 +0.35%)' },
  // 밸런스 v2: 치명 4% + 레벨당 0.9%p.
  hawkSight: { id: 'hawkSight', name: '매의 눈', level: 12, icon: '◈', description: '치명타 확률 +4%(레벨당 +0.9%)' },
  staffMastery: { id: 'staffMastery', name: '지팡이 숙련', level: 3, icon: '✥', description: '공격력 영구 +15%' },
  // 밸런스 v2: 공속 6% + 레벨당 0.35%p.
  manaCircuit: { id: 'manaCircuit', name: '마나 회로', level: 6, icon: '➤', description: '공격속도 +6%(레벨당 +0.35%)' },
  // 밸런스 v2: 치명 4% + 레벨당 0.9%p.
  arcaneSense: { id: 'arcaneSense', name: '비전 감응', level: 12, icon: '◈', description: '치명타 확률 +4%(레벨당 +0.9%)' }
};

/** 스킬 습득·사용에 캐릭터 레벨 제한은 없다(작업 216).
 *  예전에는 `skills[].level`(권장 레벨)보다 캐릭터 레벨이 낮으면 잠겼지만, 이제 **스킬북만 있으면
 *  1레벨부터 습득·사용**할 수 있다. `skills[].level` 값은 스킬 순서를 정하는 표시용으로만 남기고
 *  반환값은 항상 참이다(기존 호출부·테스트 계약을 위해 시그니처는 그대로 둔다). */
export function canLearn(_level: number, _required: number): boolean { return true; }
/** 스킬 레벨당 사거리 증가폭. */
const rangeGrowth: Partial<Record<SkillId, number>> = { warcry: 0, destroy: 7, hawkEye: 0, arrowRain: 6, snipe: 8, stormVolley: 5, pierceShot: 6, arcaneShield: 0, frostNova: 4, fireBolt: 5, iceBolt: 5, chainLightning: 6, manaBurst: 5, meteorStrike: 7, arcaneOverlord: 6 };
export function skillRange(id: SkillId, level: number): number { return skills[id].range + (rangeGrowth[id] ?? 4) * (level - 1); }
export function skillDuration(id: SkillId, level: number): number {
  if (id === 'spin') return 1 + (level - 1) * .22;
  // [작업 216] 버프 지속은 쿨타임(14·16초)보다 짧게 묶는다 — Lv.30에서도 11.8·11.9초라 무한 유지가 없다.
  if (id === 'warcry') return 6 + (level - 1) * .2;
  if (id === 'slam') return .8 + (level - 1) * .12;
  if (id === 'hell') return .8 + (level - 1) * .16;
  if (id === 'slash2') return .55 + (level - 1) * .04;
  if (id === 'crushing') return .9 + (level - 1) * .06;
  if (id === 'power') return .4 + (level - 1) * .04;
  if (id === 'hawkEye') return 7 + (level - 1) * .17;
  if (id === 'stormVolley') return 1.1 + (level - 1) * .05;
  if (id === 'arrowRain') return 3.2 + (level - 1) * .12;
  if (id === 'iceArrow') return .8 + (level - 1) * .05;
  if (id === 'arcaneShield') return 7 + (level - 1) * .17;
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
