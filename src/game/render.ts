import { preferences } from './preferences';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import type { Effect, Enemy, World } from './world';
import { wearableAssetPaths, type Slot } from './items';
import { drawRunes, drawTerrain, drawDust, drawLighting, drawVignette } from './render/field';
import { drawHero, updateAfterimages, updateCorpses, drawEntities } from './render/entities';
import { createCostumeHeroState, type CostumeHeroState } from './render/costumeHero';
import { drawSkillVfx, drawDragon, drawHit, updateDamageLabels, drawDeath, drawDrops, drawEffects } from './render/vfx';
import { projectArenaPoint } from './arena';
import { createBootProgress } from './bootProgress';
import { helmetArtList, helmetArtPaths } from './render/helmets';

const paths = {
  floor: '/assets/wasteland-ground.png', terrainProps: '/assets/wasteland-props.png', male: '/assets/warrior_male_base.png',
  pilotMale: '/assets/pilot-25d/warrior_male_idle_v1.png', pilotFemale: '/assets/pilot-25d/warrior_female_idle_v1.png',
  female: '/assets/warrior_female_base.png', armored: '/assets/warrior_armored_swordless.png',
  armoredNoHelm: '/assets/warrior_armored_nohelm_swordless.png', femaleArmoredNoHelm: '/assets/warrior_female_armored_nohelm_swordless.png',
  femaleArmoredHelm: '/assets/warrior_female_armored_helm_swordless.png',
  femaleBaseHelm: '/assets/warrior_female_base_helm.png', femaleSwordHelm: '/assets/warrior_female_sword_helm.png',
  femaleArmoredOldHelm: '/assets/warrior_female_armored_oldhelm_swordless.png',
  femaleBaseOldHelm: '/assets/warrior_female_base_oldhelm.png', femaleSwordOldHelm: '/assets/warrior_female_sword_oldhelm.png',
  maleBaseHelm: '/assets/warrior_male_base_helm.png', maleSwordHelm: '/assets/warrior_male_sword_helm.png',
  maleSword: '/assets/warrior_male_sword.png', femaleSword: '/assets/warrior_female_sword.png',
  skeleton: '/assets/skeleton_warrior.png', boss: '/assets/skeleton_boss.png',
  fxDragonHead: '/assets/fx_dragon_head.png', fxDragonBody: '/assets/fx_dragon_body.png', fxSlam: '/assets/fx_wild_stamp.png',
  fxRage: '/assets/fx_blood_rage.png', fxSlash: '/assets/fx_slash_arc.png',
  fxPower: '/assets/fx_power_strike.png', fxDestroy: '/assets/fx_destroy_swing.png', fxHell: '/assets/fx_hell_fire.png'
} as const;
export type Art = keyof typeof paths;
const animationPaths = {
  maleAttack: Array.from({ length: 4 }, (_, i) => `/assets/warrior_male_attack_${i + 1}.png`),
  femaleAttack: Array.from({ length: 4 }, (_, i) => `/assets/warrior_female_attack_${i + 1}.png`),
  armoredAttack: Array.from({ length: 4 }, (_, i) => `/assets/warrior_armored_attack_${i + 1}.png?v=2`),
  armoredNoHelmAttack: Array.from({ length: 4 }, (_, i) => `/assets/warrior_armored_nohelm_attack_${i + 1}.png?v=2`)
};
// One row of four poses, each in its own cell of equal width. The cells are wider than
// 870/4 so no sword tip or foot reaches into the neighbouring frame. The sheet height
// stays 290 px, which is what heroScale.ts measures a body height against.
const attackSheets = {
  pilotMaleAttack: '/assets/pilot-25d/warrior_male_attack_v1.png',
  pilotFemaleAttack: '/assets/pilot-25d/warrior_female_attack_v1.png',
  femaleArmoredNoHelmAttack: '/assets/warrior_female_armored_attack.png?v=3',
  femaleArmoredHelmAttack: '/assets/warrior_female_armored_helm_attack.png?v=3',
  femaleHelmAttack: '/assets/warrior_female_helm_attack.png?v=3',
  femaleArmoredOldHelmAttack: '/assets/warrior_female_armored_oldhelm_attack.png?v=3',
  femaleOldHelmAttack: '/assets/warrior_female_oldhelm_attack.png?v=3',
  maleHelmAttack: '/assets/warrior_male_helm_attack.png?v=3'
} as const;
const walkSheets = {
  pilotMaleWalk: '/assets/pilot-25d/warrior_male_walk_v1.png',
  pilotFemaleWalk: '/assets/pilot-25d/warrior_female_walk_v1.png',
  maleBaseWalk: '/assets/walk8_male_base.png', femaleBaseWalk: '/assets/walk8_female_base.png',
  maleBaseHelmWalk: '/assets/walk8_male_base_helm.png',
  femaleBaseHelmWalk: '/assets/walk8_female_base_helm.png',
  femaleBaseOldHelmWalk: '/assets/walk8_female_base_oldhelm.png',
  maleWalk: '/assets/walk8_male_sword.png', femaleWalk: '/assets/walk8_female.png',
  maleHelmWalk: '/assets/walk8_male_sword_helm.png',
  femaleHelmWalk: '/assets/walk8_female_sword_helm.png',
  femaleOldHelmWalk: '/assets/walk8_female_sword_oldhelm.png',
  armoredWalk: '/assets/walk8_armored_swordless.png', armoredNoHelmWalk: '/assets/walk8_armored_nohelm_swordless.png',
  femaleArmoredNoHelmWalk: '/assets/walk8_female_armored_nohelm_swordless.png',
  femaleArmoredHelmWalk: '/assets/walk8_female_armored_helm_swordless.png',
  femaleArmoredOldHelmWalk: '/assets/walk8_female_armored_oldhelm_swordless.png',
  skeletonWalk: '/assets/walk8_skeleton.png', bossWalk: '/assets/walk8_boss.png'
} as const;
type Animation = keyof typeof animationPaths | keyof typeof attackSheets | keyof typeof walkSheets;
export const renderAssetPaths = [
  ...Object.values(paths), ...Object.values(animationPaths).flat(),
  ...Object.values(attackSheets), ...Object.values(walkSheets), ...Object.values(wearableAssetPaths),
  // 착용 투구 머리 파츠(작업 151) — 장비창과 필드가 같은 PNG 를 쓴다.
  ...helmetArtList.map(art => helmetArtPaths[art])
];
type Dust = { x: number; y: number; vx: number; vy: number; age: number; duration: number; size: number };
type Ghost = { sprites: { sprite: Sprite; dx: number; dy: number }[]; x: number; y: number; age: number; duration: number };
type Fallen = { sprite: Sprite; x: number; y: number; age: number; duration: number; scaleX: number; scaleY: number; rotation: number };

