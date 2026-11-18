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
