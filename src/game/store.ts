import { discoverEquipment, normalizeCollection } from './codex';
import { normalizeQuickSlots, type QuickSlots } from './loadout';
import { migrateItem, slots, totalStats, type EquipmentItem, type Item, type Slot } from './items';
import { statBookCounts, type StatBookCounts } from './statBooks';
export { slots, slotNames, rarityNames, statNames, isZweihander, equipmentImage, totalStats, rollItem, itemPower, autoEquipBest, salvageByRarity } from './items';
export type { Rarity, Slot, Stat, Item } from './items';
import { allPassiveIds, allSkillIds, jobOrDefault, skillOrderFor, MAX_SKILL_LEVEL, type Job, type PassiveId, type SkillId, type SkillLevelId } from './skills';
import { spLedger, SP_PER_LEVEL } from './skillPoints';
// 진행 규칙(층 목표·경험치 곡선·최고 층)의 정의는 `progress.ts` 한 곳에 있다 — 여기서는 예전 import 경로를
// 그대로 쓰는 파일들을 위해 재export만 한다(PR-3, 작업 262).
import { MAX_FLOOR, MAX_LEVEL, gainExperience, killsToBoss } from './progress';
export { MAX_FLOOR, MAX_LEVEL, expToNext } from './progress';
export const floorKillTarget = killsToBoss;

export type Gender = 'male' | 'female';
/** 직업은 캐릭터 생성 시 1회 선택해 고정한다. 값이 없는 예전 세이브는 모두 전사다. */
export type { Job };
export { jobOrDefault, jobNames, jobs } from './skills';
/** 끝없는 던전에 지금 있는 마지막 층. 이보다 깊은 층은 아직 준비 중이다(순위 근거이기도 하다). */
export const DUNGEON_MAX_FLOOR = 10;
/** 무한 방어전의 표시·검증상 스테이지 상한. 난이도 상한이 아니라 999 이후를 접는 값이다(2026-11-24). */
export const DEFENSE_MAX_STAGE = 999;

