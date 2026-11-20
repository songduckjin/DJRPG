import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { Container, Sprite, Texture } from 'pixi.js';
import './ts-loader.mjs';

const {
  WEAPON_COUNT, WEAPON_POSES, WEAPON_GUARD, weaponIndexFor, weaponPartPath, weaponPartPaths,
  weaponPose, weaponPoseKey, usesSwordlessBody, swordlessBodyPath, swordlessBodyPaths, weaponTierCacheLimit
} = await import('../src/game/render/weapons.ts');
const { GameView, renderAssetPaths } = await import('../src/game/render.ts');
const { drawHero } = await import('../src/game/render/entities.ts');
const { armorSheetPath, ARMOR_COUNT } = await import('../src/game/render/armors.ts');
const { headlessBodyPaths } = await import('../src/game/render/helmets.ts');
const { freshSave } = await import('../src/game/store.ts');
const { baseItems } = await import('../src/game/items.ts');
const { equipmentPortraitPlan, equipmentFallbackPortrait } = await import('../src/ui/equipmentPortrait.ts');

const weaponItem = name => ({ id: name, slot: 'weapon', name, rarity: 'rare', stats: {} });
const fileOf = path => new URL(`../public${path}`, import.meta.url);

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

/** `drawHero` 가 쓰는 만큼만 갖춘 뷰. 본체 시트·무기 파츠 캐시는 실제 GameView 구현을 붙인다. */
function view() {
  const layer = new Container();
  const hero = new Sprite(texture());
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
    weaponSheets: new Map(), weaponLoading: new Set(), weaponTierOrder: [], lastWeaponTier: -1, heroWeapon: undefined
  };
  game.armorFrame = GameView.prototype.armorFrame.bind(game);
  game.bodySheetFrame = GameView.prototype.bodySheetFrame.bind(game);
  game.swordlessBodyFrame = GameView.prototype.swordlessBodyFrame.bind(game);
  game.weaponPart = GameView.prototype.weaponPart.bind(game);
  game.loadArmorSheet = () => {};
  game.loadWeaponPart = () => {};
  game.bodyPrefetchCalls = [];
  game.weaponPrefetchCalls = [];
  game.prefetchBody = function prefetch(gender, armor, swordless) {
    this.bodyPrefetchCalls.push(armor >= 0 ? [gender, armor, swordless] : [gender, armor, swordless]);
  };
  game.prefetchWeapon = function prefetch(index) { this.weaponPrefetchCalls.push(index); };
  return game;
}

function world(save) {
  return {
    save,
    player: { x: 0, y: 0, facingSide: 1, facing: 0, hit: 0, berserk: 0, berserkLevel: 0 },
    activeMove: { x: 0, y: 0 }, attackPose: 0, effects: []
  };
}

test('대검 10종 이름이 모두 기본형 인덱스 0~9 로 매핑되고, 1~9번만 파츠를 쓴다', () => {
  assert.equal(baseItems.weapon.length, WEAPON_COUNT);
  for (let index = 0; index < WEAPON_COUNT; index++) {
    const save = freshSave('male');
    save.equipment.weapon = weaponItem(baseItems.weapon[index]);
    assert.equal(weaponIndexFor(save), index, `${baseItems.weapon[index]} → ${index}`);
    assert.equal(usesSwordlessBody(save), index >= 1, `${baseItems.weapon[index]} 는 ${index >= 1 ? '무기 없는 시트' : '기준 시트'}`);
  }
  assert.equal(weaponPartPath(0), undefined, '0번(두손검)은 본체 시트에 그려져 있다');
  for (let index = 1; index < WEAPON_COUNT; index++) {
    assert.equal(weaponPartPath(index), `/assets/pilot-25d/weapons/weapon_${index}_v1.png`);
    assert.deepEqual(weaponPartPaths(index), [weaponPartPath(index)]);
  }
  assert.equal(weaponPartPath(10), undefined);
  assert.equal(weaponIndexFor({ equipment: {} }), 0, '무기가 없으면 0번 취급');
  assert.equal(weaponTierCacheLimit, 3, '최근 3티어만 유지');
});

