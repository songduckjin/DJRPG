import { Application, Assets, Container, Graphics, Sprite, Text, TilingSprite, type Texture } from 'pixi.js';
import type { Enemy, World } from './world';
import type { Rarity } from './store';

const rarityColors: Record<Rarity, number> = { common: 0xffffff, magic: 0x57aaff, rare: 0xffd265, legendary: 0xff7d35 };
const paths = {
  floor: '/assets/dungeon_tile.jpg', male: '/assets/warrior_male_base.png',
  female: '/assets/warrior_female_base.png', armored: '/assets/warrior_armored.png',
  skeleton: '/assets/skeleton_warrior.png', boss: '/assets/skeleton_boss.png'
} as const;
type Art = keyof typeof paths;
type Dust = { x: number; y: number; vx: number; vy: number; age: number; duration: number; size: number };

export class GameView {
  app = new Application();
  private textures = {} as Record<Art, Texture>;
  private floor!: TilingSprite;
  private glow = new Graphics();
  private ground = new Graphics();
  private actors = new Container();
  private effects = new Graphics();
  private labels = new Container();
  private shade = new Graphics();
  private hero!: Sprite;
  private enemies = new Map<Enemy, Sprite>();
  private bossLabels = new Map<Enemy, Text>();
  private dust: Dust[] = [];
  private lastTime = 0;
  private lastHeroDust = 0;

  async mount(host: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: host, background: '#100d13', antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
    host.appendChild(this.app.canvas);
    const loaded = await Promise.all((Object.keys(paths) as Art[]).map(async key => [key, await Assets.load<Texture>(paths[key])] as const));
    for (const [key, texture] of loaded) { texture.source.scaleMode = 'linear'; this.textures[key] = texture; }
    this.floor = new TilingSprite({ texture: this.textures.floor, width: this.app.screen.width, height: this.app.screen.height });
    this.floor.tileScale.set(.82);
    this.hero = new Sprite(this.textures.male);
    this.hero.anchor.set(.5, 1);
    this.actors.addChild(this.hero);
    this.app.stage.addChild(this.floor, this.glow, this.ground, this.actors, this.effects, this.labels, this.shade);
  }