export class GameView {
  app = new Application();
  textures = {} as Record<Art, Texture>;
  animations = {} as Record<Animation, Texture[]>;
  floor!: TilingSprite;
  glow = new Graphics();
  ground = new Graphics();
  terrainLayer = new Container();
  ambientLayer = new Container();
  wastelandPlayer = { x: 0, y: 0 };
  terrainTextures: Texture[] = [];
  terrainSprites: Sprite[] = [];
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
  heroLayer = new Container();
  hero!: Sprite;
  gearTextures = new Map<string, Texture>();
  gearLoading = new Set<string>();
  /** 투구 머리 파츠 텍스처 — 경로를 키로 쓴다(작업 151). */
  helmetTextures = new Map<string, Texture>();
  /** 현재 그려진 투구 스프라이트. 투구를 벗으면 숨긴다. */
  heroHelmet?: Sprite;
  heroGear = new Map<Slot, { path: string; sprite: Sprite }>();
  /** 독립형 코스튬 렌더러 상태(작업 140). 매니페스트·아틀라스가 없으면 폴백으로 굳는다. */
  costume: CostumeHeroState = createCostumeHeroState();
  enemies = new Map<Enemy, Sprite>();
  bossLabels = new Map<Enemy, Text>();
  afterimages: Ghost[] = [];
  corpses: Fallen[] = [];
  ghostEmissions = new WeakMap<Effect, number>();
  damageLabels = new Map<Effect, Text>();
  dust: Dust[] = [];
  lastTime = 0;
  lastHeroDust = 0;
  heroWalkDistance = 0;
  lastHeroWorld = { x: 0, y: 0 };
  enemyWalkDistance = new Map<Enemy, { x: number; y: number; distance: number }>();

