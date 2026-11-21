import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import './ts-loader.mjs';

// 작업 257 — 전 직업 갑옷·로브 발광 범위 조정(사용자 확정 1안).
// "갑옷은 갑옷만 발광해야지 맨팔·부츠·검까지 빛난다" → 갑옷 시트에서 **갑옷 픽셀만** 남긴 알파 마스크
// 시트를 따로 굽고(`public/assets/pilot-25d/{armors_glow,archer_armors_glow,robes_glow,starter_glow}/`),
// 필드와 장착 화면이 그 마스크로만 등급색 발광을 칠한다. 실루엣 밖으로 번지는 후광 겹은 쓰지 않는다.
const {
  armorGlowSheetPath, armorGlowSheetPaths, armorSheetPath, ARMOR_COUNT
} = await import('../src/game/render/armors.ts');
const { archerArmorGlowSheetPath, archerArmorSheetPath, ARCHER_ARMOR_COUNT } = await import('../src/game/render/archerArmors.ts');
const { robeGlowSheetPath, robeSheetPath, ROBE_COUNT } = await import('../src/game/render/robes.ts');
const { armorGlowSheetFor, starterGlowSheetPath } = await import('../src/game/render/armorGlowMasks.ts');
const { gearGlowLayers, gearGlowLayersFor } = await import('../src/game/render/gearGlow.ts');
const { freshSave } = await import('../src/game/store.ts');
const { baseItems } = await import('../src/game/items.ts');

const entities = readFileSync(new URL('../src/game/render/entities.ts', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../src/game/render.ts', import.meta.url), 'utf8');
const portrait = readFileSync(new URL('../src/ui/equipmentPortrait.ts', import.meta.url), 'utf8');
const script = readFileSync(new URL('../scripts/build-armor-glow-masks.py', import.meta.url), 'utf8');

const GENDERS = ['male', 'female'];
const MOTIONS = ['idle', 'walk', 'attack'];
const assetPath = path => path.replace(/\?v=\d+$/, '');
const fileOf = path => new URL(`../public${assetPath(path)}`, import.meta.url);

/**
 * PNG의 알파만 읽는다 — 마스크는 RGBA(6), 원본 시트는 팔레트+투명 인덱스(3)다.
 */
function decodeAlpha(image) {
  let offset = 8, width = 0, height = 0, colorType = 0, bitDepth = 0;
  let palette = null, transparency = null;
  const chunks = [];
  while (offset + 8 <= image.length) {
    const length = image.readUInt32BE(offset);
    const type = image.toString('ascii', offset + 4, offset + 8);
    const data = image.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') transparency = data;
    else if (type === 'IDAT') chunks.push(data);
    else if (type === 'IEND') break;
    offset += length + 12;
  }
  assert.ok(colorType === 6 || colorType === 3, `지원하는 PNG 형식: ${colorType}`);
  assert.equal(bitDepth, 8);
  const channels = colorType === 3 ? 1 : 4;
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let position = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[position++];
    const line = raw.subarray(position, position + stride);
    position += stride;
    const out = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? out[i - channels] : 0;
      const up = previous[i];
      const upLeft = i >= channels ? previous[i - channels] : 0;
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
    out.copy(pixels, y * stride);
    previous = out;
  }
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    if (colorType === 3) {
      const index = pixels[i];
      alpha[i] = transparency && index < transparency.length ? transparency[index] : 255;
      assert.ok(palette, '팔레트가 있다');
    } else alpha[i] = pixels[i * 4 + 3];
  }
  return { width, height, alpha };
}

