import { archerArmorBases, archerHelmetBases, baseItemIndex, baseItems, bowBases, bowIndex, equipmentImage, gearStats, isEquipment, isZweihander, itemJob, mageArmorBases, mageHelmetBases, rarityOrder, rarityPrefixes, rarityRanks, rarityTiers, staffBases, staffIndex, type EquipmentItem, type Item, type Rarity, type Slot, type Stat } from './items';
import type { Job } from './skills';
import type { Save } from './store';
export type CodexSlot = Exclude<Slot, 'ring1' | 'ring2'> | 'ring';
/** 한 부위 안의 세 갈래 — 무기는 대검·활·지팡이, 투구는 투구·후드·모자, 갑옷은 판금·경갑·로브(작업 208·249). */
export type CodexGearGroup = '대검' | '활' | '지팡이' | '판금' | '경갑' | '로브' | '투구' | '후드' | '모자';
export type CodexWeaponGroup = CodexGearGroup;
export type CodexEntry = { key: string; name: string; slot: CodexSlot; /** 같은 부위 안의 고유 번호(무기·투구·갑옷 모두 0~9 · 10~19 · 20~29). */ index: number; /** 그 목록 안에서의 티어(0~9) — 드롭 시작 층 계산에 쓴다. */ tier: number; group?: CodexGearGroup; item: EquipmentItem; art: ReturnType<typeof equipmentImage> };
export const codexSlotNames: Record<CodexSlot, string> = { weapon: '무기', offhand: '문장', helmet: '투구', armor: '갑옷', necklace: '목걸이', gloves: '장갑', belt: '허리띠', boots: '신발', ring: '반지' };
/** 한 부위 목록 안에서 두 번째·세 번째 갈래가 시작하는 번호 — 전사 다음 궁수, 마법사 순서다. */
export const CODEX_BOW_OFFSET = 10;
export const CODEX_STAFF_OFFSET = 20;
const weaponGroups: readonly { label: CodexGearGroup; bases: readonly string[]; offset: number }[] = [
  { label: '대검', bases: baseItems.weapon, offset: 0 },
  { label: '활', bases: bowBases, offset: CODEX_BOW_OFFSET },
  { label: '지팡이', bases: staffBases, offset: CODEX_STAFF_OFFSET }
];
/** 갑옷: 판금(전사)·경갑(궁수)·로브(마법사) 10종씩. */
const armorGroups: readonly { label: CodexGearGroup; bases: readonly string[]; offset: number }[] = [
  { label: '판금', bases: baseItems.armor, offset: 0 },
  { label: '경갑', bases: archerArmorBases, offset: CODEX_BOW_OFFSET },
  { label: '로브', bases: mageArmorBases, offset: CODEX_STAFF_OFFSET }
];
/** 투구: 투구(전사)·후드(궁수)·모자(마법사) 10종씩. */
const helmetGroups: readonly { label: CodexGearGroup; bases: readonly string[]; offset: number }[] = [
  { label: '투구', bases: baseItems.helmet, offset: 0 },
  { label: '후드', bases: archerHelmetBases, offset: CODEX_BOW_OFFSET },
  { label: '모자', bases: mageHelmetBases, offset: CODEX_STAFF_OFFSET }
];
const gearGroups: Partial<Record<CodexSlot, readonly { label: CodexGearGroup; bases: readonly string[]; offset: number }[]>> = {
  weapon: weaponGroups, armor: armorGroups, helmet: helmetGroups
};
function makeEntry(slot: CodexSlot, itemSlot: Slot, name: string, index: number, tier: number, group?: CodexGearGroup): CodexEntry {
  const item: EquipmentItem = { id: `codex-${slot}-${index}`, name, slot: itemSlot, rarity: 'common', stats: {} };
  return { key: `${slot}:${index}`, name, slot, index, tier, group, item, art: equipmentImage(item) };
}
/**
 * 도감의 기본형 목록 — 부위 9종 + 무기·투구·갑옷의 세 갈래(직업마다 10종) = **135종**(작업 208·249).
 * 등급 6단계를 곱한 810칸이 도감의 전부이고, 발견 기록도 **등급별로** 남는다.
 */
