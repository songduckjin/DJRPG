/**
 * 전투 엔진 (DOM-free) — `world.ts`의 action·damage·shoot·쿨다운·효과·스킬을 옮긴 곳(PR-2B).
 *
 * 여기에는 **싸우는 규칙만** 있다. 몹이 어디서 뜨고(스폰), 보스가 언제 오고, 층이 어떻게 오르고,
 * 바닥의 드롭을 누가 줍는지는 필드의 일이라 `game/fieldProgress.ts`(`FieldProgress`)가 얹는다.
 * 그래서 던전(`game/dungeon/battle.ts`의 `DungeonWorld`)과 월드보스 연습(`game/worldBossRehearsal.ts`)은
 * **이 엔진만** 상속·사용하고, 서버 리플레이(`server/dungeon-verify.mjs`·`server/world-boss.mjs`)의
 * 런타임 클로저에는 `world.ts`·`arena.ts`·`loot.ts`·`inventory.ts`·`bossLoot.ts`·`bagCapacity.ts`가
 * 들어오지 않는다(`tests/architecture-boundaries.test.mjs`가 클로저를 실제로 계산해 지킨다).
 *
 * **동작·난수·타이밍은 한 값도 바꾸지 않았다.** `update(dt)`가 하던 일을 단계 메서드로 나눠
 * (`tickStart` → `tickEnemies` → `tickRegen` → `tickEffects`) 필드가 그 사이에 자기 단계(스폰·드롭)를
 * 끼워 넣을 수 있게 했을 뿐이고, 필드(`FieldProgress.update`)는 예전과 **같은 순서**로 부른다.
 * 리팩터링 전후는 `tests/progress-parity.test.mjs`의 고정 시드 스냅샷이 대조한다.
 */

import { random } from '../rng';
import { dragonOrbitFactor, jobOrDefault, skillDamageScale, skillDuration, skillRange, skills, slash2Hits, slash2SwingSeconds, SKILL_HIT_POWER, type Job, type SkillId } from '../skills';
import { skillLevel, totalStats, type Save } from '../store';
import { EXTRA_LIFESTEAL_HIT_CAP, EXTRA_LIFESTEAL_SECOND_CAP, EXTRA_REGEN_SECONDS, effectiveExtraOptions } from '../extraOptions';
import type { Action, ArrowVariant, Coin, Drop, Effect, Enemy, HeroAfterimage } from '../battle/types';
import { CRIT_CHANCE_CAP, ENEMY_ATTACK_RANGE, ENEMY_STOP_RANGE, ENEMY_STRIKE_SECONDS, WARRIOR_ATTACK_RANGE, archerAttackRange, archerStopRange, attackInterval, basicAttackPower, berserkAttackScale, berserkSpeedScale, critDamageScale, enemyHitDamage, enemyMoveSpeed, mageAttackRange, mageStopRange, swarmCount } from '../battle/formulas';
import { aimPoint as aimPointTo, fireBoltSpots, nearestEnemy, targetsInArc, targetsInForwardBox } from '../battle/targeting';
import { destroyTravelProgress, iceArrowSlow, multiShotPattern, skillArea } from '../battle/skillAreas';
import { recordPlaySeconds } from '../progress';
import { isPatchBuffActive } from '../patchBuff';
import { clampArenaPoint, clampFieldPoint } from './bounds';

/** 딜레이 크러싱 10연타(작업 212) — 붉은보석1식으로, 한 번에 한 타가 아니라 짧은 간격으로 10번 따로 판정한다. */
export const crushHits = 10;
/** 타격 간격. 10타가 0.558초에 끝나 요청한 0.55~0.65초 안에 들어온다. */
export const crushInterval = .062;
/** 한 타가 재생하는 공격 동작 길이 — 평타(0.32초)의 1/5로 attack 4프레임을 빠르게 한 번 넘긴다. */
export const crushPoseSpan = .062;
/** 잔상이 남아 있는 시간 — 마지막 타가 끝나고 약 0.3초 뒤 모두 사라진다. */
export const crushTrailLife = .3;
/** 스킬·평타의 재사용 대기(초). 평타는 직업별 기본 간격(전사·궁수 0.48, 마법사 0.63)이고, 스킬은
 *  `skills` 표의 값에 쿨타임 감소(CDR)를 곱해 쓴다(밸런스 v2). */
export const cooldowns = { attack: .48, ...Object.fromEntries(Object.keys(skills).map(id => [id, skills[id as SkillId].cooldown])) } as Record<Action, number>;
/** 스킬 쿨타임 감소의 상한(%). 장비 기본 + 추가옵션을 합친 값이 이 값을 넘지 않는다. */
export const SKILL_CDR_CAP = 35;
/** 입문 구간(1~4층)의 자연 회복 — 1초마다 최대 체력의 1%(최소 1). 적 사거리가 90이 된 뒤 Lv.1 캐릭터가
 *  두어 마리에 둘러싸여 바로 쓰러지지 않게 하는 최소한의 숨통이다(밸런스 v2 온보딩). */
export const EARLY_REGEN_FLOOR = 4;
export const EARLY_REGEN_PER_SECOND = .01;
/**
 * 쓰러진 뒤 부활까지 기다리는 시간(초) — 2026-11-24 대장님·덕진 님 확정.
 *
 * 접속 사냥(`FieldProgress.heroDown`)과 방치 정산(`offline.ts` `offlineSurvivalUptime`)이 **같은 값**을
 * 쓴다. 그래야 "켜 놓고 보는 사람 = 방치하는 사람" 원칙이 지켜지고, 방치 정산에 들어온 사망 손실이
 * 실제 플레이와 같은 무게를 갖는다(종전 접속은 죽어도 대기 없이 만혈 부활해 10골드만 잃었다).
 * 입문 구간(1~4층)은 면제한다(`reviveSeconds` = 0) — 장비 없는 Lv.1의 첫 방치 경험을 지킨다.
 */