/** PNG 헤더만 읽어 크기를 잰다(원본 시트는 팔레트 PNG라 알파 디코더를 쓰지 않는다). */
function sizeOf(path) {
  const image = readFileSync(path);
  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

test('갑옷·로브·스타터 발광 마스크가 티어·성별·동작마다 있다', () => {
  let count = 0;
  for (const gender of GENDERS) {
    for (let tier = 0; tier < ARMOR_COUNT; tier += 1) {
      for (const motion of MOTIONS) {
        const mask = armorGlowSheetPath(gender, tier, motion);
        const sheet = armorSheetPath(gender, tier, motion);
        assert.ok(mask && sheet, `전사 ${gender} ${tier} ${motion} 경로`);
        assert.ok(existsSync(fileOf(mask)), `전사 마스크 파일 ${assetPath(mask)}`);
        count += 1;
      }
    }
    for (let tier = 1; tier < ARCHER_ARMOR_COUNT; tier += 1) {
      for (const motion of MOTIONS) {
        const mask = archerArmorGlowSheetPath(gender, tier, motion);
        assert.ok(mask && existsSync(fileOf(mask)), `궁수 마스크 ${gender} ${tier} ${motion}`);
        count += 1;
      }
    }
    for (let tier = 1; tier < ROBE_COUNT; tier += 1) {
      for (const motion of MOTIONS) {
        const mask = robeGlowSheetPath(gender, tier, motion);
        assert.ok(mask && existsSync(fileOf(mask)), `로브 마스크 ${gender} ${tier} ${motion}`);
        count += 1;
      }
    }
    for (const job of ['archer', 'mage']) {
      for (const motion of MOTIONS) {
        const mask = starterGlowSheetPath(job, gender, motion);
        assert.ok(existsSync(fileOf(mask)), `스타터 마스크 ${job} ${gender} ${motion}`);
        count += 1;
      }
    }
  }
  assert.equal(count, 60 + 54 + 54 + 12, '전사 60 · 궁수 54 · 로브 54 · 스타터 12 = 180장');
});

test('마스크는 원본 시트와 같은 크기·같은 셀 좌표계다', () => {
  for (const [mask, sheet] of [
    [armorGlowSheetPath('male', 3, 'idle'), armorSheetPath('male', 3, 'idle')],
    [armorGlowSheetPath('female', 7, 'walk'), armorSheetPath('female', 7, 'walk')],
    [archerArmorGlowSheetPath('male', 5, 'attack'), archerArmorSheetPath('male', 5, 'attack')],
    [robeGlowSheetPath('female', 2, 'walk'), robeSheetPath('female', 2, 'walk')]
  ]) {
    const maskSize = sizeOf(fileOf(mask));
    const sheetSize = sizeOf(fileOf(sheet));
    assert.deepEqual(maskSize, sheetSize, `${assetPath(mask)} 크기 = 원본`);
  }
  assert.equal(sizeOf(fileOf(armorGlowSheetPath('male', 3, 'idle'))).width, 362, '서기는 362px 셀 1장');
  assert.equal(sizeOf(fileOf(armorGlowSheetPath('male', 3, 'walk'))).width, 1448, '걷기는 362px 셀 4장');
});

test('마스크는 갑옷 픽셀만 담는다 — 머리·무기·부츠 자리는 비어 있다', () => {
  const cases = [
    // [마스크, 머리 지운 판, 무기 지운 판, 머리 자리 허용 비율]
    // 마법사는 머리 지운 판이 **모자·후드까지** 지운 판이라 로브의 어깨 후드가 일부 남는다(옷이라 남는 게 맞다).
    ['armors_glow/warrior_male_armor_3_idle_v1.png', 'armors/headless/warrior_male_armor_3_idle_v1.png', 'noweapon/armors/warrior_male_armor_3_idle_v1.png', .06],
    ['armors_glow/warrior_female_armor_6_idle_v1.png', 'armors/headless/warrior_female_armor_6_idle_v1.png', 'noweapon/armors/warrior_female_armor_6_idle_v1.png', .06],
    ['archer_armors_glow/archer_male_armor_4_idle_v1.png', 'archer_armors/headless/archer_male_armor_4_idle_v1.png', 'archer_armors/nobow/archer_male_armor_4_idle_v1.png', .08],
    ['robes_glow/mage_female_robe_5_idle_v1.png', 'robes/headless/mage_female_robe_5_idle_v1.png', null, .10]
  ];
  for (const [maskPath, headlessPath, weaponlessPath, headAllowance] of cases) {
    const mask = decodeAlpha(readFileSync(fileOf('/assets/pilot-25d/' + maskPath)));
    // ① 마스크가 실제로 갑옷을 덮는다(빈 마스크면 발광이 사라진다).
    const covered = mask.alpha.reduce((sum, value) => sum + (value > 128 ? 1 : 0), 0);
    assert.ok(covered > 4000, `${maskPath} — 갑옷 픽셀이 남아 있다(${covered})`);
    // ② 머리: 갑옷에는 있는데 머리 지운 판에는 없는 자리(얼굴·머리카락)에 마스크가 거의 없다.
    const headless = decodeAlpha(readFileSync(fileOf('/assets/pilot-25d/' + headlessPath)));
    let inHead = 0;
    for (let i = 0; i < mask.alpha.length; i += 1) {
      if (mask.alpha[i] > 128 && headless.alpha[i] === 0) inHead += 1;
    }
    // 머리카락이 어깨 갑옷 위로 흘러내린 자리·마법사 후드는 어깨선과 맞닿아 일부 남는다(전체의 몇 %).
    assert.ok(inHead <= covered * headAllowance, `${maskPath} — 머리 자리가 거의 비어 있다(${inHead}/${covered})`);
    // ③ 무기: 무기 지운 판에서 알파가 사라진 자리에 마스크가 거의 없다.
    if (weaponlessPath) {
      const weaponless = decodeAlpha(readFileSync(fileOf('/assets/pilot-25d/' + weaponlessPath)));
      let inWeapon = 0;
      for (let i = 0; i < mask.alpha.length; i += 1) {
        if (mask.alpha[i] > 128 && weaponless.alpha[i] === 0) inWeapon += 1;
      }
      assert.ok(inWeapon <= covered * .02, `${maskPath} — 무기 자리가 거의 비어 있다(${inWeapon}/${covered})`);
    }
    // ④ 부츠·다리: 아래쪽 15%(y > 308)에는 마스크가 없다.
    let feet = 0;
    for (let y = 308; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) if (mask.alpha[y * mask.width + x] > 128) feet += 1;
    }
    assert.equal(feet, 0, `${maskPath} — 부츠·다리 자리가 비어 있다`);
  }
});

