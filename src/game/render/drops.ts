import {createLootOutline,LOOT_OUTLINE_PAD} from './lootOutline';
import {GOLD_PILE_ART,GOLD_PILE_H,GOLD_PILE_RX,GOLD_PILE_RY,GOLD_PILE_W} from './goldPile';
import {captureLootGround,projectLootGround} from '../lootGround';
import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Coin, Drop, World } from '../world';
import { equipmentImage, isSkillBook, type Item, type Rarity } from '../items';
import { passives } from '../skills';
import { LOOT_DEPTH, LOOT_GAP, LOOT_REST_SECONDS, lootAbsorbPoint, lootAbsorbProgress, lootRestSpots, type LootDrop } from '../loot';
import { heroBodyFraction } from './heroScale';
import type { GameView } from '../render';

/** Grade ink of a ground drop: the same saturated colours the dungeon uses, so an equipment or skill
 *  book drop reads as its grade at a glance. A coin carries no outer light at all. */
const lootInk: Record<Rarity, number> = { common: 0xcdd6e0, magic: 0x2f7bff, rare: 0xffd400, epic: 0xa855f7, unique: 0xff8a00, legendary: 0xff2d2d };
/** A drop is drawn at a stationary monster's ground-shadow size (about 38px); a coin is no icon of
 *  its own but the flat heap in `render/goldPile` (작업 194), so only items take this size. */
const ART_SIZE = 34;
/** Pull gravity of the toss, in pixels per second squared — the same beat as the dungeon's loot. */
const BOUNCE_GRAVITY = 1200;
/** Height of the little hop a drop makes before it falls: a sixth of its 34px icon, so it drops with
 *  a light "tok" instead of being lobbed across the floor. */
const TOSS_PEAK = 5;
/** The same hop varies a touch drop to drop, so a heap of two never falls in lockstep. */
const TOSS_VARY = .2;
/** A landed drop rebounds once at this share of its speed, and a slower fall than this is simply the
 *  floor: one soft tap, then it rests upright. */
const TOSS_REBOUND = .35, TOSS_SETTLE = 60;
/** Launch speed that carries the drop exactly `TOSS_PEAK` high under `BOUNCE_GRAVITY`. */
const TOSS_SPEED = Math.sqrt(2 * BOUNCE_GRAVITY * TOSS_PEAK);

export type LootView = {
  body: Container;
  art: Sprite[];
  glow?: Sprite;
  fallback?: Graphics;
  taken?: LootDrop;
  /** Rest offset from the point the drop fell on, in screen pixels. */
  origin: {x:number;y:number}; landing: {x:number;y:number};
  drift: number;
  /** Height above the floor and its speed. A drop only travels straight up and down, so it keeps its
   *  upright icon all the way from the kill to the floor and into the character. */
  h: number; vh: number;
  /** One soft tap after the first landing, then the drop lies still for good. */
  tapped: boolean;
  settled: boolean;
};

const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Texture of a sheet path, requested the first time a drop needs it. Only the art of a drop that
 *  actually fell is ever downloaded, and a failed request is not repeated every frame. */
function sheetTexture(view: GameView, path: string): Texture | undefined {
  const loaded = Assets.get<Texture>(path);
  if (loaded) return loaded;
  if (view.lootSheets.has(path)) return undefined;
  view.lootSheets.add(path);
  void Assets.load<Texture>(path).then(texture => {
    if (!texture) return;
    texture.source.scaleMode = 'linear';
    view.lootSheets.delete(path);
  }).catch(() => { /* keep it in the set: one attempt per art per session */ });
  return undefined;
}

/** One icon of a drop as a texture: an item sheet holds `columns` frames in a single row. */
function lootArtTexture(view: GameView, item: Item): Texture | undefined {
  if (isSkillBook(item)) return sheetTexture(view, Object.hasOwn(passives, item.skillId) ? '/assets/icons/icon_skillbook_passive.png' : '/assets/icons/icon_skillbook.png');
  const image = equipmentImage(item);
  const key = `${image.path}#${image.frame}`;
  const cached = view.lootArtTextures.get(key);
  if (cached) return cached;
  const sheet = sheetTexture(view, image.path);
  if (!sheet) return undefined;
  const width = Math.round(sheet.source.width / image.columns);
  const texture = new Texture({ source: sheet.source, frame: new Rectangle(image.frame * width, 0, width, sheet.source.height) });
  view.lootArtTextures.set(key, texture);
  return texture;
}

/** The icon of a drop, plus for an item the hard 1px grade outline and the grade halo. Nothing is
 *  added when the art has not arrived yet; the caller keeps a diamond marker until it does. */
