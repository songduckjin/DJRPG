import { Sprite, Text } from 'pixi.js';
import type { Rarity } from '../store';
import type { World } from '../world';

const rarityColors: Record<Rarity, number> = { common: 0x9ca3af, magic: 0x60a5fa, rare: 0xfacc15, epic: 0xc084fc, unique: 0xfb923c, legendary: 0xf87171 };
const slashStrength: Record<Rarity, number> = { common: 0, magic: 1, rare: 2, epic: 3, unique: 4, legendary: 5 };
import { dragonOrbitFactor, dragonRise } from '../skills';
import type { Effect } from '../world';
import type { Art, GameView } from '../render';

export function weaponSlashColor(world: Pick<World, 'save'>): number {
  return world.save.equipment.weapon ? rarityColors[world.save.equipment.weapon.rarity] : 0xffffff;
}

/**
 * 휘두르기 검기 스프라이트의 틴트 — 무기 등급색을 12%만 섞는다.
 *
 * 확정 시안의 은빛 검기 + 황금빛 지면 충격파 색감이 기준이라 등급색으로 통째로 물들이지
 * 않고, 등급이 높을수록 아주 조금만 그 색으로 기울게 한다(맨손은 흰색 그대로).
 */
export function slashTint(world: Pick<World, 'save'>): number {
  if (!world.save.equipment.weapon) return 0xffffff;
  const color = weaponSlashColor(world);
  const mix = (channel: number): number => Math.round(255 * .88 + channel * .12);
  return mix(color >> 16 & 255) << 16 | mix(color >> 8 & 255) << 8 | mix(color & 255);
}

