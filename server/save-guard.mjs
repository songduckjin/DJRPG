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
 * 이 파일은 `server/database.mjs`가 import하므로 **순수 JS**다. 진행 규칙(최고 층·경험치 곡선·층 목표·킬 금화)은
 * `src/game/progress.ts` 하나를 그대로 쓴다(PR-3, 작업 262) — 예전에는 같은 식을 여기에 옮겨 적고
 * `tests/save-guard.test.mjs`가 원본과 대조했지만, 이제 값이 갈라질 자리가 없다. `progress.ts`는 아무것도
 * import하지 않는 순수 모듈이라 서버 번들에 다른 게임 코드를 끌어들이지 않는다.
 */
import { extraOptionsWithin } from './extra-options.mjs';
import { BOSS_GOLD_PER_FLOOR, KILL_GOLD_BASE, MAX_FLOOR, MAX_LEVEL, expToNext, killsToBoss } from '../src/game/progress.ts';
import { spLedger } from '../src/game/skillPoints.ts';

export const MAX_OFFLINE_SECONDS = 43_200;
/** 초당 처치 상한. 실제 사냥은 스폰 간격(≥0.55초)과 18마리 상한 때문에 초당 2마리 안팎이고,
 *  스킬 한 방에 몰려 있던 적이 한꺼번에 죽는 순간을 감안해 크게 잡았다. */
export const KILLS_PER_SECOND = 6;
/** 한 창(window)에 기본으로 얹어 주는 처치 수 — 아레나에 이미 서 있는 적(최대 18마리)과 첫 저장·짧은 창의 여유분. */
export const KILLS_FLOOR = 60;
/** 아이템 생성 상한: 초당 0.5개 + 기본 40개. 보물 주머니를 연달아 열거나 공용창고 앞뒤로 저장이 몰려도
 *  정상 경로가 한 번에 40개까지 낳을 수 있어, 예전 기본값 8개로는 흔한 장면에서 오탐(`아이템 생성이 서버
 *  허용 범위를 넘었습니다`)이 났다(작업 245 — 가방 40칸이 상한이다). */
export const ITEMS_PER_SECOND = .5;
export const ITEMS_FLOOR = 40;
/** 금화·경험치 상한에 곱하는 안전 계수 — 자동 분해·보스 무더기 같은 정상 경로가 상한에 닿지 않게 한다. */
export const GOLD_HEADROOM = 2;
export const EXP_HEADROOM = 2;
/** `src/game/statBooks.ts`의 `STAT_BOOK_LIMIT`(파트 B: 종류별 캐릭터당 30권). */
export const STAT_BOOK_LIMIT = 30;
/** `src/game/items.ts`의 `rarityScales`. */
export const RARITY_SCALES = { common: 1, magic: 2, rare: 3, epic: 4, unique: 5, legendary: 6 };
/** 최고 층·최고 레벨·경험치 곡선은 `src/game/progress.ts`가 원본이다 — 기존 import 경로를 위해 여기서 재export한다. */
export { MAX_FLOOR, MAX_LEVEL, expToNext } from '../src/game/progress.ts';
/** `src/game/items.ts`의 `MAX_PLUS`·`PLUS_STAT_BONUS`. */
export const MAX_PLUS = 7;
export const PLUS_STAT_BONUS = .08;
/**
 * 슬롯별 티어 보정의 최대치 — **작업 255 이전** 공식(`Math.ceil(tier * (무기 .6 / 그 외 .4))`)의
 * 최고 티어 값(`src/game/items.ts` `maxTierBonus`와 같다). 새 드롭은 티어당 +3.5%(`TIER_STAT_GROWTH`)를
 * 쓰므로, 이 표는 `itemWithinBounds`에서 **옛 장비 여유분**과 테스트 대조에만 쓴다.
 */
