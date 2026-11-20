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
import { wearableEquipmentImage, baseItemIndex, usesBaseSheetOnly } from '../items';
import { jobOrDefault } from '../skills';
import { helmetArtFor, helmetArtPath, helmetPlacement } from './helmets';
import { armorIndexFor } from './armors';
import { WEAPON_GUARD, weaponIndexFor, weaponPose } from './weapons';
import { BOW_GRIP, bowIndexFor, bowPose } from './bows';
import { STAFF_GRIP, staffIndexFor, staffPose } from './staffs';
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
  archerMaleWalk: [.97, .97, .97, .97, .97, .97, .97, .97],
  archerFemaleWalk: [.97, .97, .97, .97, .97, .97, .97, .97],
  mageMaleWalk: [.97, .97, .97, .97, .97, .97, .97, .97],
  mageFemaleWalk: [.97, .97, .97, .97, .97, .97, .97, .97],
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
  // 공격은 그 프레임의 3/4 옆모습 파츠, 서기·걷기는 정면 파츠(작업 154).
  const art = helmetArtFor(save.gender, index, motion, frame);
  const shown = view.heroHelmet;
  if (!art) {
    if (shown) shown.visible = false;
    return;
  }
  const texture = view.helmetTextures?.get(helmetArtPath(art));
  if (!texture) return; // 아직 로딩 전 — 다음 프레임에 그린다.
  const place = helmetPlacement(save.gender, motion, frame, index);
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
  // 앵커는 아래 중앙(목 밑동). 정면 파츠는 서기·걷기에서 배율만, 공격 3/4 파츠는 배율 1·회전 0.
  sprite.scale.set(place.scale, place.scaleY ?? place.scale);
  sprite.tint = tint;
  sprite.rotation = place.rotation ?? 0;
  sprite.alpha = 1;
  sprite.visible = true;
}

/**
 * 착용 대검 파츠를 본체 위에 얹는다(작업 156).
 *
 * 파츠 PNG 는 idle 자세의 362px 셀 그대로이고 앵커가 손잡이(가드) 점이다. 자세별로는
 * `weaponPose` 의 가드 좌표와 회전각만 주므로, 걷기·공격 어느 프레임에서도 칼이 손에서
 * 떨어지거나 길이가 줄지 않는다. 0번(기본 두손검)은 본체 시트에 그려져 있어 숨긴다.
 * 피격 틴트는 본체·투구와 같은 값을 쓴다.
 */
function syncWeaponPart(view: GameView, save: Save, motion: 'idle' | 'walk' | 'attack', frame: number, tint: number): void {
  const index = weaponIndexFor(save);
  const shown = view.heroWeapon;
  if (index < 1) {
    if (shown) shown.visible = false;
    return;
  }
  const texture = view.weaponPart(index);
  if (!texture) {
    // 아직 로딩 전 — 이 프레임은 기본 검을 가진 본체 시트가 그려져 있다.
    if (shown) shown.visible = false;
    return;
  }
  const pose = weaponPose(save.gender, motion, frame);
  const layerX = pose.x - view.hero.texture.width * view.hero.anchor.x;
  const layerY = pose.y - view.hero.texture.height * view.hero.anchor.y;
  let sprite = shown;
  if (!sprite) {
    sprite = new Sprite(texture);
    sprite.zIndex = .4;
    view.heroLayer.addChild(sprite);
    view.heroLayer.sortableChildren = true;
    view.heroWeapon = sprite;
  }
  if (sprite.texture !== texture) sprite.texture = texture;
  sprite.anchor.set(WEAPON_GUARD.x / texture.width, WEAPON_GUARD.y / texture.height);
  sprite.position.set(layerX, layerY);
  sprite.rotation = pose.rot * Math.PI / 180;
  sprite.tint = tint;
  sprite.alpha = 1;
  sprite.visible = true;
}

/**
 * 착용 활 파츠를 본체 위에 얹는다(작업 160).
 *
 * 파츠 PNG 는 서기 자세의 362px 셀 그대로이고 앵커가 손이 활을 쥔 그립 점이다. 자세별로는
 * `bowPose` 의 그립 좌표와 회전각만 주므로, 걷기·사격 어느 프레임에서도 활이 손에서 떨어지거나
 * 길이가 줄지 않는다. 0번(사냥꾼의 활)은 본체 시트에 그려져 있어 숨긴다. 피격 틴트는
 * 본체·투구와 같은 값을 쓴다.
 */