  draw(world: World, time: number): void {
    const dt = Math.min(.05, Math.max(0, time - this.lastTime)); this.lastTime = time;
    const w = this.app.screen.width, h = this.app.screen.height;
    const cx = w / 2, cy = h * .5;
    const project = (x: number, y: number): [number, number] => [cx + (x - world.player.x - y + world.player.y) * .86, cy + (x - world.player.x + y - world.player.y) * .43];
    this.floor.width = w; this.floor.height = h;
    this.floor.tilePosition.set((-world.player.x + world.player.y) * .86, (-world.player.x - world.player.y) * .43);
    this.floor.tint = 0x9c9290;
    this.glow.clear(); this.ground.clear(); this.effects.clear(); this.shade.clear();
    this.drawLighting(w, h, time);
    this.drawTerrain(world, project, time);
    this.drawDust(world, project, time, dt);
    this.drawRunes(world, cx, cy, time);
    const slam = world.effects.find(effect => effect.kind === 'slam');
    const shake = slam && slam.age > .2 ? (1 - slam.age / slam.duration) * 5 : 0;
    this.app.stage.position.set(shake ? (Math.random() * 2 - 1) * shake : 0, shake ? (Math.random() * 2 - 1) * shake : 0);
    for (const drop of world.drops) {
      const [x, y] = project(drop.x, drop.y), color = rarityColors[drop.item.rarity];
      const pulse = .65 + Math.sin(time * 5) * .18;
      this.glow.ellipse(x, y - 25, 12, 46).fill({ color, alpha: .13 * pulse });
      this.ground.rect(x - 2, y - 70, 4, 68).fill({ color, alpha: .5 * pulse });
      this.ground.ellipse(x, y + 2, 14, 5).fill({ color, alpha: .5 });
      this.ground.moveTo(x, y - 11).lineTo(x + 6, y - 5).lineTo(x, y + 1).lineTo(x - 6, y - 5).closePath().fill(color);
    }
    const live = new Set(world.enemies);
    for (const [enemy, sprite] of this.enemies) if (!live.has(enemy)) {
      this.actors.removeChild(sprite); sprite.destroy(); this.enemies.delete(enemy);
      const label = this.bossLabels.get(enemy); if (label) { this.labels.removeChild(label); label.destroy(); this.bossLabels.delete(enemy); }
    }
    const depths: { sprite: Sprite; depth: number }[] = [];
    for (const enemy of world.enemies) {
      let sprite = this.enemies.get(enemy);
      if (!sprite) {
        sprite = new Sprite(enemy.boss ? this.textures.boss : this.textures.skeleton);
        sprite.anchor.set(.5, 1);
        this.actors.addChild(sprite);
        this.enemies.set(enemy, sprite);
        if (enemy.boss) {
          const label = new Text({ text: '해골 군주', style: { fontFamily: 'Noto Sans KR', fontSize: 11, fill: 0xf0d7c4, fontWeight: 'bold' } });
          label.anchor.set(.5, 1); this.labels.addChild(label); this.bossLabels.set(enemy, label);
        }
      }
      const [x, y] = project(enemy.x, enemy.y);
      const scale = h * (enemy.boss ? .19 : .115) / sprite.texture.height * (enemy.hit > 0 ? 1.08 : 1);
      const step = enemy.moving ? Math.sin(enemy.step) : 0;
      this.ground.ellipse(x, y + 3, enemy.boss ? 19 : 11, enemy.boss ? 6 : 4).fill({ color: 0x000000, alpha: .4 });
      sprite.position.set(x, y - Math.abs(step) * (enemy.boss ? 2.5 : 2) + (enemy.hit > 0 ? 2 : 0));
      const face = (world.player.x - enemy.x) - (world.player.y - enemy.y) >= 0 ? 1 : -1;
      sprite.scale.set(scale * face, scale * (enemy.hit > 0 ? .89 : 1));
      sprite.rotation = enemy.moving ? step * .035 : 0;
      sprite.tint = enemy.hit > 0 ? 0xffffff : 0xcfcac5;
      sprite.alpha = enemy.hit > 0 ? (Math.floor(time * 30) % 2 ? .7 : 1) : 1;
      const barY = y - h * (enemy.boss ? .19 : .115) - 7;
      this.effects.rect(x - (enemy.boss ? 20 : 13), barY, enemy.boss ? 40 : 26, 3).fill(0x251517);
      this.effects.rect(x - (enemy.boss ? 20 : 13), barY, (enemy.boss ? 40 : 26) * Math.max(0, enemy.hp / enemy.maxHp), 3).fill(0xd53b3a);
      this.bossLabels.get(enemy)?.position.set(x, barY - 3);
      depths.push({ sprite, depth: enemy.x + enemy.y });
    }
    this.drawHero(world, cx, cy, time);
    depths.push({ sprite: this.hero, depth: world.player.x + world.player.y });
    depths.sort((a, b) => a.depth - b.depth).forEach((entry, index) => this.actors.setChildIndex(entry.sprite, index));
    for (const effect of world.effects) {
      const [x, y] = project(effect.x, effect.y), t = effect.age / effect.duration;
      if (effect.kind === 'slash') {
        const angle = Math.atan2(Math.sin(effect.angle) * .43 + Math.cos(effect.angle) * .43, Math.cos(effect.angle) * .86 - Math.sin(effect.angle) * .86);
        this.effects.arc(x, y - 18, 40 + t * 18, angle - .95, angle + .95).stroke({ color: 0xffd59d, width: 12 * (1 - t), alpha: .8 * (1 - t) });
        this.effects.arc(x, y - 18, 41 + t * 18, angle - .95, angle + .95).stroke({ color: 0xffffff, width: 5 * (1 - t), alpha: 1 - t });
      }
      else if (effect.kind === 'spin') this.effects.ellipse(x, y - 17, 90 * t + 20, 40 * t + 12).stroke({ color: 0xc9d7d8, width: 10 * (1 - t), alpha: 1 - t });
      else if (effect.kind === 'slam') {
        this.effects.ellipse(x, y, 120 * t, 50 * t).stroke({ color: 0xe24a38, width: 12 * (1 - t), alpha: 1 - t });
        for (let i = -2; i <= 2; i++) this.effects.moveTo(x, y).lineTo(x + Math.cos(effect.angle + i * .35) * (130 * t), y + Math.sin(effect.angle + i * .35) * (65 * t)).stroke({ color: 0xdf493f, width: 4 * (1 - t), alpha: 1 - t });
      }
      else if (effect.kind === 'warcry') this.effects.ellipse(x, y - 14, 110 * t, 46 * t).stroke({ color: 0xd93f38, width: 11 * (1 - t), alpha: 1 - t });
      else if (effect.kind === 'death') this.drawDeath(x, y, t, effect.angle);
      else this.effects.circle(x, y - 16, 10 * (1 - t)).fill({ color: 0xffffff, alpha: 1 - t });
    }
    this.shade.rect(0, 0, w, 40).fill({ color: 0x05040a, alpha: .58 });
    this.shade.rect(0, h - 50, w, 50).fill({ color: 0x05040a, alpha: .58 });
    this.shade.rect(0, 0, 30, h).fill({ color: 0x05040a, alpha: .55 });
    this.shade.rect(w - 30, 0, 30, h).fill({ color: 0x05040a, alpha: .55 });
  }

