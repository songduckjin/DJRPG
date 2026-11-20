import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { Container, Sprite, Texture } from 'pixi.js';
import './ts-loader.mjs';

const {
  ARCHER_HELM_COUNT, archerHelmPartPath, archerHelmPartPaths, archerHelmPlacement, archerHelmIdlePlacement,
  archerHelmIndexFor, archerHeadlessBodyPath, archerHeadlessBodyPaths
} = await import('../src/game/render/archerHelmets.ts');
const { GameView, renderAssetPaths } = await import('../src/game/render.ts');
const { drawHero } = await import('../src/game/render/entities.ts');
const { freshSave } = await import('../src/game/store.ts');
const { baseItems, bowBases } = await import('../src/game/items.ts');
const { equipmentPortraitPlan } = await import('../src/ui/equipmentPortrait.ts');

const helmetItem = name => ({ id: name, slot: 'helmet', name, rarity: 'rare', stats: { defense: 8 } });
const fileOf = path => new URL(`../public${path}`, import.meta.url);

/** 팔레트(tRNS)·RGBA PNG의 알파를 읽는다(bow-render.test.mjs와 같은 디코더). */
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

const opaqueIn = (art, box) => {
  let count = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) if (art.alpha[y * art.width + x] > 128) count += 1;
  }
  return count;
};

function texture() {
  const canvas = {
    width: 362, height: 362,
    getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) })
  };
  return new Texture({ source: new (Object.getPrototypeOf(Texture.EMPTY.source).constructor)({ resource: canvas }) });
}

/** `drawHero` 가 쓰는 만큼만 갖춘 궁수 뷰(시트 캐시·미리 받기는 실제 GameView 구현을 붙인다). */
function view() {
  const layer = new Container();
  const hero = new Sprite(texture());
  hero.anchor.set(.5, .97);
  layer.addChild(hero);
  const frames = n => Array.from({ length: n }, () => texture());
  const game = {
    hero, heroLayer: layer, heroGear: new Map(), gearTextures: new Map(), gearLoading: new Set(),
    helmetTextures: new Map(), heroHelmet: undefined,
    lastHeroWorld: { x: 0, y: 0 }, heroWalkDistance: 0,
    textures: { archerMale: texture(), archerFemale: texture(), pilotMale: texture(), pilotFemale: texture() },
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
    bowSheets: new Map(), bowLoading: new Set(), bowTierOrder: [], lastBowTier: -1, heroBow: undefined,
    lastArcherHelm: -1, lastArcherHelmBow: ''
  };
  game.armorFrame = GameView.prototype.armorFrame.bind(game);
  game.bodySheetFrame = GameView.prototype.bodySheetFrame.bind(game);
  game.swordlessBodyFrame = GameView.prototype.swordlessBodyFrame.bind(game);
  game.bowBodyFrame = GameView.prototype.bowBodyFrame.bind(game);
  game.archerHeadlessFrame = GameView.prototype.archerHeadlessFrame.bind(game);
  game.weaponPart = GameView.prototype.weaponPart.bind(game);
  game.bowPart = GameView.prototype.bowPart.bind(game);
  game.loadArmorSheet = () => {};
  game.loadWeaponPart = () => {};
  game.loadBowPart = () => {};
  game.prefetchBody = () => {};
  game.prefetchWeapon = () => {};
  game.prefetchBow = () => {};
  game.archerHeadlessPrefetchCalls = [];
  game.prefetchArcherHeadless = function prefetch(gender, bowless) {
    this.archerHeadlessPrefetchCalls.push([gender, bowless]);
  };
  return game;
}

function world(save) {
  return {
    save,
    player: { x: 0, y: 0, facingSide: 1, facing: 0, hit: 0, berserk: 0, berserkLevel: 0 },
    activeMove: { x: 0, y: 0 }, attackPose: 0, effects: []
  };
}

function archerSave(gender = 'male', helmet, bow) {
  const save = freshSave(gender, 'archer');
  save.knockback = undefined;
  if (helmet) save.equipment.helmet = helmetItem(helmet);
  if (bow) save.equipment.weapon = { id: bow, slot: 'weapon', name: bow, rarity: 'rare', stats: { attack: 10 } };
  return save;
}

