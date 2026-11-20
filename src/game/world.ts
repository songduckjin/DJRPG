import { canStoreItem } from './bagCapacity';
import { bossGoldPiles, bossGoldSpot } from './bossLoot';
import { addExperience, floorKillTarget, MAX_FLOOR, rollItem, skillLevel, totalStats, type Item, type Rarity, type Save } from './store';
import { equipmentDropChance, itemDisplayName, rollSkillBook, skillBookDropChance, starterWeaponName } from './items';
import { dragonOrbitFactor, skillDamageScale, skillDuration, skillRange, skills, type Job, type SkillId } from './skills';
import { jobOrDefault } from './skills';
import { clampArenaPoint, spawnArenaEnemy } from './arena';
import { LOOT_ABSORB_SECONDS, LOOT_REST_SECONDS } from './loot';
import { autoSalvageBlock, autoSalvageRecovered } from './inventory';

export type Enemy = { x: number; y: number; hp: number; maxHp: number; boss: boolean; hit: number; step: number; moving: boolean; knockX: number; knockY: number; slow: number;
  /** 정예 몹(작업 206) — 일반 몹 30마리마다 한 마리. 보스 타이밍이 오면 보스가 우선이라 둘은 같이 서지 않는다. */
  elite?: boolean };
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
  | 'shot' | 'rain' | 'hawk' | 'burst' | 'nova' | 'ward'; age: number; duration: number; angle: number; swing?: number; amount?: number; nextHit?: number; power?: number; level?: number;
  /** 궁수 화살·화살비처럼 날아가서 맞는 이펙트의 도착지점과 위력(작업 157). */
  tx?: number; ty?: number; radius?: number; targets?: number; slow?: number; variant?: ArrowVariant; fired?: boolean;
  /** 화살이 쫓아가는 적(살아 있는 동안 도착지를 갱신한다). 없으면 발사 시점의 지점으로 날아간다. */
  aim?: Enemy;
  /** 이 이펙트를 만든 스킬(스킬 버튼 피드백용). 평타면 없다. */
  source?: SkillId };
export type ArrowVariant = 'normal' | 'ice' | 'pierce' | 'snipe' | 'volley' | 'arcane' | 'fire' | 'frost' | 'chain' | 'meteor';
export type Action = 'attack' | SkillId;
export const cooldowns = { attack: .48, ...Object.fromEntries(Object.keys(skills).map(id => [id, skills[id as SkillId].cooldown])) } as Record<Action, number>;
/** 평타 한 방의 공격력 배율. 한 마리만 맞히는 대신 한 방이 무겁다(작업 150). */
export const basicAttackPower = 1.6;
/** 궁수가 서서 쏘는 거리와 추격을 멈추는 거리(작업 157). */
/** 궁수 평타 사거리와, 이보다 멀 때만 다가가는 거리(작업 157).
 *  아레나는 중심에서 153px 남짓이라, 사거리 250이면 사실상 화면 안의 적을 모두 쏠 수 있고
 *  추격은 적이 꽤 가까워졌을 때만 한다. */
export const archerAttackRange = 250;
export const archerStopRange = 118;
/** 마법사도 원거리다 — 궁수보다 조금 짧은 사거리에서 마법 구슬을 날린다(작업 198). */
export const mageAttackRange = 240;
export const mageStopRange = 118;
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
export function enemyHitDamage(floor: number, boss: boolean, defense: number): number { return Math.max(1, Math.round(boss ? 20 + floor * 5.5 + Math.pow(floor, 1.3) * 1.2 : 7 + floor * 2.4 + Math.pow(floor, 1.25) * .5) - defense * .2); }

export class World {
  player = { x: 0, y: 0, facing: 0, facingSide: 1, hp: 100, berserk: 0, berserkLevel: 1, hit: 0 };
  enemies: Enemy[] = [];
  drops: Drop[] = [];
  coins: Coin[] = [];
  effects: Effect[] = [];
  cooldown: Record<Action, number> = Object.fromEntries(Object.keys(cooldowns).map(id => [id, 0])) as Record<Action, number>;
  spawnTimer = 0;
  paused = false;
  attackHeld = false;
  attackPose = 0;
  activeMove = { x: 0, y: 0 };
  bossPending = false;
  /** 정예 몹 처치 카운터(작업 206) — 30마리가 되면 다음 스폰을 정예로 예약한다. */
  eliteKills = 0;
  elitePending = false;
  private swing = 1;
  private chaseTarget?: Enemy;
  private pursuing = false;
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