export const REVIVE_SECONDS = 5;
/** 그 층에서 쓰러진 뒤 기다리는 시간(초) — 입문 구간(1~4층)은 0초(면제). */
export function reviveSeconds(floor: number): number {
  return floor <= EARLY_REGEN_FLOOR ? 0 : REVIVE_SECONDS;
}

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

export class CombatEngine {
  player = { x: 0, y: 0, facing: 0, facingSide: 1, hp: 100, berserk: 0, berserkLevel: 1, hit: 0 };
  /** 지금 피격 창(0.85초)에서 아직 때릴 수 있는 몹 수 — 2~3마리 동시 타격(밸런스 v2 군집). */
  protected strikeQuota = 0;
  /** 피흡 1초 창의 누적 회복량 — 초당 상한(최대 체력의 2.5%)을 지키는 데 쓴다. */
  lifestealClock = 0;
  lifestealHealed = 0;
  /** 입문 구간 자연 회복 타이머(1초). */
  earlyRegenClock = 0;
  /** 쓰러진 뒤 부활까지 남은 시간(초) — 0이면 살아 있다(2026-11-24 부활 대기 5초). */
  reviveTimer = 0;
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
  /** 지난 프레임에 기념 버프가 켜져 있었는가 — 꺼지는 순간에만 지금 체력을 새 상한에 맞춘다. */
  private patchBuffActive = isPatchBuffActive();
  activeMove = { x: 0, y: 0 };
  protected swing = 1;
  protected chaseTarget?: Enemy;
  protected pursuing = false;
  /**
   * 캐릭터 전환 세대(작업 250) — `adoptSave`가 한 번 올린다.
   *
   * 새로고침 없이 캐릭터를 같아타면 세이브 객체는 그대로고 내용만 바뀌어, 그리기 쪽은 "같은
   * 세이브"와 "다른 캐릭터"를 구별할 수 없다. 이 값을 비교해 파츠 스프라이트·발광·잔상을 버린다.
   */
  switchEpoch = 0;
  onChange: () => void = () => {};
  onMessage: (text: string) => void = () => {};