export function drawSkillVfx(this: GameView, world: World, effect: Effect, x: number, y: number, t: number, screenAngle: number, time: number): boolean {
    if (effect.kind === 'slash') return true;
    if (effect.kind === 'shot') { drawArrow.call(this, effect, x, y, screenAngle); return true; }
    if (effect.kind === 'rain') { drawArrowRain.call(this, effect, x, y, t, time); return true; }
    if (effect.kind === 'hawk') { drawHawkEye.call(this, effect, x, y, t, time); return true; }
    if (effect.kind === 'burst') { drawBurst.call(this, effect, x, y, t, time); return true; }
    if (effect.kind === 'nova') { drawNova.call(this, effect, x, y, t, time); return true; }
    if (effect.kind === 'ward') { drawWard.call(this, effect, x, y, t, time); return true; }
    if (effect.kind === 'slash2') {
      // [작업 157] 확정 시안(은빛 검기 + 황금빛 지면 충격파)대로 코드 선 2줄 대신
      // 검정 배경 VFX 스프라이트 두 장을 add 로 얹는다. 검기는 스윙 방향으로 돌고,
      // 지면 충격파는 지면에 눕힌 채(세로 .62) 히어로 발밑에서 전방으로 번진다.
      const progress = Math.max(0, Math.min(1, t));
      const strength = world.save.equipment.weapon ? slashStrength[world.save.equipment.weapon.rarity] : 0;
      let sprites = this.vfxSprites.get(effect);
      if (!sprites) {
        const arc = new Sprite(this.textures.fxSlash2);
        arc.anchor.set(.03, .9);
        arc.blendMode = 'add';
        const shock = new Sprite(this.textures.fxSlash2Ground);
        shock.anchor.set(.5);
        shock.blendMode = 'add';
        this.skillVfx.addChild(shock, arc);
        sprites = [arc, shock];
        this.vfxSprites.set(effect, sprites);
      }
      const [arc, shock] = sprites;
      const tint = slashTint(world);
      const forwardX = Math.cos(screenAngle), forwardY = Math.sin(screenAngle);
      const reach = 2 + progress * 6;
      const arcScale = (232 + strength * 8) * (.9 + progress * .26) / arc.texture.width;
      arc.position.set(x + forwardX * reach, y + forwardY * reach * .55 - 2);
      arc.rotation = screenAngle;
      arc.scale.set(arcScale);
      arc.alpha = Math.min(1, Math.sin(Math.PI * progress) * 1.35);
      arc.tint = tint;
      const shockWidth = (196 + strength * 6) * (.9 + progress * .3);
      shock.position.set(x + forwardX * shockWidth * .34, y + forwardY * shockWidth * .34 * .55);
      shock.scale.set(shockWidth / shock.texture.width, shockWidth / shock.texture.width * .62);
      shock.alpha = Math.sin(Math.PI * Math.min(1, progress * 1.15));
      shock.tint = tint;
      return true;
    }
    if (effect.kind === 'warcry') return true;
    if (effect.kind === 'hit' || effect.kind === 'death') return false;
    if (effect.kind === 'spin') { this.drawDragon(effect, x, y, t, time); return true; }
    const art: Art = effect.kind === 'slam' || effect.kind === 'crushing' ? 'fxSlam' : effect.kind === 'power' ? 'fxPower' : effect.kind === 'destroy' ? 'fxDestroy' : effect.kind === 'hell' ? 'fxHell' : 'fxSlash';
    let sprites = this.vfxSprites.get(effect);
    if (!sprites) {
      const sprite = new Sprite(this.textures[art]);
      sprite.anchor.set(.5);
      sprite.blendMode = 'add';
      this.skillVfx.addChild(sprite);
      sprites = [sprite];
      this.vfxSprites.set(effect, sprites);
    }
    const width = this.app.screen.width;
    const size = effect.kind === 'hell' ? width * .95 : effect.kind === 'destroy' ? 260 : effect.kind === 'slam' ? 335 : effect.kind === 'crushing' ? 245 : effect.kind === 'power' ? 165 : 150;
    for (const sprite of sprites) {
      if (effect.kind === 'crushing') {
        const impactAt = .55 / effect.duration;
        const impact = Math.max(0, Math.min(1, (t - impactAt) / (1 - impactAt)));
        if (t < impactAt) {
          const pulse = .55 + Math.sin(time * 18) * .12;
          this.ground.ellipse(x, y + 3, 36 + t * 15, 18 + t * 7).stroke({ color: 0xa8d4ff, width: 2.5, alpha: pulse });
          this.glow.circle(x, y, 45).fill({ color: 0x8abfff, alpha: .09 + t * .12 });
        }
        sprite.position.set(x, y - 8);
        sprite.scale.set(size / sprite.texture.width * (.5 + impact * .65), size / sprite.texture.height * (.3 + impact * .45));
        sprite.rotation = 0;
        sprite.alpha = t < impactAt ? 0 : Math.max(0, 1 - impact);
        sprite.tint = 0xb1d8ff;
        continue;
      }
      const phase = t;
      const scale = size / sprite.texture.width * (.65 + phase * .55);
      const distance = effect.kind === 'destroy' ? 40 + t * 125 : effect.kind === 'power' ? 70 : 0;
      sprite.position.set(x + Math.cos(screenAngle) * distance, y + Math.sin(screenAngle) * distance - (effect.kind === 'power' ? 45 : effect.kind === 'slam' ? 4 : 18));
      sprite.scale.set(scale, scale * (effect.kind === 'slam' ? .6 : 1));
      sprite.rotation = effect.kind === 'slam' || effect.kind === 'hell' || effect.kind === 'power' ? 0 : screenAngle;
      const sustained = effect.kind === 'slam' || effect.kind === 'hell';
      sprite.alpha = sustained ? Math.min(1, phase * 6, (1 - phase) * 6) : Math.min(1, (1 - phase) * 1.5);
      sprite.tint = 0xffffff;
    }
    return true;
  }

const arrowColors: Record<NonNullable<Effect['variant']>, number> = {
  normal: 0xffd9a0, ice: 0xa8dcff, pierce: 0xffe6a0, snipe: 0xfff4d0, volley: 0xffc27a,
  // 마법사 탄환(작업 159) — 남성은 푸른 마력, 여성은 붉은 화염, 스킬은 속성별 색을 쓴다.
  arcane: 0x8fb4ff, fire: 0xff7a3c, frost: 0xbfe6ff, chain: 0xd0b4ff, meteor: 0xffb266
};
const magicVariants = new Set<NonNullable<Effect['variant']>>(['arcane', 'fire', 'frost', 'chain', 'meteor']);

