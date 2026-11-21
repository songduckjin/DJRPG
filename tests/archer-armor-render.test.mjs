import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';
import './ts-loader.mjs';

const {
  ARCHER_ARMOR_COUNT, archerArmorIndexFor, archerArmorSheetPath, archerArmorSheetPaths,
  archerArmorFrameIndex, archerArmorSheetKey, archerArmorMotionList, archerArmorTierSheets
} = await import('../src/game/render/archerArmors.ts');
const { GameView, archerArmorTierCacheLimit, armorTierCacheLimit, renderAssetPaths } = await import('../src/game/render.ts');
const { drawHero } = await import('../src/game/render/entities.ts');
const { freshSave } = await import('../src/game/store.ts');
const { baseItemIndex, baseItems } = await import('../src/game/items.ts');
const { equipmentPortraitPlan, equipmentFallbackPortrait } = await import('../src/ui/equipmentPortrait.ts');
const { armorSheetPath } = await import('../src/game/render/armors.ts');

const armorItem = name => ({ id: name, slot: 'armor', name, rarity: 'common', stats: {} });
const helmetItem = name => ({ id: name, slot: 'helmet', name, rarity: 'common', stats: {} });
const fileOf = path => new URL(`../public${path}`, import.meta.url);
const archerSave = (gender = 'male') => freshSave(gender, 'archer');

/** 팔레트(tRNS)·RGBA PNG의 알파를 읽는다(armor-render.test.mjs와 같은 디코더). */
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
  if (!palette && colorType !== 6) throw new Error(`지원하지 않는 PNG 색 형식: ${colorType}`);
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

/** 실루엣 위·아래(발끝) 좌표 — 갑옷이 바뀌어도 같은 자리여야 한다. */
function verticalExtent({ width, height, alpha }, frame = 0, cellWidth = width) {
  let top = height, bottom = -1;
  const left = frame * cellWidth, right = left + cellWidth;
  for (let y = 0; y < height; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (alpha[y * width + x] > 40) { top = Math.min(top, y); bottom = Math.max(bottom, y); break; }
    }
  }
  return { top, bottom };
}

const allSheets = [];
const allBowlessSheets = [];
const allHeadlessSheets = [];
const allBowlessHeadlessSheets = [];
for (const gender of ['male', 'female']) {
  for (let index = 1; index < ARCHER_ARMOR_COUNT; index++) {
    for (const motion of archerArmorMotionList) {
      allSheets.push({ gender, index, motion, path: archerArmorSheetPath(gender, index, motion) });
      allBowlessSheets.push({ gender, index, motion, path: archerArmorSheetPath(gender, index, motion, true) });
      allHeadlessSheets.push({ gender, index, motion, path: archerArmorSheetPath(gender, index, motion, false, true) });
      allBowlessHeadlessSheets.push({ gender, index, motion, path: archerArmorSheetPath(gender, index, motion, true, true) });
    }
  }
}
const everySheet = [...allSheets, ...allBowlessSheets, ...allHeadlessSheets, ...allBowlessHeadlessSheets];

test('궁수 갑옷 10종 이름이 기본형 인덱스 0~9 로 매핑되고, 전사 세이브에는 적용되지 않는다', () => {
  assert.equal(baseItems.armor.length, ARCHER_ARMOR_COUNT);
  const save = archerSave('male');
  assert.equal(archerArmorIndexFor(save), -1, '갑옷이 없으면 -1(스타터 시트)');
  save.equipment.armor = armorItem('흑요석 갑주');
  assert.equal(archerArmorIndexFor(save), 6);
  save.equipment.armor = armorItem('없는 갑옷');
  assert.equal(archerArmorIndexFor(save), -1, '기본형이 아니면 스타터 시트');
  save.equipment.armor = armorItem('가죽 조끼');
  assert.equal(archerArmorIndexFor(save), 0, '0번은 스타터 시트 그대로');
  const warrior = freshSave('male');
  warrior.equipment.armor = armorItem('흑요석 갑주');
  assert.equal(archerArmorIndexFor(warrior), -1, '전사는 궁수 갑옷 시트를 쓰지 않는다');
  for (let index = 0; index < ARCHER_ARMOR_COUNT; index += 1) {
    assert.equal(baseItemIndex(armorItem(baseItems.armor[index])), index);
  }
});

