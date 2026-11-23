import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

// [작업 227] 2.5D 캐릭터·장비 시트의 **알파 채널**.
//
// 증상: 황야 바닥 위에 선 캐릭터의 몸통 뒤로 바닥 타일이 비쳐 보였다. 원인은 코드의 alpha 값이
// 아니라 시트 PNG 자체에 남은 내부 반투명(0 < a < 255)이었다 — 마법사 서기는 불투명 픽셀의 56%가
// 반투명이었고 중앙값이 198/255였다. `scripts/restore-pilot-alpha.py`가
//   · 완전 투명 배경에서 2px 넘게 떨어진 내부 픽셀(alpha >= 30)을 255로 복원하고
//   · 외곽 1~2px 안티엘리어싱은 그대로 남기고
//   · 이펙트(fx_*)는 건드리지 않는다
// 는 규칙으로 다시 구웠다. 아래 테스트가 그 규칙을 지킨다.

/** 이미지 안쪽에서 '바깥 투명 배경까지의 거리'를 재기 위한 반경 2 원판(유클리드). */
const DISC = [];
for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) if (dx * dx + dy * dy <= 4) DISC.push([dx, dy]);

function decodeAlpha(image) {
  let offset = 8;
  let width = 0, height = 0, colorType = 0, bitDepth = 0, interlace = 0;
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
  assert.equal(bitDepth, 8, '시트는 8비트 PNG');
  assert.equal(interlace, 0, '시트는 인터레이스가 아니다');
  const channels = { 0: 1, 2: 3, 3: 1, 6: 4 }[colorType];
  if (!channels) throw new Error(`지원하지 않는 PNG 색 형식: ${colorType}`);
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
    if (colorType === 3) {
      const index = pixels[p];
      alpha[i] = transparency && index < transparency.length ? transparency[index] : 255;
    } else if (colorType === 6) alpha[i] = pixels[p + 3];
    else alpha[i] = 255;
  }
  return { width, height, alpha };
}

function alphaStats(name) {
  const { width, height, alpha } = decodeAlpha(readFileSync(new URL(`../public/assets/pilot-25d/${name}`, import.meta.url)));
  let visible = 0, semi = 0, interiorSemi = 0;
  const values = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const value = alpha[y * width + x];
    if (!value) continue;
    visible += 1;
    values.push(value);
    if (value > 10 && value < 245) semi += 1;
    let interior = true;
    for (const [dx, dy] of DISC) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || !alpha[ny * width + nx]) { interior = false; break; }
    }
    if (interior && value > 10 && value < 245) interiorSemi += 1;
  }
  values.sort((a, b) => a - b);
  return {
    visible,
    semiShare: visible ? semi / visible : 1,
    interiorSemi,
    interiorSemiShare: visible ? interiorSemi / visible : 1,
    median: values.length ? values[values.length >> 1] : 0
  };
}

// 본체(전사·궁수·마법사 × 성별 × 서기·걷기·공격)와 부위별 시트·파츠를 고루 넣는다.
const sheets = [
  'warrior_male_idle_v1.png', 'warrior_female_walk_v1.png', 'warrior_male_attack_v1.png',
  'archer_male_idle_v1.png', 'archer_female_walk_v1.png', 'archer_male_attack_v1.png',
  'mage_male_idle_v1.png', 'mage_female_walk_v1.png', 'mage_male_attack_v1.png',
  'headless/warrior_male_idle_v1.png', 'noweapon/warrior_male_walk_v1.png',
  'mage_nostaff/mage_male_attack_v1.png', 'mage_headless/mage_male_idle_v1.png',
  'nobow/archer_female_idle_v1.png', 'archer_headless/nobow/archer_male_idle_v1.png',
  'noweapon/headless/warrior_female_attack_v1.png',
  'armors/warrior_male_armor_5_idle_v1.png', 'robes/mage_female_robe_5_walk_v1.png',
  'robes/headless/mage_male_robe_7_idle_v1.png', 'archer_armors/archer_male_armor_5_idle_v1.png',
  'archer_armors/nobow/headless/archer_male_armor_5_walk_v1.png',
  'helmets/helm_3.png', 'helmets/atk/male_3_f1.png', 'helmets/atk/female_7_f2.png',
  'mage_helms/male_7_v1.png', 'archer_helms/female_3_v1.png',
  'weapons/weapon_3_v1.png', 'bows/bow_5_v1.png', 'staffs/staff_3_v1.png'
];

