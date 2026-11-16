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
    const tile = 180, ox = Math.floor(world.player.x / tile), oy = Math.floor(world.player.y / tile);
    for (let ix = ox - 4; ix <= ox + 4; ix++) for (let iy = oy - 4; iy <= oy + 4; iy++) {
      let hash = Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663);
      hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
      hash = (hash ^ (hash >>> 16)) >>> 0;
      if (hash % 5 !== 0) continue;
      const [x, y] = project(ix * tile + ((hash >>> 8) % 100) - 50, iy * tile + ((hash >>> 16) % 100) - 50);
      if (hash % 3 === 0) {
        this.ground.ellipse(x, y + 2, 21, 7).fill({ color: 0x070b08, alpha: .47 });
        this.ground.moveTo(x - 16, y).lineTo(x - 12, y - 10).lineTo(x + 2, y - 15).lineTo(x + 15, y - 7).lineTo(x + 18, y).closePath().fill(0x9e8057);
        this.ground.ellipse(x - 4, y - 9, 7, 3).fill({ color: 0xc2a277, alpha: .8 });
        this.ground.circle(x + 10, y - 4, 3).fill({ color: 0x795b38, alpha: .8 });
      } else if (hash % 3 === 1) {
        this.ground.ellipse(x, y + 3, 17, 5).fill({ color: 0x050607, alpha: .5 });
        this.ground.rect(x - 12, y - 8, 24, 8).fill(0x7c6041);
        this.ground.rect(x - 8, y - 35, 16, 28).fill(0x967650);
        this.ground.moveTo(x - 9, y - 35).lineTo(x - 9, y - 43).lineTo(x - 2, y - 40).lineTo(x + 4, y - 46).lineTo(x + 9, y - 37).closePath().fill(0xb3956a);
        this.ground.moveTo(x - 2, y - 29).lineTo(x + 3, y - 21).lineTo(x, y - 13).stroke({ color: 0x5c422a, width: 2 });
        this.ground.moveTo(x + 10, y).lineTo(x + 17, y - 9).lineTo(x + 18, y - 15).stroke({ color: 0x765638, width: 2 });
        this.ground.moveTo(x + 12, y - 3).lineTo(x + 21, y - 5).stroke({ color: 0x8b7144, width: 2 });
      } else {
        const flicker = Math.sin(time * 12 + hash) * 2;
        this.glow.circle(x, y - 22, 41 + flicker).fill({ color: 0xff7228, alpha: .1 });
        this.glow.circle(x, y - 22, 19 + flicker).fill({ color: 0xffb451, alpha: .13 });
        this.ground.ellipse(x, y + 3, 12, 4).fill({ color: 0x060505, alpha: .52 });
        this.ground.rect(x - 2, y - 16, 4, 18).fill(0x805934);
        this.ground.ellipse(x, y - 18, 12, 5).fill(0x78522f);
        this.ground.moveTo(x, y - 18).lineTo(x - 5, y - 30 - flicker).lineTo(x + 1, y - 26).lineTo(x + 5, y - 32 + flicker).lineTo(x + 5, y - 20).closePath().fill(0xff8b31);
        this.ground.circle(x, y - 22, 3).fill(0xffdd8c);
      }
    }
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