/**
 * 궁수 화살 — 출발점에서 도착점으로 화면 좌표를 직선 보간해 날아간다(작업 157).
 * 이펙트 좌표는 활을 쏜 자리이고 도착지는 `tx`·`ty`(월드 좌표)다. 아이소메트릭 투영이
 * 선형이라 두 점의 화면 변위만큼만 진행도로 밀면 실제로 날아가는 것처럼 보인다.
 */
export function drawArrow(this: GameView, effect: Effect, x: number, y: number, _screenAngle: number): void {
    if (magicVariants.has(effect.variant ?? 'normal')) { drawMagicBolt.call(this, effect, x, y); return; }
    const dx = (effect.tx ?? effect.x) - effect.x, dy = (effect.ty ?? effect.y) - effect.y;
    const progress = Math.max(0, Math.min(1, effect.age / Math.max(.01, effect.duration)));
    const px = x + (dx - dy) * .86 * progress;
    const py = y + (dx + dy) * .43 * progress - 20;
    const angle = Math.atan2((dx + dy) * .43, (dx - dy) * .86);
    const color = arrowColors[effect.variant ?? 'normal'];
    const length = effect.variant === 'snipe' ? 34 : effect.variant === 'pierce' ? 28 : 20;
    // 잔상 궤적
    const tail = 1 - Math.abs(progress - .5) * 2;
    this.effects.moveTo(px - Math.cos(angle) * length * 3.2, py - Math.sin(angle) * length * 3.2)
      .lineTo(px, py).stroke({ color, width: 2 + tail * 2.4, alpha: .16 + tail * .24 });
    // 화살대와 촉
    this.effects.moveTo(px - Math.cos(angle) * length, py - Math.sin(angle) * length)
      .lineTo(px, py).stroke({ color, width: 2.6, alpha: .95 });
    this.effects.moveTo(px + Math.cos(angle) * 5, py + Math.sin(angle) * 5)
      .lineTo(px - Math.sin(angle) * 3.5, py + Math.cos(angle) * 3.5)
      .lineTo(px + Math.sin(angle) * 3.5, py - Math.cos(angle) * 3.5).closePath().fill({ color, alpha: 1 });
    if (effect.variant === 'ice') this.glow.circle(px, py, 10 + tail * 8).fill({ color: 0x8fd0ff, alpha: .12 });
    if (effect.variant === 'snipe') this.glow.circle(px, py, 14).fill({ color: 0xfff0c8, alpha: .18 });
  }

/**
 * 마법사 마법 구슬 — 화살 대신 빛나는 구슬이 잔상 꼬리를 끌며 날아간다(작업 159).
 * 궤적 계산(아이소메트릭 선형 이동)은 화살과 같고, 그리기만 구슬+광채로 바꾼다.
 */
export function drawMagicBolt(this: GameView, effect: Effect, x: number, y: number): void {
    const dx = (effect.tx ?? effect.x) - effect.x, dy = (effect.ty ?? effect.y) - effect.y;
    const progress = Math.max(0, Math.min(1, effect.age / Math.max(.01, effect.duration)));
    const px = x + (dx - dy) * .86 * progress;
    const py = y + (dx + dy) * .43 * progress - 20;
    const color = arrowColors[effect.variant ?? 'arcane'];
    const tail = 1 - Math.abs(progress - .5) * 2;
    const radius = effect.variant === 'meteor' ? 11 : effect.variant === 'chain' ? 7 : 6 + tail * 2;
    // 꼬리 — 진행 반대 방향으로 짧게 번지는 빛.
    const angle = Math.atan2((dx + dy) * .43, (dx - dy) * .86);
    this.glow.moveTo(px - Math.cos(angle) * 26, py - Math.sin(angle) * 26).lineTo(px, py)
      .stroke({ color, width: 5 + tail * 3, alpha: .1 + tail * .22 });
    this.glow.circle(px, py, radius * 2.2).fill({ color, alpha: .12 + tail * .1 });
    this.effects.circle(px, py, radius).fill({ color, alpha: .92 });
    this.effects.circle(px, py, radius * .45).fill({ color: 0xffffff, alpha: .85 });
    if (effect.variant === 'frost') this.effects.circle(px, py, radius * 2.6).stroke({ color: 0xdff2ff, width: 1.4, alpha: .35 * tail });
    if (effect.variant === 'fire' || effect.variant === 'meteor') this.glow.circle(px, py, radius * 3.4).fill({ color: 0xff8a3c, alpha: .1 * tail });
  }

