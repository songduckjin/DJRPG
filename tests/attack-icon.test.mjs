import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import './ts-loader.mjs';

const { attackIconPath, applySkillArtwork } = await import('../src/ui/skillArtwork.ts');
const iconRoot = fileURLToPath(new URL('../public/assets/icons/', import.meta.url));

/** 8비트 RGBA PNG 한 장을 푼다(알파까지 확인하려면 실제 픽셀이 필요하다). */
function decodePng(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG', `${path}: PNG가 아니다`);
  let offset = 8, width = 0, height = 0, depth = 0, colorType = 0;
  const chunks = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; colorType = data[9]; }
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
  return { width, height, depth, colorType, alphaAt: (x, y) => out[(y * width + x) * 4 + 3] };
}

/**
 * 직업별 기본 평타 원형 아이콘(작업 216).
 *
 * 승인된 원형 메달리온 3장(대검·활·마법탄)을 원 밖만 투명하게 잘라 256px로 구워
 * `public/assets/icons/attack_{warrior,archer,mage}.png`로 배치했고, 액션 패드의 기본 공격 원과
 * 스킬 창의 `대검 베기·활 사격·마법탄` 카드가 직업에 맞는 그림을 쓴다.
 */
test('평타 아이콘 3장은 256px RGBA PNG이고 원 밖이 투명하다', () => {
  for (const job of ['warrior', 'archer', 'mage']) {
    const path = join(iconRoot, `attack_${job}.png`);
    assert(existsSync(path), `아이콘이 없다: ${path}`);
    const png = decodePng(path);
    assert.equal(png.width, 256, `${job}: 너비`);
    assert.equal(png.height, 256, `${job}: 높이`);
    assert.equal(png.depth, 8, `${job}: 8비트`);
    assert.equal(png.colorType, 6, `${job}: 알파가 있는 RGBA여야 한다`);
    // 원형 아이콘이라 네 모서리는 투명, 가운데는 불투명하다.
    for (const [x, y] of [[0, 0], [255, 0], [0, 255], [255, 255]]) assert.equal(png.alphaAt(x, y), 0, `${job}: 모서리 (${x},${y})는 투명`);
    assert(png.alphaAt(128, 128) > 200, `${job}: 가운데는 불투명`);
  }
});

test('평타 아이콘 3장은 서로 다른 그림이고 배포 규격 안에 들어간다', () => {
  const digests = new Set();
  for (const job of ['warrior', 'archer', 'mage']) {
    const path = join(iconRoot, `attack_${job}.png`);
    const size = readFileSync(path).length;
    assert(size > 20_000 && size < 400_000, `${job}: ${size}B — 256px 메달리온으로 적당한 크기`);
    digests.add(createHash('sha256').update(readFileSync(path)).digest('hex'));
  }
  assert.equal(digests.size, 3, '세 직업이 같은 그림을 쓰지 않는다');
});

test('직업별 평타 아이콘 경로와 액션 패드 그림 선택', () => {
  assert.equal(attackIconPath('warrior'), '/assets/icons/attack_warrior.png');
  assert.equal(attackIconPath('archer'), '/assets/icons/attack_archer.png');
  assert.equal(attackIconPath('mage'), '/assets/icons/attack_mage.png');
  assert.equal(attackIconPath(), '/assets/icons/attack_warrior.png', '직업이 없으면 전사');
  assert.equal(attackIconPath('unknown'), '/assets/icons/attack_warrior.png');
  const art = { style: {}, hidden: false };
  const button = { querySelector: () => art, classList: { toggle() {} } };
  applySkillArtwork(button, 'attack', 'mage');
  assert(art.style.backgroundImage.includes('attack_mage.png'));
  assert.equal(art.style.backgroundSize, 'contain');
});