export const codexEntries: CodexEntry[] = Object.keys(codexSlotNames).flatMap(raw => {
  const slot = raw as CodexSlot;
  const groups = gearGroups[slot];
  if (groups) return groups.flatMap(group => group.bases.map((name, tier) => makeEntry(slot, slot as Slot, name, group.offset + tier, tier, group.label)));
  const itemSlot = slot === 'ring' ? 'ring1' : slot;
  return baseItems[itemSlot].map((name, index) => makeEntry(slot, itemSlot, name, index, index));
});
/** 발견 기록의 한 칸 — `부위:번호:등급`. 실제로 먹은 등급만 이 키로 남는다. */
export function codexVariantKey(entry: CodexEntry, rarity: Rarity): string { return `${entry.key}:${rarity}`; }
const baseKeys = new Set(codexEntries.map(entry => entry.key));
/** 모든 기본형 키(`부위:번호`) — 95개. 서버·문서가 같은 목록을 확인할 때 쓴다. */
export const codexEntryKeys: ReadonlySet<string> = baseKeys;
const variantKeys = new Set(codexEntries.flatMap(entry => rarityOrder.map(rarity => codexVariantKey(entry, rarity))));
/** 장비 이름이 무기·투구·갑옷 안에서 몇 번째 기본형인지 — 무기 0~29, 투구·갑옷도 0~29(전사 0~9 · 궁수 10~19 · 마법사 20~29). */
export function codexBaseIndex(item: EquipmentItem): number {
  if (item.slot === 'weapon') {
    const bow = bowIndex(item); if (bow >= 0) return CODEX_BOW_OFFSET + bow;
    const staff = staffIndex(item); if (staff >= 0) return CODEX_STAFF_OFFSET + staff;
  }
  if (item.slot === 'helmet' || item.slot === 'armor') {
    const tier = baseItemIndex(item);
    if (tier < 0) return -1;
    // 이름이 궁수·마법사 목록에 있으면 그 갈래, 옛 전사용 이름(job 없음)은 전사 갈래다(작업 249).
    const owner = itemJob(item);
    return (owner === 'archer' ? CODEX_BOW_OFFSET : owner === 'mage' ? CODEX_STAFF_OFFSET : 0) + tier;
  }
  return baseItemIndex(item);
}
/** 이 장비가 도감의 어느 기본형인가 — `부위:번호`. 대상이 아니면 undefined. */
export function equipmentCodexKey(item: Item): string | undefined {
  // 스킬북·보물 주머니(작업 207)는 도감 대상이 아니다.
  if (!isEquipment(item)) return undefined;
  const slot = item.slot === 'ring1' || item.slot === 'ring2' ? 'ring' : item.slot;
  const index = codexBaseIndex(item);
  if (index >= 0) return `${slot}:${index}`;
  return isZweihander(item) ? 'weapon:3' : undefined;
}
/** 이 장비가 도감에서 채우는 **등급까지 포함한 한 칸** — `부위:번호:등급`(작업 208).
 *  예전에는 `부위:번호`만 남겨, 일반 한 벌만 먹어도 레전드까지 발견으로 잡히는 버그가 있었다. */
export function equipmentCodexVariantKey(item: Item): string | undefined {
  if (!isEquipment(item)) return undefined;
  const key = equipmentCodexKey(item);
  return key && Object.hasOwn(rarityRanks, item.rarity) ? `${key}:${item.rarity}` : undefined;
}
/** 세이브에 남은 발견 기록을 등급별 칸으로 정규화한다. 구버전 `부위:번호` 키는 버린다 —
 *  같은 세이브의 가방·장착 장비에서 `discoverEquipment`가 실제 등급만 다시 찾아낸다. */
