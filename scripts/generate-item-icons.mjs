import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = readFileSync(new URL('../src/game/items.ts', import.meta.url), 'utf8');
const output = new URL('../public/assets/icons/items/', import.meta.url);
mkdirSync(output, { recursive: true });

const palette = [
  ['#9c988d', '#514d48', '#c6bdae'], ['#b6aaa0', '#635c58', '#dec8b5'],
  ['#b4b5ac', '#525e69', '#bbd5df'], ['#bfb5a0', '#64626b', '#dbc99e'],
  ['#c6b992', '#676b6e', '#eed4a0'], ['#91a5a7', '#3e5362', '#8bd2e2'],
  ['#a36a68', '#492b35', '#ee7771'], ['#a7aab0', '#454d62', '#d6d8eb'],
  ['#b2896b', '#4d3740', '#efae6c'], ['#e0bd7c', '#6a3b38', '#ffdf99']
];
const shield = tier => `<path d="M48 ${9 + tier % 3} Q67 15 78 21 L74 56 Q67 75 48 86 Q29 75 22 56 L18 21 Q32 14 48 ${9 + tier % 3}Z" fill="url(#metal)" stroke="#ead9b3" stroke-width="2"/><path d="M48 17 L70 25 L67 54 Q61 70 48 77 Q35 70 29 54 L26 25Z" fill="url(#dark)" stroke="url(#edge)" stroke-width="2"/>`;
const gem = (x, y, r = 7) => `<path d="M${x} ${y-r} L${x+r} ${y} L${x} ${y+r} L${x-r} ${y}Z" fill="url(#gem)" stroke="#f2ddac" stroke-width="1.5"/>`;
const rivets = coords => coords.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#e3d1a7"/>`).join('');

function weapon(tier) {
  const blade = [
    'M48 5 L55 48 L48 56 L41 48Z',
    'M48 4 L58 46 L48 56 L38 46Z',
    'M48 3 L60 45 L48 56 L36 45Z',
    'M48 2 L59 48 L48 59 L37 48Z',
    'M48 3 Q61 12 55 23 Q62 35 56 47 L48 58 L40 47 Q34 35 41 23 Q35 12 48 3Z',
    'M48 3 L58 46 L48 57 L38 46Z',
    'M48 3 L61 45 L48 58 L35 45Z',
    'M48 2 L62 48 L48 59 L34 48Z',
    'M48 2 L64 46 L48 59 L32 46Z',
    'M48 1 L63 48 L48 60 L33 48Z'
  ][tier];
  const guard = tier === 3 ? '<path d="M26 60 Q33 53 48 58 Q63 53 70 60 L66 65 Q56 60 48 62 Q40 60 30 65Z" fill="url(#edge)"/>'
    : tier >= 7 ? '<path d="M23 58 Q36 68 48 58 Q60 68 73 58 L70 66 Q58 72 48 64 Q38 72 26 66Z" fill="url(#edge)"/>'
    : '<path d="M28 57 Q38 61 48 57 Q58 61 68 57 L67 63 Q55 65 48 61 Q41 65 29 63Z" fill="url(#edge)"/>';
  return `<g transform="rotate(34 48 48)"><path d="${blade}" fill="url(#metal)" stroke="#e7e0ca" stroke-width="2"/><path d="M48 9 L48 49" stroke="url(#edge)" stroke-width="2"/>${tier >= 5 ? gem(48, 35, 4) : ''}${tier === 4 ? '<path d="M40 20 L52 27 M44 37 L56 44" stroke="url(#gem)" stroke-width="2"/>' : ''}${guard}<path d="M44 61 L52 61 L53 83 L48 88 L43 83Z" fill="url(#dark)" stroke="url(#edge)" stroke-width="2"/><circle cx="48" cy="87" r="4" fill="url(#gem)" stroke="#dbcb9d" stroke-width="1.5"/></g>`;
}

