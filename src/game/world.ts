import { canStoreItem } from './bagCapacity';
import { bossGoldPiles, bossGoldSpot } from './bossLoot';
import { addExperience, floorKillTarget, MAX_FLOOR, rollItem, skillLevel, totalStats, type Item, type Rarity, type Save } from './store';
import { itemDisplayName, itemDropChance, rollItemKind, rollSkillBook, starterWeaponName } from './items';
import { dragonOrbitFactor, skillDamageScale, skillDuration, skillRange, skills, slash2Hits, slash2SwingSeconds, type Job, type SkillId } from './skills';
import { jobOrDefault } from './skills';
import { clampArenaPoint, clampFieldPoint, fieldSpawnBand, spawnArenaEnemy } from './arena';
import { LOOT_ABSORB_SECONDS, LOOT_REST_SECONDS } from './loot';
import { autoSalvageBlock, autoSalvageRecovered, sweepBagOnFull } from './inventory';
import { random } from './rng';
import { EXTRA_LIFESTEAL_HIT_CAP, EXTRA_REGEN_SECONDS, effectiveExtraOptions } from './extraOptions';

export type Enemy = { x: number; y: number; hp: number; maxHp: number; boss: boolean; hit: number; step: number; moving: boolean; knockX: number; knockY: number; slow: number;
  /** 정예 몹(작업 206) — 일반 몹 30마리마다 한 마리. 보스 타이밍이 오면 보스가 우선이라 둘은 같이 서지 않는다. */
  elite?: boolean;
  /** 적 공격 모션(작업 245) — 남은 재생 시간. 0보다 크면 플레이어 쪽으로 내딛으며 때린다. */
  attack?: number };
/** `absorb` is the age the pull into the character began at; while it is unset the drop still rests
 *  where it fell (`LOOT_REST_SECONDS`). Without that mark the renderer cannot tell a drop held back
 *  by a full bag from one already on its way in. */
export type Drop = { x: number; y: number; item: Item; age: number; warned: boolean; absorb?: number };
/** The coin a kill leaves behind. Its gold is already in `save.gold` (granted at the kill, as
 *  before); the coin itself is only what the field draws for a beat before it flies to the hero.
 *  `from` is the body a boss heap was thrown from (작업 196), so the field can fly it out on its own
 *  arc instead of dropping it where it appears. */
export type Coin = { x: number; y: number; age: number; gold: number; from?: { x: number; y: number } };
export type Effect = { x: number; y: number; kind: 'slash' | 'slash2' | 'spin' | 'crushing' | 'slam' | 'warcry' | 'power' | 'destroy' | 'hell' | 'hit' | 'death'
  /** 추가옵션(작업 238)의 피드백 — `evade`는 회피(피해 없음), `heal`은 피흡·5초 회복으로 찬 체력이다.
   *  둘 다 그림 없이 숫자·글자만 띄운다(`render/vfx.ts` `updateDamageLabels`). */
  | 'heal' | 'evade'
  /** 적의 공격이 플레이어에게 닿은 순간(작업 245) — 할퀴는 궤적과 잃은 체력 숫자를 띄운다. */
  | 'enemyStrike'
  | 'shot' | 'rain' | 'hawk' | 'burst' | 'nova' | 'ward'; age: number; duration: number; angle: number; swing?: number; amount?: number; nextHit?: number; power?: number; level?: number;
  /** 치명타로 들어간 타격(작업 245) — 피해 숫자를 크게·금빛으로 띄운다. */
  crit?: boolean;
  /** 이단참(작업 213)처럼 한 번 발동에 여러 번 때리는 스킬의 지금까지 들어간 타격 수. */
  hits?: number;
  /** 궁수 화살·화살비처럼 날아가서 맞는 이펙트의 도착지점과 위력(작업 157). */
  tx?: number; ty?: number; radius?: number; targets?: number; slow?: number; variant?: ArrowVariant; fired?: boolean;
  /** 화살이 쫓아가는 적(살아 있는 동안 도착지를 갱신한다). 없으면 발사 시점의 지점으로 날아간다. */
  aim?: Enemy;
  /** 발사까지 머무는 시간(초, 작업 216) — 파이어 볼트 화염구가 머리 위에 떠 있다가 날아간다.
   *  `delay`와 달리 이 시간 동안은 제자리에 있다가 남은 시간(duration−launch) 동안만 날아간다. */
  launch?: number;
  /** 탄 크기 배율(작업 216) — 파이어 볼트 화염구는 스킬 레벨이 오를수록 커진다. */
  size?: number;
  /** 이 이펙트를 만든 스킬(스킬 버튼 피드백용). 평타면 없다. */
  source?: SkillId;
  /** 딜레이 크러싱(작업 212) 타격 간격 — 연출이 그 간격마다 한 번씩 내리친다. */
  strikeInterval?: number;
  /** 타격 숫자(`hit`)를 기본 자리에서 옮길 오프셋 — 10연타 숫자가 한 점에 겹치지 않게 한다(작업 212). */
  labelOffsetX?: number; labelOffsetY?: number };
/** 딜레이 크러싱이 한 타마다 남기는 잔상 한 점(작업 212).
 *  렌더러는 이 기록 하나당 본체·장비 레이어 한 벌을 복제해 본체보다 낮은 불투명도로 뒤에 그린다. */
export type HeroAfterimage = {
  x: number; y: number; age: number; duration: number;
  /** 본체보다 낮은 불투명도 — 0.42에서 0.14까지 타마다 계단식으로 내려간다. */
  alpha: number;
  /** 그 타격 순간의 좌우 반전(잔상이 본체와 같은 방향을 본다). */
  facingSide: number;
  /** 이만큼 지난 뒤의 공격 자세를 복제한다 — 스윙 중간 실루엣이 남도록. */
  capture: number };
/** 딜레이 크러싱 10연타(작업 212) — 붉은보석1식으로, 한 번에 한 타가 아니라 짧은 간격으로 10번 따로 판정한다. */
export const crushHits = 10;
/** 타격 간격. 10타가 0.558초에 끝나 요청한 0.55~0.65초 안에 들어온다. */
export const crushInterval = .062;
/** 한 타가 재생하는 공격 동작 길이 — 평타(0.32초)의 1/5로 attack 4프레임을 빠르게 한 번 넘긴다. */
export const crushPoseSpan = .062;
/** 잔상이 남아 있는 시간 — 마지막 타가 끝나고 약 0.3초 뒤 모두 사라진다. */
export const crushTrailLife = .3;
export type ArrowVariant = 'normal' | 'ice' | 'pierce' | 'snipe' | 'volley' | 'arcane' | 'fire' | 'frost' | 'chain' | 'meteor';
export type Action = 'attack' | SkillId;
/** 적 공격 모션 길이(작업 245) — 이 시간 동안 적이 플레이어 쪽으로 내딛고, 끝나면 제자리로 돌아온다. */
export const ENEMY_STRIKE_SECONDS = .42;
/** 전사 평타의 사거리(월드 단위) — 전사는 이 거리 안의 적을 벤다. */
export const WARRIOR_ATTACK_RANGE = 90;
/** 몬스터의 공격 사거리(작업 254) — **전사 평타와 같은 90**으로 통일했다.
 *
 *  종전에는 적이 히어로 몸에 닿아야(35) 때렸다. 그래서 전사는 90에서 일방적으로 벨 수 있었고
 *  적은 몸이 닿아야 반격했다. 이제 적도 **90 안이면 때린다** — 히어로가 벨 수 있는 자리에서
 *  곧바로 반격을 받는다(맞사거리가 양쪽 모두 90). 던전도 같은 상수를 쓴다
 *  (`ui/dungeonBattle.ts`의 0.9초 피격). */
export const ENEMY_ATTACK_RANGE = WARRIOR_ATTACK_RANGE;
/** 몬스터가 서는(걷기를 멈추는) 거리 — 공격 사거리(90)보다 **안쪽인 60**이다(작업 254).
 *
 *  서는 자리를 사거리와 똑같이 90으로 두면, 히어로의 평타가 적을 16유닛 밀어내는 넉백 때문에
 *  적이 매 타격마다 사거리 밖으로 튕겨 나가고 히어로가 다시 걸어 들어가야 한다 — 때리고 걷고를
 *  반복하는 딸꾹질이 된다. 60은 ① 그 16유닛을 밀려도 76이라 사거리(90) 안에 남고 ② 서기는
 *  화면에서 약 57px(적·히어로 몹 높이 66px 안팎)라 몸이 겹치지 않으면서 공격 모션의 16px
 *  내딛기(보스 26px)가 닿는 자리다. 예전 정지 거리는 27이었다 — 적이 히어로 몸 위에 올라서
 *  여러 마리가 한 점에 겹쳤다. */
export const ENEMY_STOP_RANGE = 60;
/** 치명타(작업 245) — 장비 추가옵션 `치명타 확률`·패시브를 합산한 스탯 `crit`이 곧 발동 확률(%)이다.
 *  배수는 1.8배, 확률 상한은 80%(넘는 값은 80%로 자른다). */
export const CRIT_CHANCE_CAP = 80;
export const CRIT_DAMAGE_SCALE = 1.8;
export const cooldowns = { attack: .48, ...Object.fromEntries(Object.keys(skills).map(id => [id, skills[id as SkillId].cooldown])) } as Record<Action, number>;
/** 평타 한 방의 공격력 배율. 한 마리만 맞히는 대신 한 방이 무겁다(작업 150). */
export const basicAttackPower = 1.6;
/** 궁수 평타 사거리와, 이보다 멀 때만 다가가는 거리(작업 157, 간격 조정 작업 207, 상향 작업 244).
 *  사용자 요청 "궁수 법사 사거리 조금씩늘려줘"(2026-11-21)로 280/150 → 330/180.
 *  필드 스폰 밴드가 170~333 남짓이라(작업 230) 이제 거의 모든 적을 뜨자마자 쏘고,
 *  추격은 적이 정지 거리(180) 안으로 들어올 때만 한다. 정지 거리는 평타의 약 55%로 종전 비율 그대로다. */
