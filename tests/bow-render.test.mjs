import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { Container, Sprite, Texture } from 'pixi.js';
import './ts-loader.mjs';

const {
  BOW_COUNT, BOW_POSES, BOW_GRIP, bowIndexFor, bowPartPath, bowPartPaths, bowPose, bowPoseKey,
  usesBowlessBody, bowlessBodyPath, bowlessBodyPaths, bowTierCacheLimit
} = await import('../src/game/render/bows.ts');
const { GameView, renderAssetPaths } = await import('../src/game/render.ts');
const { drawHero } = await import('../src/game/render/entities.ts');
const { freshSave } = await import('../src/game/store.ts');
const { baseItems, bowBases } = await import('../src/game/items.ts');
const { equipmentPortraitPlan } = await import('../src/ui/equipmentPortrait.ts');

const bowItem = name => ({ id: name, slot: 'weapon', name, rarity: 'rare', stats: { attack: 10 } });
const fileOf = path => new URL(`../public${path}`, import.meta.url);

/** 팔레트(tRNS)·RGBA PNG의 알파를 읽는다(weapon-render.test.mjs와 같은 디코더). */
function decodeAlpha(image) {
  let offset = 8, width = 0, height = 0, colorType = 0, bitDepth = 0, interlace = 0;
  let palette = null, transparency = null;
  const chunks = [];
  while (offset + 8 <= image.length) {
    const length = image.readUInt32BE(offset);
    const type = image.toString('ascii', offset + 4, offset + 8);
    const data = image.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') transparency = data;
    else if (type === 'IDAT') chunks.push(data);
    else if (type === 'IEND') break;
    offset += length + 12;
  }
  assert(palette || colorType === 6, `지원하지 않는 PNG 색 형식: ${colorType}`);
  assert.equal(bitDepth, 8);
  assert.equal(interlace, 0);
  const channels = colorType === 3 ? 1 : 4;
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const above = y ? pixels.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? out[i - channels] : 0;
      const up = above[i];
      const upLeft = i >= channels ? above[i - channels] : 0;
      let value = line[i];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      out[i] = value & 0xff;
    }
  }
  const alpha = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < alpha.length; i += 1, p += channels) {
    if (colorType === 3) alpha[i] = transparency && pixels[p] < transparency.length ? transparency[pixels[p]] : 255;
    else alpha[i] = pixels[p + 3];
  }
  return { width, height, alpha };
}

function texture() {
  const canvas = {
    width: 362, height: 362,
    getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) })
  };
  return new Texture({ source: new (Object.getPrototypeOf(Texture.EMPTY.source).constructor)({ resource: canvas }) });
}

/** `drawHero` 가 쓰는 만큼만 갖춘 궁수 뷰. 본체 시트·활 파츠 캐시는 실제 GameView 구현을 붙인다. */
function view() {
  const layer = new Container();
  const hero = new Sprite(texture());
  hero.anchor.set(.5, .97);
  layer.addChild(hero);
  const archer = () => texture();
  const frames = n => Array.from({ length: n }, () => texture());
  const game = {
    hero, heroLayer: layer, heroGear: new Map(), gearTextures: new Map(), gearLoading: new Set(),
    helmetTextures: new Map(), heroHelmet: undefined,
    lastHeroWorld: { x: 0, y: 0 }, heroWalkDistance: 0,
    textures: { archerMale: archer(), archerFemale: archer(), pilotMale: archer(), pilotFemale: archer() },
    animations: {
      archerMaleWalk: frames(8), archerFemaleWalk: frames(8),
      archerMaleAttack: frames(4), archerFemaleAttack: frames(4),
      pilotMaleWalk: frames(8), pilotFemaleWalk: frames(8),
      pilotMaleAttack: frames(4), pilotFemaleAttack: frames(4)
    },
    app: { screen: { height: 800 } },
    ground: { ellipse: () => ({ fill() {} }) },
    glow: { circle: () => ({ fill() {} }) },
    armorSheets: new Map(), armorFrames: new Map(), armorLoading: new Set(), armorTierOrder: [], lastBodyTier: '',
    weaponSheets: new Map(), weaponLoading: new Set(), weaponTierOrder: [], lastWeaponTier: -1, heroWeapon: undefined,
    bowSheets: new Map(), bowLoading: new Set(), bowTierOrder: [], lastBowTier: -1, heroBow: undefined
  };
  game.armorFrame = GameView.prototype.armorFrame.bind(game);
  game.bodySheetFrame = GameView.prototype.bodySheetFrame.bind(game);
  game.swordlessBodyFrame = GameView.prototype.swordlessBodyFrame.bind(game);
  game.bowBodyFrame = GameView.prototype.bowBodyFrame.bind(game);
  game.weaponPart = GameView.prototype.weaponPart.bind(game);
  game.bowPart = GameView.prototype.bowPart.bind(game);
  game.loadArmorSheet = () => {};
  game.loadWeaponPart = () => {};
  game.loadBowPart = () => {};
  game.prefetchBody = function prefetch() { this.bodyPrefetchCalls.push([...arguments]); };
  game.prefetchWeapon = function prefetch(index) { this.weaponPrefetchCalls.push(index); };
  game.prefetchBow = function prefetch(index, gender) { this.bowPrefetchCalls.push([index, gender]); };
  game.bodyPrefetchCalls = [];
  game.weaponPrefetchCalls = [];
  game.bowPrefetchCalls = [];
  return game;
}

