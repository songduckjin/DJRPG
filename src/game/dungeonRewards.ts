// 던전 클리어 보상 (작업 205).
//
// 미리보기였을 때는 금화·아이템이 화면에 떨어졌다 사라질 뿐 계정 세이브는 건드리지 않았다. 이제 던전은
// 실제 보상을 주는 콘텐츠이므로, 클리어한 순간 그 층이 바닥에 남긴 것을 이 파일 하나가 세이브에 옮긴다.
//
//   · 금화 — 그 층에서 처치한 만큼(일반 7마리 × (3 + 층), 보스 층은 10무더기 합계 70 × 층)
//   · 강화석 — 층수 비례(층 × 2) + 최초 클리어 보너스(10 + 층 × 3)
//   · 아이템 — 떨어진 장비·스킬북 그대로. 가방이 가득 차면 놓친 개수를 알려 준다.
//
// 실패(dead)·시간 초과(timeout)에는 아무것도 지급하지 않는다 — `DungeonBattle.clearRewards()`가 clear일
// 때만 지급 목록을 돌려주기 때문이다. 이미 깬 층을 다시 도는 구조도 없다: 로비는 언제나 `clearedFloor + 1`
// 층만 열어 주므로, 최초 클리어 보너스가 반복 지급될 자리가 없다.
//
// 접속 중 자동 분해가 켜져 있으면 떨어진 장비도 필드와 같은 규칙(`autoSalvageRecovered`)으로 금화·강화석이
// 되고 가방에는 들어가지 않는다. 스킬북·잠금·등급 초과·빈 슬롯·더 좋은 장비 보호는 그대로다.

import { canStoreItem } from './bagCapacity';
import { jobOrDefault } from './skills';
import { autoSalvageRecovered } from './inventory';
import { DUNGEON_MAX_FLOOR, type Save } from './store';
import type { Item, Rarity } from './items';
import { dungeonClearedFloor } from './dungeonProgress';
import { DUNGEON_KILLS_PER_FLOOR, killGold } from './progress';

/** 층 번호를 1~`DUNGEON_MAX_FLOOR`로 다듬는다. */
function depthOf(floor: number): number {
  const value = Number(floor);
  return Math.max(1, Math.min(DUNGEON_MAX_FLOOR, Number.isFinite(value) ? Math.floor(value) : 1));
}

/** 그 층에서 처치가 남기는 금화 — 일반 층은 7마리 × (3 + 층), 보스 층은 70 × 층.
 *  금화 규칙(`3 + 층`·`70 × 층`)은 `progress.ts` 한 곳에 있다(PR-3) — 여기서는 그 층 몹 7마리 몫만 곱한다. */
export function dungeonKillGold(floor: number, boss = depthOf(floor) % 5 === 0): number {
  const depth = depthOf(floor);
  return boss ? killGold(depth, { boss: true }) : DUNGEON_KILLS_PER_FLOOR * killGold(depth);
}

/** 클리어할 때마다 주는 강화석 — 층수 비례. */
export const DUNGEON_STONES_PER_FLOOR = 2;
/** 최초 클리어에만 더하는 강화석 — 층마다 무거워진다. */
export const DUNGEON_FIRST_CLEAR_STONES = 10;
export const DUNGEON_FIRST_CLEAR_STONES_PER_FLOOR = 3;

/** 이 층을 처음 깨서 받는 강화석(층 비례분 + 최초 클리어 보너스). */
export function dungeonFirstClearStones(floor: number): number {
  const depth = depthOf(floor);
  return DUNGEON_FIRST_CLEAR_STONES + depth * DUNGEON_FIRST_CLEAR_STONES_PER_FLOOR;
}

/** 클리어 한 번에 들어오는 강화석. 최초 클리어면 층 비례분과 보너스를 함께 준다. */
export function dungeonClearStones(floor: number, firstClear = true): number {
  const depth = depthOf(floor);
  return depth * DUNGEON_STONES_PER_FLOOR + (firstClear ? dungeonFirstClearStones(depth) : 0);
}

/** 결과 화면과 로비가 함께 쓰는 보상 영수증. */
export type DungeonRewardReceipt = {
  floor: number;
  firstClear: boolean;
  /** 지급한 금화. */
  gold: number;
  /** 지급한 강화석(층 비례분 + 최초 클리어 보너스). */
  stones: number;
  /** 가방에 들어간 아이템. */
  items: Item[];
  /** 가방이 가득 차서 놓친 아이템 개수 — 40칸에는 타직업 스킬북·보물 주머니도 포함한다(내 직업 스킬북 제외, 작업 253). */
  missed: number;
  /** 접속 중 자동 분해가 가져간 장비의 환산량. */
  salvaged: { count: number; gold: number; stones: number };
};

/**
 * 클리어한 층의 보상을 계정 세이브에 지급한다.
 * `loot`는 `DungeonBattle.clearRewards()`가 돌려준 그 층의 금화·아이템이고, 이 함수는 clear일 때만
 * 불린다(실패·시간 초과에는 호출 자체가 없다).
 */
export function claimDungeonRewards(
  save: Save,
  floor: number,
  loot: { gold: number; items: readonly Item[] },
  options: { firstClear?: boolean; autoSalvage?: Exclude<Rarity, 'legendary'>; autoSalvagePlus?: number } = {}
): DungeonRewardReceipt {
  const depth = depthOf(floor);
  const firstClear = options.firstClear ?? depth > dungeonClearedFloor(save);
  const gold = Math.max(0, Math.floor(Number.isFinite(loot.gold) ? loot.gold : 0));
  const stones = dungeonClearStones(depth, firstClear);
  save.gold += gold;
  save.stones += stones;
  const items: Item[] = [];
  const salvaged = { count: 0, gold: 0, stones: 0 };
  let missed = 0;
  for (const item of loot.items) {
    // 접속 중 자동 분해 (작업 196) — 필드와 같은 규칙·같은 기준을 쓴다.
    if (options.autoSalvage) {
      const sweep = autoSalvageRecovered(save, item, options.autoSalvage, options.autoSalvagePlus);
      if (sweep) { salvaged.count++; salvaged.gold += sweep.gold; salvaged.stones += sweep.stones; continue; }
    }
    if (!canStoreItem(save.bag, item, jobOrDefault(save.job))) { missed++; continue; }
    save.bag.push(item);
    items.push(item);
  }
  return { floor: depth, firstClear, gold, stones, items, missed, salvaged };
}
