import { Application, Assets, Container, Graphics, Sprite, Text, TilingSprite, type Texture } from 'pixi.js';
import type { Effect, Enemy, World } from './world';
import { drawRunes, drawTerrain, drawDust, drawLighting, drawVignette } from './render/field';
import { drawHero, updateAfterimages, updateCorpses, drawEntities } from './render/entities';
import { drawSkillVfx, drawDragon, drawHit, updateDamageLabels, drawDeath, drawDrops, drawEffects } from './render/vfx';

const paths = {
  floor: '/assets/dungeon_tile.jpg?v=3', male: '/assets/warrior_male_base.png',
  female: '/assets/warrior_female_base.png', armored: '/assets/warrior_armored.png?v=2',
  armoredNoHelm: '/assets/warrior_armored_nohelm.png?v=2',
  maleSword: '/assets/warrior_male_sword.png', femaleSword: '/assets/warrior_female_sword.png',
  maleAttack: '/assets/warrior_male_attack.png', femaleAttack: '/assets/warrior_female_attack.png', armoredAttack: '/assets/warrior_armored_attack.png?v=2',
  maleBaseWalk: '/assets/warrior_male_base_walk.png', maleSwordWalk: '/assets/warrior_male_walk.png',
  femaleWalk: '/assets/warrior_female_walk.png', armoredWalk: '/assets/warrior_armored_walk.png?v=2',
  skeleton: '/assets/skeleton_warrior.png', skeletonWalk: '/assets/skeleton_walk.png', boss: '/assets/skeleton_boss.png',
  fxDragonHead: '/assets/fx_dragon_head.png', fxDragonBody: '/assets/fx_dragon_body.png', fxSlam: '/assets/fx_wild_stamp.png',
  fxRage: '/assets/fx_blood_rage.png', fxSlash: '/assets/fx_slash_arc.png',
  fxPower: '/assets/fx_power_strike.png', fxDestroy: '/assets/fx_destroy_swing.png', fxHell: '/assets/fx_hell_fire.png'
} as const;
export type Art = keyof typeof paths;
const animationPaths = {
  maleWalk: Array.from({ length: 4 }, (_, i) => `/assets/warrior_male_walk_${i + 1}.png`),
  femaleWalk: Array.from({ length: 4 }, (_, i) => `/assets/warrior_female_walk_${i + 1}.png`),
  armoredWalk: Array.from({ length: 4 }, (_, i) => `/assets/warrior_armored_walk_${i + 1}.png?v=2`),
  armoredNoHelmWalk: Array.from({ length: 4 }, (_, i) => `/assets/warrior_armored_nohelm_walk_${i + 1}.png?v=2`),
  skeletonWalk: Array.from({ length: 4 }, (_, i) => `/assets/skeleton_walk_${i + 1}.png`),
  bossWalk: Array.from({ length: 4 }, (_, i) => `/assets/boss_walk_${i + 1}.png`),
  maleAttack: Array.from({ length: 4 }, (_, i) => `/assets/warrior_male_attack_${i + 1}.png`),
  femaleAttack: Array.from({ length: 4 }, (_, i) => `/assets/warrior_female_attack_${i + 1}.png`),
  armoredAttack: Array.from({ length: 4 }, (_, i) => `/assets/warrior_armored_attack_${i + 1}.png?v=2`),
  armoredNoHelmAttack: Array.from({ length: 4 }, (_, i) => `/assets/warrior_armored_nohelm_attack_${i + 1}.png?v=2`)
};
type Animation = keyof typeof animationPaths;
type Dust = { x: number; y: number; vx: number; vy: number; age: number; duration: number; size: number };
type Ghost = { sprite: Sprite; x: number; y: number; age: number; duration: number };
type Fallen = { sprite: Sprite; x: number; y: number; age: number; duration: number; scaleX: number; scaleY: number; rotation: number };

export class GameView {
  app = new Application();
  textures = {} as Record<Art, Texture>;
  animations = {} as Record<Animation, Texture[]>;
  floor!: TilingSprite;
  glow = new Graphics();
  ground = new Graphics();
  aura!: Sprite;
  dragonBack = new Container();
  ghosts = new Container();
  actors = new Container();
  fallen = new Container();
  skillVfx = new Container();
  vfxSprites = new Map<Effect, Sprite[]>();
  effects = new Graphics();
  labels = new Container();
  shade = new Graphics();
  hero!: Sprite;
  enemies = new Map<Enemy, Sprite>();
  bossLabels = new Map<Enemy, Text>();
  afterimages: Ghost[] = [];
  corpses: Fallen[] = [];
  ghostEmissions = new WeakMap<Effect, number>();
  damageLabels = new Map<Effect, Text>();
  dust: Dust[] = [];
  lastTime = 0;
  lastHeroDust = 0;

