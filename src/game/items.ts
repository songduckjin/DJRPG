import type { Save } from './store';
import { emitDomainEvent } from '../core/domainEvents';
import { allPassiveIds, allSkillIds, jobs, passiveOrderFor, passives, skillOrderFor, skills, type Job, type SkillLevelId } from './skills';
import { jobOrDefault } from './skills';
import { random } from './rng';
import { effectiveExtraOptions, extraOptionPower, normalizeExtraOptions, EXTRA_CDR_CAP, EXTRA_CRIT_CAP, EXTRA_SPEED_CAP, type ExtraOptionKey } from './extraOptions';

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

export type Stat = 'attack' | 'defense' | 'health' | 'crit' | 'speed' | 'cdr';

export type EquipmentItem = { id: string; name: string; slot: Slot; rarity: Rarity; stats: Partial<Record<Stat, number>>; kind?: 'equipment'; locked?: boolean; plus?: number;
  /** 직업 전용 투구·갑옷의 주인 직업(작업 249). 무기는 이름(대검·활·지팡이)으로 판별하므로 붙지 않는다.
   *  **옛 세이브의 전사용 투구·갑옷에는 이 값이 없다** — 이름만으로는 "옛 공용 장비"와 "새로 떨어진
   *  전사 전용 장비"를 가릴 수 없기 때문이다. 값이 없으면 `itemJob`이 이름으로만 판별하고, 전사용
   *  이름은 공용(제한 없음)으로 본다(기존 보유 장비가 갑자기 장착 불가가 되지 않게). */
  job?: Job;
  /** 추가옵션(작업 238) — 에픽 1·유니크 2·전설 3개, 각 1~3%. `id`로 정해지며 `src/game/extraOptions.ts`가 채운다. */
  extraOptions?: Partial<Record<ExtraOptionKey, number>>;
  /** 2차 스탯 척도 버전(밸런스 v2) — 2면 치명·공속·쿨감이 새 척도로 다시 박힌 장비다.
   *  서버(`server/db/items.mjs`)가 **옛 장비(1) → 새 장비(2) 1회 마이그레이션**만 허용하는 표식이다. */
  sec?: number };
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
/** `[스킬북] {스킬 이름}` — 한 곳에서만 만든다(작업 251). */
export function skillBookItem(skillId: SkillLevelId): SkillBook {
  return { id: crypto.randomUUID(), name: `[스킬북] ${skillId in skills ? skills[skillId as keyof typeof skills].name : passives[skillId as keyof typeof passives].name}`, slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId, stats: {} };
}
/**
 * **그 직업의** 스킬북 1권 — 액티브 8 + 패시브 3 중 같은 확률(1/11). 작업 251 `스킬북 합성`의 결과가
 * 이 함수를 쓴다(사용자 확정 "타직업스킬북 5개당 내직업 랜덤1개"). 드롭용 `rollSkillBook`은 직업을
 * 1/3로 먼저 뽑으므로(33종 1/33) 여기서는 직업을 고정한다 — 드롭 확률은 건드리지 않는다.
 */
export function rollSkillBookFor(job: Job = 'warrior', draw: () => number = random): SkillBook {
  const order = [...skillOrderFor(job), ...passiveOrderFor(job)];
  const index = Math.min(order.length - 1, Math.max(0, Math.floor(draw() * order.length)));
  return skillBookItem(order[index]);
}
export function rollSkillBook(_floor: number, _job: Job = 'warrior'): SkillBook {
  // 스킬북도 세 직업이 같은 확률로 떨어진다(작업 204, 사용자 확정). 직업을 먼저 1/3로 고른 뒤
  // 그 직업의 스킬·패시브 중 하나를 뽑는다. 세 직업 모두 액티브 8 + 패시브 3으로 수가 같아,
  // 직업을 먼저 고르면 전 스킬이 같은 확률이 된다.
  // [작업 246] 사용자 확정: **층 제한을 없앤다** — 예전에는 `스킬.level <= floor * 2`인 책만
  // 떨어져 1층에서는 초반 스킬만 나왔다. 이제 1층을 포함한 모든 층에서 그 직업의 11종
  // (액티브 8 + 패시브 3)이 **똑같이 1/11**로 나온다. 습득 자체에 레벨 제한은 없으므로
  // (`useSkillBook`) 낮은 층에서 높은 스킬북을 먼저 모아 둘 수 있다.
  const job = dropJob();
  const order = [...skillOrderFor(job), ...passiveOrderFor(job)];
  const skillId = order[Math.floor(random() * order.length)];
  return skillBookItem(skillId);
}
/**
 * 한 마리당 **아이템 드롭률** (작업 210, 사용자 지시 `#4628`·`#4639`·`#4649`).
 *
 * 예전에는 장비·스킬북 확률을 따로 두 번 굴려 한 마리에서 두 개가 같이 떨어질 수 있었다. 이제는
 * **한 번만 굴리고**, 당첨되면 `SKILLBOOK_DROP_SHARE`(30%)로 종류를 갈라 **한 개만** 떨어진다.
 *
 * 작업 254(2026-11-21, 사용자 확정 — 선택 카드 "전 층 고정"): **층이 올라가도 마리당 확률은 그대로**다.
 * 작업 223의 층별 상승(1층 0.40% → 20층 1.60%, 보스 6% → 24%)을 없애고 전 층 고정으로 바꿨다.
 * - 접속 사냥(일반·정예) **0.39%**, 보스 **4%** — 이 함수.
 * - 방치 사냥(오프라인 정산) 일반 **0.30%**, 보스 **4%** — `offlineDropChance`.
 * 등급(`rollItem`의 `rollRarity`)은 지금처럼 층이 올라갈수록 좋아지므로, 깊은 층의 값은 개수가 아니라
 * 색으로 오른다. 장비 70% : 스킬북 30% 비율(`SKILLBOOK_DROP_SHARE`)은 그대로다.
 */
export const ONLINE_DROP_CHANCE = .0039;
/** 방치 사냥의 일반 몹 드롭률 (작업 254) — 접속보다 낮은 0.30%. */
export const OFFLINE_DROP_CHANCE = .003;
/** 보스 드롭률 (작업 254) — 접속·방치 모두 4%. */
export const BOSS_DROP_CHANCE = .04;
/**
 * 층별 드롭 계수(밸런스 v2) — 1층 0.62 → 20층 0.392 → 34층+ 0.37.
 *
 * 목표 생존 수 젠(3/5/7)으로 젠이 1.7~2.4배 빨라진 만큼 마리당 드롭률을 같은 비율로 낮춰 **시간당
 * 아이템 수입을 지금과 같게** 둔다(40칸 가방이 한 세션에 넘치지 않는다). 예전에는 전 층 0.39% 고정이었다.
 */
export function dropScale(floor: number): number {
  const depth = Math.max(1, Math.floor(Number.isFinite(floor) ? floor : 1));
  return Math.max(.37, .62 - .012 * (depth - 1));
}