// 백로그 7번(2026-11-23) — 마법사·궁수 **본체 시트 48장**을 같은 규칙으로 다시 구웠다.
// 마법사는 24장(기본·지팡이 지움·머리 없음·머리 없음+지팡이 지움 각 6), 궁수는 24장(기본·활 지움·머리 없음·머리 없음+활 지움).
// 이 시트들은 안쪽에 알파 0으로 뚫린 점(구멍)이 있어 227의 "2px 넘게 떨어진 내부" 규칙이 아무것도 고치지 못했다.
const mageAndArcherBodies = [];
for (const gender of ['male', 'female']) for (const motion of ['idle', 'walk', 'attack']) {
  mageAndArcherBodies.push(`mage_${gender}_${motion}_v1.png`, `mage_nostaff/mage_${gender}_${motion}_v1.png`);
  mageAndArcherBodies.push(`mage_headless/mage_${gender}_${motion}_v1.png`, `mage_headless/nostaff/mage_${gender}_${motion}_v1.png`);
  mageAndArcherBodies.push(`archer_${gender}_${motion}_v1.png`, `nobow/archer_${gender}_${motion}_v1.png`);
  mageAndArcherBodies.push(`archer_headless/archer_${gender}_${motion}_v1.png`, `archer_headless/nobow/archer_${gender}_${motion}_v1.png`);
}
for (const name of mageAndArcherBodies) if (!sheets.includes(name)) sheets.push(name);

for (const name of sheets) test(`${name} 는 몸 안쪽이 불투명하다(알파 복원)`, () => {
  const stats = alphaStats(name);
  assert(stats.visible > 500, `${name}: 시트가 비어 있다`);
  // 외곽 1~2px 안티엘리어싱과 그림자 점은 남는다 — 안쪽만 따진다.
  assert(
    stats.interiorSemiShare < .015,
    `${name}: 내부 반투명이 ${(stats.interiorSemiShare * 100).toFixed(2)}% 남았다(바닥이 비친다)`
  );
  assert(stats.median >= 250, `${name}: 불투명 픽셀 중앙값이 ${stats.median}/255 로 낮다`);
});

// 백로그 7번(2026-11-23): 마법사·궁수 본체 48장은 시트 안쪽에 알파 0으로 뚫린 점(구멍)이 있었고,
// 227의 "배경에서 2px 떨어진 내부" 규칙은 그 구멍 바로 옆을 내부로 보지 않아 아무것도 고치지 못했다.
// 다시 구운 뒤에는 **구멍을 메우고 안쪽을 255로** 칠해서, 몸 안쪽 반투명 픽셀이 사실상 0이다.
// (고치기 전 시트는 마법사 남자 서기만 해도 안쪽 반투명이 1,707픽셀이라 이 검사에서 바로 걸린다.)
test('백로그 7번 — 마법사·궁수 본체 48장은 몸 안쪽이 완전히 불투명하다', () => {
  const loose = [];
  for (const name of mageAndArcherBodies) {
    const stats = alphaStats(name);
    assert(stats.visible > 500, `${name}: 시트가 비어 있다`);
    if (stats.interiorSemi > 8) loose.push(`${name}: ${stats.interiorSemi}px`);
    assert(stats.median >= 250, `${name}: 중앙값 ${stats.median}/255`);
  }
  assert.deepEqual(loose, [], `안쪽 반투명이 남은 시트: ${loose.join(', ')}`);
});

