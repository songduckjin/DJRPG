import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import './ts-loader.mjs';

// 작업 256 — 전 직업 투구 파츠 발광 범위 조정(사용자 확정 1안).
// "딱 투구만 빛나면 좋겠는데 얼굴 머리카락까지 영향이 가더라고" → 투구 파츠에서 **투구만** 남긴
// 알파 마스크를 따로 굽고(`public/assets/pilot-25d/helmets_glow/`·`archer_helms_glow/`), 필드와
// 장착 화면이 그 마스크로만 등급색 발광을 칠한다. 실루엣 밖으로 번지는 후광 겹은 쓰지 않는다.
const {
  helmetArtList, helmetAttackArtList, helmetArtPath, helmetGlowMaskPath, helmetGlowMaskPaths
} = await import('../src/game/render/helmets.ts');
const { archerHelmGlowMaskPath, archerHelmGlowMaskPaths, archerHelmPartPath } = await import('../src/game/render/archerHelmets.ts');
const { gearGlowLayers, gearGlowLayersFor } = await import('../src/game/render/gearGlow.ts');
const { equipmentPortraitPlan } = await import('../src/ui/equipmentPortrait.ts');
const { freshSave } = await import('../src/game/store.ts');
const { baseItems } = await import('../src/game/items.ts');

const entities = readFileSync(new URL('../src/game/render/entities.ts', import.meta.url), 'utf8');
const portrait = readFileSync(new URL('../src/ui/equipmentPortrait.ts', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../src/game/render.ts', import.meta.url), 'utf8');

const fileOf = path => new URL(`../public${path}`, import.meta.url);
const assetPath = path => path.replace(/\?v=\d+$/, '');

/** RGBA·팔레트(tRNS) PNG의 알파를 읽는다(bow-render.test.mjs와 같은 디코더). */
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
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') transparency = data;
    else if (type === 'IDAT') chunks.push(data);
    else if (type === 'IEND') break;
    offset += length + 12;
  }
  assert(palette || colorType === 6, `지원하지 않는 PNG 색 형식: ${colorType}`);
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
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    if (colorType === 3) {
      const index = pixels[i];
      alpha[i] = transparency && index < transparency.length ? transparency[index] : 255;
      rgb[i * 3] = palette[index * 3]; rgb[i * 3 + 1] = palette[index * 3 + 1]; rgb[i * 3 + 2] = palette[index * 3 + 2];
    } else {
      alpha[i] = pixels[i * 4 + 3];
      rgb[i * 3] = pixels[i * 4]; rgb[i * 3 + 1] = pixels[i * 4 + 1]; rgb[i * 3 + 2] = pixels[i * 4 + 2];
    }
  }
  return { width, height, alpha, rgb, colorType };
}

/** 파츠와 마스크 한 쌍(파츠 경로 → 마스크 경로). */
const pairs = [
  ...helmetArtList.map(art => [helmetArtPath(art), helmetGlowMaskPath(art), `helmets/${art}`]),
  ...helmetAttackArtList.map(art => [helmetArtPath(art), helmetGlowMaskPath(art), `atk/${art}`]),
  ...['male', 'female'].flatMap(gender => Array.from({ length: 10 }, (_, index) => [
    archerHelmPartPath(gender, index), archerHelmGlowMaskPath(gender, index), `archer_helms/${gender}_${index}`
  ]))
];

test('모든 투구 파츠에 같은 이름·같은 크기의 발광 마스크가 있다', () => {
  assert.equal(pairs.length, 13 + 80 + 20, '전사 정면 13 + 공격 80 + 궁수 20');
  for (const [partPath, maskPath, label] of pairs) {
    const part = fileOf(assetPath(partPath));
    const mask = fileOf(assetPath(maskPath));
    assert.ok(existsSync(part), `파츠가 있다: ${label}`);
    assert.ok(existsSync(mask), `발광 마스크가 있다: ${label}`);
    const partImage = decodeAlpha(readFileSync(part));
    const maskImage = decodeAlpha(readFileSync(mask));
    assert.equal(maskImage.width, partImage.width, `마스크 가로가 파츠와 같다: ${label}`);
    assert.equal(maskImage.height, partImage.height, `마스크 세로가 파츠와 같다: ${label}`);
    assert.ok(statSync(mask).size < 12 * 1024, `마스크가 12KB를 넘지 않는다: ${label}`);
  }
});