function syncBowPart(view: GameView, save: Save, motion: 'idle' | 'walk' | 'attack', frame: number, tint: number): void {
  const index = bowIndexFor(save);
  const shown = view.heroBow;
  if (index < 1) {
    if (shown) shown.visible = false;
    return;
  }
  const texture = view.bowPart(index);
  if (!texture) {
    // 아직 로딩 전 — 이 프레임은 기본 활을 가진 본체 시트가 그려진다.
    if (shown) shown.visible = false;
    return;
  }
  const pose = bowPose(save.gender, motion, frame);
  const layerX = pose.x - view.hero.texture.width * view.hero.anchor.x;
  const layerY = pose.y - view.hero.texture.height * view.hero.anchor.y;
  let sprite = shown;
  if (!sprite) {
    sprite = new Sprite(texture);
    sprite.zIndex = .4;
    view.heroLayer.addChild(sprite);
    view.heroLayer.sortableChildren = true;
    view.heroBow = sprite;
  }
  if (sprite.texture !== texture) sprite.texture = texture;
  sprite.anchor.set(BOW_GRIP.x / texture.width, BOW_GRIP.y / texture.height);
  sprite.position.set(layerX, layerY);
  sprite.rotation = pose.rot * Math.PI / 180;
  sprite.tint = tint;
  sprite.alpha = 1;
  sprite.visible = true;
}

/**
 * 착용 지팡이 파츠를 본체 위에 얹는다(작업 199).
 *
 * 파츠 PNG 는 서기 자세의 362px 셀 그대로이고 앵커가 손이 지팡이를 쥔 그립 점이다. 자세별로는
 * `staffPose` 의 그립 좌표와 회전각만 주므로, 걷기·공격 어느 프레임에서도 지팡이가 손에서
 * 떨어지거나 길이가 줄지 않는다. 기본 지팡이는 `mage_nostaff/` 시트에서 이미 지워져 있다.
 * 피격 틴트는 본체·투구와 같은 값을 쓴다.
 */
