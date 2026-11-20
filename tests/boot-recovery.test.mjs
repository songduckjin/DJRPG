import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../public/boot-recovery.js', import.meta.url), 'utf8');

test('failed dynamic import reloads once and leaves a second failure visible', () => {
  const listeners = new Map();
  const values = new Map();
  let reloads = 0;
  const context = {
    window: { addEventListener: (name, handler) => listeners.set(name, handler), location: { reload: () => { reloads++; } } },
    sessionStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
    Date: { now: () => 100_000 },
    setTimeout: () => 1
  };
  runInNewContext(source, context);
  const handler = listeners.get('vite:preloadError');
  assert.equal(typeof handler, 'function');
  let prevented = 0;
  handler({ preventDefault: () => { prevented++; } });
  handler({ preventDefault: () => { prevented++; } });
  assert.equal(reloads, 1);
  assert.equal(prevented, 1);
});