test('궁수 갑옷 시트 경로는 1~9번 × 성별 × 동작마다 하나씩 있다', () => {
  assert.equal(archerArmorSheetPath('male', 1, 'idle'),
    '/assets/pilot-25d/archer_armors/archer_male_armor_1_idle_v1.png?v=5');
  assert.equal(archerArmorSheetPath('female', 9, 'attack'),
    '/assets/pilot-25d/archer_armors/archer_female_armor_9_attack_v1.png?v=5');
  assert.equal(archerArmorSheetPath('male', 0, 'idle'), undefined, '0번은 스타터 시트');
  assert.equal(archerArmorSheetPath('male', 10, 'idle'), undefined);
  assert.equal(archerArmorSheetPath('male', -1, 'idle'), undefined);
  assert.equal(archerArmorSheetPath('male', 2.5, 'walk'), undefined);
  assert.equal(archerArmorSheetPaths('female', 4).length, 3, '티어당 3장(서기·걷기·사격)');
  // 기본 활대를 지운 판(nobow)은 같은 규칙으로 폴더만 다르다(활 10종 작업과 호환).
  assert.equal(archerArmorSheetPath('male', 1, 'idle', true),
    '/assets/pilot-25d/archer_armors/nobow/archer_male_armor_1_idle_v1.png?v=5');
  assert.equal(archerArmorSheetPath('male', 0, 'idle', true), undefined, '0번은 스타터(또는 nobow 본체) 시트');
  assert.equal(archerArmorSheetPaths('female', 4, true).length, 3);
  // 머리 지운 판(궁수 투구 10종 호환) — 활 지운 판 안에도 같은 규칙으로 둔다.
  assert.equal(archerArmorSheetPath('male', 1, 'idle', false, true),
    '/assets/pilot-25d/archer_armors/headless/archer_male_armor_1_idle_v1.png?v=5');
  assert.equal(archerArmorSheetPath('male', 1, 'idle', true, true),
    '/assets/pilot-25d/archer_armors/nobow/headless/archer_male_armor_1_idle_v1.png?v=5');
  assert.equal(archerArmorSheetPaths('female', 4, false, true).length, 3);
  assert.equal(archerArmorTierSheets('male', 4).length, 12, '티어당 네 가지 판 × 3동작');
  assert.equal(archerArmorSheetKey('male', 3, 'walk', true, true), 'archer:male:3:walk:nobow:headless');
  assert.equal(archerArmorSheetKey('male', 3, 'walk'), 'archer:male:3:walk');
  assert.equal(archerArmorSheetKey('male', 3, 'walk', true), 'archer:male:3:walk:nobow');
  // 전사 갑옷 경로와 섞이지 않는다.
  assert.notEqual(archerArmorSheetPath('male', 3, 'walk'), armorSheetPath('male', 3, 'walk'));
});

test('궁수 갑옷 프레임 번호는 동작별로 4프레임 안으로 접힌다', () => {
  assert.equal(archerArmorFrameIndex('idle', 5), 0);
  for (let frame = 0; frame < 8; frame += 1) assert.equal(archerArmorFrameIndex('walk', frame), frame % 4);
  assert.equal(archerArmorFrameIndex('attack', 5), 1);
  assert.equal(archerArmorFrameIndex('attack', -1), 3);
  assert.equal(archerArmorFrameIndex('walk', Number.NaN), 0);
});

