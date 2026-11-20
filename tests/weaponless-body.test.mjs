import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import './ts-loader.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { baseItems, bowBases, staffBases, hasNoWeapon } = await import('../src/game/items.ts');
const { usesSwordlessBody, swordlessBodyPath } = await import('../src/game/render/weapons.ts');
const { usesBowlessBody, bowlessBodyPath } = await import('../src/game/render/bows.ts');
const { usesStafflessBody, stafflessBodyPath } = await import('../src/game/render/staffs.ts');
const { equipmentFallbackPortrait } = await import('../src/ui/equipmentPortrait.ts');

const weapon = name => ({ id: `w-${name}`, name, slot: 'weapon', rarity: 'common', stats: { attack: 4 } });
const saveFor = (job, gender, weaponName) => {
  const save = freshSave(gender, job);
  if (weaponName) save.equipment.weapon = weapon(weaponName);
  return save;
};

/**
 * 무기 미장착 = 빈손으로 그리기(작업 216).
 *
 * 기본 본체 시트(`pilot*`·`archer_*`·`mage_*`)에는 0번 무기(기본 두손검·활·지팡이)가 그림으로 들어 있다.
 * 그래서 무기를 하나도 안 찬 캐릭터도 손에 무기를 들고 서 있었다. 이제 무기 칸이 비면 기본 무기를 지운
 * 판(`noweapon/`·`nobow/`·`mage_nostaff/`)으로 갈아 끼우고, 장비창·캐릭터 카드 초상화도 같은 판을 쓴다.
 */
test('무기 칸이 비었는지 판별한다(기본 무기 0번과 미착용은 다르다)', () => {
  assert.equal(hasNoWeapon(freshSave('male')), true);
  assert.equal(hasNoWeapon(saveFor('warrior', 'male', baseItems.weapon[0])), false, '0번(기본 두손검)을 차면 무기가 있다');
  const arrow = freshSave('male');
  arrow.equipment = { armor: { id: 'a', name: baseItems.armor[1], slot: 'armor', rarity: 'common', stats: {} } };
  assert.equal(hasNoWeapon(arrow), true, '갑옷만 차도 무기는 빈손');
});

test('세 직업 모두 무기를 안 차면 기본 무기를 지운 본체 시트를 쓴다', () => {
  // 전사 — 기본 검을 지운 noweapon 판.
  assert.equal(usesSwordlessBody(freshSave('male')), true);
  assert.equal(usesSwordlessBody(saveFor('warrior', 'male', baseItems.weapon[0])), false);
  assert.equal(usesSwordlessBody(saveFor('warrior', 'male', baseItems.weapon[3])), true, '0번이 아닌 검도 파츠를 얹으므로');

  // 궁수 — 기본 활대를 지운 nobow 판.
  assert.equal(usesBowlessBody(freshSave('female', 'archer')), true);
  assert.equal(usesBowlessBody(saveFor('archer', 'female', bowBases[0])), false, '0번 활은 본체 시트에 그려져 있다');
  assert.equal(usesBowlessBody(saveFor('archer', 'female', bowBases[6])), true);

  // 마법사 — 기본 지팡이를 지운 mage_nostaff 판.
  assert.equal(usesStafflessBody(freshSave('male', 'mage')), true);
  assert.equal(usesStafflessBody(saveFor('mage', 'male', staffBases[0])), true, '지팡이는 0번도 파츠를 얹는다');
});

test('장비창·캐릭터 카드 초상화도 빈손 판을 쓴다', () => {
  assert.equal(equipmentFallbackPortrait(freshSave('male', 'warrior')), swordlessBodyPath('male', 'idle'));
  assert.equal(equipmentFallbackPortrait(freshSave('female', 'archer')), bowlessBodyPath('female', 'idle'));
  assert.equal(equipmentFallbackPortrait(freshSave('male', 'mage')), stafflessBodyPath('male', 'idle'));
  // 무기를 차면 예전처럼 기준 시트(+파츠)를 쓴다.
  // 작업 222: 서기 시트를 다시 구워 `?v=3`.
  assert.match(equipmentFallbackPortrait(saveFor('warrior', 'male', baseItems.weapon[0])), /pilot-25d\/warrior_male_idle_v1\.png\?v=3$/);
  assert.match(equipmentFallbackPortrait(saveFor('archer', 'female', bowBases[0])), /archer_female_idle_v1\.png\?v=3$/);
  assert.match(equipmentFallbackPortrait(saveFor('mage', 'male', staffBases[0])), /mage_male_idle_v1\.png\?v=3$/);
});

test('빈손 판 시트 6장씩이 실제로 배포본에 있다(서기·걷기·공격)', () => {
  const root = fileURLToPath(new URL('../public/assets/pilot-25d/', import.meta.url));
  for (const gender of ['male', 'female']) {
    for (const motion of ['idle', 'walk', 'attack']) {
      assert(existsSync(`${root}noweapon/warrior_${gender}_${motion}_v1.png`), `noweapon ${gender} ${motion}`);
      assert(existsSync(`${root}nobow/archer_${gender}_${motion}_v1.png`), `nobow ${gender} ${motion}`);
      assert(existsSync(`${root}mage_nostaff/mage_${gender}_${motion}_v1.png`), `mage_nostaff ${gender} ${motion}`);
    }
  }
});
