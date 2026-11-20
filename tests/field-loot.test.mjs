import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
const { LOOT_REST_SECONDS, LOOT_ABSORB_SECONDS, LOOT_FAN, LOOT_GAP, LOOT_DEPTH, lootRestSpots, lootAbsorbProgress, lootAbsorbPoint } = await import('../src/game/loot.ts');
const { BOSS_GOLD_PILES, BOSS_ITEM_DROPS, bossGoldPiles } = await import('../src/game/bossLoot.ts');
const { GOLD_PILE, GOLD_PILE_RX, GOLD_PILE_RY, GOLD_COIN_EDGE, GOLD_COIN_RIM, GOLD_PILE_EDGE, GOLD_PILE_RIM, GOLD_PILE_BRIGHTNESS, GOLD_PILE_CONTRAST, GOLD_COIN_CHIP_DROP, goldCoinChipWidth, goldCoinChipHeight, goldCoinHeight } = await import('../src/game/render/goldPile.ts');
const { bossGoldSpot } = await import('../src/game/bossLoot.ts');
const { World } = await import('../src/game/world.ts');
const { freshSave } = await import('../src/game/store.ts');

const gear = (id, rarity = 'common') => ({ id, name: '검', slot: 'weapon', rarity, stats: { attack: 2 } });
const dropAt = (x, y, item = gear('drop')) => ({ x, y, item, age: 0, warned: false });
function advance(world, seconds, step = .02) { for (let time = 0; time < seconds - 1e-9; time += step) world.update(step); }
function quiet() { const world = new World(freshSave()); world.save.tutorial = 3; world.enemies = []; world.spawnTimer = 999; return world; }

test('a drop rests on the ground for 1.5 seconds before it is stored', () => {
  const world = quiet();
  world.drops = [dropAt(90, 0)];
  advance(world, 1.4);
  assert.equal(world.drops.length, 1);
  assert.equal(world.drops[0].absorb, undefined, 'the pull may only start at the rest beat');
  assert.equal(world.save.bag.length, 0);
  advance(world, .2);
  assert.notEqual(world.drops[0].absorb, undefined, 'the pull starts right at 1.5 seconds');
  assert.equal(world.save.bag.length, 0, 'nothing is stored while the drop flies in');
  advance(world, .6);
  assert.equal(world.drops.length, 0);
  assert.equal(world.save.bag[0].id, 'drop');
});

test('the pull takes the drop the rest of the way and is drawn from where it began', () => {
  assert.equal(lootAbsorbProgress(0), 0);
  assert.equal(lootAbsorbProgress(LOOT_REST_SECONDS - .01), 0);
  assert.equal(lootAbsorbProgress(LOOT_REST_SECONDS), 0);
  assert(Math.abs(lootAbsorbProgress(LOOT_REST_SECONDS + LOOT_ABSORB_SECONDS) - 1) < 1e-9);
  const half = lootAbsorbProgress(LOOT_REST_SECONDS + LOOT_ABSORB_SECONDS / 2);
  assert(half > .2 && half < .8);
  const from = { x: 10, y: 40 }, to = { x: 100, y: 300 };
  assert.deepEqual(lootAbsorbPoint(from, to, 0), from);
  assert.deepEqual(lootAbsorbPoint(from, to, 1), to);
  // Accelerating: more than half of the way is covered in the second half of the pull.
  assert(lootAbsorbPoint(from, to, .75).y > (from.y + to.y) / 2);
});

test('a drop held back by a full bag stays on the ground and flies in once there is room', () => {
  const world = quiet();
  world.save.bag = Array.from({ length: 40 }, (_, index) => gear(`full-${index}`));
  const messages = [];
  world.onMessage = text => messages.push(text);
  world.drops = [dropAt(90, 0)];
  advance(world, 2.5);
  assert.equal(world.drops.length, 1, 'a full equipment bag keeps the equipment drop on the ground');
  assert.equal(messages.filter(text => text.includes('가방이 가득')).length, 1, 'the full bag is reported once');
  world.save.bag.pop();
  advance(world, 1);
  assert.equal(world.drops.length, 0);
  assert(world.save.bag.some(item => item.id === 'drop'));
});