test('궁수 갑옷 시트 216장(전신·활 지움·머리 지움·둘 다)이 규격(362px 셀·256색 팔레트)대로 존재한다', () => {
  assert.equal(allSheets.length, 54);
  assert.equal(allBowlessSheets.length, 54);
  assert.equal(allHeadlessSheets.length, 54);
  assert.equal(allBowlessHeadlessSheets.length, 54);
  for (const sheet of everySheet) {
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

test('시트는 비어 있지 않고 배경이 투명하며 4프레임이 칸을 넘지 않는다', () => {
  for (const sheet of everySheet) {
    const { width, height, alpha } = decodeAlpha(readFileSync(fileOf(sheet.path)));
    let painted = 0, clear = 0;
    for (const value of alpha) { if (value > 20) painted += 1; else clear += 1; }
    // 머리를 지운 판은 머리·머리카락이 빠진 만큼 픽셀이 적다 — 하한을 조금 낮춘다.
    const floor = sheet.path.includes('/headless/') ? 12000 : 20000;
    assert(painted > floor, `${sheet.path}: 그림이 비었습니다(${painted}px)`);
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

test('갑옷 1~9번(기본 활 지운 판 포함)은 스타터 시트와 같은 키·같은 발끝에 선다', () => {
  for (const gender of ['male', 'female']) {
    for (const motion of archerArmorMotionList) {
      const starter = decodeAlpha(readFileSync(fileOf(`/assets/pilot-25d/archer_${gender}_${motion}_v1.png`)));
      const tolerance = motion === 'attack' ? 18 : 10;
      for (let index = 1; index < ARCHER_ARMOR_COUNT; index += 1) {
        const path = archerArmorSheetPath(gender, index, motion);
        const sheet = decodeAlpha(readFileSync(fileOf(path)));
        const cellWidth = motion === 'idle' ? sheet.width : sheet.width / 4;
        for (let frame = 0; frame < (motion === 'idle' ? 1 : 4); frame += 1) {
          const extent = verticalExtent(sheet, frame, cellWidth);
          const reference = verticalExtent(starter, frame, cellWidth);
          assert(Math.abs(extent.top - reference.top) <= tolerance,
            `${path} ${frame}프레임: 머리 꼭대기 ${extent.top} vs 기준 ${reference.top}`);
          assert(Math.abs(extent.bottom - reference.bottom) <= tolerance,
            `${path} ${frame}프레임: 발끝 ${extent.bottom} vs 기준 ${reference.bottom}`);
        }
      }
    }
  }
});

const texture = (width = 362, height = 362) => new Texture({ source: new TextureSource({ width, height }) });
const sheetTexture = motion => texture(motion === 'idle' ? 362 : 1448, 362);

/** `drawHero` 가 쓰는 만큼만 갖춘 뷰(전사 갑옷·대검 캐시 + 궁수 갑옷 캐시). */
function view() {
  const layer = new Container();
  const hero = new Sprite(Texture.EMPTY);
  hero.anchor.set(.5, .97);
  layer.addChild(hero);
  const game = {
    hero, heroLayer: layer, heroGear: new Map(), gearTextures: new Map(), gearLoading: new Set(),
    helmetTextures: new Map(), heroHelmet: undefined,
    lastHeroWorld: { x: 0, y: 0 }, heroWalkDistance: 0,
    textures: {
      pilotMale: texture(), pilotFemale: texture(), pilotMaleHeadless: texture(), pilotFemaleHeadless: texture(),
      archerMale: texture(), archerFemale: texture()
    },
    animations: {
      pilotMaleWalk: Array.from({ length: 8 }, () => texture()),
      pilotFemaleWalk: Array.from({ length: 8 }, () => texture()),
      pilotMaleAttack: Array.from({ length: 4 }, () => texture()),
      pilotFemaleAttack: Array.from({ length: 4 }, () => texture()),
      pilotMaleWalkHeadless: Array.from({ length: 8 }, () => texture()),
      pilotFemaleWalkHeadless: Array.from({ length: 8 }, () => texture()),
      pilotMaleAttackHeadless: Array.from({ length: 4 }, () => texture()),
      pilotFemaleAttackHeadless: Array.from({ length: 4 }, () => texture()),
      archerMaleWalk: Array.from({ length: 8 }, () => texture()),
      archerFemaleWalk: Array.from({ length: 8 }, () => texture()),
      archerMaleAttack: Array.from({ length: 4 }, () => texture()),
      archerFemaleAttack: Array.from({ length: 4 }, () => texture())
    },
    app: { screen: { height: 800 } },
    ground: { ellipse: () => ({ fill() {} }) },
    glow: { circle: () => ({ fill() {} }) },
    armorSheets: new Map(), armorFrames: new Map(), armorLoading: new Set(), armorTierOrder: [], lastBodyTier: '',
    archerArmorOrder: [], lastArcherArmorTier: '',
    weaponSheets: new Map(), weaponLoading: new Set(), weaponTierOrder: [], lastWeaponTier: -1, heroWeapon: undefined,
    // 활 10종(작업 160) — 궁수 갑옷과 같이 도는 경로라 같은 캐시를 흉내 낸다.
    bowSheets: new Map(), bowLoading: new Set(), bowTierOrder: [], lastBowTier: -1, heroBow: undefined
  };
  game.bowBodyFrame = GameView.prototype.bowBodyFrame.bind(game);
  game.bowPart = GameView.prototype.bowPart.bind(game);
  game.loadBowPart = () => {};
  game.armorFrame = GameView.prototype.armorFrame.bind(game);
  game.archerArmorFrame = GameView.prototype.archerArmorFrame.bind(game);
  game.bodySheetFrame = GameView.prototype.bodySheetFrame.bind(game);
  game.swordlessBodyFrame = GameView.prototype.swordlessBodyFrame.bind(game);
  game.loadArmorSheet = () => {};
  game.weaponPart = () => undefined;
  game.bodyPrefetchCalls = [];
  game.archerPrefetchCalls = [];
  game.weaponPrefetchCalls = [];
  game.prefetchBody = function prefetch(gender, armor, swordless) { this.bodyPrefetchCalls.push([gender, armor, swordless]); };
  game.prefetchArcherArmor = function prefetch(gender, index, bowless, headless) {
    this.archerPrefetchCalls.push([gender, index, bowless, headless]);
  };
  game.prefetchWeapon = function prefetch(index) { this.weaponPrefetchCalls.push(index); };
  game.archerHeadlessFrame = () => undefined;
  game.prefetchArcherHeadless = function prefetch(gender, bowless) { this.headlessPrefetchCalls.push([gender, bowless]); };
  game.headlessPrefetchCalls = [];
  game.lastArcherHelm = -1;
  game.lastArcherHelmBow = '';
  game.prefetchBow = function prefetch(index, gender) { this.bowPrefetchCalls.push([index, gender]); };
  game.bowPrefetchCalls = [];
  return game;
}

function world(save) {
  return { save, player: { x: 0, y: 0, facingSide: 1, facing: 0, hit: 0, berserk: 0, berserkLevel: 0 }, activeMove: { x: 0, y: 0 }, attackPose: 0, effects: [] };
}

test('궁수는 갑옷을 입으면 그 시트로 그리고, 로딩 전에는 스타터 시트로 폴백한다', () => {
  const save = archerSave('male');
  save.equipment.armor = armorItem('미스릴 아머');
  const game = view();
  const scene = world(save);
  drawHero.call(game, scene, 100, 100, 0);
  assert.equal(game.hero.texture, game.textures.archerMale, '로딩 전에는 기준(스타터) 시트로 폴백');
  assert.deepEqual(game.archerPrefetchCalls.at(-1), ['male', 5, true, false], '티어가 바뀌면 궁수 시트 3장을 미리 받는다(활을 안 챘으므로 nobow 판)');
  assert.equal(game.archerPrefetchCalls.length, 1, '같은 티어에서는 다시 받지 않는다');
  assert.equal(game.bodyPrefetchCalls.length, 1, '전사 갑옷 시트는 받지 않는다(-1)');
  assert.equal(game.bodyPrefetchCalls[0][1], -1, '궁수는 전사 갑옷 인덱스를 쓰지 않는다');

  const sheet = sheetTexture('idle');
  game.armorSheets.set(archerArmorSheetPath('male', 5, 'idle'), sheet);
  drawHero.call(game, scene, 100, 100, .1);
  assert.equal(game.hero.texture, sheet, '서기는 궁수 갑옷 서기 시트 한 장');
  assert(!game.armorSheets.has(armorSheetPath('male', 5, 'idle')), '전사 갑옷 시트는 쓰지 않는다');
});

test('궁수 갑옷 걷기·사격은 4프레임으로 잘라 쓴다', () => {
  const save = archerSave('female');
  save.equipment.armor = armorItem('드래곤 메일');
  const game = view();
  const scene = world(save);
  const walkSheet = sheetTexture('walk');
  game.armorSheets.set(archerArmorSheetPath('female', 7, 'walk'), walkSheet);
  scene.activeMove = { x: 1, y: 0 };
  scene.player.x = 30;
  drawHero.call(game, scene, 100, 100, 0);
  const frames = game.armorFrames.get(archerArmorSheetPath('female', 7, 'walk'));
  assert.equal(frames.length, 4, '4프레임');
  assert.equal(frames[0].frame.width, 362, '칸 폭 362');
  assert.equal(frames[3].frame.x, 1086);
  assert(frames.includes(game.hero.texture), '궁수 갑옷 걷기 프레임을 그린다');

  const attackSheet = sheetTexture('attack');
  game.armorSheets.set(archerArmorSheetPath('female', 7, 'attack'), attackSheet);
  scene.attackPose = .32;
  scene.activeMove = { x: 0, y: 0 };
  drawHero.call(game, scene, 100, 100, .2);
  const attackFrames = game.armorFrames.get(archerArmorSheetPath('female', 7, 'attack'));
  assert.equal(attackFrames.length, 4);
  assert(attackFrames.includes(game.hero.texture), '궁수 갑옷 사격 프레임을 그린다');
});

test('궁수 0번·미착용은 스타터 시트 그대로이고, 투구 파츠는 얹지 않는다', () => {
  const save = archerSave('male');
  save.equipment.armor = armorItem('가죽 조끼');
  save.equipment.helmet = helmetItem('용린 투구');
  const game = view();
  const scene = world(save);
  drawHero.call(game, scene, 100, 100, 0);
  assert.equal(game.hero.texture, game.textures.archerMale);
  assert.equal(game.archerPrefetchCalls.length, 0, '0번은 받을 갑옷 시트가 없다');
  assert.equal(game.heroHelmet?.visible ?? false, false, '궁수는 투구 파츠를 숨긴다');
});

test('궁수 투구를 쓰면 갑옷도 머리 지운 판을 쓰고, 투구 파츠가 로딩 전이면 머리 있는 판을 쓴다', () => {
  const save = archerSave('male');
  save.equipment.armor = armorItem('드래곤 메일');
  save.equipment.helmet = helmetItem('가죽 두건');
  save.equipment.weapon = { id: 'w', name: '혈염 장궁', slot: 'weapon', rarity: 'rare', stats: { attack: 30 } };
  const game = view();
  const scene = world(save);
  // 투구 파츠가 아직 없으므로 머리 있는 판(활 지움)으로 그리고, 4가지 판 조합을 미리 받지 않는다.
  drawHero.call(game, scene, 100, 100, 0);
  assert.deepEqual(game.archerPrefetchCalls.at(-1), ['male', 7, true, false], '투구 파츠 전에는 머리 있는 판');
  // 투구 파츠가 준비되면 머리 지운 판 + 기본 활 지운 판을 함께 받는다.
  game.helmetTextures.set('/assets/pilot-25d/archer_helms/male_0_v1.png?v=5', texture());
  drawHero.call(game, scene, 100, 100, .1);
  assert.deepEqual(game.archerPrefetchCalls.at(-1), ['male', 7, true, true]);
  const headless = sheetTexture('idle');
  game.armorSheets.set(archerArmorSheetPath('male', 7, 'idle', true, true), headless);
  drawHero.call(game, scene, 100, 100, .2);
  assert.equal(game.hero.texture, headless, '머리 지운 + 기본 활 지운 갑옷 시트로 그린다');
});

test('궁수 시트 캐시는 전사 갑옷과 따로 최근 3티어만 유지한다', () => {
  assert.equal(archerArmorTierCacheLimit, 3);
  assert.equal(armorTierCacheLimit, 3);
  const game = view();
  // 실제 프리로드 구현(에셋 로더는 빈 함수)에서 오래된 티어가 목록에서 밀려나는지 본다.
  game.loadArmorSheet = () => {};
  const prefetch = GameView.prototype.prefetchArcherArmor.bind(game);
  for (const index of [2, 3, 4, 5]) prefetch('male', index);
  assert.deepEqual(game.archerArmorOrder, ['male:3', 'male:4', 'male:5']);
  assert.equal(game.armorTierOrder.length, 0, '전사 갑옷 캐시 목록은 건드리지 않는다');
});

test('장비창 초상화도 착용한 궁수 갑옷 시트를 쓴다', () => {
  const save = archerSave('female');
  // [작업 216] 활을 안 챈 캐릭터는 기본 활대를 지운 시트(빈손)로 그린다.
  assert.equal(equipmentFallbackPortrait(save), '/assets/pilot-25d/nobow/archer_female_idle_v1.png?v=5');
  save.equipment.armor = armorItem('가죽 조끼');
  assert.equal(equipmentFallbackPortrait(save), '/assets/pilot-25d/nobow/archer_female_idle_v1.png?v=5', '0번은 스타터 시트(빈손이면 nobow 판)');
  save.equipment.armor = armorItem('사슬 갑옷');
  // [작업 216] 활을 안 챈 빈손이므로 기본 활대를 지운 판(`archer_armors/nobow/`)을 쓴다.
  assert.equal(equipmentFallbackPortrait(save),
    '/assets/pilot-25d/archer_armors/nobow/archer_female_armor_2_idle_v1.png?v=5');
  const plan = equipmentPortraitPlan(save);
  assert(plan.key.includes('a2'), `캐시 키에 갑옷 티어: ${plan.key}`);
  assert.equal(plan.base, equipmentFallbackPortrait(save));
  assert.equal(plan.helmet, undefined, '궁수는 투구 파츠를 합성하지 않는다');
  const warrior = freshSave('female');
  warrior.equipment.armor = armorItem('사슬 갑옷');
  // [작업 216] 빈손 전사는 기본 검을 지운 `noweapon/armors/` 판을 쓴다(무기를 차면 예전 경로 그대로).
  // 작업 222: 서기 시트를 다시 구워 `?v=5`.
  assert.equal(equipmentFallbackPortrait(warrior), '/assets/pilot-25d/noweapon/armors/warrior_female_armor_2_idle_v1.png?v=5',
    '전사 장비창도 빈손이면 기본 검을 지운 판');
  warrior.equipment.weapon = { id: 'w', name: baseItems.weapon[0], slot: 'weapon', rarity: 'common', stats: {} };
  assert.equal(equipmentFallbackPortrait(warrior), '/assets/pilot-25d/armors/warrior_female_armor_2_idle_v1.png?v=5',
    '무기를 차면 예전 경로 그대로');
});

test('궁수 갑옷 시트는 부팅 프리로드에 넣지 않고 티어별로만 받는다', () => {
  for (const sheet of allSheets) assert(!renderAssetPaths.includes(sheet.path), `${sheet.path} 가 부팅 프리로드에 들어감`);
});
