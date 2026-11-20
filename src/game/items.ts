import type { Save } from './store';
import { allSkillIds, passiveOrderFor, passives, skillOrderFor, skills, type Job, type SkillLevelId } from './skills';
import { jobOrDefault } from './skills';

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

export type EquipmentItem = { id: string; name: string; slot: Slot; rarity: Rarity; stats: Partial<Record<Stat, number>>; kind?: 'equipment'; locked?: boolean };
export type SkillBook = { id: string; name: string; slot: 'skillbook'; rarity: 'rare'; kind: 'skillbook'; skillId: SkillLevelId; stats: {} };
export type Item = EquipmentItem | SkillBook;
export function isSkillBook(item: Item): item is SkillBook { return item.kind === 'skillbook'; }
export function rollSkillBook(floor: number, job: Job = 'warrior'): SkillBook {
  const order = [...skillOrderFor(job), ...passiveOrderFor(job)];
  const available = order.filter(id => (id in skills ? skills[id as keyof typeof skills].level : passives[id as keyof typeof passives].level) <= floor * 2);
  const ids = available.length ? available : [order[0]];
  const skillId = ids[Math.floor(Math.random() * ids.length)];
  return { id: crypto.randomUUID(), name: `[스킬북] ${skillId in skills ? skills[skillId as keyof typeof skills].name : passives[skillId as keyof typeof passives].name}`, slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId, stats: {} };
}
export function skillBookDropChance(floor: number, boss: boolean): number { return boss ? Math.min(.15, .018 + (floor - 1) * .002) : Math.min(.015, .001 + (floor - 1) * .00012); }

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

export function isZweihander(item: Item): boolean { return item.slot === 'weapon' && /쯔바이핸드|츠바이핸더/.test(item.name); }

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
  return { id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(), name, slot, rarity, stats, locked: value.locked === true };
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

export function equipmentDropChance(floor: number, boss = false): number {
  return boss ? Math.min(.24, .03 + (floor - 1) * .004) : Math.min(.022, .0025 + (floor - 1) * .00035);
}

export function rollItem(floor: number, guaranteed = false, boss = false, job: Job = 'warrior'): Item {
  if (guaranteed) return { id: crypto.randomUUID(), name: starterWeaponName(job), slot: 'weapon', rarity: 'common', stats: { attack: 4 } };
  const roll = Math.random();
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
  const rarity: Rarity = roll < legendary ? 'legendary' : roll < unique ? 'unique' : roll < epic ? 'epic' : roll < rare ? 'rare' : roll < magic ? 'magic' : 'common';
  const slot = slots[Math.floor(Math.random() * slots.length)];
  const bases = slot === 'weapon' ? weaponBasesFor(job) : baseItems[slot];
  const rarityTier = rarityTiers[rarity];
  const maxTier = Math.min(bases.length - 1, Math.floor(depth / (bases.length === 10 ? 3 : 8)) + Math.floor(rarityTier * (bases.length - 1) / 9));
  const tier = Math.floor(Math.random() * (maxTier + 1));
  const base = bases[tier];
  const zweihander = slot === 'weapon' && base === '쯔바이핸드';  const prefix = rarityPrefixes[rarity];
  const scale = (1 + Math.floor(floor / 2)) * rarityScales[rarity];
  const primary: Stat = ['weapon', 'ring1', 'ring2', 'gloves'].includes(slot) ? 'attack' : 'defense';
  const stats: Partial<Record<Stat, number>> = { [primary]: scale + Math.ceil(Math.random() * 3) + Math.ceil(tier * (slot === 'weapon' ? .6 : .4)) };
  if (rarity !== 'common') stats.health = 3 * scale;
  if (rarityRanks[rarity] >= rarityRanks.rare) stats.crit = scale;
  if (rarityRanks[rarity] >= rarityRanks.unique) stats.speed = scale;
  if (zweihander) {
    stats.attack = (stats.attack ?? 0) + 2 + Math.ceil(scale * .25);
    if (rarity !== 'common') stats.crit = (stats.crit ?? 0) + Math.max(1, Math.ceil(scale * .5));
  }
  return { id: crypto.randomUUID(), name: base.startsWith(`${prefix} `) ? base : `${prefix} ${base}`, slot, rarity, stats };
}

export function itemPower(item: Item): number {
  if (isSkillBook(item)) return 0;
  return (item.stats.attack ?? 0) * 3 + (item.stats.defense ?? 0) * 2 + (item.stats.health ?? 0) * .2 + (item.stats.crit ?? 0) * 2 + (item.stats.speed ?? 0) * 2 + rarityRanks[item.rarity] * 2;
}

export function autoEquipBest(save: Save): number {
  let changed = 0;
  for (const slot of slots.filter(slot => slot !== 'ring1' && slot !== 'ring2')) {
    const current = save.equipment[slot];
    const best = save.bag.filter((item): item is EquipmentItem => item.slot === slot).sort((a, b) => itemPower(b) - itemPower(a))[0];
    if (!best || (current && itemPower(best) <= itemPower(current))) continue;
    save.bag.splice(save.bag.findIndex(item => item.id === best.id), 1);
    if (current) save.bag.push(current);
    save.equipment[slot] = best;
    changed++;
  }
  const ringSlots: Slot[] = ['ring1', 'ring2'];
  const equippedRings = ringSlots.map(slot => save.equipment[slot]).filter((item): item is EquipmentItem => !!item);
  const bagRings = save.bag.filter((item): item is EquipmentItem => item.slot !== 'skillbook' && ringSlots.includes(item.slot));
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
  const chosen = save.bag.filter(item => !isSkillBook(item) && !item.locked && rarityRanks[item.rarity] <= rarityRanks[maxRarity]);
  const gold = chosen.reduce((sum, item) => sum + salvageGold[item.rarity], 0);
  const stones = chosen.reduce((sum, item) => sum + salvageStones[item.rarity], 0);
  const ids = new Set(chosen.map(item => item.id));
  save.bag = save.bag.filter(item => !ids.has(item.id));
  save.gold += gold; save.stones += stones;
  return { count: chosen.length, gold, stones };
}
