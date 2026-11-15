import { expToNext, floorKillTarget, rollItem, skillLevel, totalStats, type Item, type Save } from './store';
import { skillDamageScale, skillDuration, skillRange, skills, type SkillId } from './skills';

export type Enemy = { x: number; y: number; hp: number; maxHp: number; boss: boolean; hit: number; step: number; moving: boolean; knockX: number; knockY: number; slow: number };
export type Drop = { x: number; y: number; item: Item; age: number; warned: boolean };
export type Effect = { x: number; y: number; kind: 'slash' | 'slash2' | 'spin' | 'crushing' | 'slam' | 'warcry' | 'power' | 'destroy' | 'hell' | 'hit' | 'death'; age: number; duration: number; angle: number; swing?: number; amount?: number; nextHit?: number; power?: number; level?: number };
export type Action = 'attack' | SkillId;
export const cooldowns: Record<Action, number> = { attack: .48, slash2: skills.slash2.cooldown, spin: skills.spin.cooldown, crushing: skills.crushing.cooldown, slam: skills.slam.cooldown, warcry: skills.warcry.cooldown, power: skills.power.cooldown, destroy: skills.destroy.cooldown, hell: skills.hell.cooldown };
export const costs: Record<Action, number> = { attack: 0, slash2: skills.slash2.cost, spin: skills.spin.cost, crushing: skills.crushing.cost, slam: skills.slam.cost, warcry: skills.warcry.cost, power: skills.power.cost, destroy: skills.destroy.cost, hell: skills.hell.cost };
export function enemyMaxHp(floor: number, boss: boolean): number { return boss ? 300 + floor * 120 + floor * floor * 30 : 20 + floor * 10 + floor * floor * 2; }
export function enemyHitDamage(floor: number, boss: boolean, defense: number): number { return Math.max(1, (boss ? 22 + floor * 5 : 7 + floor * 2) - defense * .2); }

export class World {
  player = { x: 0, y: 0, facing: 1, mp: 100, hp: 100, berserk: 0, berserkLevel: 1, hit: 0 };
  enemies: Enemy[] = [];
  drops: Drop[] = [];
  effects: Effect[] = [];
  cooldown: Record<Action, number> = { attack: 0, slash2: 0, spin: 0, crushing: 0, slam: 0, warcry: 0, power: 0, destroy: 0, hell: 0 };
  spawnTimer = 0;
  attackHeld = false;
  attackPose = 0;
  move = { x: 0, y: 0 };
  keyboardMove = { x: 0, y: 0 };
  activeMove = { x: 0, y: 0 };
  joystickActive = false;
  keyboardActive = false;
  bossPending = false;
  private swing = 1;
  onChange: () => void = () => {};
  onMessage: (text: string) => void = () => {};