  /**
   * 세이브와 지금 체력만 세운다 — 필드가 얹는 것(첫 몹·보스 예약·정예 카운터·드롭)은
   * `FieldProgress`가 한다. 던전·월드보스는 이 생성자만 쓰므로 필드의 몹·가방 규칙을 끌고 오지 않는다.
   */
  constructor(public save: Save) {
    this.save.auto = true;    this.player.hp = Math.min(save.health, totalStats(save).health);
    // 부활 대기 중이던 세이브(체력 0)로 들어와도 쓰러진 채로 멈추지 않게 한다 — 화면을 닫았다 열면 일어난다.
    if (!(this.player.hp > 0)) this.player.hp = totalStats(save).health;
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
    const area = kind === 'attack' ? undefined : skillArea(kind, level);
    const range = area?.range ?? WARRIOR_ATTACK_RANGE;
    const damageScale = skillDamageScale(level);
    const stats = totalStats(this.save);
    // [작업 216] 광폭 버프(블러드 레이지·호크아이·아케인 실드)의 공속은 +20%에서 시작해 스킬 레벨당 +1%,
    // 상한 1.5배다(예전 `1.5 + (레벨-1)*.08`은 Lv.1부터 +50%, Lv.30 3.8배로 비정상이었다).
    // [밸런스 v2] 평타 간격은 **직업 기본 간격**(전사·궁수 0.48, 마법사 0.63)에서 시작해 공속 %와 버프를
    // 반영하고 6.00타/초(간격 0.1667초)에서 자른다. 스킬 쿨타임에만 CDR(상한 35%)을 곱한다 — 평타에는 안 쓴다.
    if (kind === 'attack') {
      this.cooldown.attack = attackInterval(this.job, stats.speed, p.berserk > 0 ? berserkSpeedScale(p.berserkLevel) : 1);
    } else {
      this.cooldown[kind] = cooldowns[kind] * (1 - Math.min(SKILL_CDR_CAP, Math.max(0, stats.cdr)) / 100);
    }
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
        this.shoot(point.x, point.y, attack * basicAttackPower, { speed: 820, radius: 42, arrow: 'normal' });
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
      this.damage(area!.radius! * dragonOrbitFactor(0), attack * SKILL_HIT_POWER.spin * damageScale, 0, area!.arc ?? Math.PI);
    } else if (kind === 'crushing') {
      // [작업 212] 붉은보석1식 — 적 하나에게 본체가 빠르게 10번 내려치고, 타마다 잔상과 데미지 판정이 남는다.
      // 연출(충격 링·내려찍기)은 대상이 있는 자리에서 62ms마다 한 번씩 깜빡인다.
      const point = target && Math.hypot(target.x - p.x, target.y - p.y) <= range ? target : { x: p.x + Math.cos(p.facing) * range * .65, y: p.y + Math.sin(p.facing) * range * .65 };
      this.effects.push({
        x: point.x, y: point.y, kind: 'crushing', age: 0, duration: crushHits * crushInterval,
        angle: p.facing, strikeInterval: crushInterval, power: attack * SKILL_HIT_POWER.crushing * damageScale, level, aim: target
      });
      this.crush = { level, elapsed: 0, next: crushInterval, hits: 0, power: attack * SKILL_HIT_POWER.crushing * damageScale };
      this.crushStrike();
    } else if (kind === 'slam') {
      this.effects.push({ x: p.x, y: p.y, kind: 'slam', age: 0, duration: skillDuration(kind, level), angle: 0, nextHit: .45, power: attack * .55 * damageScale, level });
      this.damage(area!.radius!, attack * SKILL_HIT_POWER.slam * damageScale, 0, Math.PI, 55, 2 + (level - 1) * .3);
    } else if (kind === 'warcry') {
      p.berserk = skillDuration(kind, level);
      p.berserkLevel = level;
      this.effects.push({ x: p.x, y: p.y, kind: 'warcry', age: 0, duration: .7, angle: 0 });
      for (const enemy of this.enemies) {
        const dx = enemy.x - p.x, dy = enemy.y - p.y, d = Math.hypot(dx, dy);
        if (d < area!.radius! && d > 0) { const bounded = clampFieldPoint(enemy.x + dx / d * 40, enemy.y + dy / d * 40); enemy.x = bounded.x; enemy.y = bounded.y; }
      }
    } else if (kind === 'power') {
      const point = target && Math.hypot(target.x - p.x, target.y - p.y) <= range
        ? target : { x: p.x + Math.cos(p.facing) * range * .75, y: p.y + Math.sin(p.facing) * range * .75 };
      this.effects.push({ x: point.x, y: point.y, kind: 'power', age: 0, duration: skillDuration(kind, level), angle: p.facing });
      this.damage(area!.radius!, attack * SKILL_HIT_POWER.power * damageScale, p.facing, Math.PI, 24, 0, p, 1);
    } else if (kind === 'destroy') {
      this.effects.push({ x: p.x, y: p.y, kind: 'destroy', age: 0, duration: skillDuration(kind, level), angle: p.facing, power: attack * SKILL_HIT_POWER.destroy * damageScale, level, hitEnemies: new Set() });
    } else if (kind === 'hell') {
      this.effects.push({ x: p.x, y: p.y, kind: 'hell', age: 0, duration: skillDuration(kind, level), angle: p.facing, nextHit: .4, power: attack * .6 * damageScale, level });
      this.damage(area!.radius!, attack * SKILL_HIT_POWER.hell * damageScale, 0, area!.arc ?? Math.PI, 45, 1 + (level - 1) * .2);
    } else if (kind === 'doubleShot') {
      const aim = this.aimPoint(target, range);
      const sideX = -Math.sin(p.facing) * 8, sideY = Math.cos(p.facing) * 8;
      for (const side of [-1, 1]) this.shoot(aim.x, aim.y, attack * SKILL_HIT_POWER.doubleShot * damageScale,
        { speed: 900, radius: area!.projectileRadius, arrow: 'normal', source: kind,
          from: { x: p.x + sideX * side, y: p.y + sideY * side } });
    } else if (kind === 'multiShot') {
      const aim = this.aimPoint(target, range);
      const base = Math.atan2(aim.y - p.y, aim.x - p.x);
      const hitEnemies = new Set<Enemy>();
      const pattern = multiShotPattern(level);
      for (let index = 0; index < pattern.count; index++) {
        const spread = base - pattern.halfArc + 2 * pattern.halfArc * index / (pattern.count - 1);
        this.shoot(p.x + Math.cos(spread) * range, p.y + Math.sin(spread) * range, attack * SKILL_HIT_POWER.multiShot * damageScale,
          { speed: 860, radius: area!.projectileRadius, targets: Infinity, arrow: 'normal', source: kind, piercing: true, hitEnemies });
      }
    } else if (kind === 'pierceShot') {
      const aim = this.aimPoint(target, range);
      const angle = Math.atan2(aim.y - p.y, aim.x - p.x);
      this.shoot(p.x + Math.cos(angle) * range, p.y + Math.sin(angle) * range,
        attack * SKILL_HIT_POWER.pierceShot * damageScale, { speed: 980, radius: area!.projectileRadius, targets: 4,
          arrow: 'pierce', source: kind, piercing: true, hitEnemies: new Set() });
    } else if (kind === 'iceArrow') {
      const aim = this.aimPoint(target, range);
      const freeze = iceArrowSlow(level);
      this.shoot(aim.x, aim.y, attack * SKILL_HIT_POWER.iceArrow * damageScale, { speed: 760, radius: area!.projectileRadius,
        slow: freeze.duration, slowScale: freeze.speedScale, arrow: 'ice', source: kind });
    } else if (kind === 'hawkEye') {
      p.berserk = skillDuration(kind, level);
      p.berserkLevel = level;
      this.effects.push({ x: p.x, y: p.y, kind: 'hawk', age: 0, duration: 1.2, angle: 0, level, source: kind });
    } else if (kind === 'snipe') {
      const aim = this.aimPoint(target, range);
      this.effects.push({ x: aim.x, y: aim.y, kind: 'snipeMark', age: 0, duration: .42, angle: 0, source: kind });
      this.shoot(aim.x, aim.y, attack * SKILL_HIT_POWER.snipe * damageScale, { speed: 1500, radius: area!.projectileRadius, knockback: 18, arrow: 'snipe', source: kind, launch: .32 });
    } else if (kind === 'stormVolley') {
      const volley: Effect = { x: p.x, y: p.y, kind: 'volleyCast', age: 0, duration: area!.duration,
        angle: p.facing, launch: .18, hits: 0, aim: target, power: attack * SKILL_HIT_POWER.stormVolley * damageScale,
        radius: area!.projectileRadius, level, source: kind };
      this.fireVolleyArrow(volley);
      this.effects.push(volley);
    } else if (kind === 'arrowRain') {
      const aim = this.aimPoint(target, range);
      this.effects.push({ x: aim.x, y: aim.y, kind: 'rain', age: 0, duration: area!.duration, angle: 0, nextHit: .12, power: attack * SKILL_HIT_POWER.arrowRain * damageScale, radius: area!.radius, level, source: kind });
    } else if (kind === 'fireBolt') {
      // [작업 216] 머리 위에 화염구 N발을 띄운 뒤, 각 자리에서 목표 한 마리를 향해 곡선 없이
      // 곧장 일직선으로 날아가 타격한다. 합계 위력은 예전 한 발(×2.0)과 같게 N으로 나눈다.
      const aim = this.aimPoint(target, range);
      const count = fireBoltCount(level), size = fireBoltScale(level);
      const power = attack * SKILL_HIT_POWER.fireBolt * damageScale / count;
      fireBoltSpots(p.x, p.y, count).forEach((spot, index) => {
        this.shoot(aim.x, aim.y, power, {
          speed: 900, radius: area!.projectileRadius, arrow: 'fire', aim: target, source: kind,
          from: spot, launch: .18 + index * .05, size
        });
      });
    } else if (kind === 'iceBolt') {
      const aim = this.aimPoint(target, range);
      this.shoot(aim.x, aim.y, attack * SKILL_HIT_POWER.iceBolt * damageScale, { speed: 720, radius: area!.projectileRadius, slow: 2.4 + (level - 1) * .06, arrow: 'frost', aim: target, source: kind });
    } else if (kind === 'chainLightning') {
      const aim = this.aimPoint(target, range);
      this.shoot(aim.x, aim.y, attack * SKILL_HIT_POWER.chainLightning * damageScale, { speed: 900, radius: area!.projectileRadius, targets: 3, arrow: 'chain', aim: target, source: kind });
    } else if (kind === 'manaBurst') {
      const aim = this.aimPoint(target, range);
      this.effects.push({ x: aim.x, y: aim.y, kind: 'burst', age: 0, duration: area!.duration, angle: 0, nextHit: .35, power: attack * SKILL_HIT_POWER.manaBurst * damageScale, radius: area!.radius, variant: 'arcane', level, source: kind });
    } else if (kind === 'frostNova') {
      // 판정은 노바 이펙트가 한 번만 낸다(발동 즉시 피해를 또 주면 두 번 들어간다).
      this.effects.push({ x: p.x, y: p.y, kind: 'nova', age: 0, duration: area!.duration, angle: 0, nextHit: .12, power: attack * SKILL_HIT_POWER.frostNova * damageScale, radius: area!.radius, slow: 2.2 + (level - 1) * .06, variant: 'frost', level, source: kind });
    } else if (kind === 'arcaneShield') {
      p.berserk = skillDuration(kind, level);
      p.berserkLevel = level;
      this.effects.push({ x: p.x, y: p.y, kind: 'ward', age: 0, duration: .9, angle: 0, level, source: kind });
    } else if (kind === 'meteorStrike') {
      const aim = this.aimPoint(target, range);
      this.effects.push({ x: aim.x, y: aim.y, kind: 'burst', age: 0, duration: area!.duration, angle: 0, nextHit: .6, power: attack * SKILL_HIT_POWER.meteorStrike * damageScale, radius: area!.radius, variant: 'meteor', level, source: kind });
    } else if (kind === 'arcaneOverlord') {
      this.effects.push({ x: p.x, y: p.y, kind: 'nova', age: 0, duration: area!.duration, angle: 0, nextHit: .2, power: attack * SKILL_HIT_POWER.arcaneOverlord * damageScale, radius: area!.radius, variant: 'arcane', level, source: kind });
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
    this.damage(skillArea('crushing', crush.level).radius!, amount, 0, skillArea('crushing', crush.level).arc ?? Math.PI, 3, 0, p, 1, crushLabelOffset(index));
    this.afterimages.push({
      x: p.x + ((index * 11) % 29) - 14, y: p.y + ((index * 7) % 17) - 8,
      age: 0, duration: crushTrailLife, alpha: .42 - index * .031, facingSide: p.facingSide, capture: .02
    });
  }

