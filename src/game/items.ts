import type { Save } from './store';
import { allSkillIds, jobs, passiveOrderFor, passives, skillOrderFor, skills, type Job, type SkillLevelId } from './skills';
import { jobOrDefault } from './skills';
import { random } from './rng';

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

export type Rarity = 'common' | 'magic' | 'rare' | 'epic' | 'unique' | 'legendary';
export const rarityOrder: Rarity[] = ['common', 'magic', 'rare', 'epic', 'unique', 'legendary'];
export const rarityRanks: Record<Rarity, number> = { common: 0, magic: 1, rare: 2, epic: 3, unique: 4, legendary: 5 };
export const rarityTiers: Record<Rarity, number> = { common: 0, magic: 2, rare: 4, epic: 5, unique: 6, legendary: 7 };
export const rarityScales: Record<Rarity, number> = { common: 1, magic: 2, rare: 3, epic: 4, unique: 5, legendary: 6 };
export const rarityPrefixes: Record<Rarity, string> = { common: '낡은', magic: '서리의', rare: '황혼의', epic: '비전의', unique: '고대의', legendary: '영원의' };
export const salvageGold: Record<Rarity, number> = { common: 3, magic: 10, rare: 25, epic: 38, unique: 50, legendary: 60 };
export const salvageStones: Record<Rarity, number> = { common: 1, magic: 2, rare: 2, epic: 3, unique: 4, legendary: 5 };

export type Slot = 'weapon' | 'offhand' | 'helmet' | 'armor' | 'necklace' | 'gloves' | 'belt' | 'boots' | 'ring1' | 'ring2';

export type Stat = 'attack' | 'defense' | 'health' | 'crit' | 'speed';

export type EquipmentItem = { id: string; name: string; slot: Slot; rarity: Rarity; stats: Partial<Record<Stat, number>>; kind?: 'equipment'; locked?: boolean; plus?: number };
export type SkillBook = { id: string; name: string; slot: 'skillbook'; rarity: 'rare'; kind: 'skillbook'; skillId: SkillLevelId; stats: {} };
/** 가방에서 까는 무작위 보물 주머니(작업 207) — 장비도 스킬북도 아닌 소모품이다.
 *  장비 40칸에 세지 않고, 자동 장착·분해·경매장 판매·도감 어디에도 끼지 않는다. */
export type TreasurePouch = { id: string; name: string; slot: 'pouch'; rarity: Rarity; kind: 'pouch'; stats: {} };
export type Item = EquipmentItem | SkillBook | TreasurePouch;
export const POUCH_SLOT = 'pouch' as const;
export const POUCH_NAME = '무작위 보물 주머니';
/** 주머니의 등급 표기 — 아이템 등급표(6단계)를 그대로 쓰되, 보물 상자답게 주황(유니크)으로 둔다. */
export const POUCH_RARITY: Rarity = 'unique';
export function isSkillBook(item: Item): item is SkillBook { return item.kind === 'skillbook'; }
export function isPouch(item: Item | undefined): item is TreasurePouch { return !!item && item.kind === 'pouch'; }
/** 장비(착용·분해·거래 대상)인가 — 스킬북과 보물 주머니는 장비가 아니다. */
export function isEquipment(item: Item): item is EquipmentItem { return item.kind !== 'skillbook' && item.kind !== 'pouch'; }
export function pouchItem(id: string = crypto.randomUUID(), name: string = POUCH_NAME): TreasurePouch {
  return { id, name, slot: POUCH_SLOT, rarity: POUCH_RARITY, kind: 'pouch', stats: {} };
}
export function rollSkillBook(floor: number, _job: Job = 'warrior'): SkillBook {
  // 스킬북도 세 직업이 같은 확률로 떨어진다(작업 204, 사용자 확정). 직업을 먼저 1/3로 고른 뒤,
  // 그 직업의 `floor * 2` 해금 조건을 만족하는 스킬·패시브 중 하나를 뽑는다. 세 직업 모두 액티브 8 +
  // 패시브 3으로 수가 같아, 직업을 먼저 고르면 전 스킬이 같은 확률이 된다.
  const job = dropJob();
  const order = [...skillOrderFor(job), ...passiveOrderFor(job)];
  const available = order.filter(id => (id in skills ? skills[id as keyof typeof skills].level : passives[id as keyof typeof passives].level) <= floor * 2);
  const ids = available.length ? available : [order[0]];
  const skillId = ids[Math.floor(random() * ids.length)];
  return { id: crypto.randomUUID(), name: `[스킬북] ${skillId in skills ? skills[skillId as keyof typeof skills].name : passives[skillId as keyof typeof passives].name}`, slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId, stats: {} };
}
/**
 * 한 마리당 **아이템 드롭률** (작업 210, 사용자 지시 `#4628`·`#4639`·`#4649`).
 *
 * 예전에는 장비·스킬북 확률을 따로 두 번 굴려 한 마리에서 두 개가 같이 떨어질 수 있었다. 이제는
 * **한 번만 굴리고**, 당첨되면 `SKILLBOOK_DROP_SHARE`(30%)로 종류를 갈라 **한 개만** 떨어진다.
 * - 일반 몹(정예 포함): 1층 0.40% → 20층 1.60%에서 멈춘다.
 * - 보스: 1층 6.0% → 20층 24.0%에서 멈춘다.
 *
 * 작업 223(2026-11-20, 사용자 확정 `#6034`·`#6061`·`#6066`): 초반이 너무 짜다는 제보("부캐 1시간
 * 방치해서 반지 한 개")에 **전 구간을 그대로 2배**로 올렸다. 위층 몹을 늦게 잡도록 난이도를 올릴
 * 예정이라 마리당 확률을 받쳐 파밍 템포를 지키는 쪽을 사용자가 골랐다. 장비 70% : 스킬북 30%
 * 비율(`SKILLBOOK_DROP_SHARE`)·오프라인 정산(`offline.ts`)·던전 몫은 그대로다.
 */
