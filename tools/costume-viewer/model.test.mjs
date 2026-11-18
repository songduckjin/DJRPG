import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../tests/ts-loader.mjs';
const { pose, estimateCanvas, productionFrames } = await import('./model.ts');

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
