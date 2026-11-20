import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { Container, Sprite, Texture } from 'pixi.js';
import './ts-loader.mjs';

const {
  MAGE_HELM_COUNT, MAGE_HELM_EXTRA_TOP, mageHelmPartPath, mageHelmPartPaths, mageHelmPlacement,
  mageHelmIdlePlacement, mageHelmIndexFor, mageHeadlessBodyPath, mageHeadlessBodyPaths
} = await import('../src/game/render/mageHelmets.ts');
const { staffPartPath } = await import('../src/game/render/staffs.ts');
const { GameView, renderAssetPaths } = await import('../src/game/render.ts');
const { drawHero } = await import('../src/game/render/entities.ts');
const { freshSave } = await import('../src/game/store.ts');
const { baseItems } = await import('../src/game/items.ts');
const { equipmentPortraitPlan, equipmentPortraitStaff } = await import('../src/ui/equipmentPortrait.ts');

const helmetItem = name => ({ id: name, slot: 'helmet', name, rarity: 'rare', stats: { defense: 8 } });
const fileOf = path => new URL(`../public${path}`, import.meta.url);

/** 팔레트(tRNS)·RGBA PNG의 알파를 읽는다(archer-helm-render.test.mjs와 같은 디코더). */
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

/** 셀 좌표 상자(서기 셀 기준)의 불투명 픽셀 수. 파츠는 셀 위로 EXTRA 행이 더 있다. */
const opaqueIn = (art, box, rowOffset = 0) => {
  let count = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    const row = y + rowOffset;
    if (row < 0 || row >= art.height) continue;
    for (let x = box.x0; x <= box.x1; x++) if (art.alpha[row * art.width + x] > 128) count += 1;
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

/** `drawHero` 가 쓰는 만큼만 갖춘 마법사 뷰(시트 캐시·미리 받기는 실제 GameView 구현을 붙인다). */
function view() {
  const layer = new Container();
  const hero = new Sprite(texture());
  hero.anchor.set(.5, .97);
  layer.addChild(hero);
  const frames = n => Array.from({ length: n }, () => texture());
  const game = {
    hero, heroLayer: layer, heroGear: new Map(), gearTextures: new Map(), gearLoading: new Set(),
    helmetTextures: new Map(), heroHelmet: undefined, heroMageHelm: undefined,
    lastHeroWorld: { x: 0, y: 0 }, heroWalkDistance: 0,
    textures: { mageMale: texture(), mageFemale: texture(), pilotMale: texture(), pilotFemale: texture() },
    animations: {
      mageMaleWalk: frames(8), mageFemaleWalk: frames(8),
      mageMaleAttack: frames(4), mageFemaleAttack: frames(4),
      pilotMaleWalk: frames(8), pilotFemaleWalk: frames(8),
      pilotMaleAttack: frames(4), pilotFemaleAttack: frames(4)
    },
    app: { screen: { height: 800 } },
    ground: { ellipse: () => ({ fill() {} }) },
    glow: { circle: () => ({ fill() {} }) },
    armorSheets: new Map(), armorFrames: new Map(), armorLoading: new Set(), armorTierOrder: [], lastBodyTier: '',
    weaponSheets: new Map(), weaponLoading: new Set(), weaponTierOrder: [], lastWeaponTier: -1, heroWeapon: undefined,
    bowSheets: new Map(), bowLoading: new Set(), bowTierOrder: [], lastBowTier: -1, heroBow: undefined,
    staffSheets: new Map(), staffLoading: new Set(), staffTierOrder: [], lastStaffTier: -1, heroStaff: undefined,
    lastMageHelm: -1, lastMageHelmStaff: ''
  };
  game.armorFrame = GameView.prototype.armorFrame.bind(game);
  game.bodySheetFrame = GameView.prototype.bodySheetFrame.bind(game);
  game.staffBodyFrame = GameView.prototype.staffBodyFrame.bind(game);
  game.staffPart = GameView.prototype.staffPart.bind(game);
  game.mageHeadlessFrame = GameView.prototype.mageHeadlessFrame.bind(game);
  game.loadArmorSheet = () => {};
  game.loadStaffPart = () => {};
  game.prefetchBody = () => {};
  game.prefetchStaff = () => {};
  game.mageHeadlessPrefetchCalls = [];
  game.prefetchMageHeadless = function prefetch(gender, staffless) {
    this.mageHeadlessPrefetchCalls.push([gender, staffless]);
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

function mageSave(gender = 'male', helmet, staff) {
  const save = freshSave(gender, 'mage');
  save.knockback = undefined;
  if (helmet) save.equipment.helmet = helmetItem(helmet);
  if (staff) save.equipment.weapon = { id: staff, slot: 'weapon', name: staff, rarity: 'rare', stats: { attack: 10 } };
  return save;
}

test('마법사 모자·투구 10종 이름이 모두 기본형 인덱스 0~9 로 매핑되고, 없으면 투구 없음', () => {
  assert.equal(baseItems.helmet.length, MAGE_HELM_COUNT);
  for (let index = 0; index < MAGE_HELM_COUNT; index++) {
    assert.equal(mageHelmIndexFor(mageSave('male', baseItems.helmet[index])), index, `${baseItems.helmet[index]} → ${index}`);
    const dropped = mageSave('female', `정교한 ${baseItems.helmet[index]}`);
    assert.equal(mageHelmIndexFor(dropped), index, `정교한 ${baseItems.helmet[index]}`);
  }
  // 레거시 이름(`낡은 투구`)은 전사·궁수와 같은 인덱스(심연의 뿔투구)로 접힌다.
  assert.equal(mageHelmIndexFor(mageSave('male', '낡은 투구')), baseItems.helmet.indexOf('심연의 뿔투구'));
  assert.equal(mageHelmIndexFor(mageSave('male')), -1, '투구를 안 쓰면 파츠를 그리지 않는다');
  const wrong = mageSave('male');
  wrong.equipment.helmet = { id: 'x', slot: 'helmet', name: '알 수 없는 머리장식', rarity: 'rare', stats: {} };
  assert.equal(mageHelmIndexFor(wrong), -1, '기본형 이름이 아니면 그리지 않는다');
});

test('마법사 투구 파츠 20장이 셀 위 여유(44행)를 가진 규격으로 있고 머리 자리에 내용이 있다', () => {
  const face = { x0: 165, x1: 215, y0: 25, y1: 80 };
  for (const gender of ['male', 'female']) {
    const above = [];
    for (let index = 0; index < MAGE_HELM_COUNT; index++) {
      const path = mageHelmPartPath(gender, index);
      assert(path, `${gender} ${index} 경로`);
      const file = fileOf(path);
      assert(existsSync(file), `파츠 파일: ${path}`);
      const art = decodeAlpha(readFileSync(file));
      assert.deepEqual([art.width, art.height], [362, 362 + MAGE_HELM_EXTRA_TOP], `${path} 셀 규격`);
      assert(opaqueIn(art, face, MAGE_HELM_EXTRA_TOP) > 400, `${path} 머리 자리가 비었습니다`);
      // 고깔모·후광·날개는 셀 위 여유 행까지 실제로 뻗는다(여유 행이 없으면 그 부분이 잘린다).
      above.push(opaqueIn(art, { x0: 60, x1: 300, y0: -MAGE_HELM_EXTRA_TOP, y1: 4 }, MAGE_HELM_EXTRA_TOP));
      assert(statSync(file).size < 60 * 1024, `${path} 용량 ${statSync(file).size}바이트`);
    }
    // 높은 장식(고깔모·후광·날개·뿔·왕관)이 여러 티어에 있으니 여유 행을 쓰는 파츠가 4장 이상이어야 한다.
    assert(above.filter(count => count > 0).length >= 4, `${gender} 셀 위 여유를 쓰는 파츠가 부족합니다: ${above}`);
    assert(above[9] > 0, `${gender} 9번(왕관 후광)이 셀 위로 뻗어야 합니다`);
  }
  assert.equal(mageHelmPartPath('male', -1), undefined);
  assert.equal(mageHelmPartPath('male', MAGE_HELM_COUNT), undefined);
  assert.equal(mageHelmPartPaths.length, MAGE_HELM_COUNT * 2);
  // 20장 전부 부팅 프리로드에 들어간다(장당 9~19KB).
  for (const path of mageHelmPartPaths) assert(renderAssetPaths.includes(path), `${path} 프리로드 누락`);
});

test('머리 없는 마법사 본체 12장이 셀 규격대로 있고 머리만 지워졌다(어깨·가슴은 그대로)', () => {
  const sizes = { idle: [362, 362], walk: [1448, 362], attack: [1448, 362] };
  const head = { x0: 168, x1: 212, y0: 34, y1: 86 };
  // 얼굴 한가운데는 통째로 지워져야 한다(가장자리의 반투명 테두리는 파츠가 덮는다).
  const face = { x0: 176, x1: 204, y0: 42, y1: 74 };
  const chest = { x0: 140, x1: 240, y0: 180, y1: 300 };
  for (const gender of ['male', 'female']) {
    for (const staffless of [false, true]) {
      assert.equal(mageHeadlessBodyPaths(gender, staffless).length, 3, '서기·걷기·공격 3장');
      for (const motion of ['idle', 'walk', 'attack']) {
        const path = mageHeadlessBodyPath(gender, motion, staffless);
        const file = fileOf(path);
        assert(existsSync(file), `머리 없는 시트: ${path}`);
        const art = decodeAlpha(readFileSync(file));
        assert.deepEqual([art.width, art.height], sizes[motion], `${path} 규격`);
        if (motion !== 'idle') continue;
        // 서기 한 장은 머리·가슴을 직접 비교한다(걷기·공격은 프레임 좌표가 달라 규격만 본다).
        const source = staffless
          ? `/assets/pilot-25d/mage_nostaff/mage_${gender}_idle_v1.png?v=2`
          : `/assets/pilot-25d/mage_${gender}_idle_v1.png?v=2`;
        const before = decodeAlpha(readFileSync(fileOf(source)));
        assert(opaqueIn(before, head) > 300, `${source} 머리 영역 기준값`);
        assert(opaqueIn(art, face) <= opaqueIn(before, face) * .05, `${path} 에 얼굴이 남아 있습니다`);
        assert(opaqueIn(art, head) <= opaqueIn(before, head) * .05, `${path} 에 머리가 남아 있습니다`);
        assert(opaqueIn(art, chest) > opaqueIn(before, chest) * .9, `${path} 가슴·어깨가 지워졌습니다`);
      }
    }
  }
  // 머리 없는 시트는 부팅 프리로드에 넣지 않는다(쓰는 사람만 지팡이 여부별로 받는다).
  for (const gender of ['male', 'female']) {
    for (const path of mageHeadlessBodyPaths(gender)) assert(!renderAssetPaths.includes(path), `${path} 프리로드`);
  }
});

test('투구 자세 표는 서기 1 + 걷기·공격 4프레임이고, 파츠 높이만큼 위로 올라가 있다', () => {
  assert.deepEqual(mageHelmIdlePlacement, { x: 0, y: -MAGE_HELM_EXTRA_TOP, scale: 1 });
  for (const gender of ['male', 'female']) {
    assert.deepEqual(mageHelmPlacement(gender, 'idle', 0), { x: 0, y: -MAGE_HELM_EXTRA_TOP, scale: 1 });
    assert.deepEqual(mageHelmPlacement(gender, 'idle', 5), { x: 0, y: -MAGE_HELM_EXTRA_TOP, scale: 1 }, '서기는 1프레임');
    for (const motion of ['walk', 'attack']) {
      const seen = new Set();
      for (let frame = 0; frame < 4; frame++) {
        const place = mageHelmPlacement(gender, motion, frame);
        assert(Number.isFinite(place.x) && Number.isFinite(place.y) && Number.isFinite(place.scale));
        assert(place.scale > .5 && place.scale <= 1, `${gender} ${motion}${frame} 배율`);
        // 파츠 PNG 가 44행 더 크므로 좌상단 y 는 서기에서 -44, 걷기·공격은 그 자세의 머리 위치를 따른다.
        assert(place.y > -MAGE_HELM_EXTRA_TOP - 20 && place.y < 40, `${gender} ${motion}${frame} 좌상단 y`);
        seen.add(`${place.x}/${place.y}/${place.scale}`);
      }
      assert.equal(seen.size, 4, `${gender} ${motion} 프레임마다 자리가 달라야 합니다`);
    }
    // 공격은 시전 자세라 인물이 작게 그려지는 프레임이 있어 배율이 걷기 이하다.
    assert(mageHelmPlacement(gender, 'attack', 2).scale <= mageHelmPlacement(gender, 'walk', 0).scale);
    assert.deepEqual(mageHelmPlacement(gender, 'walk', 4), mageHelmPlacement(gender, 'walk', 0));
    assert.deepEqual(mageHelmPlacement(gender, 'walk', -1), mageHelmPlacement(gender, 'walk', 3));
  }
});

test('마법사가 투구를 쓰면 필드가 머리 없는 시트 + 투구 파츠로 그린다', () => {
  const save = mageSave('male', baseItems.helmet[5]);
  const game = view();
  const running = world(save);
  drawHero.call(game, running, 100, 100, 0);
  assert.equal(game.hero.texture, game.textures.mageMale, '파츠·시트 로딩 전에는 기본 시트로 폴백');
  assert.equal(game.heroMageHelm, undefined, '파츠가 없으면 투구 스프라이트를 만들지 않는다');
  assert.deepEqual(game.mageHeadlessPrefetchCalls, [['male', false]], '머리 없는 시트 3장을 미리 받는다');

  const part = texture();
  const headless = texture();
  game.helmetTextures.set(mageHelmPartPath('male', 5), part);
  game.armorSheets.set(mageHeadlessBodyPath('male', 'idle'), headless);
  drawHero.call(game, running, 100, 100, .1);
  assert.equal(game.hero.texture, headless, '머리 없는 서기 시트로 갈아 끼운다');
  assert(game.heroMageHelm, '투구 파츠 스프라이트를 만든다');
  assert.equal(game.heroMageHelm.anchor.x, 0);
  assert.equal(game.heroMageHelm.anchor.y, 0);
  const place = mageHelmPlacement('male', 'idle', 0);
  assert.equal(game.heroMageHelm.scale.x, place.scale);
  assert.equal(game.heroMageHelm.rotation, 0);
  assert.equal(game.heroMageHelm.visible, true);
  assert.equal(game.heroWeapon, undefined, '전사 대검 파츠는 만들지 않는다');
  assert.equal(game.heroHelmet, undefined, '전사 투구 스프라이트도 쓰지 않는다');
});

test('걷기·공격 프레임은 그 자세의 배율·좌상단 좌표로 투구를 옮긴다', () => {
  const save = mageSave('female', baseItems.helmet[9]);
  const game = view();
  const running = world(save);
  game.helmetTextures.set(mageHelmPartPath('female', 9), texture());
  for (const motion of ['walk', 'attack']) {
    for (let frame = 0; frame < 4; frame++) {
      game.armorSheets.set(mageHeadlessBodyPath('female', motion), texture());
      running.activeMove = motion === 'walk' ? { x: 1, y: 0 } : { x: 0, y: 0 };
      game.heroWalkDistance = motion === 'walk' ? frame * 12 : 0;
      running.attackPose = motion === 'attack' ? .32 * (1 - (frame + .5) / 4) : 0;
      drawHero.call(game, running, 100, 100, .1 + frame * .1);
      const place = mageHelmPlacement('female', motion, frame);
      assert(Math.abs(game.heroMageHelm.scale.x - place.scale) < 1e-9, `${motion}${frame} 배율`);
      assert.equal(game.heroMageHelm.visible, true, `${motion}${frame} 표시`);
      assert.notEqual(game.hero.texture, game.textures.mageFemale, `${motion}${frame} 머리 없는 시트`);
    }
  }
});

test('지팡이 + 투구를 함께 쓰면 지팡이 지운 머리 없는 시트 위에 지팡이·투구를 얹는다', () => {
  const save = mageSave('male', baseItems.helmet[0], '룬 지팡이');
  const game = view();
  const running = world(save);
  game.helmetTextures.set(mageHelmPartPath('male', 0), texture());
  game.staffSheets.set(staffPartPath(5), texture());
  const headlessNoStaff = texture();
  game.armorSheets.set(mageHeadlessBodyPath('male', 'idle', true), headlessNoStaff);
  drawHero.call(game, running, 100, 100, .2);
  assert.equal(game.hero.texture, headlessNoStaff, '머리 없는 nostaff 시트');
  assert(game.heroStaff, '지팡이 파츠');
  assert(game.heroMageHelm, '투구 파츠');
  assert.deepEqual(game.mageHeadlessPrefetchCalls.at(-1), ['male', true], '지팡이를 차면 nostaff 판을 받는다');
});

test('투구를 벗으면 머리 있는 시트로 돌아가고 투구 스프라이트를 숨긴다', () => {
  const save = mageSave('male', baseItems.helmet[3]);
  const game = view();
  const running = world(save);
  game.helmetTextures.set(mageHelmPartPath('male', 3), texture());
  game.armorSheets.set(mageHeadlessBodyPath('male', 'idle'), texture());
  drawHero.call(game, running, 100, 100, .1);
  assert.equal(game.heroMageHelm.visible, true);
  save.equipment.helmet = undefined;
  drawHero.call(game, running, 100, 100, .2);
  assert.equal(game.hero.texture, game.textures.mageMale);
  assert.equal(game.heroMageHelm.visible, false);
});

test('전사·궁수는 마법사 투구 파츠를 쓰지 않고, 초상화에도 얹지 않는다', () => {
  for (const job of ['warrior', 'archer']) {
    const save = freshSave('male', job);
    save.knockback = undefined;
    save.equipment.helmet = helmetItem(baseItems.helmet[4]);
    const plan = equipmentPortraitPlan(save);
    assert.equal(plan.mageHelm, undefined, `${job} 는 마법사 투구 연출 없음`);
  }
});

test('장비창 초상화도 머리 없는 시트 + 같은 좌표의 마법사 투구 파츠를 쓴다', () => {
  const save = mageSave('female', baseItems.helmet[7]);
  const plan = equipmentPortraitPlan(save);
  assert.equal(plan.base, mageHeadlessBodyPath('female', 'idle', false));
  assert.equal(plan.mageHelm?.path, mageHelmPartPath('female', 7));
  assert.equal(plan.mageHelm?.x, 0);
  assert.equal(plan.mageHelm?.y, -MAGE_HELM_EXTRA_TOP);
  assert.equal(plan.mageHelm?.scale, 1);
  assert(plan.key.includes(mageHelmPartPath('female', 7)), '투구가 바뀌면 초상화 캐시 키도 바뀐다');
  assert.equal(plan.helmet, undefined, '전사 투구 파츠를 얹지 않는다');

  const withStaff = mageSave('female', baseItems.helmet[7], '서리 지팡이');
  const staffPlan = equipmentPortraitPlan(withStaff);
  assert.equal(staffPlan.base, mageHeadlessBodyPath('female', 'idle', true), '지팡이를 차면 nostaff 판');
  assert(staffPlan.key.includes(staffPlan.mageHelm.path) && staffPlan.key.includes(staffPlan.staff.path));

  const plain = mageSave('female');
  assert.equal(equipmentPortraitPlan(plain).mageHelm, undefined, '투구를 안 쓰면 파츠 없음');
  assert.equal(equipmentPortraitPlan(plain).base, '/assets/pilot-25d/mage_female_idle_v1.png?v=2');
});

test('남성 지팡이는 서기에서만 0.83525배로 줄어 그려진다(작업 204 서기 본체 재생성)', () => {
  const male = equipmentPortraitStaff(mageSave('male', undefined, '룬 지팡이'));
  const female = equipmentPortraitStaff(mageSave('female', undefined, '룬 지팡이'));
  assert.equal(male?.scale, 0.83525);
  assert.equal(female?.scale, 1);
  assert.equal(male?.path, staffPartPath(5));
});