export function itemDropChance(floor: number, boss = false): number {
  const depth = Math.max(0, floor - 1);
  return boss ? Math.min(.24, .06 + depth * (.18 / 19)) : Math.min(.016, .004 + depth * (.012 / 19));
}
/** 당첨된 아이템 1개의 종류 — 스킬북 30%, 장비 70%. */
export const SKILLBOOK_DROP_SHARE = .3;
export const EQUIPMENT_DROP_SHARE = 1 - SKILLBOOK_DROP_SHARE;
/** 당첨된 1개의 종류를 70:30으로 가른다. */
export function rollItemKind(draw: () => number = random): 'skillbook' | 'equipment' {
  return draw() < SKILLBOOK_DROP_SHARE ? 'skillbook' : 'equipment';
}
/** 예전 이름 호환 — 단일 드롭률의 70%(던전·보스战利品이 이 비율만 쓴다). */
export function equipmentDropChance(floor: number, boss = false): number { return itemDropChance(floor, boss) * EQUIPMENT_DROP_SHARE; }
/** 예전 이름 호환 — 단일 드롭률의 30%. */
export function skillBookDropChance(floor: number, boss: boolean): number { return itemDropChance(floor, boss) * SKILLBOOK_DROP_SHARE; }

/** 강화 단계의 최고치 — 71~80층에서 +7이 나온다(작업 201). */
export const MAX_PLUS = 7;
/** `+1`마다 장비 스탯이 8%씩 오른다(`+7` = 기본의 1.56배). */
export const PLUS_STAT_BONUS = .08;
/** 낮은 단계일수록 흔하고 높은 단계일수록 드물다: 단계마다 확률을 0.6배로 줄인다. */
export const PLUS_WEIGHT_DECAY = .6;
/** 보스는 높은 단계를 조금 더 자주 준다(가중치를 단계마다 1.2배). */
export const PLUS_BOSS_LIFT = 1.2;

/** 층수로 열리는 최고 강화 단계: 1~10층 0, 11~20층 1, …, 51~60층 5, 71~80층 7. */
export function maxPlusFor(floor: number): number {
  const depth = Math.max(1, Math.floor(Number.isFinite(floor) ? floor : 1));
  return Math.max(0, Math.min(MAX_PLUS, Math.floor((depth - 1) / 10)));
}

/** `0 ~ maxPlus` 단계별 가중치 — 낮은 단계가 크고, 보스는 높은 단계의 몫을 조금 키운다. */
export function plusWeights(maxPlus: number, boss = false): number[] {
  const weights: number[] = [];
  for (let plus = 0; plus <= maxPlus; plus++) weights.push(Math.pow(PLUS_WEIGHT_DECAY, plus) * (boss ? Math.pow(PLUS_BOSS_LIFT, plus) : 1));
  return weights;
}

/** 장비 스탯에 강화 단계 보너스(단계당 8%)를 적용한다 — `+7`이면 기본의 1.56배. */
export function applyPlus(stats: Partial<Record<Stat, number>>, plus: number): Partial<Record<Stat, number>> {
  if (!(plus > 0)) return stats;
  const factor = 1 + plus * PLUS_STAT_BONUS;
  for (const stat of Object.keys(stats) as Stat[]) stats[stat] = Math.round((stats[stat] ?? 0) * factor);
  return stats;
}

