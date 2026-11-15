import { Application, Container, Graphics } from 'pixi.js';
import type { World } from './world';
import type { Rarity } from './store';

const colors: Record<Rarity, number> = { common: 0xffffff, magic: 0x57aaff, rare: 0xffd265, legendary: 0xff7d35 };

export class GameView {
  app = new Application();
  private scene = new Container();
  private drawing = new Graphics();
  private glow = new Graphics();

  async mount(host: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: host, background: '#100d13', antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
    host.appendChild(this.app.canvas);
    this.app.stage.addChild(this.scene);
    this.scene.addChild(this.glow, this.drawing);
  }

  draw(world: World, time: number): void {
    const g = this.drawing, light = this.glow;
    g.clear(); light.clear();
    const w = this.app.screen.width, h = this.app.screen.height;
    const cx = w / 2, cy = h * .49;
    const project = (x: number, y: number): [number, number] => [cx + (x - world.player.x - y + world.player.y) * .86, cy + (x - world.player.x + y - world.player.y) * .43];
    g.rect(0, 0, w, h).fill(0x120f16);
    const tile = 72;
    const ox = Math.floor(world.player.x / tile), oy = Math.floor(world.player.y / tile);
    for (let x = ox - 7; x <= ox + 7; x++) for (let y = oy - 7; y <= oy + 7; y++) {
      const [sx, sy] = project(x * tile, y * tile);
      if (sx < -130 || sx > w + 130 || sy < -80 || sy > h + 80) continue;
      const tone = (Math.abs(x * 13 + y * 7) % 5) * 0x020202;
      g.moveTo(sx, sy - 31).lineTo(sx + 62, sy).lineTo(sx, sy + 31).lineTo(sx - 62, sy).closePath().fill(0x27252c + tone).stroke({ color: 0x3f3740, width: 1, alpha: .75 });
      if ((x * 7 + y * 11) % 9 === 0) g.moveTo(sx - 12, sy + 3).lineTo(sx + 9, sy - 5).lineTo(sx + 15, sy - 1).stroke({ color: 0x17151a, width: 2 });
    }
    for (let i = 0; i < 4; i++) {
      const tx = (i % 2 ? w * .87 : w * .13), ty = (i < 2 ? h * .18 : h * .76);
      const flicker = Math.sin(time * 8 + i * 5) * 3;
      light.circle(tx, ty, 48 + flicker).fill({ color: 0xf0742e, alpha: .045 });
      light.circle(tx, ty, 22 + flicker).fill({ color: 0xffa13d, alpha: .08 });
      g.rect(tx - 3, ty + 6, 6, 24).fill(0x594438);
      g.moveTo(tx, ty - 10 - flicker).lineTo(tx + 5, ty + 4).lineTo(tx, ty + 9).lineTo(tx - 5, ty + 4).closePath().fill(0xffa64e);
    }
    const objects: { depth: number; draw: () => void }[] = [];
    for (const drop of world.drops) {
      const [x, y] = project(drop.x, drop.y), color = colors[drop.item.rarity];
      objects.push({ depth: drop.x + drop.y, draw: () => {
        const pulse = .6 + Math.sin(time * 5) * .2;
        light.ellipse(x, y - 22, 12, 45).fill({ color, alpha: .11 * pulse });
        g.rect(x - 2, y - 67, 4, 61).fill({ color, alpha: .45 * pulse });
        g.ellipse(x, y + 3, 13, 5).fill({ color, alpha: .45 });
        g.moveTo(x, y - 12).lineTo(x + 5, y - 6).lineTo(x, y).lineTo(x - 5, y - 6).closePath().fill(color);
      } });
    }
    for (const enemy of world.enemies) {
      const [x, y] = project(enemy.x, enemy.y), scale = enemy.boss ? 1.7 : 1;
      objects.push({ depth: enemy.x + enemy.y, draw: () => {
        g.ellipse(x, y + 5, 20 * scale, 7 * scale).fill({ color: 0x000000, alpha: .45 });
        g.moveTo(x - 9 * scale, y - 31 * scale).lineTo(x + 9 * scale, y - 31 * scale).lineTo(x + 13 * scale, y - 7 * scale).lineTo(x - 13 * scale, y - 7 * scale).closePath().fill(enemy.hit ? 0xf5c4b4 : enemy.boss ? 0x4b2930 : 0x6e6566);
        g.circle(x, y - 37 * scale, 10 * scale).fill(enemy.hit ? 0xffffff : 0xbcb4a0);
        g.rect(x - 6 * scale, y - 40 * scale, 4 * scale, 3 * scale).fill(0x961f27);
        g.rect(x + 2 * scale, y - 40 * scale, 4 * scale, 3 * scale).fill(0x961f27);
        g.moveTo(x - 7 * scale, y - 28 * scale).lineTo(x - 16 * scale, y - 10 * scale).stroke({ color: 0xbcb4a0, width: 3 * scale });
        g.moveTo(x + 7 * scale, y - 28 * scale).lineTo(x + 19 * scale, y - 13 * scale).stroke({ color: 0xbcb4a0, width: 3 * scale });
        g.rect(x - 16 * scale, y - 52 * scale, 32 * scale, 3).fill(0x301e22);
        g.rect(x - 16 * scale, y - 52 * scale, 32 * scale * enemy.hp / enemy.maxHp, 3).fill(enemy.boss ? 0xe0813c : 0xc54143);
      } });
    }
    objects.push({ depth: world.player.x + world.player.y, draw: () => this.drawHero(g, light, cx, cy, world, time) });
    objects.sort((a, b) => a.depth - b.depth).forEach(o => o.draw());
    for (const effect of world.effects) {
      const [x, y] = project(effect.x, effect.y), t = effect.age / effect.duration;
      if (effect.kind === 'slash') {
        g.arc(x, y - 22, 58 + t * 18, effect.angle - .9, effect.angle + .9).stroke({ color: 0xf7e7c2, width: 9 * (1 - t), alpha: 1 - t });
      } else if (effect.kind === 'spin') {
        g.ellipse(x, y - 17, 90 * t + 20, 40 * t + 12).stroke({ color: 0xc9d7d8, width: 10 * (1 - t), alpha: 1 - t });
      } else if (effect.kind === 'slam') {
        for (let i = -2; i <= 2; i++) g.moveTo(x, y).lineTo(x + Math.cos(effect.angle + i * .35) * (130 * t), y + Math.sin(effect.angle + i * .35) * (65 * t)).stroke({ color: 0xdf493f, width: 5 * (1 - t), alpha: 1 - t });
      } else if (effect.kind === 'warcry') {
        g.ellipse(x, y - 16, 110 * t, 48 * t).stroke({ color: 0xf0813d, width: 8 * (1 - t), alpha: 1 - t });
      } else g.circle(x, y - 22, 12 * (1 - t)).fill({ color: 0xffd7a6, alpha: 1 - t });
    }
    g.rect(0, 0, w, 35).fill({ color: 0x09070b, alpha: .4 });
    g.rect(0, h - 35, w, 35).fill({ color: 0x09070b, alpha: .4 });
    g.rect(0, 0, 25, h).fill({ color: 0x09070b, alpha: .4 });
    g.rect(w - 25, 0, 25, h).fill({ color: 0x09070b, alpha: .4 });
  }