function attachArt(view: GameView, body: Container, gold: boolean, item: Item | undefined, ink: number): Sprite[] {
  if (gold) {
    const texture = sheetTexture(view, GOLD_PILE_ART);
    if (!texture) return [];
    // A heap of coins lying flat on the floor: one piece of art drawn at the size it was built for
    // (see `render/goldPile`), so nothing is squashed or shrunk per drop. No outer light at all.
    const sprite = new Sprite(texture);
    sprite.anchor.set(.5, 1);
    sprite.width = GOLD_PILE_W; sprite.height = GOLD_PILE_H;
    body.addChild(sprite);
    return [sprite];
  }
  const texture = lootArtTexture(view, item!);
  if (!texture) return [];
  const key=`grade:${texture.uid}:${ink}`;
  let outline=view.lootArtTextures.get(`${key}:outline`),halo=view.lootArtTextures.get(`${key}:halo`);
  if(!outline||!halo){const created=createLootOutline(texture,ink,ART_SIZE);outline=created.outline;halo=created.halo;view.lootArtTextures.set(`${key}:outline`,outline);view.lootArtTextures.set(`${key}:halo`,halo);}
  const glow=new Sprite(halo);glow.label='loot-grade-glow';
  const edge=new Sprite(outline);
  for(const sprite of [glow,edge]){sprite.anchor.set(.5,1);sprite.width=sprite.height=ART_SIZE+2*LOOT_OUTLINE_PAD;sprite.y=LOOT_OUTLINE_PAD;}
  body.addChild(glow,edge);
  const sprites:Sprite[]=[edge];
  const art = new Sprite(texture);
  art.anchor.set(.5, 1); art.width = ART_SIZE; art.height = ART_SIZE;
  sprites.push(art); body.addChild(art);
  return sprites;
}

/** Draws the field's ground loot: the coin a kill paid and the equipment or skill book it dropped.
 *  Each drop bounces to its resting spot, rests there for `LOOT_REST_SECONDS`, then is pulled into
 *  the character as he stands at that moment — the dungeon's beat, per drop instead of per stage.
 *  Painting only: `world.ts` decides when a drop is stored, so a drop held back by a full bag stays
 *  visible on the ground instead of looking swallowed. */
