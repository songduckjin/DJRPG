import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { Container, Sprite, Texture } from 'pixi.js';
import './ts-loader.mjs';

const {
  STAFF_COUNT, STAFF_POSES, STAFF_GRIP, staffIndexFor, staffPartPath, staffPartPaths, staffPose, staffPoseKey,
  usesStafflessBody, stafflessBodyPath, stafflessBodyPaths, staffTierCacheLimit
} = await import('../src/game/render/staffs.ts');
const { GameView, renderAssetPaths } = await import('../src/game/render.ts');
const { drawHero } = await import('../src/game/render/entities.ts');
const { freshSave } = await import('../src/game/store.ts');
const { baseItems, staffBases } = await import('../src/game/items.ts');
const { equipmentPortraitPlan } = await import('../src/ui/equipmentPortrait.ts');

const staffItem = name => ({ id: name, slot: 'weapon', name, rarity: 'rare', stats: { attack: 10 } });
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

function texture() {
  const canvas = {
    width: 362, height: 362,
    getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) })
  };
  return new Texture({ source: new (Object.getPrototypeOf(Texture.EMPTY.source).constructor)({ resource: canvas }) });
}

/** `drawHero` 가 쓰는 만큼만 갖춘 마법사 뷰. 본체 시트·지팡이 파츠 캐시는 실제 GameView 구현을 붙인다. */
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
    staffSheets: new Map(), staffLoading: new Set(), staffTierOrder: [], lastStaffTier: -1, heroStaff: undefined
  };
  game.armorFrame = GameView.prototype.armorFrame.bind(game);
  game.bodySheetFrame = GameView.prototype.bodySheetFrame.bind(game);
  game.staffBodyFrame = GameView.prototype.staffBodyFrame.bind(game);
  game.staffPart = GameView.prototype.staffPart.bind(game);
  game.loadArmorSheet = () => {};
  game.loadStaffPart = () => {};
  game.prefetchBody = function prefetch() { this.bodyPrefetchCalls.push([...arguments]); };
  game.prefetchStaff = function prefetch(index, gender) { this.staffPrefetchCalls.push([index, gender]); };
  game.bodyPrefetchCalls = [];
  game.staffPrefetchCalls = [];
  return game;
}

function world(save) {
  return {
    save,
    player: { x: 0, y: 0, facingSide: 1, facing: 0, hit: 0, berserk: 0, berserkLevel: 0 },
    activeMove: { x: 0, y: 0 }, attackPose: 0, effects: []
  };
}

function mageSave(gender = 'male', staff) {
  const save = freshSave(gender, 'mage');
  if (staff) save.equipment.weapon = staffItem(staff);
  return save;
}

test('지팡이 10종 이름이 모두 기본형 인덱스 0~9 로 매핑되고, 0번도 파츠를 쓴다', () => {
  assert.equal(staffBases.length, STAFF_COUNT);
  for (let index = 0; index < STAFF_COUNT; index++) {
    const save = mageSave('male', staffBases[index]);
    assert.equal(staffIndexFor(save), index, `${staffBases[index]} → ${index}`);
    assert.equal(usesStafflessBody(save), true, `${staffBases[index]} 도 기본 지팡이를 지운 시트를 쓴다`);
    assert.equal(staffPartPath(index), `/assets/pilot-25d/staffs/staff_${index}_v1.png?v=6`);
    // 접두사·강화 수식어가 붙은 드랍 이름도 같은 티어로 읽는다.
    assert.equal(staffIndexFor(mageSave('female', `황혼의 ${staffBases[index]}`)), index, `황혼의 ${staffBases[index]}`);
  }
  // 지팡이가 아니면 -1(파츠 없음).
  assert.equal(staffIndexFor(freshSave('male', 'mage')), -1);
  const sword = mageSave('male');
  sword.equipment.weapon = staffItem(baseItems.weapon[5]);
  assert.equal(staffIndexFor(sword), -1, '전사 대검은 지팡이 티어가 아니다');
});