/** 마법 폭발·메테오 — 대상 지점이 예고 뒤에 터진다(작업 159). */
export function drawBurst(this: GameView, effect: Effect, x: number, y: number, t: number, time: number): void {
    const color = effect.variant === 'meteor' ? 0xffa04a : 0x9ab8ff;
    const radius = (effect.radius ?? 96) * .86;
    if (t < .5) {
      // 예고 — 바닥에 조여드는 원.
      const squeeze = .35 + t * 1.3;
      this.ground.ellipse(x, y, radius * squeeze, radius * squeeze * .5).stroke({ color, width: 2, alpha: .55 });
      return;
    }
    const burst = (t - .5) / .5;
    this.glow.ellipse(x, y - 8, radius * (1 + burst * .5), radius * (1 + burst * .5) * .55).fill({ color, alpha: .3 * (1 - burst) });
    this.ground.ellipse(x, y, radius * (1 + burst * .4), radius * (1 + burst * .4) * .5).stroke({ color, width: 3 - burst * 2, alpha: .7 * (1 - burst) });
    for (let index = 0; index < 7; index++) {
      const angle = index * 2.1 + time * .4;
      const reach = radius * burst * 1.1;
      const px = x + Math.cos(angle) * reach, py = y + Math.sin(angle) * reach * .5 - burst * 46;
      this.effects.circle(px, py, 3 + (1 - burst) * 4).fill({ color, alpha: .7 * (1 - burst) });
    }
  }

/** 프로스트 노바·아르카나 오버로드 — 발밑에서 파동이 퍼진다(작업 159). */
export function drawNova(this: GameView, effect: Effect, x: number, y: number, t: number, time: number): void {
    const color = effect.variant === 'frost' ? 0xbfe6ff : 0xb79bff;
    const radius = (effect.radius ?? 150) * .86;
    const spread = Math.min(1, t * 1.4);
    this.glow.ellipse(x, y - 6, radius * spread, radius * spread * .5).fill({ color, alpha: .16 * (1 - t) });
    for (const [lag, width] of [[0, 3], [.18, 2], [.36, 1.4]] as const) {
      const ring = Math.max(0, Math.min(1, spread - lag));
      if (ring <= 0) continue;
      this.ground.ellipse(x, y + 2, radius * ring, radius * ring * .5).stroke({ color, width, alpha: .6 * (1 - ring) });
    }
    for (let index = 0; index < 10; index++) {
      const angle = index * .63 + time * .5;
      const reach = radius * spread;
      const px = x + Math.cos(angle) * reach, py = y + Math.sin(angle) * reach * .5;
      this.effects.circle(px, py, 2.5 + Math.sin(time * 12 + index) * 1).fill({ color, alpha: .55 * (1 - t) });
    }
  }

/** 아케인 실드 — 몸을 감싸는 비전 보호막(작업 159). */
export function drawWard(this: GameView, _effect: Effect, x: number, y: number, t: number, time: number): void {
    const color = 0x9ab8ff;
    const radius = 30 + t * 16;
    this.glow.circle(x, y - 34, radius).fill({ color, alpha: .12 * (1 - t) });
    this.effects.circle(x, y - 34, radius).stroke({ color, width: 2, alpha: .75 * (1 - t) });
    for (let index = 0; index < 6; index++) {
      const angle = index * Math.PI / 3 + time * .8;
      const px = x + Math.cos(angle) * radius * .9, py = y - 34 + Math.sin(angle) * radius * .62;
      this.effects.circle(px, py, 2.4).fill({ color: 0xffffff, alpha: .6 * (1 - t) });
    }
  }

