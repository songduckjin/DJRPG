import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

// The six attack sheets hold four poses in one row. Each pose got its own cell of equal
// width, wide enough that no sword tip or foot reaches the next frame: when the cells
// were 870/4 wide, a swing dragged a sliver of the neighbouring pose into every frame.
const attackSheets = [
  'warrior_female_armored_attack.png',
  'warrior_female_armored_helm_attack.png',
  'warrior_female_armored_oldhelm_attack.png',
  'warrior_female_helm_attack.png',
  'warrior_female_oldhelm_attack.png',
  'warrior_male_helm_attack.png'
];
const swordlessIdle = [
  'warrior_armored_swordless.png', 'warrior_armored_nohelm_swordless.png',
  'warrior_female_armored_nohelm_swordless.png', 'warrior_female_armored_helm_swordless.png',
  'warrior_female_armored_oldhelm_swordless.png'
];
const swordlessWalk = swordlessIdle.map(name => name.replace('warrior_', 'walk8_'));

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
  assert.equal(bitDepth, 8, 'art is 8-bit');
  assert.equal(interlace, 0, 'art is not interlaced');
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

for (const name of attackSheets) test(`${name} has four attack frames in one row`, () => {
  const image = readFileSync(new URL(`../public/assets/${name}`, import.meta.url));
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  assert.equal(width % 4, 0, `${name}: 4칸으로 나눠지지 않는 폭 ${width}`);
  assert.ok(width > height * 3, `${name}: 4프레임 시트가 아님 (${width}×${height})`);
  assert.ok(width / 4 <= height, `${name}: 칸이 이미지 높이보다 넓음 (${width}×${height})`);
});

for (const name of attackSheets) test(`${name} keeps every pose inside its own cell`, () => {
  const { width, height, alpha } = decodeAlpha(readFileSync(new URL(`../public/assets/${name}`, import.meta.url)));
  const cell = width / 4;
  for (let frame = 1; frame < 4; frame += 1) {
    for (const x of [frame * cell - 1, frame * cell]) {
      let painted = 0;
      for (let y = 0; y < height; y += 1) if (alpha[y * width + x] > 0) painted += 1;
      assert.equal(painted, 0, `${name}: ${frame + 1}번째 칸 경계 x=${x}에 옆 칸 그림자가 ${painted}px 남음`);
    }
  }
});

// A one-pose image must not be sliced into four: 210x194 is no 4-frame row.
test('the attack sheets are the only four-frame images', () => {
  const single = [['warrior_male_attack.png', 210, 171], ['warrior_female_attack.png', 210, 186], ['warrior_armored_attack.png', 210, 194]];
  for (const [name, width, height] of single) {
    const image = readFileSync(new URL(`../public/assets/${name}`, import.meta.url));
    assert.equal(image.readUInt32BE(16), width, `${name} 폭`);
    assert.equal(image.readUInt32BE(20), height, `${name} 높이`);
    assert.ok(width / height < 2.2, `${name}은 4프레임 시트로 잘리면 안 됨`);
  }
});

test('swordless idle and walk assets have transparent, nonempty body art', () => {
  for (const name of [...swordlessIdle, ...swordlessWalk]) {
    const image = readFileSync(new URL(`../public/assets/${name}`, import.meta.url));
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', name);
    const { width, height, alpha } = decodeAlpha(image);
    assert(width > 500 && height > 500, `${name}: body art resolution`);
    assert(alpha.some(value => value > 20), `${name}: empty sprite`);
    assert(alpha.some(value => value === 0), `${name}: background is not transparent`);
  }
});

for (const name of swordlessWalk) test(`${name} keeps eight walking poses inside their cells`, () => {
  const { width, height, alpha } = decodeAlpha(readFileSync(new URL(`../public/assets/${name}`, import.meta.url)));
  assert(width / height > 1.9 && width / height < 2.1, `${name}: expected 4×2 sheet`);
  const midpoint = Math.round(height / 2);
  for (let frame = 0; frame < 8; frame++) {
    const left = Math.round((frame % 4) * width / 4);
    const right = Math.round(((frame % 4) + 1) * width / 4);
    const top = frame < 4 ? 0 : midpoint;
    const bottom = frame < 4 ? midpoint : height;
    let bodyPixels = 0;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (alpha[y * width + x] > 20) bodyPixels++;
    assert(bodyPixels > 1000, `${name}: missing frame ${frame}`);
    for (const edge of [left, right - 1]) for (let y = top; y < bottom; y++) {
      assert(alpha[y * width + edge] <= 20, `${name}: frame ${frame} crosses x=${edge}`);
    }
  }
});
