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