/** 애로우 레인 — 적 지점에 화살이 비처럼 떨어진다(작업 157). */
export function drawArrowRain(this: GameView, _effect: Effect, x: number, y: number, t: number, time: number): void {
    const radius = 92 * .86;
    this.ground.ellipse(x, y, radius, radius * .5).stroke({ color: 0xffcf8a, width: 2, alpha: .18 + .22 * Math.sin(t * Math.PI) });
    const arrows = 16;
    for (let index = 0; index < arrows; index++) {
      const spread = ((index * 37) % 100) / 100 - .5;
      const depth = ((index * 53) % 100) / 100 - .5;
      const fall = ((t * 2.6 + index / arrows) % 1);
      const ax = x + spread * radius * 1.7;
      const ay = y + depth * radius * .9;
      const height = 150 * (1 - fall);
      this.effects.moveTo(ax + height * .22, ay - height).lineTo(ax, ay).stroke({ color: 0xffcf8a, width: 2, alpha: .1 + .5 * fall });
      if (fall > .86) this.effects.circle(ax, ay, 3 + Math.sin(time * 30 + index) * 1.2).fill({ color: 0xffe3b0, alpha: .5 * (1 - t) });
    }
  }

/** 호크아이 — 매의 눈 표식이 퍼진다(작업 157). */
export function drawHawkEye(this: GameView, effect: Effect, x: number, y: number, t: number, time: number): void {
    const level = Math.max(1, Math.min(10, effect.level ?? 1));
    const radius = 26 + t * (46 + level * 2);
    this.effects.circle(x, y - 34, radius).stroke({ color: 0xffd27a, width: 2.4, alpha: .7 * (1 - t) });
    this.effects.circle(x, y - 34, radius * .62).stroke({ color: 0xfff0c0, width: 1.4, alpha: .5 * (1 - t) });
    for (let index = 0; index < 6; index++) {
      const angle = index * Math.PI / 3 + time * .6;
      const px = x + Math.cos(angle) * radius * .9, py = y - 34 + Math.sin(angle) * radius * .55;
      this.effects.moveTo(px, py).lineTo(px + Math.cos(angle) * 9, py + Math.sin(angle) * 6).stroke({ color: 0xffe1a0, width: 2, alpha: .55 * (1 - t) });
    }
  }

