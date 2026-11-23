// 백로그 3번 — 유니크·전설 아이템 획득 시 상위 노출(2026-11-23).
//
// 승인 시안(② `downloads/djrpg_mock_02_rarity_spotlight.png`)의 네 자리를 확인한다:
//  ① 보물 주머니 개봉 결과 — 상위 등급 카드에 등급 빛 + `[전설] [NEW]` 꼬리표
//  ② 방치·던전 보상 — 상위 등급을 목록 **위로** 올리고 줄마다 등급 꼬리표·빛(나머지는 원래 순서)
//  ③ 화면 위 획득 띠 — 유니크·전설이면 3.5초, 그 밖은 뜨지 않는다
//  ④ 가방 `NEW` 핀 — 이번에 가방을 연 뒤 처음 보는 아이템에만

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';

const spotlight = await import('../src/game/raritySpotlight.ts');
const { isSpotlightRarity, spotlightRank, spotlightFirst, spotlightTag, spotlightAnnouncementText, SPOTLIGHT_BANNER_MS } = spotlight;
const { pouchBatchPanel } = await import('../src/ui/pouchBatch.ts');
const { dungeonResultRows, dungeonResultItemsMarkup } = await import('../src/ui/dungeonRewardMarkup.ts');
const { renderOffline } = await import('../src/ui/modals/offlineModal.ts');
const { mountRaritySpotlight, emptySpotlightBoard } = await import('../src/ui/raritySpotlightBar.ts');
const { MODALS } = await import('../src/ui/modalRegistry.ts');
const css = modalStyles();
const hud = readFileSync(new URL('../src/styles/hud.css', import.meta.url), 'utf8');
const dungeonCss = readFileSync(new URL('../src/styles/dungeon.css', import.meta.url), 'utf8');
const equipSource = readFileSync(new URL('../src/ui/modals/equipModal.ts', import.meta.url), 'utf8');

const gear = (id, rarity, name = `시험용 ${rarity}`) => ({ id, name, slot: 'weapon', rarity, stats: {}, plus: 0 });
const book = (id, kind = 'attack', rarity = 'rare') => ({ id, name: '스탯북', slot: 'statbook', kind: 'statbook', rarity, stats: {}, book: kind });

// ── 1. 규칙 ────────────────────────────────────────────────────────────────
test('상위 노출 등급은 유니크·전설뿐 — 에픽 이하는 지금처럼 등급 색만', () => {
  assert.deepEqual([...spotlight.SPOTLIGHT_RARITIES], ['legendary', 'unique']);
  assert.equal(isSpotlightRarity('legendary'), true);
  assert.equal(isSpotlightRarity('unique'), true);
  for (const rarity of ['epic', 'rare', 'magic', 'common', undefined]) assert.equal(isSpotlightRarity(rarity), false, `${rarity}`);
  assert.equal(spotlightRank('legendary'), 0); assert.equal(spotlightRank('unique'), 1);
  assert.equal(spotlightRank('epic'), 2); assert.equal(spotlightRank(undefined), 2);
  assert.equal(SPOTLIGHT_BANNER_MS, 3500, '띠는 3.5초');
});

test('상위 등급을 위로 올리되 같은 등급끼리는 원래 순서를 지킨다', () => {
  const rows = [gear('a', 'common'), gear('b', 'legendary'), gear('c', 'rare'), gear('d', 'unique'), gear('e', 'legendary')];
  assert.deepEqual(spotlightFirst(rows, row => row.rarity).map(row => row.id), ['b', 'e', 'd', 'a', 'c']);
  assert.deepEqual(spotlightFirst([], row => row.rarity), []);
  assert.deepEqual(spotlightFirst(rows.slice(0, 2), row => row.rarity).map(row => row.id), ['b', 'a'], '상위가 없으면 순서 그대로');
});

test('꼬리표·문장 — `[전설]`·`[유니크]`로 읽히고 에픽 이하는 빈 문자열', () => {
  assert.equal(spotlightTag('legendary'), '[전설]');
  assert.equal(spotlightTag('unique'), '[유니크]');
  assert.equal(spotlightTag('epic'), '');
  assert.equal(spotlightAnnouncementText(gear('x', 'legendary', '영원의 붉은 갑주')), '✦ 전설 · 영원의 붉은 갑주 획득!');
  assert.equal(spotlightAnnouncementText(gear('y', 'unique', '고대의 흑살자의 대검')), '유니크 · 고대의 흑살자의 대검 획득!');
  assert.equal(spotlightAnnouncementText({ ...gear('z', 'unique', '검'), plus: 3 }), '유니크 · 검 +3 획득!', '강화 표기도 그대로');
});