function art(slot, tier) {
  const variant = tier % 5;
  switch (slot) {
    case 'weapon': return weapon(tier);
    case 'offhand': return `${shield(tier)}<path d="M48 25 L${59 + variant} 43 L48 68 L${37 - variant} 43Z" fill="url(#edge)"/>${gem(48, 42, 5 + variant)}${rivets([[32, 29], [64, 29]])}`;
    case 'helmet': return `<path d="M19 52 Q19 15 48 ${10 + variant} Q77 15 77 52 L69 76 L57 78 L55 58 L41 58 L39 78 L27 76Z" fill="url(#metal)" stroke="#e8d7ae" stroke-width="2"/><path d="M26 48 Q48 ${38 - variant} 70 48 L66 57 L55 53 L48 62 L41 53 L30 57Z" fill="url(#dark)" stroke="url(#edge)" stroke-width="2"/><path d="M29 66 L42 61 M67 66 L54 61" stroke="#261e26" stroke-width="4"/>${tier >= 6 ? `<path d="M29 24 Q${14 - variant} 12 18 5 M67 24 Q${82 + variant} 12 78 5" fill="none" stroke="url(#edge)" stroke-width="5"/>` : tier >= 3 ? '<path d="M48 11 L48 44" stroke="url(#edge)" stroke-width="5"/>' : ''}${gem(48, 31, 3 + variant)}`;
    case 'armor': return `<path d="M32 12 L20 24 L14 48 L26 56 L30 78 L48 88 L66 78 L70 56 L82 48 L76 24 L64 12 L55 20 L41 20Z" fill="url(#metal)" stroke="#e3d5b3" stroke-width="2"/><path d="M34 23 L48 ${33 + variant} L62 23 L67 53 L58 73 L48 80 L38 73 L29 53Z" fill="url(#dark)" stroke="url(#edge)" stroke-width="2"/><path d="M31 44 L48 57 L65 44 M36 65 L48 57 L60 65" fill="none" stroke="url(#edge)" stroke-width="2"/>${gem(48, 44, 3 + variant)}${rivets([[25, 31], [71, 31], [33, 72], [63, 72]])}`;
    case 'necklace': return `<path d="M24 19 Q17 42 37 59 L48 67 L59 59 Q79 42 72 19" fill="none" stroke="url(#edge)" stroke-width="${3 + variant}"/><path d="M29 22 Q24 41 40 54 M67 22 Q72 41 56 54" fill="none" stroke="#e8dabb" stroke-width="2"/><path d="M48 59 L${60 + variant} 70 L48 88 L${36 - variant} 70Z" fill="url(#metal)" stroke="url(#edge)" stroke-width="2"/>${gem(48, 72, 5 + variant)}`;
    case 'gloves': return `<g transform="rotate(-12 48 48)"><path d="M21 68 L20 41 Q20 34 25 35 L31 47 L30 25 Q30 19 35 19 L39 43 L40 18 Q41 12 46 14 L49 42 L52 20 Q54 15 59 18 L58 45 L63 28 Q67 24 71 28 L68 54 L74 70 L63 82 L35 83Z" fill="url(#metal)" stroke="#e9d9b6" stroke-width="2"/><path d="M28 65 L67 62 L70 73 L36 76Z" fill="url(#dark)" stroke="url(#edge)" stroke-width="2"/>${gem(49, 61, 3 + variant)}${rivets([[34, 68], [62, 68]])}</g>`;
    case 'belt': return `<path d="M10 34 Q48 ${24 + variant} 86 34 L85 66 Q48 ${73 - variant} 11 66Z" fill="url(#dark)" stroke="url(#edge)" stroke-width="3"/><path d="M11 41 Q48 ${34 + variant} 85 41 M11 59 Q48 ${66 - variant} 85 59" fill="none" stroke="#b5a78d" stroke-width="2"/><path d="M35 31 L61 31 L65 69 L31 69Z" fill="url(#metal)" stroke="#ead8b0" stroke-width="2"/><path d="M40 38 L56 38 L58 62 L38 62Z" fill="url(#dark)" stroke="url(#edge)" stroke-width="2"/>${gem(48, 50, 3 + variant)}${rivets([[20, 49], [76, 49]])}`;
    case 'boots': return `<path d="M19 12 L43 12 L42 57 Q43 66 51 68 L55 80 Q44 88 14 85 L10 73 L18 61Z M55 12 L78 12 L76 57 Q78 66 86 69 L88 82 Q73 90 50 84 L48 73 L55 59Z" fill="url(#metal)" stroke="#e4d4b3" stroke-width="2"/><path d="M18 40 L42 40 M55 40 L77 40 M12 76 L52 77 M50 77 L88 77" stroke="url(#edge)" stroke-width="${3 + variant % 2}"/>${gem(30, 35, 3 + variant)}${gem(66, 35, 3 + variant)}`;
    case 'ring': return `<ellipse cx="48" cy="57" rx="25" ry="27" fill="none" stroke="url(#metal)" stroke-width="${9 + variant}"/><ellipse cx="48" cy="57" rx="19" ry="21" fill="none" stroke="url(#edge)" stroke-width="2"/><path d="M34 31 L39 17 L57 17 L62 31 L48 43Z" fill="url(#metal)" stroke="#e9d9b6" stroke-width="2"/>${gem(48, 28, 5 + variant)}${tier >= 2 ? rivets([[25, 55], [71, 55]]) : ''}`;
    default: throw new Error(`Unknown slot: ${slot}`);
  }
}

function svg(slot, tier, name) {
  const [light, dark, accent] = palette[Math.min(9, tier)];
  const safeName = name.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="${safeName}"><defs><linearGradient id="metal" x2="1" y2="1"><stop stop-color="${light}"/><stop offset=".5" stop-color="#e3d7bc"/><stop offset="1" stop-color="${dark}"/></linearGradient><linearGradient id="dark" x2="1" y2="1"><stop stop-color="${dark}"/><stop offset="1" stop-color="#201b22"/></linearGradient><linearGradient id="edge" x2="1" y2="1"><stop stop-color="${accent}"/><stop offset="1" stop-color="${dark}"/></linearGradient><radialGradient id="gem"><stop stop-color="#fff0c7"/><stop offset=".42" stop-color="${accent}"/><stop offset="1" stop-color="${dark}"/></radialGradient></defs><circle cx="48" cy="48" r="43" fill="#16131b" opacity=".32"/>${art(slot, tier)}</svg>\n`;
}

const ring = source.match(/const ringBases = \[([^\]]+)\]/)?.[1];
if (!ring) throw new Error('ringBases not found');
const entries = [...source.matchAll(/^\s+(weapon|offhand|helmet|armor|necklace|gloves|belt|boots): \[([^\]]+)\]/gm)]
  .map(([, slot, list]) => [slot, [...list.matchAll(/'([^']+)'/g)].map(([, name]) => name)]);
entries.push(['ring', [...ring.matchAll(/'([^']+)'/g)].map(([, name]) => name)]);
if (entries.length !== 9 || entries.some(([, names]) => names.length === 0)) throw new Error('Equipment base list is incomplete');
for (const [slot, names] of entries) for (const [tier, name] of names.entries()) {
  writeFileSync(join(fileURLToPath(output), `${slot}_${String(tier).padStart(2, '0')}.svg`), svg(slot, tier, name));
}
console.log(`Generated ${entries.reduce((count, [, names]) => count + names.length, 0)} equipment icons.`);
