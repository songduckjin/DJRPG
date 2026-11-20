import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';
import './ts-loader.mjs';

const { mageRobeIndexFor, robeSheetPath, robeHeadlessSheetPath, robeSheetPaths, robeFrameIndex, robeSheetKey, ROBE_COUNT, robeMotionList, hasRobeSheet } =
  await import('../src/game/render/robes.ts');
const { GameView, robeTierCacheLimit, renderAssetPaths } = await import('../src/game/render.ts');
const { drawHero } = await import('../src/game/render/entities.ts');
const { freshSave } = await import('../src/game/store.ts');
const { baseItemIndex, baseItems } = await import('../src/game/items.ts');
const { equipmentPortraitPlan, equipmentFallbackPortrait } = await import('../src/ui/equipmentPortrait.ts');

const armorItem = name => ({ id: name, slot: 'armor', name, rarity: 'common', stats: {} });
const mageSave = gender => {
  const save = freshSave(gender);
  save.job = 'mage';
  return save;
};
const fileOf = path => new URL(`../public${path}`, import.meta.url);

/** 팔레트(tRNS) PNG의 알파를 읽는다(armor-render.test.mjs와 같은 디코더). */
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
  assert.equal(bitDepth, 8, 'art is 8-bit');
  assert.equal(interlace, 0, 'art is not interlaced');
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

const allSheets = [];
for (const gender of ['male', 'female']) {
  for (let index = 1; index < ROBE_COUNT; index++) {
    for (const motion of robeMotionList) {
      allSheets.push({ gender, index, motion, path: robeSheetPath(gender, index, motion) });
      allSheets.push({ gender, index, motion, path: robeHeadlessSheetPath(gender, index, motion) });
    }
  }
}

test('마법사 갑옷 10종이 로브 인덱스 0~9로 매핑되고 전사·미착용은 -1이다', () => {
  assert.equal(baseItems.armor.length, ROBE_COUNT);
  const save = mageSave('male');
  assert.equal(mageRobeIndexFor(save), -1, '갑옷이 없으면 -1(기준 시트)');
  baseItems.armor.forEach((name, index) => {
    save.equipment.armor = armorItem(name);
    assert.equal(mageRobeIndexFor(save), index, name);
    assert.equal(baseItemIndex(armorItem(name)), index);
  });
  save.equipment.armor = armorItem('없는 갑옷');
  assert.equal(mageRobeIndexFor(save), -1, '기본형이 아니면 기준 시트');
  const warrior = freshSave('male');
  warrior.equipment.armor = armorItem('흑요석 갑주');
  assert.equal(mageRobeIndexFor(warrior), -1, '전사에게는 로브를 쓰지 않는다');
});

test('로브 시트 경로는 1~9번에만 있고 0번은 기준 시트를 쓴다', () => {
  assert.equal(robeSheetPath('male', 1, 'idle'), '/assets/pilot-25d/robes/mage_male_robe_1_idle_v1.png?v=4');
  assert.equal(robeSheetPath('female', 9, 'attack'), '/assets/pilot-25d/robes/mage_female_robe_9_attack_v1.png?v=4');
  assert.equal(robeSheetPath('male', 0, 'idle'), undefined, '0번은 스타터 로브 기준 시트');
  assert.equal(robeSheetPath('male', 10, 'idle'), undefined);
  assert.equal(robeSheetPath('male', -1, 'idle'), undefined);
  assert.equal(robeSheetPath('male', 1.5, 'walk'), undefined);
  assert.equal(robeSheetPaths('female', 7).length, 6, '티어당 6장(서기·걷기·공격 × 전신·머리 없음)');
  assert.equal(robeHeadlessSheetPath('male', 1, 'idle'), '/assets/pilot-25d/robes/headless/mage_male_robe_1_idle_v1.png?v=4');
  assert.equal(robeHeadlessSheetPath('male', 0, 'idle'), undefined, '0번은 기준 시트');
  assert.equal(robeSheetPaths('female', 0).length, 0);
  assert.equal(hasRobeSheet(0), false);
  assert.equal(hasRobeSheet(1), true);
  assert.equal(robeSheetKey('male', 4, 'walk'), 'male:4:walk');
});

test('프레임 번호는 동작별로 4프레임 안으로 접힌다', () => {
  assert.equal(robeFrameIndex('idle', 5), 0);
  for (let frame = 0; frame < 8; frame++) assert.equal(robeFrameIndex('walk', frame), frame % 4);
  assert.equal(robeFrameIndex('attack', 5), 1);
  assert.equal(robeFrameIndex('attack', -1), 3);
  assert.equal(robeFrameIndex('walk', Number.NaN), 0);
});