  private drawHero(world: World, x: number, y: number, time: number): void {
    const { player, save } = world;
    const equipped = !!save.equipment.armor;
    const texture = this.textures[equipped ? 'armored' : save.gender];
    if (this.hero.texture !== texture) this.hero.texture = texture;
    const moving = Math.hypot(world.activeMove.x, world.activeMove.y) > .05;
    const step = moving ? Math.sin(time * 13) : 0;
    let bob = moving ? -Math.abs(step) * 3 : 0;
    const local = world.effects.filter(effect => effect.kind !== 'hit' && effect.kind !== 'death' && Math.hypot(effect.x - player.x, effect.y - player.y) < 2);
    const attack = local.find(effect => effect.kind === 'slash');
    const spin = local.find(effect => effect.kind === 'spin');
    const slam = local.find(effect => effect.kind === 'slam');
    const cry = local.find(effect => effect.kind === 'warcry');
    const attackPulse = attack ? Math.sin(Math.PI * attack.age / attack.duration) : 0;
    if (slam) bob -= Math.sin(Math.PI * slam.age / slam.duration) * 17;
    const boost = cry ? 1 + .14 * (1 - cry.age / cry.duration) : 1;
    const scale = this.app.screen.height * .115 / texture.height;
    const face = Math.cos(player.facing) - Math.sin(player.facing) >= 0 ? 1 : -1;
    const lungeX = (Math.cos(player.facing) - Math.sin(player.facing)) * .86 * attackPulse * 11;
    const lungeY = (Math.cos(player.facing) + Math.sin(player.facing)) * .43 * attackPulse * 11;
    this.hero.scale.set(scale * face * boost * (attack ? 1.08 : 1), scale * boost * (attack ? .92 : slam && slam.age > .35 ? .86 : 1));
    this.hero.position.set(x + lungeX, y + bob + lungeY);
    this.hero.rotation = spin ? spin.age / spin.duration * Math.PI * 2 * face : moving ? step * .04 : 0;
    this.hero.tint = player.hit > 0 ? 0xffd4cf : 0xffffff;
    this.ground.ellipse(x, y + 4, 13, 5).fill({ color: 0x000000, alpha: .42 });
    if (save.equipment.weapon && !equipped) {
      const handX = x + face * (save.gender === 'male' ? 11 : 9) + lungeX;
      const handY = y - this.app.screen.height * .042 + bob + lungeY;
      this.effects.moveTo(handX, handY + 5).lineTo(handX + face * 3, handY - 17).stroke({ color: 0xd5d8d6, width: 3 });
      this.effects.moveTo(handX - face * 5, handY).lineTo(handX + face * 5, handY + 1).stroke({ color: 0x9b754d, width: 2 });
    }
    if (player.berserk > 0) {
      this.glow.circle(x, y - 25, 35).fill({ color: 0xb32d28, alpha: .12 });
    }
  }

  private drawRunes(world: World, x: number, y: number, time: number): void {
    const active = world.effects.find(effect => ['slash', 'spin', 'slam', 'warcry'].includes(effect.kind) && Math.hypot(effect.x - world.player.x, effect.y - world.player.y) < 2);
    if (!active && world.player.berserk <= 0) return;
    const t = active ? active.age / active.duration : 0;
    const burst = active?.kind === 'spin' || active?.kind === 'slam' || active?.kind === 'warcry';
    const radius = burst ? 17 + t * 27 : 18;
    const color = active?.kind === 'slam' || active?.kind === 'warcry' || world.player.berserk > 0 ? 0xff8d49 : 0x66d9d2;
    const alpha = active ? 1 - t : .32;
    this.glow.ellipse(x, y + 2, radius + 10, (radius + 10) * .43).fill({ color, alpha: .13 * alpha });
    this.ground.ellipse(x, y + 2, radius, radius * .42).stroke({ color, width: burst ? 3 : 2, alpha: .8 * alpha });
    this.ground.ellipse(x, y + 2, radius * .65, radius * .28).stroke({ color, width: 1, alpha: .6 * alpha });
    for (let i = 0; i < 8; i++) {
      const angle = time * (world.player.berserk > 0 ? 2.5 : 4) + i * Math.PI / 4;
      const px = x + Math.cos(angle) * radius, py = y + 2 + Math.sin(angle) * radius * .42;
      this.ground.circle(px, py, burst ? 2.5 : 1.6).fill({ color, alpha: .8 * alpha });
    }
  }

