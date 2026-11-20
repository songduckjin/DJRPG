import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import './ts-loader.mjs';

const { heroBodyPx, heroBodyFraction, heroScale } = await import('../src/game/render/heroScale.ts');
const sheetRoot = fileURLToPath(new URL('../public/assets/pilot-25d/', import.meta.url));

/** 8비트 RGBA PNG의 알파만 2차원 배열로 푼다. */
function decodeAlpha(buffer) {
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG');
  let offset = 8, width = 0, height = 0;
  const chunks = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); }
    if (type === 'IDAT') chunks.push(data);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const bpp = 4, stride = width * bpp, out = Buffer.alloc(height * stride);
  let position = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[position++];
    const line = raw.subarray(position, position + stride); position += stride;
    const previous = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const row = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? row[x - bpp] : 0, up = previous[x], upLeft = x >= bpp ? previous[x - bpp] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      row[x] = value & 255;
    }
  }
  return { width, height, alphaAt: (x, y) => out[(y * width + x) * 4 + 3] };
}

/**
 * 시트 한 장에서 **정수리~발끝** 높이를 프레임마다 잰다.
 *
 * 공격 시트는 활대가 머리 위로 솟아 불투명 영역(bbox)이 몸통보다 크다 — 그래서 bbox가 아니라
 * 발밑 무게중심 열 근처에서 머리 폭(≥22px)이 처음 나타나는 행을 정수리로 본다(작업 216).
 */
function bodyHeights(file, frames) {
  const png = decodeAlpha(readFileSync(file));
  const cell = png.width / frames;
  const heights = [];
  for (let frame = 0; frame < frames; frame++) {
    const x0 = Math.round(frame * cell), x1 = Math.round((frame + 1) * cell);
    let bottom = -1, centerSum = 0, centerCount = 0;
    const columns = [];
    for (let x = x0; x < x1; x++) {
      let top = -1, last = -1;
      for (let y = 0; y < png.height; y++) if (png.alphaAt(x, y) > 24) { if (top < 0) top = y; last = y; }
      columns.push({ x, top, last });
      if (last > png.height * .8) { centerSum += x; centerCount++; }
    }
    bottom = Math.max(...columns.map(column => column.last));
    const center = centerCount ? Math.round(centerSum / centerCount) : Math.round((x0 + x1) / 2);
    let head = -1;
    for (let y = 0; y < png.height && head < 0; y++) {
      let width = 0;
      for (let x = Math.max(x0, center - 70); x < Math.min(x1, center + 70); x++) if (png.alphaAt(x, y) > 24) width++;
      if (width >= 22) head = y;
    }
    heights.push(Math.max(1, bottom - head + 1));
  }
  return heights;
}
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * 궁수가 활을 쏠 때 캐릭터가 작아지던 문제(작업 216).
 *
 * `archerMaleAttack`/`archerFemaleAttack`이 활대까지 포함한 불투명 영역(268/270)을 잰 값이라
 * 공격 프레임의 몸통(정수리~발끝 233/229px)이 서기보다 13% 작게 그려졌다. 이제 두 값을 몸통
 * 높이로 다시 재어, 서기·걷기·공격이 화면에서 같은 체격으로 보인다.
 */
for (const [gender, key, idleKey] of [['male', 'archerMaleAttack', 'archerMale'], ['female', 'archerFemaleAttack', 'archerFemale']]) {
  test(`${gender}: archer attack body height is measured to the crown and matches idle scale`, () => {
    const attack = bodyHeights(`${sheetRoot}archer_${gender}_attack_v1.png`, 4);
    const idle = bodyHeights(`${sheetRoot}archer_${gender}_idle_v1.png`, 1);
    const attackMean = mean(attack), idleHeight = idle[0];
    const bodyPx = heroBodyPx[key], idlePx = heroBodyPx[idleKey];
    // 표 값은 실측 몸통 높이와 같아야 한다(활대가 아니라 정수리부터 잰 값).
    assert(Math.abs(bodyPx - attackMean) <= attackMean * .04, `${key} ${bodyPx} vs 실측 ${attackMean.toFixed(1)}`);
    assert(bodyPx < 250, `${key}는 활대까지 잰 예전 값(268/270)보다 낮아야 한다`);
    // 서기와 공격의 화면 체격이 같다: 몸통px × 배율이 서로 3% 안에 들어온다.
    const screenHeight = 1000;
    const drawnIdle = idleHeight * heroScale(screenHeight, idleKey, 1);
    const drawnAttack = attackMean * heroScale(screenHeight, key, 1);
    const ratio = drawnAttack / drawnIdle;
    assert(Math.abs(ratio - 1) <= .03, `공격/서기 화면 크기 ${ratio.toFixed(3)} (${drawnAttack.toFixed(1)} vs ${drawnIdle.toFixed(1)})`);
    assert.equal(heroBodyFraction, .0935);
  });
}

test('궁수 공격 배율은 예전(268/270)보다 약 13% 커졌다', () => {
  assert(heroBodyPx.archerMale > heroBodyPx.archerMaleWalk && heroBodyPx.archerMaleWalk > heroBodyPx.archerMaleAttack, '서기 > 걷기 > 공격(몸통 높이 순)');
  const screenHeight = 1000;
  for (const [gender, key, legacy] of [['male', 'archerMaleAttack', 268], ['female', 'archerFemaleAttack', 270]]) {
    const grown = heroScale(screenHeight, key, 1) / (heroBodyFraction * screenHeight / legacy);
    assert(grown >= 1.12 && grown <= 1.18, `${gender}: 예전 대비 ${grown.toFixed(3)}배 (${legacy} → ${heroBodyPx[key]})`);
  }
});