test('궁수 투구 10종 이름이 모두 기본형 인덱스 0~9 로 매핑되고, 없으면 투구 없음', () => {
  assert.equal(baseItems.helmet.length, ARCHER_HELM_COUNT);
  for (let index = 0; index < ARCHER_HELM_COUNT; index++) {
    const save = archerSave('male', baseItems.helmet[index]);
    assert.equal(archerHelmIndexFor(save), index, `${baseItems.helmet[index]} → ${index}`);
    const dropped = archerSave('female', `정교한 ${baseItems.helmet[index]}`);
    assert.equal(archerHelmIndexFor(dropped), index, `정교한 ${baseItems.helmet[index]}`);
  }
  // 레거시 이름(`낡은 투구`)은 전사와 같은 인덱스(심연의 뿔투구)로 접힌다.
  assert.equal(archerHelmIndexFor(archerSave('male', '낡은 투구')), baseItems.helmet.indexOf('심연의 뿔투구'));
  assert.equal(archerHelmIndexFor(archerSave('male')), -1, '투구를 안 쓰면 파츠를 그리지 않는다');
  // 부위가 다른 장비가 투구 칸에 들어간 오염된 세이브도 이름으로만 읽는다(전사 투구 경로와 같은 규칙).
  const wrong = archerSave('male');
  wrong.equipment.helmet = { id: 'x', slot: 'helmet', name: '알 수 없는 머리장식', rarity: 'rare', stats: {} };
  assert.equal(archerHelmIndexFor(wrong), -1, '기본형 이름이 아니면 그리지 않는다');
});

test('궁수 투구 파츠 20장이 362px 셀 규격으로 있고 머리 자리에 내용이 있다', () => {
  const face = { x0: 150, x1: 210, y0: 25, y1: 95 };
  for (const gender of ['male', 'female']) {
    for (let index = 0; index < ARCHER_HELM_COUNT; index++) {
      const path = archerHelmPartPath(gender, index);
      assert(path, `${gender} ${index} 경로`);
      const file = fileOf(path);
      assert(existsSync(file), `파츠 파일: ${path}`);
      const art = decodeAlpha(readFileSync(file));
      assert.deepEqual([art.width, art.height], [362, 362], `${path} 셀 규격`);
      assert(opaqueIn(art, face) > 400, `${path} 머리 자리가 비었습니다`);
      assert(statSync(file).size < 40 * 1024, `${path} 용량 ${statSync(file).size}바이트`);
    }
  }
  assert.equal(archerHelmPartPath('male', -1), undefined);
  assert.equal(archerHelmPartPath('male', ARCHER_HELM_COUNT), undefined);
  assert.equal(archerHelmPartPaths.length, ARCHER_HELM_COUNT * 2);
  // 20장 전부 부팅 프리로드에 들어간다(장당 ~5KB).
  for (const path of archerHelmPartPaths) assert(renderAssetPaths.includes(path), `${path} 프리로드 누락`);
});

test('머리 없는 본체 12장이 셀 규격대로 있고 머리만 지워졌다(어깨·가슴은 그대로)', () => {
  const sizes = { idle: [362, 362], walk: [1448, 362], attack: [1448, 362] };
  const head = { x0: 160, x1: 200, y0: 30, y1: 85 };
  const chest = { x0: 150, x1: 230, y0: 170, y1: 280 };
  for (const gender of ['male', 'female']) {
    for (const bowless of [false, true]) {
      assert.equal(archerHeadlessBodyPaths(gender, bowless).length, 3, '서기·걷기·사격 3장');
      for (const motion of ['idle', 'walk', 'attack']) {
        const path = archerHeadlessBodyPath(gender, motion, bowless);
        const file = fileOf(path);
        assert(existsSync(file), `머리 없는 시트: ${path}`);
        const art = decodeAlpha(readFileSync(file));
        assert.deepEqual([art.width, art.height], sizes[motion], `${path} 규격`);
        // 서기 한 장은 머리·가슴을 직접 비교한다(걷기·사격은 프레임 좌표가 달라 규격만 본다).
        if (motion === 'idle') {
          const source = bowless
            ? '/assets/pilot-25d/nobow/archer_' + gender + '_idle_v1.png'
            : `/assets/pilot-25d/archer_${gender}_idle_v1.png?v=3`;
          const before = decodeAlpha(readFileSync(fileOf(source)));
          assert(opaqueIn(before, head) > 300, `${source} 머리 영역 기준값`);
          assert.equal(opaqueIn(art, head), 0, `${path} 에 머리가 남아 있습니다`);
          assert(opaqueIn(art, chest) > opaqueIn(before, chest) * .9, `${path} 가슴·어깨가 지워졌습니다`);
        }
      }
    }
  }
  // 머리 없는 시트는 부팅 프리로드에 넣지 않는다(쓰는 사람만 티어별로 받는다).
  for (const gender of ['male', 'female']) {
    for (const path of archerHeadlessBodyPaths(gender)) assert(!renderAssetPaths.includes(path), `${path} 프리로드`);
  }
});

