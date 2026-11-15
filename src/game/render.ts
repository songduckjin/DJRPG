import { Application, Assets, Container, Graphics, Sprite, Text, TilingSprite, type Texture } from 'pixi.js';
import type { Effect, Enemy, World } from './world';
import type { Rarity } from './store';

const rarityColors: Record<Rarity, number> = { common: 0xffffff, magic: 0x57aaff, rare: 0xffd265, legendary: 0xff7d35 };
const paths = {
  floor: '/assets/dungeon_tile.jpg', male: '/assets/warrior_male_base.png',
  female: '/assets/warrior_female_base.png', armored: '/assets/warrior_armored.png',
  armoredNoHelm: '/assets/warrior_armored_nohelm.png',
  maleSword: '/assets/warrior_male_sword.png', femaleSword: '/assets/warrior_female_sword.png',
  maleAttack: '/assets/warrior_male_attack.png', femaleAttack: '/assets/warrior_female_attack.png', armoredAttack: '/assets/warrior_armored_attack.png',
  maleBaseWalk: '/assets/warrior_male_base_walk.png', maleSwordWalk: '/assets/warrior_male_walk.png',
  femaleWalk: '/assets/warrior_female_walk.png', armoredWalk: '/assets/warrior_armored_walk.png',
  skeleton: '/assets/skeleton_warrior.png', skeletonWalk: '/assets/skeleton_walk.png', boss: '/assets/skeleton_boss.png',
  fxSpin: '/assets/fx_dragon_twister.png', fxSlam: '/assets/fx_wild_stamp.png',
  fxRage: '/assets/fx_blood_rage.png', fxSlash: '/assets/fx_slash_arc.png',
  fxPower: '/assets/fx_power_strike.png', fxDestroy: '/assets/fx_destroy_swing.png', fxHell: '/assets/fx_hell_fire.png'
} as const;
type Art = keyof typeof paths;
const animationPaths = {
  maleWalk: Array.from({ length: 4 }, (_, i) => `/assets/warrior_male_walk_${i + 1}.png`),
  femaleWalk: Array.from({ length: 4 }, (_, i) => `/assets/warrior_female_walk_${i + 1}.png`),
  armoredWalk: Array.from({ length: 4 }, (_, i) => `/assets/warrior_armored_walk_${i + 1}.png`),
  armoredNoHelmWalk: Array.from({ length: 4 }, (_, i) => `/assets/warrior_armored_nohelm_walk_${i + 1}.png`),
  skeletonWalk: Array.from({ length: 4 }, (_, i) => `/assets/skeleton_walk_${i + 1}.png`),
  bossWalk: Array.from({ length: 4 }, (_, i) => `/assets/boss_walk_${i + 1}.png`),
  maleAttack: Array.from({ length: 4 }, (_, i) => `/assets/warrior_male_attack_${i + 1}.png`),
  femaleAttack: Array.from({ length: 4 }, (_, i) => `/assets/warrior_female_attack_${i + 1}.png`),
  armoredAttack: Array.from({ length: 4 }, (_, i) => `/assets/warrior_armored_attack_${i + 1}.png`),
  armoredNoHelmAttack: Array.from({ length: 4 }, (_, i) => `/assets/warrior_armored_nohelm_attack_${i + 1}.png`)
};
type Animation = keyof typeof animationPaths;
type Dust = { x: number; y: number; vx: number; vy: number; age: number; duration: number; size: number };
type Ghost = { sprite: Sprite; x: number; y: number; age: number; duration: number };
type Fallen = { sprite: Sprite; x: number; y: number; age: number; duration: number; scaleX: number; scaleY: number; rotation: number };

export class GameView {
  app = new Application();
  private textures = {} as Record<Art, Texture>;
  private animations = {} as Record<Animation, Texture[]>;
  private floor!: TilingSprite;
  private glow = new Graphics();
  private ground = new Graphics();
  private aura!: Sprite;
  private ghosts = new Container();
  private actors = new Container();
  private fallen = new Container();
  private skillVfx = new Container();
  private vfxSprites = new Map<Effect, Sprite[]>();
  private effects = new Graphics();
  private labels = new Container();
  private shade = new Graphics();
  private hero!: Sprite;
  private enemies = new Map<Enemy, Sprite>();
  private bossLabels = new Map<Enemy, Text>();
  private afterimages: Ghost[] = [];
  private corpses: Fallen[] = [];
  private ghostEmissions = new WeakMap<Effect, number>();
  private damageLabels = new Map<Effect, Text>();
  private dust: Dust[] = [];
  private lastTime = 0;
  private lastHeroDust = 0;