/** 알파 0 픽셀이 이미지 테두리와 이어지지 않은 덩어리들의 넓이 — 실루엣 안에 갇힌 빈 곳. */
function enclosedGaps(name) {
  const { width, height, alpha } = decodeAlpha(readFileSync(new URL(`../public/assets/pilot-25d/${name}`, import.meta.url)));
  const seen = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x += 1) { stack.push(x, (height - 1) * width + x); }
  for (let y = 0; y < height; y += 1) { stack.push(y * width, y * width + width - 1); }
  while (stack.length) {
    const index = stack.pop();
    if (seen[index] || alpha[index]) continue;
    seen[index] = 1;
    const x = index % width, y = (index - x) / width;
    if (x > 0) stack.push(index - 1);
    if (x < width - 1) stack.push(index + 1);
    if (y > 0) stack.push(index - width);
    if (y < height - 1) stack.push(index + width);
  }
  const gaps = [];
  const inside = new Uint8Array(width * height);
  for (let index = 0; index < alpha.length; index += 1) {
    if (alpha[index] || seen[index] || inside[index]) continue;
    let size = 0;
    const queue = [index];
    inside[index] = 1;
    while (queue.length) {
      const current = queue.pop();
      size += 1;
      const x = current % width, y = (current - x) / width;
      for (const next of [x > 0 ? current - 1 : -1, x < width - 1 ? current + 1 : -1, y > 0 ? current - width : -1, y < height - 1 ? current + width : -1]) {
        if (next >= 0 && !alpha[next] && !seen[next] && !inside[next]) { inside[next] = 1; queue.push(next); }
      }
    }
    gaps.push(size);
  }
  return gaps;
}

test('구멍을 메울 때 활시위 안쪽처럼 크게 뚫린 곳(그림의 일부)은 덮지 않는다', () => {
  // 궁수 서기는 활대와 시위 사이가 크게 뚫려 있다 — 이걸 알파 255로 채우면 활이 판때기가 된다.
  const gaps = enclosedGaps('archer_male_idle_v1.png');
  assert(gaps.some(size => size > 500), `큰 빈 곳이 남아 있어야 한다(가장 큰 빈 곳 ${Math.max(0, ...gaps)}px)`);
  // 반면 실루엣에 갇힌 빈 곳 전체가 메워졌다면 활이 판때기가 된다 — 배경·빈 곳이 그림의 상당 부분 남아 있어야 한다.
  const { alpha } = decodeAlpha(readFileSync(new URL('../public/assets/pilot-25d/archer_male_idle_v1.png', import.meta.url)));
  let transparent = 0;
  for (const value of alpha) if (!value) transparent += 1;
  assert(transparent > 100_000, `배경·빈 곳이 ${transparent}px 밖에 안 남았다(그림을 덮았다)`);
});

test('이펙트(fx_*)는 알파를 255로 덮지 않았다', () => {
  // 번짐·불꽃·오라는 반투명이 그림의 일부다 — 캐릭터 시트를 구울 때 손대면 안 된다.
  for (const name of ['fx_rage_glow_v1.png', 'fx_blood_rage.png', 'fx_hell_fire.png', 'fx_rage_flame_v1.png']) {
    const { width, height, alpha } = decodeAlpha(readFileSync(new URL(`../public/assets/${name}`, import.meta.url)));
    let visible = 0, semi = 0;
    for (const value of alpha) if (value > 0) { visible += 1; if (value > 10 && value < 245) semi += 1; }
    assert(width > 0 && height > 0 && visible > 1000, `${name}: 이펙트가 비어 있다`);
    assert(semi / visible > .2, `${name}: 반투명 번짐이 사라졌다(${(semi / visible * 100).toFixed(1)}%)`);
  }
});

test('부위별 파츠는 본체와 같은 알파 규칙을 쓴다(투구·활·지팡이·대검 10종 전수)', () => {
  // 0번(기본 검·사냥꾼의 활)은 본체 시트에 그려져 파츠 파일이 없다 — 1~9번만 있다.
  const sets = [
    ['helmets', 0, n => `helmets/helm_${n}.png`],
    ['helmets/atk', 0, n => `helmets/atk/male_${n}_f0.png`],
    ['mage_helms', 0, n => `mage_helms/male_${n}_v1.png`],
    ['archer_helms', 0, n => `archer_helms/male_${n}_v1.png`],
    ['bows', 1, n => `bows/bow_${n}_v1.png`],
    ['staffs', 0, n => `staffs/staff_${n}_v1.png`],
    ['weapons', 1, n => `weapons/weapon_${n}_v1.png`]
  ];
  for (const [label, from, path] of sets) for (let index = from; index < 10; index += 1) {
    const stats = alphaStats(path(index));
    assert(stats.interiorSemiShare < .02, `${label}[${index}]: 내부 반투명 ${(stats.interiorSemiShare * 100).toFixed(2)}%`);
    assert(stats.median >= 250, `${label}[${index}]: 중앙값 ${stats.median}/255`);
  }
});