test('마스크는 파츠 실루엣을 넘지 않고, 투구 면적은 충분히 남긴다', () => {
  for (const [partPath, maskPath, label] of pairs) {
    const part = decodeAlpha(readFileSync(fileOf(assetPath(partPath))));
    const mask = decodeAlpha(readFileSync(fileOf(assetPath(maskPath))));
    let opaque = 0, full = 0;
    for (let i = 0; i < part.alpha.length; i += 1) {
      if (part.alpha[i] > 8) {
        opaque += 1;
        if (mask.alpha[i] > 8) assert.ok(part.alpha[i] > 8, `마스크는 파츠 안쪽에만 있다: ${label}`);
        if (mask.alpha[i] >= 200) full += 1;
      }
    }
    assert.ok(full >= opaque * .05, `투구 면적이 남아 있다(전체의 5% 이상): ${label} ${full}/${opaque}`);
  }
});

test('얼굴(이마·볼·코·입·눈)은 발광에서 빠진다', () => {
  // 사용자 제보 "얼굴 머리카락까지 영향이 가더라고"의 핵심 — 눈으로 확인한 얼굴 좌표를 고정한다.
  // (파츠 로컬 좌표, `scripts/check-helm-glow-masks.py` 검수 시트에서 읽은 자리)
  const faces = [
    ['helmets/helm_0.png', [[37, 30], [30, 38], [45, 37], [37, 44]]],
    ['helmets/helm_female_0.png', [[60, 40], [52, 48], [70, 46], [60, 54]]],
    ['archer_helms/female_0_v1.png', [[155, 58], [168, 58], [160, 64], [150, 66]]],
    ['archer_helms/female_5_v1.png', [[158, 58], [170, 57], [162, 64], [152, 68]]],
    ['archer_helms/male_0_v1.png', [[167, 52], [178, 52], [172, 57], [163, 60]]],
    ['archer_helms/male_9_v1.png', [[168, 52], [180, 52], [174, 58], [164, 62]]]
  ];
  for (const [name, points] of faces) {
    const maskPath = name.startsWith('archer_helms/')
      ? `/assets/pilot-25d/archer_helms_glow/${name.split('/')[1]}`
      : `/assets/pilot-25d/helmets_glow/${name.replace('helmets/', '')}`;
    const mask = decodeAlpha(readFileSync(fileOf(maskPath)));
    for (const [x, y] of points) {
      assert.ok(mask.alpha[y * mask.width + x] <= 40,
        `얼굴 픽셀은 발광하지 않는다: ${name} (${x},${y}) → ${mask.alpha[y * mask.width + x]}`);
    }
  }
});

test('살색 픽셀 대부분은 발광에서 빠진다 — 113장 전수', () => {
  // 살색은 푸른 채널이 초록의 55~90%(R:G:B ≈ 1:.65:.45)다. 재질 자체가 살색인 청동·금속 투구는
  // 이 규칙에도 걸리므로 '대부분(70% 이상)'만 요구한다 — 얼굴이 통째로 타오르던 예전 문제는 막는다.
  for (const [partPath, maskPath, label] of pairs) {
    const part = decodeAlpha(readFileSync(fileOf(assetPath(partPath))));
    const mask = decodeAlpha(readFileSync(fileOf(assetPath(maskPath))));
    let skinPixels = 0, bright = 0;
    for (let i = 0; i < part.alpha.length; i += 1) {
      if (part.alpha[i] <= 8) continue;
      const r = part.rgb[i * 3], g = part.rgb[i * 3 + 1], b = part.rgb[i * 3 + 2];
      if (g < 1) continue;
      const ratio = b / g;
      const v = Math.max(r, g, b) / 255, s = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(1, Math.max(r, g, b));
      if (!(v >= .45 && v <= .85 && s >= .16 && s <= .62 && r - b >= 30 && ratio >= .55 && ratio <= .92)) continue;
      skinPixels += 1;
      if (mask.alpha[i] < 60) bright += 1;
    }
    if (skinPixels < 40) continue;
    assert.ok(bright / skinPixels >= .7, `살색 픽셀 70% 이상이 꺼져 있다: ${label} (${Math.round(bright / skinPixels * 100)}%)`);
  }
});

