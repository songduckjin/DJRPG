import { canStoreItem } from './bagCapacity';
import { bossGoldPiles, bossGoldSpot } from './bossLoot';
import { addExperience, floorKillTarget, rollItem, skillLevel, totalStats, type Item, type Save } from './store';
import { equipmentDropChance, rollSkillBook, skillBookDropChance } from './items';
import { dragonOrbitFactor, skillDamageScale, skillDuration, skillRange, skills, type SkillId } from './skills';
import { clampArenaPoint, spawnArenaEnemy } from './arena';
import { LOOT_ABSORB_SECONDS, LOOT_REST_SECONDS } from './loot';

export type Enemy = { x: number; y: number; hp: number; maxHp: number; boss: boolean; hit: number; step: number; moving: boolean; knockX: number; knockY: number; slow: number };
/** `absorb` is the age the pull into the character began at; while it is unset the drop still rests
 *  where it fell (`LOOT_REST_SECONDS`). Without that mark the renderer cannot tell a drop held back
 *  by a full bag from one already on its way in. */
export type Drop = { x: number; y: number; item: Item; age: number; warned: boolean; absorb?: number };
/** The coin a kill leaves behind. Its gold is already in `save.gold` (granted at the kill, as
 *  before); the coin itself is only what the field draws for a beat before it flies to the hero. */
export type Coin = { x: number; y: number; age: number; gold: number };
export type Effect = { x: number; y: number; kind: 'slash' | 'slash2' | 'spin' | 'crushing' | 'slam' | 'warcry' | 'power' | 'destroy' | 'hell' | 'hit' | 'death'; age: number; duration: number; angle: number; swing?: number; amount?: number; nextHit?: number; power?: number; level?: number };
export type Action = 'attack' | SkillId;
export const cooldowns: Record<Action, number> = { attack: .48, slash2: skills.slash2.cooldown, spin: skills.spin.cooldown, crushing: skills.crushing.cooldown, slam: skills.slam.cooldown, warcry: skills.warcry.cooldown, power: skills.power.cooldown, destroy: skills.destroy.cooldown, hell: skills.hell.cooldown };
/** 평타 한 방의 공격력 배율. 한 마리만 맞히는 대신 한 방이 무겁다(작업 150). */
export const basicAttackPower = 1.6;
export function enemyMoveSpeed(floor: number, boss: boolean): number {
  return boss ? 28 : Math.min(64, 38 + Math.max(0, floor - 1) * 1.2);
}
export function enemyMaxHp(floor: number, boss: boolean): number { return boss ? Math.round(220 + floor * 95 + Math.pow(floor, 1.6) * 32) : Math.round(24 + floor * 12 + Math.pow(floor, 1.55) * 4); }
export function enemyHitDamage(floor: number, boss: boolean, defense: number): number { return Math.max(1, Math.round(boss ? 20 + floor * 5.5 + Math.pow(floor, 1.3) * 1.2 : 7 + floor * 2.4 + Math.pow(floor, 1.25) * .5) - defense * .2); }

export class World {
  player = { x: 0, y: 0, facing: 0, facingSide: 1, hp: 100, berserk: 0, berserkLevel: 1, hit: 0 };
  enemies: Enemy[] = [];
  drops: Drop[] = [];
  coins: Coin[] = [];
  effects: Effect[] = [];
  cooldown: Record<Action, number> = { attack: 0, slash2: 0, spin: 0, crushing: 0, slam: 0, warcry: 0, power: 0, destroy: 0, hell: 0 };
  spawnTimer = 0;
  paused = false;
  attackHeld = false;
  attackPose = 0;
  activeMove = { x: 0, y: 0 };
  bossPending = false;
  private swing = 1;
  private chaseTarget?: Enemy;
  private pursuing = false;
  onChange: () => void = () => {};
  onMessage: (text: string) => void = () => {};

