import { Assets, Container, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import type { World } from '../world';
import type { Save } from '../store';
import { enemyFacing } from '../facing';
import { heroAnimationMode, heroMotion } from './heroMotion';
import { heroScale, heroBodyHeight } from './heroScale';
import { heroClass, socketMotion, weaponSocket } from './heroSockets';
import { tintedGearTexture } from './gearTint';
import { costumeGhostSources, hideCostumeHero } from './costumeHero';
import { resolveSkillMotion, type CostumeMotionTemplate } from '../costume/skillMotion';
import { wearableEquipmentImage, baseItemIndex } from '../items';
import { helmetArtFor, helmetArtPaths, helmetPlacement } from './helmets';
import type { GameView } from '../render';

function syncWeapon(view: GameView, save: Save, texture: Texture, art: string, attacking: boolean, motion: 'idle' | 'walk', walkingFrame: number): void {
    const item = save.equipment.weapon;
    const wearableArt = item ? wearableEquipmentImage(item) : undefined;
    const path = wearableArt?.path ?? '';
    const key = wearableArt ? `${path}:${wearableArt.frame}` : '';
    let shown = view.heroGear.get('weapon');
    if (shown && shown.path !== key) {
      view.heroLayer.removeChild(shown.sprite);
      shown.sprite.destroy();
      view.heroGear.delete('weapon');
      shown = undefined;
    }
    if (!path || !wearableArt) return;

    let gearTexture = view.gearTextures.get(key);
    if (!gearTexture) {
      const sheet = view.gearTextures.get(path);
      if (sheet) {
        const column = wearableArt.frame % wearableArt.columns, row = Math.floor(wearableArt.frame / wearableArt.columns);
        const left = Math.round(column * sheet.source.width / wearableArt.columns);
        const right = Math.round((column + 1) * sheet.source.width / wearableArt.columns);
        const top = Math.round(row * sheet.source.height / wearableArt.rows);
        const bottom = Math.round((row + 1) * sheet.source.height / wearableArt.rows);
        gearTexture = new Texture({ source: sheet.source, frame: new Rectangle(left, top, right - left, bottom - top) });
        view.gearTextures.set(key, gearTexture);
      } else if (!view.gearLoading.has(path)) {
        view.gearLoading.add(path);
        void Assets.load<Texture>(path).then(loaded => {
          loaded.source.scaleMode = 'linear';
          view.gearTextures.set(path, loaded);
          view.gearLoading.delete(path);
        }).catch(error => {
          view.gearLoading.delete(path);
          console.error(`착용 장비 이미지 로딩 실패: ${path}`, error);
        });
      }
      if (!gearTexture) return;
    }
    const socket = weaponSocket(heroClass(save), save.gender, motion, walkingFrame);
    if (!shown) {
      const sprite = new Sprite(gearTexture);
      sprite.anchor.set(socket.anchorX, socket.anchorY);
      sprite.alpha = 1;
      view.heroLayer.addChild(sprite);
      shown = { path: key, sprite };
      view.heroGear.set('weapon', shown);
    }
    const height = heroBodyHeight(art, texture.height) * socket.size;
    shown.sprite.anchor.set(socket.anchorX, socket.anchorY);
    shown.sprite.zIndex = socket.zOrder;
    view.heroLayer.sortableChildren = true;
    shown.sprite.visible = !attacking;
    shown.sprite.position.set((socket.u - .5) * texture.width, (socket.v - view.hero.anchor.y) * texture.height);
    shown.sprite.height = height;
    shown.sprite.width = height * (gearTexture.width / gearTexture.height);
    shown.sprite.rotation = socket.rotation;
}

const walkAnchors = {
  pilotMaleWalk: [.97, .97, .97, .97, .97, .97, .97, .97],
  pilotFemaleWalk: [.97, .97, .97, .97, .97, .97, .97, .97],
  maleBaseWalk: [.95, .95, .95, .95, .941, .944, .944, .923],
  maleBaseHelmWalk: [.97, .97, .97, .97, .97, .97, .97, .97],
  femaleBaseWalk: [.95, .948, .95, .944, .953, .953, .95, .928],
  femaleBaseHelmWalk: [.97, .97, .97, .97, .97, .97, .97, .97],
  femaleBaseOldHelmWalk: [.97, .97, .97, .97, .97, .97, .97, .97],
  maleWalk: [.932, .93, .932, .926, .93, .932, .93, .928],
  maleHelmWalk: [.97, .97, .97, .97, .97, .97, .97, .97],
  femaleWalk: [.948, .946, .95, .944, .935, .944, .95, .941],
  femaleHelmWalk: [.97, .97, .97, .97, .97, .97, .97, .97],
  femaleOldHelmWalk: [.97, .97, .97, .97, .97, .97, .97, .97],
  armoredWalk: [.907, .907, .907, .907, .903, .903, .903, .907],
  armoredNoHelmWalk: [.953, .948, .953, .948, .948, .953, .953, .953],
  femaleArmoredNoHelmWalk: [.984, .984, .984, .984, .98, .989, .989, .984],
  femaleArmoredHelmWalk: [.989, .989, .993, .989, .984, .993, .993, .989],
  femaleArmoredOldHelmWalk: [.984, .984, .984, .984, .989, .989, .989, .989],
  skeletonWalk: [.917, .914, .91, .912, .898, .91, .905, .892],
  bossWalk: [.919, .901, .899, .899, .914, .907, .905, .905]
} as const;
export type HeroSkillMotion = { template: CostumeMotionTemplate | null; progress: number };

/**
 * 착용 투구 머리 파츠를 본체 위에 얹는다(작업 151).
 *
 * 투구 파츠는 아래 중앙(목 밑동)이 앵커이고 크기는 본체 362px 셀 좌표계이므로, 현재 프레임의
 * 목 밑동 좌표로 스프라이트만 옮기면 idle·walk·attack 어느 프레임에서도 같은 자리에 앉는다.
 * 피격 틴트는 본체와 같은 값을 쓴다. 투구를 벗으면 스프라이트를 숨긴다.
 */
function helmetIndex(save: Save): number {
  const item = save.equipment.helmet;
  return item ? baseItemIndex(item) : -1;
}

function syncHelmet(view: GameView, save: Save, motion: 'idle' | 'walk' | 'attack', frame: number, tint: number): void {
  const item = save.equipment.helmet;
  const index = item ? baseItemIndex(item) : -1;
  const art = helmetArtFor(save.gender, index);
  const shown = view.heroHelmet;
  if (!art) {
    if (shown) shown.visible = false;
    return;
  }
  const texture = view.helmetTextures?.get(helmetArtPaths[art]);
  if (!texture) return; // 아직 로딩 전 — 다음 프레임에 그린다.
  const place = helmetPlacement(save.gender, motion, frame);
  const layerX = place.x - view.hero.texture.width * view.hero.anchor.x;
  const layerY = place.y - view.hero.texture.height * view.hero.anchor.y;
  let sprite = shown;
  if (!sprite) {
    sprite = new Sprite(texture);
    sprite.anchor.set(.5, 1);
    sprite.zIndex = .5;
    view.heroLayer.addChild(sprite);
    view.heroLayer.sortableChildren = true;
    view.heroHelmet = sprite;
  }
  if (sprite.texture !== texture) sprite.texture = texture;
  sprite.position.set(layerX, layerY);
  sprite.scale.set(place.scale);
  sprite.tint = tint;
  sprite.rotation = 0;
  sprite.alpha = 1;
  sprite.visible = true;
}

/**
 * 진행 중인 스킬 이펙트 → 코스튬 스킬 템플릿과 진행도 (작업 140).
 *
 * `world.ts`는 스킬을 스킬 ID와 같은 이름의 이펙트로 남기므로 모션 선택은 이펙트 종류만 보면 된다.
 * 기본 공격(`slash`)은 스킬이 아니므로 `template: null`이고, 호출부가 기본 공격 모션을 쓴다.
 * 전투 판정·월드 위치는 읽기만 한다.
 */
export function activeSkillMotion(world: World): HeroSkillMotion {
  const player = world.player;
  for (const effect of world.effects) {
    if (effect.kind === 'hit' || effect.kind === 'death') continue;
    if (Math.hypot(effect.x - player.x, effect.y - player.y) >= 2) continue;
    const resolved = resolveSkillMotion(effect.kind);
    if (!resolved || !resolved.template) continue;
    return { template: resolved.template, progress: effect.duration > 0 ? Math.min(1, effect.age / effect.duration) : 1 };
  }
  return { template: null, progress: 0 };
}

export function drawHero(this: GameView, world: World, x: number, y: number, time: number): void {
    const { player, save } = world;
    const pilotIdle = save.gender === 'female' ? 'pilotFemale' : 'pilotMale';
    const pilotWalk = save.gender === 'female' ? 'pilotFemaleWalk' : 'pilotMaleWalk';
    const pilotAttack = save.gender === 'female' ? 'pilotFemaleAttack' : 'pilotMaleAttack';
    const moving = Math.hypot(world.activeMove.x, world.activeMove.y) > .05;
    const walked = Math.hypot(player.x - this.lastHeroWorld.x, player.y - this.lastHeroWorld.y);
    this.lastHeroWorld = { x: player.x, y: player.y };
    if (moving) this.heroWalkDistance += Math.min(30, walked);
    const walkingFrame = Math.floor(this.heroWalkDistance / 12) % 8;
    const attackFrame = Math.min(3, Math.floor((1 - world.attackPose / .32) * 4));
    const heroTint = player.hit > 0 ? 0xffd4cf : 0xffffff;
    // The approved pilot sheets contain the complete armor and greatsword. Skip all
    // equipment/costume overlays so the body and weapon are never drawn twice.
    hideCostumeHero(this, this.costume);
    const animation = heroAnimationMode(moving, world.attackPose, true);
    const animatedAttack = animation === 'attack';
    const art = animation === 'walk' ? pilotWalk : animatedAttack ? pilotAttack : pilotIdle;
    let texture = this.textures[pilotIdle];
    if (animation === 'walk') texture = this.animations[pilotWalk][walkingFrame];
    else if (animatedAttack) texture = this.animations[pilotAttack][Math.max(0, attackFrame)];
    let textureKey = animation === 'walk' ? `${pilotWalk}:${walkingFrame}`
      : animatedAttack ? `${pilotAttack}:${Math.max(0, attackFrame)}` : pilotIdle;
    // 투구를 쓰면 머리·머리카락이 지워진 같은 크기 시트로 갈아 끼운다(작업 152).
    // 셀 좌표계가 같아 배율·앵커·무기 소켓은 기존 값을 그대로 쓴다.
    if (helmetIndex(save) >= 0) {
      const headless = save.gender === 'female'
        ? (animation === 'walk' ? this.animations.pilotFemaleWalkHeadless?.[walkingFrame]
          : animatedAttack ? this.animations.pilotFemaleAttackHeadless?.[Math.max(0, attackFrame)] : this.textures.pilotFemaleHeadless)
        : (animation === 'walk' ? this.animations.pilotMaleWalkHeadless?.[walkingFrame]
          : animatedAttack ? this.animations.pilotMaleAttackHeadless?.[Math.max(0, attackFrame)] : this.textures.pilotMaleHeadless);
      if (headless) {
        texture = headless;
        textureKey = `${textureKey}!headless`;
      }
    }
    const displayTexture = tintedGearTexture(textureKey, texture, null, null, animatedAttack);
    if (this.hero.texture !== displayTexture) this.hero.texture = displayTexture;
    this.hero.anchor.y = animation === 'walk' ? walkAnchors[pilotWalk][walkingFrame] : .97;
    const bodyPx = heroBodyHeight(art, texture.height);
    const scale = heroScale(this.app.screen.height, art, texture.height);
    this.hero.tint = heroTint;
    syncHelmet(this, save, animation, animation === 'walk' ? walkingFrame : animatedAttack ? Math.max(0, attackFrame) : 0, heroTint);
    const withoutEquippedWeapon = { ...save, equipment: { ...save.equipment, weapon: undefined } };
    syncWeapon(this, withoutEquippedWeapon, texture, art, true, socketMotion(animation), walkingFrame);
    let bob = 0;
    const local = world.effects.filter(effect => effect.kind !== 'hit' && effect.kind !== 'death' && Math.hypot(effect.x - player.x, effect.y - player.y) < 2);
    const slam = local.find(effect => effect.kind === 'slam' || effect.kind === 'hell');
    const motion = heroMotion(world.attackPose);
    const attackPulse = motion.pulse;
    if (slam) bob -= Math.sin(Math.PI * slam.age / slam.duration) * 17;
    const face = player.facingSide;
    const visualFace = face;
    const lungeX = (Math.cos(player.facing) - Math.sin(player.facing)) * .86 * attackPulse * 6;
    const lungeY = (Math.cos(player.facing) + Math.sin(player.facing)) * .43 * attackPulse * 6;
    this.heroLayer.scale.set(scale * visualFace * motion.scaleX, scale * motion.scaleY);
    this.heroLayer.position.set(x + lungeX + (player.hit > 0 ? Math.sin(time * 55) * 2 : 0), y + bob + lungeY);
    this.heroLayer.rotation = motion.rotation;
    // The ground shadow follows the drawn body, not the frame: an attack cell is wider
    // than the hero only to keep the sword inside its own frame, and a frame-width
    // shadow grew 25 % whenever the hero swung. 코스튬 모드도 같은 식(본체 높이 × 배율 × .37)을 쓴다.
    const shadowRadius = Math.max(20, bodyPx * scale * .37);
    this.ground.ellipse(x - visualFace * 4, y - 3, shadowRadius, 8).fill({ color: 0x000000, alpha: .5 });
    if (player.berserk > 0) {
      this.glow.circle(x, y - 25, 35).fill({ color: 0xb32d28, alpha: .12 });
    }
  }

export function updateAfterimages(this: GameView, world: World, project: (x: number, y: number) => [number, number], dt: number): void {
    // 코스튬 모드에서는 캐릭터가 여러 레이어이므로 보이는 레이어를 모두 복제해 잔상을 만든다.
    // 폴백 모드는 기존처럼 통합 바디 한 장을 쓴다(작업 140 요구 4).
    const costumeSources = costumeGhostSources(this.costume);
    for (const effect of world.effects) {
      if (!['spin', 'slam', 'power', 'destroy', 'hell'].includes(effect.kind) || effect.age > .19) continue;
      const index = Math.floor(effect.age / .065);
      if (index >= 3 || index <= (this.ghostEmissions.get(effect) ?? -1)) continue;
      this.ghostEmissions.set(effect, index);
      const tint = ['slam', 'destroy', 'hell'].includes(effect.kind) ? 0xffa06c : 0x8fe6dc;
      const sprites = costumeSources
        ? costumeSources.map(source => {
          const ghost = new Sprite(source.sprite.texture);
          ghost.anchor.set(source.sprite.anchor.x, source.sprite.anchor.y);
          ghost.scale.set(this.heroLayer.scale.x * source.sprite.scale.x, this.heroLayer.scale.y * source.sprite.scale.y);
          ghost.rotation = this.heroLayer.rotation + source.sprite.rotation;
          ghost.tint = tint;
          this.ghosts.addChild(ghost);
          return { sprite: ghost, dx: source.offset.x * this.heroLayer.scale.x, dy: source.offset.y * this.heroLayer.scale.y };
        })
        : (() => {
          const ghost = new Sprite(this.hero.texture);
          ghost.anchor.set(.5, this.hero.anchor.y); ghost.scale.set(this.heroLayer.scale.x, this.heroLayer.scale.y); ghost.rotation = this.heroLayer.rotation;
          ghost.tint = tint;
          this.ghosts.addChild(ghost);
          return [{ sprite: ghost, dx: 0, dy: 0 }];
        })();
      const trail = 5 + index * 5;
      this.afterimages.push({ sprites, x: world.player.x - Math.cos(world.player.facing) * trail, y: world.player.y - Math.sin(world.player.facing) * trail, age: 0, duration: .22 });
    }
    for (const ghost of this.afterimages) {
      ghost.age += dt;
      const [x, y] = project(ghost.x, ghost.y);
      const alpha = .38 * Math.max(0, 1 - ghost.age / ghost.duration);
      for (const entry of ghost.sprites) {
        entry.sprite.position.set(x + entry.dx, y + entry.dy);
        entry.sprite.alpha = alpha;
      }
    }
    this.afterimages = this.afterimages.filter(ghost => {
      if (ghost.age < ghost.duration) return true;
      for (const entry of ghost.sprites) { this.ghosts.removeChild(entry.sprite); entry.sprite.destroy(); }
      return false;
    });
  }

export function updateCorpses(this: GameView, project: (x: number, y: number) => [number, number], dt: number): void {
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


export function drawEntities(this: GameView, world: World, project: (x: number, y: number) => [number, number], time: number, dt: number, hx: number, hy: number, h: number): void {
    const live = new Set(world.enemies);
    for (const [enemy, sprite] of this.enemies) if (!live.has(enemy)) {
      this.actors.removeChild(sprite); this.fallen.addChild(sprite); this.enemies.delete(enemy);
      this.enemyWalkDistance.delete(enemy);
      this.corpses.push({ sprite, x: enemy.x, y: enemy.y, age: 0, duration: enemy.boss ? .85 : .55, scaleX: sprite.scale.x, scaleY: sprite.scale.y, rotation: sprite.rotation });
      const label = this.bossLabels.get(enemy); if (label) { this.labels.removeChild(label); label.destroy(); this.bossLabels.delete(enemy); }
    }
    const depths: { sprite: Container; depth: number }[] = [];
    for (const enemy of world.enemies) {
      let sprite = this.enemies.get(enemy);
      if (!sprite) {
        sprite = new Sprite(enemy.boss ? this.textures.boss : this.textures.skeleton);
        sprite.anchor.set(.5, .97);
        this.actors.addChild(sprite);
        this.enemies.set(enemy, sprite);
        if (enemy.boss) {
          const label = new Text({ text: '해골 군주', style: { fontFamily: 'Noto Sans KR', fontSize: 11, fill: 0xf0d7c4, fontWeight: 'bold' } });
          label.anchor.set(.5, 1); this.labels.addChild(label); this.bossLabels.set(enemy, label);
        }
      }
      const [x, y] = project(enemy.x, enemy.y);
      let gait = this.enemyWalkDistance.get(enemy);
      if (!gait) { gait = { x: enemy.x, y: enemy.y, distance: 0 }; this.enemyWalkDistance.set(enemy, gait); }
      const walked = Math.hypot(enemy.x - gait.x, enemy.y - gait.y);
      if (enemy.moving) gait.distance += Math.min(20, walked);
      gait.x = enemy.x; gait.y = enemy.y;
      const frame = Math.floor(gait.distance / (enemy.boss ? 6 : 7)) % 8;
      const texture = enemy.moving ? enemy.boss ? this.animations.bossWalk[frame] : this.animations.skeletonWalk[frame] : enemy.boss ? this.textures.boss : this.textures.skeleton;
      if (sprite.texture !== texture) sprite.texture = texture;
      sprite.anchor.y = enemy.moving ? walkAnchors[enemy.boss ? 'bossWalk' : 'skeletonWalk'][frame] : .995;
      const scale = h * (enemy.boss ? .16 : .095) / texture.height;
      this.ground.ellipse(x, y - 3, Math.max(enemy.boss ? 32 : 19, texture.width * scale * .42), enemy.boss ? 10 : 7).fill({ color: 0x000000, alpha: .48 });
      sprite.position.set(x + (enemy.hit > 0 ? Math.sin(time * 58) * 3 : 0), y + (enemy.hit > 0 ? 2 : 0));
      const face = enemyFacing(enemy, world.player, sprite.scale.x);
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
    this.drawHero(world, hx, hy, time);
    const rage = world.effects.find(effect => effect.kind === 'warcry');
    const burst = rage ? 1 - rage.age / rage.duration : 0;
    const auraScale = 165 / this.aura.texture.width * (1 + burst * .8);
    this.aura.position.set(hx, hy - 3);
    this.aura.scale.set(auraScale, auraScale * .6);
    this.aura.rotation = time * .35;
    this.aura.alpha = world.player.berserk > 0 ? .48 + burst * .48 + Math.sin(time * 4) * .08 : 0;
    this.updateAfterimages(world, project, dt);
    this.updateCorpses(project, dt);
    depths.push({ sprite: this.heroLayer, depth: world.player.x + world.player.y });
    depths.sort((a, b) => a.depth - b.depth).forEach((entry, index) => this.actors.setChildIndex(entry.sprite, index));
  }