test('a skill book is still stored while an equipment bag is full', () => {
  const world = quiet();
  world.save.bag = Array.from({ length: 40 }, (_, index) => gear(`full-${index}`));
  world.drops = [dropAt(90, 0, { id: 'book', name: '[스킬북] 회전', slot: 'skillbook', kind: 'skillbook', skillId: 'spin', rarity: 'rare', stats: {} })];
  advance(world, 2.5);
  assert.equal(world.drops.length, 0);
  assert.equal(world.save.bag.at(-1).id, 'book');
});

test('a kill pays its gold at once and only leaves a coin behind for the field to draw', () => {
  const world = quiet();
  const before = world.save.gold;
  const enemy = { x: 60, y: 20, hp: 0, maxHp: 10, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.kill(enemy);
  assert.equal(world.save.gold, before + 3 + world.save.floor, 'the gold is granted at the kill, as before');
  assert.equal(world.coins.length, 1);
  assert.deepEqual([world.coins[0].x, world.coins[0].y], [60, 20]);
  assert.equal(world.coins[0].gold, 3 + world.save.floor);
  assert.equal(world.save.gold, before + world.coins[0].gold, 'the coin only shows gold that was already paid');
  advance(world, LOOT_REST_SECONDS + LOOT_ABSORB_SECONDS + .2);
  assert.equal(world.coins.length, 0, 'the coin is gone once it has been pulled in');
  assert.equal(world.save.gold, before + 3 + world.save.floor, 'the pull never pays twice');
});

test('a floor change clears the coins on the ground with the drops', () => {
  const world = quiet();
  world.save.maxFloor = 5;
  world.coins = [{ x: 0, y: 0, age: 0, gold: 4 }];
  world.drops = [dropAt(10, 0)];
  const result = world.travelToFloor(2);
  assert(result.ok);
  assert.equal(world.coins.length, 0);
  assert.equal(world.drops.length, 0);
});

test('drops rest off the character in a fan and only items keep their pitch', () => {
  const hero = { x: 200, y: 400 }, rx = 34, ry = 74;
  // A kill lands on the character: the drop comes back out along its own line, never across it.
  const [alone] = lootRestSpots(hero.x, hero.y, [{ x: hero.x + 3, y: hero.y - 4 }], [], rx, ry, LOOT_GAP);
  assert(Math.abs(alone.x - hero.x) > 1, 'the spot is pushed off the character art');
  assert(alone.y < hero.y, 'and stays above the feet');
  assert(Math.hypot((alone.x - hero.x) / rx, (alone.y - hero.y) / ry) >= 1, 'outside the keep-out ellipse');
  // Nine items of one heap keep the icon pitch apart.
  const taken = [];
  const spots = lootRestSpots(hero.x, hero.y, Array.from({ length: 9 }, (_, index) => ({ x: hero.x + (index % 3 - 1) * 6, y: hero.y - 22 - (index % 2) * 4 })), taken, rx, ry, LOOT_GAP);
  for (let a = 0; a < spots.length; a++) for (let b = a + 1; b < spots.length; b++) {
    assert(Math.hypot(spots[a].x - spots[b].x, spots[a].y - spots[b].y) >= LOOT_GAP - 1e-6, 'two items never share a spot');
  }
  for (const spot of spots) {
    assert(Math.hypot((spot.x - hero.x) / rx, (spot.y - hero.y) / ry) >= 1, 'no item rests on the character');
    assert(Math.abs(Math.atan2(spot.x - hero.x, hero.y - spot.y)) <= LOOT_FAN + 1e-6, 'inside the fan');
  }
});

test('coins clump together and an item may fall on a coin', () => {
  const hero = { x: 200, y: 400 }, rx = 34, ry = 74, taken = [];
  const coins = lootRestSpots(hero.x, hero.y, [{ x: 120, y: 300, gold: true }, { x: 122, y: 302, gold: true }, { x: 121, y: 301, gold: true }], taken, rx, ry, LOOT_GAP);
  // A heap stays around the kill point instead of being spread an icon apart.
  for (let a = 1; a < coins.length; a++) assert(Math.hypot(coins[a].x - coins[0].x, coins[a].y - coins[0].y) < LOOT_GAP, 'coins stay bunched');
  for (let a = 0; a < coins.length; a++) for (let b = a + 1; b < coins.length; b++) {
    assert(Math.hypot(coins[a].x - coins[b].x, coins[a].y - coins[b].y) > 1, 'two coins never sit on the very same pixel');
  }
  // An item on the pile is not pushed away by the coins, and it paints above them.
  const [item] = lootRestSpots(hero.x, hero.y, [{ x: coins[0].x, y: coins[0].y }], taken, rx, ry, LOOT_GAP);
  assert(Math.hypot(item.x - coins[0].x, item.y - coins[0].y) < 1e-6, 'an item may share a point with a coin');
  assert(LOOT_DEPTH.gold < LOOT_DEPTH.item, 'items always paint over coins');
});

test('the resting spot stays within reach of the character', () => {
  const hero = { x: 200, y: 400 }, reach = 120;
  const [spot] = lootRestSpots(hero.x, hero.y, [{ x: hero.x, y: hero.y - 900 }], [], 34, 74, LOOT_GAP, reach);
  assert(Math.hypot(spot.x - hero.x, spot.y - hero.y) <= reach + 1e-6);
});

test('a field drop never turns while it falls, rests, or is pulled in', () => {
  const source = readFileSync(new URL('../src/game/render/drops.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /body\.rotation|spinV|spin\b/, 'the drop art keeps its upright angle from the kill to the bag');
  // The toss itself is untouched: a gravity bounce, a rest beat, then the 1.5 second pull.
  assert.match(source, /BOUNCE_GRAVITY/);
  assert.match(source, /LOOT_REST_SECONDS/);
});

test('the field renderer keeps loot in its own layers with coins under items', () => {
  const source = readFileSync(new URL('../src/game/render/drops.ts', import.meta.url), 'utf8');
  const scene = readFileSync(new URL('../src/game/render.ts', import.meta.url), 'utf8');
  assert.match(source, /body\.zIndex = info\.gold \? LOOT_DEPTH\.gold : LOOT_DEPTH\.item/);
  assert.match(source, /lootBack/, 'drops above the character feet are drawn behind him');
  assert.match(source, /lootFront/, 'drops below the feet are drawn in front of him');
  assert.match(scene, /sortableChildren = true/);
  assert.match(scene, /lootRestSpots|LOOT_DEPTH|drawLoot/, 'the field scene draws ground loot');
  assert.doesNotMatch(source, /'#ff|linear-gradient|dungeon-loot/, 'the field loot is drawn by the renderer, not pasted DOM');
});

test('a field drop makes one small hop and lands with a single soft tap', () => {  const source = readFileSync(new URL('../src/game/render/drops.ts', import.meta.url), 'utf8');
  const num = name => Number(source.match(new RegExp(`${name} = ([0-9.]+)`))[1]);
  const gravity = num('BOUNCE_GRAVITY'), peak = num('TOSS_PEAK'), vary = num('TOSS_VARY'), rebound = num('TOSS_REBOUND'), settle = num('TOSS_SETTLE');
  // A light toss on a 34px icon: a hop of a few pixels, then one tap of about a pixel.
  assert(peak > 2 && peak <= 8, 'the first arc is a hop, not a lob');
  assert(vary <= .25 && rebound <= .4, 'the hop stays even and the tap stays soft');
  // Walk the renderer's own numbers frame by frame, at the highest and the lowest variant.
  const fall = scale => {
    let h = 2, vh = Math.sqrt(2 * gravity * peak) * scale, apex = 2, tap = 0, bounces = 0, tapped = false, frames = 0;
    while (frames++ < 240) {
      h += vh / 60; vh -= gravity / 60; apex = Math.max(apex, h);
      if (h <= 0) {
        h = 0;
        if (!tapped && vh < -settle) { tapped = true; vh = -vh * rebound; bounces++; }
        else break;
      }
      if (bounces) tap = Math.max(tap, h);
    }
    return { apex, tap, bounces, seconds: frames / 60 };
  };
  for (const scale of [1 + vary, 1 - vary]) {
    const { apex, tap, bounces, seconds } = fall(scale);
    assert(apex <= 11, `the first arc stays a small hop (got ${apex.toFixed(1)}px)`);
    assert.equal(bounces, 1, 'the drop lands with one tap, not a series of bounces');
    assert(tap <= 2, `the tap after landing is about a pixel (got ${tap.toFixed(2)})`);
    assert(seconds < .6, 'the whole fall is over in well under a second');
  }
});

test('a coin drop is a small heap of bright flat coins lying on the floor', () => {
  assert(GOLD_PILE.length >= 2 && GOLD_PILE.length <= 3, 'two or three coins make the heap');
  for (const coin of GOLD_PILE) {
    // A coin squeezed under 15px is mostly resampling, so the sizes stay big enough to read sharp.
    assert(coin.size >= 15 && coin.size <= 16, `each coin is 15~16px wide (got ${coin.size})`);
    // 작업 196: the coins lie down at half their width instead of standing or gently leaning.
    assert.equal(coin.squash, .5, `each coin is squashed to .50 so it lies on the floor (got ${coin.squash})`);
    // A coin may sit a pixel into the floor (the big left coin does), never float above it.
    assert(coin.dy <= 2 && coin.dy >= -14, `no coin floats far above the heap (got ${coin.dy})`);
    // The tone-down is gone: no coin is multiplied darker than the art, only warmed a touch.
    const red = (coin.tint >> 16) & 255, green = (coin.tint >> 8) & 255, blue = coin.tint & 255;
    assert(red >= 250 && green >= 225 && blue >= 190, `each coin keeps the art's bright gold (got #${coin.tint.toString(16)})`);
  }
  const source = readFileSync(new URL('../src/game/render/drops.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/styles/dungeon.css', import.meta.url), 'utf8');
  assert.match(source, /for \(const coin of GOLD_PILE\)/, 'the field draws every coin of the heap');
  assert.match(source, /sprite\.height = chip \? goldCoinChipHeight\(coin\)/, 'the squash is what lays the coin down');
  assert.match(source, /sprite\.tint = coin.tint/, 'and the warm tint is applied');
  // The heap keeps the original coin art: no second heap image is introduced (작업 195, 196).
  assert.match(source, /sheetTexture\(view, '\/assets\/icons\/gold-coin\.png', true\)/, 'the heap still draws the coin art');
  assert.doesNotMatch(source, /gold-pile\.png/, 'no second heap asset is loaded');
  // Shrinking 256px art to a 20-something-pixel coin needs a mip chain, or it shimmers.
  assert.match(source, /data: \{ scaleMode: 'linear', autoGenerateMipmaps: true \}/, 'the coin texture is loaded with mipmaps');
  assert.match(source, /texture\.source\.mipmapFilter = 'linear'/, 'and sampled through a linear mip filter');
  assert.doesNotMatch(source, /COIN_SIZE/, 'the single upright 30px coin is gone');
  assert.doesNotMatch(source, /coin\.width = COIN_SIZE/, 'nothing draws the old one-coin icon');
  assert(GOLD_PILE_RX * 2 <= 48, 'the heap keeps the footprint of a drop on the floor');
  // 작업 197: the heap sits clearly under the 34px item icon it fell beside.
  const left = Math.min(...GOLD_PILE.map(coin => coin.dx - coin.size / 2)), right = Math.max(...GOLD_PILE.map(coin => coin.dx + coin.size / 2));
  assert(right - left >= 28 && right - left <= 30, `the whole heap is about 29~30px wide (got ${right - left})`);
  assert(right - left < 34, 'a coin heap is smaller than a dropped item');
  assert(GOLD_PILE_RX * 2 <= 34 && GOLD_PILE_RY * 2 <= 8, 'the shadow follows the smaller heap');
  // The dark grade that made a heap sink into the floor is gone from both screens (작업 196).
  assert.doesNotMatch(css, /saturate\(\.85\) brightness\(\.88\)/, 'the dungeon no longer dulls the heap');
  assert.doesNotMatch(css, /is-gold \.dungeon-loot-body\{filter/, 'and applies no colour grade to the heap body');
});

test('every coin gets its own 1px warm brown boundary and 2px thickness, baked once for both screens', () => {
  // The boundary is the warm brown the user picked ("오른쪽"), thin enough to read as a coin edge
  // rather than a grade ring, and the thickness under it is a darker gold.
  assert.equal(GOLD_PILE_EDGE, 0x482e0c, 'the boundary is the warm brown #482e0c');
  assert.equal(GOLD_PILE_RIM, 0x8a5a12, 'the thickness under a coin is a darker gold');
  assert.equal(GOLD_COIN_EDGE, 1, 'the boundary is one pixel');
  assert.equal(GOLD_COIN_RIM, 2, 'the thickness is two pixels');
  assert.equal(GOLD_PILE_BRIGHTNESS, 1.1, 'the art is lifted 10% out of the dark floor');
  assert.equal(GOLD_PILE_CONTRAST, 1.08, 'and its contrast raised 8%');
  for (const coin of GOLD_PILE) {
    // The chip's box is the coin plus the thickness under it plus one pixel on every side.
    assert.equal(goldCoinChipWidth(coin), coin.size + 2);
    assert.equal(goldCoinChipHeight(coin), goldCoinHeight(coin) + GOLD_COIN_RIM + 2);
    assert.equal(goldCoinHeight(coin), Math.round(coin.size * coin.squash));
  }
  assert.equal(GOLD_COIN_CHIP_DROP, GOLD_COIN_EDGE + GOLD_COIN_RIM);
  const art = readFileSync(new URL('../src/game/render/goldCoinArt.ts', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/game/render/drops.ts', import.meta.url), 'utf8');
  const dungeon = readFileSync(new URL('../src/ui/dungeonField.ts', import.meta.url), 'utf8');
  // The boundary follows the art's own silhouette, one pixel out, and the thickness is that
  // silhouette set two pixels lower — no ellipse, no glow, no second picture.
  assert.match(art, /const EDGE_RING/, 'the boundary is the silhouette widened one pixel');
  assert.match(art, /globalCompositeOperation = 'source-in'/, 'and painted in the flat edge colour');
  assert.match(art, /GOLD_PILE_BRIGHTNESS/, 'the art is lifted before it is drawn');
  assert.match(art, /paintGoldCoinChip/, 'one painter bakes the chip');
  // Both screens draw that same chip: Pixi texture in the field, data URL in the dungeon.
  assert.match(source, /goldCoinChipTexture\(texture, coin\)/, 'the field draws the baked chip');
  assert.match(dungeon, /goldCoinChipUrl\(coin\)/, 'the dungeon draws the same chip');
  assert.match(dungeon, /warmGoldCoinChips\(\)/, 'and bakes it when the arena opens');
  assert.match(dungeon, /art\.src=chip\?\?'\/assets\/icons\/gold-coin\.png'/, 'the plain coin stays the fallback');
});

test('a field coin always lies behind the hero, the monsters and every item', () => {
  const source = readFileSync(new URL('../src/game/render/drops.ts', import.meta.url), 'utf8');
  const scene = readFileSync(new URL('../src/game/render.ts', import.meta.url), 'utf8');
  // A coin goes to the behind layer when it is created and stays there whenever it falls.
  assert.match(source, /info\.gold \|\| spot\.y < heroY - 6 \? this\.lootBack : this\.lootFront/, 'a new coin is put behind the actors');
  assert.match(source, /info\.gold \|\| landing\.y < heroY - 6 \? this\.lootBack : this\.lootFront/, 'a landed coin stays behind the actors');
  assert.match(source, /body\.zIndex = info\.gold \? LOOT_DEPTH\.gold : LOOT_DEPTH\.item/, 'and under every item of its layer');
  // Paint order of the scene: loot behind -> actors (hero and monsters) -> loot in front.
  const order = scene.match(/app\.stage\.addChild\(([^)]*)\)/)[1].split(',').map(part => part.trim());
  const behind = order.indexOf('this.lootBack'), actors = order.indexOf('this.actors'), front = order.indexOf('this.lootFront');
  assert(behind >= 0 && actors > behind && front > actors, `loot behind (${behind}) must precede the actors (${actors}) and loot in front (${front})`);
});

test('a boss kill bursts its gold out in ten heaps and leaves only the chance item', () => {
  assert.equal(BOSS_GOLD_PILES, 10);
  // The main field's boss drops gold only: the dungeon's five-item haul stays in the dungeon (작업 195).
  assert.equal(BOSS_ITEM_DROPS, 5);
  const world = quiet();
  const floor = world.save.floor, gold = 70 * floor, paid = world.save.gold;
  const boss = { x: 60, y: 20, hp: 0, maxHp: 10, boss: true, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  const rolls = [0.999, 0.999];
  const random = Math.random;
  Math.random = () => rolls.length ? rolls.shift() : random();
  try { world.kill(boss); } finally { Math.random = random; }
  assert.equal(world.save.gold, paid + gold, 'the boss still pays its gold exactly once');
  assert.equal(world.coins.length, BOSS_GOLD_PILES, 'the gold hits the floor in ten heaps');
  assert.equal(world.coins.reduce((sum, coin) => sum + coin.gold, 0), gold, 'the ten heaps add up to the gold paid');
  assert.equal(world.drops.length, 0, 'no item is handed out beyond the roll — the boss leaves gold alone');
  assert.equal(new Set(world.coins.map(coin => `${Math.round(coin.x)},${Math.round(coin.y)}`)).size, BOSS_GOLD_PILES, 'no two heaps share a pixel');
  // Every heap remembers the body it was thrown from, so the field can fly it out on its own arc.
  for (const coin of world.coins) assert.deepEqual(coin.from, { x: boss.x, y: boss.y }, 'a heap was thrown from the body');
  assert.equal(new Set(world.coins.map(coin => Math.round(Math.hypot(coin.x - boss.x, coin.y - boss.y)))).size >= 7, true, 'the heaps land at many different distances');
});

test('a boss scatters its ten heaps wide around the body, not into one pile', () => {
  const heaps = Array.from({ length: BOSS_GOLD_PILES }, (_, index) => bossGoldSpot(0, 0, index));
  const radii = heaps.map(heap => Math.hypot(heap.x, heap.y));
  // 작업 196: the old rings of 22 and 34 pixels bunched the shower into one spot. The heaps now leave
  // on an inner ring around the body and an outer one well clear of it.
  assert(Math.min(...radii) >= 35, `the closest heap is off the body (got ${Math.min(...radii).toFixed(1)}px)`);
  assert(Math.max(...radii) >= 80, `the furthest heap clears the body widely (got ${Math.max(...radii).toFixed(1)}px)`);
  assert(Math.max(...radii) <= 110, 'yet no heap is thrown out of the arena');
  const spread = (list) => list.filter(radius => radius >= 60).length;
  assert(spread(radii) >= 4, 'at least four heaps take the outer ring');
  // All ten around the body, not down one side: every direction has a heap inside ±45° of it.
  const directions = heaps.map(heap => Math.atan2(heap.y, heap.x));
  for (let step = 0; step < 8; step++) {
    const middle = -Math.PI + step * Math.PI / 4;
    assert(directions.some(angle => Math.abs(Math.atan2(Math.sin(angle - middle), Math.cos(angle - middle))) <= Math.PI / 4), `a heap is thrown towards ${Math.round(middle * 180 / Math.PI)}°`);
  }
  // And they stay apart from each other, so ten heaps never merge into one.
  let closest = Infinity;
  for (let a = 0; a < heaps.length; a++) for (let b = a + 1; b < heaps.length; b++) {
    closest = Math.min(closest, Math.hypot(heaps[a].x - heaps[b].x, heaps[a].y - heaps[b].y));
  }
  assert(closest >= 20, `no two heaps land on top of each other (closest ${closest.toFixed(1)}px)`);
  // The layout is fixed, not random: the field, the dungeon and this test all see the same burst.
  assert.deepEqual(bossGoldSpot(12, -4, 3), { x: 12 + heaps[3].x, y: -4 + heaps[3].y });
});

test('a boss heap flies out of the body on a parabola, while an ordinary drop keeps its little hop', () => {
  const source = readFileSync(new URL('../src/game/render/drops.ts', import.meta.url), 'utf8');
  const dungeon = readFileSync(new URL('../src/ui/dungeonField.ts', import.meta.url), 'utf8');
  // A drop thrown further than the little hop is a burst: it gets a longer flight and a higher arc.
  // Whitespace differs between the two files, so compare them with it stripped.
  const packed = text => text.replace(/\s+/g, '');
  for (const body of [source, dungeon]) {
    const code = packed(body);
    assert(code.includes('burst:true,flight:Math.min(.95,.3+travel/420),peak:Math.min(30,8+travel*.2)'), 'a burst heap gets its own flight and apex');
    assert(code.includes('burst:false,flight:.45,peak:'), 'every other drop keeps the small hop');
    assert.match(code, /4\*(view|entry)\.peak\*(view|entry)\.drift\*\(1-(view|entry)\.drift\)/, 'the heap follows a real parabola');
  }
  // The field starts a burst at the body the coin remembers, and the dungeon at the boss's own point.
  assert.match(source, /'from' in entry \? entry\.from : undefined/, 'the field throws from the body');
  assert.match(dungeon, /loot\.kind==='gold'\?loot\.from:undefined/, 'the dungeon throws from the boss');
});

test('a boss keeps the ordinary chance roll for items, never five at once', () => {
  // A lucky boss kill still drops what the field drop table says it drops: at most one piece of
  // equipment and one skill book, the boss rates, from the same single roll a normal kill makes.
  const hunt = () => {
    const world = quiet();
    const boss = { x: 60, y: 20, hp: 0, maxHp: 10, boss: true, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
    const random = Math.random;
    Math.random = () => 0;
    try { world.kill(boss); } finally { Math.random = random; }
    return world;
  };
  const world = hunt();
  assert(world.drops.length <= 2, 'a boss leaves at most the two chance drops');
  assert(world.drops.length >= 1, 'a certain roll still drops an item');
  for (const drop of world.drops) assert(drop.item.name.length > 0 && drop.item.id, 'each item is a real roll');
  const source = readFileSync(new URL('../src/game/world.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /bossItems\(/, 'the field no longer hands a boss five random items');
  assert.doesNotMatch(source, /BOSS_ITEM_DROPS/, 'and never counts them');
  // The field's own rolls are the ones a boss makes, so a boss uses the boss rate the table already has.
  assert.match(source, /equipmentDropChance\(this\.save\.floor, boss\)/, 'equipment uses the kill’s own rate');
  assert.match(source, /rollItem\(this\.save\.floor, guaranteed, boss\)/, 'and the item is rolled for a boss too');
  assert.match(source, /skillBookDropChance\(this\.save\.floor, boss\)/, 'the skill book too');
});

test('a normal kill still leaves one coin and only the chance item', () => {
  const world = quiet();
  const paid = world.save.gold;
  const enemy = { x: 30, y: 10, hp: 0, maxHp: 10, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.kill(enemy);
  assert.equal(world.coins.length, 1, 'a normal kill keeps its single coin');
  assert.equal(world.save.gold, paid + 3 + world.save.floor);
  assert(world.drops.length <= 2, 'and at most the two chance rolls');
});
