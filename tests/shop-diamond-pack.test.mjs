import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';
const { renderShop, DIAMOND_PACK_ART } = await import('../src/ui/modals/shopModal.ts');

const ROOT = new URL('../', import.meta.url);
const ASSET = 'public/assets/shop/diamond_pack_v1.webp';

function node(tag = 'div') {
  const n = { tag, children: [], dataset: {}, attrs: {}, className: '', textContent: '', src: '', alt: '', width: 0, height: 0, disabled: false,
    append(...children) { this.children.push(...children); },
    setAttribute(k, v) { this.attrs[k] = v; },
    classList: { add(c) { n.className += ` ${c}`; }, toggle(c, on) { if (on) n.className += ` ${c}`; } } };
  return n;
}
function findAll(n, test, out = []) { if (!n || typeof n !== 'object') return out; if (test(n)) out.push(n); for (const child of n.children ?? []) findAll(child, test, out); return out; }
function find(n, test) { return findAll(n, test)[0]; }

/** 상점 카탈로그 — 서버 `shop.mjs` 의 `catalog` 응답과 같은 모양. */
const catalog = () => ({
  wallet: { diamonds: 1250, maxSlots: 3 },
  diamondPacks: [100, 300, 500, 1000, 2000, 5000, 10000, 20000].map(count => ({ id: `diamond_${count}`, diamonds: count, price: count * 11 })),
  packages: [
    { id: 'slot', name: '캐릭터 슬롯 추가', diamonds: 500, available: true },
    { id: 'all_idle_30d', name: '전 슬롯 방치 30일', diamonds: 1500, available: true, expiresAt: 0 },
    { id: 'ad_free', name: '광고 제거', diamonds: 1000, available: false }
  ],
  paymentReady: true
});

function render(tab) {
  const previous = globalThis.document;
  globalThis.document = { createElement: node };
  try {
    const dialog = node(), ui = { shopCatalog: catalog(), shopTab: tab, renderModal() { this.renders = (this.renders || 0) + 1; } };
    renderShop(ui, dialog);
    return { dialog, ui };
  } finally { globalThis.document = previous; }
}

test('다이아 탭 맨 위에 확정 1안 패키지 그림이 한 번만 들어가고 상품 카드 8칸은 그대로 남는다', () => {
  const { dialog } = render('diamonds');
  const heroes = findAll(dialog, n => String(n.className).includes('shop-hero') && n.tag === 'figure');
  assert.equal(heroes.length, 1, '대표 그림은 한 번만 — 같은 그림을 8칸 카드에 반복하지 않는다');
  const hero = heroes[0];
  const art = find(hero, n => n.tag === 'img');
  assert.ok(art, '대표 그림 img 가 있다');
  assert.equal(art.src, '/assets/shop/diamond_pack_v1.webp');
  assert.equal(art.src, DIAMOND_PACK_ART);
  assert.ok(art.alt && /다이아/.test(art.alt), 'alt 에 무엇을 그린 그림인지 적는다');
  assert.equal(art.width, 512); assert.equal(art.height, 512);
  assert.ok(find(hero, n => n.tag === 'figcaption' && /다이아 패키지/.test(find(n, c => c.tag === 'strong')?.textContent ?? '')), '제목이 붙는다');
  // 순서: 잔액 → 탭 → 대표 그림 → 상품 카드 그리드.
  const order = dialog.children.map(child => String(child.className).split(' ')[0]);
  assert.deepEqual(order.slice(0, 4), ['shop-balance', 'shop-tabs', 'shop-hero', 'shop-grid']);
  const cards = findAll(dialog, n => n.tag === 'article' && String(n.className).includes('shop-card'));
  assert.equal(cards.length, 8);
});

test('패키지 탭에는 다이아 그림을 붙이지 않는다', () => {
  const { dialog } = render('packages');
  assert.equal(findAll(dialog, n => String(n.className).includes('shop-hero')).length, 0);
  assert.equal(findAll(dialog, n => n.tag === 'article').length, 3);
});

test('상점 그림 에셋은 512 정사각 WebP 이고 모바일에 무겁지 않다(≤120KB)', () => {
  const path = new URL(ASSET, ROOT);
  const stat = statSync(path);
  assert.ok(stat.size > 0 && stat.size <= 120 * 1024, `${ASSET} 크기 ${stat.size}B`);
  const head = readFileSync(path).subarray(0, 12);
  assert.equal(head.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(head.subarray(8, 12).toString('ascii'), 'WEBP');
  const css = modalStyles();
  assert.match(css, /\.shop-hero\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.shop-hero-art\s*\{[^}]*object-fit:\s*cover/);
});
