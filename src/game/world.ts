import { expToNext, rollItem, totalStats, type Item, type Save } from './store';

export type Enemy = { x: number; y: number; hp: number; maxHp: number; boss: boolean; hit: number; step: number; moving: boolean; knockX: number; knockY: number };
export type Drop = { x: number; y: number; item: Item; age: number; warned: boolean };
export type Effect = { x: number; y: number; kind: 'slash' | 'spin' | 'slam' | 'warcry' | 'hit' | 'death'; age: number; duration: number; angle: number };
export type Action = 'attack' | 'spin' | 'slam' | 'warcry';
export const cooldowns: Record<Action, number> = { attack: .42, spin: 5, slam: 7, warcry: 12 };
export const costs: Record<Action, number> = { attack: 0, spin: 18, slam: 24, warcry: 30 };

export class World {
  player = { x: 0, y: 0, facing: 1, mp: 100, hp: 100, berserk: 0, hit: 0 };
  enemies: Enemy[] = [];
  drops: Drop[] = [];
  effects: Effect[] = [];
  cooldown: Record<Action, number> = { attack: 0, spin: 0, slam: 0, warcry: 0 };
  spawnTimer = 0;
  attackHeld = false;
  move = { x: 0, y: 0 };
  keyboardMove = { x: 0, y: 0 };
  activeMove = { x: 0, y: 0 };
  joystickActive = false;
  keyboardActive = false;
  bossPending = false;
  onChange: () => void = () => {};
  onMessage: (text: string) => void = () => {};

  constructor(public save: Save) {
    this.player.hp = Math.min(save.health, totalStats(save).health);
    this.enemies.push({ x: 145, y: -45, hp: 22, maxHp: 22, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0 });
  }

  action(kind: Action): void {
    if (this.cooldown[kind] > 0) return;
    if (this.player.mp < costs[kind]) { this.onMessage('마나가 부족합니다.'); return; }
    this.player.mp -= costs[kind];
    this.cooldown[kind] = cooldowns[kind];
    const p = this.player;
    const target = this.nearest();
    if (kind === 'attack') {
      const angle = target && Math.hypot(target.x - p.x, target.y - p.y) < 95 ? Math.atan2(target.y - p.y, target.x - p.x) : p.facing;
      p.facing = angle;
      this.effects.push({ x: p.x, y: p.y, kind: 'slash', age: 0, duration: .25, angle });
      this.damage(86, totalStats(this.save).attack * (p.berserk > 0 ? 1.5 : 1), angle, .95);
    } else if (kind === 'spin') {
      this.effects.push({ x: p.x, y: p.y, kind: 'spin', age: 0, duration: .55, angle: 0 });
      this.damage(105, totalStats(this.save).attack * 1.65, 0, Math.PI);
    } else if (kind === 'slam') {
      this.effects.push({ x: p.x, y: p.y, kind: 'slam', age: 0, duration: .65, angle: p.facing });
      this.damage(125, totalStats(this.save).attack * 2.2, p.facing, 1.35, 55);
    } else {
      p.berserk = 6;
      this.effects.push({ x: p.x, y: p.y, kind: 'warcry', age: 0, duration: .7, angle: 0 });
      for (const enemy of this.enemies) {
        const dx = enemy.x - p.x, dy = enemy.y - p.y, d = Math.hypot(dx, dy);
        if (d < 115 && d > 0) { enemy.x += dx / d * 40; enemy.y += dy / d * 40; }
      }
    }
  }

  nearest(): Enemy | undefined {
    return this.enemies.reduce<Enemy | undefined>((best, e) => !best || Math.hypot(e.x - this.player.x, e.y - this.player.y) < Math.hypot(best.x - this.player.x, best.y - this.player.y) ? e : best, undefined);
  }