export const TIER_BONUS_MAX = {
  weapon: 6, offhand: 2, helmet: 4, armor: 4, necklace: 2,
  gloves: 4, belt: 4, boots: 4, ring1: 2, ring2: 2
};
/** `src/game/items.ts`의 `TIER_STAT_GROWTH` — 티어 한 단계당 +3.5%. */
export const TIER_STAT_GROWTH = .035;
/**
 * 슬롯별 능력치 배율의 **최댓값**(작업 255) — `src/game/items.ts`의 `maxSlotProfileTable` 사본이다.
 * 직업별 무기·투구·갑옷 표를 모두 훑어 능력치마다 가장 큰 값을 골랐다. 어떤 직업의 드롭이든 이 상한
 * 안에 들어오므로, 서버는 아이템의 직업을 몰라도 능력치 위조를 걸러낼 수 있다.
 */
export const MAX_SLOT_PROFILES = {
  weapon: { attack: 1.18, defense: .25, health: 1.30, crit: 1.35, speed: .85 },
  offhand: { attack: .15, defense: 1.00, health: 2.40, crit: .80, speed: .70 },
  helmet: { attack: .04, defense: 1.32, health: 4.80, crit: .60, speed: .45 },
  armor: { attack: .06, defense: 1.60, health: 5.30, crit: .55, speed: .40 },
  necklace: { attack: .35, defense: .20, health: 1.30, crit: 1.25, speed: .90 },
  gloves: { attack: .60, defense: .25, health: 1.10, crit: .95, speed: 1.50 },
  belt: { attack: .10, defense: .60, health: 2.80, crit: .60, speed: .50 },
  boots: { attack: .05, defense: .40, health: 1.40, crit: .75, speed: 1.85 },
  ring1: { attack: .35, defense: .15, health: 1.20, crit: 1.15, speed: .95 },
  ring2: { attack: .35, defense: .15, health: 1.20, crit: 1.15, speed: .95 }
};
/** 강화가 붙기 전 스탯의 여유분 — 드롭마다 붙는 무작위 1~3(`Math.ceil(Math.random()*3)`)과 반올림. */
const STAT_SLACK = 4;
/** 예전 공식으로 만들어진 장비(작업 194 이전 세이브)도 통과하도록 남기는 배율 여유. */
export const STAT_TOLERANCE = 2.5;

/** `src/game/progress.ts`의 `killsToBoss`(작업 204: 1층 150마리, 20층 3,505마리) — 예전 이름은 `floorKillTarget`. */
export function floorKillTarget(floor) { return killsToBoss(floor); }

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
/**
 * 한 저장 창에서 서버가 인정하는 최대 변화량. 모든 값은 `previous`(서버가 들고 있던 세이브)에 더해 쓴다.
 *
 * `depthOption`은 금화·경험치를 계산할 층이다. 비워 두면 `previous`의 최고 층을 쓴다. 오프라인 정산도
 * 보스를 잡아 층을 올리므로(작업 235), 등반이 서버 검증을 통과한 뒤에는 **그 층 값으로** 다시 계산해
 * 정당한 보상이 클램프로 깎이지 않게 한다.
 */