// ── 2. 보물 주머니 결과 ────────────────────────────────────────────────────
test('주머니 결과 — 상위 등급 줄에만 등급 꼬리표와 빛을 붙인다(CSS 포함)', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const summary = {
      opened: 3, gold: 0, equipmentCount: 3, bookTotal: 0, remaining: 0, blocked: false, legendary: [],
      rarityCounts: { common: 0, magic: 0, rare: 0, epic: 1, unique: 0, legendary: 2 },
      rows: [
        { item: gear('l1', 'legendary', '영원의 붉은 갑주'), name: '영원의 붉은 갑주', rarity: 'legendary', count: 1 },
        { item: gear('l2', 'legendary', '영원의 두손검'), name: '영원의 두손검', rarity: 'legendary', count: 1 },
        { item: gear('e1', 'epic', '비전의 군주 반지'), name: '비전의 군주 반지', rarity: 'epic', count: 1 }
      ]
    };
    const panel = pouchBatchPanel(summary);
    const rows = [];
    walk(panel, node => { if (node.className.includes('pouch-batch-row')) rows.push(node); });
    assert.equal(rows.length, 3);
    assert.equal(rows[0].className.includes('is-spotlight'), true);
    assert.equal(rows[0].dataset.rarity, 'legendary');
    assert.equal(rows[2].className.includes('is-spotlight'), false, '에픽은 그대로');
    const tag = find(rows[0], node => node.className.startsWith('pouch-batch-tag'));
    assert.equal(tag.textContent, '[전설]');
    assert.equal(find(rows[2], node => node.className.startsWith('pouch-batch-tag')), undefined, '에픽에는 꼬리표가 없다');
    // 결과 카드(개봉 한 장)는 `pouchModal.ts`가 그리고, 여기서는 CSS 계약을 본다.
    assert(css.includes('.pouch-result.is-spotlight'), '카드 등급 빛');
    assert(css.includes('.pouch-result-new'), '`NEW` 배지');
    assert(css.includes('.pouch-result-flag'), '꼬리표 자리');
    assert(css.includes('.pouch-batch-row.is-spotlight'), '전설 줄 빛');
  } finally { globalThis.document = previous; }
});

// ── 3. 방치·던전 보상 ──────────────────────────────────────────────────────
test('던전 결과 — 상위 등급이 위로 오고, 스탯북 묶음은 여전히 아래에 남는다', () => {
  const items = [gear('c', 'common', '낡은 단검'), gear('u', 'unique', '고대의 흑살자의 대검'), book('b1'), gear('l', 'legendary', '영원의 두손검'), book('b2', 'defense', 'epic')];
  const rows = dungeonResultRows(items);
  assert.deepEqual(rows.filter(row => row.item.slot !== 'statbook').map(row => row.item.id), ['l', 'u', 'c']);
  assert.equal(rows[rows.length - 1].item.slot, 'statbook', '스탯북은 아래 묶음');
  assert.equal(rows.filter(row => row.item.slot === 'statbook').length, 2, '스탯북 두 종류는 그대로');
  const markup = dungeonResultItemsMarkup(items);
  assert(markup.indexOf('영원의 두손검') < markup.indexOf('낡은 단검'), '전설이 일반보다 앞');
  assert(markup.includes('is-spotlight'), '상위 등급 줄에 빛 클래스');
  assert(markup.includes('dungeon-result-spot">[전설]</b>'), '전설 꼬리표');
  assert(markup.includes('dungeon-result-spot">[유니크]</b>'), '유니크 꼬리표');
  assert(dungeonCss.includes('.dungeon-result-items li.is-spotlight.rarity-legendary'), '던전 결과창 CSS');
});

test('방치 정산 — 상위 등급이 목록 머리로 오고 나머지는 떨어진 순서 그대로', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const dialog = element('div');
    const reward = {
      seconds: 3600, kills: 120, exp: 300, gold: 500, levels: 0, startFloor: 3, endFloor: 3,
      bossKills: 0, deaths: 0, missedDrops: 0,
      items: [gear('a', 'common', '낡은 단검'), gear('b', 'epic', '비전의 검'), gear('c', 'unique', '고대의 검'), gear('d', 'legendary', '영원의 검')]
    };
    renderOffline(dialog, reward);
    const list = find(dialog, node => node.className === 'offline-items');
    const texts = list.children.map(row => row.textContent);
    assert.equal(texts[0], '[전설] 영원의 검 · 레전드');
    assert.equal(texts[1], '[유니크] 고대의 검 · 유니크');
    assert.equal(texts[2], '낡은 단검 · 일반');
    assert.equal(texts[3], '비전의 검 · 에픽');
    assert.equal(list.children[0].className.includes('is-spotlight'), true);
    assert.equal(list.children[0].dataset.rarity, 'legendary');
    assert.equal(list.children[2].className.includes('is-spotlight'), false, '일반은 빛 없음');
    assert(css.includes('.offline-items li.is-spotlight'), '방치 목록 CSS');
  } finally { globalThis.document = previous; }
});

