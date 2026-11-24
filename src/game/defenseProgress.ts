/**
 * 무한 방어전 진행·보상 (2026-11-24).
 *
 * 세이브에 남는 것은 두 값뿐이다 — `defenseStage`(최고 도달 스테이지, 0 = 기록 없음)와
 * `defenseStageAt`(그 스테이지에 처음 도달한 시각, 동점 정렬용). 서버는 이 값을 `djrpg_defense_records`의
 * 검증된 기록보다 높게 저장하지 못하게 자른다(`server/db/save.mjs` `defenseStageCap`).
 *
 * 보상은 **판이 끝날 때 한 번** 지급한다 — 무한 방어전은 실패(캐릭터 사망)해도 그때까지 먹은 금화·경험치·
 * 아이템을 그대로 준다(양측 확정 사양 ③). 전투 중에는 세이브 사본으로 싸우고(`DefenseBattle`), 여기서
 * 그 사본이 모은 합계를 실제 세이브에 옮긴다.
 */
import { addExperience } from './store';
import { addItemToBag } from './rewardGrant';
import { autoSalvageRecovered } from './inventory';
import type { Item, Rarity } from './items';
import { DEFENSE_MAX_STAGE, type DefenseRewards } from './dungeon/defenseBattle';
import type { Save } from './store';

/** 세이브에 남은 최고 도달 스테이지(0~999). 예전 세이브는 0이다. */
export function defenseReachedStage(save: Pick<Save, 'defenseStage'>): number {
  const stage = Number(save.defenseStage ?? 0);
  return Number.isFinite(stage) ? Math.max(0, Math.min(DEFENSE_MAX_STAGE, Math.floor(stage))) : 0;
}

/** 그 스테이지에 처음 도달한 시각. 순위에서 같은 스테이지일 때 누가 먼저인지 가리는 근거다. */
export function defenseReachedAt(save: Pick<Save, 'defenseStageAt'>): number {
  const at = Number(save.defenseStageAt ?? 0);
  return Number.isFinite(at) && at > 0 ? Math.floor(at) : 0;
}

/**
 * 도달 스테이지를 세이브에 적는다. 최고 기록은 오르기만 하고, 같은 스테이지의 최초 도달 시각은 그대로 둔다.
 * 적을 것이 없으면 false를 돌려주므로 호출한 쪽이 저장 요청을 아낄 수 있다.
 */
export function recordDefenseRun(save: Save, stage: number, now = Date.now()): boolean {
  if (!Number.isFinite(stage) || stage < 1) return false;
  const target = Math.min(DEFENSE_MAX_STAGE, Math.floor(stage));
  const previous = defenseReachedStage(save);
  if (target > previous) {
    save.defenseStage = target;
    save.defenseStageAt = Math.max(1, Math.floor(now));
    return true;
  }
  if (target === previous && !defenseReachedAt(save)) {
    save.defenseStageAt = Math.max(1, Math.floor(now));
    return true;
  }
  return false;
}

/** 결과창이 쓰는 보상 영수증. */
export type DefenseRewardReceipt = {
  gold: number;
  exp: number;
  kills: number;
  bossKills: number;
  /** 가방에 들어간 아이템. */
  items: Item[];
  /** 가방이 가득 차서 놓친 아이템 개수. */
  missed: number;
  /** 접속 중 자동 분해가 가져간 장비의 환산량. */
  salvaged: { count: number; gold: number; stones: number };
};

/**
 * 끝난 판의 보상을 계정 세이브에 지급한다. 판이 어떻게 끝났든(사망·시간 종료) 부른다 —
 * 무한 방어전은 실패해도 획득분을 유지한다.
 */
export function claimDefenseRewards(
  save: Save,
  rewards: DefenseRewards,
  options: { autoSalvage?: Exclude<Rarity, 'legendary'>; autoSalvagePlus?: number } = {}
): DefenseRewardReceipt {
  const gold = Math.max(0, Math.floor(Number.isFinite(rewards.gold) ? rewards.gold : 0));
  const exp = Math.max(0, Math.floor(Number.isFinite(rewards.exp) ? rewards.exp : 0));
  const kills = Math.max(0, Math.floor(Number(rewards.kills) || 0));
  const bossKills = Math.max(0, Math.floor(Number(rewards.bossKills) || 0));
  save.gold += gold;
  save.kills += kills;
  save.bossKills += bossKills;
  // 경험치는 레벨업·최대 체력 갱신까지 `store.ts`의 `addExperience`가 맡는다(필드와 같은 경로).
  if (exp > 0) addExperience(save, exp);
  const items: Item[] = [];
  const salvaged = { count: 0, gold: 0, stones: 0 };
  let missed = 0;
  for (const item of rewards.items) {
    if (options.autoSalvage) {
      const sweep = autoSalvageRecovered(save, item, options.autoSalvage, options.autoSalvagePlus);
      if (sweep) { salvaged.count++; salvaged.gold += sweep.gold; salvaged.stones += sweep.stones; continue; }
    }
    if (!addItemToBag(save, item, 'dungeon')) { missed++; continue; }
    items.push(item);
  }
  return { gold, exp, kills, bossKills, items, missed, salvaged };
}
