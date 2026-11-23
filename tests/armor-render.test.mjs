import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { Container, Sprite, Texture, TextureSource } from 'pixi.js';
import './ts-loader.mjs';

const { armorIndexFor, armorSheetPath, armorSheetPaths, armorFrameIndex, armorSheetKey, ARMOR_COUNT, armorMotionList } =
  await import('../src/game/render/armors.ts');
const { GameView, armorTierCacheLimit, renderAssetPaths } = await import('../src/game/render.ts');
const { drawHero } = await import('../src/game/render/entities.ts');
const { freshSave } = await import('../src/game/store.ts');
const { baseItemIndex, baseItems } = await import('../src/game/items.ts');
const { equipmentPortraitPlan, equipmentFallbackPortrait } = await import('../src/ui/equipmentPortrait.ts');

const armorItem = name => ({ id: name, slot: 'armor', name, rarity: 'common', stats: {} });
const helmetItem = name => ({ id: name, slot: 'helmet', name, rarity: 'common', stats: {} });
// `/assets/*` 불변 캐시 회피용 `?v=N` 쿼리는 파일 경로에서 떼어 낸다(작업 222).
const fileOf = path => new URL(`../public${path.split('?')[0]}`, import.meta.url);

/** 팔레트(tRNS)·RGBA PNG의 알파를 읽는다(hero-art.test.mjs와 같은 디코더). */
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

const allSheets = [];
for (const gender of ['male', 'female']) {
  for (let index = 0; index < ARMOR_COUNT; index++) {
    for (const motion of armorMotionList) {
      for (const headless of [false, true]) allSheets.push({ gender, index, motion, headless, path: armorSheetPath(gender, index, motion, headless) });
    }
  }
}

test('갑옷 10종 이름이 모두 기본형 인덱스 0~9 로 매핑된다', () => {
  assert.equal(baseItems.armor.length, ARMOR_COUNT);
  baseItems.armor.forEach((name, index) => {
    assert.equal(baseItemIndex(armorItem(name)), index, name);
    assert.equal(baseItemIndex(armorItem(`서리의 ${name}`)), index, `접두사가 붙은 ${name}`);
  });
  const save = freshSave('male');
  assert.equal(armorIndexFor(save), -1, '갑옷이 없으면 -1');
  save.equipment.armor = armorItem('흑요석 갑주');
  assert.equal(armorIndexFor(save), 6);
  save.equipment.armor = armorItem('없는 갑옷');
  assert.equal(armorIndexFor(save), -1, '기본형이 아니면 기준 시트');
});

test('시트 경로는 성별·인덱스·동작·머리 없음마다 하나씩 있다', () => {
  // 작업 222: 서기 시트를 낮은 양손 그립으로 다시 구워 `?v=6`(걷기·공격은 그대로).
  assert.equal(armorSheetPath('male', 0, 'idle'), '/assets/pilot-25d/armors/warrior_male_armor_0_idle_v1.png?v=6');
  assert.equal(armorSheetPath('female', 4, 'walk'), '/assets/pilot-25d/armors/warrior_female_armor_4_walk_v1.png?v=6');
  assert.equal(armorSheetPath('female', 9, 'attack'), '/assets/pilot-25d/armors/warrior_female_armor_9_attack_v1.png?v=6');
  assert.equal(armorSheetPath('male', 3, 'walk', true), '/assets/pilot-25d/armors/headless/warrior_male_armor_3_walk_v1.png?v=6');
  assert.equal(armorSheetPath('male', 10, 'idle'), undefined);
  assert.equal(armorSheetPath('male', -1, 'idle'), undefined);
  assert.equal(armorSheetPath('male', 1.5, 'walk'), undefined);
  assert.equal(new Set(armorSheetPaths('female', 7)).size, 6, '티어당 6장(3동작 × 전신/머리 없음)');
  assert.equal(armorSheetKey('male', 4, 'walk', true), 'male:4:walk:headless');
});