test('투구 자세 표는 서기 1 + 걷기·사격 4프레임이고 사격은 인물이 작아 축소된다', () => {
  assert.deepEqual(archerHelmIdlePlacement, { x: 0, y: 0, scale: 1 });
  for (const gender of ['male', 'female']) {
    assert.deepEqual(archerHelmPlacement(gender, 'idle', 0), { x: 0, y: 0, scale: 1 });
    assert.deepEqual(archerHelmPlacement(gender, 'idle', 5), { x: 0, y: 0, scale: 1 }, '서기는 1프레임');
    for (const motion of ['walk', 'attack']) {
      const seen = new Set();
      for (let frame = 0; frame < 4; frame++) {
        const place = archerHelmPlacement(gender, motion, frame);
        assert(Number.isFinite(place.x) && Number.isFinite(place.y) && Number.isFinite(place.scale));
        assert(place.scale > .5 && place.scale <= 1, `${gender} ${motion}${frame} 배율`);
        seen.add(`${place.x}/${place.y}/${place.scale}`);
      }
      assert.equal(seen.size, 4, `${gender} ${motion} 프레임마다 자리가 달라야 합니다`);
    }
    // 사격은 인물이 작게 그려져 투구도 줄어든다.
    assert(archerHelmPlacement(gender, 'attack', 0).scale < archerHelmPlacement(gender, 'walk', 0).scale);
    // 프레임은 4로 접힌다.
    assert.deepEqual(archerHelmPlacement(gender, 'walk', 4), archerHelmPlacement(gender, 'walk', 0));
    assert.deepEqual(archerHelmPlacement(gender, 'walk', -1), archerHelmPlacement(gender, 'walk', 3));
  }
});

test('궁수가 투구를 쓰면 필드가 머리 없는 시트 + 투구 파츠로 그린다', () => {
  // [작업 216] 빈손이면 nobow 판을 쓰므로, 투구만 보는 이 테스트는 0번 활을 찬다.
  const save = archerSave('male', baseItems.helmet[5], bowBases[0]);
  const game = view();
  const running = world(save);
  drawHero.call(game, running, 100, 100, 0);
  assert.equal(game.hero.texture, game.textures.archerMale, '파츠·시트 로딩 전에는 기본 시트로 폴백');
  assert.equal(game.heroHelmet, undefined, '파츠가 없으면 투구 스프라이트를 만들지 않는다');
  assert.deepEqual(game.archerHeadlessPrefetchCalls, [['male', false]], '머리 없는 시트 3장을 미리 받는다');

  const part = texture();
  const headless = texture();
  game.helmetTextures.set(archerHelmPartPath('male', 5), part);
  game.armorSheets.set(archerHeadlessBodyPath('male', 'idle'), headless);
  drawHero.call(game, running, 100, 100, .1);
  assert.equal(game.hero.texture, headless, '머리 없는 서기 시트로 갈아 끼운다');
  assert(game.heroHelmet, '투구 파츠 스프라이트를 만든다');
  assert.equal(game.heroHelmet.anchor.x, 0);
  assert.equal(game.heroHelmet.anchor.y, 0);
  const place = archerHelmPlacement('male', 'idle', 0);
  assert.equal(game.heroHelmet.scale.x, place.scale);
  assert.equal(game.heroHelmet.rotation, 0);
  assert.equal(game.heroHelmet.visible, true);
  assert.equal(game.heroWeapon, undefined, '전사 대검 파츠는 만들지 않는다');
});

test('걷기·사격 프레임은 그 자세의 배율·좌상단 좌표로 투구를 옮긴다', () => {
  const save = archerSave('female', baseItems.helmet[9]);
  const game = view();
  const running = world(save);
  game.helmetTextures.set(archerHelmPartPath('female', 9), texture());
  for (const motion of ['walk', 'attack']) {
    for (let frame = 0; frame < 4; frame++) {
      game.armorSheets.set(archerHeadlessBodyPath('female', motion), texture());
      running.activeMove = motion === 'walk' ? { x: 1, y: 0 } : { x: 0, y: 0 };
      game.heroWalkDistance = motion === 'walk' ? frame * 12 : 0;
      running.attackPose = motion === 'attack' ? .32 * (1 - (frame + .5) / 4) : 0;
      drawHero.call(game, running, 100, 100, .1 + frame * .1);
      const place = archerHelmPlacement('female', motion, frame);
      assert(Math.abs(game.heroHelmet.scale.x - place.scale) < 1e-9, `${motion}${frame} 배율`);
      assert.equal(game.heroHelmet.visible, true, `${motion}${frame} 표시`);
      assert.notEqual(game.hero.texture, game.textures.archerFemale, `${motion}${frame} 머리 없는 시트`);
    }
  }
});