test('지팡이 파츠 10장이 362px 셀 규격으로 있고 그립 자리에 자루가 있다', () => {
  for (let index = 0; index < STAFF_COUNT; index++) {
    const path = staffPartPath(index);
    const file = fileOf(path);
    assert(existsSync(file), `파츠 파일: ${path}`);
    const { width, height, alpha } = decodeAlpha(readFileSync(file));
    assert.equal(width, 362, `${path} 셀 폭`);
    assert.equal(height, 362, `${path} 셀 높이`);
    let opaque = 0;
    for (const value of alpha) if (value > 128) opaque += 1;
    assert(opaque > 400, `${path} 파츠가 너무 비었습니다: ${opaque}px`);
    // 그립 자리 자체는 손이 본체에 그려지므로 비어 있다. 손 위·아래로 자루가 이어지는지만 본다.
    let near = 0;
    for (let y = Math.round(STAFF_GRIP.y) - 46; y <= STAFF_GRIP.y + 46; y++) {
      for (let x = Math.round(STAFF_GRIP.x) - 46; x <= STAFF_GRIP.x + 46; x++) {
        if (alpha[y * width + x] > 128) near += 1;
      }
    }
    assert(near > 120, `${path} 그립 주변에 자루가 없습니다: ${near}px`);
    assert(statSync(file).size < 200 * 1024, `${path} 용량`);
  }
  assert.equal(staffPartPath(-1), undefined);
  assert.equal(staffPartPath(10), undefined);
  assert.deepEqual(staffPartPaths(4), [staffPartPath(4)]);
});

test('기본 지팡이를 지운 마법사 시트 6장이 셀 규격대로 있고, 서기에서 긴 지팡이가 실제로 지워졌다', () => {
  const sizes = { idle: [362, 362], walk: [1448, 362], attack: [1448, 362] };
  for (const gender of ['male', 'female']) {
    assert.equal(stafflessBodyPaths(gender).length, 3, '서기·걷기·공격 3장');
    for (const motion of ['idle', 'walk', 'attack']) {
      const path = stafflessBodyPath(gender, motion);
      const file = fileOf(path);
      assert(existsSync(file), `본체 시트: ${path}`);
      const { width, height } = decodeAlpha(readFileSync(file));
      assert.deepEqual([width, height], sizes[motion], `${path} 규격`);
    }
  }
  // 서기 셀에서 기본 지팡이 자루 영역의 불투명 픽셀이 크게 줄었는지 본다(자루가 허공으로 뻗은 자리).
  const original = decodeAlpha(readFileSync(fileOf('/assets/pilot-25d/mage_male_idle_v1.png')));
  const stripped = decodeAlpha(readFileSync(fileOf(stafflessBodyPath('male', 'idle'))));
  // 작업 204: 남성 서기 시트를 337px로 다시 구우면서 자루·주먹 자리가 같은 비율로 작아졌다.
  const shaft = { x0: 104, x1: 146, y0: 170, y1: 300 };
  const count = art => {
    let n = 0;
    for (let y = shaft.y0; y <= shaft.y1; y++) {
      for (let x = shaft.x0; x <= shaft.x1; x++) if (art.alpha[y * 362 + x] > 128) n += 1;
    }
    return n;
  };
  const before = count(original), after = count(stripped);
  assert(before > 300, `기본 지팡이 자루 영역 픽셀: ${before}`);
  assert(after < before * .2, `기본 지팡이가 지워지지 않았습니다: ${before} → ${after}`);
  // 손(그립)은 살아 있어야 한다 — 주먹이 지워지면 지팡이를 쥔 모습이 사라진다.
  const hand = { x0: 96, x1: 118, y0: 140, y1: 166 };
  let handBefore = 0, handAfter = 0;
  for (let y = hand.y0; y <= hand.y1; y++) {
    for (let x = hand.x0; x <= hand.x1; x++) {
      if (original.alpha[y * 362 + x] > 128) handBefore += 1;
      if (stripped.alpha[y * 362 + x] > 128) handAfter += 1;
    }
  }
  assert(handBefore > 200, `손 영역: ${handBefore}`);
  // 지팡이가 주먹을 가로지른 자리(보호 반경 밖 가장자리)만 조금 깎인다 — 주먹 모양은 남아야 한다.
  // 백로그 7번(2026-11-23)이 마법사 시트의 내부 반투명을 255로 복원해 `alpha>128`로 세는 픽셀이 양쪽 모두
  // 늘었다(381→405 · 270→283) — 비율 기준선이 함께 올라 70%가 69.9%로 걸치게 되어 여유를 65%로 둔다.
  assert(handAfter > handBefore * .65, `손이 지워졌습니다: ${handBefore} → ${handAfter}`);
});