function world(save) {
  return {
    save,
    player: { x: 0, y: 0, facingSide: 1, facing: 0, hit: 0, berserk: 0, berserkLevel: 0 },
    activeMove: { x: 0, y: 0 }, attackPose: 0, effects: []
  };
}

function archerSave(gender = 'male', bow) {
  const save = freshSave(gender, 'archer');
  save.knockback = undefined;
  if (bow) save.equipment.weapon = bowItem(bow);
  return save;
}

test('활 10종 이름이 모두 기본형 인덱스 0~9 로 매핑되고, 1~9번만 파츠를 쓴다', () => {
  assert.equal(bowBases.length, BOW_COUNT);
  for (let index = 0; index < BOW_COUNT; index++) {
    const save = archerSave('male', bowBases[index]);
    assert.equal(bowIndexFor(save), index, `${bowBases[index]} → ${index}`);
    assert.equal(usesBowlessBody(save), index >= 1, `${bowBases[index]} 는 ${index >= 1 ? 'nobow 시트' : '기본 시트'}`);
    // 접두사·강화 수식어가 붙은 드랍 이름도 같은 티어로 읽는다.
    const dropped = archerSave('female', `황혼의 ${bowBases[index]}`);
    assert.equal(bowIndexFor(dropped), index, `황혼의 ${bowBases[index]}`);
  }
  // 활이 아니면 0번 취급(전사 대검·미착용).
  assert.equal(bowIndexFor(freshSave('male')), 0);
  const sword = freshSave('male');
  sword.equipment.weapon = bowItem(baseItems.weapon[5]);
  assert.equal(bowIndexFor(sword), 0, '전사 대검은 활 티어가 아니다');
});

test('활 파츠 9장이 362px 셀 규격으로 있고 그립 자리에 활대가 있다', () => {
  for (let index = 1; index < BOW_COUNT; index++) {
    const path = bowPartPath(index);
    const file = fileOf(path);
    assert(existsSync(file), `파츠 파일: ${path}`);
    const { width, height, alpha } = decodeAlpha(readFileSync(file));
    assert.equal(width, 362, `${path} 셀 폭`);
    assert.equal(height, 362, `${path} 셀 높이`);
    let opaque = 0;
    for (const value of alpha) if (value > 128) opaque += 1;
    assert(opaque > 1200, `${path} 파츠가 너무 비었습니다: ${opaque}px`);
    // 그립 자리 자체는 손이 본체에 그려지므로 비어 있다. 손 위·아래로 활대가 이어지는지만 본다.
    let near = 0;
    for (let y = Math.round(BOW_GRIP.y) - 40; y <= BOW_GRIP.y + 40; y++) {
      for (let x = Math.round(BOW_GRIP.x) - 40; x <= BOW_GRIP.x + 40; x++) {
        if (alpha[y * width + x] > 128) near += 1;
      }
    }
    assert(near > 120, `${path} 그립 주변에 활대가 없습니다: ${near}px`);
    assert(statSync(file).size < 200 * 1024, `${path} 용량`);
  }
  assert.equal(bowPartPath(0), undefined, '0번(사냥꾼의 활)은 본체 시트에 그려져 있다');
  assert.equal(bowPartPath(10), undefined);
  assert.deepEqual(bowPartPaths(4), [bowPartPath(4)]);
});

