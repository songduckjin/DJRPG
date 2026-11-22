import { discoverEquipment, normalizeCollection } from './codex';
import { normalizeQuickSlots, type QuickSlots } from './loadout';
import { migrateItem, slots, totalStats, type EquipmentItem, type Item, type Slot } from './items';
import { statBookCounts, type StatBookCounts } from './statBooks';
export { slots, slotNames, rarityNames, statNames, isZweihander, equipmentImage, totalStats, rollItem, itemPower, autoEquipBest, salvageByRarity } from './items';
export type { Rarity, Slot, Stat, Item } from './items';
import { allPassiveIds, allSkillIds, jobOrDefault, MAX_SKILL_LEVEL, type Job, type PassiveId, type SkillId, type SkillLevelId } from './skills';

export type Gender = 'male' | 'female';
/** 직업은 캐릭터 생성 시 1회 선택해 고정한다. 값이 없는 예전 세이브는 모두 전사다. */
export type { Job };
export { jobOrDefault, jobNames, jobs } from './skills';
export const MAX_LEVEL = 30;
/** 끝없는 던전에 지금 있는 마지막 층. 이보다 깊은 층은 아직 준비 중이다(순위 근거이기도 하다). */
export const DUNGEON_MAX_FLOOR = 10;
/** 메인 사냥의 마지막 층(작업 204). 20층 위로는 열리지 않으며, 상한이 풀릴 때 이 값만 올린다.
 *  몹 체력·장비 스탯·스폰 곡선은 20층 상한과 무관하게 지금 수치 그대로 두어, 나중에 30·50·80층으로
 *  상한이 풀리면 고층 곡선이 그대로 이어진다. */
export const MAX_FLOOR = 20;

export type Save = { version: 1; name: string; accountId: string; gender: Gender; job?: Job; auto: boolean; autoClimb: boolean; level: number; exp: number; gold: number; floor: number; maxFloor: number; floorKills: number; kills: number; bossKills: number; playSeconds: number; /** 장비 분해 누적 횟수(작업 207) — 일일·주간 `장비 분해` 미션이 이 값의 증가분을 센다. */ salvageCount: number; health: number; equipment: Partial<Record<Slot, EquipmentItem>>; equipmentCollection: string[]; bag: Item[]; tutorial: number; stones: number; skillPoints: number; lastActiveAt: number; learned: SkillId[]; passives: PassiveId[]; quickSlots: QuickSlots; skillLevels: Partial<Record<SkillLevelId, number>>;
  /** 영구 스탯북 사용 권수(파트 B, 2026-11-22) — 종류별 0~30. 파트 A의 `skillPoints`/`skillLevels`(스킬 트리)와
   *  **겹치지 않는 별도 필드**다. 없는 옛 세이브는 0부터 센다. */
  statBooks?: StatBookCounts;
  dungeonFloor: number; dungeonClearAt: number;
  /** 보스에게 진 층(작업 223, 사용자 제보 `#6086`) — 0/없음이면 재도전 없음, `maxFloor`와 같으면
   *  `⚔ 보스 도전`이 살아 있다. HUD 상태를 세션 메모리에만 두면 새로고침·재접속·버전 업데이트로
   *  보스 앞에서 실패한 기록이 날아가 버튼이 사라졌다(사용자: "4층 넘어갈때까지 계속 있어야되는데"). */
  bossRetryFloor?: number;
  /** 시즌 번호와 새 시즌 설정 대기 표시(작업 206) — 서버가 시즌 초기화 뒤 내려보내며, 로그인 화면이
   *  직업·성별을 고른 뒤 `completeSetup`으로 지운다. 게임 세이브에는 남지 않는다. */
  season?: number; needsSetup?: boolean };

