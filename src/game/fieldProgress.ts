/**
 * 필드 진행 — `world.ts`에서 몹 스폰·보스·층 이동·드롭을 옮긴 곳(PR-2B).
 *
 * `CombatEngine`(싸우는 규칙) 위에 **필드의 일**만 얹는다: 몹이 언제 어디서 뜨는지, 보스가 언제
 * 오고 지면/이기면 층이 어떻게 되는지, 바닥의 드롭을 누가 어떻게 줍는지(가방 40칸·자동 분해),
 * 캐릭터를 갈아탈 때 무엇을 비우는지.
 *
 * `World`(`game/world.ts`)는 이 클래스를 그대로 상속하는 이름뿐인 껍데기이고, 던전·월드보스는
 * 이 파일을 거치지 않고 `CombatEngine`만 쓴다 — 서버 리플레이의 런타임 클로저에서 필드 모듈
 * (`world`·`arena`·`loot`·`inventory`·`bossLoot`·`bagCapacity`)이 빠지는 이유다.
 *
 * **동작·난수·타이밍은 한 값도 바꾸지 않았다.** `update(dt)`는 `CombatEngine`의 단계 메서드 사이에
 * 필드 단계(`tickSpawn`·`tickLoot`)를 **예전과 같은 자리**에 끼워 부른다 — 새로 뜬 몹이 같은
 * 프레임에 움직이고, 난수를 소비하는 순서도 종전과 같다.
 */

import { canStoreItem } from './bagCapacity';
import { emitDomainEvent } from '../core/domainEvents';
import { addItemToBag } from './rewardGrant';
import { bossGoldPiles, bossGoldSpot } from './bossLoot';
import { totalStats, type Item, type Rarity, type Save } from './store';
import { afterBossLose, afterBossWin, afterFloorClear, applyKillReward, defeatPenalty, killsToBoss, MAX_FLOOR, recordBossLoss } from './progress';
import { itemDisplayName, itemDropChance, isEquipment, rollItem, starterArmorItem, starterWeaponName, type Slot } from './items';
import { rollStatBookDrop } from './statBooks';
import { ELITE_HP_SCALE, ELITE_KILL_INTERVAL, MOB_CAP, MOB_CAP_GRACE_SECONDS, enemyMaxHp, spawnRefillSeconds, spawnsPerRefill, targetAliveCount } from './battle/formulas';
import { fieldSpawnBand, spawnArenaEnemy } from './arena';
import { clampArenaPoint } from './combat/bounds';
import { LOOT_ABSORB_SECONDS, LOOT_REST_SECONDS } from './loot';
import { autoSalvageBlock, autoSalvageRecovered, sweepBagOnFull } from './inventory';
import { random } from './rng';
import type { Action, Enemy } from './battle/types';
import { CombatEngine, cooldowns } from './combat/engine';
import { bossName as floorBossName, eliteName as floorEliteName, withJosa as josa } from './floorTheme';

/**
 * 입문 지원으로 지금 줄 방어구 칸(밸런스 v2 온보딩) — 1~2층에서 두 번째·세 번째 처치마다
 * 내 직업 무구·갑옷을 하나씩 확정으로 준다. 이미 입었거나 가방에 있으면 건넌다.
 */
function starterGearSlot(save: Save): 'helmet' | 'armor' | undefined {
  if (save.floor > 2 || save.kills < 2 || save.kills > 3) return undefined;
  const has = (slot: Slot) => !!save.equipment[slot] || save.bag.some(item => isEquipment(item) && item.slot === slot);
  if (save.kills === 2) return has('helmet') ? undefined : 'helmet';
  return has('armor') ? undefined : 'armor';
}

export class FieldProgress extends CombatEngine {
  /** 다음 몹이 뜨기까지 남은 시간. */
  spawnTimer = 0;
  bossPending = false;
  /** `⚔ 보스 도전`을 띄울 상태인가(작업 212 `#5017`) — 보스에게 쓰러진 뒤 `true`,
   *  보스를 잡아 다음 층으로 올라가면 `false`. 세션 동안만 기억한다. */
  bossRetryAvailable = false;
  /** 정예 몹 처치 카운터(작업 206) — 30마리가 되면 다음 스폰을 정예로 예약한다. */
  eliteKills = 0;
  elitePending = false;
  /** 30마리 상한에 닿아 있는 시간(초) — 10초를 넘기면 한 층 내린다(밸런스 v2 유예). */
  crowdClock = 0;

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