function syncStaffPart(view: GameView, save: Save, motion: 'idle' | 'walk' | 'attack', frame: number, tint: number): void {
  const index = staffIndexFor(save);
  const shown = view.heroStaff;
  if (index < 0) {
    if (shown) shown.visible = false;
    return;
  }
  const texture = view.staffPart(index);
  if (!texture) {
    // 아직 로딩 전 — 이 프레임은 기본 지팡이를 지운 본체 시트만 그려진다.
    if (shown) shown.visible = false;
    return;
  }
  const pose = staffPose(save.gender, motion, frame);
  const layerX = pose.x - view.hero.texture.width * view.hero.anchor.x;
  const layerY = pose.y - view.hero.texture.height * view.hero.anchor.y;
  let sprite = shown;
  if (!sprite) {
    sprite = new Sprite(texture);
    sprite.zIndex = .4;
    view.heroLayer.addChild(sprite);
    view.heroLayer.sortableChildren = true;
    view.heroStaff = sprite;
  }
  if (sprite.texture !== texture) sprite.texture = texture;
  sprite.anchor.set(STAFF_GRIP.x / texture.width, STAFF_GRIP.y / texture.height);
  sprite.position.set(layerX, layerY);
  sprite.rotation = pose.rot * Math.PI / 180;
  sprite.tint = tint;
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
    // 궁수(작업 157)·마법사(작업 198)는 기본 시트만 그린다 — 전사용 갑옷·투구·대검 파츠를 절대 적용하지 않는다.
    const job = jobOrDefault(save.job);
    const baseSheet = job === 'warrior' ? 'pilot' : job;
    // 전사만 장비 오버레이(투구·갑옷·검 파츠)를 얹는다.
    const plain = usesBaseSheetOnly(save);
    const side = save.gender === 'female' ? 'Female' : 'Male';
    const pilotIdle = `${baseSheet}${side}` as 'pilotMale' | 'pilotFemale' | 'archerMale' | 'archerFemale' | 'mageMale' | 'mageFemale';
    const pilotWalk = `${baseSheet}${side}Walk` as 'pilotMaleWalk' | 'pilotFemaleWalk' | 'archerMaleWalk' | 'archerFemaleWalk' | 'mageMaleWalk' | 'mageFemaleWalk';
    const pilotAttack = `${baseSheet}${side}Attack` as 'pilotMaleAttack' | 'pilotFemaleAttack' | 'archerMaleAttack' | 'archerFemaleAttack' | 'mageMaleAttack' | 'mageFemaleAttack';
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
    const helmeted = !plain && helmetIndex(save) >= 0;
    if (helmeted) {
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
    // 착용 갑옷 시트(작업 155). 기준 시트와 같은 셀 좌표계라 배율·앵커·소켓은 그대로다.
    // 아직 로딩 전인 티어는 위의 기준 시트(투구를 썼으면 머리 없는 시트)로 한 프레임 더 그린다.
    const armor = plain ? -1 : armorIndexFor(save);
    const weapon = plain ? 0 : weaponIndexFor(save);
    // 0번이 아닌 검을 차면 본체 시트도 기본 검을 지운 판(`noweapon/`)으로 갈아 끼운다(작업 156).
    const swordless = weapon >= 1;
    const bodyTier = `${save.gender}:${armor}:${swordless ? 1 : 0}`;
    if (this.lastBodyTier !== bodyTier) {
      this.lastBodyTier = bodyTier;
      this.prefetchBody(save.gender, armor, swordless);
    }
    if (this.lastWeaponTier !== weapon) {
      this.lastWeaponTier = weapon;
      if (weapon >= 1) this.prefetchWeapon(weapon);
    }
    const poseFrame = animation === 'walk' ? walkingFrame : animatedAttack ? Math.max(0, attackFrame) : 0;
    // 궁수: 1번 이상 활을 차면 기본 활대를 지운 본체 시트로 갈아 끼우고 그 위에 활 파츠를 얹는다(작업 160).
    const archer = job === 'archer';
    const bow = archer ? bowIndexFor(save) : 0;
    if (archer && this.lastBowTier !== bow) {
      this.lastBowTier = bow;
      if (bow >= 1) this.prefetchBow(bow, save.gender);
    }
    if (archer && bow >= 1) {
      const bowless = this.bowBodyFrame(save.gender, animation, poseFrame);
      if (bowless) {
        texture = bowless;
        textureKey = `nobow:${save.gender}:${animation}:${poseFrame}`;
      }
    }
    // 마법사: 지팡이를 찼으면 기본 지팡이를 지운 본체 시트로 갈아 끼우고 그 위에 지팡이 파츠를 얹는다(작업 199).
    const mage = job === 'mage';
    const staff = mage ? staffIndexFor(save) : -1;
    if (mage && this.lastStaffTier !== staff) {
      this.lastStaffTier = staff;
      if (staff >= 0) this.prefetchStaff(staff, save.gender);
    }
    if (mage && staff >= 0) {
      const nostaff = this.staffBodyFrame(save.gender, animation, poseFrame);
      if (nostaff) {
        texture = nostaff;
        textureKey = `nostaff:${save.gender}:${animation}:${poseFrame}`;
      }
    }
    if (armor >= 0) {
      const armorTexture = this.armorFrame(save.gender, armor, animation, helmeted, walkingFrame, swordless);
      if (armorTexture) {
        texture = armorTexture;
        textureKey = `armor:${save.gender}:${armor}:${animation}:${helmeted ? 'headless' : 'body'}:${animation === 'idle' ? 0 : animation === 'walk' ? walkingFrame : Math.max(0, attackFrame)}`;
      }
    }
    if (swordless) {
      const stripped = this.swordlessBodyFrame(save.gender, animation, helmeted, poseFrame);
      if (stripped) {
        texture = stripped;
        textureKey = `noweapon:${save.gender}:${armor}:${animation}:${helmeted ? 'headless' : 'body'}:${poseFrame}`;
      }
    }
    const displayTexture = tintedGearTexture(textureKey, texture, null, null, animatedAttack);
    if (this.hero.texture !== displayTexture) this.hero.texture = displayTexture;
    this.hero.anchor.y = animation === 'walk' ? walkAnchors[pilotWalk][walkingFrame] : .97;
    const bodyPx = heroBodyHeight(art, texture.height);
    const scale = heroScale(this.app.screen.height, art, texture.height);
    this.hero.tint = heroTint;
    if (plain) {
      // 궁수·마법사: 장비 오버레이(투구·대검·착용 무기)는 숨기고 기본 시트만 그린다.
      // 궁수는 여기에 더해 활 파츠를 얹고, 마법사는 파츠 없이 시트만 쓴다(작업 160·198).
      if (this.heroHelmet) this.heroHelmet.visible = false;
      if (this.heroWeapon) this.heroWeapon.visible = false;
      if (archer) syncBowPart(this, save, animation, poseFrame, heroTint);
      else if (this.heroBow) this.heroBow.visible = false;
      if (mage) syncStaffPart(this, save, animation, poseFrame, heroTint);
      else if (this.heroStaff) this.heroStaff.visible = false;
      const shownGear = this.heroGear.get('weapon');
      if (shownGear) { this.heroLayer.removeChild(shownGear.sprite); shownGear.sprite.destroy(); this.heroGear.delete('weapon'); }
    } else {
      syncHelmet(this, save, animation, animation === 'walk' ? walkingFrame : animatedAttack ? Math.max(0, attackFrame) : 0, heroTint);
      syncWeaponPart(this, save, animation, poseFrame, heroTint);
      const withoutEquippedWeapon = { ...save, equipment: { ...save.equipment, weapon: undefined } };
      syncWeapon(this, withoutEquippedWeapon, texture, art, true, socketMotion(animation), walkingFrame);
    }
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
