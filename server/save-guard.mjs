/**
 * 저장 검증 경계 (작업 209).
 *
 * 세이브 본문은 여전히 클라이언트가 만든 것이지만, 이 모듈이 **서버가 아는 것만으로 계산한 상한**을
 * 넘는 값만 잘라낸다. 정상 플레이는 상한 아래에 있으므로 값이 그대로 통과하고, 저장 형식·API·에러 코드는
 * 바뀌지 않는다(거부 대신 클램프 → 정상 보상이 사라지지 않는다).
 *
 * 상한의 근거는 두 가지다.
 *  ① 마지막 저장 이후 **서버 시계로 흐른 시간**(`elapsedSince`). 클라이언트가 아무리 빨리 사냥해도 이 시간보다
 *     많은 킬을 할 수 없고, 오프라인 정산도 이 시간 안에서만 일어난다(최대 12시간).
 *  ② **층·직업 규칙**(킬당 금화·경험치, 층 클리어에 필요한 킬 수, 드롭 공식).
 *
 * 이 파일은 `server/database.mjs`가 import하므로 **순수 JS**로 둔다 — `scripts/migrate-turso-db.mjs`처럼
 * ts 로더 없이 `node`로 도는 스크립트가 DB 모듈을 그대로 쓰기 때문이다. 아래 상수는 `src/game/`의 값을
 * 옮겨 적은 것이고, `tests/save-guard.test.mjs`가 원본과 같은지 대조한다(값이 갈라지면 테스트가 먼저 깨진다).
 */

export const MAX_OFFLINE_SECONDS = 43_200;
/** 초당 처치 상한. 실제 사냥은 스폰 간격(≥0.55초)과 18마리 상한 때문에 초당 2마리 안팎이고,
 *  스킬 한 방에 몰려 있던 적이 한꺼번에 죽는 순간을 감안해 크게 잡았다. */
export const KILLS_PER_SECOND = 6;
/** 한 창(window)에 기본으로 얹어 주는 처치 수 — 아레나에 이미 서 있는 적(최대 18마리)과 첫 저장·짧은 창의 여유분. */
export const KILLS_FLOOR = 60;
/** 아이템 생성 상한: 초당 0.5개 + 기본 8개. 정상 드롭률(78층 기준 초당 0.07개 안팎)의 7배 남짓이다. */
export const ITEMS_PER_SECOND = .5;
export const ITEMS_FLOOR = 8;
/** 금화·경험치 상한에 곱하는 안전 계수 — 자동 분해·보스 무더기 같은 정상 경로가 상한에 닿지 않게 한다. */
export const GOLD_HEADROOM = 2;
export const EXP_HEADROOM = 2;
/** `src/game/items.ts`의 `rarityScales`. */
export const RARITY_SCALES = { common: 1, magic: 2, rare: 3, epic: 4, unique: 5, legendary: 6 };
/** `src/game/store.ts`의 `MAX_LEVEL`. */
export const MAX_LEVEL = 30;
/** `src/game/items.ts`의 `MAX_PLUS`·`PLUS_STAT_BONUS`. */
export const MAX_PLUS = 7;
export const PLUS_STAT_BONUS = .08;
/**
 * 슬롯별 티어 보정의 최대치 — `rollItem`의 `Math.ceil(tier * (무기 .6 / 그 외 .4))`에 그 슬롯의
 * 최고 티어를 넣은 값(`src/game/items.ts` `maxTierBonus`와 같다). 10티어 슬롯은 6/4, 5티어 슬롯은 2.
 */
export const TIER_BONUS_MAX = {
  weapon: 6, offhand: 2, helmet: 4, armor: 4, necklace: 2,
  gloves: 4, belt: 4, boots: 4, ring1: 2, ring2: 2
};
/** 강화가 붙기 전 스탯의 여유분 — 드롭마다 붙는 무작위 1~3(`Math.ceil(Math.random()*3)`)과 반올림. */
const STAT_SLACK = 4;
/** 예전 공식으로 만들어진 장비(작업 194 이전 세이브)도 통과하도록 남기는 배율 여유. */
export const STAT_TOLERANCE = 2.5;

/** `src/game/store.ts`의 `expToNext`(작업 207 사용자 확정 곡선 `1400 × level²`). */
export function expToNext(level) { return Math.round(1400 * Math.pow(level, 2)); }
/** `src/game/store.ts`의 `floorKillTarget`(작업 204: 1층 150마리, 20층 3,505마리). */
export function floorKillTarget(floor) { const depth = Math.max(0, floor - 1); return 150 + 55 * depth + Math.round(Math.pow(depth, 2) * 6.4); }