  /** 스킬을 쏠 지점 — 사거리 안의 가장 가까운 적, 없으면 정면 사거리 끝(`battle/targeting`). */
  private aimPoint(target: Enemy | undefined, range: number): { x: number; y: number } {
    return aimPointTo(this.player, target, range);
  }

  /** 화살 하나를 쏜다. 도착하는 순간(`update`)에 그 지점 반경의 적에게 피해를 준다. */
  private shoot(tx: number, ty: number, power: number, options: { speed?: number; radius?: number; targets?: number; slow?: number; slowScale?: number; knockback?: number; delay?: number; arrow?: ArrowVariant; aim?: Enemy; source?: SkillId; from?: { x: number; y: number }; launch?: number; size?: number; piercing?: boolean; hitEnemies?: Set<Enemy> } = {}): void {
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
      slow: options.slow ?? 0, slowScale: options.slowScale, variant: options.arrow ?? 'normal', level: this.save.level, aim: options.aim, source: options.source,
      launch: launch || undefined, size: options.size, piercing: options.piercing, hitEnemies: options.hitEnemies
    });
  }

  /** 연사의 각 발은 발사 시 살아 있는 표적을 고른다. 처치 뒤 남은 화살은 다음 적으로 향한다. */
  private fireVolleyArrow(volley: Effect): void {
    const range = skillArea('stormVolley', volley.level ?? 1).range;
    const inRange = this.enemies.filter(enemy => enemy.hp > 0 && Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) <= range);
    const target = volley.aim && inRange.includes(volley.aim) ? volley.aim : nearestEnemy(this.player, inRange);
    volley.aim = target;
    if (target) this.faceTarget(target);
    const point = target ?? { x: this.player.x + Math.cos(volley.angle) * range, y: this.player.y + Math.sin(volley.angle) * range };
    this.shoot(point.x, point.y, volley.power ?? 0, { speed: 940, radius: volley.radius, arrow: 'volley', source: 'stormVolley' });
    volley.hits = (volley.hits ?? 0) + 1;
    this.attackPose = .22;
    this.attackPoseSpan = .22;
  }

  nearest(): Enemy | undefined {
    return nearestEnemy(this.player, this.enemies);
  }

  private faceTarget(target: { x: number; y: number }): void {
    const dx = target.x - this.player.x, dy = target.y - this.player.y;
    const screenDx = dx - dy;
    this.player.facing = Math.atan2(dy, dx);
    if (Math.abs(screenDx) > 4) this.player.facingSide = screenDx > 0 ? 1 : -1;
  }

  damage(radius: number, amount: number, angle: number, arc: number, knockback = 12, slow = 0, origin: { x: number; y: number } = this.player, maxTargets = Infinity, labelOffset?: { x: number; y: number }, boxHalfWidth?: number, hitEnemies?: Set<Enemy>, forceCrit = false): void {
    // 추가옵션(작업 238): `추가 데미지`는 최종 피해에 곱하고, `피흡`은 실제로 가한 피해에서 회복한다.
    // 두 값 모두 상한이 걸려 있다(`effectiveExtraOptions`) — 피흡은 한 번의 타격에 최대 체력의 4%까지다.
    const extras = effectiveExtraOptions(this.save.equipment);
    // 추가 데미지(작업 260): 예전에는 기본 피해에 곱해 한 숫자로 띄웠다(`amount * (1 + bonus%)`).
    // 이제 기본 피해와 추가 피해를 **계산은 그대로** 나눠 두 장으로 띄운다 — 기본은 흰색(치명타면 빨강),
    // 추가 몫은 노란색으로 한 줄 위에 뜬다. 두 값의 합이 예전 한 방과 같아 체력·피흡·처치 속도는 불변이다.
    const bonusPct = extras.bonusDmgPct > 0 ? extras.bonusDmgPct : 0;
    // 치명타(작업 245): 장비 추가옵션 `치명타 확률`은 이제 표시가 아니라 실제 발동이다. 스탯 `crit`(%)을
    // 그대로 확률로 쓰고, 타마다 한 번씩 굴려 들어가면 `critScale`(기본 1.8배 + 치명타 피해량)로 터뜨린다
    // (확률 상한 100%). 굴림은 `critRoll`을 거치므로 월드보스 서버 재계산도 같은 순서로 나온다.
    const critChance = Math.min(CRIT_CHANCE_CAP, Math.max(0, totalStats(this.save).crit));
    // 치명타 피해량(백로그 2번): 터졌을 때의 배수는 1.8 + 장비 `치명타 피해량`(%, 상한 15%)이다.
    // 확률은 위 `critChance` 그대로이고 **배수만** 오른다 — 추가 데미지·피흡도 이 배수 위에서 계산된다.
    const critScale = critDamageScale(extras.critDmgPct);
    // 판정 대상은 사거리·부채꼴 안의 적(`battle/targeting`). `maxTargets`를 주면 가까운 순으로 그 수만 맞는다(평타 1마리).
    const targets = boxHalfWidth === undefined
      ? targetsInArc(origin, radius, angle, arc, this.enemies, maxTargets)
      : targetsInForwardBox(origin, radius, boxHalfWidth, angle, this.enemies);
    let dealt = 0;
    for (const { enemy, dx, dy, dist } of targets) {
      if (hitEnemies && hitEnemies.size >= maxTargets) break;
      if (hitEnemies?.has(enemy)) continue;
      hitEnemies?.add(enemy);
      const crit = forceCrit || critChance > 0 && this.critRoll() * 100 < critChance;
      const baseHit = crit ? amount * critScale : amount;
      const bonusHit = bonusPct > 0 ? baseHit * bonusPct / 100 : 0;
      const hit = baseHit + bonusHit;
      enemy.hp -= hit;
      dealt += hit;
      enemy.hit = .24;
      enemy.slow = Math.max(enemy.slow, slow);
      if (knockback && dist) { enemy.knockX += dx / dist * knockback * 16; enemy.knockY += dy / dist * knockback * 16; }
      // 숫자 두 장이 같은 난수를 한 번만 쓴다(타격당 `random()` 1회 유지 — 월드보스 서버 재계산·던전
      // 시드 리플레이가 같은 순서로 굴러간다). 추가 몫은 같은 방향에서 반대로 흩어져 겹치지 않는다.
      const spray = random() * Math.PI * 2;
      this.effects.push({ x: enemy.x, y: enemy.y, kind: 'hit', age: 0, duration: .45, angle: spray, amount: Math.round(baseHit), labelOffsetX: labelOffset?.x, labelOffsetY: labelOffset?.y, crit });
      if (bonusHit > 0) this.effects.push({ x: enemy.x, y: enemy.y, kind: 'hit', age: 0, duration: .45, angle: spray + Math.PI, amount: Math.max(1, Math.round(bonusHit)), labelOffsetX: labelOffset?.x, labelOffsetY: (labelOffset?.y ?? 0) - 18, bonus: true });
    }
    if (extras.lifestealPct > 0 && dealt > 0) this.lifesteal(dealt, extras.lifestealPct);    const dead = this.enemies.filter(e => e.hp <= 0);
    this.enemies = this.enemies.filter(e => e.hp > 0);
    for (const enemy of dead) this.kill(enemy);
  }

  /** 피흡(작업 238 → 밸런스 v2) — 가한 피해의 N%를 회복한다. 한 타는 최대 체력의 0.4%, 1초에는 2.5%까지만 찬다. */
  private lifesteal(dealt: number, percent: number): void {
    const p = this.player, maxHp = totalStats(this.save).health;
    if (p.hp <= 0 || p.hp >= maxHp) return;
    const secondLeft = Math.max(1, Math.ceil(maxHp * EXTRA_LIFESTEAL_SECOND_CAP)) - this.lifestealHealed;
    const heal = Math.min(Math.round(dealt * percent / 100), Math.max(1, Math.ceil(maxHp * EXTRA_LIFESTEAL_HIT_CAP)), Math.max(0, secondLeft));
    if (!(heal > 0)) return;
    p.hp = Math.min(maxHp, p.hp + heal);
    this.lifestealHealed += heal;
    this.effects.push({ x: p.x, y: p.y, kind: 'heal', age: 0, duration: .6, angle: Math.PI / 2, amount: heal });
  }


  /**
   * 처치 — `damage()`가 적의 체력을 0으로 만든 뒤 부른다.
   *
   * 기본은 죽음 연출만 남긴다. 보상·드롭·층 진행은 필드(`FieldProgress.kill`), 바닥 드롭은
   * 던전(`DungeonWorld.kill`)이 각자 정한다 — 엔진이 세이브 보상 규칙을 알 필요가 없다.
   */
  kill(enemy: Enemy): void {
    this.effects.push({ x: enemy.x, y: enemy.y, kind: 'death', age: 0, duration: .7, angle: random() * Math.PI * 2 });
  }

  /** 적의 일격으로 체력이 0이 된 순간. 기본은 아무것도 하지 않는다 — 필드는 `FieldProgress`가
   *  부활·패널티·보스 재도전을 여기서 처리한다. 던전은 연타 피해를 엔진 밖(`DungeonBattle.step`)에서
   *  주므로 이 훅을 쓰지 않는다. */
  protected heroDown(_enemy: Enemy): void {}

  /** 부활 대기가 끝난 순간 — 만혈로 돌아온다. 필드는 문구만 덧붙인다. */
  protected reviveHero(): void {
    this.player.hp = totalStats(this.save).health;
    this.save.health = this.player.hp;
    this.onMessage('부활했습니다.');
  }


  /** 매 프레임 첫 단계 — 타이머·쿨다운·크러싱 잔상·추격 이동·자동 공격(원래 `update`의 앞부분). */
  protected tickStart(dt: number): void {
    // 플레이 시간 누적 규칙은 `progress.ts`가 갖는다(PR-3).
    recordPlaySeconds(this.save, dt);
    const p = this.player;
    // 기념 버프(2026-11-22 종일 공·방·체 +30%)가 **끝나는 순간에만** 최대 체력이 30% 줄어든다 —
    // 사냥 도중에 기간이 지나도 지금 체력이 새 상한을 넘지 않게 여기서 한 번 맞춘다.
    // (매 프레임 `min`으로 자르면 체력이 상한을 넘은 예전 세이브·테스트 값을 건드린다.)
    const patchBuff = isPatchBuffActive();
    if (this.patchBuffActive && !patchBuff) {
      const maxHp = totalStats(this.save).health;
      if (p.hp > maxHp) p.hp = maxHp;
    }
    this.patchBuffActive = patchBuff;
    for (const kind of Object.keys(this.cooldown) as Action[]) this.cooldown[kind] = Math.max(0, this.cooldown[kind] - dt);
    this.attackPose = Math.max(0, this.attackPose - dt);
    this.weaponNotice = Math.max(0, this.weaponNotice - dt);
    p.berserk = Math.max(0, p.berserk - dt);
    p.hit = Math.max(0, p.hit - dt);
    // 피흡 초당 상한(밸런스 v2) — 1초 창이 돌면 누적 회복량을 비운다.
    this.lifestealClock += dt;
    if (this.lifestealClock >= 1) { this.lifestealClock = 0; this.lifestealHealed = 0; }
    // 부활 대기(2026-11-24) — 쓰러져 있는 동안은 사냥하지 못하고, 시간이 다 되면 그 자리에서 일어난다.
    if (this.reviveTimer > 0) {
      this.reviveTimer = Math.max(0, this.reviveTimer - dt);
      if (this.reviveTimer === 0) this.reviveHero();
    }
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
    // 쓰러져 있는 동안(체력 0)에는 추격·공격을 하지 않는다 — 부활 대기 5초의 의미가 여기에 있다.
    const destination = p.hp > 0 ? this.nearest() : undefined;
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
    if (this.attackHeld && p.hp > 0) this.action('attack');
  }


  /** 적의 이동·넉백·반격(원래 `update`의 적 루프). 체력이 0이 되면 `heroDown`에 넘긴다. */
  protected tickEnemies(dt: number): void {
    const p = this.player;
    for (const enemy of this.enemies) {
      const dx = p.x - enemy.x, dy = p.y - enemy.y, d = Math.hypot(dx, dy);
      enemy.attack = Math.max(0, (enemy.attack ?? 0) - dt);
      // 적은 공격 사거리(90) 안으로 들어오면 때리고, 서는 자리는 60까지다(작업 254) —
      // 종전에는 히어로 몸(27)까지 파고들어 여러 마리가 한 점에 겹쳐 섰다.
      enemy.moving = d > ENEMY_STOP_RANGE;
      if (enemy.moving && d > 0) { const step = enemyMoveSpeed(this.save.floor, enemy.boss) * (enemy.slow > 0 ? enemy.slowScale ?? .55 : 1) * dt; enemy.x += dx / d * step; enemy.y += dy / d * step; enemy.step += dt * Math.PI * (enemy.boss ? 3.25 : 4.25); }
      enemy.x += enemy.knockX * dt; enemy.y += enemy.knockY * dt;
      // 적은 아레나가 아니라 **필드 경계**로 자른다(작업 230) — 아레나로 자르면 멀리 스폰된 적이 첫
      // 프레임에 플레이어 코앞으로 순간이동해 버린다. 플레이어는 계속 아레나 안에 머문다.
      const bounded = clampFieldPoint(enemy.x, enemy.y); enemy.x = bounded.x; enemy.y = bounded.y;
      enemy.knockX *= Math.exp(-dt * 12); enemy.knockY *= Math.exp(-dt * 12);
      enemy.slow = Math.max(0, enemy.slow - dt);
      if (enemy.slow <= 0) enemy.slowScale = undefined;
      // 군집 동시 타격(밸런스 v2) — 예전에는 `p.hit` 하나로 0.85초에 **한 마리만** 때렸다.
      // 이제 11~15층 2마리, 16층+ 3마리가 같은 창에서 함께 때린다(보스전은 보스 혼자). 한 대의 위력은
      // `enemyHitDamage`가 이미 0.55로 눌러 두었으므로 받는 피해/초는 설계표(`적 DPS × 군집 / 0.85`)와 같다.
      if (d <= ENEMY_ATTACK_RANGE && p.hp > 0) {
        if (p.hit <= 0) this.strikeQuota = this.enemies.some(other => other.boss) ? 1 : swarmCount(this.save.floor);
        if (this.strikeQuota <= 0) { enemy.hit = Math.max(0, enemy.hit - dt); continue; }
        this.strikeQuota--;
        // 적의 공격 모션(작업 245): 때리는 적이 플레이어 쪽으로 내딛는다(`enemy.attack`).
        enemy.attack = ENEMY_STRIKE_SECONDS;
        if (p.hit <= 0) p.hit = .85;
        // 추가옵션 회피율(작업 238, 합산 상한 30%): 맞을 순간 한 번 굴려 성공하면 피해를 통째로 무시하고
        // `회피`를 띄운다.
        const evasion = effectiveExtraOptions(this.save.equipment).evasionPct;
        const evaded = evasion > 0 && random() < evasion / 100;
        if (evaded) {
          this.effects.push({ x: p.x, y: p.y, kind: 'evade', age: 0, duration: .7, angle: Math.PI / 2 });
          enemy.hit = Math.max(0, enemy.hit - dt);
          continue;
        }
        const taken = enemyHitDamage(this.save.floor, enemy.boss, totalStats(this.save).defense);
        p.hp = Math.max(0, p.hp - taken);
        // 맞은 표시 — 적이 할퀴고 지나간 자국과 잃은 체력 숫자(작업 245).
        // 맞은 피해는 **정수**로 띄운다(작업 260) — 방어력 0.2배가 소수라 `-7.2`처럼 보이던 숫자를 7로.
        this.effects.push({ x: p.x, y: p.y, kind: 'enemyStrike', age: 0, duration: .5, angle: Math.atan2(dy, dx), amount: Math.round(taken) });
        if (p.hp <= 0) this.heroDown(enemy);
      }
      enemy.hit = Math.max(0, enemy.hit - dt);
    }
  }


  /** 추가옵션 체력회복력(작업 238) — 5초마다 최대 체력의 N%. 입문 구간(1~4층)엔 1%/초 자연 회복도 붙는다(밸런스 v2). */
  protected tickRegen(dt: number): void {
    const p = this.player;
    // 입문 구간 자연 회복 — 최대 체력의 1%/초(최소 1). 체력이 빠졌을 때만 돈다.
    if (this.save.floor <= EARLY_REGEN_FLOOR && p.hp > 0 && p.hp < totalStats(this.save).health) {
      this.earlyRegenClock += dt;
      while (this.earlyRegenClock >= 1) {
        this.earlyRegenClock -= 1;
        const maxHp = totalStats(this.save).health;
        if (p.hp >= maxHp) break;
        p.hp = Math.min(maxHp, p.hp + Math.max(1, Math.ceil(maxHp * EARLY_REGEN_PER_SECOND)));
      }
    } else this.earlyRegenClock = 0;
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
  }


  /** 연출이 도착·판정하는 단계(원래 `update`의 이펙트 루프). */
  protected tickEffects(dt: number): void {
    for (const effect of [...this.effects]) {
      effect.age += dt;
      // 화살은 도착한 순간에만 판정한다 — 날아가는 동안에는 맞지 않는다(작업 157).
      if (effect.kind === 'shot') {
        // 적이 살아 있으면 날아가는 동안에도 도착지를 따라간다(빗나감 방지).
        if (effect.aim && this.enemies.includes(effect.aim)) { effect.tx = effect.aim.x; effect.ty = effect.aim.y; }
        if (effect.piercing) {
          const distance = Math.hypot((effect.tx ?? effect.x) - effect.x, (effect.ty ?? effect.y) - effect.y);
          if ((effect.hitEnemies?.size ?? 0) < (effect.targets ?? Infinity)) this.damage(distance * Math.min(1, effect.age / effect.duration), effect.power ?? 0, effect.angle,
            Math.PI, 0, 0, effect, effect.targets ?? Infinity, undefined, effect.radius, effect.hitEnemies);
        }
        if (!effect.fired && effect.age >= effect.duration) {
          effect.fired = true;
          const impact = { x: effect.tx ?? effect.x, y: effect.ty ?? effect.y };
          if (!effect.piercing) {
            this.damage(effect.radius ?? 40, effect.power ?? 0, effect.angle, Math.PI, 10,
              effect.variant === 'ice' ? 0 : effect.slow ?? 0, impact, effect.targets ?? 1,
              undefined, undefined, undefined, effect.variant === 'snipe');
            if (effect.variant === 'ice' && effect.source === 'iceArrow') {
              const radius = effect.radius ?? skillArea('iceArrow', 1).projectileRadius!;
              for (const enemy of this.enemies) if (Math.hypot(enemy.x - impact.x, enemy.y - impact.y) <= radius) {
                enemy.slow = Math.max(enemy.slow, effect.slow ?? 0);
                enemy.slowScale = Math.min(enemy.slowScale ?? 1, effect.slowScale ?? .55);
              }
              this.effects.push({ ...impact, kind: 'iceBurst', age: 0, duration: .7, angle: 0, radius });
            } else if (effect.source) this.effects.push({ ...impact, kind: 'impactArea', age: 0, duration: .18, angle: 0, radius: effect.radius, variant: effect.variant });
          }
        }
        continue;
      }
      if (effect.kind === 'volleyCast' && (effect.hits ?? 0) < 6 && effect.age >= (effect.launch ?? Infinity)) {
        this.fireVolleyArrow(effect);
        effect.launch = (effect.launch ?? 0) + .18;
      }
      // 딜레이 크러싱 연출은 지금 때리는 적의 자리를 따라간다(작업 212).
      if (effect.kind === 'crushing' && effect.aim && this.enemies.includes(effect.aim)) { effect.x = effect.aim.x; effect.y = effect.aim.y; }
      if (effect.kind === 'destroy') {
        const area = skillArea('destroy', effect.level ?? 1);
        this.damage(area.range * destroyTravelProgress(effect.age, effect.duration), effect.power ?? 0, effect.angle, Math.PI, 42, 0, effect, Infinity, undefined, area.halfWidth, effect.hitEnemies);
      }
      while (effect.nextHit !== undefined && effect.nextHit < effect.duration && effect.nextHit <= effect.age) {
        const level = effect.level ?? 1;
        // 이단참(작업 213): 한 번 발동에 두 번 때린다. 타마다 사거리·부채꼴을 그 순간의 적 배치로
        // 다시 재고, `damage()`가 타마다 데미지 팝업을 따로 띄운다. 두 타가 끝나면 `nextHit`을 비운다.
        if (effect.kind === 'slash2') {
          const swing = slash2Hits[effect.hits ?? 0] ?? slash2Hits[0];
          const area = skillArea('slash2', level);
          this.damage(area.range, (effect.power ?? 0) * swing.power, effect.angle, Math.PI, swing.knockback, 0, effect, Infinity, undefined, area.halfWidth);
          effect.hits = (effect.hits ?? 0) + 1;
          effect.nextHit = slash2Hits[effect.hits]?.at;
          continue;
        }
        if (effect.kind === 'spin') {
          const hitProgress = (effect.nextHit ?? effect.age) / effect.duration;
          const area = skillArea('spin', level);
          this.damage(area.radius! * dragonOrbitFactor(hitProgress), effect.power ?? 0, 0, area.arc ?? Math.PI, 10, 0, effect);
        }
        if (effect.kind === 'slam') { const area = skillArea('slam', level); this.damage(area.radius!, effect.power ?? 0, 0, Math.PI, 12, 2 + (level - 1) * .3, effect); }
        if (effect.kind === 'hell') { const area = skillArea('hell', level); this.damage(area.radius!, effect.power ?? 0, 0, area.arc ?? Math.PI, 14, 1 + (level - 1) * .2, effect); }
        if (effect.kind === 'rain') this.damage(skillArea('arrowRain', level).radius!, effect.power ?? 0, 0, Math.PI, 6, .9, effect);
        if (effect.kind === 'burst') this.damage(effect.radius ?? skillArea(effect.variant === 'meteor' ? 'meteorStrike' : 'manaBurst', level).radius!, effect.power ?? 0, 0, Math.PI, 16, effect.slow ?? 0, effect);
        if (effect.kind === 'nova') this.damage(effect.radius ?? skillArea(effect.variant === 'frost' ? 'frostNova' : 'arcaneOverlord', level).radius!, effect.power ?? 0, 0, Math.PI, 22, effect.slow ?? 0, effect);
        if (effect.kind === 'burst' || effect.kind === 'nova') effect.nextHit = undefined;
        else effect.nextHit += effect.kind === 'spin' || effect.kind === 'slam' ? .45 : .4;
      }
    }
    this.effects = this.effects.filter(e => e.age < e.duration || e.kind === 'volleyCast' && (e.hits ?? 0) < 6);
    // 타격 판정이 남은 스킬·투사체는 모두 유지한다. 많은 몹을 한꺼번에 때렸을 때
    // 수치·피격 장식만 오래 쌓이지 않도록 가장 최근 160개까지 보인다.
    let cosmetic = 0;
    this.effects = this.effects.reverse().filter(e => e.nextHit !== undefined || e.kind === 'shot' ||
      !['hit', 'death', 'heal', 'evade', 'enemyStrike', 'impactArea'].includes(e.kind) || ++cosmetic <= 160).reverse();
  }


  /**
   * 전투 한 프레임 — 예전 `World.update`에서 필드 단계(스폰·드롭)를 뺀 순서 그대로다.
   * 던전·월드보스는 이 `update`를 쓴다(필드 스폰·드롭·가방 규칙 없음).
   */
  update(dt: number): void {
    if (this.paused) return;
    this.tickStart(dt);
    this.tickEnemies(dt);
    this.tickRegen(dt);
    this.tickEffects(dt);
    this.save.health = this.player.hp;
  }

}