  constructor(public save: Save) {
    this.save.auto = true;    this.player.hp = Math.min(save.health, totalStats(save).health);
    this.bossPending = save.floorKills >= floorKillTarget(save.floor);
    const hp = enemyMaxHp(save.floor, false);
    const start = clampArenaPoint(145, -45);
    this.enemies.push({ x: start.x, y: start.y, hp, maxHp: hp, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
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
    this.bossPending = false; this.eliteKills = 0; this.elitePending = false; this.spawnTimer = 0;
    this.player.x = 0; this.player.y = 0; this.attackHeld = false;
    this.activeMove = { x: 0, y: 0 };
    this.chaseTarget = undefined; this.pursuing = false;
    this.onChange();
    return { ok: true, message: `${floor}층으로 이동했습니다.${lostDrops ? ` 바닥의 드랍 ${lostDrops}개가 사라졌습니다.` : ''}` };
  }

  action(kind: Action | null): void {
    if (this.paused || !kind) return;
    if (kind !== 'warcry' && Math.hypot(this.activeMove.x, this.activeMove.y) > .05) return;
    if (this.cooldown[kind] > 0) return;
    if (kind !== 'attack' && (!this.save.learned.includes(kind) || !this.save.quickSlots.includes(kind))) { this.onMessage('습득하고 퀵슬롯에 장착한 스킬만 사용할 수 있습니다.'); return; }
    const p = this.player;
    const level = kind === 'attack' ? 1 : skillLevel(this.save, kind);
    const range = kind === 'attack' ? 90 : skillRange(kind, level);
    const damageScale = skillDamageScale(level);
    const stats = totalStats(this.save);
    this.cooldown[kind] = kind === 'attack' ? cooldowns.attack / (1 + stats.speed / 100) * (p.berserk > 0 ? 1 / (1.5 + (p.berserkLevel - 1) * .08) : 1) : cooldowns[kind];
    if (kind !== 'warcry') this.attackPose = .32;
    const attack = stats.attack * (p.berserk > 0 ? 1.5 + (p.berserkLevel - 1) * .05 : 1);
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
      this.damage(90, attack * basicAttackPower, angle, 1.15, 12, 0, p, 1);
    } else if (kind === 'slash2') {
      this.effects.push({ x: p.x, y: p.y, kind: 'slash2', age: 0, duration: skillDuration(kind, level), angle: p.facing, nextHit: .12, power: attack * 2.15 * damageScale, level });
    } else if (kind === 'spin') {
      this.effects.push({ x: p.x, y: p.y, kind: 'spin', age: 0, duration: skillDuration(kind, level), angle: 0, nextHit: .45, power: attack * .65 * damageScale, level });
      this.damage(range * dragonOrbitFactor(0), attack * 1.65 * damageScale, 0, Math.PI);
    } else if (kind === 'crushing') {
      const point = target && Math.hypot(target.x - p.x, target.y - p.y) <= range ? target : { x: p.x + Math.cos(p.facing) * range * .65, y: p.y + Math.sin(p.facing) * range * .65 };
      this.effects.push({ x: point.x, y: point.y, kind: 'crushing', age: 0, duration: skillDuration(kind, level), angle: p.facing, nextHit: .55, power: attack * 3.4 * damageScale, level });
    } else if (kind === 'slam') {
      this.effects.push({ x: p.x, y: p.y, kind: 'slam', age: 0, duration: skillDuration(kind, level), angle: p.facing, nextHit: .45, power: attack * .55 * damageScale, level });
      this.damage(range, attack * 2.2 * damageScale, p.facing, 1.35, 55, 2 + (level - 1) * .3);
    } else if (kind === 'warcry') {
      p.berserk = skillDuration(kind, level);
      p.berserkLevel = level;
      this.effects.push({ x: p.x, y: p.y, kind: 'warcry', age: 0, duration: .7, angle: 0 });
      for (const enemy of this.enemies) {
        const dx = enemy.x - p.x, dy = enemy.y - p.y, d = Math.hypot(dx, dy);
        if (d < 115 && d > 0) { const bounded = clampArenaPoint(enemy.x + dx / d * 40, enemy.y + dy / d * 40); enemy.x = bounded.x; enemy.y = bounded.y; }
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
      this.shoot(aim.x + (Math.random() - .5) * 16, aim.y + (Math.random() - .5) * 16, attack * 1.35 * damageScale, { speed: 900, delay: .08, arrow: 'normal', aim: target, source: kind });
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
        this.shoot(aim.x + (Math.random() - .5) * 30, aim.y + (Math.random() - .5) * 30, attack * .8 * damageScale, { speed: 940, radius: 34, delay: index * .13, arrow: 'volley', aim: target, source: kind });
      }
    } else if (kind === 'arrowRain') {
      const aim = this.aimPoint(target, range);
      this.effects.push({ x: aim.x, y: aim.y, kind: 'rain', age: 0, duration: skillDuration(kind, level), angle: 0, nextHit: .12, power: attack * .85 * damageScale, level, source: kind });
    } else if (kind === 'fireBolt') {
      const aim = this.aimPoint(target, range);
      this.shoot(aim.x, aim.y, attack * 2 * damageScale, { speed: 780, radius: 46, arrow: 'fire', aim: target, source: kind });
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

  /** 스킬을 쏠 지점 — 사거리 안의 가장 가까운 적, 없으면 정면 사거리 끝. */
  private aimPoint(target: Enemy | undefined, range: number): { x: number; y: number } {
    if (target && Math.hypot(target.x - this.player.x, target.y - this.player.y) <= range) return { x: target.x, y: target.y };
    return { x: this.player.x + Math.cos(this.player.facing) * range * .75, y: this.player.y + Math.sin(this.player.facing) * range * .75 };
  }

  /** 화살 하나를 쏜다. 도착하는 순간(`update`)에 그 지점 반경의 적에게 피해를 준다. */
  private shoot(tx: number, ty: number, power: number, options: { speed?: number; radius?: number; targets?: number; slow?: number; knockback?: number; delay?: number; arrow?: ArrowVariant; aim?: Enemy; source?: SkillId } = {}): void {
    const p = this.player;
    const dx = tx - p.x, dy = ty - p.y;
    const distance = Math.hypot(dx, dy);
    const delay = options.delay ?? 0;
    this.effects.push({
      x: p.x, y: p.y, kind: 'shot', age: 0, duration: Math.max(.05, distance / (options.speed ?? 820)) + delay,
      angle: Math.atan2(dy, dx), tx, ty, power, radius: options.radius ?? 40, targets: options.targets ?? 1,
      slow: options.slow ?? 0, variant: options.arrow ?? 'normal', level: this.save.level, aim: options.aim, source: options.source
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

  damage(radius: number, amount: number, angle: number, arc: number, knockback = 12, slow = 0, origin: { x: number; y: number } = this.player, maxTargets = Infinity): void {
    // 판정 대상은 사거리·부채꼴 안의 적. `maxTargets`를 주면 가까운 순으로 그 수만 맞는다(평타 1마리).
    const inRange: { enemy: Enemy; dx: number; dy: number; dist: number }[] = [];
    for (const enemy of this.enemies) {
      const dx = enemy.x - origin.x, dy = enemy.y - origin.y, dist = Math.hypot(dx, dy);
      const diff = Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle));
      if (dist > radius || Math.abs(diff) > arc) continue;
      inRange.push({ enemy, dx, dy, dist });
    }
    const targets = inRange.length > maxTargets ? inRange.sort((a, b) => a.dist - b.dist).slice(0, maxTargets) : inRange;
    for (const { enemy, dx, dy, dist } of targets) {
      enemy.hp -= amount;
      enemy.hit = .24;
      enemy.slow = Math.max(enemy.slow, slow);
      if (knockback && dist) { enemy.knockX += dx / dist * knockback * 16; enemy.knockY += dy / dist * knockback * 16; }
      this.effects.push({ x: enemy.x, y: enemy.y, kind: 'hit', age: 0, duration: .45, angle: Math.random() * Math.PI * 2, amount: Math.round(amount) });
    }
    const dead = this.enemies.filter(e => e.hp <= 0);
    this.enemies = this.enemies.filter(e => e.hp > 0);
    for (const enemy of dead) this.kill(enemy);
  }

  kill(enemy: Enemy): void {
    this.effects.push({ x: enemy.x, y: enemy.y, kind: 'death', age: 0, duration: .7, angle: Math.random() * Math.PI * 2 });
    this.save.kills++;
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
    const gained = addExperience(this.save, enemy.boss ? 45 : 8 * (enemy.elite ? ELITE_REWARD_SCALE : 1));
    if (gained) { this.player.hp = this.save.health; this.onMessage(`레벨 ${this.save.level} 달성!`); }
    // The gold is the boss's whole haul — ten heaps and nothing handed out on top (작업 195). Items
    // still come from the one chance roll every kill makes below, against the same field drop table
    // (the boss rates for a boss), so a boss never leaves five guaranteed pieces behind.
    const guaranteed = this.save.tutorial === 0 && !enemy.boss, boss = enemy.boss;
    if (guaranteed || Math.random() < equipmentDropChance(this.save.floor, boss)) {
      this.drops.push({ x: enemy.x, y: enemy.y, item: rollItem(this.save.floor, guaranteed, boss, this.job), age: 0, warned: false });
      if (guaranteed) { this.save.tutorial = 1; this.onMessage(`${starterWeaponName(this.job)}이(가) 떨어졌습니다. 잠시 뒤 자동으로 획득됩니다!`); }
    }
    if (Math.random() < skillBookDropChance(this.save.floor, boss)) {
      this.drops.push({ x: enemy.x, y: enemy.y, item: rollSkillBook(this.save.floor, this.job), age: 0, warned: false });
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
        this.onMessage(capped ? `최고 ${MAX_FLOOR}층 달성! ${MAX_FLOOR}층에서 계속 사냥합니다.` : `${this.save.floor}층 진입`);
      } else {
        this.save.floorKills = 0;
        this.bossPending = false;
        this.onMessage(this.save.floor >= MAX_FLOOR ? `${this.save.floor}층 반복 사냥 · 최고 ${MAX_FLOOR}층` : `${this.save.floor}층 반복 사냥`);
      }
    } else {
      this.save.floorKills++;
      // 일반 몹 30마리마다 정예 한 마리(작업 206). 정예 자신은 다음 정예의 카운트에 넣지 않는다.
      if (!enemy.elite) {
        this.eliteKills++;
        if (this.eliteKills >= ELITE_KILL_INTERVAL) { this.eliteKills = 0; this.elitePending = true; }
      }
      if (this.save.floorKills >= floorKillTarget(this.save.floor) && !this.bossPending && !this.enemies.some(e => e.boss)) {
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
    p.berserk = Math.max(0, p.berserk - dt);
    p.hit = Math.max(0, p.hit - dt);
    this.activeMove = { x: 0, y: 0 };
    // Ground loot comes to the hero on its own (see the drop loop below), so hunting only ever
    // walks toward an enemy and keeps the hero in the fight instead of on the way to a coin.
    const destination = this.nearest();
    if (destination) {
      const dx = destination.x - p.x, dy = destination.y - p.y, distance = Math.hypot(dx, dy);
      if (destination !== this.chaseTarget) { this.chaseTarget = destination; this.pursuing = false; }
      // Keep the production boundary fix while loot now flies to the hero.
      // 궁수·마법사는 사거리 밖에서만 다가가고, 사거리 안에서는 서서 쏜다(작업 157·159).
      const stopRange = this.job === 'archer' ? archerStopRange : this.job === 'mage' ? mageStopRange : 90;
      const attackRange = this.job === 'archer' ? archerAttackRange : this.job === 'mage' ? mageAttackRange : 90;
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
    if (this.spawnTimer <= 0 && this.enemies.length < 18) {
      this.spawnTimer = Math.max(.55, 1.8 - this.save.floor * .08);
      const angle = Math.random() * Math.PI * 2;
      const boss = this.bossPending && !this.enemies.some(e => e.boss);
      // 보스 타이밍과 겹치면 보스가 우선한다 — 정예 예약은 다음 스폰으로 미룬다(작업 206).
      const elite = !boss && this.elitePending;
      const spawn = spawnArenaEnemy(p, angle);
      const hp = enemyMaxHp(this.save.floor, boss) * (elite ? ELITE_HP_SCALE : 1);
      this.enemies.push({ x: spawn.x, y: spawn.y, hp, maxHp: hp, boss, elite, hit: 0, step: Math.random() * Math.PI * 2, moving: false, knockX: 0, knockY: 0, slow: 0 });
      if (boss) this.bossPending = false;
      if (elite) { this.elitePending = false; this.onMessage('정예 해골이 나타났습니다!'); }
    }
    for (const enemy of this.enemies) {
      const dx = p.x - enemy.x, dy = p.y - enemy.y, d = Math.hypot(dx, dy);
      enemy.moving = d > 27;
      if (enemy.moving && d > 0) { const step = enemyMoveSpeed(this.save.floor, enemy.boss) * (enemy.slow > 0 ? .55 : 1) * dt; enemy.x += dx / d * step; enemy.y += dy / d * step; enemy.step += dt * Math.PI * (enemy.boss ? 3.25 : 4.25); }
      enemy.x += enemy.knockX * dt; enemy.y += enemy.knockY * dt;
      const bounded = clampArenaPoint(enemy.x, enemy.y); enemy.x = bounded.x; enemy.y = bounded.y;
      enemy.knockX *= Math.exp(-dt * 12); enemy.knockY *= Math.exp(-dt * 12);
      enemy.slow = Math.max(0, enemy.slow - dt);
      if (d < 35 && p.hit <= 0) {
        p.hp = Math.max(0, p.hp - enemyHitDamage(this.save.floor, enemy.boss, totalStats(this.save).defense));
        p.hit = .85;
        if (p.hp <= 0) { this.save.autoClimb = false; p.hp = totalStats(this.save).health; this.save.health = p.hp; p.x = 0; p.y = 0; this.save.gold = Math.max(0, this.save.gold - 10); this.onMessage('쓰러졌습니다. 10골드를 잃고 부활했습니다. 자동 등반이 중단됩니다.'); this.onChange(); }
      }
      enemy.hit = Math.max(0, enemy.hit - dt);
    }
    // A drop rests on the ground for a beat, then is pulled to wherever the hero stands now. A full
    // bag keeps it on the ground (it still expires as before) and it flies in once there is room.
    for (const drop of this.drops) {
      drop.age += dt;
      if (drop.absorb === undefined) {
        if (drop.age < LOOT_REST_SECONDS) continue;
        // A piece auto-salvage will take needs no bag room, so it flies in even when the bag is full.
        if (!canStoreItem(this.save.bag, drop.item) && !this.sweeps(drop.item)) {
          if (!drop.warned) { drop.warned = true; this.onMessage('가방이 가득 찼습니다. 장비를 분해하세요.'); }
          continue;
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
      while (effect.nextHit !== undefined && effect.nextHit < effect.duration && effect.nextHit <= effect.age) {
        const level = effect.level ?? 1;
        if (effect.kind === 'slash2') this.damage(skillRange('slash2', level), effect.power ?? 0, effect.angle, .9, 12, 0, effect);
        if (effect.kind === 'spin') {
          const hitProgress = (effect.nextHit ?? effect.age) / effect.duration;
          this.damage(skillRange('spin', level) * dragonOrbitFactor(hitProgress), effect.power ?? 0, 0, Math.PI, 10, 0, effect);
        }
        if (effect.kind === 'crushing') this.damage(skillRange('crushing', level) * .72, effect.power ?? 0, 0, Math.PI, 28, 1.2, effect);
        if (effect.kind === 'slam') this.damage(skillRange('slam', level), effect.power ?? 0, effect.angle, 1.35, 12, 2 + (level - 1) * .3, effect);
        if (effect.kind === 'hell') this.damage(skillRange('hell', level), effect.power ?? 0, 0, Math.PI, 14, 1 + (level - 1) * .2, effect);
        if (effect.kind === 'rain') this.damage(92, effect.power ?? 0, 0, Math.PI, 6, .9, effect);
        if (effect.kind === 'burst') this.damage(effect.radius ?? 96, effect.power ?? 0, 0, Math.PI, 16, effect.slow ?? 0, effect);
        if (effect.kind === 'nova') this.damage(effect.radius ?? 150, effect.power ?? 0, 0, Math.PI, 22, effect.slow ?? 0, effect);
        if (effect.kind === 'slash2' || effect.kind === 'crushing' || effect.kind === 'burst' || effect.kind === 'nova') effect.nextHit = undefined;
        else effect.nextHit += effect.kind === 'spin' || effect.kind === 'slam' ? .45 : .4;
      }
    }
    this.effects = this.effects.filter(e => e.age < e.duration);
    this.save.health = p.hp;
  }
}