test('기본 활대를 지운 본체 시트 6장이 셀 규격대로 있고, 서기에서 활대가 실제로 지워졌다', () => {
  const sizes = { idle: [362, 362], walk: [1448, 362], attack: [1448, 362] };
  for (const gender of ['male', 'female']) {
    assert.equal(bowlessBodyPaths(gender).length, 3, '서기·걷기·사격 3장(머리 없는 판은 없다)');
    for (const motion of ['idle', 'walk', 'attack']) {
      const path = bowlessBodyPath(gender, motion);
      const file = fileOf(path);
      assert(existsSync(file), `본체 시트: ${path}`);
      const { width, height } = decodeAlpha(readFileSync(file));
      assert.deepEqual([width, height], sizes[motion], `${path} 규격`);
    }
  }
  // 서기 셀에서 기본 활대 영역의 불투명 픽셀이 크게 줄었는지 본다(활이 허공으로 뻗은 자리).
  const original = decodeAlpha(readFileSync(fileOf('/assets/pilot-25d/archer_male_idle_v1.png')));
  const stripped = decodeAlpha(readFileSync(fileOf(bowlessBodyPath('male', 'idle'))));
  const bow = { x0: 240, x1: 320, y0: 90, y1: 170 };
  const count = art => {
    let n = 0;
    for (let y = bow.y0; y <= bow.y1; y++) {
      for (let x = bow.x0; x <= bow.x1; x++) if (art.alpha[y * 362 + x] > 128) n += 1;
    }
    return n;
  };
  const before = count(original), after = count(stripped);
  assert(before > 300, `기본 활 영역 픽셀: ${before}`);
  assert(after < before * .35, `기본 활대가 지워지지 않았습니다: ${before} → ${after}`);
  // 손(그립)은 살아 있어야 한다 — 손가락이 지워지면 활을 쥔 모습이 사라진다.
  const hand = { x0: 196, x1: 232, y0: 176, y1: 210 };
  let handBefore = 0, handAfter = 0;
  for (let y = hand.y0; y <= hand.y1; y++) {
    for (let x = hand.x0; x <= hand.x1; x++) {
      if (original.alpha[y * 362 + x] > 128) handBefore += 1;
      if (stripped.alpha[y * 362 + x] > 128) handAfter += 1;
    }
  }
  assert(handBefore > 200, `손 영역: ${handBefore}`);
  assert(handAfter > handBefore * .8, `손이 지워졌습니다: ${handBefore} → ${handAfter}`);
});

test('활 자세 표는 남녀 × 9자세고, 걷기·사격 프레임은 4프레임 안으로 접힌다', () => {
  for (const gender of ['male', 'female']) {
    const table = BOW_POSES[gender];
    assert.deepEqual(Object.keys(table).sort(),
      ['attack0', 'attack1', 'attack2', 'attack3', 'idle0', 'walk0', 'walk1', 'walk2', 'walk3']);
    if (gender === 'male') assert.equal(table.idle0.rot, 0, '남성 서기는 파츠 자세 그대로');
    for (const pose of Object.values(table)) {
      assert(Number.isFinite(pose.x) && Number.isFinite(pose.y) && Number.isFinite(pose.rot));
      assert(pose.x > 0 && pose.x < 362 && pose.y > 0 && pose.y < 362);
    }
    // 사격은 활을 세우므로 서기 대비 크게 돈다(대검과 달리 ±40° 이상).
    assert(Math.abs(table.attack1.rot) > 30, `${gender} 사격 회전각`);
  }
  assert.equal(bowPoseKey('idle', 5), 'idle0');
  assert.equal(bowPoseKey('walk', 6), 'walk2');
  assert.equal(bowPoseKey('attack', 3), 'attack3');
  assert.equal(bowPoseKey('attack', 7), 'attack3');
  assert.equal(bowPoseKey('walk', -1), 'walk3');
  assert.deepEqual(bowPose('male', 'walk', 6), BOW_POSES.male.walk2);
});

test('활 파츠·nobow 시트는 부팅 프리로드에 넣지 않고 티어별로만 받는다', () => {
  for (let index = 1; index < BOW_COUNT; index++) {
    assert(!renderAssetPaths.includes(bowPartPath(index)), `${bowPartPath(index)} 가 부팅 프리로드에 들어감`);
  }
  for (const gender of ['male', 'female']) {
    for (const path of bowlessBodyPaths(gender)) {
      assert(!renderAssetPaths.includes(path), `${path} 가 부팅 프리로드에 들어감`);
      assert(!renderAssetPaths.includes(`${path}?v=6`), `${path}?v=6 가 부팅 프리로드에 들어감`);
    }
  }
  assert.equal(bowTierCacheLimit, 3);
});

