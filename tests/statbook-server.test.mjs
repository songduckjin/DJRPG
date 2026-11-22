import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import './ts-loader.mjs';
import { createClient } from '@libsql/client';
import { schema, transaction, reconcileItems } from '../server/database.mjs';
import { clampSaveProgress, itemWithinBounds, STAT_BOOK_LIMIT } from '../server/save-guard.mjs';
import * as serverBooks from '../server/stat-books.mjs';

import { sellable as marketSellable, bundleKey as marketBundleKey } from '../server/market.mjs';

/**
 * 영구 스탯북 — 서버 쪽 계약 (파트 B).
 * · `server/stat-books.mjs`가 클라이언트 정의와 같은지
 * · 저장 검증(`itemValid`)이 스탯북은 받고 **옛 스킬북은 거절**하는지
 * · `save-guard`가 사용 권수를 30권·가방 보유량 안으로 클램프하는지
 * · 거래소 등록 대상인지
 */
const clientBooks = await import('../src/game/statBooks.ts');
let db, directory;
const save = (over = {}) => ({
  version: 1, name: '전사', gender: 'male', job: 'warrior', level: 10, exp: 0, gold: 1000, floor: 5, maxFloor: 5,
  floorKills: 0, kills: 100, bossKills: 3, playSeconds: 600, health: 300, equipment: {}, equipmentCollection: [],
  bag: [], tutorial: 3, stones: 10, skillPoints: 0, lastActiveAt: Date.now(), learned: [], passives: [],
  quickSlots: [null, null, null], skillLevels: {}, dungeonFloor: 0, dungeonClearAt: 0, bossRetryFloor: 0,
  statBooks: { attack: 0, defense: 0, health: 0 }, ...over
});
const book = (kind = 'attack', id = randomUUID()) => ({ id, name: { attack: '공격의 서', defense: '방어의 서', health: '체력의 서' }[kind], slot: 'statbook', kind: 'statbook', book: kind, rarity: 'unique', stats: {} });
const error = code => e => e.code === code;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'djrpg-statbook-'));
  db = createClient({ url: `file:${join(directory, 'statbook.db')}` });
  await schema(db);
});
after(async () => { await db.close(); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });

test('서버 목록이 클라이언트 정의와 같다 — 셋이 늘어나거나 수치가 갈라지면 여기서 먼저 깨진다', () => {
  assert.deepEqual(serverBooks.STAT_BOOK_IDS, ['attack', 'defense', 'health']);
  for (const kind of serverBooks.STAT_BOOK_IDS) {
    const mine = clientBooks.STAT_BOOKS[kind], theirs = serverBooks.STAT_BOOKS[kind];
    assert.equal(theirs.name, mine.name, `${kind} 이름`);
    assert.equal(theirs.stat, mine.stat, `${kind} 능력치`);
    assert.equal(theirs.perBook, mine.perBook, `${kind} 권당 상승량`);
    assert.equal(theirs.max, mine.max, `${kind} 상한`);
  }
  assert.equal(STAT_BOOK_LIMIT, clientBooks.STAT_BOOK_LIMIT);
  // 가방 칸 규칙도 클라이언트와 같다 — 모든 아이템이 1칸(파트 B).
  for (const item of [book(), { id: 'p', kind: 'pouch', slot: 'pouch' }, { id: 'w', slot: 'weapon' }]) {
    assert.equal(serverBooks.countedInBag(item, 'warrior'), true, `${item.slot} 1칸`);
  }
});

test('저장 검증 — 스탯북은 받고, 폐지된 스킬북은 거절한다', async () => {
  const stat = book('attack');
  await assert.doesNotReject(transaction(db, async tx => reconcileItems(tx, 'sb-ok', save(), save({ bag: [stat] }))));
  const skillbook = { id: randomUUID(), name: '[스킬북] 회오리 베기', slot: 'skillbook', kind: 'skillbook', skillId: 'spin', rarity: 'rare', stats: {} };
  await assert.rejects(transaction(db, async tx => reconcileItems(tx, 'sb-no', save(), save({ bag: [skillbook] }))), error('INVALID_ITEM'));
  // 종류(`book`)가 없거나 모르는 값인 스탯북도 거절한다.
  const broken = { ...book('attack'), book: 'mana' };
  await assert.rejects(transaction(db, async tx => reconcileItems(tx, 'sb-broken', save(), save({ bag: [broken] }))), error('INVALID_ITEM'));
  // 능력치 상한 검사도 스탯북은 통과한다(능력치가 없다).
  assert.equal(itemWithinBounds(stat, 1), true);
});

test('저장 검증 — 사용 권수는 가방에서 쓴 책 수까지만 늘고, 30권을 넘지 않는다', () => {
  const before = save({ bag: [book('attack', 'a1'), book('attack', 'a2')] });
  const used2 = save({ statBooks: { attack: 2, defense: 0, health: 0 } });
  assert.deepEqual(clampSaveProgress(before, used2).clamped, [], '책 2권을 쓴 것은 그대로 통과');
  assert.deepEqual(used2.statBooks, { attack: 2, defense: 0, health: 0 });
  // 가방에 책이 없는데 5를 주장하면 0으로 막는다.
  const forged = save({ statBooks: { attack: 5, defense: 0, health: 0 } });
  assert.deepEqual(clampSaveProgress(save(), forged).clamped, ['statBooks.attack']);
  assert.equal(forged.statBooks.attack, 0, '가방에 책이 없으면 늘릴 수 없다');
  // 책 2권뿐인데 5를 주장하면 보유한 2권까지만 인정한다.
  const greedy = save({ statBooks: { attack: 5, defense: 0, health: 0 } });
  clampSaveProgress(before, greedy);
  assert.equal(greedy.statBooks.attack, 2, '가진 책 수를 넘을 수 없다');
  // 이미 쓴 권수는 줄지 않는다(클라이언트가 값을 빼고 보내도 잃지 않는다).
  const older = save({ statBooks: { attack: 7, defense: 3, health: 0 } });
  const stripped = save({ statBooks: { attack: 0, defense: 0, health: 0 } });
  clampSaveProgress(older, stripped);
  assert.deepEqual(stripped.statBooks, { attack: 7, defense: 3, health: 0 });
  // 30권 상한 — 40권을 한 번에 쓰려 해도 30에서 멈춘다.
  const many = save({ bag: Array.from({ length: 40 }, (_, index) => book('health', `h${index}`)) });
  const over = save({ statBooks: { attack: 0, defense: 0, health: 40 } });
  clampSaveProgress(many, over);
  assert.equal(over.statBooks.health, 30);
});

test('거래소 — 영구 스탯북은 등록·묶음 대상이고, 폐지된 스킬북은 아니다', () => {
  assert.equal(marketSellable(book('attack')), true);
  assert.equal(marketSellable({ id: 'x', slot: 'skillbook', kind: 'skillbook' }), false, '스킬북은 등록 대상이 아니다');
  assert.equal(marketSellable({ id: 'p', slot: 'pouch', kind: 'pouch' }), false, '보물 주머니는 소모품');
  // 같은 종류만 한 묶음 — 다른 종류를 섞으면 묶음 키가 다르다.
  assert.equal(marketBundleKey(book('attack', 'a')), marketBundleKey(book('attack', 'b')));
  assert.notEqual(marketBundleKey(book('attack', 'a')), marketBundleKey(book('health', 'c')));
});