export function normalizeCollection(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((key): key is string => typeof key === 'string' && variantKeys.has(key)))] : [];
}
export function isCodexBaseKey(key: string): boolean { return baseKeys.has(key); }
export function isCodexVariantKey(key: string): boolean { return variantKeys.has(key); }
export const codexVariantCount = variantKeys.size;
export function discoverEquipment(save: Pick<Save, 'equipmentCollection' | 'bag' | 'equipment'>): boolean {
  const discovered = new Set(normalizeCollection(save.equipmentCollection));
  for (const item of [...save.bag, ...Object.values(save.equipment).filter((item): item is EquipmentItem => !!item)]) {
    const key = equipmentCodexVariantKey(item); if (key) discovered.add(key);
  }
  const next = [...discovered], changed = JSON.stringify(next) !== JSON.stringify(save.equipmentCollection);
  save.equipmentCollection = next; return changed;
}
/** 이 기본형을 한 번이라도 먹었는가 — 등급 하나라도 발견했으면 true. */
export function entryDiscovered(save: Pick<Save, 'equipmentCollection'>, entry: CodexEntry): boolean {
  const prefix = `${entry.key}:`;
  return (save.equipmentCollection ?? []).some(key => typeof key === 'string' && key.startsWith(prefix));
}
export function codexOwnership(save: Save, entry: CodexEntry): { bag: number; equipped: number; discovered: boolean } {
  const bag = save.bag.filter(item => equipmentCodexKey(item) === entry.key).length;
  const equipped = Object.values(save.equipment).filter(item => item && equipmentCodexKey(item) === entry.key).length;
  return { bag, equipped, discovered: entryDiscovered(save, entry) || bag + equipped > 0 };
}
export function codexVariantName(entry: CodexEntry, rarity: Rarity): string { const prefix = rarityPrefixes[rarity]; return entry.name.startsWith(`${prefix} `) ? entry.name : `${prefix} ${entry.name}`; }
/** 그 기본형이 그 등급으로 처음 떨어질 수 있는 층 — 목록 안의 티어와 등급 오프셋으로 정해진다. */
export function firstDropFloor(entry: CodexEntry, rarity: Rarity): number {
  const count = entry.slot === 'weapon' ? baseItems.weapon.length : baseItems[entry.item.slot].length, tier = rarityTiers[rarity];
  const offset = Math.floor(tier * (count - 1) / 9), stride = count === 10 ? 3 : 8;
  return 1 + Math.max(0, entry.tier - offset) * stride;
}
export function codexOptions(entry: CodexEntry, rarity: Rarity, floor: number): { floor: number; stats: { stat: Stat; min: number; max: number }[] } {
  floor = Math.max(firstDropFloor(entry, rarity), Math.floor(floor));
  // 능력치 구간은 **드롭 공식(`gearStats`) 한 곳**에서 만든다(작업 255). 같은 슬롯·등급·티어로
  // 무작위 0과 1을 넣어 최소·최대를 얻으므로, 공식을 손봐도 도감이 따로 놀지 않는다.
  // 투구·갑옷도 직업별 목록으로 갈렸으므로(작업 249·PR #254) 갈래 이름에서 직업을 정해 `slotProfileFor`에 넘긴다.
  // 넘기지 않으면 공용 프로필로 미리보기가 만들어져, 실제 드롭 범위와 어긋난다(작업 255).
  const job: Job | undefined = entry.group === '활' || entry.group === '경갑' || entry.group === '후드' ? 'archer'
    : entry.group === '지팡이' || entry.group === '로브' || entry.group === '모자' ? 'mage'
    : entry.group ? 'warrior' : undefined;
  const zweihander = entry.slot === 'weapon' && entry.name === '쯔바이핸드';
  const min = gearStats(entry.item.slot, rarity, entry.tier, floor, job, zweihander, () => 0);
  const max = gearStats(entry.item.slot, rarity, entry.tier, floor, job, zweihander, () => .999);
  const stats = (Object.keys(min) as Stat[]).map(stat => ({ stat, min: min[stat] ?? 0, max: max[stat] ?? 0 }));
  return { floor, stats };
}
/** 기본형 단위 필터 — 검색·부위·발견 여부(등급 하나라도). `codexVariants`가 등급 단위로 다시 고른다. */
export function filterCodex(save: Save, query = '', slot = '', state = 'all'): CodexEntry[] {
  const search = query.trim().toLocaleLowerCase('ko-KR');
  return codexEntries.filter(entry => {
    if (slot && entry.slot !== slot) return false;
    const owned = codexOwnership(save, entry);
    if (state === 'owned' && owned.bag + owned.equipped === 0) return false;
    if (state === 'found' && !owned.discovered || state === 'missing' && owned.discovered) return false;
    return !search || [entry.name, ...rarityOrder.map(rarity => codexVariantName(entry, rarity))].some(name => name.toLocaleLowerCase('ko-KR').includes(search));
  });
}
export const codexRarities: Rarity[] = rarityOrder;
export type CodexVariant = { entry: CodexEntry; rarity: Rarity; key: string; name: string; bag: number; equipped: number; discovered: boolean };
/** 도감 한 칸(기본형 × 등급) 목록 — 135종 × 6등급 = 810칸(작업 208·249).
 *  `found`/`missing`/`owned`는 **등급 단위**로 거른다: 레전드를 안 먹었으면 레전드 칸은 미발견이다. */
export function codexVariants(save: Save, query = '', slot = '', state = 'all', rarity = ''): CodexVariant[] {
  const search = query.trim().toLocaleLowerCase('ko-KR');
  const collection = new Set(normalizeCollection(save.equipmentCollection));
  return codexEntries.filter(entry => !slot || entry.slot === slot).flatMap(entry => codexRarities.filter(grade => !rarity || grade === rarity).flatMap(grade => {
    const name = codexVariantName(entry, grade);
    if (search && !name.toLocaleLowerCase('ko-KR').includes(search)) return [];
    const bag = save.bag.filter(item => item.rarity === grade && equipmentCodexKey(item) === entry.key).length;
    const equipped = Object.values(save.equipment).filter(item => item?.rarity === grade && equipmentCodexKey(item) === entry.key).length;
    const key = codexVariantKey(entry, grade), discovered = collection.has(key) || bag + equipped > 0;
    if (state === 'found' && !discovered || state === 'missing' && discovered || state === 'owned' && !bag && !equipped) return [];
    return [{ entry, rarity: grade, key, name, bag, equipped, discovered }];
  })).sort((a, b) => rarityRanks[a.rarity] - rarityRanks[b.rarity]);
}
