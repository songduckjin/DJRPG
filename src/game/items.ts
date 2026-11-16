import type { Save } from './store';
import { passiveOrder, passives, skillOrder, skills, type SkillLevelId } from './skills';

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

export type Rarity = 'common' | 'magic' | 'rare' | 'legendary';

export type Slot = 'weapon' | 'offhand' | 'helmet' | 'armor' | 'necklace' | 'gloves' | 'belt' | 'boots' | 'ring1' | 'ring2';

export type Stat = 'attack' | 'defense' | 'health' | 'crit' | 'speed';

export type EquipmentItem = { id: string; name: string; slot: Slot; rarity: Rarity; stats: Partial<Record<Stat, number>>; kind?: 'equipment' };
export type SkillBook = { id: string; name: string; slot: 'skillbook'; rarity: 'rare'; kind: 'skillbook'; skillId: SkillLevelId; stats: {} };
export type Item = EquipmentItem | SkillBook;
export function isSkillBook(item: Item): item is SkillBook { return item.kind === 'skillbook'; }
export function rollSkillBook(floor: number): SkillBook {
  const available = [...skillOrder, ...passiveOrder].filter(id => (id in skills ? skills[id as keyof typeof skills].level : passives[id as keyof typeof passives].level) <= floor * 2);
  const ids = available.length ? available : [skillOrder[0]];
  const skillId = ids[Math.floor(Math.random() * ids.length)];
  return { id: crypto.randomUUID(), name: `[스킬북] ${skillId in skills ? skills[skillId as keyof typeof skills].name : passives[skillId as keyof typeof passives].name}`, slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId, stats: {} };
}
export function skillBookDropChance(floor: number, boss: boolean): number { return boss ? Math.min(.12, .012 + (floor - 1) * .0015) : Math.min(.01, .0008 + (floor - 1) * .0001); }

export const slots: Slot[] = ['weapon', 'offhand', 'helmet', 'armor', 'necklace', 'gloves', 'belt', 'boots', 'ring1', 'ring2'];

export const slotNames: Record<Slot, string> = { weapon: '두손검', offhand: '문장', helmet: '투구', armor: '갑옷', necklace: '목걸이', gloves: '장갑', belt: '벨트', boots: '신발', ring1: '반지 1', ring2: '반지 2' };

export const rarityNames: Record<Rarity, string> = { common: '일반', magic: '마법', rare: '희귀', legendary: '전설' };

export const statNames: Record<Stat, string> = { attack: '공격', defense: '방어', health: '체력', crit: '치명', speed: '공속' };

const ringBases = ['구리 반지', '은 반지', '혈옥 반지', '수호의 인장', '군주의 반지'] as const;

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

export function isZweihander(item: Item): boolean { return item.slot === 'weapon' && /쯔바이핸드|츠바이핸더/.test(item.name); }

export function equipmentImagePath(item: EquipmentItem, wearable = false): string {
  const slot = item.slot === 'ring1' || item.slot === 'ring2' ? 'ring' : item.slot;
  const index = baseItems[item.slot].findIndex(base => item.name === base || item.name.endsWith(` ${base}`));
  if (index >= 0) return `/assets/${wearable ? 'equipment' : 'icons/items'}/${slot}_${String(index).padStart(2, '0')}.svg`;
  if (isZweihander(item)) return '/assets/icons/icon_zweihander.png';
  return `/assets/icons/${slot}.png`;
}

export function migrateItem(value: unknown): Item | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === 'skillbook' && value.slot === 'skillbook' && typeof value.skillId === 'string' && [...skillOrder, ...passiveOrder].includes(value.skillId as SkillLevelId)) {
    const skillId = value.skillId as SkillLevelId;
    return { id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(), name: `[스킬북] ${skillId in skills ? skills[skillId as keyof typeof skills].name : passives[skillId as keyof typeof passives].name}`, slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId, stats: {} };
  }
  if (typeof value.slot !== 'string' || !slots.includes(value.slot as Slot) || typeof value.rarity !== 'string' || !Object.hasOwn(rarityNames, value.rarity)) return undefined;
  const slot = value.slot as Slot, rarity = value.rarity as Rarity;
  const stats: EquipmentItem['stats'] = {};
  if (isRecord(value.stats)) for (const stat of Object.keys(statNames) as Stat[]) {
    const amount = value.stats[stat];
    if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) stats[stat] = amount;
  }
  const savedName = typeof value.name === 'string' && value.name.trim() ? value.name : '';
  const name = savedName === '영원의 츠바이핸더' && slot === 'weapon' ? '영원의 쯔바이핸드' : savedName || slotNames[slot];
  return { id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(), name, slot, rarity, stats };
}

function itemSkillLevel(save: Save, id: 'mastery' | 'body' | 'instinct'): number { return save.skillLevels[id] ?? 1; }