export type Save = { version: 1; name: string; accountId: string; gender: Gender; job?: Job; auto: boolean; autoClimb: boolean; level: number; exp: number; gold: number; floor: number; maxFloor: number; floorKills: number; kills: number; bossKills: number; playSeconds: number; /** 장비 분해 누적 횟수(작업 207) — 일일·주간 `장비 분해` 미션이 이 값의 증가분을 센다. */ salvageCount: number; health: number; equipment: Partial<Record<Slot, EquipmentItem>>; equipmentCollection: string[]; bag: Item[]; tutorial: number; stones: number; skillPoints: number; lastActiveAt: number; learned: SkillId[]; passives: PassiveId[]; quickSlots: QuickSlots; skillLevels: Partial<Record<SkillLevelId, number>>;
  /** 영구 스탯북 사용 권수(파트 B, 2026-11-22) — 종류별 0~30. 파트 A의 `skillPoints`/`skillLevels`(스킬 트리)와
   *  **겹치지 않는 별도 필드**다. 없는 옛 세이브는 0부터 센다. */
  statBooks?: StatBookCounts;
  dungeonFloor: number; dungeonClearAt: number;
  /** 무한 방어전 최고 도달 스테이지(2026-11-24) — 0이면 기록 없음. 서버는 검증된 순위 기록(+1)까지만 저장한다. */
  defenseStage: number;
  /** 그 스테이지에 처음 도달한 시각 — 순위 동점 정렬(먼저 도달한 사람이 위)의 근거다. */
  defenseStageAt: number;
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

/** 새 캐릭터가 처음부터 갖는 액티브 스킬 1개(그 직업의 첫 스킬) — 밸런스 v2 온보딩. */
export function starterSkillFor(job: Job = 'warrior'): SkillId { return skillOrderFor(jobOrDefault(job))[0]; }

export function freshSave(gender: Gender = 'male', job: Job = 'warrior'): Save {
  // 밸런스 v2 온보딩: ① Lv.1 기본 체력을 140으로(적 사거리가 90이 되며 100은 너무 얇았다),
  // ② 그 직업의 첫 액티브 스킬을 **습득한 상태로** 시작한다(퀵슬롯에는 넣지 않는다 — 곧 오는 튜토리얼이
  //    직접 장착하게 안내한다).
  const starter = starterSkillFor(job);
  // 영구 스탯북(파트 B, +스킬의 서) — 처음엔 0권. `parseSave`가 옛 세이브에도 0을 채운다.
  return { version: 1, statBooks: { attack: 0, defense: 0, health: 0, skill: 0 }, name: '모험가', accountId: crypto.randomUUID().slice(0, 8).toUpperCase(), gender, job, auto: true, autoClimb: true, level: 1, exp: 0, gold: 0, floor: 1, maxFloor: 1, floorKills: 0, kills: 0, bossKills: 0, playSeconds: 0, salvageCount: 0, health: 140, equipment: {}, equipmentCollection: [], bag: [], tutorial: 0, stones: 0, skillPoints: SP_PER_LEVEL, lastActiveAt: Date.now(), learned: [starter], passives: [], quickSlots: [null, null, null], skillLevels: { [starter]: 1 }, dungeonFloor: 0, dungeonClearAt: 0, bossRetryFloor: 0, defenseStage: 0, defenseStageAt: 0 };
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
    // SP는 레벨·랭크에서 다시 계산한다(`skillPoints.ts` 한 곳의 식) — 저장된 값은 그 상한을 넘지 못한다.
    // 예전 세이브(스킬북으로 랭크를 올리던 시절)는 쓴 랭크가 가용 SP보다 많을 수 있으므로 0에서 멈춘다.
    const earnedSp = spLedger({ level, learned: active, passives, skillLevels }).available;
    const skillPoints = Math.max(0, Math.min(earnedSp, Math.floor(safeNumber(value.skillPoints, earnedSp))));
    // 던전 최고층은 0~10의 정수, 최초 클리어 시각은 0 이상. 없는 세이브(구버전)는 0층부터 시작한다.
    const dungeonFloor = Math.min(DUNGEON_MAX_FLOOR, Math.floor(safeNumber(value.dungeonFloor, defaults.dungeonFloor)));
    // 무한 방어전 도달 스테이지도 0~999의 정수다 — 없는 세이브(구버전)는 0부터 센다.
    const defenseStage = Math.min(DEFENSE_MAX_STAGE, Math.floor(safeNumber(value.defenseStage, defaults.defenseStage)));
    return { ...defaults, statBooks: statBookCounts({ statBooks: value.statBooks }), name: typeof value.name === 'string' && value.name.trim() ? value.name : defaults.name, accountId: accountId ?? (typeof value.accountId === 'string' && value.accountId ? value.accountId : defaults.accountId), gender: value.gender === 'female' ? 'female' : 'male', job: jobOrDefault(value.job), auto: true, autoClimb: typeof value.autoClimb === 'boolean' ? value.autoClimb : true, level, exp: level >= MAX_LEVEL ? 0 : safeNumber(value.exp, defaults.exp), gold: Math.floor(safeNumber(value.gold, defaults.gold)), floor, maxFloor, floorKills: Math.min(floorKillTarget(floor), Math.floor(safeNumber(value.floorKills, 0))), kills: Math.floor(safeNumber(value.kills, defaults.kills)), bossKills: Math.floor(safeNumber(value.bossKills, 0)), playSeconds: safeNumber(value.playSeconds, 0), salvageCount: Math.floor(safeNumber(value.salvageCount, 0)), health: safeNumber(value.health, defaults.health), equipment, equipmentCollection: collection.equipmentCollection, bag, tutorial: Math.min(3, Math.floor(safeNumber(value.tutorial, defaults.tutorial))), stones: Math.floor(safeNumber(value.stones, defaults.stones)), skillPoints, lastActiveAt: safeNumber(value.lastActiveAt, Date.now()), learned: active, passives, quickSlots, skillLevels, bossRetryFloor, dungeonFloor, dungeonClearAt: dungeonFloor > 0 ? Math.floor(safeNumber(value.dungeonClearAt, 0)) : 0, defenseStage, defenseStageAt: defenseStage > 0 ? Math.floor(safeNumber(value.defenseStageAt, 0)) : 0 };
  } catch (error) {
    throw new Error(`저장 데이터를 읽지 못했습니다: ${String(error)}`);
  }
}

export function skillLevel(save: Save, id: SkillLevelId): number { return save.skillLevels[id] ?? 1; }
/** 경험치·레벨업 규칙 자체는 `progress.ts`의 `gainExperience`가 갖는다 — 최대 체력을 아는 이 파일이
 *  레벨업 뒤 체력을 채운다. */
export function addExperience(save: Save, amount: number): number {
  const gained = gainExperience(save, amount);
  if (gained) { save.health = totalStats(save).health; save.skillPoints = spLedger(save).available; }
  return gained;
}
