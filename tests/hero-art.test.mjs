import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const attackSheets = [
  'warrior_female_armored_attack.png',
  'warrior_female_armored_helm_attack.png',
  'warrior_female_armored_oldhelm_attack.png',
  'warrior_female_helm_attack.png',
  'warrior_female_oldhelm_attack.png',
  'warrior_male_helm_attack.png'
];

for (const name of attackSheets) test(`${name} has four attack frames in one row`, () => {
  const image = readFileSync(new URL(`../public/assets/${name}`, import.meta.url));
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  assert.equal(width, height * 3, `${name}: expected a 4×1 attack sheet, received ${width}×${height}`);
});
