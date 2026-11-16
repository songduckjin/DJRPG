import { Sprite } from 'pixi.js';
import type { World } from '../world';
import type { GameView } from '../render';

export function drawRunes(this: GameView, world: World, x: number, y: number, time: number): void {
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

export function drawTerrain(this: GameView, world: World, project: (x: number, y: number) => [number, number], time: number): void {
    const tile = 220, ox = Math.floor(world.player.x / tile), oy = Math.floor(world.player.y / tile);
    const scale = Math.max(.8, this.app.screen.width / 480);
    let used = 0;
    for (let ix = ox - 4; ix <= ox + 4; ix++) for (let iy = oy - 4; iy <= oy + 4; iy++) {
      let hash = Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663);
      hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
      hash = (hash ^ (hash >>> 16)) >>> 0;
      if (hash % 4 !== 0) continue;
      const [x, y] = project(ix * tile + ((hash >>> 8) % 100) - 50, iy * tile + ((hash >>> 16) % 100) - 50);
      if (x < -160 || x > this.app.screen.width + 160 || y < -100 || y > this.app.screen.height + 160) continue;
      const index = (hash >>> 5) % 6, texture = this.terrainTextures[index];
      let sprite = this.terrainSprites[used];
      if (!sprite) {
        sprite = new Sprite(texture); sprite.anchor.set(.5, .96);
        this.terrainLayer.addChild(sprite); this.terrainSprites.push(sprite);
      }
      sprite.texture = texture; sprite.visible = true;
      sprite.position.set(x, y);
      sprite.width = [78, 45, 60, 52, 130, 66][index] * scale;
      sprite.height = sprite.width * texture.height / texture.width;
      used++;
      if (index === 2) {
        const flicker = Math.sin(time * 12 + hash) * 2;
        this.glow.circle(x, y - 18 * scale, (38 + flicker) * scale).fill({ color: 0xff7228, alpha: .09 });
        this.glow.circle(x, y - 18 * scale, (17 + flicker) * scale).fill({ color: 0xffb451, alpha: .12 });
      }
    }
    for (let index = used; index < this.terrainSprites.length; index++) this.terrainSprites[index].visible = false;
  }

export function drawDust(this: GameView, world: World, project: (x: number, y: number) => [number, number], time: number, dt: number): void {
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

export function drawLighting(this: GameView, w: number, h: number, time: number): void {
    for (let i = 0; i < 4; i++) {
      const x = i % 2 ? w * .88 : w * .12, y = i < 2 ? h * .16 : h * .75;
      const flicker = Math.sin(time * 8 + i * 5) * 4;
      this.glow.circle(x, y, 78 + flicker).fill({ color: 0xf0742e, alpha: .055 });
      this.glow.circle(x, y, 35 + flicker).fill({ color: 0xffa13d, alpha: .08 });
    }
  }

export function drawVignette(this: GameView, w: number, h: number, cx: number, cy: number, time: number): void {
    const sight = Math.min(w, h) * .72 + Math.sin(time * 3) * 4;
    for (let ring = 0; ring < 7; ring++) {
      this.shade.rect(0, 0, w, h).fill({ color: 0x24180c, alpha: .015 });
      this.shade.circle(cx, cy, sight + ring * 33).cut();
    }
}