// ── 4. 화면 위 획득 띠 ─────────────────────────────────────────────────────
test('획득 띠 — 유니크·전설만 3.5초 뜨고, 에픽 이하는 뜨지 않는다', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => element(tag) };
  try {
    const root = element();
    const board = mountRaritySpotlight({ root }, { duration: 3500 });
    const bar = root.children[0];
    assert.equal(bar.className, 'rarity-spotlight');
    assert.equal(bar.hidden, true);
    board.show(gear('e', 'epic'));
    assert.equal(bar.hidden, true, '에픽은 띠를 띄우지 않는다');
    board.show(gear('u', 'unique', '고대의 흑살자의 대검'));
    assert.equal(bar.hidden, false);
    assert.equal(bar.dataset.rarity, 'unique');
    assert.equal(bar.children[0].textContent, '유니크 · 고대의 흑살자의 대검 획득!');
    t.mock.timers.tick(3499);
    assert.equal(bar.hidden, false, '3.5초 전에는 그대로');
    t.mock.timers.tick(1);
    assert.equal(bar.hidden, true, '3.5초 뒤 스스로 닫힌다');
    // 전설은 색이 다르고, 다음 획득이 오면 시간이 다시 찬다.
    board.show(gear('l', 'legendary', '영원의 두손검'));
    t.mock.timers.tick(3000);
    board.show(gear('u2', 'unique', '고대의 투구'));
    t.mock.timers.tick(1000);
    assert.equal(bar.hidden, false, '새 획득이 오면 시간이 새로 찬다');
    board.hide();
    assert.equal(bar.hidden, true);
    // 화면이 없는 자리(테스트·초기화 전)에서는 조용히 넘어간다.
    assert.doesNotThrow(() => emptySpotlightBoard.show(gear('x', 'legendary')));
  } finally { globalThis.document = previous; }
});

test('획득 띠 CSS — 전설은 한 번 더 빛나고 모션 감소를 존중한다(전광판과 겹치지 않게 아래로)', () => {
  assert(hud.includes('.rarity-spotlight {'), '띠 규칙');
  assert(hud.includes('.rarity-spotlight[data-rarity="legendary"]'), '전설은 더 센 빛');
  assert(hud.includes('prefers-reduced-motion: reduce) { .rarity-spotlight'), '모션 감소');
  assert(hud.includes('top: calc(env(safe-area-inset-top, 0px) + 44px)'), '전광판(6px) 아래');
});

// ── 5. 가방 `NEW` 핀 ───────────────────────────────────────────────────────
test('가방 — 창을 열 때 `newItems`를 `bagFresh`로 옮겨 이번에 연 가방에서만 `NEW` 핀을 단다', () => {
  const ui = { newItems: new Set(['fresh-1', 'fresh-2']), bagFresh: new Set(['old']), renderBagBadge() { this.badgeDrawn = true; } };
  MODALS.equipment.prepare(ui);
  assert.deepEqual([...ui.bagFresh], ['fresh-1', 'fresh-2'], '이번에 열 때 보여 줄 목록');
  assert.equal(ui.newItems.size, 0, '배지 숫자는 바로 지운다');
  assert.equal(ui.badgeDrawn, true);
  assert(equipSource.includes('this.bagFresh?.has(item.id)'), '칸은 bagFresh로 NEW를 단다');
  assert(equipSource.includes("'bag-new-badge'"), 'NEW 핀 요소');
  assert(css.includes('.bag-new-badge'), 'NEW 핀 CSS');
});

// ── helpers ────────────────────────────────────────────────────────────────
function element(tag = 'div') {
  const node = {
    tag, children: [], dataset: {}, style: { setProperty() {} }, className: '', textContent: '', innerHTML: '', attrs: {}, hidden: false, disabled: false,
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
    appendChild(child) { this.append(child); return child; },
    replaceChildren(...children) { this.children = []; this.append(...children); },
    setAttribute(key, value) { this.attrs[key] = value; }, getAttribute(key) { return this.attrs[key]; },
    remove() { const parent = this.parent; if (!parent) return; const index = parent.children.indexOf(this); if (index >= 0) parent.children.splice(index, 1); this.parent = undefined; },
    addEventListener() {}, querySelectorAll() { return []; }
  };
  node.classList = {
    add(name) { if (!node.className.split(' ').includes(name)) node.className += ` ${name}`; },
    remove(name) { node.className = node.className.split(' ').filter(token => token !== name).join(' '); },
    toggle(name, on) { if (on) this.add(name); }
  };
  return node;
}
function find(node, test) { if (!node || typeof node !== 'object') return undefined; if (test(node)) return node; for (const child of node.children ?? []) { const hit = find(child, test); if (hit) return hit; } return undefined; }
function walk(node, visit) { if (!node || typeof node !== 'object') return; visit(node); for (const child of node.children ?? []) walk(child, visit); }