/** 이 층의 드롭 하나가 가질 강화 단계를 뽑는다. 10층 이하는 항상 0. */
export function rollPlus(floor: number, boss = false, draw: () => number = random): number {
  const maxPlus = maxPlusFor(floor);
  if (maxPlus === 0) return 0;
  const weights = plusWeights(maxPlus, boss);
  let roll = draw() * weights.reduce((sum, weight) => sum + weight, 0);
  for (const [plus, weight] of weights.entries()) { roll -= weight; if (roll < 0) return plus; }
  return 0;
}

/** 장비 하나의 강화 단계(0~7). 스킬북·값이 없는 장비는 0. */
export function plusOf(item: Item): number {
  if (!isEquipment(item)) return 0;
  const plus = item.plus;
  return typeof plus === 'number' && Number.isFinite(plus) ? Math.max(0, Math.min(MAX_PLUS, Math.floor(plus))) : 0;
}

/** 강화 단계를 붙여 읽는 이름 — 이름 자체(DB 동일성)는 절대 바꾸지 않고 표시할 때만 쓴다. */
export function itemDisplayName(item: Item): string {
  const plus = plusOf(item);
  return plus > 0 ? `${item.name} +${plus}` : item.name;
}

export const slots: Slot[] = ['weapon', 'offhand', 'helmet', 'armor', 'necklace', 'gloves', 'belt', 'boots', 'ring1', 'ring2'];

export const slotNames: Record<Slot, string> = { weapon: '두손검', offhand: '문장', helmet: '투구', armor: '갑옷', necklace: '목걸이', gloves: '장갑', belt: '벨트', boots: '신발', ring1: '반지 1', ring2: '반지 2' };

export const rarityNames: Record<Rarity, string> = { common: '일반', magic: '매직', rare: '레어', epic: '에픽', unique: '유니크', legendary: '레전드' };

export const statNames: Record<Stat, string> = { attack: '공격', defense: '방어', health: '체력', crit: '치명', speed: '공속' };

const ringBases = ['구리 반지', '은 반지', '혈옥 반지', '수호의 인장', '군주의 반지'] as const;

/** 궁수 전용 활 10종 — 전사 대검 10종과 1:1로 대응하는 티어다. */
export const bowBases = ['사냥꾼의 활', '각궁', '강철 합성궁', '바람결 장궁', '서리엽궁', '룬 각궁', '혈염 장궁', '용골 대궁', '폭풍의 성궁', '패왕의 신궁'] as const;

/** 마법사 전용 지팡이 10종 — 전사 대검·궁수 활과 1:1로 대응하는 티어다. */
export const staffBases = ['견습생의 지팡이', '참나무 지팡이', '강철 지팡이', '수정 지팡이', '서리 지팡이', '룬 지팡이', '혈염 지팡이', '용골 지팡이', '폭풍의 지팡이', '대현자의 성지팡이'] as const;

/** 직업별 무기 기본형 목록. 무기 외 슬롯은 세 직업이 같은 목록을 쓴다(기존 세이브·드랍 호환). */
export function weaponBasesFor(job: Job): readonly string[] { return job === 'archer' ? bowBases : job === 'mage' ? staffBases : baseItems.weapon; }

/** 드롭이 쓸 수 있는 세 직업 — 무기·스킬북은 이 셋이 같은 확률로 떨어진다(작업 204, 사용자 확정). */
export const dropJobs: readonly Job[] = ['warrior', 'archer', 'mage'];

/** 세 직업 중 하나를 균등(1/3)으로 고른다. */
export function dropJob(draw: () => number = random): Job {
  const index = Math.min(dropJobs.length - 1, Math.max(0, Math.floor(draw() * dropJobs.length)));
  return dropJobs[index];
}

/** 이 스킬북이 전용인 직업 — 스킬·패시브 목록(`skillOrderFor`/`passiveOrderFor`)으로 판별한다.
 *  스킬북이 아니면 undefined. 같은 스킬 id는 한 직업에만 있으므로 첫 일치가 곧 그 직업이다. */
export function skillBookJob(item: Item): Job | undefined {
  if (!isSkillBook(item)) return undefined;
  for (const job of jobs) if (skillOrderFor(job).includes(item.skillId as never) || passiveOrderFor(job).includes(item.skillId as never)) return job;
  return undefined;
}

/** 이 아이템을 쓸 수 있는 직업 — 무기는 직업별(대검·활·지팡이), 스킬북도 직업별이다.
 *  방어구·장신구는 세 직업이 함께 쓰므로 `undefined`(공용)다. */
export function itemJob(item: Item): Job | undefined {
  if (isSkillBook(item)) return skillBookJob(item);
  if (item.slot === 'weapon') return weaponJob(item);
  return undefined;
}

/** `내 직업만 보기` 판정 — 직업 전용 아이템이 다른 직업의 것이면 false, 공용 아이템이면 늘 true. */
export function usableByJob(item: Item, job: Job = 'warrior'): boolean {
  const owner = itemJob(item);
  return owner === undefined || owner === jobOrDefault(job);
}