test('로브 시트 108장(전신 54 + 머리 없음 54)이 규격(362px 셀·투명 팔레트)대로 존재한다', () => {
  assert.equal(allSheets.length, 108);
  for (const sheet of allSheets) {
    const file = fileOf(sheet.path);
    assert(existsSync(file), `${sheet.path} 파일이 없습니다`);
    const data = readFileSync(file);
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', sheet.path);
    const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
    assert.equal(height, 362, `${sheet.path} 높이`);
    assert.equal(width, sheet.motion === 'idle' ? 362 : 362 * 4, `${sheet.path} 폭`);
    const colorType = data[25];
    assert(colorType === 3 || colorType === 6, `${sheet.path} 알파 채널`);
    if (colorType === 3) assert(data.includes('tRNS'), `${sheet.path} 투명 팔레트`);
    assert(data.length < 200 * 1024, `${sheet.path} 용량 ${data.length}`);
  }
});

test('로브 시트는 비어 있지 않고 4프레임이 칸 경계를 넘지 않는다', () => {
  for (const sheet of allSheets) {
    const { width, height, alpha } = decodeAlpha(readFileSync(fileOf(sheet.path)));
    let painted = 0, clear = 0;
    for (const value of alpha) { if (value > 20) painted += 1; else clear += 1; }
    assert(painted > (sheet.path.includes('/headless/') ? 12000 : 20000), `${sheet.path}: 그림이 비었습니다(${painted}px)`);
    assert(clear > 20000, `${sheet.path}: 배경이 투명하지 않습니다`);
    if (sheet.motion === 'idle') continue;
    const cell = width / 4;
    for (let frame = 1; frame < 4; frame += 1) {
      for (const x of [frame * cell - 1, frame * cell]) {
        let crossed = 0;
        for (let y = 0; y < height; y += 1) if (alpha[y * width + x] > 0) crossed += 1;
        assert.equal(crossed, 0, `${sheet.path}: ${frame + 1}번째 칸 경계 x=${x}에 그림이 걸침`);
      }
    }
  }
});

const texture = (width = 362, height = 362) => new Texture({ source: new TextureSource({ width, height }) });
const robeSheetTexture = motion => texture(motion === 'idle' ? 362 : 1448, 362);

/** `drawHero` 가 쓰는 만큼만 갖춘 마법사 뷰. 로브 캐시·메서드는 실제 GameView 구현을 붙인다. */
function view() {
  const layer = new Container();
  const hero = new Sprite(Texture.EMPTY);
  hero.anchor.set(.5, .97);
  layer.addChild(hero);
  const game = {
    hero, heroLayer: layer, heroGear: new Map(), gearTextures: new Map(), gearLoading: new Set(),
    helmetTextures: new Map(), heroHelmet: undefined, heroWeapon: undefined,
    lastHeroWorld: { x: 0, y: 0 }, heroWalkDistance: 0,
    textures: { mageMale: texture(), mageFemale: texture() },
    animations: {
      mageMaleWalk: Array.from({ length: 8 }, () => texture()),
      mageFemaleWalk: Array.from({ length: 8 }, () => texture()),
      mageMaleAttack: Array.from({ length: 4 }, () => texture()),
      mageFemaleAttack: Array.from({ length: 4 }, () => texture())
    },
    app: { screen: { height: 800 } },
    ground: { ellipse: () => ({ fill() {} }) },
    glow: { circle: () => ({ fill() {} }) },
    armorSheets: new Map(), armorFrames: new Map(), armorLoading: new Set(), armorTierOrder: [], lastBodyTier: '',
    weaponSheets: new Map(), weaponLoading: new Set(), weaponTierOrder: [], lastWeaponTier: -1,
    robeTierOrder: [], lastRobeTier: '', robePrefetchCalls: []
  };
  game.armorFrame = GameView.prototype.armorFrame.bind(game);
  game.robeFrame = GameView.prototype.robeFrame.bind(game);
  game.bodySheetFrame = GameView.prototype.bodySheetFrame.bind(game);
  game.loadArmorSheet = () => {};
  game.prefetchBody = function prefetch() { this.bodyPrefetchCalls = (this.bodyPrefetchCalls ?? []).concat([1]); };
  game.prefetchRobe = function prefetch(gender, index) { this.robePrefetchCalls.push(robeSheetPaths(gender, index)); };
  game.prefetchWeapon = () => {};
  // [작업 216] 무기를 안 차면 빈손 시트(nostaff·noweapon)를 먼저 찾는다 — 이 하네스에는 그 캐시가 없으므로
  // 항상 undefined(폴백)로 두어 로브 시트 선택만 본다.
  game.staffBodyFrame = () => undefined;
  game.swordlessBodyFrame = () => undefined;
  game.bowBodyFrame = () => undefined;
  game.prefetchStaff = () => {};
  game.prefetchBow = () => {};
  game.prefetchArcherHeadless = () => {};
  game.prefetchMageHeadless = () => {};
  return game;
}

function world(save) {
  return { save, player: { x: 0, y: 0, facingSide: 1, facing: 0, hit: 0, berserk: 0, berserkLevel: 0 }, activeMove: { x: 0, y: 0 }, attackPose: 0, effects: [] };
}