test('대검 파츠 9장이 362px 셀 규격으로 있고 손잡이(가드) 자리에 그림이 있다', () => {
  for (let index = 1; index < WEAPON_COUNT; index++) {
    const path = weaponPartPath(index);
    const file = fileOf(path);
    assert(existsSync(file), `파츠 파일: ${path}`);
    const data = readFileSync(file);
    const { width, height, alpha } = decodeAlpha(data);
    assert.equal(width, 362, `${path} 셀 폭`);
    assert.equal(height, 362, `${path} 셀 높이`);
    let opaque = 0;
    for (const value of alpha) if (value > 128) opaque += 1;
    assert(opaque > 1200, `${path} 파츠가 너무 비었습니다: ${opaque}px`);
    // 앵커 자체는 손잡이라 투명할 수 있으므로, 앵커 주변(±14px)에 검이 있는지만 본다.
    let near = 0;
    for (let y = Math.round(WEAPON_GUARD.y) - 14; y <= WEAPON_GUARD.y + 14; y++) {
      for (let x = Math.round(WEAPON_GUARD.x) - 14; x <= WEAPON_GUARD.x + 14; x++) {
        if (alpha[y * width + x] > 128) near += 1;
      }
    }
    assert(near > 40, `${path} 손잡이 자리에 검이 없습니다: ${near}px`);
    assert(statSync(file).size < 200 * 1024, `${path} 용량`);
  }
});

test('기본 검을 지운 시트가 본체 6종·갑옷 120장에 짝으로 있고 칼날이 실제로 지워졌다', () => {
  const sizes = { idle: [362, 362], walk: [1448, 362], attack: [1448, 362] };
  for (const gender of ['male', 'female']) {
    assert.equal(swordlessBodyPaths(gender).length, 6);
    for (const path of swordlessBodyPaths(gender)) assert(existsSync(fileOf(path)), `본체 시트: ${path}`);
    for (const motion of ['idle', 'walk', 'attack']) {
      for (const headless of [false, true]) {
        for (let index = 0; index < ARMOR_COUNT; index++) {
          const path = armorSheetPath(gender, index, motion, headless, true);
          assert(path.includes('/noweapon/armors/'), `경로 규칙: ${path}`);
          assert(existsSync(fileOf(path)), `갑옷 시트: ${path}`);
          const { width, height } = decodeAlpha(readFileSync(fileOf(path)));
          assert.equal(width, sizes[motion][0]);
          assert.equal(height, sizes[motion][1]);
        }
      }
    }
  }
  // 서기 셀에서 기본 검(칼끝은 셀 왼쪽 8~36px)이 지워졌는지 본다 — 검 없이 찍은 시트는 왼쪽 끝이 몸통(≈134px)이다.
  for (const gender of ['male', 'female']) {
    const original = decodeAlpha(readFileSync(fileOf(`/assets/pilot-25d/warrior_${gender}_idle_v1.png`)));
    const stripped = decodeAlpha(readFileSync(fileOf(swordlessBodyPath(gender, 'idle').split('?')[0])));
    const leftmost = art => {
      for (let x = 0; x < 362; x++) {
        for (let y = 0; y < 362; y++) if (art.alpha[y * 362 + x] > 60) return x;
      }
      return 362;
    };
    const before = leftmost(original), after = leftmost(stripped);
    assert(after > before + 80, `${gender}: 기본 검(왼쪽 칼끝)이 지워지지 않았습니다: x ${before} → ${after}`);
    // 칼날이 지나던 띠에서 불투명 픽셀도 크게 줄어야 한다(뒤에 있던 다리·스커트는 남는다).
    const blade = { x0: 8, x1: 170, y0: 225, y1: 350 };
    const count = art => {
      let n = 0;
      for (let y = blade.y0; y <= blade.y1; y++) {
        for (let x = blade.x0; x <= blade.x1; x++) if (art.alpha[y * 362 + x] > 128) n += 1;
      }
      return n;
    };
    const px = count(original), py = count(stripped);
    assert(px > 2000, `${gender} 기본 검 영역 픽셀: ${px}`);
    assert(py < px * .6, `${gender} 기본 검이 지워지지 않았습니다: ${px} → ${py}`);
  }
});

test('자세 표는 남녀 × 9자세(+갑옷 서기 앵커)고, 걷기·공격 프레임은 4프레임 안으로 접힌다', () => {
  for (const gender of ['male', 'female']) {
    const table = WEAPON_POSES[gender];
    // 작업 218: 갑옷 서기 시트는 손 위치가 달라 `idleArmor` 앵커를 하나 더 둔다.
    assert.deepEqual(Object.keys(table).sort(), ['attack0', 'attack1', 'attack2', 'attack3', 'idle0', 'idleArmor', 'walk0', 'walk1', 'walk2', 'walk3']);
    assert.equal(weaponPose(gender, 'idle', 0, 0), table.idleArmor, '갑옷 0번은 갑옷 앵커');
    assert.equal(weaponPose(gender, 'idle', 0, -1), table.idle0, '맨몸은 기준 앵커');
    assert.equal(weaponPose(gender, 'walk', 0, 3), table.walk0, '걷기는 갑옷과 무관');
    // 작업 218: 서기 자세가 '낮은 양손 그립'으로 바뀌어 파츠를 칼날선에 맞춰 조금만 돌린다(±8° 이내).
    assert(Math.abs(table.idle0.rot) < 8, `${gender} idle 보정 각 ${table.idle0.rot}°`);
    for (const pose of Object.values(table)) {
      assert(Number.isFinite(pose.x) && Number.isFinite(pose.y) && Number.isFinite(pose.rot));
      assert(pose.x > 0 && pose.x < 362 && pose.y > 0 && pose.y < 362);
    }
  }
  assert.equal(weaponPoseKey('idle', 5), 'idle0');
  assert.equal(weaponPoseKey('walk', 6), 'walk2');
  assert.equal(weaponPoseKey('attack', 3), 'attack3');
  assert.equal(weaponPoseKey('attack', 7), 'attack3');
  assert.equal(weaponPoseKey('walk', -1), 'walk3');
  assert.deepEqual(weaponPose('male', 'walk', 6), WEAPON_POSES.male.walk2);
});