test('활 1번 이상 + 투구를 함께 쓰면 머리 없는 nobow 시트 위에 활·투구를 얹는다', () => {
  const save = archerSave('male', baseItems.helmet[0], '룬 각궁');
  const game = view();
  const running = world(save);
  game.helmetTextures.set(archerHelmPartPath('male', 0), texture());
  game.bowSheets.set('/assets/pilot-25d/bows/bow_5_v1.png?v=3', texture());
  const headlessBow = texture();
  game.armorSheets.set(archerHeadlessBodyPath('male', 'idle', true), headlessBow);
  game.armorSheets.set('/assets/pilot-25d/nobow/archer_male_idle_v1.png?v=3', texture());
  drawHero.call(game, running, 100, 100, .2);
  assert.equal(game.hero.texture, headlessBow, '머리 없는 nobow 시트');
  assert(game.heroBow, '활 파츠');
  assert(game.heroHelmet, '투구 파츠');
  assert.deepEqual(game.archerHeadlessPrefetchCalls.at(-1), ['male', true], '활을 차면 nobow 판을 받는다');
});

test('투구를 벗으면 머리 있는 시트로 돌아가고 투구 스프라이트를 숨긴다', () => {
  const save = archerSave('male', baseItems.helmet[3]);
  const game = view();
  const running = world(save);
  game.helmetTextures.set(archerHelmPartPath('male', 3), texture());
  game.armorSheets.set(archerHeadlessBodyPath('male', 'idle'), texture());
  drawHero.call(game, running, 100, 100, .1);
  assert.equal(game.heroHelmet.visible, true);
  save.equipment.helmet = undefined;
  drawHero.call(game, running, 100, 100, .2);
  assert.equal(game.hero.texture, game.textures.archerMale);
  assert.equal(game.heroHelmet.visible, false);
});

test('마법사·전사는 궁수 투구 파츠를 쓰지 않는다', () => {
  for (const job of ['mage', 'warrior']) {
    const save = freshSave('male', job);
    save.knockback = undefined;
    save.equipment.helmet = helmetItem(baseItems.helmet[4]);
    assert.equal(archerHelmIndexFor(save), job === 'mage' ? 4 : 4, '인덱스 자체는 읽는다');
    const plan = equipmentPortraitPlan(save);
    assert.equal(plan.archerHelm, undefined, `${job} 는 궁수 투구 연출 없음`);
  }
});

test('장비창 초상화도 머리 없는 시트 + 같은 좌표의 궁수 투구 파츠를 쓴다', () => {
  const save = archerSave('female', baseItems.helmet[7], bowBases[0]);
  const plan = equipmentPortraitPlan(save);
  assert.equal(plan.base, archerHeadlessBodyPath('female', 'idle', false));
  assert.equal(plan.archerHelm?.path, archerHelmPartPath('female', 7));
  assert.equal(plan.archerHelm?.x, 0);
  assert.equal(plan.archerHelm?.y, 0);
  assert.equal(plan.archerHelm?.scale, 1);
  assert(plan.key.includes(archerHelmPartPath('female', 7)), '투구가 바뀌면 초상화 캐시 키도 바뀐다');
  assert.equal(plan.helmet, undefined, '전사 투구 파츠를 얹지 않는다');

  const withBow = archerSave('female', baseItems.helmet[7], '패왕의 신궁');
  const bowPlan = equipmentPortraitPlan(withBow);
  assert.equal(bowPlan.base, archerHeadlessBodyPath('female', 'idle', true), '활을 차면 nobow 판');
  assert(bowPlan.key.includes(bowPlan.archerHelm.path) && bowPlan.key.includes(bowPlan.bow.path));

  const plain = archerSave('female');
  assert.equal(equipmentPortraitPlan(plain).archerHelm, undefined, '투구를 안 쓰면 파츠 없음');
  assert.equal(equipmentPortraitPlan(plain).base, '/assets/pilot-25d/nobow/archer_female_idle_v1.png?v=3', '활을 안 차면 빈손(nobow) 시트');
});