  async mount(host: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: host, background: '#9b8259', antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
    host.appendChild(this.app.canvas);
    const loaded = await Promise.all((Object.keys(paths) as Art[]).map(async key => [key, await Assets.load<Texture>(paths[key])] as const));
    for (const [key, texture] of loaded) { texture.source.scaleMode = 'linear'; this.textures[key] = texture; }
    const animated = await Promise.all((Object.keys(animationPaths) as Animation[]).map(async key => [key, await Promise.all(animationPaths[key].map(path => Assets.load<Texture>(path)))] as const));
    for (const [key, textures] of animated) { for (const texture of textures) texture.source.scaleMode = 'linear'; this.animations[key] = textures; }
    this.floor = new TilingSprite({ texture: this.textures.floor, width: this.app.screen.width, height: this.app.screen.height });
    this.floor.tileScale.set(.82);
    this.hero = new Sprite(this.textures.male);
    this.hero.anchor.set(.5, .97);
    this.actors.addChild(this.hero);
    this.aura = new Sprite(this.textures.fxRage);
    this.aura.anchor.set(.5);
    this.aura.blendMode = 'add';
    this.aura.alpha = 0;
    this.app.stage.addChild(this.floor, this.glow, this.ground, this.aura, this.dragonBack, this.ghosts, this.actors, this.fallen, this.skillVfx, this.effects, this.labels, this.shade);
  }

  draw(world: World, time: number): void {
    const dt = Math.min(.05, Math.max(0, time - this.lastTime)); this.lastTime = time;
    const w = this.app.screen.width, h = this.app.screen.height;
    const cx = w / 2, cy = h * .5;
    const project = (x: number, y: number): [number, number] => [cx + (x - world.player.x - y + world.player.y) * .86, cy + (x - world.player.x + y - world.player.y) * .43];
    this.floor.width = w; this.floor.height = h;
    this.floor.tilePosition.set((-world.player.x + world.player.y) * .86, (-world.player.x - world.player.y) * .43);
    this.floor.tint = 0xffffff;
    this.floor.alpha = 1;
    this.glow.clear(); this.ground.clear(); this.effects.clear(); this.shade.clear();
    this.drawLighting(w, h, time);
    this.drawTerrain(world, project, time);
    this.drawDust(world, project, time, dt);
    this.drawRunes(world, cx, cy, time);
    const slam = world.effects.find(effect => effect.kind === 'slam' || effect.kind === 'hell');
    const shake = slam ? Math.max(0, 1 - slam.age / Math.min(slam.duration, .38)) * (slam.kind === 'hell' ? 8 : 4) : 0;
    this.app.stage.position.set(shake ? (Math.random() * 2 - 1) * shake : 0, shake ? (Math.random() * 2 - 1) * shake : 0);
    drawDrops.call(this, world, project, time);
    drawEntities.call(this, world, project, time, dt, cx, cy, h);
    drawEffects.call(this, world, project, time);
    drawVignette.call(this, w, h, cx, cy, time);
  }

  drawSkillVfx(effect: Effect, x: number, y: number, t: number, screenAngle: number, time: number): boolean { return drawSkillVfx.call(this, effect, x, y, t, screenAngle, time); }

  drawDragon(effect: Effect, x: number, y: number, progress: number, time: number): void { return drawDragon.call(this, effect, x, y, progress, time); }

  drawHero(world: World, x: number, y: number, time: number): void { return drawHero.call(this, world, x, y, time); }

  updateAfterimages(world: World, project: (x: number, y: number) => [number, number], dt: number): void { return updateAfterimages.call(this, world, project, dt); }

  updateCorpses(project: (x: number, y: number) => [number, number], dt: number): void { return updateCorpses.call(this, project, dt); }

  drawHit(x: number, y: number, t: number, seed: number): void { return drawHit.call(this, x, y, t, seed); }

  updateDamageLabels(effects: Effect[], project: (x: number, y: number) => [number, number]): void { return updateDamageLabels.call(this, effects, project); }

  drawRunes(world: World, x: number, y: number, time: number): void { return drawRunes.call(this, world, x, y, time); }

  drawTerrain(world: World, project: (x: number, y: number) => [number, number], time: number): void { return drawTerrain.call(this, world, project, time); }

  drawDust(world: World, project: (x: number, y: number) => [number, number], time: number, dt: number): void { return drawDust.call(this, world, project, time, dt); }

  drawDeath(x: number, y: number, t: number, seed: number): void { return drawDeath.call(this, x, y, t, seed); }

  drawLighting(w: number, h: number, time: number): void { return drawLighting.call(this, w, h, time); }
}