test('프레임 번호는 동작별로 4프레임 안으로 접힌다', () => {
  assert.equal(armorFrameIndex('idle', 5), 0);
  for (let frame = 0; frame < 8; frame++) assert.equal(armorFrameIndex('walk', frame), frame % 4);
  assert.equal(armorFrameIndex('attack', 5), 1);
  assert.equal(armorFrameIndex('attack', -1), 3);
  assert.equal(armorFrameIndex('walk', Number.NaN), 0);
});

test('갑옷 시트 120장이 규격(362px 셀)대로 존재한다', () => {
  assert.equal(allSheets.length, 120);
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

test('시트는 비어 있지 않고 배경이 투명하며 4프레임이 칸을 넘지 않는다', () => {
  for (const gender of ['male', 'female']) {
    for (let index = 0; index < ARMOR_COUNT; index++) {
      for (const motion of ['idle', 'walk', 'attack']) {
        const path = armorSheetPath(gender, index, motion);
        const { width, height, alpha } = decodeAlpha(readFileSync(fileOf(path)));
        let painted = 0, clear = 0;
        for (const value of alpha) { if (value > 20) painted += 1; else clear += 1; }
        // 작업 222: 서기 시트는 낮은 양손 그립으로 다시 그려 실루엣이 조금 얇다(실측 1.1만~2.8만px, 하한 9000px).
        assert(painted > 9000, `${path}: 그림이 비었습니다(${painted}px)`);
        assert(clear > 20000, `${path}: 배경이 투명하지 않습니다`);
        if (motion === 'idle') continue;
        const cell = width / 4;
        for (let frame = 1; frame < 4; frame += 1) {
          for (const x of [frame * cell - 1, frame * cell]) {
            let crossed = 0;
            for (let y = 0; y < height; y += 1) if (alpha[y * width + x] > 0) crossed += 1;
            assert.equal(crossed, 0, `${path}: ${frame + 1}번째 칸 경계 x=${x}에 그림이 걸침`);
          }
        }
      }
    }
  }
});

const texture = (width = 362, height = 362) => new Texture({ source: new TextureSource({ width, height }) });
const armorSheetTexture = motion => texture(motion === 'idle' ? 362 : 1448, 362);

/** `drawHero` 가 쓰는 만큼만 갖춘 뷰. 갑옷 캐시·메서드는 실제 GameView 구현을 붙인다. */
function view() {
  const layer = new Container();
  const hero = new Sprite(Texture.EMPTY);
  hero.anchor.set(.5, .97);
  layer.addChild(hero);
  const game = {
    hero, heroLayer: layer, heroGear: new Map(), gearTextures: new Map(), gearLoading: new Set(),
    helmetTextures: new Map(), heroHelmet: undefined,
    lastHeroWorld: { x: 0, y: 0 }, heroWalkDistance: 0,
    textures: { pilotMale: texture(), pilotFemale: texture(), pilotMaleHeadless: texture(), pilotFemaleHeadless: texture() },
    animations: {
      pilotMaleWalk: Array.from({ length: 8 }, () => texture()),
      pilotFemaleWalk: Array.from({ length: 8 }, () => texture()),
      pilotMaleAttack: Array.from({ length: 4 }, () => texture()),
      pilotFemaleAttack: Array.from({ length: 4 }, () => texture()),
      pilotMaleWalkHeadless: Array.from({ length: 8 }, () => texture()),
      pilotFemaleWalkHeadless: Array.from({ length: 8 }, () => texture()),
      pilotMaleAttackHeadless: Array.from({ length: 4 }, () => texture()),
      pilotFemaleAttackHeadless: Array.from({ length: 4 }, () => texture())
    },
    app: { screen: { height: 800 } },
    ground: { ellipse: () => ({ fill() {} }) },
    glow: { circle: () => ({ fill() {} }) },
    armorSheets: new Map(), armorFrames: new Map(), armorLoading: new Set(), armorTierOrder: [], lastBodyTier: '',
    // 대검 파츠(작업 156) — 이 테스트는 0번(기본 검) 상태만 본다.
    weaponSheets: new Map(), weaponLoading: new Set(), weaponTierOrder: [], lastWeaponTier: -1, heroWeapon: undefined
  };
  game.armorFrame = GameView.prototype.armorFrame.bind(game);
  game.bodySheetFrame = GameView.prototype.bodySheetFrame.bind(game);
  game.swordlessBodyFrame = GameView.prototype.swordlessBodyFrame.bind(game);
  game.loadArmorSheet = () => {};
  game.weaponPart = () => undefined;
  // 실제 프리로드는 Pixi 에셋 로더가 필요하므로 테스트에서는 끊고, 경로 구성만 따로 검사한다.
  game.bodyPrefetchCalls = [];
  game.weaponPrefetchCalls = [];
  game.prefetchBody = function prefetch(gender, armor, swordless) {
    this.bodyPrefetchCalls.push(armor >= 0 ? armorSheetPaths(gender, armor, swordless) : []);
  };
  game.prefetchWeapon = function prefetch(index) { this.weaponPrefetchCalls.push(index); };
  return game;
}

function world(save) {
  return { save, player: { x: 0, y: 0, facingSide: 1, facing: 0, hit: 0, berserk: 0, berserkLevel: 0 }, activeMove: { x: 0, y: 0 }, attackPose: 0, effects: [] };
}

test('착용 갑옷 시트가 로드되면 필드가 그 시트로 그린다', () => {
  const save = freshSave('male');
  save.equipment.armor = armorItem('미스릴 아머');
  // [작업 216] 무기를 안 차면 기본 검을 지운 판을 쓰므로, 갑옷 시트만 보는 이 테스트는 0번 검을 찬다.
  save.equipment.weapon = { id: 'starter-sword', name: baseItems.weapon[0], slot: 'weapon', rarity: 'common', stats: { attack: 4 } };

  const game = view();
  const walking = world(save);
  drawHero.call(game, walking, 100, 100, 0);
  assert.equal(game.hero.texture, game.textures.pilotMale, '로딩 전에는 기준 시트로 폴백');
  assert.deepEqual(game.bodyPrefetchCalls.at(-1), armorSheetPaths('male', 5), '티어가 바뀌면 시트 6장을 미리 받는다');
  assert.equal(game.bodyPrefetchCalls.length, 1, '같은 티어에서는 다시 받지 않는다');

  const sheet = armorSheetTexture('idle');
  game.armorSheets.set(armorSheetPath('male', 5, 'idle'), sheet);
  drawHero.call(game, walking, 100, 100, .1);
  assert.equal(game.hero.texture, sheet, '서기는 갑옷 서기 시트 한 장');
});

test('걷기·공격은 갑옷 시트를 4프레임으로 잘라 쓴다', () => {
  const save = freshSave('female');
  save.equipment.armor = armorItem('드래곤 메일');
  // [작업 216] 무기를 안 차면 기본 검을 지운 판을 쓰므로, 갑옷 시트만 보는 이 테스트는 0번 검을 찬다.
  save.equipment.weapon = { id: 'starter-sword', name: baseItems.weapon[0], slot: 'weapon', rarity: 'common', stats: { attack: 4 } };

  const game = view();
  const hit = world(save);
  const walkSheet = armorSheetTexture('walk');
  game.armorSheets.set(armorSheetPath('female', 7, 'walk'), walkSheet);
  hit.activeMove = { x: 1, y: 0 };
  hit.player.x = 30;
  drawHero.call(game, hit, 100, 100, 0);
  const frames = game.armorFrames.get(armorSheetPath('female', 7, 'walk'));
  assert.equal(frames.length, 4, '4프레임');
  assert.equal(frames[0].frame.width, 362, '칸 폭 362');
  assert.equal(frames[3].frame.x, 1086);
  assert(frames.includes(game.hero.texture), '갑옷 걷기 프레임을 그린다');

  const attackSheet = armorSheetTexture('attack');
  game.armorSheets.set(armorSheetPath('female', 7, 'attack'), attackSheet);
  hit.attackPose = .32;
  hit.activeMove = { x: 0, y: 0 };
  drawHero.call(game, hit, 100, 100, .2);
  const attackFrames = game.armorFrames.get(armorSheetPath('female', 7, 'attack'));
  assert.equal(attackFrames.length, 4);
  assert(attackFrames.includes(game.hero.texture), '갑옷 공격 프레임을 그린다');
});

test('투구를 쓰면 갑옷의 머리 없는 시트를 쓴다', () => {
  const save = freshSave('male');
  save.equipment.armor = armorItem('성기사 풀플레이트');
  // [작업 216] 무기를 안 차면 기본 검을 지운 판을 쓰므로, 갑옷 시트만 보는 이 테스트는 0번 검을 찬다.
  save.equipment.weapon = { id: 'starter-sword', name: baseItems.weapon[0], slot: 'weapon', rarity: 'common', stats: { attack: 4 } };

  save.equipment.helmet = helmetItem('용린 투구');
  const game = view();
  const walking_ = world(save);
  // 머리 없는 시트만 로드된 상태 — 전신 시트가 없으므로 이걸 골라야 한다.
  const headlessSheet = armorSheetTexture('idle');
  game.armorSheets.set(armorSheetPath('male', 8, 'idle', true), headlessSheet);
  drawHero.call(game, walking_, 100, 100, 0);
  assert.equal(game.hero.texture, headlessSheet);
  // helmetTextures 가 비어 있으므로 투구 파츠는 아직 안 그려지지만, 요청 경로는 headless 다.
  assert(!game.armorSheets.has(armorSheetPath('male', 8, 'idle')));
});

test('장비창 초상화도 착용 갑옷 시트를 쓴다', () => {
  const save = freshSave('female');
  // [작업 216] 무기를 안 차면 기본 검을 지운 판을 쓰므로, 갑옷 시트만 보는 이 테스트는 0번 검을 찬다.
  save.equipment.weapon = { id: 'starter-sword', name: baseItems.weapon[0], slot: 'weapon', rarity: 'common', stats: { attack: 4 } };
  // 작업 222: 서기 시트를 다시 구워 `?v=6`.
  assert.equal(equipmentFallbackPortrait(save), '/assets/pilot-25d/warrior_female_idle_v1.png?v=6');
  save.equipment.armor = armorItem('사슬 갑옷');
  assert.equal(equipmentFallbackPortrait(save), '/assets/pilot-25d/armors/warrior_female_armor_2_idle_v1.png?v=6');
  save.equipment.helmet = helmetItem('철제 바시넷');
  assert.equal(equipmentFallbackPortrait(save), '/assets/pilot-25d/armors/headless/warrior_female_armor_2_idle_v1.png?v=6');
  const plan = equipmentPortraitPlan(save);
  assert(plan.key.includes('a2'), `캐시 키에 갑옷 티어: ${plan.key}`);
  assert.equal(plan.base, equipmentFallbackPortrait(save));
  // 갑옷이 없으면 기준 시트(+머리 없음)다 — 무기를 안 찬 캐릭터는 기본 검을 지운 판(빈손).
  const bare = freshSave('female');
  assert.equal(equipmentPortraitPlan(bare).base, '/assets/pilot-25d/noweapon/warrior_female_idle_v1.png?v=6');
});

test('갑옷 시트는 부팅 프리로드에 넣지 않고 티어별로만 받는다', () => {
  assert.equal(armorTierCacheLimit, 3, '최근 3티어만 유지');
  for (const sheet of allSheets) assert(!renderAssetPaths.includes(sheet.path), `${sheet.path} 가 부팅 프리로드에 들어감`);
  // 갑옷을 벗으면 기준 시트를 쓰므로 프리로드도 없다.
  const game = view();
  const bare = world(freshSave('male'));
  drawHero.call(game, bare, 100, 100, 0);
  assert.equal(game.bodyPrefetchCalls.length, 1);
  assert.deepEqual(game.bodyPrefetchCalls[0], [], '갑옷이 없으면 받을 갑옷 시트가 없다');
});