/** 이 무기를 쓰는 직업 — 활은 궁수, 지팡이는 마법사, 나머지 대검은 전사. */
export function weaponJob(item: Item): Job {
  if (item.slot !== 'weapon') return 'warrior';
  if (bowIndex(item) >= 0) return 'archer';
  if (staffIndex(item) >= 0) return 'mage';
  return 'warrior';
}

/** 그 직업이 이 장비를 입을 수 있는가 — 직업이 갈리는 것은 무기뿐이다(방어구·장신구는 공용).
 *  다른 직업의 무기는 장착 대상이 아니므로 자동 장착·'더 좋은 장비' 보호에서도 빠진다. */
export function canWield(item: Item, job: Job = 'warrior'): boolean {
  return item.slot !== 'weapon' || weaponJob(item) === jobOrDefault(job);
}

/** 직업별 기본 무기 이름(첫 튜토리얼 드랍에 쓴다). */
export function starterWeaponName(job: Job): string {
  return job === 'archer' ? '낡은 사냥꾼의 활' : job === 'mage' ? '낡은 견습생의 지팡이' : '낡은 두손검';
}

export const baseItems: Record<Slot, readonly string[]> = {
  weapon: ['두손검', '바스타드 소드', '클레이모어', '쯔바이핸드', '플랑베르주', '룬 블레이드', '혈빛 대검', '아다만트 그레이트소드', '용살자의 대검', '패왕의 성검'],
  offhand: ['수련자의 문장', '강철 문장', '기사단 휘장', '피빛 맹세 문장', '붉은보석 문장'],
  helmet: ['가죽 두건', '철제 바시넷', '사슬 코이프', '기사 헬름', '바이저 투구', '미스릴 그레이트헬름', '용린 투구', '심연의 뿔투구', '발키리 크라운', '불멸의 왕관'],
  armor: ['가죽 조끼', '징박힌 갑옷', '사슬 갑옷', '강철 브레스트플레이트', '하프 플레이트', '미스릴 아머', '흑요석 갑주', '드래곤 메일', '성기사 풀플레이트', '패왕의 전갑'],
  necklace: ['구리 펜던트', '은빛 로켓', '마력의 아뮬렛', '용의 눈 목걸이', '태양의 심장'],
  gloves: ['천 장갑', '가죽 브레이서', '사슬 건틀릿', '강철 건틀릿', '기사단 장갑', '미스릴 글러브', '피빛 크로', '용린 건틀릿', '타이탄의 손아귀', '심연의 장갑'],
  belt: ['삼베 허리띠', '가죽 벨트', '징박힌 벨트', '사슬 거들', '강철 버클 벨트', '미스릴 벨트', '수호자의 거들', '용가죽 벨트', '거인의 허리띠', '붉은보석 벨트'],
  boots: ['낡은 부츠', '가죽 장화', '사슬 그리브', '강철 부츠', '기사의 사바톤', '미스릴 부츠', '바람의 장화', '용린 그리브', '폭풍의 사바톤', '불멸의 각반'],
  ring1: ringBases,
  ring2: ringBases
};

export function baseItemIndex(item: EquipmentItem): number {
  const name = compact(item.name);
  if (item.slot === 'helmet' && name === compact('낡은 투구')) return baseItems.helmet.indexOf('심연의 뿔투구');
  if (item.slot === 'weapon') {
    // 활은 이름이 서로를 포함한다('각궁' ⊂ '룬 각궁', '장궁' ⊂ '혈염 장궁') — 가장 긴 기본형이
    // 그 활의 티어다(작업 160: 접미사 우선 매칭만 쓰면 '룬 각궁'이 1번 각궁으로 읽혔다).
    const bow = bowIndex(item);
    if (bow >= 0) return bow;
    const staff = staffBases.findIndex(base => name === compact(base) || name.endsWith(compact(base)));
    if (staff >= 0) return staff;
  }
  return baseItems[item.slot].findIndex(base => name === compact(base) || name.endsWith(compact(base)));
}

function compact(value: string): string { return value.normalize('NFKC').replace(/[\s\u200b\ufeff]/gu, ''); }

/** 이름이 활 기본형이면 그 인덱스(0~9), 아니면 -1. 가장 긴 기본형이 이긴다. */
export function bowIndex(item: Item): number {
  if (item.slot !== 'weapon') return -1;
  const name = compact(item.name);
  let found = -1, bestLength = -1;
  bowBases.forEach((base, index) => {
    const key = compact(base);
    if ((name === key || name.endsWith(key)) && key.length > bestLength) {
      found = index;
      bestLength = key.length;
    }
  });
  return found;
}