  constructor(save: Save) {
    super(save);
    // 보스는 **최고 도달 층에서만** 나오고, 자동 등반이 꺼진 상태(패배 뒤)에는 `⚔ 보스 도전`을 눌러야
    // 다시 나온다(작업 210). 세이브를 다시 읽어도 보스가 저절로 소환되지 않는다.
    this.bossPending = save.autoClimb && this.bossFloor() && save.floorKills >= killsToBoss(save.floor);
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
    this.bossPending = this.save.autoClimb && this.bossFloor() && this.save.floorKills >= killsToBoss(this.save.floor);
    this.bossRetryAvailable = false; this.eliteKills = 0; this.elitePending = false;
    this.crowdClock = 0; this.strikeQuota = 0;
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
    this.save.floorKills = Math.max(this.save.floorKills, killsToBoss(this.save.floor));
    this.enemies = []; this.chaseTarget = undefined; this.pursuing = false; this.activeMove = { x: 0, y: 0 };
    this.spawnTimer = 0; this.bossPending = true; this.elitePending = false;
    this.onMessage(`${josa(floorBossName(this.save.floor), '에게', '에게')} 다시 도전합니다!`);
    this.onChange();
    return true;
  }
  travelToFloor(floor: number): { ok: boolean; message: string } {
    const highest = Math.min(MAX_FLOOR, this.save.maxFloor);
    if (!Number.isInteger(floor) || floor < 1 || floor > highest) return { ok: false, message: `이동할 수 없는 층입니다. 현재 최고 도달 층은 ${highest}층입니다.` };
    if (floor === this.save.floor) return { ok: true, message: `이미 ${floor}층에서 사냥 중입니다.` };
    const lostDrops = this.drops.length;
    const previousFloor = this.save.floor;
    this.save.floor = floor;
    this.save.floorKills = 0;
    emitDomainEvent('floorAdvanced', { save: this.save, from: previousFloor, to: floor, reason: 'travel' });
    this.enemies = []; this.drops = []; this.coins = []; this.effects = [];
    this.crush = undefined; this.afterimages = []; this.attackPoseSpan = .32;
    this.bossPending = false; this.eliteKills = 0; this.elitePending = false; this.spawnTimer = 0;
    this.player.x = 0; this.player.y = 0; this.attackHeld = false;
    this.activeMove = { x: 0, y: 0 };
    this.chaseTarget = undefined; this.pursuing = false;
    this.onChange();
    return { ok: true, message: `${floor}층으로 이동했습니다.${lostDrops ? ` 바닥의 드랍 ${lostDrops}개가 사라졌습니다.` : ''}` };
  }
  kill(enemy: Enemy): void {
    this.effects.push({ x: enemy.x, y: enemy.y, kind: 'death', age: 0, duration: .7, angle: random() * Math.PI * 2 });
    // 킬 보상(처치 수·보스 수·금화·경험치)은 `progress.ts` 한 곳이 정한다(PR-3). 보스 업적은 **보스만**
    // 센다(작업 210, 사용자 지시 `#4475`·`#4486` "보스가 아니잖아"): 사냥터 층 보스 + 던전 5·10층 보스 +
    // 월드보스 도전. 필드 정예 몹은 보스가 아니므로 세지 않는다. 정예는 금화·경험치 2배(작업 206).
    const reward = applyKillReward(this.save, { boss: enemy.boss, elite: enemy.elite });
    const gold = reward.gold;
    // 도메인 신호(작업 256): 처치는 사냥 도메인의 사건이다 — 금화·경험치가 세이브에 반영된 **뒤**에 낸다.
    // 화면·미션·전광판 같은 다른 도메인은 이 신호만 듣고 자기 일을 한다(이벤트는 상태 사본이 아니라 신호).
    emitDomainEvent('monsterKilled', { save: this.save, floor: this.save.floor, boss: !!enemy.boss, elite: !!enemy.elite, gold, x: enemy.x, y: enemy.y });
    // 레벨업: 최대 체력을 아는 이쪽이 체력을 채우고, 플레이어 체력도 함께 올린다(작업 207).
    if (reward.levels) { this.save.health = totalStats(this.save).health; this.player.hp = this.save.health; this.onMessage(`레벨 ${this.save.level} 달성!`); }
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
    // 위 `applyKillReward`가 이미 셈해 넣었다.
    // The gold is the boss's whole haul — ten heaps and nothing handed out on top (작업 195). Items
    // still come from the one chance roll every kill makes below, against the same field drop table
    // (the boss rates for a boss), so a boss never leaves five guaranteed pieces behind.
    const guaranteed = this.save.tutorial === 0 && !enemy.boss, boss = enemy.boss;
    // 한 마리당 **한 번만** 굴려 아이템 1개(작업 210, 사용자 지시 `#4628`): 장비 70% · 스킬북 30%.
    if (guaranteed) {
      this.drops.push({ x: enemy.x, y: enemy.y, item: rollItem(this.save.floor, true, boss, this.job), age: 0, warned: false });
      this.save.tutorial = 1; this.onMessage(`${starterWeaponName(this.job)}이(가) 떨어졌습니다. 잠시 뒤 자동으로 획득됩니다!`);
    } else {
      // 입문 지원(밸런스 v2 온보딩): 첫 무기를 받은 뒤 두 번째·세 번째 처치에서 내 직업 투구·갑옷을
      // 확정으로 준다(1~2층, 빈 칸일 때만). Lv.1이 맨몸으로 사거¤90 적을 상대하지 않게 하는 최소한의 방어구다.
      const starter = boss ? undefined : starterGearSlot(this.save);
      if (starter) {
        this.drops.push({ x: enemy.x, y: enemy.y, item: starterArmorItem(starter, this.job, this.save.floor), age: 0, warned: false });
      } else if (random() < itemDropChance(this.save.floor, boss)) {
        const item = rollItem(this.save.floor, false, boss, this.job);
        this.drops.push({ x: enemy.x, y: enemy.y, item, age: 0, warned: false });
        // 파트 B: 영구 스탯북은 장비 드롭과 **별개로** 개극악 확률을 한 번 더 굴린다.
        const book = rollStatBookDrop(boss ? 'boss' : 'hunt');
        if (book) this.drops.push({ x: enemy.x, y: enemy.y, item: book, age: 0, warned: false });
      }
    }
    if (enemy.boss) {
      if (this.save.autoClimb) {
        // 20층이 마지막 층이다(작업 204): 20층 보스를 처치해도 21층으로 넘어가지 않고 20층에 머문다.
        // 층 진행 규칙은 `progress.ts`가 갖는다(PR-3) — 이 화면은 몹·연출만 정리한다.
        const from = this.save.floor;
        const won = afterBossWin(this.save);
        if (won.climbed) emitDomainEvent('floorAdvanced', { save: this.save, from, to: this.save.floor, reason: 'boss' });
        this.enemies = [];
        this.chaseTarget = undefined; this.pursuing = false;
        this.activeMove = { x: 0, y: 0 };
        this.spawnTimer = .2;
        this.bossPending = false;
        // 다음 층으로 올라갔으니 재도전 기록도 지운다(작업 223) — 새로고침해도 버튼이 돌아오지 않는다.
        this.bossRetryAvailable = false;
        this.onMessage(won.capped ? `최고 ${MAX_FLOOR}층 달성! ${MAX_FLOOR}층에서 계속 사냥합니다.` : `${this.save.floor}층 진입`);
      } else {
        // 자동 등반이 꺼져 있으면 그 층에 머물며 `⚔ 보스 도전`을 다시 띄운다(작업 222).
        afterBossWin(this.save, { climb: false });
        this.bossPending = false;
        this.bossRetryAvailable = this.save.floor < MAX_FLOOR;
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
        if (this.save.floorKills >= killsToBoss(this.save.floor)) {
          const from = this.save.floor;
          const cleared = afterFloorClear(this.save, { climb: this.save.autoClimb });
          if (cleared.climbed) {
            emitDomainEvent('floorAdvanced', { save: this.save, from, to: this.save.floor, reason: 'climb' });
            this.enemies = []; this.chaseTarget = undefined; this.pursuing = false;
            this.spawnTimer = .2; this.elitePending = false;
            this.onMessage(`${this.save.floor}층 진입`);
          }
        }
      } else if (this.save.autoClimb && this.save.floorKills >= killsToBoss(this.save.floor) && !this.bossPending && !this.enemies.some(e => e.boss)) {
        // 자동 등반 중이면 목표를 채울 때마다 보스가 저절로 온다(작업 212 `#5017`).
        // 보스에게 지고 1마리부터 다시 잡는 중에도 여기로 다시 보스가 나타난다.
        this.bossPending = true;
        this.onMessage(`${killsToBoss(this.save.floor)}마리 처치! ${josa(floorBossName(this.save.floor), '이', '가')} 나타납니다!`);
      }
    }
    this.onChange();
  }

