import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../tests/ts-loader.mjs';
const { coverModeNote, coverModes, partPlan, pose, estimateCanvas, productionFrames } = await import('./model.ts');

test('eight walking frames keep a stable foot pivot and distinct hand anchors', () => {
  const hands = new Set();
  for (let frame = 0; frame < 8; frame++) {
    const state = pose(frame, 'one');
    assert.equal(state.legs.y, 0);
    hands.add(`${state.hand.x.toFixed(2)},${state.hand.y.toFixed(2)}`);
  }
  assert(hands.size >= 4);
  assert.deepEqual(pose(8, 'one'), pose(0, 'one'));
});

test('greatsword and downward strike require a larger measured canvas', () => {
  const one = estimateCanvas('one');
  const great = estimateCanvas('great');
  assert(great.width > one.width);
  assert(great.height >= one.height);
  assert(pose(0, 'great', 'smash').hand.y < pose(0, 'great', 'walk').hand.y);
});

test('sharing one armor frame set between weapon families halves armor production', () => {
  const shared = productionFrames(1, true, 1);
  const duplicated = productionFrames(1, false, 1);
  assert.equal(duplicated.armor, shared.armor * 2);
  assert.equal(shared.body, duplicated.body);
});

test('hide mode turns off the bare part that the gear covers and draws a gear layer', () => {
  const plan = partPlan({ armor: true, helmet: true }, 'hide');
  assert.equal(plan.head.visible, false);
  assert.equal(plan.torso.visible, false);
  assert.equal(plan.helmet.visible, true);
  assert.equal(plan.armor.visible, true);
  assert.equal(plan.head.variant, 'bare');
  assert.equal(plan.torso.variant, 'bare');
});

test('replace mode keeps the part visible and swaps only its variant texture', () => {
  const plan = partPlan({ armor: true, helmet: true }, 'replace');
  assert.equal(plan.head.visible, true);
  assert.equal(plan.torso.visible, true);
  assert.equal(plan.head.variant, 'helmed');
  assert.equal(plan.torso.variant, 'armored');
  assert.equal(plan.helmet.visible, false);
  assert.equal(plan.armor.visible, false);
});

test('a gear slot only covers its own part, and arms and legs are never hidden', () => {
  const helmetOnly = partPlan({ armor: false, helmet: true }, 'hide');
  assert.equal(helmetOnly.head.visible, false);
  assert.equal(helmetOnly.torso.visible, true);
  assert.equal(helmetOnly.armor.visible, false);
  const armorOnly = partPlan({ armor: true, helmet: false }, 'hide');
  assert.equal(armorOnly.torso.visible, false);
  assert.equal(armorOnly.head.visible, true);
  assert.equal(armorOnly.helmet.visible, false);
  for (const mode of coverModes) for (const gear of [{ armor: false, helmet: false }, { armor: true, helmet: true }]) {
    const plan = partPlan(gear, mode);
    assert.equal(plan.arm.visible, true);
    assert.equal(plan.legs.visible, true);
  }
});

test('with nothing equipped both modes show the bare body and no gear layer', () => {
  for (const mode of coverModes) {
    const plan = partPlan({ armor: false, helmet: false }, mode);
    assert.deepEqual(plan.head, { visible: true, variant: 'bare' });
    assert.deepEqual(plan.torso, { visible: true, variant: 'bare' });
    assert.equal(plan.armor.visible, false);
    assert.equal(plan.helmet.visible, false);
  }
});

test('the covering note names the parts each mode affects', () => {
  assert.match(coverModeNote('hide', { armor: true, helmet: true }), /머리 파츠 숨김/);
  assert.match(coverModeNote('hide', { armor: true, helmet: true }), /몸통 파츠 숨김/);
  assert.match(coverModeNote('replace', { armor: true, helmet: true }), /머리→투구/);
  assert.match(coverModeNote('replace', { armor: false, helmet: false }), /교체할 장비 없음/);
});
