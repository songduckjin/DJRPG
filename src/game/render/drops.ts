import {createLootOutline,LOOT_OUTLINE_PAD} from './lootOutline';
import {GOLD_COIN_CHIP_DROP,GOLD_PILE,GOLD_PILE_RX,GOLD_PILE_RY,goldCoinChipHeight,goldCoinChipWidth,goldCoinHeight} from './goldPile';
import {goldCoinChipTexture} from './goldCoinArt';
import {captureLootGround,projectLootGround} from '../lootGround';
import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Coin, Drop, World } from '../world';
import { equipmentImage, isEquipment, isStatBook, type Item, type Rarity } from '../items';
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
/** A drop thrown further than this is a boss heap bursting out of the body rather than a drop falling
 *  where it appeared: it flies a parabola to its spot instead of hopping in place (작업 196). */
const TOSS_BURST_MIN = 8;

/** How a drop travels to its resting spot: a boss heap is lobbed from the body and needs longer for a
 *  longer throw, with a higher arc; every other drop keeps the small hop that lands on the spot. */
function tossOf(travel: number, reduced: boolean): { burst: boolean; flight: number; peak: number } {
  if (reduced) return { burst: false, flight: 1, peak: TOSS_PEAK };
  if (travel <= TOSS_BURST_MIN) return { burst: false, flight: .45, peak: TOSS_PEAK };
  return { burst: true, flight: Math.min(.95, .3 + travel / 420), peak: Math.min(30, 8 + travel * .2) };
}

export type LootView = {
  body: Container;
  art: Sprite[];
  glow?: Sprite;
  fallback?: Graphics;
  taken?: LootDrop;
  /** `origin` is the point the drop was thrown from (for a boss heap the body) and `landing` the spot
   *  it rests on, both in screen pixels. */
  origin: {x:number;y:number}; landing: {x:number;y:number};
  /** Seconds the drop takes to reach its resting spot, and how high its arc peaks. */
  flight: number; peak: number; burst: boolean;
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
 *  actually fell is ever downloaded, and a failed request is not repeated every frame. `mipmaps`
 *  asks the loader for a mip chain before the texture is ever uploaded, which is what lets a 256px
 *  coin land on a 20-something-pixel heap without shimmering (작업 195). */
function sheetTexture(view: GameView, path: string, mipmaps = false): Texture | undefined {
  const loaded = Assets.get<Texture>(path);
  if (loaded) {
    if (mipmaps) { loaded.source.scaleMode = 'linear'; loaded.source.mipmapFilter = 'linear'; loaded.source.autoGenerateMipmaps = true; }
    return loaded;
  }
  if (view.lootSheets.has(path)) return undefined;
  view.lootSheets.add(path);
  const request = mipmaps
    ? Assets.load<Texture>({ alias: path, src: path, data: { scaleMode: 'linear', autoGenerateMipmaps: true } })
    : Assets.load<Texture>(path);
  void request.then(texture => {
    if (!texture) return;
    texture.source.scaleMode = 'linear';
    if (mipmaps) { texture.source.autoGenerateMipmaps = true; texture.source.mipmapFilter = 'linear'; }
    view.lootSheets.delete(path);
  }).catch(() => { /* keep it in the set: one attempt per art per session */ });
  return undefined;
}

/** One icon of a drop as a texture: an item sheet holds `columns` frames in a single row. */
function lootArtTexture(view: GameView, item: Item): Texture | undefined {
  // 영구 스탯북(파트 B) — 전용 아이콘 시안 전까지 기존 책 그림을 쓴다(가방·창고와 같은 그림).
  if (isStatBook(item)) return sheetTexture(view, '/assets/icons/icon_skillbook.png');
  // 보물 주머니(작업 207)는 필드에 떨어지지 않는다 — 장비 그림이 없는 아이템은 아이콘 없이 그린다.
  if (!isEquipment(item)) return undefined;
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
    // A heap of coins lying flat on the floor (작업 196): every coin of the shared table drawn from
    // one baked chip — the original coin art lifted out of the dark floor, with its own 1px warm
    // brown boundary and 2px darker-gold thickness (`render/goldCoinArt`). One sprite per coin, one
    // texture per coin size: ten boss heaps still cost ten sprites, not ninety. The coin art keeps
    // its mip chain in case the chip cannot be baked and the plain art is drawn instead.
    const texture = sheetTexture(view, '/assets/icons/gold-coin.png', true);
    if (!texture) return [];
    const coins: Sprite[] = [];
    for (const coin of GOLD_PILE) {
      const key = `gold-chip:${coin.size}x${goldCoinHeight(coin)}`;
      let chip = view.lootArtTextures.get(key);
      if (!chip) { const baked = goldCoinChipTexture(texture, coin); if (baked) { chip = baked; view.lootArtTextures.set(key, baked); } }
      const sprite = new Sprite(chip ?? texture);
      sprite.anchor.set(.5, 1);
      sprite.width = chip ? goldCoinChipWidth(coin) : coin.size;
      sprite.height = chip ? goldCoinChipHeight(coin) : coin.size * coin.squash;
      sprite.x = coin.dx; sprite.y = chip ? coin.dy + GOLD_COIN_CHIP_DROP : coin.dy;
      sprite.tint = coin.tint;
      body.addChild(sprite); coins.push(sprite);
    }
    return coins;
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
      // A boss heap was thrown from the body (`from`), so it starts there and flies to its spot; any
      // other drop simply falls where it appeared (작업 196).
      const from = 'from' in entry ? entry.from : undefined;
      const [startX, startY] = from ? project(from.x, from.y) : [groundX, groundY];
      const toss = tossOf(Math.hypot(spot.x - startX, spot.y - startY), reducedMotion);
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
        origin:captureLootGround({x:startX,y:startY},viewport,world.player),landing:captureLootGround(spot,viewport,world.player),
        flight: toss.flight, peak: toss.peak, burst: toss.burst,
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
    view.drift = Math.min(1, view.drift + dt / view.flight);
    // A burst heap travels across the floor at a steady pace under its arc; every other drop eases
    // into its spot from the short hop above it.
    const path = view.burst ? view.drift : 1 - Math.pow(1 - view.drift, 3);
    const x = origin.x+(landing.x-origin.x)*path, y = origin.y+(landing.y-origin.y)*path;
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
      if (view.burst) {
        // The parabola of a thrown heap: up off the body, over, and down onto its spot exactly when
        // it arrives there.
        view.h = Math.max(0, 4 * view.peak * view.drift * (1 - view.drift));
        if (view.drift >= 1) view.settled = true;
      } else if (!view.settled) {
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
    const lifted = Math.min(1, view.h / (view.peak * 2));
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