  private drawHero(g: Graphics, light: Graphics, x: number, y: number, world: World, time: number): void {
    const { player, save } = world;
    const armored = !!save.equipment.armor, helmet = !!save.equipment.helmet;
    const skin = save.gender === 'female' ? 0xd4a995 : 0xc3987c;
    const bob = Math.hypot(world.move.x, world.move.y) > .05 ? Math.sin(time * 12) * 2 : 0;
    if (player.berserk > 0) { light.circle(x, y - 23, 43).fill({ color: 0xdc3929, alpha: .16 }); g.ellipse(x, y, 30, 13).stroke({ color: 0xd85c39, width: 2 }); }
    g.ellipse(x, y + 6, 23, 8).fill({ color: 0x000000, alpha: .5 });
    g.moveTo(x - 7, y - 13 + bob).lineTo(x - 9, y + 3 + bob).stroke({ color: 0x423a40, width: 7 });
    g.moveTo(x + 7, y - 13 + bob).lineTo(x + 9, y + 3 + bob).stroke({ color: 0x423a40, width: 7 });
    g.moveTo(x - 12, y - 43 + bob).lineTo(x + 12, y - 43 + bob).lineTo(x + 10, y - 15 + bob).lineTo(x - 10, y - 15 + bob).closePath().fill(armored ? 0x58636a : skin);
    if (armored) { g.moveTo(x - 11, y - 40 + bob).lineTo(x + 11, y - 25 + bob).stroke({ color: 0x9ca5a0, width: 3 }); }
    else g.rect(x - 9, y - 18 + bob, 18, 6).fill(save.gender === 'female' ? 0x443944 : 0x55423c);
    if (save.gender === 'female' && !armored) g.rect(x - 11, y - 37 + bob, 22, 9).fill(0x43333d);
    g.circle(x, y - 51 + bob, 10).fill(skin);
    g.arc(x, y - 54 + bob, 10, Math.PI, Math.PI * 2).stroke({ color: save.gender === 'female' ? 0x21181e : 0x332522, width: 6 });
    if (helmet) g.moveTo(x - 10, y - 56 + bob).lineTo(x, y - 65 + bob).lineTo(x + 10, y - 56 + bob).lineTo(x + 8, y - 49 + bob).lineTo(x - 8, y - 49 + bob).closePath().fill(0x697174);
    const facing = Math.cos(player.facing) >= 0 ? 1 : -1;
    g.moveTo(x + 10 * facing, y - 38 + bob).lineTo(x + 16 * facing, y - 18 + bob).stroke({ color: skin, width: 6 });
    g.moveTo(x - 10 * facing, y - 38 + bob).lineTo(x - 15 * facing, y - 18 + bob).stroke({ color: skin, width: 6 });
    if (save.equipment.weapon) { g.moveTo(x + 16 * facing, y - 18 + bob).lineTo(x + 26 * facing, y - 49 + bob).stroke({ color: 0xd2d9d8, width: 5 }); g.moveTo(x + 11 * facing, y - 24 + bob).lineTo(x + 23 * facing, y - 20 + bob).stroke({ color: 0x8f6c45, width: 4 }); }
    if (save.equipment.offhand) g.circle(x - 17 * facing, y - 23 + bob, 11).fill(0x626b71).stroke({ color: 0xabb3ad, width: 2 });
    if (player.hit > 0) g.circle(x, y - 35, 31).fill({ color: 0xff5555, alpha: .18 });
  }
}
