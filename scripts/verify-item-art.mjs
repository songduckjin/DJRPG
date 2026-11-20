import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const items = readFileSync(new URL('../src/game/items.ts', import.meta.url), 'utf8');
const directory = fileURLToPath(new URL('../public/assets/item-art/', import.meta.url));
const ringBases = items.match(/const ringBases = \[([^\]]+)\]/)?.[1];
if (!ringBases) throw new Error('ringBases 목록을 찾을 수 없습니다.');
const groups = [...items.matchAll(/^\s+(weapon|offhand|helmet|armor|necklace|gloves|belt|boots): \[([^\]]+)\]/gm)]
  .map(([, slot, list]) => [slot, [...list.matchAll(/'([^']+)'/g)].map(([, name]) => name)]);
groups.push(['ring', [...ringBases.matchAll(/'([^']+)'/g)].map(([, name]) => name)]);
if (groups.length !== 9 || groups.some(([, names]) => names.length === 0)) throw new Error('장비 기본형 목록을 확인할 수 없습니다.');

let count = 0;
for (const [slot, names] of groups) for (let index = 0; index < names.length; index += 5) {
  const path = join(directory, `${slot}_${index}.png`);
  if (!existsSync(path)) throw new Error(`${slot} ${index}-${Math.min(index + 4, names.length - 1)} 이미지가 없습니다: ${path}`);
  const header = readFileSync(path).subarray(0, 24);
  if (header.toString('ascii', 1, 4) !== 'PNG' || header.readUInt32BE(16) !== 870 || header.readUInt32BE(20) !== 290) {
    throw new Error(`장비 이미지 크기 또는 형식이 잘못됐습니다: ${path}`);
  }
  count += Math.min(5, names.length - index);
}
console.log(`장비 그림 ${count}종 확인 완료.`);

const wearableDirectory = fileURLToPath(new URL('../public/assets/wearable/', import.meta.url));
const wearable = { weapon: 'weapons', helmet: 'helmets', armor: 'armor', gloves: 'gloves', boots: 'boots' };
for (const [slot, file] of Object.entries(wearable)) {
  const path = join(wearableDirectory, `${file}.png`);
  if (!existsSync(path)) throw new Error(`${slot} 착용 이미지가 없습니다: ${path}`);
  const data = readFileSync(path), header = data.subarray(0, 26);
  const hasAlpha = header[25] === 6 || header[25] === 3 && data.includes('tRNS');
  if (header.toString('ascii', 1, 4) !== 'PNG' || header.readUInt32BE(16) !== 1000 || header.readUInt32BE(20) !== 400 || !hasAlpha) {
    throw new Error(`착용 이미지 시트는 투명도가 있는 1000×400 PNG여야 합니다: ${path}`);
  }
}
console.log('착용 장비 아트 50종(5부위 × 10 프레임) 확인 완료.');

// ── 코스튬 아틀라스 v2 ([작업 142]) ──────────────────────────────────────────────
// 매니페스트가 매핑 55종을 담고, 변형이 가리키는 아틀라스 페이지가 셀 격자(234×242)에
// 맞는 PNG로 배포 폴더에 있는지 확인한다. 페이지 규칙은 `render/costumeHero.ts`와 같다.
const CELL = { width: 234, height: 242, columns: 8, rows: 8 };
const manifestTs = readFileSync(new URL('../src/game/costume/manifest.ts', import.meta.url), 'utf8');
const version = Number(manifestTs.match(/COSTUME_ASSET_VERSION = (\d+)/)?.[1]);
if (version !== 3) throw new Error(`COSTUME_ASSET_VERSION이 3이 아닙니다: ${version}`);

const costumeRoot = fileURLToPath(new URL(`../public/assets/costume/v${version}/`, import.meta.url));
const manifest = JSON.parse(readFileSync(join(costumeRoot, 'manifest.json'), 'utf8'));
if (manifest.schemaVersion !== 1) throw new Error(`코스튬 매니페스트 schemaVersion: ${manifest.schemaVersion}`);
const expectedCostumes = 55;
const ids = new Set();
for (const entry of manifest.costumes) {
  if (!entry.costumeId || ids.has(entry.costumeId)) throw new Error(`코스튬 costumeId 중복/누락: ${entry.costumeId}`);
  if (!['weapon', 'offhand', 'helmet', 'armor', 'gloves', 'boots'].includes(entry.slot)) throw new Error(`코스튬 부위 오류: ${entry.slot}`);
  ids.add(entry.costumeId);
}
if (manifest.costumes.length !== expectedCostumes) throw new Error(`코스튬 항목이 ${expectedCostumes}개가 아닙니다: ${manifest.costumes.length}`);

const pageGrid = (page) => {
  const path = join(costumeRoot, 'atlas', `${page}.png`);
  if (!existsSync(path)) throw new Error(`코스튬 아틀라스 페이지가 없습니다: ${page}.png`);
  const data = readFileSync(path), header = data.subarray(0, 24);
  if (header.toString('ascii', 1, 4) !== 'PNG') throw new Error(`아틀라스가 PNG가 아닙니다: ${page}.png`);
  const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
  if (width % CELL.width || height % CELL.height) throw new Error(`아틀라스가 셀 격자가 아닙니다: ${page}.png ${width}×${height}`);
  if (width / CELL.width < CELL.columns || height / CELL.height < CELL.rows) throw new Error(`아틀라스 칸 수 부족: ${page}.png ${width}×${height}`);
  return `${width}×${height}`;
};

const perSlot = new Map();
for (const entry of manifest.costumes) perSlot.set(entry.slot, (perSlot.get(entry.slot) ?? 0) + 1);
const sizes = new Set();
let pageCount = 0;
for (const [slot, count] of perSlot) for (const gender of ['male', 'female']) {
  for (let variant = 0; variant < count; variant++) {
    const base = `${slot}-${gender}`;
    const page = variant < 2 ? base : `${base}-${Math.floor(variant / 2) + 1}`;
    sizes.add(pageGrid(page));
    pageCount += 1;
  }
}
for (const gender of ['male', 'female']) {
  sizes.add(pageGrid(`body-${gender}`));
  sizes.add(pageGrid(`body-${gender}-2`));
  pageCount += 2;
}
console.log(`코스튬 아틀라스 v${version} 확인 완료: 매니페스트 ${manifest.costumes.length}종 · 페이지 ${new Set([...sizes]).size}종 규격(${[...sizes].join(', ')}) · 변형 참조 ${pageCount}건.`);

// ── 작업 145 단일 파일럿 아틀라스 ───────────────────────────────────────────────
// v4는 서리의 가죽두건 검수용 두 페이지뿐이며, v3 매니페스트와 별도 버전 URL을 쓴다.
const pilotRoot = fileURLToPath(new URL('../public/assets/costume/v4/atlas/', import.meta.url));
for (const gender of ['male', 'female']) {
  const name = `pilot-hood-${gender}.png`;
  const path = join(pilotRoot, name);
  if (!existsSync(path)) throw new Error(`작업 145 파일럿 아틀라스가 없습니다: ${name}`);
  const data = readFileSync(path), header = data.subarray(0, 26);
  if (header.toString('ascii', 1, 4) !== 'PNG'
    || header.readUInt32BE(16) !== CELL.width * CELL.columns
    || header.readUInt32BE(20) !== CELL.height * CELL.rows
    || header[25] !== 6) {
    throw new Error(`작업 145 파일럿 페이지는 ${CELL.width * CELL.columns}×${CELL.height * CELL.rows} RGBA PNG여야 합니다: ${name}`);
  }
}
console.log('작업 145 서리의 가죽두건 파일럿 아틀라스 2종 확인 완료.');

// 문장·갑옷·신발과 함께 착용할 때 쓰는 두건 전용 페이지는 별도 v5 URL이다.
const overlayRoot = fileURLToPath(new URL('../public/assets/costume/v5/atlas/', import.meta.url));
for (const gender of ['male', 'female']) for (const fit of ['armor', 'body']) {
  const name = `frost-hood-${fit}-${gender}.png`;
  const path = join(overlayRoot, name);
  if (!existsSync(path)) throw new Error(`작업 145 두건 전용 아틀라스가 없습니다: ${name}`);
  const header = readFileSync(path).subarray(0, 26);
  if (header.toString('ascii', 1, 4) !== 'PNG'
    || header.readUInt32BE(16) !== CELL.width * CELL.columns
    || header.readUInt32BE(20) !== CELL.height * CELL.rows
    || header[25] !== 6) {
    throw new Error(`작업 145 두건 전용 페이지는 ${CELL.width * CELL.columns}×${CELL.height * CELL.rows} RGBA PNG여야 합니다: ${name}`);
  }
}
console.log('작업 145 두건 전용 v5 아틀라스 4종 확인 완료.');

// ── 작업 151: 필드·장비창 투구 머리 파츠 ─────────────────────────────────────────
// 투구 10종(남성)과 여성 오픈페이스 0~2번 파츠는 본체 362px 셀 좌표계의 RGBA PNG 여야 한다.
const helmetRoot = fileURLToPath(new URL('../public/assets/pilot-25d/helmets/', import.meta.url));
const helmetParts = [...Array.from({ length: 10 }, (_, index) => `helm_${index}.png`),
  ...Array.from({ length: 3 }, (_, index) => `helm_female_${index}.png`)];
for (const name of helmetParts) {
  const path = join(helmetRoot, name);
  if (!existsSync(path)) throw new Error(`작업 151 투구 머리 파츠가 없습니다: ${name}`);
  const data = readFileSync(path), header = data.subarray(0, 26);
  const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
  if (header.toString('ascii', 1, 4) !== 'PNG' || header[25] !== 6) {
    throw new Error(`투구 머리 파츠는 투명도가 있는 RGBA PNG여야 합니다: ${name}`);
  }
  if (width < 40 || width > 140 || height < 40 || height > 140) {
    throw new Error(`투구 머리 파츠 크기가 본체 셀 기준을 벗어났습니다(${width}×${height}): ${name}`);
  }
}
console.log(`작업 151 투구 머리 파츠 ${helmetParts.length}종 확인 완료.`);

// ── 작업 154: 공격 3/4 옆모습 투구 파츠 ─────────────────────────────────────────
// 남녀 10종 × 공격 4프레임 = 80장. 파일명·RGBA·크기(본체 362px 셀 기준)를 함께 본다.
const attackHelmetRoot = join(helmetRoot, 'atk');
const attackHelmetParts = ['male', 'female'].flatMap(gender =>
  Array.from({ length: 10 }, (_, index) =>
    Array.from({ length: 4 }, (_, frame) => `${gender}_${index}_f${frame}.png`)).flat());
for (const name of attackHelmetParts) {
  const path = join(attackHelmetRoot, name);
  if (!existsSync(path)) throw new Error(`작업 154 공격 투구 파츠가 없습니다: atk/${name}`);
  const data = readFileSync(path), header = data.subarray(0, 26);
  const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
  // 256색 팔레트(tRNS) PNG 를 허용한다 — 정면 파츠와 같은 알파를 유지하면서 용량이 1/3이다.
  if (header.toString('ascii', 1, 4) !== 'PNG' || !(header[25] === 6 || (header[25] === 3 && data.includes('tRNS')))) {
    throw new Error(`공격 투구 파츠는 투명도가 있는 PNG여야 합니다: atk/${name}`);
  }
  // 크롭 아래가 목·칼라까지 내려가 정면 파츠(140px)보다 조금 크다.
  if (width < 40 || width > 170 || height < 40 || height > 170) {
    throw new Error(`공격 투구 파츠 크기가 본체 셀 기준을 벗어났습니다(${width}×${height}): atk/${name}`);
  }
}
console.log(`작업 154 공격 투구 파츠 ${attackHelmetParts.length}종 확인 완료.`);

// ── 작업 155: 착용 갑옷 10종 전신 시트 (서기·걷기·공격 × 전신/머리 없음) ───────────
// 남녀 10종 × 3동작 × 2(전신·투구용 headless) = 120장. 기준 시트와 같은 362px 셀 좌표계라
// idle 은 362×362, walk·attack 은 362px 셀 4개(1448×362)여야 한다. 용량은 256색 팔레트 PNG.
const armorSheetRoot = fileURLToPath(new URL('../public/assets/pilot-25d/armors/', import.meta.url));
const armorSheetSizes = { idle: [362, 362], walk: [1448, 362], attack: [1448, 362] };
let armorSheetCount = 0;
for (const gender of ['male', 'female']) {
  for (let index = 0; index < 10; index++) {
    for (const [motion, [expectWidth, expectHeight]] of Object.entries(armorSheetSizes)) {
      for (const headless of [false, true]) {
        const name = `warrior_${gender}_armor_${index}_${motion}_v1.png`;
        const path = join(armorSheetRoot, headless ? 'headless' : '', name);
        if (!existsSync(path)) throw new Error(`작업 155 갑옷 시트가 없습니다: ${headless ? 'headless/' : ''}${name}`);
        const data = readFileSync(path), header = data.subarray(0, 26);
        const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
        if (header.toString('ascii', 1, 4) !== 'PNG') throw new Error(`갑옷 시트가 PNG가 아닙니다: ${name}`);
        if (width !== expectWidth || height !== expectHeight) {
          throw new Error(`갑옷 시트 규격이 다릅니다(${width}×${height}, 기대 ${expectWidth}×${expectHeight}): ${name}`);
        }
        if (!(header[25] === 6 || (header[25] === 3 && data.includes('tRNS')))) {
          throw new Error(`갑옷 시트는 투명도가 있는 PNG여야 합니다: ${name}`);
        }
        if (data.length > 200 * 1024) throw new Error(`갑옷 시트가 200KB를 넘습니다(${Math.round(data.length / 1024)}KB): ${name}`);
        armorSheetCount += 1;
      }
    }
  }
}
console.log(`작업 155 착용 갑옷 전신 시트 ${armorSheetCount}장 확인 완료.`);

// ── 작업 160: 궁수 갑옷 1~9번 전신 시트 (서기·걷기·사격) ─────────────────────
// 0번(가죽 조끼)은 궁수 스타터 시트를 그대로 쓰므로 파일을 두지 않는다. 9티어 × 남녀 × 3동작 = 54장,
// 전사 갑옷과 같은 362px 셀 좌표계(idle 362×362, walk·attack 1448×362) · 256색 팔레트 PNG다.
const archerArmorRoot = fileURLToPath(new URL('../public/assets/pilot-25d/archer_armors/', import.meta.url));
let archerArmorCount = 0;
// 네 가지 판: 전신 / 기본 활 지움(nobow) / 머리 지움(headless) / 둘 다(nobow/headless).
const archerArmorVariants = ['', 'nobow', 'headless', join('nobow', 'headless')];
for (const gender of ['male', 'female']) {
  for (let index = 1; index <= 9; index++) {
    for (const [motion, [expectWidth, expectHeight]] of Object.entries(armorSheetSizes)) {
      for (const variant of archerArmorVariants) {
      const name = `archer_${gender}_armor_${index}_${motion}_v1.png`;
      const path = join(archerArmorRoot, variant, name);
      if (!existsSync(path)) throw new Error(`작업 160 궁수 갑옷 시트가 없습니다: ${name}`);
      const data = readFileSync(path), header = data.subarray(0, 26);
      const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
      if (header.toString('ascii', 1, 4) !== 'PNG') throw new Error(`궁수 갑옷 시트가 PNG가 아닙니다: ${name}`);
      if (width !== expectWidth || height !== expectHeight) {
        throw new Error(`궁수 갑옷 시트 규격이 다릅니다(${width}×${height}, 기대 ${expectWidth}×${expectHeight}): ${name}`);
      }
      if (!(header[25] === 6 || (header[25] === 3 && data.includes('tRNS')))) {
        throw new Error(`궁수 갑옷 시트는 투명도가 있는 PNG여야 합니다: ${name}`);
      }
      if (data.length > 200 * 1024) throw new Error(`궁수 갑옷 시트가 200KB를 넘습니다(${Math.round(data.length / 1024)}KB): ${name}`);
      archerArmorCount += 1;
      }
    }
  }
}
console.log(`작업 202 궁수 갑옷 시트 ${archerArmorCount}장(전신·활 지움·머리 지움·둘 다) 확인 완료.`);

// ── 작업 157: 궁수 기본 시트·활 10종 아이콘·스킬 아이콘 ───────────────────────────
// 전사 기준 시트와 같은 셀 좌표계(서기 362×362, 걷기·공격 1448×362)와 투명도를 함께 본다.
const archerSheetSizes = { idle: [362, 362], walk: [1448, 362], attack: [1448, 362] };
const archerRoot = fileURLToPath(new URL('../public/assets/pilot-25d/', import.meta.url));
for (const gender of ['male', 'female']) {
  for (const [motion, [expectWidth, expectHeight]] of Object.entries(archerSheetSizes)) {
    const name = `archer_${gender}_${motion}_v1.png`;
    const path = join(archerRoot, name);
    if (!existsSync(path)) throw new Error(`궁수 기본 시트가 없습니다: ${name}`);
    const data = readFileSync(path), header = data.subarray(0, 26);
    const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
    if (header.toString('ascii', 1, 4) !== 'PNG') throw new Error(`궁수 시트가 PNG가 아닙니다: ${name}`);
    if (width !== expectWidth || height !== expectHeight) {
      throw new Error(`궁수 시트 규격이 다릅니다(${width}×${height}, 기대 ${expectWidth}×${expectHeight}): ${name}`);
    }
    if (header[25] !== 6) throw new Error(`궁수 시트는 RGBA PNG여야 합니다: ${name}`);
  }
}
console.log('궁수 기본 시트 6장(남녀 × 서기·걷기·공격) 확인 완료.');

// 활 10종 아이콘 — `bowBases` 두 목록(각 5개)이 모두 그려져 있어야 한다.
const bowBases = items.match(/const bowBases = \[([^\]]+)\]/)?.[1];
if (!bowBases) throw new Error('bowBases 목록을 찾을 수 없습니다.');
const bowNames = [...bowBases.matchAll(/'([^']+)'/g)].map(([, name]) => name);
if (bowNames.length !== 10) throw new Error(`활 기본형이 10종이 아닙니다: ${bowNames.length}`);
for (let index = 0; index < bowNames.length; index += 5) {
  const path = join(directory, `bow_${index}.png`);
  if (!existsSync(path)) throw new Error(`활 아이콘 시트가 없습니다: bow_${index}.png`);
  const data = readFileSync(path), header = data.subarray(0, 26);
  if (header.toString('ascii', 1, 4) !== 'PNG' || header.readUInt32BE(16) !== 870 || header.readUInt32BE(20) !== 290) {
    throw new Error(`활 아이콘 시트는 870×290 PNG여야 합니다: bow_${index}.png`);
  }
  if (!(header[25] === 6 || (header[25] === 3 && data.includes('tRNS')))) throw new Error(`활 아이콘 시트에 투명도가 없습니다: bow_${index}.png`);
}
console.log(`궁수 활 ${bowNames.length}종 아이콘 확인 완료.`);

// 궁수 스킬·패시브 아이콘 시트 — 전사 시트와 같은 칸 규칙(4×2, 3×1)을 쓴다.
const iconRoot = fileURLToPath(new URL('../public/assets/icons/', import.meta.url));
const archerIcons = [['archer-skills.png', 4, 2], ['archer-passive-skills.png', 3, 1]];
for (const [name, columns, rows] of archerIcons) {
  const path = join(iconRoot, String(name));
  if (!existsSync(path)) throw new Error(`궁수 스킬 아이콘 시트가 없습니다: ${String(name)}`);
  const data = readFileSync(path), header = data.subarray(0, 26);
  const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
  if (header.toString('ascii', 1, 4) !== 'PNG' || width % Number(columns) || height % Number(rows)) {
    throw new Error(`궁수 스킬 아이콘 시트가 ${String(columns)}×${String(rows)} 격자가 아닙니다: ${String(name)}`);
  }
}
console.log('궁수 스킬·패시브 아이콘 시트 2종 확인 완료.');

// ── 작업 198: 마법사 기본 시트·지팡이 10종 아이콘·스킬 아이콘 ─────────────────────
// 전사·궁수 기준 시트와 같은 셀 좌표계(서기 362×362, 걷기·공격 1448×362)와 투명도를 함께 본다.
const mageSheetSizes = { idle: [362, 362], walk: [1448, 362], attack: [1448, 362] };
for (const gender of ['male', 'female']) {
  for (const [motion, [expectWidth, expectHeight]] of Object.entries(mageSheetSizes)) {
    const name = `mage_${gender}_${motion}_v1.png`;
    const path = join(archerRoot, name);
    if (!existsSync(path)) throw new Error(`마법사 기본 시트가 없습니다: ${name}`);
    const data = readFileSync(path), header = data.subarray(0, 26);
    const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
    if (header.toString('ascii', 1, 4) !== 'PNG') throw new Error(`마법사 시트가 PNG가 아닙니다: ${name}`);
    if (width !== expectWidth || height !== expectHeight) {
      throw new Error(`마법사 시트 규격이 다릅니다(${width}×${height}, 기대 ${expectWidth}×${expectHeight}): ${name}`);
    }
    if (header[25] !== 6) throw new Error(`마법사 시트는 RGBA PNG여야 합니다: ${name}`);
  }
}
console.log('마법사 기본 시트 6장(남녀 × 서기·걷기·공격) 확인 완료.');

// 지팡이 10종 아이콘 — `staffBases` 두 목록(각 5개)이 모두 그려져 있어야 한다.
const staffBases = items.match(/const staffBases = \[([^\]]+)\]/)?.[1];
if (!staffBases) throw new Error('staffBases 목록을 찾을 수 없습니다.');
const staffNames = [...staffBases.matchAll(/'([^']+)'/g)].map(([, name]) => name);
if (staffNames.length !== 10) throw new Error(`지팡이 기본형이 10종이 아닙니다: ${staffNames.length}`);
for (let index = 0; index < staffNames.length; index += 5) {
  const path = join(directory, `staff_${index}.png`);
  if (!existsSync(path)) throw new Error(`지팡이 아이콘 시트가 없습니다: staff_${index}.png`);
  const data = readFileSync(path), header = data.subarray(0, 26);
  if (header.toString('ascii', 1, 4) !== 'PNG' || header.readUInt32BE(16) !== 870 || header.readUInt32BE(20) !== 290) {
    throw new Error(`지팡이 아이콘 시트는 870×290 PNG여야 합니다: staff_${index}.png`);
  }
  if (!(header[25] === 6 || (header[25] === 3 && data.includes('tRNS')))) throw new Error(`지팡이 아이콘 시트에 투명도가 없습니다: staff_${index}.png`);
}
console.log(`마법사 지팡이 ${staffNames.length}종 아이콘 확인 완료.`);

// 마법사 스킬·패시브 아이콘 시트 — 전사·궁수 시트와 같은 칸 규칙(4×2, 3×1)을 쓴다.
for (const [name, columns, rows] of [['mage-skills.png', 4, 2], ['mage-passive-skills.png', 3, 1]]) {
  const path = join(iconRoot, name);
  if (!existsSync(path)) throw new Error(`마법사 스킬 아이콘 시트가 없습니다: ${name}`);
  const data = readFileSync(path), header = data.subarray(0, 26);
  const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
  if (header.toString('ascii', 1, 4) !== 'PNG' || width % columns || height % rows) {
    throw new Error(`마법사 스킬 아이콘 시트가 ${columns}×${rows} 격자가 아닙니다: ${name}`);
  }
}
console.log('마법사 스킬·패시브 아이콘 시트 2종 확인 완료.');

// ── 작업 156: 기본 검을 지운 본체 시트(noweapon) + 대검 파츠 9장 ────────────────────
// 0번(기본 두손검)은 본체 시트에 그려져 있고, 1~9번은 `weapons/weapon_{n}_v1.png` 파츠로
// 362px 셀 위에 얹는다. 그래서 기본 검을 지운 같은 시트가 본체 6종(갑옷 없음)과
// 갑옷 120장에 짝으로 있어야 한다(서기 362×362, 걷기·공격 1448×362).
const swordlessRoot = fileURLToPath(new URL('../public/assets/pilot-25d/noweapon/', import.meta.url));
let swordlessCount = 0;
const checkSwordlessSheet = (path, expectWidth, expectHeight) => {
  if (!existsSync(path)) throw new Error(`작업 156 기본 검 없는 시트가 없습니다: ${path}`);
  const data = readFileSync(path), header = data.subarray(0, 26);
  const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
  if (header.toString('ascii', 1, 4) !== 'PNG') throw new Error(`기본 검 없는 시트가 PNG가 아닙니다: ${path}`);
  if (width !== expectWidth || height !== expectHeight) {
    throw new Error(`기본 검 없는 시트 규격이 다릅니다(${width}×${height}): ${path}`);
  }
  if (!(header[25] === 6 || (header[25] === 3 && data.includes('tRNS')))) {
    throw new Error(`기본 검 없는 시트는 투명도가 있는 PNG여야 합니다: ${path}`);
  }
  if (data.length > 200 * 1024) throw new Error(`기본 검 없는 시트가 200KB를 넘습니다(${Math.round(data.length / 1024)}KB): ${path}`);
  swordlessCount += 1;
};
for (const gender of ['male', 'female']) {
  for (const [motion, [expectWidth, expectHeight]] of Object.entries(armorSheetSizes)) {
    for (const headless of [false, true]) {
      checkSwordlessSheet(join(swordlessRoot, headless ? 'headless' : '', `warrior_${gender}_${motion}_v1.png`), expectWidth, expectHeight);
      for (let index = 0; index < 10; index++) {
        const name = `warrior_${gender}_armor_${index}_${motion}_v1.png`;
        checkSwordlessSheet(join(swordlessRoot, 'armors', headless ? 'headless' : '', name), expectWidth, expectHeight);
      }
    }
  }
}
console.log(`작업 156 기본 검 없는 본체 시트 ${swordlessCount}장 확인 완료.`);

const weaponPartRoot = fileURLToPath(new URL('../public/assets/pilot-25d/weapons/', import.meta.url));
for (let index = 1; index < 10; index++) {
  const path = join(weaponPartRoot, `weapon_${index}_v1.png`);
  if (!existsSync(path)) throw new Error(`작업 156 대검 파츠가 없습니다: weapon_${index}_v1.png`);
  const data = readFileSync(path), header = data.subarray(0, 26);
  const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
  if (header.toString('ascii', 1, 4) !== 'PNG' || width !== 362 || height !== 362) {
    throw new Error(`대검 파츠는 362×362 PNG여야 합니다(${width}×${height}): weapon_${index}_v1.png`);
  }
  if (!(header[25] === 6 || (header[25] === 3 && data.includes('tRNS')))) {
    throw new Error(`대검 파츠는 투명도가 있는 PNG여야 합니다: weapon_${index}_v1.png`);
  }
  if (data.length > 200 * 1024) throw new Error(`대검 파츠가 200KB를 넘습니다: weapon_${index}_v1.png`);
}
console.log('작업 156 대검 파츠 9장 확인 완료.');

// ── 작업 160: 기본 활대를 지운 궁수 시트(nobow) + 활 파츠 9장 ─────────────────────────
// 0번(사냥꾼의 활)은 본체 시트에 그려져 있고, 1~9번은 `bows/bow_{n}_v1.png` 파츠로 얹는다.
// 파츠·본체 모두 기준 시트와 같은 362px 셀 좌표계여야 앵커를 다시 재지 않는다.
const nobowRoot = fileURLToPath(new URL('../public/assets/pilot-25d/nobow/', import.meta.url));
for (const gender of ['male', 'female']) {
  for (const [motion, width, height] of [['idle', 362, 362], ['walk', 1448, 362], ['attack', 1448, 362]]) {
    const path = join(nobowRoot, `archer_${gender}_${motion}_v1.png`);
    if (!existsSync(path)) throw new Error(`작업 160 기본 활 지운 시트가 없습니다: archer_${gender}_${motion}_v1.png`);
    const data = readFileSync(path), header = data.subarray(0, 26);
    if (header.toString('ascii', 1, 4) !== 'PNG' || header.readUInt32BE(16) !== width || header.readUInt32BE(20) !== height) {
      throw new Error(`기본 활 지운 시트 규격이 다릅니다(${header.readUInt32BE(16)}×${header.readUInt32BE(20)}): archer_${gender}_${motion}_v1.png`);
    }
    if (!(header[25] === 6 || (header[25] === 3 && data.includes('tRNS')))) {
      throw new Error(`기본 활 지운 시트는 투명도가 있는 PNG여야 합니다: archer_${gender}_${motion}_v1.png`);
    }
  }
}
console.log('작업 160 기본 활 지운 궁수 시트 6장 확인 완료.');

const bowPartRoot = fileURLToPath(new URL('../public/assets/pilot-25d/bows/', import.meta.url));
for (let index = 1; index < 10; index += 1) {
  const path = join(bowPartRoot, `bow_${index}_v1.png`);
  if (!existsSync(path)) throw new Error(`작업 160 활 파츠가 없습니다: bow_${index}_v1.png`);
  const data = readFileSync(path), header = data.subarray(0, 26);
  const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
  if (header.toString('ascii', 1, 4) !== 'PNG' || width !== 362 || height !== 362) {
    throw new Error(`활 파츠는 362×362 PNG여야 합니다(${width}×${height}): bow_${index}_v1.png`);
  }
  if (!(header[25] === 6 || (header[25] === 3 && data.includes('tRNS')))) {
    throw new Error(`활 파츠는 투명도가 있는 PNG여야 합니다: bow_${index}_v1.png`);
  }
  if (data.length > 200 * 1024) throw new Error(`활 파츠가 200KB를 넘습니다: bow_${index}_v1.png`);
}
console.log('작업 160 활 파츠 9장 확인 완료.');

// ── 작업 200: 궁수 전용 투구 파츠 20장 + 머리 없는 본체 12장 ─────────────────────────
// 투구 파츠는 서기 셀 전체(362×362)를 쓰고, 본체는 같은 자리에서 머리를 지운 시트로 갈아 끼운다.
// 갑옷(작업 155·archer_armors)·활(작업 160)과 셀 좌표계가 같아야 셋을 조합해도 앵커를 다시 재지 않는다.
const archerHelmRoot = fileURLToPath(new URL('../public/assets/pilot-25d/archer_helms/', import.meta.url));
for (const gender of ['male', 'female']) {
  for (let index = 0; index < 10; index += 1) {
    const name = `${gender}_${index}_v1.png`;
    const path = join(archerHelmRoot, name);
    if (!existsSync(path)) throw new Error(`작업 200 궁수 투구 파츠가 없습니다: ${name}`);
    const data = readFileSync(path), header = data.subarray(0, 26);
    const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
    if (header.toString('ascii', 1, 4) !== 'PNG' || width !== 362 || height !== 362) {
      throw new Error(`궁수 투구 파츠는 362×362 PNG여야 합니다(${width}×${height}): ${name}`);
    }
    if (!(header[25] === 6 || (header[25] === 3 && data.includes('tRNS')))) {
      throw new Error(`궁수 투구 파츠는 투명도가 있는 PNG여야 합니다: ${name}`);
    }
    if (data.length > 40 * 1024) throw new Error(`궁수 투구 파츠가 40KB를 넘습니다: ${name}`);
  }
}
console.log('작업 200 궁수 투구 파츠 20장 확인 완료.');

const archerHeadlessRoot = fileURLToPath(new URL('../public/assets/pilot-25d/archer_headless/', import.meta.url));
for (const gender of ['male', 'female']) {
  for (const bowless of [false, true]) {
    for (const [motion, width, height] of [['idle', 362, 362], ['walk', 1448, 362], ['attack', 1448, 362]]) {
      const path = join(archerHeadlessRoot, ...(bowless ? ['nobow'] : []), `archer_${gender}_${motion}_v1.png`);
      if (!existsSync(path)) throw new Error(`작업 200 머리 없는 궁수 시트가 없습니다: ${path}`);
      const data = readFileSync(path), header = data.subarray(0, 26);
      if (header.toString('ascii', 1, 4) !== 'PNG' || header.readUInt32BE(16) !== width || header.readUInt32BE(20) !== height) {
        throw new Error(`머리 없는 궁수 시트 규격이 다릅니다(${header.readUInt32BE(16)}×${header.readUInt32BE(20)}): ${path}`);
      }
      if (!(header[25] === 6 || (header[25] === 3 && data.includes('tRNS')))) {
        throw new Error(`머리 없는 궁수 시트는 투명도가 있는 PNG여야 합니다: ${path}`);
      }
      if (data.length > 160 * 1024) throw new Error(`머리 없는 궁수 시트가 160KB를 넘습니다: ${path}`);
    }
  }
}
console.log('작업 200 머리 없는 궁수 시트 12장 확인 완료.');