export const archerAttackRange = 330;
export const archerStopRange = 180;
/** 마법사도 원거리다 — 궁수보다 짧은 사거리에서 마법 구슬을 날린다(작업 198, 간격 조정 작업 207·216·244).
 *  직업별 간격은 궁수 330/180 > 마법사 285/160 > 전사 90 순서를 지긴다.
 *  궁수의 약 86%를 유지해 두 원거리 직업의 체감 차등은 그대로 두고 함께 올렸다(240/130 → 285/160). */
export const mageAttackRange = 285;
export const mageStopRange = 160;
export function enemyMoveSpeed(floor: number, boss: boolean): number {
  return boss ? 28 : Math.min(64, 38 + Math.max(0, floor - 1) * 1.2);
}
/** The normal-mob curve the game had before 작업 196 (floor 78: ~4,380). It is kept as the floor of
 *  the blend below so the early floors play exactly as they did, and `game/offline.ts` still settles
 *  its standing rewards on it: the deeper curve is about a live fight taking longer, and 20 hours away
 *  should not quietly pay 30% less. */
export function offlineMobHp(floor: number): number { return 24 + floor * 12 + Math.pow(floor, 1.55) * 4; }
/** The deep curve from 작업 198: floor 78 lands at ~54,800 instead of ~15,360, so a high floor has to
 *  be worn down and a floor you cannot clear sends you back down to farm. The exponent is what keeps the
 *  early floors where they are — 10~15층 sits at the health 작업 196 left (10층 299·15층 653 vs 309·651)
 *  — while from 25층 on it climbs fast: 25층 3,000 · 40층 9,700 · 50층 17,300 · 60층 27,700 · 78층 54,800(3.6배). */
function deepMobHp(floor: number): number { return 24 + floor * 14 + Math.pow(floor, 2.65) * 0.52; }
/** Floors below this keep the old curve; the deep one has fully taken over by `HP_RAMP_BY`. The ramp is
 *  what lets both halves of the request hold: 1~8층은 그대로, 25층부터는 깊은 층 곡선, 그 사이는 완만히. */
const HP_RAMP_FROM = 8, HP_RAMP_BY = 25;
/** The boss weight the game had before 작업 198 (floor 78: ~41,700, 2.7x a normal mob): a geared
 *  player deleted a boss in one combo, which made its 2.2% drop feel handed out. */
function earlyBossHp(floor: number): number { return 220 + floor * 95 + Math.pow(floor, 1.6) * 32; }
/** A boss stands at six normal mobs of its floor, so 78층 lands at ~329,000. (작업 198) */
const BOSS_HP_RATIO = 6;
/** Health of a mob on a floor: the early curve and the deep one blended over `HP_RAMP_FROM`~`BY`, and
 *  a boss blended the same way from its old weight into six times its mob — 1~8층 보스는 그대로다. */
export function enemyMaxHp(floor: number, boss: boolean): number {
  const ramp = Math.min(1, Math.max(0, (floor - HP_RAMP_FROM) / (HP_RAMP_BY - HP_RAMP_FROM)));
  if (boss) return Math.round(earlyBossHp(floor) + (deepMobHp(floor) * BOSS_HP_RATIO - earlyBossHp(floor)) * ramp);
  return Math.round(offlineMobHp(floor) + (deepMobHp(floor) - offlineMobHp(floor)) * ramp);
}
/** 정예 몹은 일반 몹 **30마리 처치마다 한 마리** 나온다(작업 206). 보스가 대기 중이면 그 스폰은 보스가 가져간다. */
export const ELITE_KILL_INTERVAL = 30;
/** 정예 몹의 체력·보상 배율 — 체력 2배, 금화·경험치 2배. 장비·스킬북 드롭률은 일반 몹과 **같다(1배)**. */
export const ELITE_HP_SCALE = 2;
export const ELITE_REWARD_SCALE = 2;
/** 정예 몹의 몸 크기 — 일반 몹보다 살짝 큰 1.22배(작업 206). */
export const ELITE_MOB_SCALE = 1.22;
/** 필드에 동시에 설 수 있는 몹 상한(작업 222, 사용자 요청 `#5827` "몹이 30마리 이상 생성되면 층 하락").
 *  상한에 닿아 30마리가 되면 더 싸우지 않고 한 층 내려간다(1층에는 내려갈 곳이 없어 상한만 지킨다). */
export const MOB_CAP = 30;
export function enemyHitDamage(floor: number, boss: boolean, defense: number): number { return Math.max(1, Math.round(boss ? 20 + floor * 5.5 + Math.pow(floor, 1.3) * 1.2 : 7 + floor * 2.4 + Math.pow(floor, 1.25) * .5) - defense * .2); }
/** 광폭 버프(블러드 레이지·호크아이·아케인 실드)의 공격속도 배율(작업 216).
 *  +20%에서 시작해 스킬 레벨당 +1%, 상한 1.5배 — `heroMotion.costumePlaybackRate`가 같은 식을 쓴다. */
export function berserkSpeedScale(level: number): number { return Math.min(1.5, 1.2 + (Math.max(1, level) - 1) * .01); }
/** 같은 버프의 공격력 배율 — +20%에서 시작해 스킬 레벨당 +1.5%(상한 없음, Lv.30 1.635배). */
export function berserkAttackScale(level: number): number { return 1.2 + (Math.max(1, level) - 1) * .015; }

/** 10연타 팝업을 흩뿌리는 자리(±12px) — 타마다 다른 조합이라 열 개 숫자가 한 곳에 모이지 않는다. */
export function crushLabelOffset(index: number): { x: number; y: number } { return { x: (index % 5 - 2) * 6, y: index < 5 ? -8 : 4 }; }

/** 무기 미장착 안내(작업 216). 자동 사냥이 매 프레임 공격을 시도해도 이 글자가 도배되지 않도록
 *  한 번 띄우면 4.5초는 조용히 막는다. */
export const WEAPON_REQUIRED_NOTICE = '무기를 장착해야 공격할 수 있습니다.';
export const WEAPON_NOTICE_COOLDOWN = 4.5;
/** 파이어 볼트가 띄우는 화염구 수(작업 216) — Lv.1~4는 1발, 이후 5레벨마다 +1발, 최대 6발. */
export function fireBoltCount(level: number): number { return Math.min(6, 1 + Math.floor(Math.max(1, Math.floor(level)) / 5)); }
/** 화염구 크기 배율(작업 216) — 레벨이 오를수록 점진적으로 커진다(Lv.1 1배 → Lv.30 2.45배). */
export function fireBoltScale(level: number): number { return 1 + Math.max(0, Math.floor(level) - 1) * .05; }
/** 머리 위 화염구 자리(월드 좌표, 작업 216).
 *  아이소 투영이 화면 변위를 `(dx−dy)·.86`, `(dx+dy)·.43`으로 그리므로, 화면 기준 반원(가운데가
 *  높고 양옆으로 퍼짐)을 그 역변환으로 옭려 머리 위에 띄운다. 1발이면 정수리 바로 위다. */
export function fireBoltSpots(x: number, y: number, count: number): { x: number; y: number }[] {
  const spots: { x: number; y: number }[] = [];
  const n = Math.max(1, Math.floor(count));
  for (let index = 0; index < n; index++) {
    const spread = n === 1 ? 0 : index / (n - 1) - .5;            // -0.5 ~ +0.5
    const screenX = spread * 64;
    const screenY = -68 - (1 - Math.abs(spread) * 2) * 8;          // 가운데가 8px 더 높다
    spots.push({ x: x + (screenX / .86 + screenY / .43) / 2, y: y + (screenY / .43 - screenX / .86) / 2 });
  }
  return spots;
}

