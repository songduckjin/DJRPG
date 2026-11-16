import { Sprite, Text } from 'pixi.js';
import type { World } from '../world';
import type { Art, GameView } from '../render';

const walkAnchors = {
  maleBaseWalk: [.95, .95, .95, .95, .941, .944, .944, .923],
  femaleBaseWalk: [.95, .948, .95, .944, .953, .953, .95, .928],
  maleWalk: [.932, .93, .932, .926, .93, .932, .93, .928],
  femaleWalk: [.948, .946, .95, .944, .935, .944, .95, .941],
  armoredWalk: [.89, .89, .89, .883, .892, .889, .887, .889],
  armoredNoHelmWalk: [.944, .932, .935, .926, .932, .935, .937, .939],
  skeletonWalk: [.917, .914, .91, .912, .898, .91, .905, .892],
  bossWalk: [.919, .901, .899, .899, .914, .907, .905, .905]
} as const;

export function drawHero(this: GameView, world: World, x: number, y: number, time: number): void {
    const { player, save } = world;
    const equipped = !!save.equipment.armor;
    const moving = Math.hypot(world.activeMove.x, world.activeMove.y) > .05;
    const walked = Math.hypot(player.x - this.lastHeroWorld.x, player.y - this.lastHeroWorld.y);
    this.lastHeroWorld = { x: player.x, y: player.y };
    if (moving) this.heroWalkDistance += Math.min(30, walked);
    const walkingFrame = Math.floor(this.heroWalkDistance / 12) % 8;
    const attackFrame = Math.min(3, Math.floor((1 - world.attackPose / .32) * 4));
    const art: Art = equipped ? save.equipment.helmet ? 'armored' : 'armoredNoHelm' : save.equipment.weapon ? save.gender === 'male' ? 'maleSword' : 'femaleSword' : save.gender;
    const walkArt = equipped ? save.equipment.helmet ? 'armoredWalk' : 'armoredNoHelmWalk' : save.gender === 'female' ? save.equipment.weapon ? 'femaleWalk' : 'femaleBaseWalk' : save.equipment.weapon ? 'maleWalk' : 'maleBaseWalk';
    let texture = this.textures[art];
    if (world.attackPose > 0) texture = this.animations[equipped ? save.equipment.helmet ? 'armoredAttack' : 'armoredNoHelmAttack' : save.gender === 'male' ? 'maleAttack' : 'femaleAttack'][Math.max(0, attackFrame)];
    else if (moving) texture = this.animations[walkArt][walkingFrame];
    if (this.hero.texture !== texture) this.hero.texture = texture;
    this.hero.anchor.y = world.attackPose > 0 ? .97 : moving ? walkAnchors[walkArt][walkingFrame] : .996;
    let bob = 0;
    const local = world.effects.filter(effect => effect.kind !== 'hit' && effect.kind !== 'death' && Math.hypot(effect.x - player.x, effect.y - player.y) < 2);
    const attack = local.find(effect => ['slash', 'slash2', 'power', 'destroy'].includes(effect.kind));
    const spin = local.find(effect => effect.kind === 'spin');
    const slam = local.find(effect => effect.kind === 'slam' || effect.kind === 'hell');
    const cry = local.find(effect => effect.kind === 'warcry');
    const attackPulse = world.attackPose > 0 ? Math.sin(Math.PI * (1 - world.attackPose / .32)) : 0;
    if (slam) bob -= Math.sin(Math.PI * slam.age / slam.duration) * 17;
    const boost = cry ? 1 + .14 * (1 - cry.age / cry.duration) : 1;
    const scale = this.app.screen.height * .095 / texture.height;
    const face = player.facingSide;
    const lungeX = (Math.cos(player.facing) - Math.sin(player.facing)) * .86 * attackPulse * 24;
    const lungeY = (Math.cos(player.facing) + Math.sin(player.facing)) * .43 * attackPulse * 24;
    this.hero.scale.set(scale * face * boost * (world.attackPose > 0 ? 1 + attackPulse * .15 : 1), scale * boost * (world.attackPose > 0 ? 1 - attackPulse * .15 : slam && slam.age > .35 ? .82 : 1));
    this.hero.position.set(x + lungeX + (player.hit > 0 ? Math.sin(time * 55) * 2 : 0), y + bob + lungeY);
    this.hero.rotation = spin ? spin.age / spin.duration * Math.PI * 2 * face : attack ? (attack.swing ?? 1) * .2 * attackPulse * face : 0;
    this.hero.tint = player.hit > 0 ? 0xffd4cf : 0xffffff;
    const shadowRadius = Math.max(20, texture.width * scale * .45);
    this.ground.ellipse(x - face * 4, y - 3, shadowRadius, 8).fill({ color: 0x000000, alpha: .5 });
    if (player.berserk > 0) {
      this.glow.circle(x, y - 25, 35).fill({ color: 0xb32d28, alpha: .12 });
    }
  }