/** 이름이 지팡이 기본형이면 그 인덱스(0~9), 아니면 -1. */
export function staffIndex(item: Item): number {
  if (item.slot !== 'weapon') return -1;
  const name = compact(item.name);
  return staffBases.findIndex(base => name === compact(base) || name.endsWith(compact(base)));
}

export function isStaff(item: Item): boolean { return staffIndex(item) >= 0; }
export function isBow(item: Item): boolean { return bowIndex(item) >= 0; }

/** 슬롯 표기 — 궁수는 '활', 마법사는 '지팡이'로 부른다. */
export function slotNameFor(slot: Slot, job: Job = 'warrior'): string {
  if (slot !== 'weapon') return slotNames[slot];
  return job === 'archer' ? '활' : job === 'mage' ? '지팡이' : slotNames[slot];
}

/** 궁수·마법사는 이번 단계에서 전용 갑옷·투구·무기 외형 시트를 쓰지 않는다(기본 시트만 그린다). */
export function isArcher(save: Pick<Save, 'job'>): boolean { return jobOrDefault(save.job) === 'archer'; }
export function isMage(save: Pick<Save, 'job'>): boolean { return jobOrDefault(save.job) === 'mage'; }
/** 전사가 아닌 직업 — 장비 오버레이(갑옷·투구·대검 파츠)를 그리지 않고 기본 시트만 쓴다. */
export function usesBaseSheetOnly(save: Pick<Save, 'job'>): boolean { return jobOrDefault(save.job) !== 'warrior'; }

/**
 * 무기 칸이 비어 있는가(작업 216).
 *
 * 기본 본체 시트에는 0번 무기(기본 두손검·활·지팡이)가 **그림으로 들어 있다**. 그래서 무기를 하나도
 * 차지 않은 캐릭터도 손에 칼·활·지팡이를 들고 서 있었다. 빈손이면 기본 무기를 지운 판
 * (`noweapon/`·`nobow/`·`mage_nostaff/`)으로 갈아 끼워 빈손으로 그린다.
 */
export function hasNoWeapon(save: Pick<Save, 'equipment'>): boolean { return !save.equipment?.weapon; }

export function isZweihander(item: Item): boolean { return item.slot === 'weapon' && /쯔바이핸드|츠바이핸더/.test(item.name); }

/** 그 슬롯의 티어 보정이 더할 수 있는 최대치 — `rollItem`의 `Math.ceil(tier * .6/.4)` 중 제일 큰 값. */
export function maxTierBonus(slot: Slot): number {
  const tiers = slot === 'weapon' ? 10 : baseItems[slot].length;
  return Math.ceil(Math.max(0, tiers - 1) * (slot === 'weapon' ? .6 : .4));
}

/**
 * `plus`가 없는 예전 장비의 강화 단계를 **보수적으로** 되짚는다(작업 201).
 *
 * 드롭은 `scale = (1 + floor(층/2)) * 등급배율`에 무작위 1~3, 티어 보정 0~최대, (쯔바이핸드면) 공격 보정을
 * 더한 주 스탯을 가진다. 그래서 주 스탯에서 **가장 큰 부가치를 먼저 빼고** 남은 값으로 가장 낮은 층을
 * 구한다 — 경계에서 헷갈리면 언제나 낮은 `+N`이 나오고, 실제보다 높게 표시되는 일은 없다.
 * 새로 떨어지는 장비는 `rollItem`이 `plus`를 늘 함께 적으므로 이 역산은 옛 세이브에만 쓰인다.
 */
export function estimatePlus(item: EquipmentItem): number {
  const gradeScale = rarityScales[item.rarity];
  if (!gradeScale) return 0;
  const primary: Stat = ['weapon', 'ring1', 'ring2', 'gloves'].includes(item.slot) ? 'attack' : 'defense';
  const observed = item.stats[primary] ?? 0;
  if (!(observed > 0)) return 0;
  const extra = 3 + maxTierBonus(item.slot);
  const scale = isZweihander(item) ? (observed - 2 - extra) / 1.25 : observed - extra;
  if (!(scale > 0)) return 0;
  const steps = Math.floor(scale / gradeScale) - 1;
  if (steps <= 0) return 0;
  const floor = Math.max(1, steps * 2);
  return Math.max(0, Math.min(MAX_PLUS, Math.floor((floor - 1) / 10)));
}

/** 저장된 `plus`는 0~7 정수로 다듬고, 아예 없는 옛 장비만 역산한다. */
export function normalizePlus(raw: unknown, item: EquipmentItem): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, Math.min(MAX_PLUS, Math.floor(raw)));
  return estimatePlus(item);
}