  /**
   * 적의 일격으로 쓰러진 순간의 필드 규칙(작업 212·222·223·245) — 보스에게 진 경우 재도전 버튼을
   * 살리고, 자동 등반 중이면 1마리부터 다시 세운다. 10골드를 잃고 제자리에서 부활한다.
   */
  protected override heroDown(enemy: Enemy): void {
    const p = this.player;
          // 보스에게 쓰러졌고 최고층에서 자동 등반 중이면(작업 212 `#5017`·`#5028`) 자동 등반을
          // 끄지 않는다 — 1마리부터 다시 잡게 킬 카운트를 0으로 돌리고, 보스는 물러나게 한다.
          // 목표 마릿수를 채우면 `kill()`의 기존 규칙이 보스를 자동으로 다시 부른다.
          const climbOn = this.save.autoClimb && this.bossFloor() && enemy.boss;
          this.crush = undefined; this.afterimages = []; this.attackPoseSpan = .32;
          if (climbOn) {
            // 1마리부터 다시(진행도 0) + 진 층 기록 — 규칙은 `progress.ts`가 갖는다(PR-3).
            afterBossLose(this.save);
            this.bossPending = false;
            this.bossRetryAvailable = true;
            this.enemies = this.enemies.filter(other => !other.boss);
          } else if (this.bossFloor() && enemy.boss) {
            // 자동 등반이 꺼진 채 보스에게 진 경우에만 도전 버튼을 살린다(작업 222, 사용자 확인 `#5792`).
            // 일반·정예 몹에게 진 것으로는 켜지 않고, 이미 보스에게 져서 켜져 있던 상태도 건드리지 않는다.
            // 진행도는 그대로 두고 진 층만 남긴다 — 4층으로 올라갈 때까지 버튼이 유지된다(작업 223).
            recordBossLoss(this.save);
            this.bossRetryAvailable = true;
          }
          // 작업 245: 일반·정예 몹에게 쓰러져도 자동 등반은 **끄지 않는다** — 10골드를 잃고 부활해 계속
          // 사냥한다. 자동 등반이 꺼지는 곳은 몹이 쌓여 한 층 강등될 때(위 `MOB_CAP` 블록)뿐이다.
          p.hp = totalStats(this.save).health; this.save.health = p.hp; p.x = 0; p.y = 0; this.chaseTarget = undefined; this.pursuing = false;
          this.regenClock = 0;
          // 쓰러짐 패널티(10골드, 모자라면 0까지)도 `progress.ts`가 정한다(PR-3·작업 245).
          defeatPenalty(this.save);
          this.onMessage(climbOn
            ? '쓰러졌습니다. 10골드를 잃고 부활했습니다. 1마리부터 다시 잡으면 보스가 다시 나타납니다.'
            : this.save.autoClimb
              ? '쓰러졌습니다. 10골드를 잃고 부활했습니다. 자동 등반은 계속됩니다.'
              : '쓰러졌습니다. 10골드를 잃고 부활했습니다.');
          this.onChange();
  }