export function updateAfterimages(this: GameView, world: World, project: (x: number, y: number) => [number, number], dt: number): void {
    for (const effect of world.effects) {
      if (!['slash', 'slash2', 'spin', 'slam', 'power', 'destroy', 'hell'].includes(effect.kind) || effect.age > .19) continue;
      const index = Math.floor(effect.age / .065);
      if (index >= 3 || index <= (this.ghostEmissions.get(effect) ?? -1)) continue;
      this.ghostEmissions.set(effect, index);
      const sprite = new Sprite(this.hero.texture);
      sprite.anchor.set(.5, this.hero.anchor.y); sprite.scale.set(this.hero.scale.x, this.hero.scale.y); sprite.rotation = this.hero.rotation;
      sprite.tint = ['slam', 'destroy', 'hell'].includes(effect.kind) ? 0xffa06c : 0x8fe6dc;
      this.ghosts.addChild(sprite);
      const trail = 5 + index * 5;
      this.afterimages.push({ sprite, x: world.player.x - Math.cos(world.player.facing) * trail, y: world.player.y - Math.sin(world.player.facing) * trail, age: 0, duration: .22 });
    }
    for (const ghost of this.afterimages) {
      ghost.age += dt;
      const [x, y] = project(ghost.x, ghost.y);
      ghost.sprite.position.set(x, y);
      ghost.sprite.alpha = .38 * Math.max(0, 1 - ghost.age / ghost.duration);
    }
    this.afterimages = this.afterimages.filter(ghost => {
      if (ghost.age < ghost.duration) return true;
      this.ghosts.removeChild(ghost.sprite); ghost.sprite.destroy(); return false;
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


export function drawEntities(this: GameView, world: World, project: (x: number, y: number) => [number, number], time: number, dt: number, cx: number, cy: number, h: number): void {
    const live = new Set(world.enemies);
    for (const [enemy, sprite] of this.enemies) if (!live.has(enemy)) {
      this.actors.removeChild(sprite); this.fallen.addChild(sprite); this.enemies.delete(enemy);
      this.enemyWalkDistance.delete(enemy);
      this.corpses.push({ sprite, x: enemy.x, y: enemy.y, age: 0, duration: enemy.boss ? .85 : .55, scaleX: sprite.scale.x, scaleY: sprite.scale.y, rotation: sprite.rotation });
      const label = this.bossLabels.get(enemy); if (label) { this.labels.removeChild(label); label.destroy(); this.bossLabels.delete(enemy); }
    }
    const depths: { sprite: Sprite; depth: number }[] = [];
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
      const face = (world.player.x - enemy.x) - (world.player.y - enemy.y) >= 0 ? 1 : -1;
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
    this.drawHero(world, cx, cy, time);
    const rage = world.effects.find(effect => effect.kind === 'warcry');
    const burst = rage ? 1 - rage.age / rage.duration : 0;
    const auraScale = 165 / this.aura.texture.width * (1 + burst * .8);
    this.aura.position.set(cx, cy - 3);
    this.aura.scale.set(auraScale, auraScale * .6);
    this.aura.rotation = time * .35;
    this.aura.alpha = world.player.berserk > 0 ? .48 + burst * .48 + Math.sin(time * 4) * .08 : 0;
    this.updateAfterimages(world, project, dt);
    this.updateCorpses(project, dt);
    depths.push({ sprite: this.hero, depth: world.player.x + world.player.y });
    depths.sort((a, b) => a.depth - b.depth).forEach((entry, index) => this.actors.setChildIndex(entry.sprite, index));
  }