export function equipmentImage(item: EquipmentItem): { path: string; frame: number; columns: number } {
  const index = baseItemIndex(item);
  if (item.slot === 'weapon' && bowIndex(item) >= 0) {
    return { path: `/assets/item-art/bow_${Math.floor(index / 5) * 5}.png`, frame: index % 5, columns: 5 };
  }
  if (item.slot === 'weapon' && staffIndex(item) >= 0) {
    return { path: `/assets/item-art/staff_${Math.floor(index / 5) * 5}.png`, frame: index % 5, columns: 5 };
  }
  const slot = item.slot === 'ring1' || item.slot === 'ring2' ? 'ring' : item.slot;
  if (index >= 0) return { path: `/assets/item-art/${slot}_${Math.floor(index / 5) * 5}.png`, frame: index % 5, columns: 5 };
  return { path: isZweihander(item) ? '/assets/icons/icon_zweihander.png' : `/assets/icons/${slot}.png`, frame: 0, columns: 1 };
}

export const wearableAssetPaths = {
  weapon: '/assets/wearable/weapons.png', helmet: '/assets/wearable/helmets.png',
  armor: '/assets/wearable/armor.png', gloves: '/assets/wearable/gloves.png', boots: '/assets/wearable/boots.png'
} as const satisfies Partial<Record<Slot, string>>;

export function wearableEquipmentImage(item: EquipmentItem): { path: string; frame: number; columns: number; rows: number } | undefined {
  // 활·지팡이는 착용 외형 시트(wearable/weapons.png 은 대검)가 없다 — 궁수·마법사는 기본 시트만 그린다.
  if (isBow(item) || isStaff(item)) return undefined;
  const path = wearableAssetPaths[item.slot as keyof typeof wearableAssetPaths], frame = baseItemIndex(item);
  return path && frame >= 0 ? { path, frame, columns: 5, rows: 2 } : undefined;
}

export function migrateItem(value: unknown): Item | undefined {
  if (!isRecord(value)) return undefined;
  // 보물 주머니(작업 207): 서버가 이름 포함 identity로 대조하므로 저장된 이름이 있으면 그대로 둔다.
  if (value.kind === 'pouch' || value.slot === 'pouch') {
    return pouchItem(typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(), typeof value.name === 'string' && value.name.trim() ? value.name : POUCH_NAME);
  }
  if (value.kind === 'skillbook' && value.slot === 'skillbook' && typeof value.skillId === 'string' && (allSkillIds as SkillLevelId[]).includes(value.skillId as SkillLevelId)) {
    const skillId = value.skillId as SkillLevelId;
    const fallback = `[스킬북] ${skillId in skills ? skills[skillId as keyof typeof skills].name : passives[skillId as keyof typeof passives].name}`;
    // 서버가 소유권 identity(이름 포함)로 아이템을 대조하므로, 저장된 이름이 있으면 그대로 유지한다.
    // 여기서 이름을 덮어쓰면 load로 받은 정상 아이템이 다음 save에서 409 ITEM_CONFLICT로 막힌다.
    const name = typeof value.name === 'string' && value.name.trim() ? value.name : fallback;
    return { id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(), name, slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId, stats: {} };
  }
  if (typeof value.slot !== 'string' || !slots.includes(value.slot as Slot) || typeof value.rarity !== 'string' || !Object.hasOwn(rarityNames, value.rarity)) return undefined;
  const slot = value.slot as Slot, rarity = value.rarity as Rarity;
  const stats: EquipmentItem['stats'] = {};
  if (isRecord(value.stats)) for (const stat of Object.keys(statNames) as Stat[]) {
    const amount = value.stats[stat];
    if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) stats[stat] = amount;
  }
  // 이름은 서버에 저장된 값을 그대로 쓴다(표기가 달라도 isZweihander·codex가 둘 다 인식한다).
  const savedName = typeof value.name === 'string' && value.name.trim() ? value.name : '';
  const name = savedName || slotNames[slot];
  const item: EquipmentItem = { id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(), name, slot, rarity, stats, locked: value.locked === true };
  // 강화 단계는 표시 전용이다 — 이름·스탯·등급은 그대로 두고 `plus`만 정규화(또는 옛 장비면 역산)한다.
  item.plus = normalizePlus(value.plus, item);
  return item;
}

function itemSkillLevel(save: Save, id: SkillLevelId): number { return save.skillLevels[id] ?? 1; }

/** 직업별 패시브 배율 — 전사·궁수 각각 같은 효과를 다른 이름으로 가진다. */
function passiveLevel(save: Save, ids: SkillLevelId[]): number | undefined {
  const found = ids.find(id => save.passives.includes(id as never));
  return found ? itemSkillLevel(save, found) : undefined;
}