export function rewardBudget(previous, elapsedSeconds, depthOption) {
  const elapsed = Math.max(0, Math.min(MAX_OFFLINE_SECONDS, finite(elapsedSeconds, 0)));
  const kills = Math.ceil(KILLS_FLOOR + KILLS_PER_SECOND * elapsed);
  // 보스는 한 층에 floorKillTarget마리(1층 120마리)를 잡아야 나오므로, 처치 수 대비 아주 넉넉히 잡는다.
  const bosses = Math.ceil(kills / 30) + 1;
  const depth = Math.max(1, Math.min(MAX_FLOOR, int(depthOption ?? previous?.maxFloor ?? previous?.floor ?? 1, 1)));
  const killGold = (kills * (KILL_GOLD_BASE + depth) + bosses * BOSS_GOLD_PER_FLOOR * depth) * GOLD_HEADROOM + 1000;
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

  // 도달 층은 보스 처치로만 오른다(보스 1마리 = 1층). 마지막 층(`MAX_FLOOR`)이 상한이다.
  const floorCap = Math.min(MAX_FLOOR, Math.max(1, int(previous.maxFloor ?? previous.floor ?? 1, 1)) + Math.max(0, cap(save.bossKills) - cap(previous.bossKills)));
  if (cap(save.maxFloor) > floorCap) { save.maxFloor = floorCap; clamped.push('maxFloor'); }
  if (cap(save.floor) > Math.max(1, cap(save.maxFloor))) { save.floor = Math.max(1, cap(save.maxFloor)); clamped.push('floor'); }
  if (cap(save.floorKills) > floorKillTarget(cap(save.floor))) { save.floorKills = floorKillTarget(cap(save.floor)); clamped.push('floorKills'); }

  // 오프라인 등반(작업 235): 보스를 잡아 올라간 층은 그 층의 킬당 금화·보스 금화로 정산된다.
  // 위에서 서버가 인정한 층(`save.maxFloor`)까지만 값을 올려 잡는다 — 시작 층보다 낮아지지 않는다.
  const depth = Math.max(budget.depth, Math.min(MAX_FLOOR, cap(save.maxFloor) || 1));
  const payout = depth > budget.depth ? rewardBudget(previous, options.elapsedSeconds, depth) : budget;

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
  const goldCap = cap(previous.gold) + payout.gold + Math.max(0, cap(options.goldCredit));
  if (cap(save.gold) > goldCap) { save.gold = goldCap; clamped.push('gold'); }
  const stoneCap = cap(previous.stones) + budget.stones + Math.max(0, cap(options.stoneCredit));
  if (cap(save.stones) > stoneCap) { save.stones = stoneCap; clamped.push('stones'); }
  // (`payout.stones`는 `budget.stones`와 같은 값이다 — 강화석은 층과 무관하다.)

  // 영구 스탯북(파트 B) — 종류별 0~30 정수만 저장하고, 한 저장에서 늘릴 수 있는 양은 **직전 세이브 가방에
  // 있던 그 종류의 책 수**까지다(사용하면 가방에서 사라지고 그 종류가 1 오른다). 이미 쓴 권수는 줄이지 않는다
  // — 사라진 보너스는 되돌릴 수 없고, 클라이언트가 값을 빼고 보내도 잃지 않아야 한다.
  const previousBooks = previous?.statBooks && typeof previous.statBooks === 'object' ? previous.statBooks : {};
  const bagBooks = new Map();
  for (const item of Array.isArray(previous?.bag) ? previous.bag : []) {
    if (item && item.kind === 'statbook' && typeof item.book === 'string') bagBooks.set(item.book, (bagBooks.get(item.book) ?? 0) + 1);
  }
  const incomingBooks = save.statBooks && typeof save.statBooks === 'object' ? save.statBooks : {};
  const nextBooks = {};
  for (const kind of ['attack', 'defense', 'health']) {
    const prior = Math.max(0, Math.min(STAT_BOOK_LIMIT, Math.floor(finite(previousBooks[kind], 0))));
    const budget = Math.min(STAT_BOOK_LIMIT, prior + (bagBooks.get(kind) ?? 0));
    const wanted = Math.max(0, Math.min(STAT_BOOK_LIMIT, Math.floor(finite(incomingBooks[kind], prior))));
    nextBooks[kind] = Math.max(prior, Math.min(budget, wanted));
    if (nextBooks[kind] !== wanted) clamped.push(`statBooks.${kind}`);
  }
  save.statBooks = nextBooks;

  // 스킬 포인트는 레벨업으로만 쌓인다 — 레벨당 3pt(첫 1랭크는 무료 지급분), 쓴 랭크만큼 빼고 남은 것이 상한이다.
  // 식은 `src/game/skillPoints.ts` 한 곳에 있고 화면도 같은 것을 쓴다(4단계 스킬 트리, 파트 A).
  const pointCap = spLedger({ level: int(save.level, 1), learned: save.learned, passives: save.passives, skillLevels: save.skillLevels }).available;
  if (cap(save.skillPoints) > pointCap) { save.skillPoints = pointCap; clamped.push('skillPoints'); }

  // 던전 최고층은 서버가 검증한 기록(+1)까지만 저장된다 — 순위의 근거라 클라이언트가 올릴 수 없다.
  const previousFloor = Math.max(0, Math.min(10, int(previous.dungeonFloor)));
  const verified = options.dungeonFloorCap === undefined ? undefined : Math.max(0, Math.min(10, int(options.dungeonFloorCap)));
  const dungeonCap = verified === undefined ? Math.min(10, previousFloor + (options.allowDungeonClaim === false ? 0 : 1)) : Math.min(10, verified + 1);
  if (cap(save.dungeonFloor) > dungeonCap) { save.dungeonFloor = dungeonCap; clamped.push('dungeonFloor'); }
  const now = Date.now();
  if (cap(save.dungeonClearAt) > now) { save.dungeonClearAt = now; clamped.push('dungeonClearAt'); }

  if (cap(save.tutorial) > 3) { save.tutorial = 3; clamped.push('tutorial'); }
  return { clamped, budget: payout };
}