  async mount(host: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: host, background: '#100d13', antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
    host.appendChild(this.app.canvas);
    const loaded = await Promise.all((Object.keys(paths) as Art[]).map(async key => [key, await Assets.load<Texture>(paths[key])] as const));
    for (const [key, texture] of loaded) { texture.source.scaleMode = 'linear'; this.textures[key] = texture; }
    const animated = await Promise.all((Object.keys(animationPaths) as Animation[]).map(async key => [key, await Promise.all(animationPaths[key].map(path => Assets.load<Texture>(path)))] as const));
    for (const [key, textures] of animated) { for (const texture of textures) texture.source.scaleMode = 'linear'; this.animations[key] = textures; }
    this.floor = new TilingSprite({ texture: this.textures.floor, width: this.app.screen.width, height: this.app.screen.height });
    this.floor.tileScale.set(.82);
    this.hero = new Sprite(this.textures.male);
    this.hero.anchor.set(.5, .94);
    this.actors.addChild(this.hero);
    this.aura = new Sprite(this.textures.fxRage);
    this.aura.anchor.set(.5);
    this.aura.blendMode = 'add';
    this.aura.alpha = 0;
    this.app.stage.addChild(this.floor, this.glow, this.ground, this.aura, this.ghosts, this.actors, this.fallen, this.skillVfx, this.effects, this.labels, this.shade);
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
    const slam = world.effects.find(effect => effect.kind === 'slam' || effect.kind === 'hell');
    const shake = slam ? Math.max(0, 1 - slam.age / Math.min(slam.duration, .38)) * (slam.kind === 'hell' ? 8 : 4) : 0;
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
      this.actors.removeChild(sprite); this.fallen.addChild(sprite); this.enemies.delete(enemy);
      this.corpses.push({ sprite, x: enemy.x, y: enemy.y, age: 0, duration: enemy.boss ? .85 : .55, scaleX: sprite.scale.x, scaleY: sprite.scale.y, rotation: sprite.rotation });
      const label = this.bossLabels.get(enemy); if (label) { this.labels.removeChild(label); label.destroy(); this.bossLabels.delete(enemy); }
    }
    const depths: { sprite: Sprite; depth: number }[] = [];
    for (const enemy of world.enemies) {
      let sprite = this.enemies.get(enemy);
      if (!sprite) {
        sprite = new Sprite(enemy.boss ? this.textures.boss : this.textures.skeleton);
        sprite.anchor.set(.5, .94);
        this.actors.addChild(sprite);
        this.enemies.set(enemy, sprite);
        if (enemy.boss) {
          const label = new Text({ text: '해골 군주', style: { fontFamily: 'Noto Sans KR', fontSize: 11, fill: 0xf0d7c4, fontWeight: 'bold' } });
          label.anchor.set(.5, 1); this.labels.addChild(label); this.bossLabels.set(enemy, label);
        }
      }
      const [x, y] = project(enemy.x, enemy.y);
      const frame = Math.floor(enemy.step * 2 / Math.PI) % 4;
      const texture = enemy.moving ? enemy.boss ? this.animations.bossWalk[frame] : this.animations.skeletonWalk[frame] : enemy.boss ? this.textures.boss : this.textures.skeleton;
      if (sprite.texture !== texture) sprite.texture = texture;
      const scale = h * (enemy.boss ? .16 : .095) / texture.height;
      const step = enemy.moving ? Math.sin(enemy.step) : 0;
      this.ground.ellipse(x, y + 3, enemy.boss ? 16 : 9, enemy.boss ? 5 : 3.5).fill({ color: 0x000000, alpha: .4 });
      sprite.position.set(x + (enemy.hit > 0 ? Math.sin(time * 58) * 3 : 0), y - Math.abs(step) * 1.8 + (enemy.hit > 0 ? 2 : 0));
      const face = (world.player.x - enemy.x) - (world.player.y - enemy.y) >= 0 ? 1 : -1;
      sprite.scale.set(scale * face * (enemy.hit > 0 ? 1.08 : 1), scale * (enemy.hit > 0 ? .84 : 1));
      sprite.rotation = 0;
      sprite.tint = enemy.hit > 0 ? 0xffffff : 0xcfcac5;
      sprite.alpha = 1;
      const barY = y - h * (enemy.boss ? .16 : .095) - 7;
      this.effects.rect(x - (enemy.boss ? 20 : 13), barY, enemy.boss ? 40 : 26, 3).fill(0x251517);
      this.effects.rect(x - (enemy.boss ? 20 : 13), barY, (enemy.boss ? 40 : 26) * Math.max(0, enemy.hp / enemy.maxHp), 3).fill(0xd53b3a);
      this.bossLabels.get(enemy)?.position.set(x, barY - 3);
      depths.push({ sprite, depth: enemy.x + enemy.y });
    }
    this.drawHero(world, cx, cy, time);
    const rage = world.effects.find(effect => effect.kind === 'warcry');
    const burst = rage ? 1 - rage.age / rage.duration : 0;
    const auraScale = 165 / this.aura.texture.width * (1 + burst * .8);
    this.aura.position.set(cx, cy - 3);
    this.aura.scale.set(auraScale, auraScale * .6);
    this.aura.rotation = time * .35;
    this.aura.alpha = world.player.berserk > 0 ? .48 + burst * .48 + Math.sin(time * 4) * .08 : 0;
    this.updateAfterimages(world, project, dt);
    this.updateCorpses(project, dt);
    depths.push({ sprite: this.hero, depth: world.player.x + world.player.y });
    depths.sort((a, b) => a.depth - b.depth).forEach((entry, index) => this.actors.setChildIndex(entry.sprite, index));
    const liveEffects = new Set(world.effects);
    for (const [effect, sprites] of this.vfxSprites) if (!liveEffects.has(effect)) { for (const sprite of sprites) sprite.destroy(); this.vfxSprites.delete(effect); }
    for (const effect of world.effects) {
      const [x, y] = project(effect.x, effect.y), t = effect.age / effect.duration;
      const screenAngle = Math.atan2(Math.sin(effect.angle) * .43 + Math.cos(effect.angle) * .43, Math.cos(effect.angle) * .86 - Math.sin(effect.angle) * .86);
      if (this.drawSkillVfx(effect, x, y, t, screenAngle)) continue;
      if (effect.kind === 'death') this.drawDeath(x, y, t, effect.angle);
      else this.drawHit(x, y, t, effect.angle);
    }
    this.updateDamageLabels(world.effects, project);
    const sight = Math.min(w, h) * .53 + Math.sin(time * 3) * 3;
    for (let ring = 0; ring < 7; ring++) {
      this.shade.rect(0, 0, w, h).fill({ color: 0x030208, alpha: .11 });
      this.shade.circle(cx, cy, sight + ring * 33).cut();
    }
  }

  private drawSkillVfx(effect: Effect, x: number, y: number, t: number, screenAngle: number): boolean {
    if (effect.kind === 'warcry') return true;
    if (effect.kind === 'hit' || effect.kind === 'death') return false;
    const art: Art = effect.kind === 'spin' ? 'fxSpin' : effect.kind === 'slam' ? 'fxSlam' : effect.kind === 'power' ? 'fxPower' : effect.kind === 'destroy' ? 'fxDestroy' : effect.kind === 'hell' ? 'fxHell' : 'fxSlash';
    let sprites = this.vfxSprites.get(effect);
    if (!sprites) {
      sprites = Array.from({ length: effect.kind === 'slash2' ? 2 : 1 }, () => {
        const sprite = new Sprite(this.textures[art]);
        sprite.anchor.set(.5);
        sprite.blendMode = 'add';
        this.skillVfx.addChild(sprite);
        return sprite;
      });
      this.vfxSprites.set(effect, sprites);
    }
    const width = this.app.screen.width;
    const size = effect.kind === 'hell' ? width * .95 : effect.kind === 'destroy' ? 260 : effect.kind === 'slam' ? 335 : effect.kind === 'spin' ? Math.max(320, width * .92) : effect.kind === 'power' ? 165 : 150;
    for (const [index, sprite] of sprites.entries()) {
      const phase = effect.kind === 'slash2' ? Math.max(0, Math.min(1, t * 1.6 - index * .45)) : t;
      const scale = size / sprite.texture.width * (effect.kind === 'spin' ? .85 + phase * .35 : .65 + phase * .55);
      const distance = effect.kind === 'destroy' ? 40 + t * 125 : effect.kind === 'power' ? 70 : 0;
      sprite.position.set(x + Math.cos(screenAngle) * distance, y + Math.sin(screenAngle) * distance - (effect.kind === 'power' ? 45 : effect.kind === 'slam' || effect.kind === 'spin' ? 4 : 18));
      sprite.scale.set(scale, scale * (effect.kind === 'slam' ? .6 : effect.kind === 'spin' ? .8 : 1));
      sprite.rotation = effect.kind === 'spin' ? t * Math.PI * 4.5 : effect.kind === 'slam' || effect.kind === 'hell' || effect.kind === 'power' ? 0 : screenAngle + (effect.kind === 'slash2' ? index ? -.55 : .55 : 0);
      sprite.alpha = effect.kind === 'slash2' && t < index * .28 ? 0 : Math.min(1, (1 - phase) * 1.5);
      sprite.tint = 0xffffff;
    }
    return true;
  }

  private drawHero(world: World, x: number, y: number, time: number): void {
    const { player, save } = world;
    const equipped = !!save.equipment.armor;
    const moving = Math.hypot(world.activeMove.x, world.activeMove.y) > .05;
    const walkingFrame = Math.floor(time * 8.5) % 4;
    const attackFrame = Math.min(3, Math.floor((1 - world.attackPose / .32) * 4));
    const art: Art = equipped ? save.equipment.helmet ? 'armored' : 'armoredNoHelm' : save.equipment.weapon ? save.gender === 'male' ? 'maleSword' : 'femaleSword' : save.gender;
    let texture = this.textures[art];
    if (world.attackPose > 0) texture = this.animations[equipped ? save.equipment.helmet ? 'armoredAttack' : 'armoredNoHelmAttack' : save.gender === 'male' ? 'maleAttack' : 'femaleAttack'][Math.max(0, attackFrame)];
    else if (moving) {
      if (equipped) texture = this.animations[save.equipment.helmet ? 'armoredWalk' : 'armoredNoHelmWalk'][walkingFrame];
      else if (save.gender === 'female') texture = this.animations.femaleWalk[walkingFrame];
      else if (save.equipment.weapon) texture = this.animations.maleWalk[walkingFrame];
      else texture = Math.floor(time * 6) % 2 ? this.textures.maleBaseWalk : this.textures.male;
    }
    if (this.hero.texture !== texture) this.hero.texture = texture;
    const step = moving ? Math.sin(time * 13) : 0;
    let bob = moving && world.attackPose <= 0 ? -Math.abs(step) * 2 : 0;
    const local = world.effects.filter(effect => effect.kind !== 'hit' && effect.kind !== 'death' && Math.hypot(effect.x - player.x, effect.y - player.y) < 2);
    const attack = local.find(effect => ['slash', 'slash2', 'power', 'destroy'].includes(effect.kind));
    const spin = local.find(effect => effect.kind === 'spin');
    const slam = local.find(effect => effect.kind === 'slam' || effect.kind === 'hell');
    const cry = local.find(effect => effect.kind === 'warcry');
    const attackPulse = world.attackPose > 0 ? Math.sin(Math.PI * (1 - world.attackPose / .32)) : 0;
    if (slam) bob -= Math.sin(Math.PI * slam.age / slam.duration) * 17;
    const boost = cry ? 1 + .14 * (1 - cry.age / cry.duration) : 1;
    const scale = this.app.screen.height * .095 / texture.height;
    const face = Math.cos(player.facing) - Math.sin(player.facing) >= 0 ? 1 : -1;
    const lungeX = (Math.cos(player.facing) - Math.sin(player.facing)) * .86 * attackPulse * 24;
    const lungeY = (Math.cos(player.facing) + Math.sin(player.facing)) * .43 * attackPulse * 24;
    this.hero.scale.set(scale * face * boost * (world.attackPose > 0 ? 1 + attackPulse * .15 : 1), scale * boost * (world.attackPose > 0 ? 1 - attackPulse * .15 : slam && slam.age > .35 ? .82 : 1));
    this.hero.position.set(x + lungeX + (player.hit > 0 ? Math.sin(time * 55) * 2 : 0), y + bob + lungeY);
    this.hero.rotation = spin ? spin.age / spin.duration * Math.PI * 2 * face : attack ? (attack.swing ?? 1) * .2 * attackPulse * face : 0;
    this.hero.tint = player.hit > 0 ? 0xffd4cf : 0xffffff;
    this.ground.ellipse(x, y + 4, 11, 4).fill({ color: 0x000000, alpha: .42 });
    if (player.berserk > 0) {
      this.glow.circle(x, y - 25, 35).fill({ color: 0xb32d28, alpha: .12 });
    }
  }

  private updateAfterimages(world: World, project: (x: number, y: number) => [number, number], dt: number): void {
    for (const effect of world.effects) {
      if (!['slash', 'slash2', 'spin', 'slam', 'power', 'destroy', 'hell'].includes(effect.kind) || effect.age > .19) continue;
      const index = Math.floor(effect.age / .065);
      if (index >= 3 || index <= (this.ghostEmissions.get(effect) ?? -1)) continue;
      this.ghostEmissions.set(effect, index);
      const sprite = new Sprite(this.hero.texture);
      sprite.anchor.set(.5, .94); sprite.scale.set(this.hero.scale.x, this.hero.scale.y); sprite.rotation = this.hero.rotation;
      sprite.tint = ['slam', 'destroy', 'hell'].includes(effect.kind) ? 0xffa06c : 0x8fe6dc;
      this.ghosts.addChild(sprite);
      const trail = 5 + index * 5;
      this.afterimages.push({ sprite, x: world.player.x - Math.cos(world.player.facing) * trail, y: world.player.y - Math.sin(world.player.facing) * trail, age: 0, duration: .22 });
    }
    for (const ghost of this.afterimages) {
      ghost.age += dt;
      const [x, y] = project(ghost.x, ghost.y);
      ghost.sprite.position.set(x, y);
      ghost.sprite.alpha = .38 * Math.max(0, 1 - ghost.age / ghost.duration);
    }
    this.afterimages = this.afterimages.filter(ghost => {
      if (ghost.age < ghost.duration) return true;
      this.ghosts.removeChild(ghost.sprite); ghost.sprite.destroy(); return false;
    });
  }

  private updateCorpses(project: (x: number, y: number) => [number, number], dt: number): void {
    for (const corpse of this.corpses) {
      corpse.age += dt;
      const t = corpse.age / corpse.duration, [x, y] = project(corpse.x, corpse.y);
      corpse.sprite.position.set(x + t * 9 * Math.sign(corpse.scaleX), y + t * 13);
      corpse.sprite.scale.set(corpse.scaleX * (1 - t * .2), corpse.scaleY * (1 - t * .65));
      corpse.sprite.rotation = corpse.rotation + t * 1.1 * Math.sign(corpse.scaleX);
      corpse.sprite.alpha = Math.max(0, 1 - t);
    }
    this.corpses = this.corpses.filter(corpse => {
      if (corpse.age < corpse.duration) return true;
      this.fallen.removeChild(corpse.sprite); corpse.sprite.destroy(); return false;
    });
  }

  private drawHit(x: number, y: number, t: number, seed: number): void {
    for (let i = 0; i < 10; i++) {
      const angle = seed + i * Math.PI * 2 / 10;
      const radius = 5 + t * (21 + i % 3 * 5);
      const px = x + Math.cos(angle) * radius, py = y - 18 + Math.sin(angle) * radius * .7;
      const length = 6 * (1 - t);
      this.effects.moveTo(px, py).lineTo(px + Math.cos(angle) * length, py + Math.sin(angle) * length).stroke({ color: i % 2 ? 0xffa14d : 0xffffff, width: 2.5 * (1 - t), alpha: 1 - t });
    }
  }

  private updateDamageLabels(effects: Effect[], project: (x: number, y: number) => [number, number]): void {
    const hits = new Set(effects.filter(effect => effect.kind === 'hit'));
    for (const [effect, label] of this.damageLabels) if (!hits.has(effect)) { this.labels.removeChild(label); label.destroy(); this.damageLabels.delete(effect); }
    for (const effect of hits) {
      let label = this.damageLabels.get(effect);
      if (!label) {
        label = new Text({ text: `-${effect.amount ?? 0}`, style: { fontFamily: 'Cinzel', fontSize: 16, fontWeight: 'bold', fill: 0xffd6a0 } });
        label.anchor.set(.5, 1); this.labels.addChild(label); this.damageLabels.set(effect, label);
      }
      const t = effect.age / effect.duration, [x, y] = project(effect.x, effect.y);
      label.position.set(x + Math.cos(effect.angle) * 6, y - 24 - t * 25);
      label.scale.set(1 + Math.sin(Math.PI * t) * .25);
      label.alpha = Math.max(0, 1 - t);
    }
  }

  private drawRunes(world: World, x: number, y: number, time: number): void {
    const active = world.effects.find(effect => ['slash', 'slash2', 'spin', 'slam', 'warcry', 'power', 'destroy', 'hell'].includes(effect.kind) && Math.hypot(effect.x - world.player.x, effect.y - world.player.y) < 2);
    if (!active && world.player.berserk <= 0) return;
    const t = active ? active.age / active.duration : 0;
    const burst = active?.kind === 'spin' || active?.kind === 'slam' || active?.kind === 'warcry' || active?.kind === 'hell';
    const radius = burst ? 17 + t * 27 : 18;
    const color = active?.kind === 'slam' || active?.kind === 'warcry' || active?.kind === 'hell' || world.player.berserk > 0 ? 0xff8d49 : 0x66d9d2;
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
    for (let ix = ox - 4; ix <= ox + 4; ix++) for (let iy = oy - 4; iy <= oy + 4; iy++) {
      let hash = Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663);
      hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
      hash = (hash ^ (hash >>> 16)) >>> 0;
      if (hash % 5 !== 0) continue;
      const [x, y] = project(ix * tile + ((hash >>> 8) % 100) - 50, iy * tile + ((hash >>> 16) % 100) - 50);
      if (hash % 3 === 0) {
        this.ground.ellipse(x, y + 2, 21, 7).fill({ color: 0x070b08, alpha: .47 });
        this.ground.moveTo(x - 16, y).lineTo(x - 12, y - 10).lineTo(x + 2, y - 15).lineTo(x + 15, y - 7).lineTo(x + 18, y).closePath().fill(0x555c51);
        this.ground.ellipse(x - 4, y - 9, 7, 3).fill({ color: 0x697b4c, alpha: .8 });
        this.ground.circle(x + 10, y - 4, 3).fill({ color: 0x446043, alpha: .8 });
      } else if (hash % 3 === 1) {
        this.ground.ellipse(x, y + 3, 17, 5).fill({ color: 0x050607, alpha: .5 });
        this.ground.rect(x - 12, y - 8, 24, 8).fill(0x514b4b);
        this.ground.rect(x - 8, y - 35, 16, 28).fill(0x6b6563);
        this.ground.moveTo(x - 9, y - 35).lineTo(x - 9, y - 43).lineTo(x - 2, y - 40).lineTo(x + 4, y - 46).lineTo(x + 9, y - 37).closePath().fill(0x817670);
        this.ground.moveTo(x - 2, y - 29).lineTo(x + 3, y - 21).lineTo(x, y - 13).stroke({ color: 0x383535, width: 2 });
        this.ground.rect(x - 9, y - 8, 17, 3).fill(0x394735);
      } else {
        const flicker = Math.sin(time * 12 + hash) * 2;
        this.glow.circle(x, y - 22, 41 + flicker).fill({ color: 0xff7228, alpha: .1 });
        this.glow.circle(x, y - 22, 19 + flicker).fill({ color: 0xffb451, alpha: .13 });
        this.ground.ellipse(x, y + 3, 12, 4).fill({ color: 0x060505, alpha: .52 });
        this.ground.rect(x - 2, y - 16, 4, 18).fill(0x5a4a40);
        this.ground.ellipse(x, y - 18, 12, 5).fill(0x4a3932);
        this.ground.moveTo(x, y - 18).lineTo(x - 5, y - 30 - flicker).lineTo(x + 1, y - 26).lineTo(x + 5, y - 32 + flicker).lineTo(x + 5, y - 20).closePath().fill(0xff8b31);
        this.ground.circle(x, y - 22, 3).fill(0xffdd8c);
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
    for (let i = 0; i < 10; i++) {
      const angle = seed + i * Math.PI * 2 / 10;
      const px = x + Math.cos(angle) * 36 * t, py = y - 26 * t + Math.sin(angle) * 16 * t;
      if (i % 2 === 0) this.effects.circle(px, py, (8 + i % 3 * 3) * (1 - t)).fill({ color: 0x9a9390, alpha: .32 * (1 - t) });
      else this.effects.moveTo(px - 4, py - 2).lineTo(px + 4, py + 2).stroke({ color: 0xe1d8c4, width: 3 * (1 - t), alpha: 1 - t });
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