export function totalStats(save: Save): Record<Stat, number> {
  const total = { attack: 8 + save.level * 2, defense: 2 + save.level, health: 100 + (save.level - 1) * 12, crit: 2, speed: 0 };
  for (const item of Object.values(save.equipment)) if (item && !isSkillBook(item)) {
    for (const stat of Object.keys(item.stats) as Stat[]) total[stat] += item.stats[stat] ?? 0;
  }
  const attackBoost = passiveLevel(save, ['mastery', 'bowMastery', 'staffMastery']);
  if (attackBoost) total.attack = Math.ceil(total.attack * (1.15 + (attackBoost - 1) * .02));
  const body = passiveLevel(save, ['body']);
  if (body) { const bonus = 1.15 + (body - 1) * .02; total.defense = Math.ceil(total.defense * bonus); total.health = Math.ceil(total.health * bonus); }
  const instinct = passiveLevel(save, ['instinct']);
  if (instinct) { total.crit += 8 + (instinct - 1) * 2; total.speed += 12 + (instinct - 1) * 2; }
  const swift = passiveLevel(save, ['swiftStep', 'manaCircuit']);
  if (swift) total.speed += 12 + (swift - 1) * 2;
  const sight = passiveLevel(save, ['hawkSight', 'arcaneSense']);
  if (sight) total.crit += 8 + (sight - 1) * 2;
  return total;
}

export function rollItem(floor: number, guaranteed = false, boss = false, job: Job = 'warrior'): Item {
  if (guaranteed) return { id: crypto.randomUUID(), name: starterWeaponName(job), slot: 'weapon', rarity: 'common', stats: { attack: 4 }, plus: 0 };
  return rollEquipment(floor, rollRarity(floor, boss), boss);
}

/** 이 층·보스 여부에서 장비 하나의 등급을 뽑는다 — `rollItem`과 보물 주머니가 같은 표를 쓴다. */
export function rollRarity(floor: number, boss = false, draw: () => number = random): Rarity {
  const depth = Math.max(0, floor - 1);
  // Grade cuts of a normal kill. The overall drop rate stays where it was (`equipmentDropChance`,
  // 2.2% at the deepest floor); what changes with depth is which grade a drop is (작업 196). A fixed
  // magic cut left 88% of drops white on floor 78, so the magic cut now climbs with depth up to .40
  // and the rare-and-above band widens to 7.5% with a 1% legendary cap — deep floors pay in colour,
  // not in more drops. A boss keeps its own, far richer table.
  const legendary = boss ? Math.min(.04, .02 + depth * .0002) : Math.min(.01, .002 + depth * .00005);
  const rare = boss ? Math.min(.22, .14 + depth * .001) : Math.min(.075, .017 + depth * .00075);
  const magic = boss ? .54 : Math.min(.40, .117 + depth * .0036);
  const unique = legendary + (rare - legendary) * .18;
  const epic = legendary + (rare - legendary) * .48;
  const roll = draw();
  return roll < legendary ? 'legendary' : roll < unique ? 'unique' : roll < epic ? 'epic' : roll < rare ? 'rare' : roll < magic ? 'magic' : 'common';
}

/** 그 층·등급의 장비 1개 — 슬롯·티어·스탯·`+단계` 규칙은 `rollItem`이 늘 쓰던 그대로다.
 *  `rollItem`은 이 함수에 스스로 뽑은 등급을 넘기고, 보물 주머니는 확률표가 정한 등급을 넘긴다(작업 207).
 *  난수는 `rng`의 `random()`을 쓴다 — 던전은 시드로 전투를 다시 돌려 검증하므로 드롭 뽑기도 같은 난수를
 *  따라야 한다(작업 211). 시드가 없으면 `Math.random`이다. */