  private drawTerrain(world: World, project: (x: number, y: number) => [number, number], time: number): void {
    const tile = 180, ox = Math.floor(world.player.x / tile), oy = Math.floor(world.player.y / tile);
    for (let ix = ox - 3; ix <= ox + 3; ix++) for (let iy = oy - 3; iy <= oy + 3; iy++) {
      const hash = Math.abs(ix * 73 + iy * 131 + ix * iy * 11);
      if (hash % 5 !== 0) continue;
      const [x, y] = project(ix * tile + hash % 80, iy * tile + hash % 60);
      if (hash % 3 === 0) {
        this.ground.ellipse(x, y, 8, 3).fill({ color: 0x47433d, alpha: .55 });
        this.ground.circle(x - 2, y - 3, 4).fill({ color: 0x5b5549, alpha: .65 });
      } else if (hash % 3 === 1) {
        this.ground.ellipse(x, y, 8, 3).fill({ color: 0x3b4a31, alpha: .42 });
      } else {
        this.glow.circle(x, y, 13).fill({ color: 0xe3632d, alpha: .045 });
        this.ground.circle(x, y - 2 - Math.sin(time * 8 + hash) * 1.5, 2).fill({ color: 0xe87635, alpha: .62 });
      }
    }
  }

  private drawDust(world: World, project: (x: number, y: number) => [number, number], time: number, dt: number): void {
    const add = (x: number, y: number) => this.dust.push({ x, y, vx: (Math.random() - .5) * 18, vy: (Math.random() - .5) * 18, age: 0, duration: .45 + Math.random() * .2, size: 1.5 + Math.random() * 2 });
    if (Math.hypot(world.activeMove.x, world.activeMove.y) > .05 && time - this.lastHeroDust > .11) { add(world.player.x, world.player.y); this.lastHeroDust = time; }
    for (const enemy of world.enemies) if (enemy.moving && this.dust.length < 90 && Math.hypot(enemy.x - world.player.x, enemy.y - world.player.y) < 380 && Math.random() < dt * 2.5) add(enemy.x, enemy.y);
    for (const particle of this.dust) {
      particle.age += dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt;
      const [x, y] = project(particle.x, particle.y), fade = Math.max(0, 1 - particle.age / particle.duration);
      if (fade > 0) this.ground.circle(x, y + 3 - particle.age * 8, particle.size * fade).fill({ color: 0xbcb3a7, alpha: .24 * fade });
    }
    this.dust = this.dust.filter(particle => particle.age < particle.duration);
  }

  private drawDeath(x: number, y: number, t: number, seed: number): void {
    for (let i = 0; i < 5; i++) {
      const angle = seed + i * Math.PI * 2 / 5;
      const px = x + Math.cos(angle) * 25 * t, py = y - 25 * t + Math.sin(angle) * 12 * t;
      this.effects.circle(px, py, (7 + i % 3 * 3) * (1 - t)).fill({ color: 0x9a9390, alpha: .3 * (1 - t) });
      this.effects.moveTo(px - 3, py - 3).lineTo(px + 3, py + 3).stroke({ color: 0xd8d0bc, width: 2 * (1 - t), alpha: 1 - t });
    }
  }

  private drawLighting(w: number, h: number, time: number): void {
    for (let i = 0; i < 4; i++) {
      const x = i % 2 ? w * .88 : w * .12, y = i < 2 ? h * .16 : h * .75;
      const flicker = Math.sin(time * 8 + i * 5) * 4;
      this.glow.circle(x, y, 78 + flicker).fill({ color: 0xf0742e, alpha: .035 });
      this.glow.circle(x, y, 35 + flicker).fill({ color: 0xffa13d, alpha: .05 });
    }
  }
}