  constructor(public save: Save) {
    this.player.hp = Math.min(save.health, totalStats(save).health);
    this.bossPending = save.floorKills >= floorKillTarget(save.floor);
    const hp = enemyMaxHp(save.floor, false);
    this.enemies.push({ x: 145, y: -45, hp, maxHp: hp, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
  }

  action(kind: Action): void {
    if (this.cooldown[kind] > 0) return;
    if (kind !== 'attack' && (!this.save.learned.includes(kind) || !this.save.quickSlots.includes(kind))) { this.onMessage('습득하고 퀵슬롯에 장착한 스킬만 사용할 수 있습니다.'); return; }
    if (this.player.mp < costs[kind]) { this.onMessage('마나가 부족합니다.'); return; }
    this.player.mp -= costs[kind];
    const p = this.player;
    const level = kind === 'attack' ? 1 : skillLevel(this.save, kind);
    const range = kind === 'attack' ? 90 : skillRange(kind, level);
    const damageScale = skillDamageScale(level);
    const stats = totalStats(this.save);
    this.cooldown[kind] = kind === 'attack' ? cooldowns.attack / (1 + stats.speed / 100) * (p.berserk > 0 ? 1 / (1.5 + (p.berserkLevel - 1) * .08) : 1) : cooldowns[kind];
    if (kind !== 'warcry') this.attackPose = .32;
    const attack = stats.attack * (p.berserk > 0 ? 1.5 + (p.berserkLevel - 1) * .05 : 1);
    const target = this.nearest();
    if (kind === 'attack') {
      const angle = target && Math.hypot(target.x - p.x, target.y - p.y) < 95 ? Math.atan2(target.y - p.y, target.x - p.x) : p.facing;
      p.facing = angle;
      this.effects.push({ x: p.x, y: p.y, kind: 'slash', age: 0, duration: .25, angle, swing: this.swing });
      this.swing *= -1;
      this.damage(90, attack, angle, 1.15);
    } else if (kind === 'slash2') {
      this.effects.push({ x: p.x, y: p.y, kind: 'slash2', age: 0, duration: skillDuration(kind, level), angle: p.facing, nextHit: .28, power: attack * 1.25 * damageScale, level });
      this.damage(range, attack * .9 * damageScale, p.facing, .9);
    } else if (kind === 'spin') {
      this.effects.push({ x: p.x, y: p.y, kind: 'spin', age: 0, duration: skillDuration(kind, level), angle: 0, nextHit: .45, power: attack * .65 * damageScale, level });
      this.damage(range, attack * 1.65 * damageScale, 0, Math.PI);
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
        if (d < 115 && d > 0) { enemy.x += dx / d * 40; enemy.y += dy / d * 40; }
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

  damage(radius: number, amount: number, angle: number, arc: number, knockback = 12, slow = 0, origin: { x: number; y: number } = this.player): void {
    for (const enemy of this.enemies) {
      const dx = enemy.x - origin.x, dy = enemy.y - origin.y, dist = Math.hypot(dx, dy);
      const diff = Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle));
      if (dist > radius || Math.abs(diff) > arc) continue;
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
    this.save.gold += enemy.boss ? 70 * this.save.floor : 3 + this.save.floor;
    this.save.exp += enemy.boss ? 45 : 8;
    while (this.save.exp >= expToNext(this.save.level)) {
      this.save.exp -= expToNext(this.save.level);
      this.save.level++;
      this.player.hp = totalStats(this.save).health;
      this.onMessage(`레벨 ${this.save.level} 달성!`);
    }
    const guaranteed = this.save.tutorial === 0 && !enemy.boss;
    if (guaranteed || Math.random() < (enemy.boss ? .12 : .005)) {
      this.drops.push({ x: enemy.x, y: enemy.y, item: rollItem(this.save.floor, guaranteed, enemy.boss), age: 0, warned: false });
      if (guaranteed) { this.save.tutorial = 1; this.onMessage('낡은 두손검이 떨어졌습니다. 빛기둥으로 이동하세요!'); }
    }
    if (enemy.boss) {
      this.save.floor++;
      this.save.floorKills = 0;
      this.bossPending = false;
      this.onMessage(`${this.save.floor}층 진입`);
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
    const p = this.player;
    for (const kind of Object.keys(this.cooldown) as Action[]) this.cooldown[kind] = Math.max(0, this.cooldown[kind] - dt);
    this.attackPose = Math.max(0, this.attackPose - dt);
    p.berserk = Math.max(0, p.berserk - dt);
    p.hit = Math.max(0, p.hit - dt);
    p.mp = Math.min(100, p.mp + dt * 6);
    if (this.attackHeld) this.action('attack');
    this.activeMove = this.keyboardActive ? this.keyboardMove : this.move;
    if (this.save.auto && !this.joystickActive && !this.keyboardActive) {
      const drop = this.save.bag.length >= 40 ? undefined : this.drops.reduce<Drop | undefined>((best, current) => !best || Math.hypot(current.x - p.x, current.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? current : best, undefined);
      const target = drop ?? this.nearest();
      if (target) {
        const dx = target.x - p.x, dy = target.y - p.y, distance = Math.hypot(dx, dy);
        const desired = drop ? 20 : 68;
        this.activeMove = distance > desired ? { x: dx / distance, y: dy / distance } : { x: 0, y: 0 };
        if (distance > 1) p.facing = Math.atan2(dy, dx);
        if (!drop && distance < 190) {
          if (distance < 90) this.action('attack');
          for (const skill of this.save.quickSlots) {
            if (!this.save.learned.includes(skill) || this.cooldown[skill] > 0 || p.mp < costs[skill] || distance > skillRange(skill, skillLevel(this.save, skill))) continue;
            this.action(skill);
          }
        }
      } else this.activeMove = { x: 0, y: 0 };
    }
    const magnitude = Math.hypot(this.activeMove.x, this.activeMove.y);
    if (magnitude > .05) {
      const speed = (p.berserk > 0 ? 160 + (p.berserkLevel - 1) * 4 : 125) * dt / Math.max(1, magnitude);
      p.x += this.activeMove.x * speed; p.y += this.activeMove.y * speed;
      p.facing = Math.atan2(this.activeMove.y, this.activeMove.x);
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length < 18) {
      this.spawnTimer = Math.max(.55, 1.8 - this.save.floor * .08);
      const angle = Math.random() * Math.PI * 2;
      const boss = this.bossPending && !this.enemies.some(e => e.boss);
      const d = 250 + Math.random() * 60;
      const hp = enemyMaxHp(this.save.floor, boss);
      this.enemies.push({ x: p.x + Math.cos(angle) * d, y: p.y + Math.sin(angle) * d, hp, maxHp: hp, boss, hit: 0, step: Math.random() * Math.PI * 2, moving: false, knockX: 0, knockY: 0, slow: 0 });
      if (boss) this.bossPending = false;
    }
    for (const enemy of this.enemies) {
      const dx = p.x - enemy.x, dy = p.y - enemy.y, d = Math.hypot(dx, dy);
      enemy.moving = d > 27;
      if (enemy.moving && d > 0) { const step = (enemy.boss ? 32 : 45 + this.save.floor * 2) * (enemy.slow > 0 ? .55 : 1) * dt; enemy.x += dx / d * step; enemy.y += dy / d * step; enemy.step += dt * Math.PI * (enemy.boss ? 3.25 : 4.25); }
      enemy.x += enemy.knockX * dt; enemy.y += enemy.knockY * dt;
      enemy.knockX *= Math.exp(-dt * 12); enemy.knockY *= Math.exp(-dt * 12);
      enemy.slow = Math.max(0, enemy.slow - dt);
      if (d < 35 && p.hit <= 0) {
        p.hp = Math.max(0, p.hp - enemyHitDamage(this.save.floor, enemy.boss, totalStats(this.save).defense));
        p.hit = .85;
        if (p.hp <= 0) { p.hp = totalStats(this.save).health; this.save.health = p.hp; p.x = 0; p.y = 0; this.save.gold = Math.max(0, this.save.gold - 10); this.onMessage('쓰러졌습니다. 10골드를 잃고 부활했습니다.'); this.onChange(); }
      }
      enemy.hit = Math.max(0, enemy.hit - dt);
    }
    for (const drop of this.drops) {
      drop.age += dt;
      if (Math.hypot(drop.x - p.x, drop.y - p.y) < 42) {
        if (this.save.bag.length < 40) {
          this.save.bag.push(drop.item);
          drop.age = -1;
          if (drop.item.name === '낡은 두손검' && this.save.tutorial === 1) this.save.tutorial = 2;
          this.onMessage(`${drop.item.name} 획득!`);
          this.onChange();
        } else if (!drop.warned) { drop.warned = true; this.onMessage('가방이 가득 찼습니다. 장비를 분해하세요.'); }
      }
    }
    this.drops = this.drops.filter(d => d.age >= 0 && (d.age < 90 || (d.item.name === '낡은 두손검' && this.save.tutorial < 3)));
    for (const effect of [...this.effects]) {
      effect.age += dt;
      while (effect.nextHit !== undefined && effect.nextHit < effect.duration && effect.nextHit <= effect.age) {
        const level = effect.level ?? 1;
        if (effect.kind === 'slash2') this.damage(skillRange('slash2', level), effect.power ?? 0, effect.angle, .9, 20, 0, effect);
        if (effect.kind === 'spin') {
          const coil = Math.max(0, Math.min(1, (effect.age / effect.duration - .25) / .65));
          this.damage(skillRange('spin', level) * (1 - coil * coil * (3 - 2 * coil) * .67), effect.power ?? 0, 0, Math.PI, 10, 0, effect);
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