  /** 필드 단계 — 목표 생존 수 젠·30마리 유예 강등(밸런스 v2). */
  protected tickSpawn(dt: number): void {
    this.spawnTimer -= dt;
    // 보스전(보스 예약·보스 생존) 중에는 **일반 몹을 부르지 않는다**(작업 212 `#5017`).
    const bossFight = this.bossPending || this.enemies.some(enemy => enemy.boss);
    if (this.spawnTimer <= 0) {
      const boss = this.bossFloor() && this.bossPending && !this.enemies.some(enemy => enemy.boss);
      if (boss) {
        this.spawnTimer = .4;
        this.spawnMob(true, false);
      } else if (bossFight) {
        // 보스전 중에는 빈 타이머만 돌리고 아무도 부르지 않는다(정예 예약도 미룬다).
        this.spawnTimer = .4;
      } else {
        // 목표 생존 수(1~5층 3 · 6~15층 5 · 16층+ 7)를 리필 간격마다 1~2마리로 채운다.
        this.spawnTimer = spawnRefillSeconds(this.save.floor);
        const room = Math.min(targetAliveCount(this.save.floor) - this.enemies.length, MOB_CAP - this.enemies.length);
        const count = Math.max(0, Math.min(room, spawnsPerRefill(this.save.floor)));
        for (let index = 0; index < count; index++) {
          const elite = this.elitePending && index === 0;
          this.spawnMob(false, elite);
          if (elite) { this.elitePending = false; this.onMessage(`정예 ${floorEliteName(this.save.floor)} 등장!`); }
        }
      }
    }
    // 몹이 상한(30마리)에 닿은 채로 **10초**를 넘기면 한 층 내려간다(밸런스 v2 — 한 번의 몰림으로 층이 깎이지 않게).
    // 목표 생존 수 아래에서는 좀처럼 닿지 않는 안전망이고, 1층에는 더 내려갈 층이 없어 상한만 지킨다.
    if (this.enemies.length >= MOB_CAP) {
      this.crowdClock += dt;
      if (this.crowdClock >= MOB_CAP_GRACE_SECONDS && this.save.floor > 1) {
        this.save.floor--;
        this.save.floorKills = 0;
        this.enemies = [];
        this.chaseTarget = undefined; this.pursuing = false;
        this.bossPending = false; this.elitePending = false; this.spawnTimer = .2; this.crowdClock = 0;
        // 자동 등반은 **강등당했을 때만** 꺼진다(작업 245).
        this.save.autoClimb = false;
        this.onMessage(`적이 너무 많아 ${this.save.floor}층으로 내려갑니다. 자동 등반이 중단됩니다.`);
        this.onChange();
      }
    } else this.crowdClock = 0;
  }