  damage(radius: number, amount: number, angle: number, arc: number, knockback = 12): void {
    for (const enemy of this.enemies) {
      const dx = enemy.x - this.player.x, dy = enemy.y - this.player.y, dist = Math.hypot(dx, dy);
      const diff = Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle));
      if (dist > radius || Math.abs(diff) > arc) continue;
      enemy.hp -= amount;
      enemy.hit = .18;
      if (knockback && dist) { enemy.knockX += dx / dist * knockback * 12; enemy.knockY += dy / dist * knockback * 12; }
      this.effects.push({ x: enemy.x, y: enemy.y, kind: 'hit', age: 0, duration: .25, angle: 0 });
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
    if (guaranteed || Math.random() < (enemy.boss ? .42 : .04)) {
      this.drops.push({ x: enemy.x, y: enemy.y, item: rollItem(this.save.floor, guaranteed, enemy.boss), age: 0, warned: false });
      if (guaranteed) { this.save.tutorial = 1; this.onMessage('낡은 검이 떨어졌습니다. 빛기둥으로 이동하세요!'); }
    }
    if (enemy.boss) {
      this.save.floor++;
      this.bossPending = false;
      this.onMessage(`${this.save.floor}층 진입`);
    } else if (this.save.kills % 12 === 0) {
      this.bossPending = true;
      this.onMessage('해골 군주가 나타났습니다!');
    }
    this.onChange();
  }

  update(dt: number): void {
    const p = this.player;
    for (const kind of Object.keys(this.cooldown) as Action[]) this.cooldown[kind] = Math.max(0, this.cooldown[kind] - dt);
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
        if (!drop && distance < 120) {
          const nearby = this.enemies.filter(enemy => Math.hypot(enemy.x - p.x, enemy.y - p.y) < 105).length;
          if (distance < 90) this.action('attack');
          if (nearby >= 1 && this.cooldown.spin <= 0 && p.mp >= costs.spin) this.action('spin');
          if (this.cooldown.slam <= 0 && p.mp >= costs.slam) this.action('slam');
          if (this.cooldown.warcry <= 0 && p.mp >= costs.warcry) this.action('warcry');
        }
      } else this.activeMove = { x: 0, y: 0 };
    }
    const magnitude = Math.hypot(this.activeMove.x, this.activeMove.y);
    if (magnitude > .05) {
      const speed = (p.berserk > 0 ? 160 : 125) * dt / Math.max(1, magnitude);
      p.x += this.activeMove.x * speed; p.y += this.activeMove.y * speed;
      p.facing = Math.atan2(this.activeMove.y, this.activeMove.x);
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length < 18) {
      this.spawnTimer = Math.max(.55, 1.8 - this.save.floor * .08);
      const angle = Math.random() * Math.PI * 2;
      const boss = this.bossPending && !this.enemies.some(e => e.boss);
      const d = 250 + Math.random() * 60;
      const hp = boss ? 160 + this.save.floor * 35 : 18 + this.save.floor * 5;
      this.enemies.push({ x: p.x + Math.cos(angle) * d, y: p.y + Math.sin(angle) * d, hp, maxHp: hp, boss, hit: 0, step: Math.random() * Math.PI * 2, moving: false, knockX: 0, knockY: 0 });
      if (boss) this.bossPending = false;
    }
    for (const enemy of this.enemies) {
      const dx = p.x - enemy.x, dy = p.y - enemy.y, d = Math.hypot(dx, dy);
      enemy.moving = d > 27;
      if (enemy.moving && d > 0) { const step = (enemy.boss ? 32 : 45 + this.save.floor * 2) * dt; enemy.x += dx / d * step; enemy.y += dy / d * step; enemy.step += dt * (enemy.boss ? 7 : 11); }
      enemy.x += enemy.knockX * dt; enemy.y += enemy.knockY * dt;
      enemy.knockX *= Math.exp(-dt * 12); enemy.knockY *= Math.exp(-dt * 12);
      if (d < 35 && p.hit <= 0) {
        p.hp = Math.max(0, p.hp - Math.max(1, (enemy.boss ? 20 : 7) - totalStats(this.save).defense * .2));
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
          if (drop.item.name === '낡은 검' && this.save.tutorial === 1) this.save.tutorial = 2;
          this.onMessage(`${drop.item.name} 획득!`);
          this.onChange();
        } else if (!drop.warned) { drop.warned = true; this.onMessage('가방이 가득 찼습니다. 장비를 분해하세요.'); }
      }
    }
    this.drops = this.drops.filter(d => d.age >= 0 && (d.age < 90 || (d.item.name === '낡은 검' && this.save.tutorial < 3)));
    for (const effect of this.effects) effect.age += dt;
    this.effects = this.effects.filter(e => e.age < e.duration);
    this.save.health = p.hp;
  }
}