test('궁수가 1번 이상 활을 차면 필드가 nobow 시트 위에 활 파츠를 얹는다', () => {
  const save = archerSave('male', '룬 각궁');
  const game = view();
  const running = world(save);
  drawHero.call(game, running, 100, 100, 0);
  assert.equal(game.hero.texture, game.textures.archerMale, '시트 로딩 전에는 기본 시트로 폴백');
  assert.equal(game.heroBow, undefined, '파츠 로딩 전에는 파츠 스프라이트를 만들지 않는다');
  assert.deepEqual(game.bowPrefetchCalls, [[5, 'male']], '룬 각궁은 5번 — 파츠와 nobow 시트를 미리 받는다');

  const stripped = texture();
  game.armorSheets.set(bowlessBodyPath('male', 'idle'), stripped);
  game.bowSheets.set(bowPartPath(5), texture());
  drawHero.call(game, running, 100, 100, .1);
  assert.equal(game.hero.texture, stripped, 'nobow 서기 시트로 갈아 끼운다');
  assert(game.heroBow, '활 파츠 스프라이트를 만든다');
  const pose = BOW_POSES.male.idle0;
  const part = game.heroBow.texture;
  assert.equal(game.heroBow.anchor.x, BOW_GRIP.x / part.width);
  assert.equal(game.heroBow.anchor.y, BOW_GRIP.y / part.height);
  assert(Math.abs(game.heroBow.rotation - pose.rot * Math.PI / 180) < 1e-9);
  assert.equal(game.heroWeapon, undefined, '전사 대검 파츠는 만들지 않는다');
  assert.equal(game.heroBow.visible, true);
});

test('걷기·사격 프레임은 그 자세의 그립 좌표·회전각으로 파츠를 옮긴다', () => {
  const save = archerSave('female', '폭풍의 성궁');
  const game = view();
  const running = world(save);
  game.bowSheets.set(bowPartPath(8), texture());
  for (const motion of ['walk', 'attack']) {
    for (let frame = 0; frame < 4; frame += 1) {
      game.armorSheets.set(bowlessBodyPath('female', motion), texture());
      running.activeMove = motion === 'walk' ? { x: 1, y: 0 } : { x: 0, y: 0 };
      game.heroWalkDistance = motion === 'walk' ? frame * 12 : 0;
      running.attackPose = motion === 'attack' ? .32 * (1 - (frame + .5) / 4) : 0;
      drawHero.call(game, running, 100, 100, .1 + frame * .1);
      const pose = bowPose('female', motion, frame);
      assert(Math.abs(game.heroBow.rotation - pose.rot * Math.PI / 180) < 1e-9, `${motion}${frame} 회전각`);
      assert.equal(game.heroBow.visible, true);
    }
  }
});

test('0번(사냥꾼의 활)은 기본 시트를 그대로 쓰고 파츠를 숨긴다', () => {
  const save = archerSave('male', '사냥꾼의 활');
  const game = view();
  const running = world(save);
  game.bowSheets.set(bowPartPath(3), texture());
  drawHero.call(game, running, 100, 100, 0);
  assert.equal(game.hero.texture, game.textures.archerMale);
  assert.equal(game.bowPrefetchCalls.length, 0, '0번은 파츠를 받지 않는다');
});

test('장비창 초상화도 nobow 시트 + 활 파츠를 쓴다', () => {
  const save = archerSave('female', '패왕의 신궁');
  const plan = equipmentPortraitPlan(save);
  assert.equal(plan.base, bowlessBodyPath('female', 'idle'));
  assert.equal(plan.bow?.path, bowPartPath(9));
  const pose = BOW_POSES.female.idle0;
  assert.equal(plan.bow?.x, pose.x);
  assert.equal(plan.bow?.y, pose.y);
  assert.equal(plan.bow?.rotation, pose.rot);
  assert.equal(plan.weapon, undefined, '전사 대검 파츠는 얹지 않는다');
  assert.equal(plan.helmet, undefined, '궁수는 투구 파츠를 쓰지 않는다');
  assert(plan.key.includes(bowPartPath(9)), `캐시 키에 활 파츠가 들어간다: ${plan.key}`);
});