test('목·어깨는 파츠 아래쪽에서 발광이 꺼진다', () => {
  // 전사 정면 파츠는 앵커가 목 밑동(셀 y≈89)이라 아래 두 줄이 목·칼라다 — 거기서 빛이 0에 가깝다.
  const front = helmetArtList.filter(art => art.startsWith('helm_'));
  for (const art of front) {
    const mask = decodeAlpha(readFileSync(fileOf(assetPath(helmetGlowMaskPath(art)))));
    const rows = 2;
    let sum = 0, count = 0;
    for (let y = mask.height - rows; y < mask.height; y += 1) {
      for (let x = 0; x < mask.width; x += 1) {
        sum += mask.alpha[y * mask.width + x];
        count += 1;
      }
    }
    assert.ok(sum / count <= 20, `투구 파츠 맨 아래 두 줄은 발광하지 않는다: ${art} (${(sum / count).toFixed(1)})`);
  }
});

test('마스크 목록은 파츠 목록과 1:1이고 경로 규칙이 같다', () => {
  assert.equal(helmetGlowMaskPaths.length, 13 + 80);
  assert.ok(helmetGlowMaskPaths.every(path => path.includes('/helmets_glow/')));
  assert.equal(archerHelmGlowMaskPaths.length, 20);
  assert.ok(archerHelmGlowMaskPaths.every(path => path.includes('/archer_helms_glow/')));
  assert.equal(helmetGlowMaskPath('atk_male_3_f2'), helmetAttackArtList.includes('atk_male_3_f2')
    ? helmetGlowMaskPath('atk_male_3_f2') : '', '공격 파츠도 같은 규칙');
  assert.match(helmetGlowMaskPath('atk_male_0_f0'), /\/helmets_glow\/atk\/male_0_f0\.png/);
  assert.match(helmetGlowMaskPath('helm_female_1'), /\/helmets_glow\/helm_female_1\.png/);
  assert.match(archerHelmGlowMaskPath('female', 4) ?? '', /\/archer_helms_glow\/female_4_v1\.png/);
});

test('투구는 후광 겹 없이 두 겹만 쓴다(1안 — 오라 번짐 없음)', () => {
  const helmet = gearGlowLayersFor('helmet');
  assert.equal(helmet.length, 2, '투구는 2겹');
  assert.ok(helmet.every(layer => layer.scale <= 1), '실루엣 밖으로 키우는 겹이 없다');
  assert.deepEqual(helmet.map(layer => layer.mode), ['multiply', 'add']);
  // 갑옷도 마스크 발광과 함께 두 겹이 된다(작업 257 — 투구와 같은 1안). 무기는 종전 세 겹 그대로다.
  const armor = gearGlowLayersFor('armor');
  assert.equal(armor.length, 2, '갑옷도 2겹(작업 257)');
  assert.ok(armor.every(layer => layer.scale <= 1), '갑옷도 실루엣 밖으로 번지지 않는다');
  assert.equal(gearGlowLayersFor('weapon').length, gearGlowLayers.length);
  assert.ok(gearGlowLayers.some(layer => layer.scale > 1), '무기의 번지는 후광은 유지');
});