export function drawDragon(this: GameView, effect: Effect, x: number, y: number, progress: number, time: number): void {
    const level = Math.max(1, Math.min(10, effect.level ?? 1));
    const bodyCount = 6 + (level - 1) * 2;
    let sprites = this.vfxSprites.get(effect);
    if (!sprites) {
      sprites = Array.from({ length: bodyCount + 1 }, (_, index) => {
        const sprite = new Sprite(index === 0 ? this.textures.fxDragonHead : this.textures.fxDragonBody);
        sprite.anchor.set(.5);
        sprite.blendMode = 'add';
        this.skillVfx.addChild(sprite);
        return sprite;
      });
      this.vfxSprites.set(effect, sprites);
    }
    const radius = Math.min(this.app.screen.width * .43, 170);
    // [작업 157] 묵직하게 선회하도록 회전을 절반 이하로 늦췄다(한 바퀴 1.1초 → 2.4초).
    // 후반에는 궤도를 좁히며 144°만 더 돌아 하늘로 솟는다.
    const theta = effect.age * Math.PI * 2 / 2.4 + progress * progress * Math.PI * .8;
    const fade = Math.min(1, progress * 8, (1 - progress) * 7);
    // 청룡이 도는 동안 발밑 지면에 짙은 파란 기운이 번진다(확정 시안의 바닥 회오리).
    this.glow.ellipse(x, y - 6, radius * 1.05, radius * .48).fill({ color: 0x1f4fff, alpha: .1 * fade });
    this.ground.ellipse(x, y + 2, radius * .95, radius * .4).stroke({ color: 0x6fb0ff, width: 2, alpha: .2 * fade });
    this.ground.ellipse(x, y + 2, radius * .55, radius * .23).stroke({ color: 0x9ad0ff, width: 1.5, alpha: .14 * fade });
    for (const [index, sprite] of sprites.entries()) {
      const segmentProgress = Math.max(0, Math.min(1, progress - index * .012));
      const orbit = dragonOrbitFactor(segmentProgress);
      const ascent = dragonRise(segmentProgress);
      const angle = theta - index * .26;
      const wobble = Math.sin(time * 10 - index * .6) * 4;
      const r = orbit * (radius + wobble);
      const tail = 1 - index / (bodyCount + 1);
      sprite.position.set(x + Math.cos(angle) * r, y - 12 + Math.sin(angle) * r * .65 - ascent);
      sprite.rotation = angle + Math.PI / 2;
      const width = index === 0 ? 102 : 46 + tail * 36;
      const scale = width / sprite.texture.width;
      // 몸통은 궤도 접선 방향으로 길고, 방사 방향으로 1.25배 두껍게 그려 이음매가 벌어지지 않게 한다.
      sprite.scale.set(scale, scale * (index === 0 ? 1 : 1.25));
      sprite.alpha = fade * Math.min(1, segmentProgress * 10) * (index === 0 ? 1 : .35 + tail * .6);
      const layer = Math.sin(angle) < 0 ? this.dragonBack : this.skillVfx;
      if (sprite.parent !== layer) layer.addChild(sprite);
    }
  }

export function drawHit(this: GameView, x: number, y: number, t: number, seed: number): void {
    for (let i = 0; i < 10; i++) {
      const angle = seed + i * Math.PI * 2 / 10;
      const radius = 5 + t * (21 + i % 3 * 5);
      const px = x + Math.cos(angle) * radius, py = y - 18 + Math.sin(angle) * radius * .7;
      const length = 6 * (1 - t);
      this.effects.moveTo(px, py).lineTo(px + Math.cos(angle) * length, py + Math.sin(angle) * length).stroke({ color: i % 2 ? 0xffa14d : 0xffffff, width: 2.5 * (1 - t), alpha: 1 - t });
    }
  }

export function updateDamageLabels(this: GameView, effects: Effect[], project: (x: number, y: number) => [number, number]): void {
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

export function drawDeath(this: GameView, x: number, y: number, t: number, seed: number): void {
    for (let i = 0; i < 10; i++) {
      const angle = seed + i * Math.PI * 2 / 10;
      const px = x + Math.cos(angle) * 36 * t, py = y - 26 * t + Math.sin(angle) * 16 * t;
      if (i % 2 === 0) this.effects.circle(px, py, (8 + i % 3 * 3) * (1 - t)).fill({ color: 0x9a9390, alpha: .32 * (1 - t) });
      else this.effects.moveTo(px - 4, py - 2).lineTo(px + 4, py + 2).stroke({ color: 0xe1d8c4, width: 3 * (1 - t), alpha: 1 - t });
    }
  }


export function drawEffects(this: GameView, world: World, project: (x: number, y: number) => [number, number], time: number): void {
    const liveEffects = new Set(world.effects);
    for (const [effect, sprites] of this.vfxSprites) if (!liveEffects.has(effect)) { for (const sprite of sprites) sprite.destroy(); this.vfxSprites.delete(effect); }
    for (const effect of world.effects) {
      const [x, y] = project(effect.x, effect.y), t = effect.age / effect.duration;
      const screenAngle = Math.atan2(Math.sin(effect.angle) * .43 + Math.cos(effect.angle) * .43, Math.cos(effect.angle) * .86 - Math.sin(effect.angle) * .86);
      if (this.drawSkillVfx(world, effect, x, y, t, screenAngle, time)) continue;
      if (effect.kind === 'death') this.drawDeath(x, y, t, effect.angle);
      else this.drawHit(x, y, t, effect.angle);
    }
    this.updateDamageLabels(world.effects, project);
  }