/** 마지막 저장 이후 서버 시계로 흐른 초. 값이 없거나 깨졌으면 0. */
export function elapsedSince(updatedAt, now = Date.now()) {
  const at = Date.parse(String(updatedAt ?? ''));
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, Math.min(MAX_OFFLINE_SECONDS, Math.floor((now - at) / 1000)));
}

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const int = (value, fallback = 0) => Number.isSafeInteger(value) ? value : Math.floor(finite(value, fallback));

/**
 * 한 저장 창에서 서버가 인정하는 최대 변화량. 모든 값은 `previous`(서버가 들고 있던 세이브)에 더해 쓴다.
 */
export function rewardBudget(previous, elapsedSeconds) {
  const elapsed = Math.max(0, Math.min(MAX_OFFLINE_SECONDS, finite(elapsedSeconds, 0)));
  const kills = Math.ceil(KILLS_FLOOR + KILLS_PER_SECOND * elapsed);
  // 보스는 한 층에 floorKillTarget마리(1층 120마리)를 잡아야 나오므로, 처치 수 대비 아주 넉넉히 잡는다.
  const bosses = Math.ceil(kills / 30) + 1;
  const depth = Math.max(1, Math.min(500, int(previous?.maxFloor ?? previous?.floor ?? 1, 1)));
  const killGold = (kills * (3 + depth) + bosses * 70 * depth) * GOLD_HEADROOM + 1000;
  return {
    elapsed, kills, bosses, depth,
    // 오프라인 정산은 킬당 8(보스 45) 경험치다 — 보스 쪽으로 넉넉히 잡는다.
    exp: kills * 45 * EXP_HEADROOM,
    gold: killGold,
    // 아이템 회수(자동 분해 포함)로 늘 수 있는 강화석: 장비 하나에 최대 5개.
    stones: Math.ceil(kills * .2) + 5,
    items: Math.ceil(ITEMS_FLOOR + ITEMS_PER_SECOND * elapsed)
  };
}

/**
 * 이번 세이브가 서버 상한 안에 있도록 **넘치는 값만** 잘라낸다.
 * `previous`는 서버가 들고 있던 세이브(`row.save`), `save`는 들어온 세이브(그 자리에서 수정된다).
 *
 * `options.goldCredit`/`stoneCredit`: 서버가 같은 트랜잭션에서 정당하게 더해 준 양(거래소 판매대금·
 * 우편 보상). `options.dungeonFloorCap`: 서버가 검증한 던전 최고층(없으면 이번 저장에서 한 층까지만).
 */