test('갑옷 발광은 번지는 후광 겹을 쓰지 않는다(사용자 확정 1안)', () => {
  assert.equal(gearGlowLayers.length, 3, '무기는 종전 3겹');
  const armor = gearGlowLayersFor('armor');
  assert.equal(armor.length, 2, '갑옷은 파츠 위 두 겹뿐');
  assert.equal(gearGlowLayersFor('helmet').length, 2, '투구도 같은 1안(작업 256)');
  assert.equal(gearGlowLayersFor('weapon').length, 3, '무기는 그대로');
  for (const layer of armor) assert.ok(layer.scale <= 1, '실루엣 밖으로 키우는 겹이 없다');
  assert.deepEqual(armor.map(layer => layer.mode), ['multiply', 'add'], '진한 색 + 가산 빛');
});

test('필드는 부위별 마스크로 갑옷 발광을 자르고, 로딩 전에는 숨긴다', () => {
  assert.match(entities, /const armorGlowPath = armorGlowSheetFor\(save, animation\);/, '차림에 맞는 마스크 시트를 고른다');
  assert.match(entities, /const armorGlowReady = !armorGlowPath \|\| !!armorGlowMask;/, '마스크 준비 전에는 발광을 숨긴다');
  assert.match(renderer, /armorGlowFrame\(path: string, motion: ArmorMotion, frame: number\): Texture \| undefined \{/, '마스크 시트를 프레임으로 자른다');
  assert.match(renderer, /frames = sliceArmorSheet\(sheet, motion\);/, '갑옷 시트와 같은 자르기 규칙');
  assert.match(renderer, /return frames\[armorFrameIndex\(motion, frame\) % frames\.length\];/, '갑옷과 같은 프레임 선택');
  assert.match(renderer, /export const armorGlowCacheLimit = \d+;/, '마스크 시트 캐시 상한');
});

test('장착 화면도 같은 마스크로 갑옷만 칠한다', () => {
  assert.match(portrait, /const mask = entry\.slot === 'armor' \? armorGlowSheetFor\(save, 'idle'\) : undefined;/, '갑옷 슬롯에 서기 프레임 마스크');
  assert.match(portrait, /paintPatch\(context, image, left, top, width, height, glow\?\.color, armorMask, ARMOR_GLOW_AURA\);/, '초상화도 마스크로 도려낸다');
  assert.match(portrait, /const ARMOR_GLOW_AURA = \.\d+;/, '후광 배율을 낮춘다');
});

test('차림에 맞는 마스크를 고른다 — 갑옷 0번은 스타터 시트 마스크', () => {
  const item = (id, tier, rarity) => ({ id, slot: 'armor', name: `낡은 ${baseItems.armor[tier]}`, rarity, stats: {} });
  const warrior = freshSave('male', 'warrior');
  warrior.equipment = { ...warrior.equipment, armor: item('a1', 0, 'legendary') };
  assert.match(armorGlowSheetFor(warrior, 'idle'), /armors_glow\/warrior_male_armor_0_idle_v1\.png/, '전사 0번도 자기 갑옷 시트');

  const archer = freshSave('female', 'archer');
  archer.equipment = { ...archer.equipment, armor: item('a2', 0, 'legendary') };
  assert.match(armorGlowSheetFor(archer, 'idle'), /starter_glow\/archer_female_idle_v1\.png/, '궁수 0번은 스타터 시트');
  archer.equipment = { ...archer.equipment, armor: item('a3', 4, 'legendary') };
  assert.match(armorGlowSheetFor(archer, 'walk'), /archer_armors_glow\/archer_female_armor_4_walk_v1\.png/, '궁수 4번은 궁수 갑옷 마스크');

  const mage = freshSave('male', 'mage');
  mage.equipment = { ...mage.equipment, armor: item('a4', 0, 'unique') };
  assert.match(armorGlowSheetFor(mage, 'attack'), /starter_glow\/mage_male_attack_v1\.png/, '마법사 0번은 스타터 시트');
  mage.equipment = { ...mage.equipment, armor: item('a5', 2, 'unique') };
  assert.match(armorGlowSheetFor(mage, 'idle'), /robes_glow\/mage_male_robe_2_idle_v1\.png/, '마법사 2번은 로브 마스크');
});

test('마스크 빌더는 머리·무기·맨살·부츠를 뺀다', () => {
  for (const marker of ['head_removed', 'skin_mask', 'auto_leg_cut', 'hot(', 'trim_upper_left']) {
    assert.ok(script.includes(marker), `빌더에 ${marker} 규칙이 있다`);
  }
  assert.match(script, /OFF_SHEET_HEAD|headless/, '머리 지운 판을 기준으로 머리를 뺀다');
  assert.match(script, /noweapon|nobow|mage_nostaff/, '무기 지운 판을 기준으로 무기를 뺀다');
  assert.ok(statSync(new URL('../scripts/build-armor-glow-masks.py', import.meta.url)).size > 6000, '빌더 스크립트가 저장소에 있다');
});