export function rollEquipment(floor: number, rarity: Rarity, boss = false): EquipmentItem {
  const depth = Math.max(0, floor - 1);
  const slot = slots[Math.floor(random() * slots.length)];
  // 무기는 세 직업이 같은 확률로 떨어진다(작업 204, 사용자 확정 "다른직업 장비나 스킬북도 동일확률로
  // 뜰수있어"): 확률 드롭은 직업을 1/3로 먼저 고르고 그 직업의 무기 목록에서 뽑는다. 튜토리얼 첫 확정
  // 드롭(`guaranteed`)만 내 직업 무기다.
  const bases = slot === 'weapon' ? weaponBasesFor(dropJob()) : baseItems[slot];
  const rarityTier = rarityTiers[rarity];
  const maxTier = Math.min(bases.length - 1, Math.floor(depth / (bases.length === 10 ? 3 : 8)) + Math.floor(rarityTier * (bases.length - 1) / 9));
  const tier = Math.floor(random() * (maxTier + 1));
  const base = bases[tier];
  const zweihander = slot === 'weapon' && base === '쯔바이핸드';  const prefix = rarityPrefixes[rarity];
  const scale = (1 + Math.floor(floor / 2)) * rarityScales[rarity];
  const primary: Stat = ['weapon', 'ring1', 'ring2', 'gloves'].includes(slot) ? 'attack' : 'defense';
  const stats: Partial<Record<Stat, number>> = { [primary]: scale + Math.ceil(random() * 3) + Math.ceil(tier * (slot === 'weapon' ? .6 : .4)) };
  if (rarity !== 'common') stats.health = 3 * scale;
  if (rarityRanks[rarity] >= rarityRanks.rare) stats.crit = scale;
  if (rarityRanks[rarity] >= rarityRanks.unique) stats.speed = scale;
  if (zweihander) {
    stats.attack = (stats.attack ?? 0) + 2 + Math.ceil(scale * .25);
    if (rarity !== 'common') stats.crit = (stats.crit ?? 0) + Math.max(1, Math.ceil(scale * .5));
  }
  // 강화 단계(작업 201): 10층마다 한 단계씩 열리고, 단계마다 스탯이 8%씩 오른다. `plus`는 이름과 별도로
  // 저장되는 표시 값이라 `name`은 그대로 둔다(서버 아이템 동일성이 이름을 포함한다). 0단계도 적어 두어
  // 다음 로드에서 옛 장비 역산(`estimatePlus`)이 0층 아이템을 높게 잡는 일이 없다.
  const plus = rollPlus(floor, boss);
  applyPlus(stats, plus);
  return { id: crypto.randomUUID(), name: base.startsWith(`${prefix} `) ? base : `${prefix} ${base}`, slot, rarity, stats, plus };
}

export function itemPower(item: Item): number {
  if (!isEquipment(item)) return 0;
  return (item.stats.attack ?? 0) * 3 + (item.stats.defense ?? 0) * 2 + (item.stats.health ?? 0) * .2 + (item.stats.crit ?? 0) * 2 + (item.stats.speed ?? 0) * 2 + rarityRanks[item.rarity] * 2;
}

export function autoEquipBest(save: Save): number {
  let changed = 0;
  const job = jobOrDefault(save.job);
  for (const slot of slots.filter(slot => slot !== 'ring1' && slot !== 'ring2')) {
    const current = save.equipment[slot];
    // 다른 직업의 무기는 이 캐릭터가 입을 수 없다(작업 204) — 무기 칸 자동 장착 후보에서 뺀다.
    const best = save.bag.filter((item): item is EquipmentItem => item.slot === slot && canWield(item, job)).sort((a, b) => itemPower(b) - itemPower(a))[0];
    if (!best || (current && itemPower(best) <= itemPower(current))) continue;
    save.bag.splice(save.bag.findIndex(item => item.id === best.id), 1);
    if (current) save.bag.push(current);
    save.equipment[slot] = best;
    changed++;
  }
  const ringSlots: Slot[] = ['ring1', 'ring2'];
  const equippedRings = ringSlots.map(slot => save.equipment[slot]).filter((item): item is EquipmentItem => !!item);
  const bagRings = save.bag.filter((item): item is EquipmentItem => isEquipment(item) && ringSlots.includes(item.slot));
  const bestRings = [...equippedRings, ...bagRings].sort((a, b) => itemPower(b) - itemPower(a)).slice(0, 2);
  const used = new Set(bestRings.map(item => item.id));
  save.bag = save.bag.filter(item => !used.has(item.id));
  for (const item of equippedRings) if (!used.has(item.id)) save.bag.push(item);
  for (const [index, slot] of ringSlots.entries()) {
    const next = bestRings[index];
    if (save.equipment[slot]?.id !== next?.id) changed++;
    if (next) save.equipment[slot] = next;
    else delete save.equipment[slot];
  }
  if (save.tutorial === 2 && save.equipment.weapon) save.tutorial = 3;
  return changed;
}

export function salvageByRarity(save: Save, maxRarity: Exclude<Rarity, 'legendary'>): { count: number; gold: number; stones: number } {
  const chosen = save.bag.filter((item): item is EquipmentItem => isEquipment(item) && !item.locked && rarityRanks[item.rarity] <= rarityRanks[maxRarity]);
  const gold = chosen.reduce((sum, item) => sum + salvageGold[item.rarity], 0);
  const stones = chosen.reduce((sum, item) => sum + salvageStones[item.rarity], 0);
  const ids = new Set(chosen.map(item => item.id));
  save.bag = save.bag.filter(item => !ids.has(item.id));
  save.gold += gold; save.stones += stones;
  // 분해한 장비 수만큼 누적한다(작업 207) — 일일·주간 `장비 분해 N회` 미션.
  save.salvageCount = (save.salvageCount ?? 0) + chosen.length;
  return { count: chosen.length, gold, stones };
}