test('필드는 투구 발광을 마스크로 자르고, 마스크가 없으면 발광을 숨긴다', () => {
  assert.match(entities, /view\.heroHelmetGlowMaskPath = art \? helmetGlowMaskPath\(art\) : undefined;/, '전사 투구');
  assert.match(entities, /view\.heroHelmetGlowMaskPath = index >= 0 \? archerHelmGlowMaskPath\(save\.gender, index\) : undefined;/, '궁수 투구');
  assert.match(entities, /const helmetGlowReady = !helmetGlowMaskPath \|\| !!helmetGlowMask;/, '마스크 로딩 전에는 발광하지 않는다');
  assert.match(entities, /syncGearGlow\(this, 'helmet', helmetGlowReady \? wornHelmet : undefined, save\.equipment\.helmet\?\.rarity, time, \{ mask: helmetGlowMask \}\);/, '투구 발광에 마스크를 넘긴다');
  assert.match(entities, /mask\.anchor\.set\(source\.anchor\.x, source\.anchor\.y\);/, '마스크를 파츠와 같은 변형으로 놓는다');
  assert.match(entities, /mask\.scale\.set\(source\.scale\.x, source\.scale\.y\);/, '마스크를 파츠와 같은 배율로 놓는다');
  assert.match(renderer, /helmetGlowMasks = new Map<string, Texture>\(\);/, 'GameView.helmetGlowMasks');
  assert.match(renderer, /helmetGlowMask\(path: string\): Texture \| undefined \{/, '지연 로딩 접근자');
  assert.match(renderer, /heroGlowPartMasks = new Map<string, Sprite>\(\);/, '부위별 마스크 스프라이트');
});

test('장착 화면도 같은 마스크로 투구만 칠하고 후광을 줄인다', () => {
  assert.match(portrait, /glowMask: string;/, '투구 계획에 마스크 경로가 있다');
  assert.match(portrait, /return \{ path: helmetArtPath\(art\), x: place\.x, y: place\.y, scale: place\.scale, glowMask: helmetGlowMaskPath\(art\) \};/, '전사 투구 마스크');
  assert.match(portrait, /return \{ path, x: place\.x, y: place\.y, scale: place\.scale, glowMask \};/, '궁수 투구 마스크');
  assert.match(portrait, /paint\.globalCompositeOperation = 'destination-in';/, '마스크 알파로 도려낸다');
  assert.match(portrait, /glow\?\.color, mask, HELMET_GLOW_AURA\)/, '투구는 후광 배율을 낮춰 그린다');
  assert.ok(/const HELMET_GLOW_AURA = \.\d+;/.test(portrait), '후광 배율 상수');
});

test('궁수·전사 세이브의 장비창 계획이 마스크를 함께 만든다', () => {
  const save = freshSave('male', 'archer');
  save.equipment.helmet = { id: 'helmet', slot: 'helmet', name: baseItems.helmet[5], rarity: 'unique', stats: { defense: 20 } };
  const archerPlan = equipmentPortraitPlan(save);
  assert.ok(archerPlan.archerHelm, '궁수 투구 계획');
  assert.match(archerPlan.archerHelm.glowMask, /archer_helms_glow\/male_5_v1\.png/);
  assert.ok(existsSync(fileOf(archerPlan.archerHelm.glowMask)), '마스크 파일이 실제로 있다');

  const warrior = freshSave('female', 'warrior');
  warrior.equipment.helmet = { id: 'helmet', slot: 'helmet', name: baseItems.helmet[3], rarity: 'legendary', stats: { defense: 14 } };
  const warriorPlan = equipmentPortraitPlan(warrior);
  assert.ok(warriorPlan.helmet, '전사 투구 계획');
  assert.match(warriorPlan.helmet.glowMask, /helmets_glow\/helm_3\.png/);
  assert.ok(existsSync(fileOf(warriorPlan.helmet.glowMask)), '전사 마스크 파일도 있다');
});