  async mount(host: HTMLElement, onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const progress = createBootProgress(renderAssetPaths, onProgress);
    progress.report();
    await this.app.init({ resizeTo: host, background: '#9b8259', antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
    host.appendChild(this.app.canvas);
    const loadTexture = async (path: string): Promise<Texture> => {
      try {
        const texture = await Assets.load<Texture>(path);
        progress.tick(path);
        return texture;
      } catch (error) {
        throw new Error(`그래픽 리소스 ${path} 로딩 실패: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    const loaded = await Promise.all((Object.keys(paths) as Art[]).map(async key => [key, await loadTexture(paths[key])] as const));
    for (const [key, texture] of loaded) { texture.source.scaleMode = 'linear'; this.textures[key] = texture; }
    const wearable = await Promise.all(Object.values(wearableAssetPaths).map(async path => [path, await loadTexture(path)] as const));
    for (const [path, texture] of wearable) { texture.source.scaleMode = 'linear'; this.gearTextures.set(path, texture); }
    const animated = await Promise.all((Object.keys(animationPaths) as (keyof typeof animationPaths)[]).map(async key => [key, await Promise.all(animationPaths[key].map(loadTexture))] as const));
    for (const [key, textures] of animated) { for (const texture of textures) texture.source.scaleMode = 'linear'; this.animations[key] = textures; }
    const attacks = await Promise.all((Object.keys(attackSheets) as (keyof typeof attackSheets)[]).map(async key => [key, await loadTexture(attackSheets[key])] as const));
    for (const [key, sheet] of attacks) {
      sheet.source.scaleMode = 'linear';
      // Four poses in one row (the sheet is about four cells wide) versus a single pose
      // drawn for one character: a single image cut into four slices left vertical
      // slivers of the character beside itself, so only wide sheets are divided.
      const poses = sheet.source.width / sheet.source.height > 2.2 ? 4 : 1;
      this.animations[key] = Array.from({ length: 4 }, (_, index) => {
        const column = poses === 1 ? 0 : index;
        const left = Math.round(column * sheet.source.width / poses), right = Math.round((column + 1) * sheet.source.width / poses);
        return new Texture({ source: sheet.source, frame: new Rectangle(left, 0, right - left, sheet.source.height) });
      });
    }
    const helmets = await Promise.all(helmetArtList.map(async art => [helmetArtPaths[art], await loadTexture(helmetArtPaths[art])] as const));
    for (const [path, texture] of helmets) { texture.source.scaleMode = 'linear'; this.helmetTextures.set(path, texture); }
    const walking = await Promise.all((Object.keys(walkSheets) as (keyof typeof walkSheets)[]).map(async key => [key, await loadTexture(walkSheets[key])] as const));
    for (const [key, sheet] of walking) {
      sheet.source.scaleMode = 'linear';
      // Some walk sheets keep the sword arm above the head: those are 4 poses in one row
      // (square cells), the rest are 8 poses in 4×2. Cutting every sheet as 4×2 chopped
      // those heroes in half, so the row count follows the sheet's own aspect ratio.
      const rows = sheet.source.width / sheet.source.height > 2.5 ? 1 : 2;
      const poses = rows * 4;
      this.animations[key] = Array.from({ length: 8 }, (_, index) => {
        const pose = index % poses;
        const column = pose % 4, row = Math.floor(pose / 4);
        const left = Math.round(column * sheet.source.width / 4), top = Math.round(row * sheet.source.height / rows);
        const right = Math.round((column + 1) * sheet.source.width / 4), bottom = Math.round((row + 1) * sheet.source.height / rows);
        return new Texture({ source: sheet.source, frame: new Rectangle(left, top, right - left, bottom - top) });
      });
    }
    const propFrames = [[36,285,348,226], [484,229,276,283], [891,303,303,204], [53,855,307,178], [423,791,395,272], [907,822,289,228]];
    this.terrainTextures = propFrames.map(([x, y, width, height]) => new Texture({ source: this.textures.terrainProps.source, frame: new Rectangle(x, y, width, height) }));
    this.floor = new TilingSprite({ texture: this.textures.floor, width: this.app.screen.width, height: this.app.screen.height });
    this.floor.tileScale.set(.65);
    this.hero = new Sprite(this.textures.male);
    this.hero.anchor.set(.5, .97);
    this.heroLayer.addChild(this.hero);
    this.actors.addChild(this.heroLayer);
    this.aura = new Sprite(this.textures.fxRage);
    this.aura.anchor.set(.5);
    this.aura.blendMode = 'add';
    this.aura.alpha = 0;
    this.app.stage.addChild(this.floor, this.glow, this.ground, this.terrainLayer, this.aura, this.dragonBack, this.ghosts, this.actors, this.fallen, this.skillVfx, this.effects, this.labels, this.shade);
    progress.report();
    // 코스튬 매니페스트는 화면을 막지 않고 뒤에서 한 번만 받는다. 없거나 실패하면
    // `fallback` 상태로 굳어 기존 통합 바디 렌더링이 그대로 이어진다(작업 140 §8).
    // Task 149 uses one approved full-body warrior illustration for every gear state;
    // skip costume-manifest loading so old overlays cannot replace or cover that art.
  }

  draw(world: World, time: number): void {
    const dt = Math.min(.05, Math.max(0, time - this.lastTime)); this.lastTime = time;
    const w = this.app.screen.width, h = this.app.screen.height;
    const project = (x: number, y: number): [number, number] => projectArenaPoint(x, y, w, h);
    const [hx, hy] = project(world.player.x, world.player.y);
    this.floor.width = w; this.floor.height = h;
    this.floor.tint = 0xffffff;
    this.floor.alpha = 1;
    this.glow.clear(); this.ground.clear(); this.effects.clear(); this.shade.clear();
    this.drawLighting(world, w, h, time);
    this.drawTerrain(world, project, time);
    this.drawDust(world, project, time, dt);
    this.drawRunes(world, hx, hy, time);
    const slam = world.effects.find(effect => effect.kind === 'slam' || effect.kind === 'hell');
    const shake = slam && preferences.shake ? Math.max(0, 1 - slam.age / Math.min(slam.duration, .38)) * (slam.kind === 'hell' ? 8 : 4) : 0;
    this.effects.alpha = preferences.effects === 'low' ? .4 : 1;
    this.skillVfx.alpha = preferences.effects === 'low' ? .35 : 1;
    this.dragonBack.alpha = preferences.effects === 'low' ? .35 : 1;
    this.app.stage.position.set(shake ? (Math.random() * 2 - 1) * shake : 0, shake ? (Math.random() * 2 - 1) * shake : 0);
    drawDrops.call(this, world, project, time);
    drawEntities.call(this, world, project, time, dt, hx, hy, h);
    drawEffects.call(this, world, project, time);
    drawVignette.call(this, w, h, hx, hy, time);
  }

  drawSkillVfx(world: World, effect: Effect, x: number, y: number, t: number, screenAngle: number, time: number): boolean { return drawSkillVfx.call(this, world, effect, x, y, t, screenAngle, time); }

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

  drawLighting(world: World, w: number, h: number, time: number): void { return drawLighting.call(this, world, w, h, time); }
}
