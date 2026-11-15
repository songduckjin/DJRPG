import { Application, Assets, Container, Graphics, Sprite, TilingSprite, type Texture } from 'pixi.js';
import type { Enemy, World } from './world';
import type { Rarity } from './store';

const rarityColors: Record<Rarity, number> = { common: 0xffffff, magic: 0x57aaff, rare: 0xffd265, legendary: 0xff7d35 };
const paths = {
  floor: '/assets/dungeon_tile.jpg', male: '/assets/warrior_male_base.png',
  female: '/assets/warrior_female_base.png', armored: '/assets/warrior_armored.png',
  skeleton: '/assets/skeleton_warrior.png', boss: '/assets/skeleton_boss.png'
} as const;
type Art = keyof typeof paths;

export class GameView {
  app = new Application();
  private textures = {} as Record<Art, Texture>;
  private floor!: TilingSprite;
  private glow = new Graphics();
  private ground = new Graphics();
  private actors = new Container();
  private effects = new Graphics();
  private shade = new Graphics();
  private hero!: Sprite;
  private enemies = new Map<Enemy, Sprite>();

  async mount(host: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: host, background: '#100d13', antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true });
    host.appendChild(this.app.canvas);
    const loaded = await Promise.all((Object.keys(paths) as Art[]).map(async key => [key, await Assets.load<Texture>(paths[key])] as const));
    for (const [key, texture] of loaded) this.textures[key] = texture;
    this.floor = new TilingSprite({ texture: this.textures.floor, width: this.app.screen.width, height: this.app.screen.height });
    this.floor.tileScale.set(.82);
    this.hero = new Sprite(this.textures.male);
    this.hero.anchor.set(.5, 1);
    this.actors.addChild(this.hero);
    this.app.stage.addChild(this.floor, this.glow, this.ground, this.actors, this.effects, this.shade);
  }

  draw(world: World, time: number): void {
    const w = this.app.screen.width, h = this.app.screen.height;
    const cx = w / 2, cy = h * .5;
    const project = (x: number, y: number): [number, number] => [cx + (x - world.player.x - y + world.player.y) * .86, cy + (x - world.player.x + y - world.player.y) * .43];
    this.floor.width = w; this.floor.height = h;
    this.floor.tilePosition.set((-world.player.x + world.player.y) * .86, (-world.player.x - world.player.y) * .43);
    this.floor.tint = 0x9c9290;
    this.glow.clear(); this.ground.clear(); this.effects.clear(); this.shade.clear();
    this.drawLighting(w, h, time);
    for (const drop of world.drops) {
      const [x, y] = project(drop.x, drop.y), color = rarityColors[drop.item.rarity];
      const pulse = .65 + Math.sin(time * 5) * .18;
      this.glow.ellipse(x, y - 25, 12, 46).fill({ color, alpha: .13 * pulse });
      this.ground.rect(x - 2, y - 70, 4, 68).fill({ color, alpha: .5 * pulse });
      this.ground.ellipse(x, y + 2, 14, 5).fill({ color, alpha: .5 });
      this.ground.moveTo(x, y - 11).lineTo(x + 6, y - 5).lineTo(x, y + 1).lineTo(x - 6, y - 5).closePath().fill(color);
    }
    const live = new Set(world.enemies);
    for (const [enemy, sprite] of this.enemies) if (!live.has(enemy)) { this.actors.removeChild(sprite); sprite.destroy(); this.enemies.delete(enemy); }
    const depths: { sprite: Sprite; depth: number }[] = [];
    for (const enemy of world.enemies) {
      let sprite = this.enemies.get(enemy);
      if (!sprite) {
        sprite = new Sprite(enemy.boss ? this.textures.boss : this.textures.skeleton);
        sprite.anchor.set(.5, 1);
        this.actors.addChild(sprite);
        this.enemies.set(enemy, sprite);
      }
      const [x, y] = project(enemy.x, enemy.y), scale = (enemy.boss ? 1.25 : .82) * (enemy.hit > 0 ? 1.06 : 1);
      this.ground.ellipse(x, y + 3, enemy.boss ? 28 : 18, enemy.boss ? 10 : 6).fill({ color: 0x000000, alpha: .48 });
      sprite.position.set(x, y + (enemy.hit > 0 ? 2 : 0));
      const face = (world.player.x - enemy.x) - (world.player.y - enemy.y) >= 0 ? 1 : -1;
      sprite.scale.set(scale * face, scale * (enemy.hit > 0 ? .89 : 1));
      sprite.tint = enemy.hit > 0 ? 0xffb4a3 : 0xffffff;
      this.effects.rect(x - (enemy.boss ? 25 : 17), y - (enemy.boss ? 144 : 106), enemy.boss ? 50 : 34, 4).fill(0x21171b);
      this.effects.rect(x - (enemy.boss ? 25 : 17), y - (enemy.boss ? 144 : 106), (enemy.boss ? 50 : 34) * Math.max(0, enemy.hp / enemy.maxHp), 4).fill(enemy.boss ? 0xe0813c : 0xc54143);
      depths.push({ sprite, depth: enemy.x + enemy.y });
    }
    this.drawHero(world, cx, cy, time);
    depths.push({ sprite: this.hero, depth: world.player.x + world.player.y });
    depths.sort((a, b) => a.depth - b.depth).forEach((entry, index) => this.actors.setChildIndex(entry.sprite, index));
    for (const effect of world.effects) {
      const [x, y] = project(effect.x, effect.y), t = effect.age / effect.duration;
      if (effect.kind === 'slash') this.effects.arc(x, y - 25, 58 + t * 18, effect.angle - .9, effect.angle + .9).stroke({ color: 0xf7e7c2, width: 9 * (1 - t), alpha: 1 - t });
      else if (effect.kind === 'spin') this.effects.ellipse(x, y - 17, 90 * t + 20, 40 * t + 12).stroke({ color: 0xc9d7d8, width: 10 * (1 - t), alpha: 1 - t });
      else if (effect.kind === 'slam') for (let i = -2; i <= 2; i++) this.effects.moveTo(x, y).lineTo(x + Math.cos(effect.angle + i * .35) * (130 * t), y + Math.sin(effect.angle + i * .35) * (65 * t)).stroke({ color: 0xdf493f, width: 5 * (1 - t), alpha: 1 - t });
      else if (effect.kind === 'warcry') this.effects.ellipse(x, y - 16, 110 * t, 48 * t).stroke({ color: 0xf0813d, width: 8 * (1 - t), alpha: 1 - t });
      else this.effects.circle(x, y - 22, 12 * (1 - t)).fill({ color: 0xffd7a6, alpha: 1 - t });
    }
    this.shade.rect(0, 0, w, 40).fill({ color: 0x05040a, alpha: .58 });
    this.shade.rect(0, h - 50, w, 50).fill({ color: 0x05040a, alpha: .58 });
    this.shade.rect(0, 0, 30, h).fill({ color: 0x05040a, alpha: .55 });
    this.shade.rect(w - 30, 0, 30, h).fill({ color: 0x05040a, alpha: .55 });
  }

  private drawHero(world: World, x: number, y: number, time: number): void {
    const { player, save } = world;
    const equipped = !!(save.equipment.armor || save.equipment.helmet || save.equipment.weapon || save.equipment.offhand);
    const texture = this.textures[equipped ? 'armored' : save.gender];
    if (this.hero.texture !== texture) this.hero.texture = texture;
    const moving = Math.hypot(world.activeMove.x, world.activeMove.y) > .05;
    const bob = moving ? Math.sin(time * 13) * 3 : 0;
    const attacking = world.effects.some(effect => effect.kind === 'slash' && effect.age < .15 && Math.hypot(effect.x - player.x, effect.y - player.y) < 2);
    const scale = equipped ? .69 : .7;
    const face = Math.cos(player.facing) - Math.sin(player.facing) >= 0 ? 1 : -1;
    this.hero.scale.set(scale * face * (attacking ? 1.08 : 1), scale * (attacking ? .92 : 1));
    this.hero.position.set(x, y + bob);
    this.hero.tint = player.hit > 0 ? 0xffb2a6 : 0xffffff;
    this.ground.ellipse(x, y + 4, 21, 7).fill({ color: 0x000000, alpha: .5 });
    if (player.berserk > 0) {
      this.glow.circle(x, y - 40, 54).fill({ color: 0xd83d24, alpha: .14 });
      this.effects.ellipse(x, y, 28, 11).stroke({ color: 0xdd7540, width: 3, alpha: .7 });
    }
  }

  private drawLighting(w: number, h: number, time: number): void {
    for (let i = 0; i < 4; i++) {
      const x = i % 2 ? w * .88 : w * .12, y = i < 2 ? h * .16 : h * .75;
      const flicker = Math.sin(time * 8 + i * 5) * 4;
      this.glow.circle(x, y, 66 + flicker).fill({ color: 0xf0742e, alpha: .045 });
      this.glow.circle(x, y, 30 + flicker).fill({ color: 0xffa13d, alpha: .09 });
      this.ground.rect(x - 3, y + 5, 6, 24).fill(0x594438);
      this.ground.moveTo(x, y - 10 - flicker).lineTo(x + 5, y + 4).lineTo(x, y + 9).lineTo(x - 5, y + 4).closePath().fill(0xffa64e);
    }
  }
}