test('지팡이 자세 표는 남녀 × 9자세고, 걷기·공격 프레임은 4프레임 안으로 접힌다', () => {
  for (const gender of ['male', 'female']) {
    const table = STAFF_POSES[gender];
    assert.deepEqual(Object.keys(table).sort(),
      ['attack0', 'attack1', 'attack2', 'attack3', 'idle0', 'walk0', 'walk1', 'walk2', 'walk3']);
    for (const pose of Object.values(table)) {
      assert(Number.isFinite(pose.x) && Number.isFinite(pose.y) && Number.isFinite(pose.rot));
      assert(pose.x > 0 && pose.x < 362 && pose.y > 0 && pose.y < 362);
    }
    // 공격은 지팡이를 앞으로 내밀어 크게 돈다(걷기는 서기와 거의 같은 각도).
    assert(Math.abs(table.attack1.rot) > 30, `${gender} 공격 회전각`);
    for (const key of ['walk0', 'walk1', 'walk2', 'walk3']) {
      assert(Math.abs(table[key].rot) < 12, `${gender} ${key} 회전각`);
    }
  }
  assert.equal(staffPoseKey('idle', 5), 'idle0');
  assert.equal(staffPoseKey('walk', 6), 'walk2');
  assert.equal(staffPoseKey('attack', 3), 'attack3');
  assert.equal(staffPoseKey('attack', 7), 'attack3');
  assert.equal(staffPoseKey('walk', -1), 'walk3');
  assert.deepEqual(staffPose('male', 'walk', 6), STAFF_POSES.male.walk2);
});

test('지팡이 파츠·nostaff 시트는 부팅 프리로드에 넣지 않고 티어별로만 받는다', () => {
  for (let index = 0; index < STAFF_COUNT; index++) {
    assert(!renderAssetPaths.includes(staffPartPath(index)), `${staffPartPath(index)} 가 부팅 프리로드에 들어감`);
  }
  for (const gender of ['male', 'female']) {
    for (const path of stafflessBodyPaths(gender)) {
      assert(!renderAssetPaths.includes(path), `${path} 가 부팅 프리로드에 들어감`);
    }
  }
  assert.equal(staffTierCacheLimit, 3);
});

test('마법사가 지팡이를 차면 필드가 nostaff 시트 위에 지팡이 파츠를 얹는다', () => {
  const save = mageSave('male', '룬 지팡이');
  const game = view();
  const running = world(save);
  drawHero.call(game, running, 100, 100, 0);
  assert.equal(game.hero.texture, game.textures.mageMale, '시트 로딩 전에는 기본 시트로 폴백');
  assert.equal(game.heroStaff, undefined, '파츠 로딩 전에는 파츠 스프라이트를 만들지 않는다');
  assert.deepEqual(game.staffPrefetchCalls, [[5, 'male']], '룬 지팡이는 5번 — 파츠와 nostaff 시트를 미리 받는다');

  const stripped = texture();
  game.armorSheets.set(stafflessBodyPath('male', 'idle'), stripped);
  game.staffSheets.set(staffPartPath(5), texture());
  drawHero.call(game, running, 100, 100, .1);
  assert.equal(game.hero.texture, stripped, 'nostaff 서기 시트로 갈아 끼운다');
  assert(game.heroStaff, '지팡이 파츠 스프라이트를 만든다');
  const pose = STAFF_POSES.male.idle0;
  const part = game.heroStaff.texture;
  assert.equal(game.heroStaff.anchor.x, STAFF_GRIP.x / part.width);
  assert.equal(game.heroStaff.anchor.y, STAFF_GRIP.y / part.height);
  assert(Math.abs(game.heroStaff.rotation - pose.rot * Math.PI / 180) < 1e-9);
  assert.equal(game.heroWeapon, undefined, '전사 대검 파츠는 만들지 않는다');
  assert.equal(game.heroBow, undefined, '궁수 활 파츠는 만들지 않는다');
  assert.equal(game.heroStaff.visible, true);
});