export class World {
  player = { x: 0, y: 0, facing: 0, facingSide: 1, hp: 100, berserk: 0, berserkLevel: 1, hit: 0 };
  /** 추가옵션 체력회복력(작업 238)의 5초 타이머. */
  regenClock = 0;
  enemies: Enemy[] = [];
  drops: Drop[] = [];
  coins: Coin[] = [];
  effects: Effect[] = [];
  cooldown: Record<Action, number> = Object.fromEntries(Object.keys(cooldowns).map(id => [id, 0])) as Record<Action, number>;
  /** 치명타 굴림(작업 245). 기본은 흐르는 난수 그대로이고, 서버가 같은 전투를 다시 돌리는
   *  월드보스 연습(`WorldBossRehearsal`)만 시드 난수로 바꿔 끼운다 — 그래야 클라이언트와 서버의
   *  치명타가 같은 순서로 나온다. */
  critRoll: () => number = random;
  spawnTimer = 0;
  paused = false;
  attackHeld = false;
  attackPose = 0;
  /** 지금 공격 동작이 재생되는 길이. 딜레이 크러싱 한 타는 62ms로 4프레임을 빠르게 넘긴다(작업 212). */
  attackPoseSpan = .32;
  /** 지금 재생 중인 공격 모션 종류 — 이단참(작업 213)만 `double`(두 스윙)이다. */
  attackCombo: 'single' | 'double' = 'single';
  /** 진행 중인 딜레이 크러싱 10연타(작업 212). 없으면 undefined. */
  crush?: { level: number; elapsed: number; next: number; hits: number; power: number };
  /** 지금 살아 있는 잔상들 — 렌더러가 이 목록으로 본체 복제본을 그리고 지운다(작업 212). */
  afterimages: HeroAfterimage[] = [];
  /** 무기 미장착 안내를 다시 띄우기까지 남은 시간(작업 216). 자동 사냥이 매 프레임
   *  `action()`을 불러도 토스트가 도배되지 않게 한다. */
  weaponNotice = 0;
  activeMove = { x: 0, y: 0 };
  bossPending = false;
  /** `⚔ 보스 도전`을 띄울 상태인가(작업 212 `#5017`) — 보스에게 쓰러진 뒤 `true`,
   *  보스를 잡아 다음 층으로 올라가면 `false`. 세션 동안만 기억한다. */
  bossRetryAvailable = false;
  /** 정예 몹 처치 카운터(작업 206) — 30마리가 되면 다음 스폰을 정예로 예약한다. */
  eliteKills = 0;
  elitePending = false;
  private swing = 1;
  private chaseTarget?: Enemy;
  private pursuing = false;
  /**
   * 캐릭터 전환 세대(작업 250) — `adoptSave`가 한 번 올린다.
   *
   * 새로고침 없이 캐릭터를 같아타면 세이브 객체는 그대로고 내용만 바뀌어, 그리기 쪽은 "같은
   * 세이브"와 "다른 캐릭터"를 구별할 수 없다. 이 값을 비교해 파츠 스프라이트·발광·잔상을 버린다.
   */
  switchEpoch = 0;
  onChange: () => void = () => {};
  onMessage: (text: string) => void = () => {};
  /** Live auto-salvage (작업 196): the grade the player chose, or `undefined` while the switch is off.
   *  The UI owns the switch and the stored value, so the world asks on every pickup instead of keeping
   *  a copy that could drift. Offline rewards never pass through this. */
  autoSalvage?: () => Exclude<Rarity, 'legendary'> | undefined;
  /** 41층부터 쓰는 `+N까지` 상한 (작업 203): 이 단계보다 높은 장비는 경매장용으로 남긴다. 40층
   *  이하에서는 값이 있어도 `autoSalvageBlock`이 보지 않으므로 설정 화면도 그때만 열린다. */
  autoSalvagePlus?: () => number | undefined;
  /** Would this recovered piece be swept up right now? Used to let it fly in even with a full bag. */
  private sweeps(item: Item): Exclude<Rarity, 'legendary'> | undefined {
    const grade = this.autoSalvage?.();
    return grade && !autoSalvageBlock(this.save, item, grade, this.autoSalvagePlus?.()) ? grade : undefined;
  }
  /** 가방 40칸이 꽉 찼을 때 설정 이하의 **가방 안** 장비를 즉시 일괄 분해해 칸을 만든다(작업 209, #4286).
   *  분해된 것이 1개 이상이면 금화·강화석을 알리고 `true`. 스위치가 꺼졌거나 남길 장비밖에 없으면 `false`. */
  private sweepFullBag(): boolean {
    const grade = this.autoSalvage?.();
    if (!grade) return false;
    const swept = sweepBagOnFull(this.save, grade, this.autoSalvagePlus?.());
    if (!swept) return false;
    this.onMessage(`가방이 가득 차 설정 이하 장비 ${swept.count}개를 자동 분해했습니다 (+${swept.gold.toLocaleString()}G, +${swept.stones.toLocaleString()}강화석)`);
    this.onChange();
    return true;
  }