  constructor(public save: Save) {
    this.save.auto = true;
    this.player.hp = Math.min(save.health, totalStats(save).health);
    this.bossPending = save.floorKills >= floorKillTarget(save.floor);
    const hp = enemyMaxHp(save.floor, false);
    const start = clampArenaPoint(145, -45);
    this.enemies.push({ x: start.x, y: start.y, hp, maxHp: hp, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
  }

  travelToFloor(floor: number): { ok: boolean; message: string } {
    if (!Number.isInteger(floor) || floor < 1 || floor > this.save.maxFloor) return { ok: false, message: `이동할 수 없는 층입니다. 현재 최고 도달 층은 ${this.save.maxFloor}층입니다.` };
    if (floor === this.save.floor) return { ok: true, message: `이미 ${floor}층에서 사냥 중입니다.` };
    const lostDrops = this.drops.length;
    this.save.floor = floor;
    this.save.floorKills = 0;
    this.enemies = []; this.drops = []; this.coins = []; this.effects = [];
    this.bossPending = false; this.spawnTimer = 0;
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
    }
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
    const gold = enemy.boss ? 70 * this.save.floor : 3 + this.save.floor;
    this.save.gold += gold;
    // The coin shows the gold that was just paid: nothing is credited when it flies in. A boss's gold
    // hits the floor in ten heaps scattered around the body (작업 194), each its own drop with its own
    // fall; the heaps add up to the same gold, so the shower never pays twice.
    const heaps = enemy.boss ? bossGoldPiles(gold) : [gold];
    heaps.forEach((amount, index) => {
      const spot = enemy.boss ? bossGoldSpot(enemy.x, enemy.y, index) : enemy;
      const point = enemy.boss ? clampArenaPoint(spot.x, spot.y) : spot;
      this.coins.push({ x: point.x, y: point.y, age: 0, gold: amount });
    });
    const gained = addExperience(this.save, enemy.boss ? 45 : 8);
    if (gained) { this.player.hp = this.save.health; this.onMessage(`레벨 ${this.save.level} 달성!`); }
    // The gold is the boss's whole haul — ten heaps and nothing handed out on top (작업 195). Items
    // still come from the one chance roll every kill makes below, against the same field drop table
    // (the boss rates for a boss), so a boss never leaves five guaranteed pieces behind.
    const guaranteed = this.save.tutorial === 0, boss = enemy.boss;
    if (guaranteed || Math.random() < equipmentDropChance(this.save.floor, boss)) {
      this.drops.push({ x: enemy.x, y: enemy.y, item: rollItem(this.save.floor, guaranteed, boss), age: 0, warned: false });
      if (guaranteed) { this.save.tutorial = 1; this.onMessage('낡은 두손검이 떨어졌습니다. 잠시 뒤 자동으로 획득됩니다!'); }
    }
    if (Math.random() < skillBookDropChance(this.save.floor, boss)) {
      this.drops.push({ x: enemy.x, y: enemy.y, item: rollSkillBook(this.save.floor), age: 0, warned: false });
    }
    if (enemy.boss) {
      if (this.save.autoClimb) {
        this.save.floor++;
        this.save.maxFloor = Math.max(this.save.maxFloor, this.save.floor);
        this.enemies = [];
        this.chaseTarget = undefined; this.pursuing = false;
        this.activeMove = { x: 0, y: 0 };
        this.spawnTimer = .2;
      }
      this.save.floorKills = 0;
      this.bossPending = false;
      this.onMessage(this.save.autoClimb ? `${this.save.floor}층 진입` : `${this.save.floor}층 반복 사냥`);
    } else {
      this.save.floorKills++;
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
      this.pursuing = distance >= 90;
      this.activeMove = this.pursuing && distance > 0 ? { x: dx / distance, y: dy / distance } : { x: 0, y: 0 };
      if (distance > 1) this.faceTarget(destination);
      if (distance < 190) {
        if (distance < 90) this.action('attack');
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
      const spawn = spawnArenaEnemy(p, angle);
      const hp = enemyMaxHp(this.save.floor, boss);
      this.enemies.push({ x: spawn.x, y: spawn.y, hp, maxHp: hp, boss, hit: 0, step: Math.random() * Math.PI * 2, moving: false, knockX: 0, knockY: 0, slow: 0 });
      if (boss) this.bossPending = false;
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
        if (p.hp <= 0) { p.hp = totalStats(this.save).health; this.save.health = p.hp; p.x = 0; p.y = 0; this.save.gold = Math.max(0, this.save.gold - 10); this.onMessage('쓰러졌습니다. 10골드를 잃고 부활했습니다.'); this.onChange(); }
      }
      enemy.hit = Math.max(0, enemy.hit - dt);
    }
    // A drop rests on the ground for a beat, then is pulled to wherever the hero stands now. A full
    // bag keeps it on the ground (it still expires as before) and it flies in once there is room.
    for (const drop of this.drops) {
      drop.age += dt;
      if (drop.absorb === undefined) {
        if (drop.age < LOOT_REST_SECONDS) continue;
        if (!canStoreItem(this.save.bag, drop.item)) {
          if (!drop.warned) { drop.warned = true; this.onMessage('가방이 가득 찼습니다. 장비를 분해하세요.'); }
          continue;
        }
        drop.absorb = drop.age;
      }
      if (drop.age - drop.absorb < LOOT_ABSORB_SECONDS) continue;
      this.save.bag.push(drop.item);
      drop.age = -1;
      if (drop.item.name === '낡은 두손검' && this.save.tutorial === 1) this.save.tutorial = 2;
      this.onMessage(`${drop.item.name} 획득!`);
      this.onChange();
    }
    this.drops = this.drops.filter(d => d.age >= 0 && (d.age < 90 || (d.item.name === '낡은 두손검' && this.save.tutorial < 3)));
    // Coins are only what the field draws: the gold was paid at the kill and nothing is added here.
    for (const coin of this.coins) coin.age += dt;
    this.coins = this.coins.filter(coin => coin.age < LOOT_REST_SECONDS + LOOT_ABSORB_SECONDS);
    for (const effect of [...this.effects]) {
      effect.age += dt;
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
        if (effect.kind === 'slash2' || effect.kind === 'crushing') effect.nextHit = undefined;
        else effect.nextHit += effect.kind === 'spin' || effect.kind === 'slam' ? .45 : .4;
      }
    }
    this.effects = this.effects.filter(e => e.age < e.duration);
    this.save.health = p.hp;
  }
}
