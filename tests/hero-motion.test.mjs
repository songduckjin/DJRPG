import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { heroAppearance } = await import('../src/game/appearance.ts');
const { freshSave } = await import('../src/game/store.ts');
const { heroAnimationMode, heroMotion } = await import('../src/game/render/heroMotion.ts');
const { heroBodyPx, heroBodyFraction, heroScale } = await import('../src/game/render/heroScale.ts');

for (const gender of ['male', 'female']) test(`${gender}: helmet-only skills keep the body upright and undistorted`, () => {
  const save = freshSave(gender);
  save.equipment.helmet = { id: 'helmet', name: '철제 바시넷', slot: 'helmet', rarity: 'rare', stats: {} };
  const art = heroAppearance(save);
  assert.equal(art.attack, undefined);
  const motion = heroMotion(.16);
  assert.deepEqual({ scaleX: motion.scaleX, scaleY: motion.scaleY, rotation: motion.rotation }, { scaleX: 1, scaleY: 1, rotation: 0 });
  assert(motion.pulse > 0);
  assert.equal(heroMotion(.16).rotation, 0, 'spin is shown by VFX and afterimages, not a body turn');
  save.equipment.weapon = { id: 'weapon', name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: {} };
  const armed = heroAppearance(save);
  assert(armed.attack);
  const armedMotion = heroMotion(.16);
  assert.deepEqual({ scaleX: armedMotion.scaleX, scaleY: armedMotion.scaleY, rotation: armedMotion.rotation }, { scaleX: 1, scaleY: 1, rotation: 0 });
  assert.equal(heroMotion(.16).rotation, 0, 'weapon and gender do not change the spin body policy');
});

for (const gender of ['male', 'female']) for (const helmet of [false, true]) for (const armor of [false, true]) for (const weapon of [false, true]) {
  test(`${gender}: idle/walk/attack draw the body at the same size with helmet ${helmet}, armor ${armor}, weapon ${weapon}`, () => {
    const save = freshSave(gender);
    if (helmet) save.equipment.helmet = { id: 'helmet', name: '철제 바시넷', slot: 'helmet', rarity: 'rare', stats: {} };
    if (armor) save.equipment.armor = { id: 'armor', name: '사슬 갑옷', slot: 'armor', rarity: 'rare', stats: {} };
    if (weapon) save.equipment.weapon = { id: 'weapon', name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: {} };
    const art = heroAppearance(save);
    const screenHeight = 800;
    for (const key of [art.idle, art.walk, art.attack]) {
      if (!key) continue;
      const bodyPx = heroBodyPx[key];
      assert.equal(typeof bodyPx, 'number', `${key} has no measured body height`);
      const scale = heroScale(screenHeight, key, 1);
      assert(Math.abs(scale * bodyPx - screenHeight * heroBodyFraction) < 1e-9, `${key} draws the body at the wrong size`);
    }
  });
}

for (const gender of ['male', 'female']) for (const helmet of [false, true]) for (const armor of [false, true]) {
  test(`${gender}: moving hero shows walk frames with helmet ${helmet} and armor ${armor}`, () => {
    const save = freshSave(gender);
    if (helmet) save.equipment.helmet = { id: 'helmet', name: '철제 바시넷', slot: 'helmet', rarity: 'rare', stats: {} };
    if (armor) save.equipment.armor = { id: 'armor', name: '사슬 갑옷', slot: 'armor', rarity: 'rare', stats: {} };
    for (const armed of [false, true]) {
      if (armed) save.equipment.weapon = { id: 'weapon', name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: {} };
      const art = heroAppearance(save);
      assert(art.walk);
      assert.equal(heroAnimationMode(true, .16, !!art.attack), 'walk');
      assert.equal(heroAnimationMode(false, .16, !!art.attack), armed ? 'attack' : 'idle');
    }
  });
}