/** `src/game/items.ts`의 `GEAR_CRIT_UNIT`·`GEAR_SPEED_UNIT`·`CDR_GEAR_PROFILE`(밸런스 v2). */
export const GEAR_SECONDARY_UNIT = { crit: .70, speed: .72 };
export const CDR_GEAR_MAX = 1.8;
/** `src/game/extraOptions.ts`의 상한(밸런스 v2) — 저장된 장비의 추가옵션 합산이 넘을 수 없는 값. */
export const EXTRA_CDR_CAP = 6;
export const EXTRA_CRIT_CAP = 10;
export const EXTRA_SPEED_CAP = 10;
export const EXTRA_LIFESTEAL_CAP = 5;
/**
 * 새로 만들어지는 아이템(소유 기록이 없는 id)의 능력치가 `rollItem` 공식의 상한 안에 있는지.
 * 기존 보유 아이템은 `identity` 대조가 이미 맡으므로 여기서 보지 않는다.
 */
export function itemWithinBounds(item, maxFloor = 1, tolerance = STAT_TOLERANCE) {
  if (!item || typeof item !== 'object') return false;
  // 영구 스탯북(파트 B)·보물 주머니(작업 207)는 능력치가 없다 — 상한 검사는 장비에만 의미가 있다.
  if (item.kind === 'statbook' || item.slot === 'statbook') return true;
  if (item.kind === 'pouch' || item.slot === 'pouch') return true;
  const scale = RARITY_SCALES[item.rarity];
  const profile = MAX_SLOT_PROFILES[item.slot];
  if (!scale || !profile) return false;
  const depth = Math.max(1, Math.min(500, int(maxFloor, 1)));
  const baseScale = (1 + Math.floor(depth / 2)) * scale;
  // 새 드롭(작업 255)은 티어 계수(최고 티어 +31.5%)를 모든 스탯에 곱한다 — 가장 큰 티어를 가정한다.
  const topTier = 1 + TIER_STAT_GROWTH * 9;
  const scaled = baseScale * Math.max(1, topTier);
  const factor = 1 + Math.max(0, Math.min(MAX_PLUS, int(item.plus))) * PLUS_STAT_BONUS;
  const zwei = /쯔바이핸드|츠바이핸더/.test(String(item.name ?? ''));
  // 주 스탯에는 무작위 1~3이 붙는다 — 어느 쪽이 주 스탯인지 서버는 모르므로 양쪽에 3을 얹어 둔다.
  const next = {
    attack: Math.round(profile.attack * scaled) + 3 + (zwei ? 2 : 0),
    defense: Math.round(profile.defense * scaled) + 3,
    health: Math.round(profile.health * scaled),
    // 치명·공속은 층·강화와 무관한 새 척도(밸런스 v2) — 등급·티어로만 만든다.
    crit: Math.round(profile.crit * scale * Math.max(1, topTier) * GEAR_SECONDARY_UNIT.crit) + (zwei ? 1 : 0),
    speed: Math.round(profile.speed * scale * Math.max(1, topTier) * GEAR_SECONDARY_UNIT.speed),
    // 스킬 쿨타임 감소(밸런스 v2): 마법사 전용 부위(지팡이·모자·로브)에만 붙는다. 서버는 직업을 모르므로
    // 가장 큰 계수(지팡이 1.8)로 연다.
    cdr: Math.round(CDR_GEAR_MAX * scale * Math.max(1, topTier))
  };
  // 옛 공식(작업 255 이전)으로 만들어진 장비도 통과해야 하므로, 능력치마다 두 공식 중 **큰 쪽**을 쓴다.
  const legacy = legacyStatLimits(item, baseScale, zwei);
  const limits = Object.fromEntries(Object.keys(next).map(stat => [stat, Math.max(next[stat], legacy[stat] ?? 0)]));
  for (const [stat, value] of Object.entries(item.stats ?? {})) {
    const allowed = limits[stat];
    if (allowed === undefined) return false;
    const ceiling = Math.ceil((allowed + STAT_SLACK) * factor * tolerance) + 2;
    if (!Number.isFinite(value) || value < 0 || value > ceiling) return false;
  }
  // 추가옵션(작업 238): 등급별 1/2/3개·허용 키 9종·1~3% 정수만 통과한다. 스탯과 달리 상한 계산이
  // 필요 없다 — 값 자체가 1~3%로 고정이고, 서버는 저장 전에 id로 다시 계산해 덮어쓴다.
  if (!extraOptionsWithin(item)) return false;
  return true;
}

