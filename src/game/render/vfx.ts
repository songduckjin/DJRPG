import { Sprite, Text } from 'pixi.js';
import type { Rarity } from '../store';
import type { World } from '../world';

const rarityColors: Record<Rarity, number> = { common: 0xffffff, magic: 0x57aaff, rare: 0xffd265, legendary: 0xff7d35 };
import { dragonOrbitFactor, dragonRise } from '../skills';
import type { Effect } from '../world';
import type { Art, GameView } from '../render';

export function drawSkillVfx(this: GameView, effect: Effect, x: number, y: number, t: number, screenAngle: number, time: number): boolean {
    if (effect.kind === 'warcry') return true;
    if (effect.kind === 'hit' || effect.kind === 'death') return false;
    if (effect.kind === 'spin') { this.drawDragon(effect, x, y, t, time); return true; }
    const art: Art = effect.kind === 'slam' || effect.kind === 'crushing' ? 'fxSlam' : effect.kind === 'power' ? 'fxPower' : effect.kind === 'destroy' ? 'fxDestroy' : effect.kind === 'hell' ? 'fxHell' : 'fxSlash';
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
    const size = effect.kind === 'hell' ? width * .95 : effect.kind === 'destroy' ? 260 : effect.kind === 'slam' ? 335 : effect.kind === 'crushing' ? 245 : effect.kind === 'power' ? 165 : 150;
    for (const [index, sprite] of sprites.entries()) {
      if (effect.kind === 'slash2') {
        const phase = Math.max(0, Math.min(1, t * 2 - index));
        const side = index ? 21 : -21;
        sprite.position.set(x + Math.cos(screenAngle) * 48 - Math.sin(screenAngle) * side, y + Math.sin(screenAngle) * 48 + Math.cos(screenAngle) * side - 76 + phase * 62);
        sprite.scale.set(size / sprite.texture.width * (1 + phase * .2));
        sprite.rotation = screenAngle + Math.PI / 2 + (index ? -.12 : .12);
        sprite.alpha = t >= index * .5 && t < (index + 1) * .5 ? Math.sin(Math.PI * phase) : 0;
        sprite.tint = 0xffffff;
        continue;
      }
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
    const theta = effect.age * Math.PI * 2 / 1.1 + progress * progress * Math.PI * 2;
    const fade = Math.min(1, progress * 8, (1 - progress) * 7);
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
      const width = index === 0 ? 102 : 37 + tail * 32;
      const scale = width / sprite.texture.width;
      sprite.scale.set(scale);
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


export function drawDrops(this: GameView, world: World, project: (x: number, y: number) => [number, number], time: number): void {
    for (const drop of world.drops) {
      const [x, y] = project(drop.x, drop.y), color = rarityColors[drop.item.rarity];
      const pulse = .65 + Math.sin(time * 5) * .18;
      this.glow.ellipse(x, y - 25, 12, 46).fill({ color, alpha: .13 * pulse });
      this.ground.rect(x - 2, y - 70, 4, 68).fill({ color, alpha: .5 * pulse });
      this.ground.ellipse(x, y + 2, 14, 5).fill({ color, alpha: .5 });
      this.ground.moveTo(x, y - 11).lineTo(x + 6, y - 5).lineTo(x, y + 1).lineTo(x - 6, y - 5).closePath().fill(color);
    }
  }

export function drawEffects(this: GameView, world: World, project: (x: number, y: number) => [number, number], time: number): void {
    const liveEffects = new Set(world.effects);
    for (const [effect, sprites] of this.vfxSprites) if (!liveEffects.has(effect)) { for (const sprite of sprites) sprite.destroy(); this.vfxSprites.delete(effect); }
    for (const effect of world.effects) {
      const [x, y] = project(effect.x, effect.y), t = effect.age / effect.duration;
      const screenAngle = Math.atan2(Math.sin(effect.angle) * .43 + Math.cos(effect.angle) * .43, Math.cos(effect.angle) * .86 - Math.sin(effect.angle) * .86);
      if (this.drawSkillVfx(effect, x, y, t, screenAngle, time)) continue;
      if (effect.kind === 'death') this.drawDeath(x, y, t, effect.angle);
      else this.drawHit(x, y, t, effect.angle);
    }
    this.updateDamageLabels(world.effects, project);
  }
