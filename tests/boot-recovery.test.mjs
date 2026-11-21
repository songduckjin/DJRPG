import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../public/boot-recovery.js', import.meta.url), 'utf8');

/** 부팅 화면을 한 번 띄우는 가짜 브라우저 — 리스너·저장소·이동을 기록한다. */
function boot(storage = new Map(), now = 100_000) {
  const listeners = new Map();
  const navigations = [];
  const context = {
    window: { addEventListener: (name, handler) => listeners.set(name, handler) },
    location: {
      href: 'https://djrpg.pages.dev/',
      replace: url => { navigations.push(String(url)); }
    },
    URL,
    sessionStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    },
    Date: { now: () => now },
    setTimeout: () => 1
  };
  runInNewContext(source, context);
  return { listeners, navigations, storage };
}

test('failed dynamic import reloads once through a cache-bypassing URL and leaves a second failure visible', () => {
  const { listeners, navigations } = boot();
  const handler = listeners.get('vite:preloadError');
  assert.equal(typeof handler, 'function');
  let prevented = 0;
  handler({ preventDefault: () => { prevented++; } });
  handler({ preventDefault: () => { prevented++; } });
  assert.equal(navigations.length, 1);
  assert.equal(prevented, 1);
  assert.match(navigations[0], /^https:\/\/djrpg\.pages\.dev\/\?_boot=100000$/);
});

test('a WebGLRenderer chunk failure without the Vite event still reloads once (user report #6335·#6370)', () => {
  const { listeners, navigations } = boot();
  listeners.get('unhandledrejection')({
    reason: new Error('Failed to fetch dynamically imported module: https://djrpg.pages.dev/assets/WebGLRenderer-COSNgxt3.js')
  });
  assert.equal(navigations.length, 1);
  assert.match(navigations[0], /_boot=100000/);
  // 같은 창 안에서 또 실패하면 더 새로고침하지 않는다 — 오류가 화면에 남는다.
  listeners.get('error')({ message: 'Failed to fetch dynamically imported module: https://djrpg.pages.dev/assets/index-2.js' });
  assert.equal(navigations.length, 1);
});

test('module script load errors recover, unrelated errors do not', () => {
  const { listeners, navigations } = boot();
  listeners.get('error')({ message: 'Something else broke' });
  assert.equal(navigations.length, 0);
  listeners.get('error')({ message: 'Importing a module script failed.' });
  assert.equal(navigations.length, 1);
});

test('a retry inside the last 60 seconds is not repeated and the marker expires', () => {
  const storage = new Map([['djrpg.boot-import-retry', '90000']]);
  const { listeners, navigations } = boot(storage);
  listeners.get('vite:preloadError')({ preventDefault() {} });
  assert.equal(navigations.length, 0, '60초 안의 재시도는 막힌다');

  const later = boot(new Map([['djrpg.boot-import-retry', '90000']]), 100_000 + 60_000);
  later.listeners.get('vite:preloadError')({ preventDefault() {} });
  assert.equal(later.navigations.length, 1, '60초가 지나면 다시 한 번 시도한다');
});