test('대검 파츠는 부팅 프리로드에 넣지 않고 티어별로만 받는다', () => {
  for (let index = 1; index < WEAPON_COUNT; index++) {
    assert(!renderAssetPaths.includes(weaponPartPath(index)), `${weaponPartPath(index)} 가 부팅 프리로드에 들어감`);
  }
  for (const path of swordlessBodyPaths('male')) assert(!renderAssetPaths.includes(path), `${path} 가 부팅 프리로드에 들어감`);
});

test('대검을 차면 필드가 기본 검 없는 시트 위에 파츠를 얹는다', () => {
  const save = freshSave('male');
  save.equipment.weapon = weaponItem('룬 블레이드');
  const game = view();
  const running = world(save);
  drawHero.call(game, running, 100, 100, 0);
  assert.equal(game.hero.texture, game.textures.pilotMale, '시트 로딩 전에는 기준 시트로 폴백');
  assert.equal(game.heroWeapon, undefined, '파츠 로딩 전에는 파츠 스프라이트를 만들지 않는다');
  assert.deepEqual(game.bodyPrefetchCalls.at(-1), ['male', -1, true], '기본 검 없는 본체 시트를 미리 받는다');
  assert.deepEqual(game.weaponPrefetchCalls, [5], '룬 블레이드는 5번 — 파츠 1장을 미리 받는다');

  const stripped = texture();
  game.armorSheets.set(swordlessBodyPath('male', 'idle'), stripped);
  const part = new Sprite(texture());
  game.weaponSheets.set(weaponPartPath(5), part.texture);
  drawHero.call(game, running, 100, 100, .1);
  assert.equal(game.hero.texture, stripped, '기본 검 없는 시트로 그린다');
  assert.equal(game.heroWeapon.visible, true, '파츠를 그린다');
  assert.equal(game.heroWeapon.texture, part.texture);
  // 앵커는 손잡이 점, 위치는 idle 자세의 가드 좌표에서 본체 앵커를 뺀 레이어 좌표다.
  const pose = WEAPON_POSES.male.idle0;
  assert(Math.abs(game.heroWeapon.anchor.x - WEAPON_GUARD.x / 362) < 1e-6);
  assert(Math.abs(game.heroWeapon.anchor.y - WEAPON_GUARD.y / 362) < 1e-6);
  assert(Math.abs(game.heroWeapon.position.x - (pose.x - 362 * .5)) < 1e-6);
  assert(Math.abs(game.heroWeapon.position.y - (pose.y - 362 * .97)) < 1e-6);
  assert(Math.abs(game.heroWeapon.rotation - pose.rot * Math.PI / 180) < 1e-9);
});

test('걷기·공격 프레임에서도 파츠는 손잡이 자세 표를 따라간다', () => {
  for (const [index, name] of [[2, '클레이모어'], [9, '아기']] .slice(0, 1)) {
    const save = freshSave('female');
    save.equipment.weapon = weaponItem(name === '아기' ? '패왕의 성검' : name);
    const game = view();
    const moving = world(save);
    game.armorSheets.set(swordlessBodyPath('female', 'walk'), texture());
    game.weaponSheets.set(weaponPartPath(index), texture());
    moving.activeMove = { x: 1, y: 0 };
    moving.player.x = 24;
    drawHero.call(game, moving, 100, 100, 0);
    const pose = weaponPose('female', 'walk', Math.floor(game.heroWalkDistance / 12) % 8);
    assert(game.heroWeapon.visible);
    assert(Math.abs(game.heroWeapon.position.x - (pose.x - 362 * .5)) < 1e-6);
    assert(Math.abs(game.heroWeapon.position.y - (pose.y - 362 * .97)) < 1e-6);
    assert(Math.abs(game.heroWeapon.rotation - pose.rot * Math.PI / 180) < 1e-6);

    const attacking = world(save);
    attacking.attackPose = .32;
    game.armorFrames.clear();
    game.armorSheets.set(swordlessBodyPath('female', 'attack'), texture());
    drawHero.call(game, attacking, 100, 100, .2);
    const attackPose = weaponPose('female', 'attack', 0);
    assert(Math.abs(game.heroWeapon.position.x - (attackPose.x - 362 * .5)) < 1e-6);
    assert(Math.abs(game.heroWeapon.rotation - attackPose.rot * Math.PI / 180) < 1e-6);
  }
});