export function drawLoot(this: GameView, world: World, project: (x: number, y: number) => [number, number], time: number, dt: number): void {
  const h = this.app.screen.height, viewport={width:this.app.screen.width,height:h};
  const [heroX, heroY] = project(world.player.x, world.player.y);
  const heroH = Math.max(48, h * heroBodyFraction);
  const rx = Math.max(40, heroH * .5), ry = heroH + 8, reach = Math.max(120, heroH * 2 + 8);
  const entries = new Map<Drop | Coin, { gold: boolean; item?: Item }>();
  for (const drop of world.drops) entries.set(drop, { gold: false, item: drop.item });
  for (const coin of world.coins) entries.set(coin, { gold: true });
  for (const [entry, view] of this.lootViews) if (!entries.has(entry)) {
    view.body.destroy({ children: true });
    this.lootViews.delete(entry);
    if (view.taken) this.lootTaken = this.lootTaken.filter(t => t !== view.taken);
  }
  // Reproject reserved landing spots before allocating new ones, so camera movement cannot
  // make the old screen-space reservations displace the next pile.
  for(const view of this.lootViews.values())if(view.taken)Object.assign(view.taken,projectLootGround(view.landing,viewport,world.player));
  let index = 0;
  for (const [entry, info] of entries) {
    const [groundX, groundY] = project(entry.x, entry.y);
    let view = this.lootViews.get(entry);
    if (!view) {
      // The kill point is the resting spot unless it is inside the character: then the drop is pulled
      // straight out along its own line, inside the fan, and only items keep their pitch apart.
      const [spot] = lootRestSpots(heroX, heroY, [{ x: groundX, y: groundY, gold: info.gold }], this.lootTaken, rx, ry, LOOT_GAP, reach);
      const body = new Container();
      body.zIndex = info.gold ? LOOT_DEPTH.gold : LOOT_DEPTH.item;
      const art = attachArt(this, body, info.gold, info.item, info.gold ? 0xf3c14b : lootInk[info.item!.rarity]);
      const glow=body.children.find(child=>child.label==='loot-grade-glow') as Sprite|undefined;
      let fallback: Graphics | undefined;
      if (!art.length) {
        // Until (or instead of) the art a plain grade diamond keeps the drop visible; a coin's is a
        // flat one, in the shape of the heap it will become.
        fallback = new Graphics();
        if (info.gold) fallback.ellipse(0, -4, 9, 4).fill(0xf3c14b);
        else fallback.moveTo(0, -14).lineTo(6, -7).lineTo(0, 0).lineTo(-6, -7).closePath().fill(lootInk[info.item!.rarity]);
        body.addChild(fallback);
      }
      // A coin lies flat on the floor, so it is always drawn behind the character and the monsters
      // (작업 194): the field's loot layer behind the actors holds it even when it fell in front of
      // the hero's feet. Items keep the depth rule, and stay above a coin in the same layer.
      (info.gold || spot.y < heroY - 6 ? this.lootBack : this.lootFront).addChild(body);
      view = {
        body, art, glow, fallback, taken: this.lootTaken[this.lootTaken.length - 1],
        origin:captureLootGround({x:groundX,y:groundY},viewport,world.player),landing:captureLootGround(spot,viewport,world.player),
        drift: reducedMotion ? 1 : 0, h: reducedMotion ? 0 : 2, vh: reducedMotion ? 0 : TOSS_SPEED * (1 + (Math.random() * 2 - 1) * TOSS_VARY), tapped: false, settled: reducedMotion
      };
      this.lootViews.set(entry, view);
    }
    if (!view.art.length) {
      const art = attachArt(this, view.body, info.gold, info.item, info.gold ? 0xf3c14b : lootInk[info.item!.rarity]);
      if (art.length) { if (view.fallback) { view.body.removeChild(view.fallback); view.fallback.destroy(); view.fallback = undefined; } view.art = art;view.glow=view.body.children.find(child=>child.label==='loot-grade-glow') as Sprite|undefined; }
    }
    // Depth: an item resting above the character's feet is drawn behind him, the rest in front. A
    // coin stays in the behind layer whichever side it fell on, so no monster or item ever covers a
    // coin the other way round. Neither sits on the character art, because the resting spot keeps
    // clear of his silhouette.
    const origin=projectLootGround(view.origin,viewport,world.player),landing=projectLootGround(view.landing,viewport,world.player);
    const layer = info.gold || landing.y < heroY - 6 ? this.lootBack : this.lootFront;
    if (view.body.parent !== layer) layer.addChild(view.body);
    view.drift = Math.min(1, view.drift + dt / .45);
    const ease = 1 - Math.pow(1 - view.drift, 3);
    const x = origin.x+(landing.x-origin.x)*ease, y = origin.y+(landing.y-origin.y)*ease;
    // A coin always flies in at the rest beat; an item only once the world marked the pull, which it
    // withholds while the bag is full.
    const started = info.gold ? LOOT_REST_SECONDS : 'absorb' in entry ? entry.absorb : undefined;
    const pull = started === undefined ? 0 : lootAbsorbProgress(entry.age, started);
    if (pull > 0) {
      const point = lootAbsorbPoint({ x, y: y - view.h }, { x: heroX, y: heroY - heroH * .4 }, pull, index % 2 ? 10 : -10);
      view.body.position.set(point.x, point.y);
      view.body.scale.set(1 - .55 * pull * pull);
      view.body.alpha = 1 - .9 * pull;
      this.glow.circle(heroX, heroY - heroH * .35, 34 + Math.sin(pull * Math.PI) * 22).stroke({ color: 0xffd9a0, width: 2, alpha: .45 * (1 - pull) });
    } else {
      if (!view.settled) {
        view.h += view.vh * dt; view.vh -= BOUNCE_GRAVITY * dt;
        if (view.h <= 0) {
          view.h = 0;
          if (!view.tapped && view.vh < -TOSS_SETTLE) { view.tapped = true; view.vh = -view.vh * TOSS_REBOUND; }
          else { view.vh = 0; view.settled = true; }
        }
      }
      // Only the toss carries the drop: no rotation, so it lands as plainly as it rose.
      view.body.position.set(x, y - view.h);
    }
    // The ground shadow stays on the floor while the drop is in the air and fades as it is swallowed.
    // A coin heap is wide and flat, so its shadow is too — and lighter than an item's, because ten
    // boss heaps lying together must not stack into one black puddle.
    const lifted = Math.min(1, view.h / (TOSS_PEAK * 2));
    const shadowX = (info.gold ? GOLD_PILE_RX * .78 : 19) - lifted * (info.gold ? 5 : 8);
    const shadowY = (info.gold ? GOLD_PILE_RY * .8 : 7) - lifted * (info.gold ? 1.2 : 3);
    const shadowAlpha = (info.gold ? .3 : .45) - lifted * (info.gold ? .12 : .2) - pull * .3;
    this.ground.ellipse(x, y + 2, Math.max(3, shadowX), Math.max(2, shadowY)).fill({ color: 0x000000, alpha: Math.max(0, shadowAlpha) });
    if (view.glow) {
      view.glow.alpha = pull > 0 ? 0 : .62 + Math.sin(time * 5) * .2;
    }
    index++;
  }
}
