import { placeWasteland, wastelandLayout } from '../wasteland';
import { jobOrDefault } from '../skills';
import type { World } from '../world';
import type { GameView } from '../render';

export function drawRunes(this: GameView, world: World, x: number, y: number, time: number): void {
    // [작업 214] 블러드 레이지(`warcry`)는 발밑 타원 링을 그리지 않는다 — 몸 주변 붉은 투기 오라
    // (`render/bloodRage.ts`)가 그 역할을 맡는다. 다른 직업의 버프(호크아이·아케인 실드)는 종전대로 링을 쓴다.
    const active = world.effects.find(effect => ['spin', 'slam', 'power', 'destroy', 'hell'].includes(effect.kind) && Math.hypot(effect.x - world.player.x, effect.y - world.player.y) < 2);
    const raging = world.player.berserk > 0 && jobOrDefault(world.save.job) !== 'warrior';
    if (!active && !raging) return;
    const t = active ? active.age / active.duration : 0;
    const burst = active?.kind === 'spin' || active?.kind === 'slam' || active?.kind === 'hell';
    const radius = burst ? 17 + t * 27 : 18;
    const color = active?.kind === 'slam' || active?.kind === 'hell' || raging ? 0xff8d49 : 0x66d9d2;
    const alpha = active ? 1 - t : .32;
    this.glow.ellipse(x, y + 2, radius + 10, (radius + 10) * .43).fill({ color, alpha: .13 * alpha });
    this.ground.ellipse(x, y + 2, radius, radius * .42).stroke({ color, width: burst ? 3 : 2, alpha: .8 * alpha });
    this.ground.ellipse(x, y + 2, radius * .65, radius * .28).stroke({ color, width: 1, alpha: .6 * alpha });
    for (let i = 0; i < 8; i++) {
      const angle = time * (raging ? 2.5 : 4) + i * Math.PI / 4;
      const px = x + Math.cos(angle) * radius, py = y + 2 + Math.sin(angle) * radius * .42;
      this.ground.circle(px, py, burst ? 2.5 : 1.6).fill({ color, alpha: .8 * alpha });
    }
  }

export function drawTerrain(this: GameView, world: World, _project: (x: number, y: number) => [number, number], _time: number): void {
    // The approved scene already contains rocks, grass and fires. Do not double them.
    placeWasteland(this, world.player);
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

export function drawLighting(this: GameView, world: World, w: number, h: number, time: number): void {
    wastelandLayout(w, h, world.player).fires.forEach((fire, index) => {
      const flicker = 1 + Math.sin(time * 8 + index * 5) * .04;
      this.glow.circle(fire.x, fire.y, fire.radius * flicker).fill({ color: 0xf0742e, alpha: .055 });
      this.glow.circle(fire.x, fire.y, fire.radius * .46 * flicker).fill({ color: 0xffa13d, alpha: .08 });
    });
  }

export function drawVignette(this: GameView, w: number, h: number, cx: number, cy: number, time: number): void {
    const sight = Math.min(w, h) * .72 + Math.sin(time * 3) * 4;
    for (let ring = 0; ring < 7; ring++) {
      this.shade.rect(0, 0, w, h).fill({ color: 0x24180c, alpha: .015 });
      this.shade.circle(cx, cy, sight + ring * 33).cut();
    }
}