/**
 * 장비의 2차 스탯(치명·공속·쿨감)이 가질 수 있는 **가장 큰 정상값**(밸런스 v2).
 *
 * 서버는 장비의 티어를 이름으로 풀어내지 않는다. 대신 서버가 아는 것(부위·등급)으로 **최고 티어를 가정한**
 * 상한만 계산한다. 옛 장비(치명 800%)를 새 척도로 1회 바꿔 넣는 마이그레이션(`server/db/items.mjs`)이
 * 이 상한 안의 값만 받아 주고, 그 뒤로는 서버 사본과 정확히 같아야 한다(변조 차단).
 */
export function secondaryStatCeiling(item) {
  const scale = RARITY_SCALES[item?.rarity];
  const profile = MAX_SLOT_PROFILES[item?.slot];
  if (!scale || !profile) return undefined;
  const topTier = 1 + TIER_STAT_GROWTH * 9;
  return {
    crit: Math.ceil(profile.crit * scale * topTier * GEAR_SECONDARY_UNIT.crit) + 1,
    speed: Math.ceil(profile.speed * scale * topTier * GEAR_SECONDARY_UNIT.speed) + 1,
    cdr: Math.ceil(CDR_GEAR_MAX * scale * topTier) + 1
  };
}

/** 작업 255 이전 공식의 능력치 상한 — 옛 세이브의 장비(스탯이 예전 표대로 큼)를 지우지 않기 위해 남긴다. */
function legacyStatLimits(item, baseScale, zwei) {
  const tierBonus = TIER_BONUS_MAX[item.slot] ?? 0;
  const primary = ['weapon', 'ring1', 'ring2', 'gloves'].includes(item.slot) ? 'attack' : 'defense';
  const limits = {
    [primary]: baseScale + 3 + tierBonus,
    health: 3 * baseScale,
    crit: baseScale + (zwei ? Math.ceil(baseScale * .5) : 0),
    speed: baseScale,
    attack: primary === 'attack' ? baseScale + 3 + tierBonus + (zwei ? 2 + Math.ceil(baseScale * .25) : 0) : (zwei ? 2 : 0)
  };
  return limits;
}
