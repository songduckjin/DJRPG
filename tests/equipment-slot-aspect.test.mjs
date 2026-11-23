import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';

// [작업 231] 장착 칸 아이콘 정비율 — 칸 높이(48/46px)는 그대로 두고, 아이콘만 원본 비율로 그린다.
// CSS만으로 정해지는 규칙이라(칸 grid 두 줄 · 아이콘 max-width/height · 아틀라스 aspect-ratio) 규칙 문자열과
// 그 규칙이 기대는 **원본 그림 비율**(item-art 아틀라스 한 칸)을 함께 고정한다.
const styles = modalStyles();
const equipSource = readFileSync(new URL('../src/ui/modals/equipModal.ts', import.meta.url), 'utf8');
const { slotAtlasStyle } = await import('../src/ui/slotArtStyle.ts');
const { itemArtCell, itemArtTrim } = await import('../src/ui/itemArtTrim.generated.ts');

function rule(selector) {
  const index = styles.indexOf(`${selector} {`);
  assert.notEqual(index, -1, `${selector} 규칙이 없다`);
  const end = styles.indexOf('}', index);
  return styles.slice(index, end + 1);
}

/** PNG IHDR만 읽어 가로·세로를 돌려준다(압축 해제 없이). */
function pngSize(path) {
  const buffer = readFileSync(path);
  assert.equal(buffer.toString('ascii', 12, 16), 'IHDR', `${path} 가 PNG가 아니다`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const atlasDir = new URL('../public/assets/item-art/', import.meta.url);
const atlases = readdirSync(atlasDir).filter(name => name.endsWith('.png'));

test('장착 칸은 아이콘·라벨 두 줄 grid라 아이콘 영역 높이가 확정된다', () => {
  const slot = rule('.equipment-slot');
  assert.match(slot, /display: grid/);
  assert.match(slot, /grid-template-rows: minmax\(0, 1fr\) auto/);
  assert.match(slot, /--slot-art-ratio: 174 \/ 290/);
  assert.match(rule('.equipment-slot .slot-part'), /grid-row: 2/);
});

test('아이콘은 늘리지 않고 상자 안에서만 줄인다(가로 100% 고정 금지)', () => {
  const icon = rule('.equipment-slot .slot-icon');
  assert.doesNotMatch(icon, /[;{] width: 100%/, '가로를 100%로 고정하면 그림이 늘어난다');
  assert.doesNotMatch(icon, /[;{] height: 0;/);
  assert.match(icon, /grid-row: 1/);
  assert.match(icon, /max-width: 100%/);
  assert.match(icon, /max-height: 100%/);
  assert.match(icon, /object-fit: contain/);
});

test('아틀라스(배경 그림) 아이콘은 한 칸의 원본 비율을 상자에 그대로 준다', () => {
  const atlas = rule('.equipment-slot .slot-icon.atlas-icon');
  assert.match(atlas, /aspect-ratio: var\(--slot-art-ratio\)/);
  assert.match(atlas, /height: 100%/);
  assert.match(atlas, /max-width: 100%/);
  // 배경은 5칸을 가로로 늘여 놓은 것이라, 상자 비율이 한 칸 비율과 같아야 각 칸이 찌그러지지 않는다.
  assert.match(atlas, /background-size: 500% 100%/);
});

test('하드코딩한 174:290 이 실제 item-art 아틀라스(870×290 ÷ 5열)와 같다', () => {
  assert.ok(atlases.length >= 11, `아틀라스가 ${atlases.length}장뿐이다`);
  for (const name of atlases) {
    const { width, height } = pngSize(new URL(name, atlasDir));
    assert.equal(height, 290, `${name} 높이가 290이 아니다`);
    assert.equal(width, 870, `${name} 폭이 870이 아니다`);
    const frame = width / 5;
    assert.equal(frame, 174, `${name} 한 칸 폭이 174가 아니다`);
    // CSS의 `--slot-art-ratio: 174 / 290` 과 같은 값(부동소수 오차 허용).
    assert.ok(Math.abs(frame / height - 174 / 290) < 1e-9);
  }
});

test('모바일 가방 최소 높이(135px)와 좌우 기둥 5줄 규칙은 그대로다', () => {
  // B안(2026-11-22): 장착 칸은 좌우 기둥 안에서 5줄 1fr로 서고, 칸 자체의 48/46px 높이 규칙은 사라졌다.
  assert.match(styles, /\.equipment-slot-col \{ display: grid; grid-template-rows: repeat\(5, minmax\(0, 1fr\)\); gap: 4px;/);
  assert.match(styles, /\.equipment-slot-col \.equipment-slot \{ height: auto; aspect-ratio: auto; \}/);
  assert.doesNotMatch(styles, /\.equipment-grid \{ grid-template-rows/);
  assert.match(styles, /\.equipment-modal \.bag-grid \{ min-height: 135px; \}/);
});

test('칸이 실제로 쓰는 마크업이 CSS 규칙과 맞는다(5열 아틀라스=span·그 외=img)', () => {
  // itemIcon: 5열 아틀라스만 배경 그림 span(`atlas-icon`), 나머지는 `<img class="slot-icon">`.
  assert.match(equipSource, /columns === 5\) return `<span class="\$\{className\} atlas-icon"/);
  assert.match(equipSource, /return `<img class="\$\{className\}" src="\$\{this\.iconPath\(slot, item\)\}"/);
  // 칸은 아이콘 + 부위 라벨 두 요소만 넣는다(grid 두 줄과 1:1).
  assert.match(equipSource, /itemIcon\.call\(this, slot, item, 'slot-icon'\)\}<small class="slot-part">\$\{slotLabel\}<\/small>/);
});

test('내용 상자(trim) 표가 모든 item-art 아틀라스를 덮고, 한 칸(174×290) 안에 들어 있다', () => {
  for (const name of atlases) {
    const key = name.replace(/\.png$/, '');
    const trim = itemArtTrim[key];
    assert.ok(trim, `${key} 상자가 표에 없다 — scripts/build-item-art-trim.py 로 다시 만든다`);
    const [x, y, width, height] = trim;
    assert.ok(width >= 4 && height >= 4, `${key} 상자가 너무 작다`);
    assert.ok(x > 0 && y > 0, `${key} 상자가 칸 경계에 닿으면 이웃 칸이 비친다`);
    assert.ok(x + width < itemArtCell.width, `${key} 상자가 오른쪽 경계를 넘는다`);
    assert.ok(y + height < itemArtCell.height, `${key} 상자가 아래 경계를 넘는다`);
  }
});

test('칸 아이콘 스타일은 내용 상자만 칸에 꽉 차게 그린다(퍼센트·비율 계산)', () => {
  const [x, y, width, height] = itemArtTrim.helmet_0;
  const style = slotAtlasStyle('/assets/item-art/helmet_0.png', 1);
  const sizeX = (itemArtCell.width * 5 / width) * 100;
  const sizeY = (itemArtCell.height / height) * 100;
  const positionX = ((1 * itemArtCell.width + x) / (itemArtCell.width * 5 - width)) * 100;
  const positionY = (y / (itemArtCell.height - height)) * 100;
  assert.match(style, new RegExp(`background-image:url\\('/assets/item-art/helmet_0\\.png'\\)`));
  assert.ok(style.includes(`background-size:${sizeX.toFixed(4)}% ${sizeY.toFixed(4)}%`), style);
  assert.ok(style.includes(`background-position:${positionX.toFixed(4)}% ${positionY.toFixed(4)}%`), style);
  assert.ok(style.includes(`aspect-ratio:${width} / ${height}`), '그림은 늘리지 않고 상자 비율을 그대로 쓴다');
  assert.ok(positionX >= 0 && positionX <= 100 && positionY >= 0 && positionY <= 100, '퍼센트 위치가 범위를 벗어난다');
});

test('표에 없는 아틀라스는 예전처럼 5칸 균등 위치로 물러난다', () => {
  const style = slotAtlasStyle('/assets/item-art/unknown_0.png', 2);
  assert.equal(style, "background-image:url('/assets/item-art/unknown_0.png');background-position:40% center");
});

test('칸 아이콘이 실제로 한 프레임의 내용 상자만 보여 준다(배경 계산 역산)', () => {
  // 배경 그림이 실제로 어떤 영역을 보여 주는지 역산해, 그 영역이 정확히 내용 상자와 같아야 한다.
  // (배경 크기를 칸 폭 기준으로 잡는 실수를 이 검사가 잡는다.)
  const boxWidth = 27.296875, boxHeight = 32.609375;
  for (const [key, frame] of [['helmet_0', 0], ['helmet_0', 3], ['ring_0', 1], ['bow_0', 4]]) {
    const style = slotAtlasStyle(`/assets/item-art/${key}.png`, frame);
    const [x, y, width, height] = itemArtTrim[key];
    const sizeX = Number(style.match(/background-size:([\d.]+)%/)[1]) / 100;
    const sizeY = Number(style.match(/background-size:[\d.]+% ([\d.]+)%/)[1]) / 100;
    const posX = Number(style.match(/background-position:([\d.]+)%/)[1]) / 100;
    const posY = Number(style.match(/background-position:[\d.]+% ([\d.]+)%/)[1]) / 100;
    const atlasWidth = itemArtCell.width * 5;
    const imageWidth = boxWidth * sizeX, imageHeight = boxHeight * sizeY;
    const offsetX = posX * (boxWidth - imageWidth), offsetY = posY * (boxHeight - imageHeight);
    const scaleX = imageWidth / atlasWidth, scaleY = imageHeight / itemArtCell.height;
    const left = -offsetX / scaleX, right = (boxWidth - offsetX) / scaleX;
    const top = -offsetY / scaleY, bottom = (boxHeight - offsetY) / scaleY;
    assert.ok(Math.abs(left - (frame * itemArtCell.width + x)) < 1.5, `${key} ${frame}: 왼쪽 ${left}`);
    assert.ok(Math.abs(right - (frame * itemArtCell.width + x + width)) < 1.5, `${key} ${frame}: 오른쪽 ${right}`);
    assert.ok(Math.abs(top - y) < 1.5, `${key} ${frame}: 위 ${top}`);
    assert.ok(Math.abs(bottom - (y + height)) < 1.5, `${key} ${frame}: 아래 ${bottom}`);
  }
});
