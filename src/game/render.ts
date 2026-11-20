import { preferences } from './preferences';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import type { Effect, Enemy, World, Coin, Drop } from './world';
import type { LootView } from './render/drops';
import { wearableAssetPaths, type Slot } from './items';
import { drawRunes, drawTerrain, drawDust, drawLighting, drawVignette } from './render/field';
import { drawHero, updateAfterimages, updateCorpses, drawEntities } from './render/entities';
import { createCostumeHeroState, type CostumeHeroState } from './render/costumeHero';
import { drawSkillVfx, drawDragon, drawHit, updateDamageLabels, drawDeath, drawEffects } from './render/vfx';
import { drawLoot } from './render/drops';
import type { LootDrop } from './loot';
import { projectArenaPoint } from './arena';
import { createBootProgress } from './bootProgress';
import { helmetArtList, helmetArtPaths, helmetAttackArtList, helmetAttackArtPaths, headlessBodyPaths } from './render/helmets';
import { armorFrameIndex, armorSheetPath, armorSheetPaths, type ArmorMotion } from './render/armors';
import {
  weaponPartPath, weaponPartPaths, weaponTierCacheLimit, swordlessBodyPath, swordlessBodyPaths
} from './render/weapons';
import type { Gender } from './store';

const paths = {
  floor: '/assets/wasteland-ground.png', terrainProps: '/assets/wasteland-props.png', male: '/assets/warrior_male_base.png',
  pilotMale: '/assets/pilot-25d/warrior_male_idle_v1.png', pilotFemale: '/assets/pilot-25d/warrior_female_idle_v1.png',
  // 투구 착용 시에만 쓰는 머리 없는 본체(작업 152) — 같은 셀 좌표계라 배율·앵커를 공유한다.
  pilotMaleHeadless: headlessBodyPaths.male.idle, pilotFemaleHeadless: headlessBodyPaths.female.idle,
  female: '/assets/warrior_female_base.png', armored: '/assets/warrior_armored_swordless.png',
  armoredNoHelm: '/assets/warrior_armored_nohelm_swordless.png', femaleArmoredNoHelm: '/assets/warrior_female_armored_nohelm_swordless.png',
  femaleArmoredHelm: '/assets/warrior_female_armored_helm_swordless.png',
  femaleBaseHelm: '/assets/warrior_female_base_helm.png', femaleSwordHelm: '/assets/warrior_female_sword_helm.png',
  femaleArmoredOldHelm: '/assets/warrior_female_armored_oldhelm_swordless.png',
  femaleBaseOldHelm: '/assets/warrior_female_base_oldhelm.png', femaleSwordOldHelm: '/assets/warrior_female_sword_oldhelm.png',
  maleBaseHelm: '/assets/warrior_male_base_helm.png', maleSwordHelm: '/assets/warrior_male_sword_helm.png',
  maleSword: '/assets/warrior_male_sword.png', femaleSword: '/assets/warrior_female_sword.png',
  skeleton: '/assets/skeleton_warrior.png', boss: '/assets/skeleton_boss.png',
  fxDragonHead: '/assets/fx_dragon_head.png?v=2', fxDragonBody: '/assets/fx_dragon_body.png?v=2', fxSlam: '/assets/fx_wild_stamp.png',
  fxRage: '/assets/fx_blood_rage.png', fxSlash: '/assets/fx_slash_arc.png',
  fxPower: '/assets/fx_power_strike.png', fxDestroy: '/assets/fx_destroy_swing.png', fxHell: '/assets/fx_hell_fire.png',
  // [작업 157] 휘두르기(1번) 확정 시안 — 은빛 검기 + 황금빛 지면 충격파, 검정 배경 add 블렌딩용.
  fxSlash2: '/assets/fx_slash2.png', fxSlash2Ground: '/assets/fx_slash2_ground.png'
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
  pilotMaleAttackHeadless: headlessBodyPaths.male.attack,
  pilotFemaleAttackHeadless: headlessBodyPaths.female.attack,
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
  pilotMaleWalkHeadless: headlessBodyPaths.male.walk,
  pilotFemaleWalkHeadless: headlessBodyPaths.female.walk,
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

/**
 * 갑옷 시트를 프레임 텍스처로 자른다(작업 155).
 *
 * 갑옷 시트는 기준 시트와 같은 규격(362px 셀)이라 자르는 규칙도 필드와 같다: `idle` 은 한 장,
 * `walk`·`attack` 은 가로 4칸을 한 줄로 쓴다. 옆 칸 그림자가 섞이지 않도록 칸 경계를 정확히
 * 나누며, 프레임 조회는 `armorFrameIndex`(0~3 반복)로 한다.
 */
function sliceArmorSheet(sheet: Texture, motion: ArmorMotion): Texture[] {
  if (motion === 'idle') return [sheet];
  const source = sheet.source;
  const columns = source.width / source.height > 2.2 ? 4 : 1;
  return Array.from({ length: columns }, (_, index) => {
    const left = Math.round(index * source.width / columns);
    const right = Math.round((index + 1) * source.width / columns);
    return new Texture({ source, frame: new Rectangle(left, 0, right - left, source.height) });
  });
}

/** 갑옷 시트 캐시에 남겨 두는 티어 수. 티어당 6장이라 3티어면 18장이다. */
export const armorTierCacheLimit = 3;
/** 대검 파츠 캐시에 남기는 티어 수(작업 156). 티어당 1장이다. */
export { weaponTierCacheLimit };
export const renderAssetPaths = [
  ...Object.values(paths), ...Object.values(animationPaths).flat(),
  ...Object.values(attackSheets), ...Object.values(walkSheets), ...Object.values(wearableAssetPaths),
  // 착용 투구 머리 파츠(작업 151) — 장비창과 필드가 같은 PNG 를 쓴다.
  ...helmetArtList.map(art => helmetArtPaths[art]),
  // 공격 3/4 옆모습 투구 파츠(작업 154) — 남녀 10종 × 공격 4프레임.
  ...helmetAttackArtList.map(art => helmetAttackArtPaths[art])
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
  /** Ground loot behind the character / in front of him, and the drops they show (see `render/drops`). */
  lootBack = new Container();
  lootFront = new Container();
  lootViews = new Map<Drop | Coin, LootView>();
  lootTaken: LootDrop[] = [];
  lootSheets = new Set<string>();
  lootArtTextures = new Map<string, Texture>();
  lootGlow?: Texture;
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
  /** 착용 갑옷 시트(경로 → 텍스처)와 프레임 캐시, 로딩 중인 경로 (작업 155). 기본 검을 지운 시트(작업 156)도 같은 지도에 담는다. */
  armorSheets = new Map<string, Texture>();
  armorFrames = new Map<string, Texture[]>();
  armorLoading = new Set<string>();
  /** 최근에 받은 본체 시트 묶음 키(오래된 것부터 버린다). */
  armorTierOrder: string[] = [];
  /** 마지막으로 본 본체 시트 묶음(성별:갑옷:검없음). 바뀔 때만 미리 받는다. */
  lastBodyTier = '';
  /** 착용 무기 파츠(경로 → 텍스처), 로딩 중인 경로, 최근 티어 (작업 156). */
  weaponSheets = new Map<string, Texture>();
  weaponLoading = new Set<string>();
  weaponTierOrder: number[] = [];
  /** 마지막으로 본 무기 티어. 바뀔 때만 파츠를 미리 받는다. */
  lastWeaponTier = -1;
  /** 지금 그려진 검 파츠 스프라이트(0번·로딩 전이면 숨김). */
  heroWeapon?: Sprite;
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
    // 정면(서기·걷기) 13장과 공격 3/4 파츠 80장을 함께 받는다 — 필드에서 프레임이 바뀌는
    // 순간에 텍스처가 없어 투구가 한 프레임 사라지는 일이 없도록 부팅 때 모두 올린다.
    const helmetPaths = [...helmetArtList.map(art => helmetArtPaths[art]), ...helmetAttackArtList.map(art => helmetAttackArtPaths[art])];
    const helmets = await Promise.all(helmetPaths.map(async path => [path, await loadTexture(path)] as const));
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
    this.app.stage.addChild(this.floor, this.glow, this.ground, this.terrainLayer, this.aura, this.dragonBack, this.ghosts, this.lootBack, this.actors, this.lootFront, this.fallen, this.skillVfx, this.effects, this.labels, this.shade);
    // Loot keeps its own paint order: a coin of a heap stays under an item that fell on it.
    this.lootBack.sortableChildren = true;
    this.lootFront.sortableChildren = true;
    progress.report();
    // 코스튬 매니페스트는 화면을 막지 않고 뒤에서 한 번만 받는다. 없거나 실패하면
    // `fallback` 상태로 굳어 기존 통합 바디 렌더링이 그대로 이어진다(작업 140 §8).
    // Task 149 uses one approved full-body warrior illustration for every gear state;
    // skip costume-manifest loading so old overlays cannot replace or cover that art.
  }

  /**
   * 착용 본체 시트의 프레임 텍스처 (작업 155·156).
   *
   * 시트는 장비를 바꿀 때만 동적으로 받는다(120장 9.2MB 전체를 부팅 때 받지 않는다).
   * `swordless` 면 기본 검을 지운 같은 시트(`noweapon/`)를 쓴다 — 0번이 아닌 검을 찼을 때다.
   * 아직 로딩 전이면 `undefined` 를 돌려주고, `drawHero` 가 기준 시트로 그린다.
   */
  armorFrame(gender: Gender, index: number, motion: ArmorMotion, headless: boolean, frame: number, swordless = false): Texture | undefined {
    const path = armorSheetPath(gender, index, motion, headless, swordless);
    if (!path) return undefined;
    return this.bodySheetFrame(path, motion, frame);
  }

  /**
   * 갑옷을 입지 않은 본체의 기본 검 없는 시트 프레임(작업 156).
   * 셀 규격이 같으므로 자르기·프레임 선택 규칙도 갑옷 시트와 같다.
   */
  swordlessBodyFrame(gender: Gender, motion: ArmorMotion, headless: boolean, frame: number): Texture | undefined {
    return this.bodySheetFrame(swordlessBodyPath(gender, motion, headless), motion, frame);
  }

  private bodySheetFrame(path: string, motion: ArmorMotion, frame: number): Texture | undefined {
    let frames = this.armorFrames.get(path);
    if (!frames) {
      const sheet = this.armorSheets.get(path);
      if (!sheet) { this.loadArmorSheet(path); return undefined; }
      frames = sliceArmorSheet(sheet, motion);
      this.armorFrames.set(path, frames);
    }
    return frames[armorFrameIndex(motion, frame) % frames.length];
  }

  /**
   * 본체 시트 묶음을 미리 받는다. 갑옷 티어 또는 (기본 검을 지운 시트 여부)가 바뀔 때만 부른다.
   * 최근 3묶음만 남기고 나머지는 Pixi 에셋 캐시에서도 내려 모바일 메모리를 잡아 두지 않는다.
   */
  prefetchBody(gender: Gender, armor: number, swordless: boolean): void {
    const tier = `${gender}:${armor}:${swordless ? 1 : 0}`;
    if (!this.armorTierOrder.includes(tier)) this.armorTierOrder.push(tier);
    for (const path of this.bodySheetPaths(gender, armor, swordless)) this.loadArmorSheet(path);
    while (this.armorTierOrder.length > armorTierCacheLimit) {
      const oldest = this.armorTierOrder.shift() as string;
      const [oldGender, oldArmor, oldSwordless] = oldest.split(':');
      for (const path of this.bodySheetPaths(oldGender as Gender, Number(oldArmor), oldSwordless === '1')) {
        this.armorFrames.delete(path);
        if (this.armorSheets.delete(path)) void Assets.unload(path).catch(() => undefined);
      }
    }
  }

  /** 한 묶음의 시트 6장(서기·걷기·공격 × 전신·머리 없음). 갑옷이 없으면 기본 본체 시트. */
  private bodySheetPaths(gender: Gender, armor: number, swordless: boolean): string[] {
    if (armor >= 0) return armorSheetPaths(gender, armor, swordless);
    return swordless ? swordlessBodyPaths(gender) : [];
  }

  /**
   * 착용 대검 파츠 텍스처 (작업 156). 아직 로딩 전이면 `undefined` — 그 프레임은 기본 검을
   * 가진 본체 시트로 그려진다(부팅 직후·티어를 막 바꿨을 때).
   */
  weaponPart(index: number): Texture | undefined {
    const path = weaponPartPath(index);
    if (!path) return undefined;
    const texture = this.weaponSheets.get(path);
    if (!texture) { this.loadWeaponPart(path); return undefined; }
    return texture;
  }

  /** 무기 티어가 바뀌면 그 파츠 1장을 받고, 최근 3티어 밖은 내린다. */
  prefetchWeapon(index: number): void {
    if (!this.weaponTierOrder.includes(index)) this.weaponTierOrder.push(index);
    for (const path of weaponPartPaths(index)) this.loadWeaponPart(path);
    while (this.weaponTierOrder.length > weaponTierCacheLimit) {
      const oldest = this.weaponTierOrder.shift() as number;
      for (const path of weaponPartPaths(oldest)) {
        if (this.weaponSheets.delete(path)) void Assets.unload(path).catch(() => undefined);
      }
    }
  }

  private loadWeaponPart(path: string): void {
    if (this.weaponSheets.has(path) || this.weaponLoading.has(path)) return;
    this.weaponLoading.add(path);
    void Assets.load<Texture>(path).then(texture => {
      texture.source.scaleMode = 'linear';
      this.weaponSheets.set(path, texture);
      this.weaponLoading.delete(path);
    }).catch(error => {
      this.weaponLoading.delete(path);
      console.error(`무기 파츠 로딩 실패: ${path}`, error);
    });
  }

  private loadArmorSheet(path: string): void {
    if (this.armorSheets.has(path) || this.armorLoading.has(path)) return;
    this.armorLoading.add(path);
    void Assets.load<Texture>(path).then(sheet => {
      sheet.source.scaleMode = 'linear';
      this.armorSheets.set(path, sheet);
      this.armorLoading.delete(path);
    }).catch(error => {
      this.armorLoading.delete(path);
      console.error(`갑옷 시트 로딩 실패: ${path}`, error);
    });
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
    drawLoot.call(this, world, project, time, dt);
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