test('착용 로브 시트가 로드되면 마법사 필드가 그 시트로 그린다', () => {
  const save = mageSave('male');
  save.equipment.armor = armorItem('미스릴 아머');
  const game = view();
  const standing = world(save);
  drawHero.call(game, standing, 100, 100, 0);
  assert.equal(game.hero.texture, game.textures.mageMale, '로딩 전에는 기준 시트로 폴백');
  assert.deepEqual(game.robePrefetchCalls.at(-1), robeSheetPaths('male', 5), '티어가 바뀌면 시트 3장을 미리 받는다');
  assert.equal(game.robePrefetchCalls.length, 1, '같은 티어에서는 다시 받지 않는다');

  const sheet = robeSheetTexture('idle');
  game.armorSheets.set(robeSheetPath('male', 5, 'idle'), sheet);
  drawHero.call(game, standing, 100, 100, .1);
  assert.equal(game.hero.texture, sheet, '서기는 로브 서기 시트 한 장');
});

test('걷기·공격은 로브 시트를 4프레임으로 잘라 쓴다', () => {
  const save = mageSave('female');
  save.equipment.armor = armorItem('드래곤 메일');
  const game = view();
  const hit = world(save);
  const walkSheet = robeSheetTexture('walk');
  game.armorSheets.set(robeSheetPath('female', 7, 'walk'), walkSheet);
  hit.activeMove = { x: 1, y: 0 };
  hit.player.x = 30;
  drawHero.call(game, hit, 100, 100, 0);
  const frames = game.armorFrames.get(robeSheetPath('female', 7, 'walk'));
  assert.equal(frames.length, 4, '4프레임');
  assert.equal(frames[0].frame.width, 362, '칸 폭 362');
  assert.equal(frames[3].frame.x, 1086);
  assert(frames.includes(game.hero.texture), '로브 걷기 프레임을 그린다');

  const attackSheet = robeSheetTexture('attack');
  game.armorSheets.set(robeSheetPath('female', 7, 'attack'), attackSheet);
  hit.attackPose = .32;
  hit.activeMove = { x: 0, y: 0 };
  drawHero.call(game, hit, 100, 100, .2);
  const attackFrames = game.armorFrames.get(robeSheetPath('female', 7, 'attack'));
  assert.equal(attackFrames.length, 4);
  assert(attackFrames.includes(game.hero.texture), '로브 공격 프레임을 그린다');
});

test('로브를 벗거나 0번이면 기준 시트를 쓰고 시트를 받지 않는다', () => {
  const bare = view();
  drawHero.call(bare, world(mageSave('male')), 100, 100, 0);
  assert.equal(bare.hero.texture, bare.textures.mageMale);
  assert.equal(bare.robePrefetchCalls.length, 0, '갑옷이 없으면 로브 시트를 받지 않는다');

  const starter = mageSave('male');
  starter.equipment.armor = armorItem('가죽 조끼');
  const game = view();
  drawHero.call(game, world(starter), 100, 100, 0);
  assert.equal(game.hero.texture, game.textures.mageMale, '0번은 스타터 천 로브 기준 시트');
  assert.equal(game.robePrefetchCalls.length, 0, '0번은 별도 시트가 없다');
});

test('전사 세이브에는 로브를 적용하지 않는다', () => {
  const save = freshSave('male');
  save.equipment.armor = armorItem('흑요석 갑주');
  const game = view();
  game.textures.pilotMale = texture();
  drawHero.call(game, world(save), 100, 100, 0);
  assert.equal(game.robePrefetchCalls.length, 0);
  assert.equal(game.hero.texture, game.textures.pilotMale);
});

test('장비창 초상화도 착용 로브 시트를 쓴다', () => {
  const save = mageSave('female');
  // [작업 216] 지팡이를 안 찬 빈손이므로 기본 지팡이를 지운 판(nostaff)을 쓴다.
  assert.equal(equipmentFallbackPortrait(save), '/assets/pilot-25d/mage_nostaff/mage_female_idle_v1.png?v=4');
  save.equipment.armor = armorItem('가죽 조끼');
  assert.equal(equipmentFallbackPortrait(save), '/assets/pilot-25d/mage_nostaff/mage_female_idle_v1.png?v=4', '0번은 기준 시트(nostaff)');
  save.equipment.armor = armorItem('사슬 갑옷');
  assert.equal(equipmentFallbackPortrait(save), '/assets/pilot-25d/robes/mage_female_robe_2_idle_v1.png?v=4');
  const plan = equipmentPortraitPlan(save);
  assert.equal(plan.key, 'mage:female:r2:-:-', `캐시 키에 로브 티어·지팡이·투구: ${plan.key}`);
  assert.equal(plan.base, equipmentFallbackPortrait(save));
  assert(equipmentPortraitPlan(mageSave('male')).key.includes('r-1'), '갑옷이 없으면 r-1');
  assert.equal(equipmentFallbackPortrait(mageSave('male')), '/assets/pilot-25d/mage_nostaff/mage_male_idle_v1.png?v=4');
});

test('로브 시트는 부팅 프리로드에 넣지 않고 티어별로만 받는다', () => {
  assert.equal(robeTierCacheLimit, 3, '최근 3티어만 유지');
  for (const sheet of allSheets) assert(!renderAssetPaths.includes(sheet.path), `${sheet.path} 가 부팅 프리로드에 들어감`);
});