/** 접속 사냥의 한 마리당 드롭률 — 1층 0.242% → 20층 0.153% → 34층+ 0.144%, 보스 4%(밸런스 v2). */
export function itemDropChance(floor: number, boss = false): number {
  return boss ? BOSS_DROP_CHANCE : ONLINE_DROP_CHANCE * dropScale(floor);
}
/** 방치(오프라인) 정산의 한 마리당 드롭률 — 전 층 0.30%, 보스 4%(작업 254). */
export function offlineDropChance(_floor: number, boss = false): number {
  return boss ? BOSS_DROP_CHANCE : OFFLINE_DROP_CHANCE;
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

/** 2차 스탯 척도 버전 — 밸런스 v2에서 치명·공속·쿨감 생성식이 바뀌었다(장비 `sec` 표식). */
export const SECONDARY_SCALE_VERSION = 2;
/** 2차 스탯(치명·공속·쿨감)은 강화(+)로 커지지 않는다 — 새 생성식이 층·강화와 무관하기 때문이다(밸런스 v2). */
const SECONDARY_STATS: readonly Stat[] = ['crit', 'speed', 'cdr'];
/** 장비 스탯에 강화 단계 보너스(단계당 8%)를 적용한다 — `+7`이면 기본의 1.56배.
 *  주 스탯(공격·방어·체력)만 대상이고 치명·공속·쿨감은 그대로 둔다(밸런스 v2). */
export function applyPlus(stats: Partial<Record<Stat, number>>, plus: number): Partial<Record<Stat, number>> {
  if (!(plus > 0)) return stats;
  const factor = 1 + plus * PLUS_STAT_BONUS;
  for (const stat of Object.keys(stats) as Stat[]) {
    if (SECONDARY_STATS.includes(stat)) continue;
    stats[stat] = Math.round((stats[stat] ?? 0) * factor);
  }
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

export const statNames: Record<Stat, string> = { attack: '공격', defense: '방어', health: '체력', crit: '치명', speed: '공속', cdr: '쿨감' };

const ringBases = ['구리 반지', '은 반지', '혈옥 반지', '수호의 인장', '군주의 반지'] as const;

/** 궁수 전용 활 10종 — 전사 대검 10종과 1:1로 대응하는 티어다. */
export const bowBases = ['사냥꾼의 활', '각궁', '강철 합성궁', '바람결 장궁', '서리엽궁', '룬 각궁', '혈염 장궁', '용골 대궁', '폭풍의 성궁', '패왕의 신궁'] as const;

/** 마법사 전용 지팡이 10종 — 전사 대검·궁수 활과 1:1로 대응하는 티어다. */
export const staffBases = ['견습생의 지팡이', '참나무 지팡이', '강철 지팡이', '수정 지팡이', '서리 지팡이', '룬 지팡이', '혈염 지팡이', '용골 지팡이', '폭풍의 지팡이', '대현자의 성지팡이'] as const;

/** 직업별 무기 기본형 목록. 무기 외 슬롯은 세 직업이 같은 목록을 쓴다(기존 세이브·드랍 호환). */
export function weaponBasesFor(job: Job): readonly string[] { return job === 'archer' ? bowBases : job === 'mage' ? staffBases : baseItems.weapon; }

/**
 * 직업별 투구·갑옷 기본형 (작업 249).
 *
 * 예전에는 투구·갑옷이 전사용 판금 이름 10종뿐이라, 궁수·마법사도 `서리의 흑요석 갑주` 같은 전사용
 * 이름을 그대로 입었다(사용자 제보 `#21117` "법사 궁수 다 만들어놨는데 전사꺼 다 입고 있더라").
 * 이제 투구·갑옷도 무기처럼 세 갈래로 나뉘고, 이름이 곧 그 직업의 장비임을 말한다.
 *
 * 이름은 이미 승인된 착용 외형 시안(궁수 갑옷 `djrpg_archer_armor_*`, 궁수 투구·마법사 모자
 * `djrpg_*_helm_*`, 마법사 로브 `djrpg_mage_robe_*`)의 티어 1~10 표기를 그대로 쓴다. 다만
 * 전사 목록과 이름이 겹치는 티어만 살짝 구분했다 — `가죽 조끼`→`사냥꾼 가죽 조끼`,
 * `가죽 두건`→`사냥꾼의 가죽 두건`, `사슬 코이프`→`사슬 사냥 코이프`. 이름이 겹치면 어느 목록의
 * 몇 번째 티어인지 가릴 수 없어(도감·아이콘·외형 인덱스가 모두 이름으로 찾는다) 반드시 달라야 한다.
 *
 * 장갑·신발·문장·장신구는 세 직업이 함께 쓰는 공용 그대로다(사용자 확정: 무기·투구·갑옷만 분리).
 */
export const archerArmorBases = ['사냥꾼 가죽 조끼', '징박힌 가죽 갑옷', '사냥꾼 가죽 코트', '강화 브리간딘', '그림자 추적자', '미스릴 레인저 아머', '진홍 추적자 갑주', '용린 레인저 갑주', '바람수호자 갑주', '패왕의 신궁 갑주'] as const;
export const archerHelmetBases = ['사냥꾼의 가죽 두건', '깃털 레인저 캡', '사슬 사냥 코이프', '추적자 하프헬름', '바이저 두건', '미스릴 서클릿', '용린 후드 헬름', '심연의 뿔 두건', '발키리 서클릿', '신궁의 왕관'] as const;
export const mageArmorBases = ['견습 천 로브', '가죽 장식 견습 로브', '학자의 마력 코트', '룬 전투 법의', '그림자 지도 로브', '비대칭 반망토 코트', '더블 버튼 에메랄드 코트', '베스트 레이어드 진홍 법의', '스톨·견장 자수정 로브', '대현자 롱 케이프 성의'] as const;
export const mageHelmetBases = ['수련생 천 두건', '학자 마법 베레모', '은실 비전 코이프', '마법사 고깔모', '고위 마법사 모자', '미스릴 사파이어 서클릿', '용린 마법사 뿔관', '심연의 자수정 두건', '천공의 날개 티아라', '대현자의 황금 왕관'] as const;

/** 그 직업의 갑옷 10종(전사는 기존 판금 목록 그대로). */
export function armorBasesFor(job: Job): readonly string[] { return job === 'archer' ? archerArmorBases : job === 'mage' ? mageArmorBases : baseItems.armor; }
/** 그 직업의 투구 10종(전사는 기존 헬름 목록 그대로). */
export function helmetBasesFor(job: Job): readonly string[] { return job === 'archer' ? archerHelmetBases : job === 'mage' ? mageHelmetBases : baseItems.helmet; }
/** 투구·갑옷만 직업별 세 갈래다 — `undefined`면 공용 슬롯. */
export function gearBasesFor(slot: Slot, job: Job): readonly string[] | undefined {
  return slot === 'armor' ? armorBasesFor(job) : slot === 'helmet' ? helmetBasesFor(job) : undefined;
}

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

/** 이 아이템을 쓸 수 있는 직업 — 무기(대검·활·지팡이)·투구·갑옷·스킬북이 직업별이다(작업 249).
 *  장갑·신발·문장·장신구는 세 직업이 함께 쓰므로 `undefined`(공용)다.
 *
 *  투구·갑옷은 ① 아이템에 적힌 `job`(새로 떨어진 장비) ② 이름이 궁수·마법사 목록에 있으면 그 직업,
 *  ③ 둘 다 아니면 전사용 이름이므로 **공용**으로 본다 — 옛 세이브의 전사용 투구·갑옷이 갑자기
 *  "장착 불가"가 되지 않게 하는 호환 규칙이다(사용자 확정: 기존 보유 장비는 그대로 유효). */
export function itemJob(item: Item): Job | undefined {
  if (isSkillBook(item)) return skillBookJob(item);
  if (item.slot === 'weapon') return weaponJob(item);
  if (item.slot === 'helmet' || item.slot === 'armor') {
    const tagged = (item as EquipmentItem).job;
    if (tagged === 'warrior' || tagged === 'archer' || tagged === 'mage') return tagged;
    return gearJobFromName(item);
  }
  return undefined;
}

/** 이름이 궁수·마법사 전용 투구·갑옷 목록에 있으면 그 직업, 전사 목록(옛 공용 이름)이면 `undefined`. */
export function gearJobFromName(item: Item): Job | undefined {
  if (item.slot !== 'helmet' && item.slot !== 'armor') return undefined;
  const name = compact(item.name);
  if (baseIndexIn(item.slot === 'armor' ? archerArmorBases : archerHelmetBases, name) >= 0) return 'archer';
  if (baseIndexIn(item.slot === 'armor' ? mageArmorBases : mageHelmetBases, name) >= 0) return 'mage';
  return undefined;
}

/** 목록에서 이름이 가리키는 티어 — 가장 긴 기본형이 이긴다(활 `각궁` ⊂ `룬 각궁`과 같은 규칙). */
function baseIndexIn(bases: readonly string[], name: string): number {
  let found = -1, best = -1;
  bases.forEach((base, index) => {
    const key = compact(base);
    if ((name === key || name.endsWith(key)) && key.length > best) { found = index; best = key.length; }
  });
  return found;
}

/** 투구·갑옷 이름이 가리키는 티어(0~9) — 세 직업 목록을 모두 보고 가장 긴 기본형을 고른다.
 *  `사냥꾼 가죽 조끼`가 전사 `가죽 조끼`(0번)에 먼저 걸리지 않게 하는 것이 이 함수의 일이다. */
export function gearTier(item: Item): number {
  if (item.slot !== 'armor' && item.slot !== 'helmet') return -1;
  const name = compact(item.name);
  const lists = item.slot === 'armor' ? [baseItems.armor, archerArmorBases, mageArmorBases] : [baseItems.helmet, archerHelmetBases, mageHelmetBases];
  let found = -1, best = -1;
  for (const list of lists) for (const [index, base] of list.entries()) {
    const key = compact(base);
    if ((name === key || name.endsWith(key)) && key.length > best) { found = index; best = key.length; }
  }
  return found;
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

/** 그 직업이 이 장비를 입을 수 있는가 — 직업이 갈리는 것은 무기·투구·갑옷이다(작업 249).
 *  다른 직업의 장비는 장착 대상이 아니므로 자동 장착·'더 좋은 장비' 보호·업그레이드 화살표에서도 빠진다. */
export function canWield(item: Item, job: Job = 'warrior'): boolean {
  const owner = itemJob(item);
  return owner === undefined || owner === jobOrDefault(job);
}

/**
 * 첫 무기를 장착하면 입문 튜토리얼이 다음 단계(방어구·스킬 안내)로 넘어간다 — 세이브 값은 3에서 끝난다.
 * 장비를 끼는 모든 경로(`autoEquipBest`·장비창 [장착])가 이 한 함수를 부른다(직업 공통).
 */
export function advanceTutorialOnEquip(save: Save): boolean {
  if (save.tutorial !== 2 || !save.equipment.weapon) return false;
  save.tutorial = 3;
  return true;
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
  if (item.slot === 'armor' || item.slot === 'helmet') return gearTier(item);
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

/**
 * **옛 장비 역산 전용** 티어 보정의 최대치 — 작업 255 이전 공식(`Math.ceil(tier * .6/.4)`)의 최댓값이다.
 *
 * 새 드롭은 `tierFactor`(티어당 +3.5%)를 쓰므로 이 값은 `estimatePlus`가 옛 세이브의 장비를 되짚을 때만
 * 쓰인다. 새 드롭은 항상 `plus`를 함께 적으므로 역산 대상이 아니다(작업 201). 이름은 서버
 * `server/save-guard.mjs`의 `TIER_BONUS_MAX`와 짝을 이룬다.
 */
export function maxTierBonus(slot: Slot): number {
  const tiers = slot === 'weapon' ? 10 : baseItems[slot].length;
  return Math.ceil(Math.max(0, tiers - 1) * (slot === 'weapon' ? .6 : .4));
}

/**
 * 부위별 능력치 배분 (작업 255) — 값은 그 장비의 `scale`(= (1 + floor/2) × 등급배율)에 대한 배율이다.
 *
 * 예전에는 무기·장갑·반지만 공격, 나머지는 전부 방어를 같은 1.0배로 주고, 체력 3·치명 1·공속 1을
 * **모든 부위가 똑같이** 얹었다. 그래서 반지 하나가 무기와 같은 공격을 주고, 판금 갑옷과 천 로브가
 * 같은 방어·체력을 줬다. 이제 부위마다 맡은 역할을 나눈다.
 *  - 무기: 공격의 주인. 방어구보다 훨씬 큰 공격을 준다.
 *  - 투구·갑옷: 방어와 체력의 주인(갑옷 > 투구).
 *  - 문장·허리띠: 방어+체력 위주의 보조 방어구.
 *  - 장갑·신발: 공격속도가 중심이고 공격·치명이 조금 붙는다.
 *  - 목걸이·반지: 치명이 중심이고 공격은 무기의 1/3 이하로 낮다.
 *
 * 주 스탯(`attack`/`defense` 중 큰 쪽)은 항상 붙고, 반대쪽 능력치는 매직 이상에서 조금 붙는다.
 * 체력은 매직 이상, 치명·공속은 레어 이상(공속은 유니크 전까지 35%)이다.
 */
export type SlotProfile = { attack: number; defense: number; health: number; crit: number; speed: number };

/** 공용 장비(장갑·문장·허리띠·신발·목걸이·반지)와, 직업을 알 수 없을 때의 투구·갑옷·무기 기준값. */
export const slotProfiles: Record<Slot, SlotProfile> = {
  weapon: { attack: 1.00, defense: .10, health: .60, crit: 1.00, speed: .60 },
  offhand: { attack: .15, defense: 1.00, health: 2.40, crit: .80, speed: .70 },
  helmet: { attack: .00, defense: 1.30, health: 4.60, crit: .60, speed: .40 },
  armor: { attack: .00, defense: 1.60, health: 5.20, crit: .55, speed: .35 },
  necklace: { attack: .35, defense: .20, health: 1.30, crit: 1.25, speed: .90 },
  gloves: { attack: .60, defense: .25, health: 1.10, crit: .95, speed: 1.50 },
  belt: { attack: .10, defense: .60, health: 2.80, crit: .60, speed: .50 },
  boots: { attack: .05, defense: .40, health: 1.40, crit: .75, speed: 1.85 },
  ring1: { attack: .35, defense: .15, health: 1.20, crit: 1.15, speed: .95 },
  ring2: { attack: .35, defense: .15, health: 1.20, crit: 1.15, speed: .95 }
};

/**
 * 직업별 무기 배분 (작업 255) — 대검은 묵직해서 방어·체력이 조금 붙고, 활은 치명·공속이 높고
 * 공격이 조금 낮으며, 지팡이는 공격이 가장 높다(마법사 숙련이 여기에 한 번 더 붙는다).
 */
export const jobWeaponProfiles: Record<Job, SlotProfile> = {
  warrior: { attack: 1.05, defense: .25, health: 1.30, crit: .90, speed: .50 },
  archer: { attack: .95, defense: .05, health: .45, crit: 1.35, speed: .85 },
  mage: { attack: 1.18, defense: .05, health: .45, crit: 1.00, speed: .55 }
};

/**
 * 직업별 투구·갑옷 배분 (작업 255) — 작업 249(PR #254)로 투구·갑옷이 직업별로 나뉘면 이 표를 쓴다.
 * 전사 판금은 방어·체력이 가장 높고, 궁수 가죽은 방어·체력이 조금 낮은 대신 치명·공속이 붙으며,
 * 마법사 로브는 가장 가볍지만 공격이 붙는다. **작업 249가 아직 없는 `main`에서는 투구·갑옷의 주인
 * 직업을 알 수 없어**(옛 공용 장비와 새 전사 전용 장비를 이름으로 가릴 수 없다) `slotProfiles`를 쓴다.
 */
export const jobArmorProfiles: Record<Job, { helmet: SlotProfile; armor: SlotProfile }> = {
  warrior: {
    helmet: { attack: .00, defense: 1.32, health: 4.80, crit: .55, speed: .35 },
    armor: { attack: .00, defense: 1.60, health: 5.30, crit: .50, speed: .30 }
  },
  archer: {
    helmet: { attack: .00, defense: 1.28, health: 4.70, crit: .60, speed: .45 },
    armor: { attack: .00, defense: 1.55, health: 5.15, crit: .55, speed: .40 }
  },
  mage: {
    helmet: { attack: .04, defense: 1.22, health: 4.55, crit: .60, speed: .40 },
    armor: { attack: .06, defense: 1.48, health: 4.95, crit: .55, speed: .35 }
  }
};

/** 슬롯별로 **가능한 가장 큰** 능력치 배율 — 서버 저장 검증(`server/save-guard.mjs`)의 상한이 쓴다.
 *  직업별 표를 모두 훑어 능력치마다 최댓값을 고르므로, 어떤 직업의 드롭이든 이 상한 안에 들어온다. */
export function maxSlotProfiles(): Record<Slot, SlotProfile> {
  const result = {} as Record<Slot, SlotProfile>;
  for (const slot of slots) {
    const candidates: SlotProfile[] = [slotProfiles[slot]];
    if (slot === 'weapon') candidates.push(...jobs.map(job => jobWeaponProfiles[job]));
    if (slot === 'helmet' || slot === 'armor') candidates.push(...jobs.map(job => jobArmorProfiles[job][slot]));
    result[slot] = {
      attack: Math.max(...candidates.map(profile => profile.attack)),
      defense: Math.max(...candidates.map(profile => profile.defense)),
      health: Math.max(...candidates.map(profile => profile.health)),
      crit: Math.max(...candidates.map(profile => profile.crit)),
      speed: Math.max(...candidates.map(profile => profile.speed))
    };
  }
  return result;
}
/** 위 표를 한 번만 계산해 둔다 — 서버 테스트가 `server/save-guard.mjs`의 사본과 대조한다. */
export const maxSlotProfileTable: Record<Slot, SlotProfile> = maxSlotProfiles();

/** 직업 숙련 (작업 255 → 밸런스 v2) — 같은 장비라도 그 직업의 특기 능력치에서 더 뽑아 쓴다.
 *  전사는 방어·체력, 마법사는 공격(1.52 — 느린 평타를 한 방으로 보상). 궁수의 치명·공속은
 *  아래 `GEAR_CRIT_SCALE`·`GEAR_SPEED_SCALE`로 옮겼다(장비 공속·치명이 층과 분리된 새 척도를 쓰기 때문). */
export const jobMastery: Record<Job, Partial<Record<Stat, number>>> = {
  warrior: { defense: 1.12, health: 1.10 },
  archer: { crit: 1.15 },
  mage: { attack: 1.52 }
};

/**
 * 장비 **치명·공속 생성 척도**(밸런스 v2) — 예전에는 `round(배율 × (1+층/2) × 등급 × 티어)`라
 * 20층만 가도 치명 800%·공속 1,200%가 나와 상한(80%·6타)에 눌렸다. 이제 층·강화를 빼고 등급·티어로만
 * 만든 뒤 0.70·0.72를 곱한다. 장비 10칸 합계가 치명 ~60%·공속 ~90% 선에 머문다.
 */
export const GEAR_CRIT_UNIT = .70;
export const GEAR_SPEED_UNIT = .72;
/** 직업별 장비 공속 배율 — 궁수 1.48(6.00타 상한에 닿는 유일한 직업) > 전사 0.55 > 마법사 0.45. */
export const GEAR_SPEED_SCALE: Record<Job, number> = { warrior: .55, archer: 1.48, mage: .45 };
/** 직업별 장비 치명 배율 — 궁수만 1.15(치명 특화). */
export const GEAR_CRIT_SCALE: Record<Job, number> = { warrior: 1, archer: 1.15, mage: 1 };
/**
 * 마법사 전용 부위의 스킬 쿨타임 감소(CDR) 기본 계수 — 지팡이 1.8 · 모자 0.9 · 로브 0.8(밸런스 v2).
 * `round(계수 × 등급배율 × 티어계수)`로 만들어 전설 최고 티어 지팡이 14 · 모자 7 · 로브 6, 합 27%다.
 * 추가옵션(최대 6%)까지 더해 상한 35%, 풀 세팅 마법사 31%.
 */
export const CDR_GEAR_PROFILE: Partial<Record<Slot, number>> = { weapon: 1.8, helmet: .9, armor: .8 };
/** 스킬 쿨타임 감소 합산 상한(%). 평타 간격에는 적용하지 않는다 — 스킬 쿨타임만 줄인다. */
export const CDR_CAP = 35;

/** 티어 계수 — 티어가 한 단계 오를 때마다 그 장비의 모든 스탯이 3.5%씩 강해진다(작업 255).
 *  예전에는 `tier * 0.6`(무기)·`0.4`(그 외)의 **고정 소수**라, 후반(`scale` 수백)에는 9티어와 0티어의
 *  차이가 1~2%에 불과했다. 10티어 슬롯은 0~9의 9단계로 +31.5%, 5티어 슬롯(문장·목걸이·반지)은 4단계를
 *  9단계로 환산(`× 9/4`)해 최고 티어에서 역시 +31.5%가 되게 한다 — 부위마다 "맨 이름"과 "최고 이름"의
 *  격차가 같아진다. */
export const TIER_STAT_GROWTH = .035;
export function tierFactor(slot: Slot, tier: number): number {
  const top = Math.max(1, (slot === 'weapon' ? 10 : baseItems[slot].length) - 1);
  return 1 + TIER_STAT_GROWTH * Math.min(top, Math.max(0, tier)) * (9 / top);
}

/** 그 슬롯·직업의 능력치 배분 — 직업을 모르는 투구·갑옷은 공용 기준값을 쓴다. */
export function slotProfileFor(slot: Slot, job?: Job): SlotProfile {
  if (slot === 'weapon') return jobWeaponProfiles[jobOrDefault(job ?? 'warrior')];
  if (job && (slot === 'helmet' || slot === 'armor')) return jobArmorProfiles[jobOrDefault(job)][slot];
  return slotProfiles[slot];
}

/**
 * 장비 하나의 스탯 (작업 255의 새 공식) — `rollEquipment`와 시뮬레이션·테스트가 함께 쓴다.
 *
 * `scale = (1 + floor(층/2)) × 등급배율`, `scaled = scale × tierFactor(슬롯, 티어)`.
 * 주 스탯은 `round(배율 × scaled) + 1~3`, 반대쪽 능력치는 매직 이상에서 `round(배율 × scaled)`,
 * 체력은 매직 이상, 치명은 레어 이상, 공속은 레어 이상(유니크 전 35%)에서 `round(배율 × scaled)`만큼 붙는다.
 * 쯔바이핸드는 공격 +2와, 레어 이상에서 `round(scaled × 0.15)`의 치명을 더한 **치명 특화** 대검이다
 * (예전 +25% 공격·+50% 치명은 3티어가 7~9티어를 이기는 역전을 만들었다 — 지금은 같은 티어 대검보다
 * 치명만 조금 높은 5~6티어급이다).
 */
export function gearStats(slot: Slot, rarity: Rarity, tier: number, floor: number, job?: Job, zweihander = false, draw: () => number = random): Partial<Record<Stat, number>> {
  const scale = (1 + Math.floor(Math.max(0, floor) / 2)) * rarityScales[rarity];
  const scaled = scale * tierFactor(slot, tier);
  const profile = slotProfileFor(slot, job);
  const rank = rarityRanks[rarity];
  const stats: Partial<Record<Stat, number>> = {};
  const primary: Stat = profile.attack >= profile.defense ? 'attack' : 'defense';
  stats[primary] = Math.round(profile[primary] * scaled) + Math.ceil(draw() * 3);
  // 반대쪽 능력치(무기의 방어, 방어구의 공격 등)는 매직 이상에서만 조금 붙는다.
  const secondary: Stat = primary === 'attack' ? 'defense' : 'attack';
  if (rank >= rarityRanks.magic && profile[secondary] > 0) stats[secondary] = Math.max(1, Math.round(profile[secondary] * scaled));
  if (rank >= rarityRanks.magic && profile.health > 0) stats.health = Math.max(1, Math.round(profile.health * scaled));
  // 치명·공속(밸런스 v2): **층·강화를 빼고** 등급·티어만으로 만든다 — 20층에서도 두 자리 수에 머문다.
  // 레어 이상에서 붙던 종전 규칙은 그대로다. 공속의 "유니크 전까지 35%만" 규칙은 새 척도에서 필요 없어졌다
  // (값이 작아져도 궁수 우위는 직업 배율 1.48이 만든다).
  const grade = rarityScales[rarity] * tierFactor(slot, tier);
  if (rank >= rarityRanks.rare && profile.crit > 0) stats.crit = Math.max(1, Math.round(profile.crit * grade * GEAR_CRIT_UNIT));
  if (rank >= rarityRanks.rare && profile.speed > 0) stats.speed = Math.max(1, Math.round(profile.speed * grade * GEAR_SPEED_UNIT));
  // 스킬 쿨타임 감소(밸런스 v2): **마법사 전용 부위**(지팡이·모자·로브)에만 붙는다.
  const cdr = CDR_GEAR_PROFILE[slot];
  if (job === 'mage' && cdr !== undefined) stats.cdr = Math.max(0, Math.round(cdr * grade));
  if (zweihander) {
    stats.attack = (stats.attack ?? 0) + 2;
    if (rank >= rarityRanks.rare) stats.crit = (stats.crit ?? 0) + Math.max(1, Math.round(profile.crit * grade * GEAR_CRIT_UNIT * .5));
  }
  return stats;
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
  // 직업 전용 투구·갑옷 아이콘(작업 249) — 궁수는 경갑·후드, 마법사는 로브·모자 아틀라스를 쓴다.
  // 전사용 이름(옛 공용 장비 포함)과 직업 판정이 `undefined`인 장비는 기존 판금 아틀라스 그대로다.
  const gearJob = item.slot === 'helmet' || item.slot === 'armor' ? itemJob(item) : undefined;
  if (gearJob === 'archer' || gearJob === 'mage') {
    if (index >= 0) return { path: `/assets/item-art/${gearJob}_${item.slot}_${Math.floor(index / 5) * 5}.png`, frame: index % 5, columns: 5 };
  }
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

/**
 * 세이브에서 **읽어 들이는** 스킬북 33종 — 액티브 24(`allSkillIds`) + 패시브 9(`allPassiveIds`).
 *
 * (작업 255, 사용자 제보 `#8898`) 예전에는 액티브 목록만 대조해서, **패시브 스킬북이 서버 응답을 읽을 때마다
 * 조용히 사라졌다** — 방치 보상으로 받은 책은 `applyOfflineRewards`가 파싱 **뒤에** 넣으므로 가방에 보이다가,
 * 다음 `parseSave`(창고 꺼내기·거래·캐릭터 전환 응답)에서 빠지고, 그 세이브가 서버로 가면 `reconcileItems`가
 * 소유 기록을 `consumed`로 바꿔 새로고침해도 돌아오지 않았다. 서버 쪽 검사(`server/skill-ids.mjs`
 * `skillBookIdSet`)는 처음부터 33종을 허용하므로, 클라이언트만 33종을 받아야 한다.
 */
const skillBookReadIds = new Set<SkillLevelId>([...allSkillIds, ...allPassiveIds]);

/**
 * 옛 장비의 2차 스탯(치명·공속·쿨감)을 **새 척도로 다시 박는다**(밸런스 v2 마이그레이션).
 *
 * 새 생성식은 이미 저장된 장비를 다시 뽑지 않는다. 지금 세이브의 치명 883%·공속 1,255%가 그대로 남으면
 * 상한(100%·6타)에 즉시 붙어 계산이 무의미해진다. 그래서 등급·티어·부위(·직업)로 새 식을 다시 계산해
 * `crit`·`speed`만 덮어쓴다 — **공결·방여·체력·강화 단계·등급·티어·부위는 그대로 둔다**(사용자 확정).
 * 쿨감은 마법사 전용 부위(지팡이·모자·로브)에만 새로 붙고, 다른 부위의 옛 쿨감 값은 지운다.
 */
export function sanitizeSecondary(item: EquipmentItem): EquipmentItem {
  const tier = Math.max(0, baseItemIndex(item));
  const grade = rarityScales[item.rarity] * tierFactor(item.slot, tier);
  const profile = slotProfileFor(item.slot, itemJob(item));
  if (item.stats.crit !== undefined) item.stats.crit = Math.max(1, Math.round(profile.crit * grade * GEAR_CRIT_UNIT));
  if (item.stats.speed !== undefined) item.stats.speed = Math.max(1, Math.round(profile.speed * grade * GEAR_SPEED_UNIT));
  const cdr = CDR_GEAR_PROFILE[item.slot];
  if (cdr !== undefined && itemJob(item) === 'mage') item.stats.cdr = Math.max(0, Math.round(cdr * grade));
  else if (item.stats.cdr !== undefined) delete item.stats.cdr;
  item.sec = SECONDARY_SCALE_VERSION;
  return item;
}

/** 신규 캐릭터 입문용 투구·갑옷 1개(밸런스 v2 온보딩) — 매직 등급·0티어, 그 직업의 이름이다(1~2층 확정 드랍). */
export function starterArmorItem(slot: 'helmet' | 'armor', job: Job = 'warrior', floor = 1): EquipmentItem {
  const bases = slot === 'armor' ? armorBasesFor(job) : helmetBasesFor(job);
  const rarity: Rarity = 'magic';
  const stats = gearStats(slot, rarity, 0, floor, job);
  const item: EquipmentItem = { id: crypto.randomUUID(), name: `${rarityPrefixes[rarity]} ${bases[0]}`, slot, rarity, stats, plus: 0, job, sec: SECONDARY_SCALE_VERSION };
  return normalizeExtraOptions(item);
}

export function migrateItem(value: unknown): Item | undefined {
  if (!isRecord(value)) return undefined;
  // 보물 주머니(작업 207): 서버가 이름 포함 identity로 대조하므로 저장된 이름이 있으면 그대로 둔다.
  if (value.kind === 'pouch' || value.slot === 'pouch') {
    return pouchItem(typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(), typeof value.name === 'string' && value.name.trim() ? value.name : POUCH_NAME);
  }
  if (value.kind === 'skillbook' && value.slot === 'skillbook' && typeof value.skillId === 'string' && skillBookReadIds.has(value.skillId as SkillLevelId)) {
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
  // 투구·갑옷의 주인 직업(작업 249) — 서버 저장본에 적힌 값을 그대로 살린다. 이 값이 없으면 옛 장비이고,
  // `itemJob`이 이름으로만 판별한다(전사용 이름 = 공용). 다른 슬롯·알 수 없는 값은 무시한다.
  if ((slot === 'helmet' || slot === 'armor') && (value.job === 'warrior' || value.job === 'archer' || value.job === 'mage')) item.job = value.job;
  // 강화 단계는 표시 전용이다 — 이름·스탯·등급은 그대로 두고 `plus`만 정규화(또는 옛 장비면 역산)한다.
  item.plus = normalizePlus(value.plus, item);
  // 치명·공속·쿨감은 새 척도로 다시 박는다(밸런스 v2) — 예전 장비의 800% 치명·1,200% 공속이 상한에
  // 눌러앉아 계산이 무의미해지지 않게. 공결·방여·체력·강화·등급·티어·부위는 그대로다.
  sanitizeSecondary(item);
  // 추가옵션(작업 238): 저장된 값이 규칙에 맞으면 그대로 두고, 없거나 어긋난 옛 장비는 `id` 시드로
  // 1/2/3개를 붙인다 — 이미 지급된 장비도 DB를 전수 수정하지 않고 옵션을 얻는다.
  if (isRecord(value.extraOptions)) item.extraOptions = value.extraOptions as EquipmentItem['extraOptions'];
  normalizeExtraOptions(item);
  return item;
}

function itemSkillLevel(save: Save, id: SkillLevelId): number { return save.skillLevels[id] ?? 1; }

/** 직업별 패시브 배율 — 전사·궁수 각각 같은 효과를 다른 이름으로 가진다. */
function passiveLevel(save: Save, ids: SkillLevelId[]): number | undefined {
  const found = ids.find(id => save.passives.includes(id as never));
  return found ? itemSkillLevel(save, found) : undefined;
}

export function totalStats(save: Save): Record<Stat, number> {
  // 기본 치명(밸런스 v2) — 레벨 1에 2%, 레벨당 +0.6%로 최고 레벨 20%. 예전에는 레벨과 무관한 2%뿐이라
  // 장비 치명이 전부였고, 장비가 800%까지 오르면서 상한(80%)에 눌려 있었다.
  const total: Record<Stat, number> = { attack: 8 + save.level * 2, defense: 2 + save.level, health: 140 + (save.level - 1) * 12, crit: 2 + (save.level - 1) * .6, speed: 0, cdr: 0 };
  // 장비 몫은 따로 모아 **직업 숙련**(작업 255)을 먼저 곱한 뒤 더한다 — 전사는 방어·체력, 마법사는 공격.
  // 같은 장비라도 직업의 특기 능력치에서 더 뽑아 쓰는 셈이다(레벨 기본값은 제외).
  const gear: Record<Stat, number> = { attack: 0, defense: 0, health: 0, crit: 0, speed: 0, cdr: 0 };
  for (const item of Object.values(save.equipment)) if (item && !isSkillBook(item)) {
    for (const stat of Object.keys(item.stats) as Stat[]) gear[stat] += item.stats[stat] ?? 0;
  }
  const mastery = jobMastery[jobOrDefault(save.job)];
  for (const stat of Object.keys(mastery) as Stat[]) gear[stat] *= mastery[stat] ?? 1;
  // 궁수는 장비 치명 1.15배, 공속은 직업 배율(전사 .55 · 궁수 1.48 · 마법사 .45)을 곱한다(밸런스 v2).
  const job = jobOrDefault(save.job);
  gear.crit *= GEAR_CRIT_SCALE[job];
  gear.speed *= GEAR_SPEED_SCALE[job];
  for (const stat of Object.keys(gear) as Stat[]) if (stat !== 'cdr') total[stat] += Math.round(gear[stat]);
  // 추가옵션(작업 238)의 % 스탯은 **모든 보정이 끝난 최종값**에 곱한다 — `공격력 +2%`가 레벨·패시브·
  // 장비를 모두 반영한 공격력을 올린다. 치명타·공격속도는 기존처럼 % 수치를 그대로 더한다.
  const attackBoost = passiveLevel(save, ['mastery', 'bowMastery', 'staffMastery']);
  if (attackBoost) total.attack = Math.ceil(total.attack * (1.15 + (attackBoost - 1) * .02));
  const body = passiveLevel(save, ['body']);
  if (body) { const bonus = 1.15 + (body - 1) * .02; total.defense = Math.ceil(total.defense * bonus); total.health = Math.ceil(total.health * bonus); }
  // 패시브(밸런스 v2): 치명 패시브 4% + 레벨당 0.9%(Lv30 30%), 공속 패시브 6% + 레벨당 0.35%(Lv30 16.2%).
  const instinct = passiveLevel(save, ['instinct']);
  if (instinct) { total.crit += 4 + (instinct - 1) * .9; total.speed += 6 + (instinct - 1) * .35; }
  const swift = passiveLevel(save, ['swiftStep', 'manaCircuit']);
  if (swift) total.speed += 6 + (swift - 1) * .35;
  const sight = passiveLevel(save, ['hawkSight', 'arcaneSense']);
  if (sight) total.crit += 4 + (sight - 1) * .9;
  const extras = effectiveExtraOptions(save.equipment);
  total.attack = Math.ceil(total.attack * (1 + extras.attackPct / 100));
  total.defense = Math.ceil(total.defense * (1 + extras.defensePct / 100));
  total.health = Math.ceil(total.health * (1 + extras.healthPct / 100));
  total.crit += Math.min(EXTRA_CRIT_CAP, extras.critPct);
  total.speed += Math.min(EXTRA_SPEED_CAP, extras.speedPct);
  // 스킬 쿨타임 감소(밸런스 v2): 장비 기본 + 추가옵션을 합쳐 35%에서 자른다.
  total.cdr = Math.min(CDR_CAP, Math.round(gear.cdr) + Math.min(EXTRA_CDR_CAP, extras.cdrPct));
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

/**
 * 던전 등급 확률 — **10층 구간**마다 상위 등급 비중을 한 단계씩 올린다(작업 248, 사용자 확정 11-21).
 *
 * 구간은 `Math.floor((층 - 1) / 10)`이다: 1~10층 0구간, 11~20층 1구간, 21~30층 2구간…
 * 0구간 값은 **지금 던전(10층)의 확률**을 그대로 옮긴 것이다(전설 0.25%·레어 2.4%·매직 15%,
 * 보스 전설 2.2%·레어 14.9%·매직 54%) — 1~10층은 지금과 같은 손맛을 유지하고, 깊은 구간은
 * 드롭률은 그대로 둔 채 **상위 등급의 몫만** 키운다(전설/유니크가 한꺼번에 쏟아지지 않게 상한을 둔다).
 */
export const DUNGEON_RARITY_TIERS: readonly { legendary: number; rare: number; magic: number }[] = [
  { legendary: .0025, rare: .0240, magic: .1500 },
  { legendary: .0060, rare: .0450, magic: .2100 },
  { legendary: .0110, rare: .0700, magic: .2700 },
  { legendary: .0170, rare: .1000, magic: .3300 },
  { legendary: .0240, rare: .1350, magic: .3900 },
  { legendary: .0320, rare: .1750, magic: .4500 },
  { legendary: .0410, rare: .2200, magic: .5100 }
];
/** 던전 보스 등급 확률 — 같은 구간 표를 보스의 더 두터운 상위 등급으로 옮길 값. */
export const DUNGEON_BOSS_RARITY_TIERS: readonly { legendary: number; rare: number; magic: number }[] = [
  { legendary: .0220, rare: .1490, magic: .5400 },
  { legendary: .0300, rare: .1850, magic: .5800 },
  { legendary: .0400, rare: .2250, magic: .6200 },
  { legendary: .0520, rare: .2700, magic: .6600 },
  { legendary: .0660, rare: .3200, magic: .7000 },
  { legendary: .0820, rare: .3750, magic: .7400 },
  { legendary: .1000, rare: .4350, magic: .7800 }
];
/** 이 층의 던전 등급 구간(10층 단위, 0부터). 표 범위를 넘으면 마지막 구간을 쓴다. */
export function dungeonRarityTier(floor: number): number {
  const depth = Math.max(1, Math.floor(Number.isFinite(floor) ? floor : 1));
  return Math.floor((depth - 1) / 10);
}
/** 던전 장비 하나의 등급 — 구간 표에서 뽑는다. `rollRarity`(필드)와 같은 방식으로 unique·epic을 사이에 둔다. */
export function dungeonRarityFor(floor: number, boss = false, draw: () => number = random): Rarity {
  const table = boss ? DUNGEON_BOSS_RARITY_TIERS : DUNGEON_RARITY_TIERS;
  const row = table[Math.min(table.length - 1, dungeonRarityTier(floor))];
  const unique = row.legendary + (row.rare - row.legendary) * .18;
  const epic = row.legendary + (row.rare - row.legendary) * .48;
  const roll = draw();
  return roll < row.legendary ? 'legendary' : roll < unique ? 'unique' : roll < epic ? 'epic' : roll < row.rare ? 'rare' : roll < row.magic ? 'magic' : 'common';
}
/** 던전 장비 1개 — `rollItem`과 같은 조립에 등급만 던전 구간 표에서 뽑는다(작업 248). */
export function rollDungeonItem(floor: number, boss = false): EquipmentItem {
  return rollEquipment(floor, dungeonRarityFor(floor, boss), boss);
}

/** 그 층·등급의 장비 1개 — 슬롯·티어·스탯·`+단계` 규칙은 `rollItem`이 늘 쓰던 그대로다. *  `rollItem`은 이 함수에 스스로 뽑은 등급을 넘기고, 보물 주머니는 확률표가 정한 등급을 넘긴다(작업 207).
 *  난수는 `rng`의 `random()`을 쓴다 — 던전은 시드로 전투를 다시 돌려 검증하므로 드롭 뽑기도 같은 난수를
 *  따라야 한다(작업 211). 시드가 없으면 `Math.random`이다. */
export function rollEquipment(floor: number, rarity: Rarity, boss = false): EquipmentItem {
  const depth = Math.max(0, floor - 1);
  const slot = slots[Math.floor(random() * slots.length)];
  // 무기·투구·갑옷은 세 직업이 같은 확률로 떨어진다(작업 204·249, 사용자 확정 "다른직업 장비나 스킬북도
  // 동일확률로 뜰수있어"): 확률 드롭은 직업을 1/3로 먼저 고르고 그 직업의 목록에서 뽑는다. 튜토리얼 첫
  // 확정 드롭(`guaranteed`)만 내 직업 무기다. 장갑·신발·문장·장신구는 세 직업 공용 목록 그대로다.
  const gearSlot = slot === 'weapon' || slot === 'helmet' || slot === 'armor';
  const dropFor = gearSlot ? dropJob() : undefined;
  const bases = gearSlot ? gearBasesFor(slot, dropFor!) ?? weaponBasesFor(dropFor!) : baseItems[slot];
  const rarityTier = rarityTiers[rarity];
  const maxTier = Math.min(bases.length - 1, Math.floor(depth / (bases.length === 10 ? 3 : 8)) + Math.floor(rarityTier * (bases.length - 1) / 9));
  const tier = Math.floor(random() * (maxTier + 1));
  const base = bases[tier];
  const zweihander = slot === 'weapon' && base === '쯔바이핸드';  const prefix = rarityPrefixes[rarity];
  const name = base.startsWith(`${prefix} `) ? base : `${prefix} ${base}`;
  // 능력치는 **부위·직업·티어** 세 가지를 함께 본다(작업 255). 직업은 이름으로 판별한다 — 무기는
  // 대검·활·지팡이, 투구·갑옷은 작업 249(PR #254)가 붙인 `job` 표식이나 이름 목록에서 찾는다.
  // 그 표식이 없는 `main`의 투구·갑옷은 공용(`undefined`)이라 `slotProfiles` 기준값을 쓴다.
  const placeholder: EquipmentItem = { id: crypto.randomUUID(), name, slot, rarity, stats: {} };
  // 작업 249(PR #254) 뒤 투구·갑옷은 직업별 목록에서 뽑히므로, 능력치도 **뽑힌 직업의 프로필**로 만든다.
  // 이름 추론(`itemJob`)은 전사 목록 이름을 공용으로 보아 전사 장비만 공용 프로필이 되던 차이를 없앤다(작업 255).
  const stats = gearStats(slot, rarity, tier, floor, itemJob(placeholder) ?? dropFor, zweihander);
  // 강화 단계(작업 201): 10층마다 한 단계씩 열리고, 단계마다 스탯이 8%씩 오른다. `plus`는 이름과 별도로
  // 저장되는 표시 값이라 `name`은 그대로 둔다(서버 아이템 동일성이 이름을 포함한다). 0단계도 적어 두어
  // 다음 로드에서 옛 장비 역산(`estimatePlus`)이 0층 아이템을 높게 잡는 일이 없다.
  const plus = rollPlus(floor, boss);
  applyPlus(stats, plus);
  const item: EquipmentItem = { id: placeholder.id, name, slot, rarity, stats, plus, sec: SECONDARY_SCALE_VERSION };
  // 투구·갑옷은 **주인 직업을 함께 적는다**(작업 249). 이름만으로는 새로 떨어진 전사 전용 장비와 옛 세이브의
  // 공용 장비를 가릴 수 없어, 새 드롭에만 표식을 붙여 다른 직업의 장착을 막는다. 무기는 이름으로 판별한다.
  if ((slot === 'helmet' || slot === 'armor') && dropFor) item.job = dropFor;
  // 추가옵션(작업 238): 에픽 1·유니크 2·전설 3개를 `id` 시드로 붙여 만든다 — 옛 장비가 나중에
  // 정규화될 때와 똑같은 값이 나오므로, 저장 전후로 옵션이 바뀌지 않는다.
  normalizeExtraOptions(item);
  return item;
}

export function itemPower(item: Item): number {
  if (!isEquipment(item)) return 0;
  // 추가옵션(작업 238)의 몫까지 더한다 — 자동 장착·`▲ 업그레이드`·분해 보호가 옵션 가치를 함께 본다.
  // 쿨감(밸런스 v2)은 1%를 공격 2점어치로 본다(스킬 비중 40~50%인 마법사 기준).
  return (item.stats.attack ?? 0) * 3 + (item.stats.defense ?? 0) * 2 + (item.stats.health ?? 0) * .2 + (item.stats.crit ?? 0) * 2 + (item.stats.speed ?? 0) * 2 + (item.stats.cdr ?? 0) * 6 + rarityRanks[item.rarity] * 2 + extraOptionPower(item);
}

/**
 * 이 장비가 **내 캐릭터에게 업그레이드인가**(작업 241, 사용자 확정 A안 `downloads/upgrade_arrow/opt_a.jpg`).
 *
 * 가방·공용창고·거래소 카드의 우측 상단 초록 화살표(`▲`) 판정을 이 한 곳에서만 한다. 세 조건을 모두
 * 만족해야 `true`다.
 *  ① 장비일 것 — 스킬북·보물 주머니는 장비가 아니므로 늘 `false`.
 *  ② 내 직업이 입을 수 있는 것 — 타 직업 전용 무기(활·지팡이·대검)는 절대 업그레이드로 치지 않는다
 *     (`canWield`, [작업 204]). 방어구·장신구는 세 직업 공용이라 늘 통과한다.
 *  ③ 지금 낀 것보다 셀 것(`itemPower`) — 반지는 두 칸을 함께 보므로 **약한 쪽(또는 빈 칸)**과 견준다.
 *     빈 반지 칸이 하나라도 있으면 무엇을 껴도 그 칸에 들어가 이득이다. 나머지 부위는 빈 칸이면 `true`,
 *     같은 부위를 끼고 있으면 그 장비보다 강해야 `true`(같으면 `false` — 바꿔도 나아지지 않는다).
 */
export function isUpgradeForHero(save: Save, item: Item): boolean {
  if (!isEquipment(item)) return false;
  if (!canWield(item, jobOrDefault(save.job))) return false;
  if (item.slot === 'ring1' || item.slot === 'ring2') {
    const worn = [save.equipment.ring1, save.equipment.ring2].filter((ring): ring is EquipmentItem => !!ring && isEquipment(ring));
    if (worn.length < 2) return true;
    return itemPower(item) > Math.min(...worn.map(ring => itemPower(ring)));
  }
  const current = save.equipment[item.slot];
  return !current || itemPower(item) > itemPower(current);
}

/**
 * 이 장비가 **내 캐릭터에게 다운그레이드인가**(사용자 요청 "장비창에 내꺼보다 수치 낮은 거는 빨간색으로
 * 화살표 아래 표시").
 *
 * 가방·공용창고 카드의 우측 상단 빨간 아래 화살표(`▼▼`) 판정을 이 한 곳에서만 한다. 업그레이드
 * (`isUpgradeForHero`)와 **같은 세 조건의 반대편**이라, 한 아이템이 두 화살표를 함께 받는 일은 없다.
 *  ① 장비일 것 — 스킬북·보물 주머니는 늘 `false`.
 *  ② 내 직업이 입을 수 있는 것(`canWield`) — 낄 수 없는 장비는 비교할 뜻이 없어 화살표도 달지 않는다.
 *  ③ 지금 낀 것보다 **엄격히 약할 것**(`itemPower`). 같은 부위를 끼고 있을 때만 견주며, 빈 칸이면
 *     무엇이든 이득이라 다운그레이드가 아니다(그때는 업그레이드 쪽이다). 수치가 같으면 바꿔도 손해가
 *     아니므로 어느 화살표도 달지 않는다. 반지는 두 칸을 함께 보므로 **약한 쪽(또는 빈 칸)**보다 약할 때만
 *     다운그레이드다 — 약한 반지와 바꿔도 이득이 없을 때다.
 */
export function isDowngradeForHero(save: Save, item: Item): boolean {
  if (!isEquipment(item)) return false;
  if (!canWield(item, jobOrDefault(save.job))) return false;
  if (item.slot === 'ring1' || item.slot === 'ring2') {
    const worn = [save.equipment.ring1, save.equipment.ring2].filter((ring): ring is EquipmentItem => !!ring && isEquipment(ring));
    if (worn.length < 2) return false;
    return itemPower(item) < Math.min(...worn.map(ring => itemPower(ring)));
  }
  const current = save.equipment[item.slot];
  return !!current && itemPower(item) < itemPower(current);
}

export function autoEquipBest(save: Save): number {
  let changed = 0;
  // 도메인 신호(작업 256) — 어느 칸이 어떻게 바뀌었는지 모아 두었다가 마지막에 한 번씩 알린다.
  // 루프 안에서 알리면 구독자가 반쯤 바뀐 장비 상태를 읽게 된다.
  const changes: { slot: Slot; item?: EquipmentItem; previous?: EquipmentItem }[] = [];
  const job = jobOrDefault(save.job);
  for (const slot of slots.filter(slot => slot !== 'ring1' && slot !== 'ring2')) {
    const current = save.equipment[slot];
    // 다른 직업의 무기는 이 캐릭터가 입을 수 없다(작업 204) — 무기 칸 자동 장착 후보에서 뺀다.
    const best = save.bag.filter((item): item is EquipmentItem => item.slot === slot && canWield(item, job)).sort((a, b) => itemPower(b) - itemPower(a))[0];
    if (!best || (current && itemPower(best) <= itemPower(current))) continue;
    save.bag.splice(save.bag.findIndex(item => item.id === best.id), 1);
    if (current) save.bag.push(current);
    save.equipment[slot] = best;
    changes.push({ slot, item: best, previous: current });
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
    const previous = save.equipment[slot];
    if (previous?.id !== next?.id) { changed++; changes.push({ slot, item: next, previous }); }
    if (next) save.equipment[slot] = next;
    else delete save.equipment[slot];
  }
  advanceTutorialOnEquip(save);
  for (const change of changes) emitDomainEvent('equipmentChanged', { save, ...change, source: 'auto' });
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