const legacyKeys = ['djrpg-save-v1', 'djrpg.save.v1', 'djrpg.save.v1.guest'];
export function readLegacySave(loginId?: string): { save: Save; key: string } | undefined {
  let keys = legacyKeys;
  if (loginId) {
    const raw = localStorage.getItem('djrpg.accounts.v1');
    const records: unknown = raw ? JSON.parse(raw) : [];
    const account = Array.isArray(records) ? records.find(value => isRecord(value) && typeof value.loginId === 'string' && value.loginId.toLocaleLowerCase('ko-KR') === loginId.toLocaleLowerCase('ko-KR') && typeof value.id === 'string') : undefined;
    keys = account ? [`djrpg.save.v1.${account.id}`] : [];
  }
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    return { save: parseSave(JSON.parse(raw)), key };
  }
  return undefined;
}
export function clearLegacySave(key: string): void {
  localStorage.removeItem(key);
  if (key.startsWith('djrpg.save.v1.') && key !== 'djrpg.save.v1.guest') {
    const raw = localStorage.getItem('djrpg.accounts.v1');
    if (raw) {
      const records: unknown = JSON.parse(raw);
      if (Array.isArray(records)) {
        const remaining = records.filter(value => !isRecord(value) || value.id !== key.slice('djrpg.save.v1.'.length));
        if (remaining.length) localStorage.setItem('djrpg.accounts.v1', JSON.stringify(remaining));
        else localStorage.removeItem('djrpg.accounts.v1');
      }
    }
  }
  localStorage.removeItem('djrpg.lastLogin.v1');
  localStorage.removeItem('djrpg-salvage-rarity');
  localStorage.removeItem('djrpg-auto-salvage');
  localStorage.removeItem('djrpg-auto-salvage-plus');
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function safeNumber(value: unknown, fallback: number, min = 0): number { return typeof value === 'number' && Number.isFinite(value) && value >= min ? value : fallback; }

/** 다음 레벨까지 필요한 경험치(작업 207, 사용자 확정 곡선 `1400 × level²`) — 1~5층 Lv.3~4 · 10층 Lv.6 · 20층 Lv.11~12 페이스. */
export function expToNext(level: number): number { return Math.round(1400 * Math.pow(level, 2)); }
/** 그 층에서 보스가 나오기까지 잡아야 하는 몬스터 수(작업 204). 1층 150마리에서 완만히 가팔라져
 *  20층 3,505마리 — 5층 472 · 10층 1,163 · 15층 2,174. 층이 오를수록 사냥 한 층이 길어진다. */
export function floorKillTarget(floor: number): number {
  const depth = Math.max(0, floor - 1);
  return 150 + 55 * depth + Math.round(Math.pow(depth, 2) * 6.4);
}

export function freshSave(gender: Gender = 'male', job: Job = 'warrior'): Save {
  return { version: 1, statBooks: { attack: 0, defense: 0, health: 0 }, name: '모험가', accountId: crypto.randomUUID().slice(0, 8).toUpperCase(), gender, job, auto: true, autoClimb: true, level: 1, exp: 0, gold: 0, floor: 1, maxFloor: 1, floorKills: 0, kills: 0, bossKills: 0, playSeconds: 0, salvageCount: 0, health: 100, equipment: {}, equipmentCollection: [], bag: [], tutorial: 0, stones: 0, skillPoints: 0, lastActiveAt: Date.now(), learned: [], passives: [], quickSlots: [null, null, null], skillLevels: {}, dungeonFloor: 0, dungeonClearAt: 0, bossRetryFloor: 0 };
}

export function parseSave(data: unknown, accountId?: string): Save {
  try {
    if (typeof data !== 'object' || data === null) throw new Error('저장 데이터가 손상되었습니다.');
    const value = data as Partial<Save>;
    if (value.version !== 1) throw new Error('지원하지 않는 저장 버전입니다.');
    const job: Job = jobOrDefault(value.job);
    const defaults = freshSave(value.gender === 'female' ? 'female' : 'male', job);
    if (accountId) defaults.accountId = accountId;
    const learned = Array.isArray(value.learned) ? value.learned.filter(id => allSkillIds.includes(id)) : defaults.learned;
    const active = [...new Set(learned)];
    // 퀵슬롯은 그 직업의 스킬만 인정한다 — 직업을 넘기지 않으면 궁수 슬롯이 전사 목록으로 걸러져 사라진다.
    const quickSlots = normalizeQuickSlots(value.quickSlots, active, job);
    const passives = Array.isArray(value.passives) ? [...new Set(value.passives.filter(id => allPassiveIds.includes(id)))] : [];
    const storedLevels = isRecord(value.skillLevels) ? value.skillLevels : {};
    const skillLevels = Object.fromEntries([...active, ...passives].map(id => {
      const rawLevel = storedLevels[id];
      return [id, typeof rawLevel === 'number' && Number.isFinite(rawLevel) ? Math.max(1, Math.min(MAX_SKILL_LEVEL, Math.floor(rawLevel))) : 1];
    })) as Partial<Record<SkillLevelId, number>>;
    const equipment: Save['equipment'] = {};
    if (isRecord(value.equipment)) for (const slot of slots) {
      const item = migrateItem(value.equipment[slot]);
      const ringSlot = (slot === 'ring1' || slot === 'ring2') && (item?.slot === 'ring1' || item?.slot === 'ring2');
      if (item && item.kind !== 'statbook' && item.kind !== 'pouch' && (item.slot === slot || ringSlot)) equipment[slot] = item;
    }
    const bag: Item[] = []; let bagEquipment = 0;
    if (Array.isArray(value.bag)) for (const raw of value.bag) {
      const item = migrateItem(raw);
      // 읽을 때는 아이템을 지우지 않는다. 40칸은 **가방 안의 모든 아이템**(작업 248 — 스탯북·보물 주머니 포함)이고,
      // 예전 규칙으로 40개를 넘긴 세이브도 있으므로 저장 쪽(`server/database.mjs` reconcileItems)이
      // "지금 개수 이하 유지"만 허용한다. 여기서 잘라 버리면 플레이어의 책·주머니가 사라진다.
      const equipmentItem = !!item && item.kind !== 'statbook' && item.kind !== 'pouch';
      if (item && (!equipmentItem || bagEquipment < 40)) { bag.push(item); if (equipmentItem) bagEquipment++; }
    }
    const collection = { bag, equipment, equipmentCollection: normalizeCollection(value.equipmentCollection) };
    discoverEquipment(collection);
    // 메인 층은 1~20(작업 204): 21층 이상에 있던 예전 세이브는 20층으로 보정한다(장비·진행은 그대로).
    const floor = Math.max(1, Math.min(MAX_FLOOR, Math.floor(safeNumber(value.floor, defaults.floor, 1))));
    const maxFloor = Math.max(floor, Math.min(MAX_FLOOR, Math.floor(safeNumber(value.maxFloor, floor, 1))));
    // 보스에게 진 층(작업 223): 0~MAX_FLOOR의 정수만 남기고, 없는 세이브(구버전)는 0으로 둔다.
    const bossRetryFloor = Math.min(MAX_FLOOR, Math.max(0, Math.floor(safeNumber(value.bossRetryFloor, 0))));
    const level = Math.min(MAX_LEVEL, Math.floor(safeNumber(value.level, defaults.level, 1)));
    const invested = Object.values(skillLevels).reduce<number>((sum, rank) => sum + Math.max(0, (rank ?? 1) - 1), 0);
    const skillPoints = Math.floor(safeNumber(value.skillPoints, Math.max(0, level - 1 - invested)));
    // 던전 최고층은 0~10의 정수, 최초 클리어 시각은 0 이상. 없는 세이브(구버전)는 0층부터 시작한다.
    const dungeonFloor = Math.min(DUNGEON_MAX_FLOOR, Math.floor(safeNumber(value.dungeonFloor, defaults.dungeonFloor)));
    return { ...defaults, statBooks: statBookCounts({ statBooks: value.statBooks }), name: typeof value.name === 'string' && value.name.trim() ? value.name : defaults.name, accountId: accountId ?? (typeof value.accountId === 'string' && value.accountId ? value.accountId : defaults.accountId), gender: value.gender === 'female' ? 'female' : 'male', job: jobOrDefault(value.job), auto: true, autoClimb: typeof value.autoClimb === 'boolean' ? value.autoClimb : true, level, exp: level >= MAX_LEVEL ? 0 : safeNumber(value.exp, defaults.exp), gold: Math.floor(safeNumber(value.gold, defaults.gold)), floor, maxFloor, floorKills: Math.min(floorKillTarget(floor), Math.floor(safeNumber(value.floorKills, 0))), kills: Math.floor(safeNumber(value.kills, defaults.kills)), bossKills: Math.floor(safeNumber(value.bossKills, 0)), playSeconds: safeNumber(value.playSeconds, 0), salvageCount: Math.floor(safeNumber(value.salvageCount, 0)), health: safeNumber(value.health, defaults.health), equipment, equipmentCollection: collection.equipmentCollection, bag, tutorial: Math.min(3, Math.floor(safeNumber(value.tutorial, defaults.tutorial))), stones: Math.floor(safeNumber(value.stones, defaults.stones)), skillPoints, lastActiveAt: safeNumber(value.lastActiveAt, Date.now()), learned: active, passives, quickSlots, skillLevels, bossRetryFloor, dungeonFloor, dungeonClearAt: dungeonFloor > 0 ? Math.floor(safeNumber(value.dungeonClearAt, 0)) : 0 };
  } catch (error) {
    throw new Error(`저장 데이터를 읽지 못했습니다: ${String(error)}`);
  }
}

export function skillLevel(save: Save, id: SkillLevelId): number { return save.skillLevels[id] ?? 1; }
export function addExperience(save: Save, amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0 || save.level >= MAX_LEVEL) return 0;
  save.exp += amount;
  let gained = 0;
  while (save.level < MAX_LEVEL && save.exp >= expToNext(save.level)) {
    save.exp -= expToNext(save.level);
    save.level++;
    save.health = totalStats(save).health;
    gained++;
  }
  if (save.level >= MAX_LEVEL) save.exp = 0;
  return gained;
}