test('대검을 벗으면 파츠를 숨기고 기준 시트로 돌아간다', () => {
  const save = freshSave('male');
  save.equipment.weapon = weaponItem('플랑베르주');
  const game = view();
  const idle = world(save);
  game.armorSheets.set(swordlessBodyPath('male', 'idle'), texture());
  game.weaponSheets.set(weaponPartPath(4), texture());
  drawHero.call(game, idle, 100, 100, 0);
  assert(game.heroWeapon.visible);
  save.equipment.weapon = weaponItem('두손검');
  drawHero.call(game, idle, 100, 100, .1);
  assert.equal(game.heroWeapon.visible, false, '0번은 본체 시트에 그려져 있다');
  assert.equal(game.hero.texture, game.textures.pilotMale, '기준 시트로 돌아간다');
});

test('장비창 초상화도 기본 검 없는 시트 + 파츠를 쓴다', () => {
  const save = freshSave('female');
  save.equipment.armor = { id: 'a', slot: 'armor', name: '드래곤 메일', rarity: 'unique', stats: {} };
  assert.equal(equipmentFallbackPortrait(save), '/assets/pilot-25d/armors/warrior_female_armor_7_idle_v1.png?v=2');
  save.equipment.weapon = weaponItem('용살자의 대검');
  assert.equal(equipmentFallbackPortrait(save), '/assets/pilot-25d/noweapon/armors/warrior_female_armor_7_idle_v1.png?v=2');
  const plan = equipmentPortraitPlan(save);
  assert.equal(plan.weapon?.path, '/assets/pilot-25d/weapons/weapon_8_v1.png');
  assert.equal(plan.weapon?.x, WEAPON_POSES.female.idle0.x);
  assert.equal(plan.weapon?.y, WEAPON_POSES.female.idle0.y);
  assert.equal(plan.weapon?.rotation, WEAPON_POSES.female.idle0.rot);
  // 갑옷이 없으면 기본 검 없는 본체 시트를 쓴다.
  save.equipment.armor = undefined;
  assert.equal(equipmentFallbackPortrait(save), '/assets/pilot-25d/noweapon/warrior_female_idle_v1.png?v=2');
});

test('서기 시트를 갈았으므로 필드·장비창 서기 URL 에 캐시 버스터가 붙고 걷기·공격은 그대로다', () => {
  // `/assets/*`는 1년 불변 캐시다 — 서기 시트를 덮어썼으면 URL 이 바뀌어야 새 그림이 나간다(작업 218).
  for (const gender of ['male', 'female']) {
    const idle = gender === 'male' ? '/assets/pilot-25d/warrior_male_idle_v1.png?v=2' : '/assets/pilot-25d/warrior_female_idle_v1.png?v=2';
    assert(renderAssetPaths.includes(idle), `${idle} 가 부팅 프리로드에 없다`);
    assert(!renderAssetPaths.includes(idle.split('?')[0]), '버전 없는 옛 서기 URL 이 남아 있다');
    assert(renderAssetPaths.includes(headlessBodyPaths[gender].idle), '투구용 서기 시트도 같은 버전');
    assert(headlessBodyPaths[gender].idle.endsWith('?v=2'));
    assert(!headlessBodyPaths[gender].walk.includes('?v='), '걷기 시트는 그대로라 버전 없음');
    assert(!headlessBodyPaths[gender].attack.includes('?v='), '공격 시트는 그대로라 버전 없음');
    assert.equal(swordlessBodyPath(gender, 'idle', false), `/assets/pilot-25d/noweapon/warrior_${gender}_idle_v1.png?v=2`);
    assert.equal(swordlessBodyPath(gender, 'idle', true), `/assets/pilot-25d/noweapon/headless/warrior_${gender}_idle_v1.png?v=2`);
    assert.equal(swordlessBodyPath(gender, 'walk'), `/assets/pilot-25d/noweapon/warrior_${gender}_walk_v1.png`);
    for (const index of [0, 9]) {
      assert(armorSheetPath(gender, index, 'idle').endsWith('_idle_v1.png?v=2'));
      assert(armorSheetPath(gender, index, 'idle', true, true).includes('/noweapon/armors/headless/'));
      assert(!armorSheetPath(gender, index, 'attack').includes('?v='));
    }
  }
});
