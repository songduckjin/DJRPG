import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { heroAppearance } = await import('../src/game/appearance.ts');
const { freshSave } = await import('../src/game/store.ts');
const { heroMotion } = await import('../src/game/render/heroMotion.ts');

for (const gender of ['male', 'female']) test(`${gender}: helmet-only skills keep the body upright and undistorted`, () => {
  const save = freshSave(gender);
  save.equipment.helmet = { id: 'helmet', name: '철제 바시넷', slot: 'helmet', rarity: 'rare', stats: {} };
  const art = heroAppearance(save);
  assert.equal(art.attack, undefined);
  const motion = heroMotion(!!art.attack, .16, 1, { age: .25, duration: 1 }, { swing: 1 }, { age: .5 });
  assert.deepEqual({ scaleX: motion.scaleX, scaleY: motion.scaleY, rotation: motion.rotation }, { scaleX: 1, scaleY: 1, rotation: 0 });
  assert(motion.pulse > 0);
  save.equipment.weapon = { id: 'weapon', name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: {} };
  const armed = heroAppearance(save);
  assert(armed.attack);
  const armedMotion = heroMotion(!!armed.attack, .16, 1, { age: .25, duration: 1 });
  assert.equal(armedMotion.rotation, Math.PI / 2);
  assert(armedMotion.scaleX > 1 && armedMotion.scaleY < 1);
});