export function totalStats(save: Save): Record<Stat, number> {
  const total = { attack: 8 + save.level * 2, defense: 2 + save.level, health: 100 + (save.level - 1) * 12, crit: 2, speed: 0 };
  for (const item of Object.values(save.equipment)) if (item && !isSkillBook(item)) {
    for (const stat of Object.keys(item.stats) as Stat[]) total[stat] += item.stats[stat] ?? 0;
  }
  if (save.passives.includes('mastery')) total.attack = Math.ceil(total.attack * (1.15 + (itemSkillLevel(save, 'mastery') - 1) * .02));
  if (save.passives.includes('body')) { const bonus = 1.15 + (itemSkillLevel(save, 'body') - 1) * .02; total.defense = Math.ceil(total.defense * bonus); total.health = Math.ceil(total.health * bonus); }
  if (save.passives.includes('instinct')) { total.crit += 8 + (itemSkillLevel(save, 'instinct') - 1) * 2; total.speed += 12 + (itemSkillLevel(save, 'instinct') - 1) * 2; }
  return total;
}

export function equipmentDropChance(floor: number, boss = false): number {
  return boss ? Math.min(.18, .03 + (floor - 1) * .003) : Math.min(.015, .002 + (floor - 1) * .00025);
}

export function rollItem(floor: number, guaranteed = false, boss = false): Item {
  if (guaranteed) return { id: crypto.randomUUID(), name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } };
  const roll = Math.random();
  const depth = Math.max(0, floor - 1);
  const legendary = boss ? Math.min(.04, .02 + depth * .0002) : Math.min(.006, .002 + depth * .00005);
  const rare = boss ? Math.min(.22, .14 + depth * .001) : Math.min(.035, .017 + depth * .0004);
  const rarity: Rarity = roll < legendary ? 'legendary' : roll < rare ? 'rare' : roll < (boss ? .54 : .117) ? 'magic' : 'common';
  const slot = slots[Math.floor(Math.random() * slots.length)];
  const bases = baseItems[slot];
  const rarityTier = { common: 0, magic: 2, rare: 4, legendary: 6 }[rarity];
  const maxTier = Math.min(bases.length - 1, Math.floor(depth / (bases.length === 10 ? 3 : 8)) + Math.floor(rarityTier * (bases.length - 1) / 9));
  const tier = Math.floor(Math.random() * (maxTier + 1));
  const base = bases[tier];
  const zweihander = slot === 'weapon' && base === '쯔바이핸드';
  const prefix = { common: '낡은', magic: '서리의', rare: '황혼의', legendary: '영원의' }[rarity];
  const scale = (1 + Math.floor(floor / 2)) * ({ common: 1, magic: 2, rare: 3, legendary: 5 }[rarity]);
  const primary: Stat = ['weapon', 'ring1', 'ring2', 'gloves'].includes(slot) ? 'attack' : 'defense';
  const stats: Partial<Record<Stat, number>> = { [primary]: scale + Math.ceil(Math.random() * 3) + Math.ceil(tier * (slot === 'weapon' ? .6 : .4)) };
  if (rarity !== 'common') stats.health = 3 * scale;
  if (rarity === 'rare' || rarity === 'legendary') stats.crit = scale;
  if (rarity === 'legendary') stats.speed = scale;
  if (zweihander) {
    stats.attack = (stats.attack ?? 0) + 2 + Math.ceil(scale * .25);
    if (rarity !== 'common') stats.crit = (stats.crit ?? 0) + Math.max(1, Math.ceil(scale * .5));
  }
  return { id: crypto.randomUUID(), name: base.startsWith(`${prefix} `) ? base : `${prefix} ${base}`, slot, rarity, stats };
}

export function itemPower(item: Item): number {
  if (isSkillBook(item)) return 0;
  return (item.stats.attack ?? 0) * 3 + (item.stats.defense ?? 0) * 2 + (item.stats.health ?? 0) * .2 + (item.stats.crit ?? 0) * 2 + (item.stats.speed ?? 0) * 2;
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
  const ranks: Record<Rarity, number> = { common: 0, magic: 1, rare: 2, legendary: 3 };
  const chosen = save.bag.filter(item => !isSkillBook(item) && ranks[item.rarity] <= ranks[maxRarity]);
  const gold = chosen.reduce((sum, item) => sum + ({ common: 3, magic: 10, rare: 25, legendary: 60 })[item.rarity], 0);
  const stones = chosen.reduce((sum, item) => sum + (item.rarity === 'common' ? 1 : 2), 0);
  const ids = new Set(chosen.map(item => item.id));
  save.bag = save.bag.filter(item => !ids.has(item.id));
  save.gold += gold; save.stones += stones;
  return { count: chosen.length, gold, stones };
}