export function clampSaveProgress(previous, save, options = {}) {
  const clamped = [];
  const budget = rewardBudget(previous, options.elapsedSeconds);
  const cap = value => Math.max(0, Math.floor(finite(value, 0)));

  // 처치·보스·플레이 시간: 서버가 아는 시간 안에서만 늘어난다.
  const killsCap = cap(previous.kills) + budget.kills;
  if (cap(save.kills) > killsCap) { save.kills = killsCap; clamped.push('kills'); }
  const bossCap = cap(previous.bossKills) + budget.bosses;
  if (cap(save.bossKills) > bossCap) { save.bossKills = bossCap; clamped.push('bossKills'); }
  const secondsCap = finite(previous.playSeconds) + budget.elapsed + 5;
  if (finite(save.playSeconds) > secondsCap) { save.playSeconds = secondsCap; clamped.push('playSeconds'); }

  // 도달 층은 보스 처치로만 오른다(보스 1마리 = 1층).
  const floorCap = Math.max(1, int(previous.maxFloor ?? previous.floor ?? 1, 1)) + Math.max(0, cap(save.bossKills) - cap(previous.bossKills));
  if (cap(save.maxFloor) > floorCap) { save.maxFloor = floorCap; clamped.push('maxFloor'); }
  if (cap(save.floor) > Math.max(1, cap(save.maxFloor))) { save.floor = Math.max(1, cap(save.maxFloor)); clamped.push('floor'); }
  if (cap(save.floorKills) > floorKillTarget(cap(save.floor))) { save.floorKills = floorKillTarget(cap(save.floor)); clamped.push('floorKills'); }

  // 레벨·경험치: 같은 창의 경험치 상한을 실제 성장식에 넣어 본 결과까지만 인정한다.
  const grown = { level: Math.max(1, Math.min(MAX_LEVEL, int(previous.level, 1))), exp: Math.max(0, finite(previous.exp)) };
  let remaining = budget.exp;
  while (grown.level < MAX_LEVEL) {
    const need = Math.max(0, expToNext(grown.level) - grown.exp);
    if (remaining < need) break;
    remaining -= need; grown.level++; grown.exp = 0;
  }
  grown.exp += remaining;
  if (grown.level >= MAX_LEVEL) grown.exp = 0;
  const level = int(save.level, 1);
  if (level > grown.level) { save.level = grown.level; save.exp = grown.exp; clamped.push('level'); }
  else if (level === grown.level && finite(save.exp) > grown.exp) { save.exp = grown.exp; clamped.push('exp'); }

  // 금화·강화석: 처치 보상 + 서버가 같은 요청에서 준 몫까지만.
  const goldCap = cap(previous.gold) + budget.gold + Math.max(0, cap(options.goldCredit));
  if (cap(save.gold) > goldCap) { save.gold = goldCap; clamped.push('gold'); }
  const stoneCap = cap(previous.stones) + budget.stones + Math.max(0, cap(options.stoneCredit));
  if (cap(save.stones) > stoneCap) { save.stones = stoneCap; clamped.push('stones'); }

  // 스킬 포인트는 레벨업으로만 쌓인다 — 찍은 만큼을 뺀 나머지가 상한이다.
  const invested = Object.values(save.skillLevels ?? {}).reduce((sum, rank) => sum + Math.max(0, cap(rank) - 1), 0);
  const pointCap = Math.max(0, int(save.level, 1) - 1 - invested);
  if (cap(save.skillPoints) > pointCap) { save.skillPoints = pointCap; clamped.push('skillPoints'); }

  // 던전 최고층은 서버가 검증한 기록(+1)까지만 저장된다 — 순위의 근거라 클라이언트가 올릴 수 없다.
  const previousFloor = Math.max(0, Math.min(10, int(previous.dungeonFloor)));
  const verified = options.dungeonFloorCap === undefined ? undefined : Math.max(0, Math.min(10, int(options.dungeonFloorCap)));
  const dungeonCap = verified === undefined ? Math.min(10, previousFloor + (options.allowDungeonClaim === false ? 0 : 1)) : Math.min(10, verified + 1);
  if (cap(save.dungeonFloor) > dungeonCap) { save.dungeonFloor = dungeonCap; clamped.push('dungeonFloor'); }
  const now = Date.now();
  if (cap(save.dungeonClearAt) > now) { save.dungeonClearAt = now; clamped.push('dungeonClearAt'); }

  if (cap(save.tutorial) > 3) { save.tutorial = 3; clamped.push('tutorial'); }
  return { clamped, budget };
}

/**
 * 새로 만들어지는 아이템(소유 기록이 없는 id)의 능력치가 `rollItem` 공식의 상한 안에 있는지.
 * 기존 보유 아이템은 `identity` 대조가 이미 맡으므로 여기서 보지 않는다.
 */
export function itemWithinBounds(item, maxFloor = 1, tolerance = STAT_TOLERANCE) {
  if (!item || typeof item !== 'object') return false;
  // 스킬북·보물 주머니(작업 207)는 능력치가 없다 — 상한 검사는 장비에만 의미가 있다.
  if (item.kind === 'skillbook' || item.slot === 'skillbook') return true;
  if (item.kind === 'pouch' || item.slot === 'pouch') return true;
  const scale = RARITY_SCALES[item.rarity];
  const tierBonus = TIER_BONUS_MAX[item.slot];
  if (!scale || tierBonus === undefined) return false;
  const depth = Math.max(1, Math.min(500, int(maxFloor, 1)));
  const baseScale = (1 + Math.floor(depth / 2)) * scale;
  const factor = 1 + Math.max(0, Math.min(MAX_PLUS, int(item.plus))) * PLUS_STAT_BONUS;
  const primary = ['weapon', 'ring1', 'ring2', 'gloves'].includes(item.slot) ? 'attack' : 'defense';
  const zwei = /쯔바이핸드|츠바이핸더/.test(String(item.name ?? ''));
  const limits = {
    [primary]: baseScale + 3 + tierBonus,
    health: 3 * baseScale,
    crit: baseScale + (zwei ? Math.ceil(baseScale * .5) : 0),
    speed: baseScale,
    // 쯔바이핸드는 공격에도 보정이 붙는다.
    attack: primary === 'attack' ? baseScale + 3 + tierBonus + (zwei ? 2 + Math.ceil(baseScale * .25) : 0) : 0
  };
  for (const [stat, value] of Object.entries(item.stats ?? {})) {
    const allowed = limits[stat];
    if (allowed === undefined) return false;
    const ceiling = Math.ceil((allowed + STAT_SLACK) * factor * tolerance) + 2;
    if (!Number.isFinite(value) || value < 0 || value > ceiling) return false;
  }
  return true;
}
