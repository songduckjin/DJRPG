import { placeFieldScene, castleLayoutFor, wastelandLayout } from '../wasteland';
import { zoneOf } from '../floorTheme';
import type { CombatEngine } from '../combat/engine';
import type { GameView } from '../render';

export function drawRunes(this: GameView, world: CombatEngine, x: number, y: number, time: number): void {
    // [작업 214] 블러드 레이지(`warcry`)는 발밑 타원 링을 그리지 않는다 — 몸 주변 붉은 투기 오라
    // (`render/bloodRage.ts`)가 그 역할을 맡는다. [작업 261] 궁수 호크아이도 같은 이유로 링을 쓰지 않고
    // 몸을 감는 바람 오라(`render/hawkEyeWind.ts`)로 그린다. 아케인 실드도 발밑 링을 쓰지 않는다.
    const active = world.effects.find(effect => ['spin', 'slam', 'power', 'destroy', 'hell'].includes(effect.kind) && Math.hypot(effect.x - world.player.x, effect.y - world.player.y) < 2);
    if (!active) return;
    const t = active ? active.age / active.duration : 0;
    const burst = active?.kind === 'spin' || active?.kind === 'slam' || active?.kind === 'hell';
    const radius = burst ? 17 + t * 27 : 18;
    const color = active.kind === 'slam' || active.kind === 'hell' ? 0xff8d49 : 0x66d9d2;
    const alpha = 1 - t;
    this.glow.ellipse(x, y + 2, radius + 10, (radius + 10) * .43).fill({ color, alpha: .13 * alpha });
    this.ground.ellipse(x, y + 2, radius, radius * .42).stroke({ color, width: burst ? 3 : 2, alpha: .8 * alpha });
    this.ground.ellipse(x, y + 2, radius * .65, radius * .28).stroke({ color, width: 1, alpha: .6 * alpha });
    for (let i = 0; i < 8; i++) {
      const angle = time * 4 + i * Math.PI / 4;
      const px = x + Math.cos(angle) * radius, py = y + 2 + Math.sin(angle) * radius * .42;
      this.ground.circle(px, py, burst ? 2.5 : 1.6).fill({ color, alpha: .8 * alpha });
    }
  }

export function drawTerrain(this: GameView, world: CombatEngine, _project: (x: number, y: number) => [number, number], _time: number): void {
    // The approved scene already contains rocks, grass and fires. Do not double them.
    // 21층부터는 같은 자리에서 흑요석 성 배경으로 갈아 끼운다(`wasteland.ts` `placeFieldScene`).
    this.lastFloor = world.save.floor;
    placeFieldScene(this, world.player, world.save.floor);
  }

export function drawDust(this: GameView, world: CombatEngine, project: (x: number, y: number) => [number, number], time: number, dt: number): void {
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

export function drawLighting(this: GameView, world: CombatEngine, w: number, h: number, time: number): void {
    const zone = zoneOf(world.save.floor);
    if (zone) {
      // 성 안 구역 조명(21~40층) — 배경은 1장 그대로 두고 ①상단 조명 틴트 ②안개 밀도 ③불빛만 바꾼다.
      // 위쪽은 구역 색이 번지고(달빛·촛불·물빛·붉은 하늘), 아래쪽엔 안개가 띠로 깔린다.
      this.glow.rect(0, 0, w, h * .55).fill({ color: zone.sky, alpha: zone.skyAlpha });
      this.glow.rect(0, 0, w, h).fill({ color: zone.sky, alpha: zone.skyAlpha * .35 });
      for (let band = 0; band < 3; band++) {
        const top = h * (.48 + band * .18), height = h * .22;
        this.glow.rect(0, top, w, height).fill({ color: zone.fog, alpha: zone.fogAlpha * (.45 + band * .22) });
      }
      castleLayoutFor(zone)(w, h, world.player).fires.forEach((fire, index) => {
        const flicker = 1 + Math.sin(time * 7 + index * 4.7) * .06 + Math.sin(time * 11.3 + index * 2.1) * .03;
        this.glow.circle(fire.x, fire.y, fire.radius * flicker).fill({ color: zone.ember, alpha: .05 });
        this.glow.circle(fire.x, fire.y, fire.radius * .46 * flicker).fill({ color: zone.ember, alpha: .08 });
      });
      return;
    }
    wastelandLayout(w, h, world.player).fires.forEach((fire, index) => {
      const flicker = 1 + Math.sin(time * 8 + index * 5) * .04;
      this.glow.circle(fire.x, fire.y, fire.radius * flicker).fill({ color: 0xf0742e, alpha: .055 });
      this.glow.circle(fire.x, fire.y, fire.radius * .46 * flicker).fill({ color: 0xffa13d, alpha: .08 });
    });
  }

export function drawVignette(this: GameView, w: number, h: number, cx: number, cy: number, time: number): void {
    // 성 안은 황무지보다 시야가 좁고 어둠이 푸르스름/붉게 깔린다(구역 표의 `dark`).
    const zone = zoneOf(this.lastFloor);
    const sight = Math.min(w, h) * (zone ? .66 : .72) + Math.sin(time * 3) * 4;
    for (let ring = 0; ring < 7; ring++) {
      this.shade.rect(0, 0, w, h).fill({ color: zone ? zone.dark : 0x24180c, alpha: .015 });
      this.shade.circle(cx, cy, sight + ring * 33).cut();
    }
}
