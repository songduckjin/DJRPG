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