  constructor(public save: Save) {
    this.save.auto = true;    this.player.hp = Math.min(save.health, totalStats(save).health);
    // 보스는 **최고 도달 층에서만** 나오고, 자동 등반이 꺼진 상태(패배 뒤)에는 `⚔ 보스 도전`을 눌러야
    // 다시 나온다(작업 210). 세이브를 다시 읽어도 보스가 저절로 소환되지 않는다.
    this.bossPending = save.autoClimb && this.bossFloor() && save.floorKills >= floorKillTarget(save.floor);
    // 버튼은 **보스에게 패배한 순간**에만 살아난다(작업 222, `#5781`·`#5792`).
    // 예전에는 `!save.autoClimb`로 시작해, 자동 등반을 끄거나 그런 세이브로 접속하면 보스에게 한 번도
    // 지지 않았는데 `⚔ 보스 도전`이 즉시 떴다. 세이브를 다시 읽어도 보스가 저절로 소환되지 않는다.
    // 작업 223(`#6086`): 이 상태를 세션 메모리에만 두면 새로고침·재접속·버전 업데이트 리로드로
    // 보스에게 진 기록이 사라져 버튼이 없어졌다(사용자: "4층 넘어갈때까지 계속 있어야되는데").
    // 이제 `save.bossRetryFloor`(= 진 층, 최고 도달 층과 같을 때만 의미)에서 되살린다.
    this.bossRetryAvailable = save.bossRetryFloor === save.maxFloor && save.maxFloor < MAX_FLOOR;
    const hp = enemyMaxHp(save.floor, false);
    const start = clampArenaPoint(145, -45);
    this.enemies.push({ x: start.x, y: start.y, hp, maxHp: hp, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
  }

  /**
   * 캐릭터를 바꾸거나 새로 만들었을 때 — **새로고침 없이** 같은 World가 새 세이브로 갈아탄다(작업 228).
   *
   * 화면(필드·HUD·모달)과 저장 동기화는 이 인스턴스와 `save` 객체를 계속 들고 있으므로, 객체 정체성은
   * 그대로 두고 내용만 새 세이브로 바꿔야 한다(새 World를 만들면 렌더러·저장 큐가 옛 객체를 가리킨다).
   * 필드에 남아 있던 몹·드랍·연출·쿨타임·보스 상태는 생성자와 같은 초기값으로 되돌린다.
   */
  adoptSave(save: Save): void {
    // 그리기 쪽이 "캐릭터가 갈아탔다"를 알아야 이전 직업의 파츠·잔상을 지울 수 있다(작업 250).
    // 세이브 객체 정체성은 그대로라 값만으로는 전환을 알 수 없으므로 세대를 하나 올린다.
    this.switchEpoch += 1;
    const target = this.save as unknown as Record<string, unknown>;
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(this.save, save);
    this.save.auto = true;
    this.player = { x: 0, y: 0, facing: 0, facingSide: 1, hp: Math.min(this.save.health, totalStats(this.save).health), berserk: 0, berserkLevel: 1, hit: 0 };
    this.enemies = []; this.drops = []; this.coins = []; this.effects = []; this.afterimages = [];
    this.cooldown = Object.fromEntries(Object.keys(cooldowns).map(id => [id, 0])) as Record<Action, number>;
    this.spawnTimer = 0; this.paused = false; this.attackHeld = false; this.attackPose = 0;
    this.attackPoseSpan = .32; this.attackCombo = 'single';
    this.crush = undefined; this.weaponNotice = 0; this.activeMove = { x: 0, y: 0 };
    this.bossPending = this.save.autoClimb && this.bossFloor() && this.save.floorKills >= floorKillTarget(this.save.floor);
    this.bossRetryAvailable = false; this.eliteKills = 0; this.elitePending = false;
    this.swing = 1; this.chaseTarget = undefined; this.pursuing = false;
    const hp = enemyMaxHp(this.save.floor, false);
    const start = clampArenaPoint(145, -45);
    this.enemies.push({ x: start.x, y: start.y, hp, maxHp: hp, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
  }

  /** 보스가 나오는 층인가 — **최고 도달 층에서만**이다(작업 210, 사용자 지시 `#4566`).
   *  아래층을 반복 사냥할 때는 보스가 뜨지 않고 일반·정예만 계속 나온다. */
  bossFloor(): boolean { return this.save.floor >= this.save.maxFloor; }

  /** `⚔ 보스 도전` 버튼이 살아나는 상태 — 보스에게 한 번 쓰러진 뒤다.
   *  작업 212(`#5017`): 자동 등반이 **켜져 있어도** 버튼을 띄운다 — 일반 몹을 다시 잡아
   *  목표를 채우기 전이라도 바로 보스에게 다시 도전할 수 있다.
   *  작업 245: 몹이 쌓여 아래층으로 강등돼도 버튼은 그대로 남는다(`this.bossFloor()` 제한 없음).
   *  누르면 최고층으로 올라가 보스와 붙는다(`challengeBoss`).
   *  마지막 층(`MAX_FLOOR`)은 다음 층이 없으므로 버튼을 띄우지 않는다. */
  get bossRetryReady(): boolean { return this.bossRetryAvailable && this.save.maxFloor < MAX_FLOOR; }

  /**
   * `⚔ 보스 도전`(작업 210 → 212, 사용자 지시 `#4566` "패배시에만 활성화 … 계속 다시 도전해도 돼",
   * `#5017` "버튼 안 눌러도 자동으로 다시"·"보스 도전 시 일반 몹은 안 나와야 함").
   * 자동 등반을 다시 켜고, 지금 층 보스를 한 마리 새로 소환한다 — **일반 몹은 모두 정리하고
   * 보스전이 끝날 때까지 새로 부르지 않는다**(보스와 단독 승부).
   * 보스에게 또 지면 패배 처리로 버튼이 다시 살아나므로 몇 번이든 재도전할 수 있고,
   * 보스를 이겨 다음 층으로 올라가면 버튼은 사라진다. */
  challengeBoss(): boolean {
    if (!this.bossRetryReady) return false;
    // 강등돼 아래층에 있어도 도전은 **최고층 보스**에게 한다(작업 245) — 먼저 최고층으로 올라간다.
    // `travelToFloor`는 바닥 드랍·진행도·몹을 정리하고, 아래에서 보스 예약을 다시 세운다.
    if (this.save.floor < this.save.maxFloor) this.travelToFloor(this.save.maxFloor);
    this.save.autoClimb = true;
    this.save.floorKills = Math.max(this.save.floorKills, floorKillTarget(this.save.floor));
    this.enemies = []; this.chaseTarget = undefined; this.pursuing = false; this.activeMove = { x: 0, y: 0 };
    this.spawnTimer = 0; this.bossPending = true; this.elitePending = false;
    this.onMessage('해골 군주에게 다시 도전합니다!');
    this.onChange();
    return true;
  }

  /** 무기 미장착 안내 — 쿨다운 안이면 조용히 지나간다. */
  private warnWeapon(): void {
    if (this.weaponNotice > 0) return;
    this.weaponNotice = WEAPON_NOTICE_COOLDOWN;
    this.onMessage(WEAPON_REQUIRED_NOTICE);
  }

  /** 캐릭터 직업 — 값이 없는 예전 세이브는 전사로 본다. */
  get job(): Job { return jobOrDefault(this.save.job); }

  /** 마법사 평타 구슬 색 — 남성은 푸른 마력, 여성은 붉은 화염이다. */
  get mageBolt(): ArrowVariant { return this.save.gender === 'female' ? 'fire' : 'arcane'; }

  travelToFloor(floor: number): { ok: boolean; message: string } {
    const highest = Math.min(MAX_FLOOR, this.save.maxFloor);
    if (!Number.isInteger(floor) || floor < 1 || floor > highest) return { ok: false, message: `이동할 수 없는 층입니다. 현재 최고 도달 층은 ${highest}층입니다.` };
    if (floor === this.save.floor) return { ok: true, message: `이미 ${floor}층에서 사냥 중입니다.` };
    const lostDrops = this.drops.length;
    this.save.floor = floor;
    this.save.floorKills = 0;
    this.enemies = []; this.drops = []; this.coins = []; this.effects = [];
    this.crush = undefined; this.afterimages = []; this.attackPoseSpan = .32;
    this.bossPending = false; this.eliteKills = 0; this.elitePending = false; this.spawnTimer = 0;
    this.player.x = 0; this.player.y = 0; this.attackHeld = false;
    this.activeMove = { x: 0, y: 0 };
    this.chaseTarget = undefined; this.pursuing = false;
    this.onChange();
    return { ok: true, message: `${floor}층으로 이동했습니다.${lostDrops ? ` 바닥의 드랍 ${lostDrops}개가 사라졌습니다.` : ''}` };
  }

  action(kind: Action | null): void {
    if (this.paused || !kind) return;
    // 무기가 없으면 평타·공격 스킬이 모두 나가지 않는다(작업 216). 자동 사냥도 같은 경로로 들어오므로
    // 수동·자동이 함께 막히고, 안내는 `WEAPON_NOTICE_COOLDOWN`(4.5초)에 한 번만 뜬다.
    // 단 첫 튜토리얼(첫 처치 전)만 예외다 — 시작 무기는 그 첫 처치의 100% 드랍이라 여기서까지 막으면
    // 새 캐릭터가 무기를 영영 얻지 못한다.
    if (!this.save.equipment.weapon && this.save.tutorial > 0) { this.warnWeapon(); return; }
    if (kind !== 'warcry' && Math.hypot(this.activeMove.x, this.activeMove.y) > .05) return;
    if (this.cooldown[kind] > 0) return;
    if (kind !== 'attack' && (!this.save.learned.includes(kind) || !this.save.quickSlots.includes(kind))) { this.onMessage('습득하고 퀵슬롯에 장착한 스킬만 사용할 수 있습니다.'); return; }
    const p = this.player;
    const level = kind === 'attack' ? 1 : skillLevel(this.save, kind);
    const range = kind === 'attack' ? WARRIOR_ATTACK_RANGE : skillRange(kind, level);
    const damageScale = skillDamageScale(level);
    const stats = totalStats(this.save);
    // [작업 216] 광폭 버프(블러드 레이지·호크아이·아케인 실드)의 공속은 +20%에서 시작해 스킬 레벨당 +1%,
    // 상한 1.5배다(예전 `1.5 + (레벨-1)*.08`은 Lv.1부터 +50%, Lv.30 3.8배로 비정상이었다).
    this.cooldown[kind] = kind === 'attack' ? cooldowns.attack / (1 + stats.speed / 100) * (p.berserk > 0 ? 1 / berserkSpeedScale(p.berserkLevel) : 1) : cooldowns[kind];
    if (kind !== 'warcry') {
      // 이단참(작업 213)만 두 스윙(0.44초) 창을 쓰고, 나머지 스킬·평타는 0.32초 한 스윙이다.
      this.attackCombo = kind === 'slash2' ? 'double' : 'single';
      this.attackPose = kind === 'slash2' ? slash2SwingSeconds : .32;
      this.attackPoseSpan = this.attackPose;
    }
    // 공격력은 +20%에서 시작해 스킬 레벨당 +1.5%(Lv.30 1.635배) — 예전 식은 Lv.1 +50%에 상한이 없었다.
    const attack = stats.attack * (p.berserk > 0 ? berserkAttackScale(p.berserkLevel) : 1);
    const target = this.nearest();
    if (target) this.faceTarget(target);
    if (kind === 'attack') {
      const angle = p.facing;
      if (this.job === 'archer') {
        // 궁수 평타: 활시위를 당겨 실제 화살이 적에게 날아가 적중한다(작업 157).
        const point = target ?? { x: p.x + Math.cos(angle) * archerAttackRange, y: p.y + Math.sin(angle) * archerAttackRange };
        this.shoot(point.x, point.y, attack * basicAttackPower, { speed: 820, radius: 42, arrow: 'normal', aim: target });
        return;
      }
      if (this.job === 'mage') {
        // 마법사 평타: 화살 대신 푸른/붉은 마법 구슬이 날아가 적중한다(작업 198).
        const point = target ?? { x: p.x + Math.cos(angle) * mageAttackRange, y: p.y + Math.sin(angle) * mageAttackRange };
        this.shoot(point.x, point.y, attack * basicAttackPower, { speed: 760, radius: 44, arrow: this.mageBolt, aim: target });
        return;
      }
      this.effects.push({ x: p.x, y: p.y, kind: 'slash', age: 0, duration: .25, angle, swing: this.swing });
      this.swing *= -1;
      // 평타는 한 마리만: 사거리·부채꼴 안에서 가장 가까운 적 한 마리를 공격력 ×1.6으로 때린다(스킬은 종전대로 광역).
      this.damage(WARRIOR_ATTACK_RANGE, attack * basicAttackPower, angle, 1.15, 12, 0, p, 1);
    } else if (kind === 'slash2') {
      // 이단참(작업 213): 발동 즉시 정방향 횡베기, 0.18초 뒤 되받아 베기가 각각 따로 들어간다.
      // `power`에는 두 타에 공통으로 곱할 기본 위력(공격력 × 스킬레벨 배율)을 실어 두고,
      // 타당 배율은 판정 순간에 `slash2Hits`에서 꺼낸다.
      this.effects.push({ x: p.x, y: p.y, kind: 'slash2', age: 0, duration: skillDuration(kind, level), angle: p.facing, nextHit: slash2Hits[0].at, power: attack * damageScale, level, hits: 0 });
    } else if (kind === 'spin') {
      this.effects.push({ x: p.x, y: p.y, kind: 'spin', age: 0, duration: skillDuration(kind, level), angle: 0, nextHit: .45, power: attack * .65 * damageScale, level });
      this.damage(range * dragonOrbitFactor(0), attack * 1.65 * damageScale, 0, Math.PI);
    } else if (kind === 'crushing') {
      // [작업 212] 붉은보석1식 — 적 하나에게 본체가 빠르게 10번 내려치고, 타마다 잔상과 데미지 판정이 남는다.
      // 연출(충격 링·내려찍기)은 대상이 있는 자리에서 62ms마다 한 번씩 깜빡인다.
      const point = target && Math.hypot(target.x - p.x, target.y - p.y) <= range ? target : { x: p.x + Math.cos(p.facing) * range * .65, y: p.y + Math.sin(p.facing) * range * .65 };
      this.effects.push({
        x: point.x, y: point.y, kind: 'crushing', age: 0, duration: crushHits * crushInterval,
        angle: p.facing, strikeInterval: crushInterval, power: attack * 3.4 * damageScale, level, aim: target
      });
      this.crush = { level, elapsed: 0, next: crushInterval, hits: 0, power: attack * 3.4 * damageScale };
      this.crushStrike();
    } else if (kind === 'slam') {
      this.effects.push({ x: p.x, y: p.y, kind: 'slam', age: 0, duration: skillDuration(kind, level), angle: p.facing, nextHit: .45, power: attack * .55 * damageScale, level });
      this.damage(range, attack * 2.2 * damageScale, p.facing, 1.35, 55, 2 + (level - 1) * .3);
    } else if (kind === 'warcry') {
      p.berserk = skillDuration(kind, level);
      p.berserkLevel = level;
      this.effects.push({ x: p.x, y: p.y, kind: 'warcry', age: 0, duration: .7, angle: 0 });
      for (const enemy of this.enemies) {
        const dx = enemy.x - p.x, dy = enemy.y - p.y, d = Math.hypot(dx, dy);
        if (d < 115 && d > 0) { const bounded = clampFieldPoint(enemy.x + dx / d * 40, enemy.y + dy / d * 40); enemy.x = bounded.x; enemy.y = bounded.y; }
      }
    } else if (kind === 'power') {
      this.effects.push({ x: p.x, y: p.y, kind: 'power', age: 0, duration: skillDuration(kind, level), angle: p.facing });
      this.damage(range, attack * 4 * damageScale, p.facing, .45, 24);
    } else if (kind === 'destroy') {
      this.effects.push({ x: p.x, y: p.y, kind: 'destroy', age: 0, duration: skillDuration(kind, level), angle: p.facing });
      this.damage(range, attack * 2.7 * damageScale, p.facing, .7, 42);
    } else if (kind === 'hell') {
      this.effects.push({ x: p.x, y: p.y, kind: 'hell', age: 0, duration: skillDuration(kind, level), angle: p.facing, nextHit: .4, power: attack * .6 * damageScale, level });
      this.damage(range, attack * 3.2 * damageScale, 0, Math.PI, 45, 1 + (level - 1) * .2);
    } else if (kind === 'doubleShot') {
      const aim = this.aimPoint(target, range);
      this.shoot(aim.x, aim.y, attack * 1.35 * damageScale, { speed: 900, arrow: 'normal', aim: target, source: kind });
      this.shoot(aim.x + (random() - .5) * 16, aim.y + (random() - .5) * 16, attack * 1.35 * damageScale, { speed: 900, delay: .08, arrow: 'normal', aim: target, source: kind });
    } else if (kind === 'multiShot') {
      const aim = this.aimPoint(target, range);
      const base = Math.atan2(aim.y - p.y, aim.x - p.x);
      for (let index = -2; index <= 2; index++) {
        const spread = base + index * .17;
        const distance = Math.hypot(aim.x - p.x, aim.y - p.y);
        this.shoot(p.x + Math.cos(spread) * distance, p.y + Math.sin(spread) * distance, attack * .95 * damageScale, { speed: 860, radius: 34, arrow: 'normal', source: kind });
      }
    } else if (kind === 'pierceShot') {
      const aim = this.aimPoint(target, range);
      this.shoot(aim.x, aim.y, attack * 2.6 * damageScale, { speed: 980, radius: 52, targets: 4, knockback: 4, arrow: 'pierce', source: kind });
    } else if (kind === 'iceArrow') {
      const aim = this.aimPoint(target, range);
      this.shoot(aim.x, aim.y, attack * 1.9 * damageScale, { speed: 760, radius: 54, slow: 2.4 + (level - 1) * .06, arrow: 'ice', aim: target, source: kind });
    } else if (kind === 'hawkEye') {
      p.berserk = skillDuration(kind, level);
      p.berserkLevel = level;
      this.effects.push({ x: p.x, y: p.y, kind: 'hawk', age: 0, duration: .9, angle: 0, level, source: kind });
    } else if (kind === 'snipe') {
      const aim = this.aimPoint(target, range);
      this.shoot(aim.x, aim.y, attack * 4.3 * damageScale, { speed: 1500, radius: 38, knockback: 18, arrow: 'snipe', aim: target, source: kind });
    } else if (kind === 'stormVolley') {
      const aim = this.aimPoint(target, range);
      for (let index = 0; index < 6; index++) {
        this.shoot(aim.x + (random() - .5) * 30, aim.y + (random() - .5) * 30, attack * .8 * damageScale, { speed: 940, radius: 34, delay: index * .13, arrow: 'volley', aim: target, source: kind });
      }
    } else if (kind === 'arrowRain') {
      const aim = this.aimPoint(target, range);
      this.effects.push({ x: aim.x, y: aim.y, kind: 'rain', age: 0, duration: skillDuration(kind, level), angle: 0, nextHit: .12, power: attack * .85 * damageScale, level, source: kind });
    } else if (kind === 'fireBolt') {
      // [작업 216] 머리 위에 화염구 N발을 띄운 뒤, 각 자리에서 목표 한 마리를 향해 곡선 없이
      // 곧장 일직선으로 날아가 타격한다. 합계 위력은 예전 한 발(×2.0)과 같게 N으로 나눈다.
      const aim = this.aimPoint(target, range);
      const count = fireBoltCount(level), size = fireBoltScale(level);
      const power = attack * 2 * damageScale / count;
      fireBoltSpots(p.x, p.y, count).forEach((spot, index) => {
        this.shoot(aim.x, aim.y, power, {
          speed: 900, radius: 36, arrow: 'fire', aim: target, source: kind,
          from: spot, launch: .18 + index * .05, size
        });
      });
    } else if (kind === 'iceBolt') {
      const aim = this.aimPoint(target, range);
      this.shoot(aim.x, aim.y, attack * 1.7 * damageScale, { speed: 720, radius: 52, slow: 2.4 + (level - 1) * .06, arrow: 'frost', aim: target, source: kind });
    } else if (kind === 'chainLightning') {
      const aim = this.aimPoint(target, range);
      this.shoot(aim.x, aim.y, attack * 1.25 * damageScale, { speed: 900, radius: 70, targets: 3, arrow: 'chain', aim: target, source: kind });
    } else if (kind === 'manaBurst') {
      const aim = this.aimPoint(target, range);
      this.effects.push({ x: aim.x, y: aim.y, kind: 'burst', age: 0, duration: skillDuration(kind, level), angle: 0, nextHit: .35, power: attack * 2.5 * damageScale, radius: 96, variant: 'arcane', level, source: kind });
    } else if (kind === 'frostNova') {
      // 판정은 노바 이펙트가 한 번만 낸다(발동 즉시 피해를 또 주면 두 번 들어간다).
      this.effects.push({ x: p.x, y: p.y, kind: 'nova', age: 0, duration: skillDuration(kind, level), angle: 0, nextHit: .12, power: attack * 1.5 * damageScale, radius: range, slow: 2.2 + (level - 1) * .06, variant: 'frost', level, source: kind });
    } else if (kind === 'arcaneShield') {
      p.berserk = skillDuration(kind, level);
      p.berserkLevel = level;
      this.effects.push({ x: p.x, y: p.y, kind: 'ward', age: 0, duration: .9, angle: 0, level, source: kind });
    } else if (kind === 'meteorStrike') {
      const aim = this.aimPoint(target, range);
      this.effects.push({ x: aim.x, y: aim.y, kind: 'burst', age: 0, duration: skillDuration(kind, level), angle: 0, nextHit: .6, power: attack * 3.6 * damageScale, radius: 110, variant: 'meteor', level, source: kind });
    } else if (kind === 'arcaneOverlord') {
      this.effects.push({ x: p.x, y: p.y, kind: 'nova', age: 0, duration: skillDuration(kind, level), angle: 0, nextHit: .2, power: attack * 3 * damageScale, radius: range, variant: 'arcane', level, source: kind });
    }
  }

  /**
   * 딜레이 크러싱 한 타(작업 212).
   *
   * 본체의 attack 4프레임을 62ms짜리로 한 번 더 재생하고, 사거리 안 가장 가까운 적 **한 마리**에게
   * 따로 판정한다(대상이 이 타에 쓰러지면 다음 타가 사거리 안 다음 적으로 이어진다).
   * 타마다 ±8% 흔들림을 두어 10번이 각각 다른 판정임을 보이고, 합계는 예전 한 방(× 3.4)과 같다.
   * 마지막으로 본체 자세를 복제한 잔상 한 점을 남긴다(±14px 안에서만 흔든다).
   */
  private crushStrike(): void {
    const crush = this.crush; if (!crush) return;
    const p = this.player, index = crush.hits;
    crush.hits++;
    this.attackPose = crushPoseSpan;
    this.attackPoseSpan = crushPoseSpan;
    this.attackCombo = 'single';
    const amount = crush.power / crushHits * (.92 + random() * .16);
    this.damage(skillRange('crushing', crush.level), amount, 0, Math.PI, 3, 0, p, 1, crushLabelOffset(index));
    this.afterimages.push({
      x: p.x + ((index * 11) % 29) - 14, y: p.y + ((index * 7) % 17) - 8,
      age: 0, duration: crushTrailLife, alpha: .42 - index * .031, facingSide: p.facingSide, capture: .02
    });
  }

  /** 스킬을 쏠 지점 — 사거리 안의 가장 가까운 적, 없으면 정면 사거리 끝. */
  private aimPoint(target: Enemy | undefined, range: number): { x: number; y: number } {
    if (target && Math.hypot(target.x - this.player.x, target.y - this.player.y) <= range) return { x: target.x, y: target.y };
    return { x: this.player.x + Math.cos(this.player.facing) * range * .75, y: this.player.y + Math.sin(this.player.facing) * range * .75 };
  }

  /** 화살 하나를 쏜다. 도착하는 순간(`update`)에 그 지점 반경의 적에게 피해를 준다. */
  private shoot(tx: number, ty: number, power: number, options: { speed?: number; radius?: number; targets?: number; slow?: number; knockback?: number; delay?: number; arrow?: ArrowVariant; aim?: Enemy; source?: SkillId; from?: { x: number; y: number }; launch?: number; size?: number } = {}): void {
    const p = this.player;
    // `from`은 발사 자리다(파이어 볼트 화염구는 머리 위에서 출발한다). 없으면 캐릭터 자리.
    const origin = options.from ?? p;
    const dx = tx - origin.x, dy = ty - origin.y;
    const distance = Math.hypot(dx, dy);
    // `launch`는 제자리에 떠 있는 시간이다 — 발사 뒤 남은 비행 시간만큼만 도착이 늦어진다.
    const launch = options.launch ?? 0;
    const delay = Math.max(0, launch - (options.delay ?? 0)) + (options.delay ?? 0);
    this.effects.push({
      x: origin.x, y: origin.y, kind: 'shot', age: 0, duration: Math.max(.05, distance / (options.speed ?? 820)) + delay,
      angle: Math.atan2(dy, dx), tx, ty, power, radius: options.radius ?? 40, targets: options.targets ?? 1,
      slow: options.slow ?? 0, variant: options.arrow ?? 'normal', level: this.save.level, aim: options.aim, source: options.source,
      launch: launch || undefined, size: options.size
    });
  }

  nearest(): Enemy | undefined {
    return this.enemies.reduce<Enemy | undefined>((best, e) => !best || Math.hypot(e.x - this.player.x, e.y - this.player.y) < Math.hypot(best.x - this.player.x, best.y - this.player.y) ? e : best, undefined);
  }

  private faceTarget(target: { x: number; y: number }): void {
    const dx = target.x - this.player.x, dy = target.y - this.player.y;
    const screenDx = dx - dy;
    this.player.facing = Math.atan2(dy, dx);
    if (Math.abs(screenDx) > 4) this.player.facingSide = screenDx > 0 ? 1 : -1;
  }

  damage(radius: number, amount: number, angle: number, arc: number, knockback = 12, slow = 0, origin: { x: number; y: number } = this.player, maxTargets = Infinity, labelOffset?: { x: number; y: number }): void {
    // 추가옵션(작업 238): `추가 데미지`는 최종 피해에 곱하고, `피흡`은 실제로 가한 피해에서 회복한다.
    // 두 값 모두 상한이 걸려 있다(`effectiveExtraOptions`) — 피흡은 한 번의 타격에 최대 체력의 4%까지다.
    const extras = effectiveExtraOptions(this.save.equipment);
    const power = extras.bonusDmgPct > 0 ? amount * (1 + extras.bonusDmgPct / 100) : amount;
    // 치명타(작업 245): 장비 추가옵션 `치명타 확률`은 이제 표시가 아니라 실제 발동이다. 스탯 `crit`(%)을
    // 그대로 확률로 쓰고, 타마다 한 번씩 굴려 들어가면 1.8배로 터뜨린다(상한 80%). 굴림은 `critRoll`을
    // 거치므로 월드보스 서버 재계산도 같은 순서로 나온다.
    const critChance = Math.min(CRIT_CHANCE_CAP, Math.max(0, totalStats(this.save).crit));
    // 판정 대상은 사거리·부채꼴 안의 적. `maxTargets`를 주면 가까운 순으로 그 수만 맞는다(평타 1마리).
    const inRange: { enemy: Enemy; dx: number; dy: number; dist: number }[] = [];
    for (const enemy of this.enemies) {
      const dx = enemy.x - origin.x, dy = enemy.y - origin.y, dist = Math.hypot(dx, dy);
      const diff = Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle));
      if (dist > radius || Math.abs(diff) > arc) continue;
      inRange.push({ enemy, dx, dy, dist });
    }
    const targets = inRange.length > maxTargets ? inRange.sort((a, b) => a.dist - b.dist).slice(0, maxTargets) : inRange;
    let dealt = 0;
    for (const { enemy, dx, dy, dist } of targets) {
      const crit = critChance > 0 && this.critRoll() * 100 < critChance;
      const hit = crit ? power * CRIT_DAMAGE_SCALE : power;
      enemy.hp -= hit;
      dealt += hit;
      enemy.hit = .24;
      enemy.slow = Math.max(enemy.slow, slow);
      if (knockback && dist) { enemy.knockX += dx / dist * knockback * 16; enemy.knockY += dy / dist * knockback * 16; }
      this.effects.push({ x: enemy.x, y: enemy.y, kind: 'hit', age: 0, duration: .45, angle: random() * Math.PI * 2, amount: Math.round(hit), labelOffsetX: labelOffset?.x, labelOffsetY: labelOffset?.y, crit });
    }
    if (extras.lifestealPct > 0 && dealt > 0) this.lifesteal(dealt, extras.lifestealPct);
    const dead = this.enemies.filter(e => e.hp <= 0);
    this.enemies = this.enemies.filter(e => e.hp > 0);
    for (const enemy of dead) this.kill(enemy);
  }

  /** 피흡(작업 238) — 가한 피해의 N%를 회복한다. 한 번의 타격은 최대 체력의 4%까지만 찬다. */
  private lifesteal(dealt: number, percent: number): void {
    const p = this.player, maxHp = totalStats(this.save).health;
    if (p.hp <= 0 || p.hp >= maxHp) return;
    const heal = Math.min(Math.round(dealt * percent / 100), Math.max(1, Math.ceil(maxHp * EXTRA_LIFESTEAL_HIT_CAP)));
    if (!(heal > 0)) return;
    p.hp = Math.min(maxHp, p.hp + heal);
    this.effects.push({ x: p.x, y: p.y, kind: 'heal', age: 0, duration: .6, angle: Math.PI / 2, amount: heal });
  }

  kill(enemy: Enemy): void {
    this.effects.push({ x: enemy.x, y: enemy.y, kind: 'death', age: 0, duration: .7, angle: random() * Math.PI * 2 });
    this.save.kills++;
    // 보스 업적은 **보스만** 센다(작업 210, 사용자 지시 `#4475`·`#4486` "보스가 아니잖아"):
    // 사냥터 층 보스 + 던전 5·10층 보스 + 월드보스 도전(하루 3회, 도전마다 1회).
    // 필드 정예 몹은 보스가 아니므로 세지 않는다. 던전·월드보스 화면이 같은 `bossKills`에 더한다.
    if (enemy.boss) this.save.bossKills++;
    // 정예는 금화·경험치 2배, 장비·스킬북 드롭률은 일반 몹과 같은 1배다(작업 206).
    const gold = enemy.boss ? 70 * this.save.floor : (3 + this.save.floor) * (enemy.elite ? ELITE_REWARD_SCALE : 1);
    this.save.gold += gold;
    // The coin shows the gold that was just paid: nothing is credited when it flies in. A boss's gold
    // hits the floor in ten heaps scattered around the body (작업 194), each its own drop with its own
    // fall; the heaps add up to the same gold, so the shower never pays twice.
    const heaps = enemy.boss ? bossGoldPiles(gold) : [gold];
    heaps.forEach((amount, index) => {
      const spot = enemy.boss ? bossGoldSpot(enemy.x, enemy.y, index) : enemy;
      const point = enemy.boss ? clampArenaPoint(spot.x, spot.y) : spot;
      // A boss's heaps burst out of the body: each remembers where it was thrown from, so the field
      // can fly it there on its own parabola (작업 196).
      const from = enemy.boss ? clampArenaPoint(enemy.x, enemy.y) : undefined;
      this.coins.push({ x: point.x, y: point.y, age: 0, gold: amount, from });
    });
    // 경험치(작업 207, 사용자 확정): 일반 `9 + 층`, 정예 2배, 보스 6배 — 1층 10/20/60 · 20층 29/58/174.
    const baseExp = 9 + this.save.floor;
    const gained = addExperience(this.save, enemy.boss ? baseExp * 6 : baseExp * (enemy.elite ? ELITE_REWARD_SCALE : 1));
    if (gained) { this.player.hp = this.save.health; this.onMessage(`레벨 ${this.save.level} 달성!`); }
    // The gold is the boss's whole haul — ten heaps and nothing handed out on top (작업 195). Items
    // still come from the one chance roll every kill makes below, against the same field drop table
    // (the boss rates for a boss), so a boss never leaves five guaranteed pieces behind.
    const guaranteed = this.save.tutorial === 0 && !enemy.boss, boss = enemy.boss;
    // 한 마리당 **한 번만** 굴려 아이템 1개(작업 210, 사용자 지시 `#4628`): 장비 70% · 스킬북 30%.
    if (guaranteed) {
      this.drops.push({ x: enemy.x, y: enemy.y, item: rollItem(this.save.floor, true, boss, this.job), age: 0, warned: false });
      this.save.tutorial = 1; this.onMessage(`${starterWeaponName(this.job)}이(가) 떨어졌습니다. 잠시 뒤 자동으로 획득됩니다!`);
    } else if (random() < itemDropChance(this.save.floor, boss)) {
      const item = rollItemKind() === 'skillbook' ? rollSkillBook(this.save.floor, this.job) : rollItem(this.save.floor, false, boss, this.job);
      this.drops.push({ x: enemy.x, y: enemy.y, item, age: 0, warned: false });
    }
    if (enemy.boss) {
      if (this.save.autoClimb) {
        // 20층이 마지막 층이다(작업 204): 20층 보스를 처치해도 21층으로 넘어가지 않고 20층에 머문다.
        const capped = this.save.floor >= MAX_FLOOR;
        if (!capped) {
          this.save.floor++;
          this.save.maxFloor = Math.min(MAX_FLOOR, Math.max(this.save.maxFloor, this.save.floor));
        }
        this.enemies = [];
        this.chaseTarget = undefined; this.pursuing = false;
        this.activeMove = { x: 0, y: 0 };
        this.spawnTimer = .2;
        this.save.floorKills = 0;
        this.bossPending = false;
        // 다음 층으로 올라갔으니 재도전 기록도 지운다(작업 223) — 새로고침해도 버튼이 돌아오지 않는다.
        this.bossRetryAvailable = false;
        this.save.bossRetryFloor = 0;
        this.onMessage(capped ? `최고 ${MAX_FLOOR}층 달성! ${MAX_FLOOR}층에서 계속 사냥합니다.` : `${this.save.floor}층 진입`);
      } else {
        this.save.floorKills = 0;
        this.bossPending = false;
        this.bossRetryAvailable = this.save.floor < MAX_FLOOR;
        this.save.bossRetryFloor = this.bossRetryAvailable ? this.save.floor : 0;
        this.onMessage(this.save.floor >= MAX_FLOOR ? `${this.save.floor}층 반복 사냥 · 최고 ${MAX_FLOOR}층` : `${this.save.floor}층 반복 사냥`);
      }
    } else {
      this.save.floorKills++;
      // 일반 몹 30마리마다 정예 한 마리(작업 206). 정예 자신은 다음 정예의 카운트에 넣지 않는다.
      if (!enemy.elite) {
        this.eliteKills++;
        if (this.eliteKills >= ELITE_KILL_INTERVAL) { this.eliteKills = 0; this.elitePending = true; }
      }
      if (!this.bossFloor()) {
        // 아래층 반복 사냥에는 보스가 없다(작업 210).
        // 작업 245: 자동 등반이 **켜져** 있으면 아래층에서도 목표를 채울 때마다 한 층씩 올라간다.
        // 자동 등반이 꺼진 상태(강등 직후 등)에는 예전처럼 목표를 0으로 돌리고 그 층에서 계속 사냥한다.
        if (this.save.floorKills >= floorKillTarget(this.save.floor)) {
          if (this.save.autoClimb) {
            this.save.floor++;
            this.save.floorKills = 0;
            this.enemies = []; this.chaseTarget = undefined; this.pursuing = false;
            this.spawnTimer = .2; this.elitePending = false;
            this.onMessage(`${this.save.floor}층 진입`);
          } else {
            this.save.floorKills = 0;
          }
        }
      } else if (this.save.autoClimb && this.save.floorKills >= floorKillTarget(this.save.floor) && !this.bossPending && !this.enemies.some(e => e.boss)) {
        // 자동 등반 중이면 목표를 채울 때마다 보스가 저절로 온다(작업 212 `#5017`).
        // 보스에게 지고 1마리부터 다시 잡는 중에도 여기로 다시 보스가 나타난다.
        this.bossPending = true;
        this.onMessage(`${floorKillTarget(this.save.floor)}마리 처치! 해골 군주가 나타납니다!`);
      }
    }
    this.onChange();
  }

  update(dt: number): void {
    if (this.paused) return;
    this.save.playSeconds += Math.max(0, dt);
    const p = this.player;
    for (const kind of Object.keys(this.cooldown) as Action[]) this.cooldown[kind] = Math.max(0, this.cooldown[kind] - dt);
    this.attackPose = Math.max(0, this.attackPose - dt);
    this.weaponNotice = Math.max(0, this.weaponNotice - dt);
    p.berserk = Math.max(0, p.berserk - dt);
    p.hit = Math.max(0, p.hit - dt);
    // 딜레이 크러싱 10연타 — 타격 간격이 지난 만큼 한 타씩 판정하고, 10타가 끝나면 시퀀스를 닫는다(작업 212).
    if (this.crush) {
      const crush = this.crush;
      crush.elapsed += dt;
      while (crush.hits < crushHits && crush.elapsed >= crush.next) {
        crush.next += crushInterval;
        this.crushStrike();
      }
      if (crush.hits >= crushHits) {
        this.crush = undefined;
        this.attackPoseSpan = .32;
      }
    }
    // 잔상은 스스로 나이를 먹고 사라진다 — 마지막 타 뒤 약 0.3초면 목록이 비고 본체만 남는다(요구 6).
    for (const image of this.afterimages) image.age += dt;
    this.afterimages = this.afterimages.filter(image => image.age < image.duration);
    this.activeMove = { x: 0, y: 0 };
    // Ground loot comes to the hero on its own (see the drop loop below), so hunting only ever
    // walks toward an enemy and keeps the hero in the fight instead of on the way to a coin.
    const destination = this.nearest();
    if (destination) {
      const dx = destination.x - p.x, dy = destination.y - p.y, distance = Math.hypot(dx, dy);
      if (destination !== this.chaseTarget) { this.chaseTarget = destination; this.pursuing = false; }
      // Keep the production boundary fix while loot now flies to the hero.
      // 궁수·마법사는 사거리 밖에서만 다가가고, 사거리 안에서는 서서 쏜다(작업 157·159).
      const stopRange = this.job === 'archer' ? archerStopRange : this.job === 'mage' ? mageStopRange : WARRIOR_ATTACK_RANGE;
      const attackRange = this.job === 'archer' ? archerAttackRange : this.job === 'mage' ? mageAttackRange : WARRIOR_ATTACK_RANGE;
      const engageRange = this.job === 'archer' ? archerAttackRange + 24 : this.job === 'mage' ? mageAttackRange + 24 : 190;
      this.pursuing = distance >= stopRange;
      this.activeMove = this.pursuing && distance > 0 ? { x: dx / distance, y: dy / distance } : { x: 0, y: 0 };
      if (distance > 1) this.faceTarget(destination);
      if (distance < engageRange) {
        if (distance <= attackRange) this.action('attack');
        for (const skill of this.save.quickSlots) {
          if (!skill || !this.save.learned.includes(skill) || this.cooldown[skill] > 0 || distance > skillRange(skill, skillLevel(this.save, skill))) continue;
          this.action(skill);
        }
      }
    } else { this.chaseTarget = undefined; this.pursuing = false; this.activeMove = { x: 0, y: 0 }; }
    const magnitude = Math.hypot(this.activeMove.x, this.activeMove.y);
    if (magnitude > .05) {
      const speed = (p.berserk > 0 ? 160 + (p.berserkLevel - 1) * 4 : 125) * dt / Math.max(1, magnitude);
      const next = clampArenaPoint(p.x + this.activeMove.x * speed, p.y + this.activeMove.y * speed);
      this.activeMove = { x: next.x - p.x, y: next.y - p.y };
      p.x = next.x; p.y = next.y;
    }
    if (this.attackHeld) this.action('attack');
    this.spawnTimer -= dt;
    // 보스전(보스 예약·보스 생존) 중에는 **일반 몹을 부르지 않는다**(작업 212 `#5017`) —
    // `⚔ 보스 도전`으로 시작한 승부는 보스와 단독으로 붙는다.
    const bossFight = this.bossPending || this.enemies.some(enemy => enemy.boss);
    if (this.spawnTimer <= 0 && (bossFight || this.enemies.length < MOB_CAP)) {
      this.spawnTimer = Math.max(.55, 1.8 - this.save.floor * .08);
      const angle = random() * Math.PI * 2;
      const boss = this.bossFloor() && this.bossPending && !this.enemies.some(enemy => enemy.boss);
      // 보스 타이밍과 겹치면 보스가 우선한다 — 정예 예약은 다음 스폰으로 미룬다(작업 206).
      const elite = !boss && this.elitePending;
      if (bossFight && !boss) {
        // 보스전 중에는 빈 타이머만 돌리고 아무도 부르지 않는다(정예 예약도 미룬다).
        this.spawnTimer = .4;
      } else {
        // 필드 외곽 밴드에서 **랜덤한 거리**로 뜬다(작업 230) — 각도만 흔들면 매번 같은 경계선 한 줄에서
        // 나타나 코앞에 튀어나오는 것처럼 보인다. 거리 비율도 함께 굴려 멀리서 제각각 걸어 들어오게 한다.
        const spawn = spawnArenaEnemy(p, angle, fieldSpawnBand.near + random() * (fieldSpawnBand.far - fieldSpawnBand.near));
        const hp = enemyMaxHp(this.save.floor, boss) * (elite ? ELITE_HP_SCALE : 1);
        if (boss) {
          // 층 보스는 **체력이 꽉 찬 상태로** 맞이한다(작업 222, 사용자 요청 `#5811` "층보스 떴을때 체력 꽉찬
          // 상태로 싸우게 해줘"). 자동 등반 중 소환과 `⚔ 보스 도전` 재도전 소환 모두 이 블록으로 합류한다.
          this.player.hp = totalStats(this.save).health; this.save.health = this.player.hp;
          // 스킬 쿨타임도 함께 0으로 돌린다(작업 223, 사용자 요청 `#6108` "보스 도전 때 스킬 쿨도 돌려줘").
          for (const kind of Object.keys(this.cooldown) as Action[]) this.cooldown[kind] = 0;
          // 보스가 나오는 순간 남은 일반 몹은 정리한다 — 보스만 단독으로 상대하게(작업 212).
          this.enemies = this.enemies.filter(enemy => enemy.boss);
          this.chaseTarget = undefined; this.pursuing = false;
        }
        this.enemies.push({ x: spawn.x, y: spawn.y, hp, maxHp: hp, boss, elite, hit: 0, step: random() * Math.PI * 2, moving: false, knockX: 0, knockY: 0, slow: 0 });
        if (boss) this.bossPending = false;
        if (elite) { this.elitePending = false; this.onMessage('정예 해골이 나타났습니다!'); }
      }
    }
    // 몹이 상한(30마리)까지 쌓이면 한 층 내려간다(작업 222, 사용자 요청 `#5827`). 보스전 중에는
    // 보스 한 마리만 서므로 해당되지 않고, 1층에는 더 내려갈 층이 없어 30마리 상한만 지킨다.
    // 바닥에 떨어진 드랍·금화(`this.drops`)는 그대로 두어 잃지 않는다.
    if (this.enemies.length >= MOB_CAP && this.save.floor > 1) {
      this.save.floor--;
      this.save.floorKills = 0;
      this.enemies = [];
      this.chaseTarget = undefined; this.pursuing = false;
      this.bossPending = false; this.elitePending = false; this.spawnTimer = .2;
      // 자동 등반은 **강등당했을 때만** 꺼진다(작업 245). 다시 켜면 이 층부터 목표를 채워 한 층씩 올라가고,
      // `⚔ 보스 도전`은 그대로 남아 최고층 보스에게 다시 도전할 수 있다.
      this.save.autoClimb = false;
      this.onMessage(`적이 너무 많아 ${this.save.floor}층으로 내려갑니다. 자동 등반이 중단됩니다.`);
      this.onChange();
    }
    for (const enemy of this.enemies) {
      const dx = p.x - enemy.x, dy = p.y - enemy.y, d = Math.hypot(dx, dy);
      enemy.attack = Math.max(0, (enemy.attack ?? 0) - dt);
      // 적은 공격 사거리(90) 안으로 들어오면 때리고, 서는 자리는 60까지다(작업 254) —
      // 종전에는 히어로 몸(27)까지 파고들어 여러 마리가 한 점에 겹쳐 섰다.
      enemy.moving = d > ENEMY_STOP_RANGE;
      if (enemy.moving && d > 0) { const step = enemyMoveSpeed(this.save.floor, enemy.boss) * (enemy.slow > 0 ? .55 : 1) * dt; enemy.x += dx / d * step; enemy.y += dy / d * step; enemy.step += dt * Math.PI * (enemy.boss ? 3.25 : 4.25); }
      enemy.x += enemy.knockX * dt; enemy.y += enemy.knockY * dt;
      // 적은 아레나가 아니라 **필드 경계**로 자른다(작업 230) — 아레나로 자르면 멀리 스폰된 적이 첫
      // 프레임에 플레이어 코앞으로 순간이동해 버린다. 플레이어는 계속 아레나 안에 머문다.
      const bounded = clampFieldPoint(enemy.x, enemy.y); enemy.x = bounded.x; enemy.y = bounded.y;
      enemy.knockX *= Math.exp(-dt * 12); enemy.knockY *= Math.exp(-dt * 12);
      enemy.slow = Math.max(0, enemy.slow - dt);
      if (d <= ENEMY_ATTACK_RANGE && p.hit <= 0) {
        // 적의 공격 모션(작업 245): 때리는 적이 플레이어 쪽으로 내딛는다(`enemy.attack`).
        enemy.attack = ENEMY_STRIKE_SECONDS;
        // 추가옵션 회피율(작업 238, 합산 상한 30%): 맞을 순간 한 번 굴려 성공하면 피해를 통째로 무시하고
        // `회피`를 띄운다. `p.hit`을 그대로 세워 두어 프레임마다 다시 굴리지 않는다(연속 회피로 무적이 되지 않게).
        const evasion = effectiveExtraOptions(this.save.equipment).evasionPct;
        const evaded = evasion > 0 && random() < evasion / 100;
        p.hit = .85;
        if (evaded) {
          this.effects.push({ x: p.x, y: p.y, kind: 'evade', age: 0, duration: .7, angle: Math.PI / 2 });
          enemy.hit = Math.max(0, enemy.hit - dt);
          continue;
        }
        const taken = enemyHitDamage(this.save.floor, enemy.boss, totalStats(this.save).defense);
        p.hp = Math.max(0, p.hp - taken);
        // 맞은 표시 — 적이 할퀴고 지나간 자국과 잃은 체력 숫자(작업 245).
        this.effects.push({ x: p.x, y: p.y, kind: 'enemyStrike', age: 0, duration: .5, angle: Math.atan2(dy, dx), amount: taken });
        if (p.hp <= 0) {
          // 보스에게 쓰러졌고 최고층에서 자동 등반 중이면(작업 212 `#5017`·`#5028`) 자동 등반을
          // 끄지 않는다 — 1마리부터 다시 잡게 킬 카운트를 0으로 돌리고, 보스는 물러나게 한다.
          // 목표 마릿수를 채우면 `kill()`의 기존 규칙이 보스를 자동으로 다시 부른다.
          const climbOn = this.save.autoClimb && this.bossFloor() && enemy.boss;
          this.crush = undefined; this.afterimages = []; this.attackPoseSpan = .32;
          if (climbOn) {
            this.save.floorKills = 0;
            this.bossPending = false;
            this.bossRetryAvailable = true;
            // 진 층을 세이브에 남긴다(작업 223) — 새로고침·재접속에도 `⚔ 보스 도전`이 살아 있다.
            this.save.bossRetryFloor = this.save.floor;
            this.enemies = this.enemies.filter(other => !other.boss);
          } else if (this.bossFloor() && enemy.boss) {
            // 자동 등반이 꺼진 채 보스에게 진 경우에만 도전 버튼을 살린다(작업 222, 사용자 확인 `#5792`).
            // 일반·정예 몹에게 진 것으로는 켜지 않고, 이미 보스에게 져서 켜져 있던 상태도 건드리지 않는다.
            this.bossRetryAvailable = true;
            // 진 층을 세이브에 남긴다(작업 223) — 4층으로 올라갈 때까지 버튼이 유지된다.
            this.save.bossRetryFloor = this.save.floor;
          }
          // 작업 245: 일반·정예 몹에게 쓰러져도 자동 등반은 **끄지 않는다** — 10골드를 잃고 부활해 계속
          // 사냥한다. 자동 등반이 꺼지는 곳은 몹이 쌓여 한 층 강등될 때(위 `MOB_CAP` 블록)뿐이다.
          p.hp = totalStats(this.save).health; this.save.health = p.hp; p.x = 0; p.y = 0; this.chaseTarget = undefined; this.pursuing = false;
          this.regenClock = 0;
          this.save.gold = Math.max(0, this.save.gold - 10);
          this.onMessage(climbOn
            ? '쓰러졌습니다. 10골드를 잃고 부활했습니다. 1마리부터 다시 잡으면 보스가 다시 나타납니다.'
            : this.save.autoClimb
              ? '쓰러졌습니다. 10골드를 잃고 부활했습니다. 자동 등반은 계속됩니다.'
              : '쓰러졌습니다. 10골드를 잃고 부활했습니다.');
          this.onChange();
        }
      }
      enemy.hit = Math.max(0, enemy.hit - dt);
    }
    // 추가옵션 체력회복력(작업 238): 5초마다 최대 체력의 N%를 회복한다(합산 상한 12%). 체력이 가득이면
    // 타이머를 비워, 피가 빠진 순간부터 다시 5초를 센다.
    const regenPct = effectiveExtraOptions(this.save.equipment).regenPct;
    if (regenPct > 0 && p.hp > 0 && p.hp < totalStats(this.save).health) {
      this.regenClock += dt;
      while (this.regenClock >= EXTRA_REGEN_SECONDS) {
        this.regenClock -= EXTRA_REGEN_SECONDS;
        const maxHp = totalStats(this.save).health;
        if (p.hp >= maxHp) break;
        const heal = Math.max(1, Math.ceil(maxHp * regenPct / 100)), before = p.hp;
        p.hp = Math.min(maxHp, p.hp + heal);
        this.effects.push({ x: p.x, y: p.y, kind: 'heal', age: 0, duration: .8, angle: Math.PI / 2, amount: Math.round(p.hp - before) });
      }
    } else this.regenClock = 0;
    // A drop rests on the ground for a beat, then is pulled to wherever the hero stands now. A full
    // bag keeps it on the ground (it still expires as before) and it flies in once there is room.
    for (const drop of this.drops) {
      drop.age += dt;
      if (drop.absorb === undefined) {
        if (drop.age < LOOT_REST_SECONDS) continue;
        // A piece auto-salvage will take needs no bag room, so it flies in even when the bag is full.
        if (!canStoreItem(this.save.bag, drop.item, this.job) && !this.sweeps(drop.item)) {
          // 가방 40칸 만석(작업 209): 새 장비를 두기 전에 가방 안의 설정 이하 장비를 먼저 분해해 칸을 만든다.
          // 40칸에는 타직업 스킬북·보물 주머니도 포함한다(내 직업 스킬북 제외, 작업 253).
          if (!this.sweepFullBag()) {
            if (!drop.warned) { drop.warned = true; this.onMessage('가방이 가득 찼습니다. 아이템을 분해하거나 공용창고에 보관하세요.'); }
            continue;
          }
        }
        drop.absorb = drop.age;
      }
      if (drop.age - drop.absorb < LOOT_ABSORB_SECONDS) continue;
      // 접속 중 자동 분해 (작업 196): a piece at or below the chosen grade, unlocked, in a filled slot
      // and no better than what is worn becomes gold and stones here, and never reaches the bag.
      const sweep = this.sweeps(drop.item);
      if (sweep && autoSalvageRecovered(this.save, drop.item, sweep, this.autoSalvagePlus?.())) {
        drop.age = -1;
        this.onChange();
        continue;
      }
      // 날아온 사이에 다른 드롭이 먼저 칸을 채웠을 수 있다 — 넣기 **직전에** 다시 확인한다(작업 248).
      // (같은 프레임에 여러 개가 흡수를 시작해도 가방이 40칸을 넘지 않는다.)
      if (!canStoreItem(this.save.bag, drop.item, this.job)) {
        if (!this.sweepFullBag() || !canStoreItem(this.save.bag, drop.item, this.job)) {
          drop.absorb = undefined;
          if (!drop.warned) { drop.warned = true; this.onMessage('가방이 가득 찼습니다. 아이템을 분해하거나 공용창고에 보관하세요.'); }
          continue;
        }
      }
      this.save.bag.push(drop.item);
      drop.age = -1;
      if (drop.item.name === starterWeaponName(this.job) && this.save.tutorial === 1) this.save.tutorial = 2;
      this.onMessage(`${itemDisplayName(drop.item)} 획득!`);
      this.onChange();
    }
    this.drops = this.drops.filter(d => d.age >= 0 && (d.age < 90 || (d.item.name === starterWeaponName(this.job) && this.save.tutorial < 3)));
    // Coins are only what the field draws: the gold was paid at the kill and nothing is added here.
    for (const coin of this.coins) coin.age += dt;
    this.coins = this.coins.filter(coin => coin.age < LOOT_REST_SECONDS + LOOT_ABSORB_SECONDS);
    for (const effect of [...this.effects]) {
      effect.age += dt;
      // 화살은 도착한 순간에만 판정한다 — 날아가는 동안에는 맞지 않는다(작업 157).
      if (effect.kind === 'shot') {
        // 적이 살아 있으면 날아가는 동안에도 도착지를 따라간다(빗나감 방지).
        if (effect.aim && this.enemies.includes(effect.aim)) { effect.tx = effect.aim.x; effect.ty = effect.aim.y; }
        if (!effect.fired && effect.age >= effect.duration) {
          effect.fired = true;
          this.damage(effect.radius ?? 40, effect.power ?? 0, effect.angle, Math.PI, 10, effect.slow ?? 0, { x: effect.tx ?? effect.x, y: effect.ty ?? effect.y }, effect.targets ?? 1);
        }
        continue;
      }
      // 딜레이 크러싱 연출은 지금 때리는 적의 자리를 따라간다(작업 212).
      if (effect.kind === 'crushing' && effect.aim && this.enemies.includes(effect.aim)) { effect.x = effect.aim.x; effect.y = effect.aim.y; }
      while (effect.nextHit !== undefined && effect.nextHit < effect.duration && effect.nextHit <= effect.age) {
        const level = effect.level ?? 1;
        // 이단참(작업 213): 한 번 발동에 두 번 때린다. 타마다 사거리·부채꼴을 그 순간의 적 배치로
        // 다시 재고, `damage()`가 타마다 데미지 팝업을 따로 띄운다. 두 타가 끝나면 `nextHit`을 비운다.
        if (effect.kind === 'slash2') {
          const swing = slash2Hits[effect.hits ?? 0] ?? slash2Hits[0];
          this.damage(skillRange('slash2', level), (effect.power ?? 0) * swing.power, effect.angle, .9, swing.knockback, 0, effect);
          effect.hits = (effect.hits ?? 0) + 1;
          effect.nextHit = slash2Hits[effect.hits]?.at;
          continue;
        }
        if (effect.kind === 'spin') {
          const hitProgress = (effect.nextHit ?? effect.age) / effect.duration;
          this.damage(skillRange('spin', level) * dragonOrbitFactor(hitProgress), effect.power ?? 0, 0, Math.PI, 10, 0, effect);
        }
        if (effect.kind === 'slam') this.damage(skillRange('slam', level), effect.power ?? 0, effect.angle, 1.35, 12, 2 + (level - 1) * .3, effect);
        if (effect.kind === 'hell') this.damage(skillRange('hell', level), effect.power ?? 0, 0, Math.PI, 14, 1 + (level - 1) * .2, effect);
        if (effect.kind === 'rain') this.damage(92, effect.power ?? 0, 0, Math.PI, 6, .9, effect);
        if (effect.kind === 'burst') this.damage(effect.radius ?? 96, effect.power ?? 0, 0, Math.PI, 16, effect.slow ?? 0, effect);
        if (effect.kind === 'nova') this.damage(effect.radius ?? 150, effect.power ?? 0, 0, Math.PI, 22, effect.slow ?? 0, effect);
        if (effect.kind === 'burst' || effect.kind === 'nova') effect.nextHit = undefined;
        else effect.nextHit += effect.kind === 'spin' || effect.kind === 'slam' ? .45 : .4;
      }
    }
    this.effects = this.effects.filter(e => e.age < e.duration);
    this.save.health = p.hp;
  }
}
