import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { createBootProgress } = await import('../src/game/bootProgress.ts');
const { renderAssetPaths } = await import('../src/game/render.ts');

test('boot asset total uses unique texture URLs', () => {
  const expected = new Set(renderAssetPaths);
  assert(expected.size > 60);
  const progress = createBootProgress(renderAssetPaths);
  assert.equal(progress.total, expected.size);
  assert.equal(progress.loaded, 0);
  assert.equal(progress.ratio(), 0);
});

test('progress reports each completed asset once and reaches exactly 100 percent', () => {
  const reports = [];
  const progress = createBootProgress(['a.png', 'b.png', 'a.png'], (done, total) => reports.push([done, total]));
  progress.report();
  assert.equal(progress.tick('a.png'), 1);
  assert.equal(progress.tick('a.png'), 1);
  assert.equal(progress.tick('missing.png'), 1);
  assert.equal(progress.ratio(), .5);
  assert.equal(progress.tick('b.png'), 2);
  assert.equal(progress.tick('b.png'), 2);
  assert.equal(progress.ratio(), 1);
  assert.deepEqual(reports, [[0, 2], [1, 2], [2, 2]]);
});