test('걷기·공격 프레임은 그 자세의 그립 좌표·회전각으로 파츠를 옮긴다', () => {
  const save = mageSave('female', '서리 지팡이');
  const game = view();
  const running = world(save);
  game.staffSheets.set(staffPartPath(4), texture());
  for (const motion of ['walk', 'attack']) {
    for (let frame = 0; frame < 4; frame += 1) {
      game.armorSheets.set(stafflessBodyPath('female', motion), texture());
      running.activeMove = motion === 'walk' ? { x: 1, y: 0 } : { x: 0, y: 0 };
      game.heroWalkDistance = motion === 'walk' ? frame * 12 : 0;
      running.attackPose = motion === 'attack' ? .32 * (1 - (frame + .5) / 4) : 0;
      drawHero.call(game, running, 100, 100, .1 + frame * .1);
      const pose = staffPose('female', motion, frame);
      assert(Math.abs(game.heroStaff.rotation - pose.rot * Math.PI / 180) < 1e-9, `${motion}${frame} 회전각`);
      assert.equal(game.heroStaff.visible, true);
    }
  }
});

test('0번(견습생의 지팡이)도 파츠를 얹어 기본 긴 지팡이 잔상이 없다', () => {
  const save = mageSave('male', '견습생의 지팡이');
  const game = view();
  const running = world(save);
  game.armorSheets.set(stafflessBodyPath('male', 'idle'), texture());
  game.staffSheets.set(staffPartPath(0), texture());
  drawHero.call(game, running, 100, 100, 0);
  assert.equal(game.hero.texture, game.armorSheets.get(stafflessBodyPath('male', 'idle')), '기본 시트가 아니라 nostaff 시트');
  assert.equal(game.heroStaff.visible, true);
  assert.deepEqual(game.staffPrefetchCalls, [[0, 'male']], '0번도 파츠를 받는다');
});

test('지팡이가 없으면 기본 시트를 그대로 쓰고 파츠를 숨긴다', () => {
  const game = view();
  const running = world(mageSave('male'));
  game.staffSheets.set(staffPartPath(2), texture());
  drawHero.call(game, running, 100, 100, 0);
  assert.equal(game.hero.texture, game.textures.mageMale);
  assert.equal(game.staffPrefetchCalls.length, 0, '미착용은 파츠를 받지 않는다');
});

test('장비창 초상화도 nostaff 시트 + 지팡이 파츠를 쓴다', () => {
  const save = mageSave('female', '대현자의 성지팡이');
  const plan = equipmentPortraitPlan(save);
  assert.equal(plan.base, stafflessBodyPath('female', 'idle'));
  assert.equal(plan.staff?.path, staffPartPath(9));
  const pose = STAFF_POSES.female.idle0;
  assert.equal(plan.staff?.x, pose.x);
  assert.equal(plan.staff?.y, pose.y);
  assert.equal(plan.staff?.rotation, pose.rot);
  assert.equal(plan.weapon, undefined, '전사 대검 파츠는 얹지 않는다');
  assert.equal(plan.bow, undefined, '궁수 활 파츠는 얹지 않는다');
  assert(plan.key.includes(staffPartPath(9)), `캐시 키에 지팡이 파츠가 들어간다: ${plan.key}`);

  const none = equipmentPortraitPlan(mageSave('male'));
  // [작업 216] 지팡이를 안 챈 캐릭터는 기본 지팡이를 지운 시트(빈손)로 그린다.
  assert.equal(none.base, stafflessBodyPath('male', 'idle'), '미착용은 nostaff(빈손) 서기 시트');
  assert.equal(none.staff, undefined);
});