  /** 몹 한 마리를 필드 외곽에 세운다 — 보스는 체력·쿨다운을 채우고 남은 몹을 정리한다(작업 212·223). */
  private spawnMob(boss: boolean, elite: boolean): void {
    const p = this.player;
    const spawn = spawnArenaEnemy(p, random() * Math.PI * 2, fieldSpawnBand.near + random() * (fieldSpawnBand.far - fieldSpawnBand.near));
    const hp = enemyMaxHp(this.save.floor, boss) * (elite ? ELITE_HP_SCALE : 1);
    if (boss) {
      // 층 보스는 **체력이 꽉 찬 상태로** 맞이한다(작업 222). 스킬 쿨타임도 함께 돌린다(작업 223).
      this.player.hp = totalStats(this.save).health; this.save.health = this.player.hp;
      for (const kind of Object.keys(this.cooldown) as Action[]) this.cooldown[kind] = 0;
      this.enemies = this.enemies.filter(enemy => enemy.boss);
      this.chaseTarget = undefined; this.pursuing = false;
    }
    this.enemies.push({ x: spawn.x, y: spawn.y, hp, maxHp: hp, boss, elite, hit: 0, step: random() * Math.PI * 2, moving: false, knockX: 0, knockY: 0, slow: 0 });
    if (boss) this.bossPending = false;
  }


  /** 필드 단계 — 바닥 드롭 흡수·가방·자동 분해와 코인 수명(원래 `update`의 드롭/코인 루프). */
  protected tickLoot(dt: number): void {
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
      // 지급은 `addItemToBag` 한 곳을 지난다(작업 256) — `itemGranted` 신호가 여기서 나간다.
      addItemToBag(this.save, drop.item, 'field');
      drop.age = -1;
      if (drop.item.name === starterWeaponName(this.job) && this.save.tutorial === 1) this.save.tutorial = 2;
      this.onMessage(`${itemDisplayName(drop.item)} 획득!`);
      this.onChange();
    }
    this.drops = this.drops.filter(d => d.age >= 0 && (d.age < 90 || (d.item.name === starterWeaponName(this.job) && this.save.tutorial < 3)));
    // Coins are only what the field draws: the gold was paid at the kill and nothing is added here.
    for (const coin of this.coins) coin.age += dt;
    this.coins = this.coins.filter(coin => coin.age < LOOT_REST_SECONDS + LOOT_ABSORB_SECONDS);
  }


  /**
   * 필드 한 프레임 — 예전 `World.update`와 **같은 순서**다. 엔진 단계 사이에 필드 단계를 끼운다:
   * 스폰·강등은 적을 움직이기 전(같은 프레임에 새 몹이 움직인다), 드롭은 회복 뒤·연출 판정 전.
   */
  override update(dt: number): void {
    if (this.paused) return;
    this.tickStart(dt);
    this.tickSpawn(dt);
    this.tickEnemies(dt);
    this.tickRegen(dt);
    this.tickLoot(dt);
    this.tickEffects(dt);
    this.save.health = this.player.hp;
  }

}
