// 장비 강화 단계(작업 201): 10층마다 한 단계씩 열리는 `+1 ~ +7`, 단계당 스탯 8%, 이름 옆 배지, 그리고
// 옛 장비의 **보수적** 역산까지. 이름·스탯·등급은 그대로 두고 `plus`만 더하므로 서버 아이템 소유권
// (`409 ITEM_CONFLICT`)이 흔들리지 않는다는 것을 실제 서버 모듈로도 확인한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import './ts-loader.mjs';
import { modalStyles } from './helpers/modal-styles.mjs';

const items = await import('../src/game/items.ts');
const {
  MAX_PLUS, PLUS_STAT_BONUS, applyPlus, baseItems, estimatePlus, itemDisplayName, maxPlusFor, maxTierBonus,
  migrateItem, plusOf, plusWeights, rarityScales, rollItem, rollPlus, slotProfiles,
} = items;
const { freshSave, parseSave } = await import('../src/game/store.ts');
const { renderItemName } = await import('../src/ui/itemName.ts');
const { itemDetail } = await import('../src/ui/modals/equipModal.ts');
const { openSalvageProtection } = await import('../src/ui/salvageProtection.ts');

/** 재현 가능한 난수(분포 검사용). */
function seeded(seed = 42) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
}

// ── 10층 단위 해금 ───────────────────────────────────────────────────────────
test('a drop gains one 강화 단계 per ten floors, from +0 on floor 1 to +7 on floors 71~80', () => {
  assert.equal(maxPlusFor(1), 0, '1층은 강화 없음');
  assert.equal(maxPlusFor(10), 0, '10층까지는 +0');
  assert.equal(maxPlusFor(11), 1, '11층부터 +1');
  assert.equal(maxPlusFor(20), 1, '20층까지 +1');
  assert.equal(maxPlusFor(21), 2);
  assert.equal(maxPlusFor(51), 5, '51층은 +5까지');
  assert.equal(maxPlusFor(60), 5);
  assert.equal(maxPlusFor(71), 7, '71층은 +7까지');
  assert.equal(maxPlusFor(80), 7);
  assert.equal(maxPlusFor(180), MAX_PLUS, '그 위로는 +7에서 멈춘다');
  // 10층 이하 드롭은 언제나 0단계다(확률을 뽑지 않는다).
  for (let floor = 1; floor <= 10; floor++) assert.equal(rollPlus(floor, true, () => .999), 0);
  // 한 층의 드롭은 그 층의 최고 단계를 절대 넘지 않는다.
  for (let floor = 1; floor <= 120; floor++) for (let i = 0; i < 40; i++) {
    const plus = rollPlus(floor, i % 2 === 0);
    assert(plus >= 0 && plus <= maxPlusFor(floor), `${floor}층 드롭의 +${plus}가 최고 단계를 넘었다`);
    assert(Number.isInteger(plus));
  }
});

// ── 낮은 단계가 흔하고 높은 단계가 드물다 ─────────────────────────────────────
test('low 강화 단계 is common and the top step stays rare, and a boss leans a little higher', () => {
  const normal = plusWeights(5), boss = plusWeights(5, true);
  for (let i = 1; i < normal.length; i++) assert(normal[i] < normal[i - 1], '단계마다 가중치가 줄어든다');
  for (let i = 1; i < boss.length; i++) assert(boss[i] < boss[i - 1], '보스도 낮은 단계가 더 흔하다');
  const share = weights => weights.map(weight => weight / weights.reduce((sum, value) => sum + value, 0));
  const normalShare = share(normal), bossShare = share(boss);
  assert(normalShare[0] > .35 && normalShare[0] < .55, `51층 +0는 약 45% (got ${(normalShare[0] * 100).toFixed(1)}%)`);
  assert(normalShare[5] > .015 && normalShare[5] < .05, `51층 +5는 약 3% (got ${(normalShare[5] * 100).toFixed(1)}%)`);
  assert(bossShare[5] > normalShare[5], '보스는 최고 단계를 더 자주 준다');
  assert(bossShare[0] < normalShare[0], '그만큼 +0의 몫이 줄어든다');
  // 실제 분포도 순서를 지킨다(20,000회).
  const random = seeded(7), counts = Array.from({ length: 6 }, () => 0);
  for (let i = 0; i < 20000; i++) counts[rollPlus(51, false, random)]++;
  for (let i = 1; i < counts.length; i++) assert(counts[i] < counts[i - 1], `+${i - 1}=${counts[i - 1]} > +${i}=${counts[i]}`);
  assert(counts[0] / 20000 > .4, `+0가 절반 가까이 (got ${(counts[0] / 200).toFixed(1)}%)`);
  assert(counts[5] > 0 && counts[5] / 20000 < .05, '최고 단계는 드물다');
  // 10층 이하(최고 0단계)는 가중치가 하나뿐이다.
  assert.deepEqual(plusWeights(0), [1]);
});

// ── +8% 스탯 ────────────────────────────────────────────────────────────────
test('each 강화 단계 adds 8% to the rolled main stats, so +7 is 1.56× the roll', () => {
  assert.equal(PLUS_STAT_BONUS, .08);
  assert.deepEqual(applyPlus({ attack: 100, health: 50 }, 0), { attack: 100, health: 50 }, '0단계는 그대로');
  assert.deepEqual(applyPlus({ attack: 100, health: 50 }, 1), { attack: 108, health: 54 });
  // 밸런스 v2: 치명·공속·쿨감은 층·강화와 무관한 척도라 강화 배율을 곱하지 않는다.
  assert.deepEqual(applyPlus({ attack: 100, health: 50, crit: 25 }, 7), { attack: 156, health: 78, crit: 25 }, '+7은 주 스탯만 1.56배');
  // 굴린 장비에도 실제로 반영된다: 71층 흰 장비의 기본 스탯(scale 36 + 1~3 + 티어 보정)에 1.56배가 곱해진다.
  for (let i = 0; i < 400; i++) {
    const item = rollItem(71, false, false);
    assert.equal(Number.isInteger(item.plus), true);
    if (item.plus === 0) continue;
    const factor = 1 + item.plus * PLUS_STAT_BONUS;
    // 주 스탯(작업 255): 슬롯 배분에서 공격이 방어보다 큰 쪽이다 — 무기·목걸이·장갑·반지는 공격,
    // 투구·갑옷·문장·벨트·신발은 방어. 부위마다 배율이 달라(반지 0.35 ~ 무기 1.18) 하한도 낮춘다.
    const profile = slotProfiles[item.slot];
    const primary = profile.attack >= profile.defense ? 'attack' : 'defense';
    const unscaled = (item.stats[primary] ?? 0) / factor;
    assert(unscaled > 8 && unscaled < 400, `${primary} ${item.stats[primary]}가 +${item.plus}만큼 부풀어 있다`);
  }
  // 깊은 층일수록 강화가 붙은 장비가 흔하고, 얕은 층(10층 이하)에는 아예 없다.
  let deep = 0, shallow = 0;
  for (let i = 0; i < 300; i++) { if (rollItem(71, false, false).plus > 0) deep++; if (rollItem(5, false, false).plus > 0) shallow++; }
  assert(deep > 300 * .4, `71층은 절반 이상이 +1 이상 (got ${deep})`);
  assert.equal(shallow, 0, '10층 이하 드롭에는 강화가 없다');
});

// ── 옛 장비 보수적 역산 ──────────────────────────────────────────────────────
/** `rollItem`과 같은 식으로 옛 드롭의 스탯을 재현한다(무작위 3, 최고 티어 보정, 쯔바이핸드 보정까지). */
function legacyStats(floor, rarity, slot, tier, { random = 3, zweihander = false } = {}) {
  const scale = (1 + Math.floor(floor / 2)) * rarityScales[rarity];
  const primary = ['weapon', 'ring1', 'ring2', 'gloves'].includes(slot) ? 'attack' : 'defense';
  const stats = { [primary]: scale + random + Math.ceil(tier * (slot === 'weapon' ? .6 : .4)) };
  if (zweihander) stats.attack = (stats.attack ?? 0) + 2 + Math.ceil(scale * .25);
  return stats;
}
const legacy = (floor, rarity, slot, tier, options) => ({ id: `legacy-${floor}-${rarity}-${slot}-${tier}`, name: '옛 장비', slot, rarity, stats: legacyStats(floor, rarity, slot, tier, options) });

test('an old piece without a plus is reverse-derived downward, never above what it could have dropped at', () => {
  // 51층 레어 무기(공격 81~83)는 실제 +5지만, 랜덤·티어 오차를 빼면 +4로 읽힌다.
  const rare51 = { id: 'a', name: '황혼의 룬 블레이드', slot: 'weapon', rarity: 'rare', stats: { attack: 82 } };
  assert.equal(estimatePlus(rare51), 4, '헷갈리는 경계에서는 낮은 쪽');
  assert.equal(estimatePlus({ ...rare51, stats: { attack: 81 } }), 4);
  // 얕은 층의 옛 장비는 0단계로 남는다(있지도 않던 강화를 붙이지 않는다).
  assert.equal(estimatePlus({ id: 'b', name: '황혼의 두손검', slot: 'weapon', rarity: 'rare', stats: { attack: 20 } }), 0);
  assert.equal(estimatePlus({ id: 'c', name: '낡은 부츠', slot: 'boots', rarity: 'common', stats: { defense: 5 } }), 0);
  // 스탯이 없거나 스킬북이면 0.
  assert.equal(estimatePlus({ id: 'd', name: 'x', slot: 'boots', rarity: 'epic', stats: {} }), 0);
  // 어떤 층·등급·티어·슬롯 조합에서도 실제 최고 단계를 넘지 않는다(보수적).
  for (let floor = 1; floor <= 120; floor++) for (const rarity of ['common', 'magic', 'rare', 'epic', 'unique', 'legendary']) {
    for (const slot of ['weapon', 'armor', 'ring1', 'boots']) {
      const topTier = (slot === 'weapon' ? 10 : baseItems[slot].length) - 1;
      for (const tier of [...new Set([0, Math.floor(topTier / 2), topTier])]) {
        const item = legacy(floor, rarity, slot, tier);
        const estimated = estimatePlus(item);
        assert(estimated <= maxPlusFor(floor), `${floor}층 ${rarity} ${slot} t${tier}: 추정 +${estimated} > 실제 최고 +${maxPlusFor(floor)}`);
        assert(estimated >= 0 && estimated <= MAX_PLUS);
      }
    }
  }
  // 쯔바이핸드의 공격 보정도 빼고 본다(보정이 없었다면 더 높게 읽혔을 값).
  const zwei = { id: 'z', name: '영원의 쯔바이핸더', slot: 'weapon', rarity: 'common', stats: legacyStats(51, 'common', 'weapon', 0, { random: 1, zweihander: true }) };
  assert(estimatePlus(zwei) <= maxPlusFor(51));
  // 반지는 공격을 본다.
  assert(estimatePlus({ id: 'r', name: '군주의 반지', slot: 'ring2', rarity: 'rare', stats: { attack: 82 } }) === 4);
});

test('loading an old save fills plus in, and a freshly rolled 0 keeps it 0 on the next load', () => {
  const deep = { id: 'deep', name: '황혼의 룬 블레이드', slot: 'weapon', rarity: 'rare', stats: { attack: 82 } };
  const fresh = rollItem(51, false, false);
  const zero = { ...rollItem(71, false, false), plus: 0, stats: { attack: 3 } };
  const migrated = migrateItem(deep);
  assert.equal(migrated.plus, 4, '옛 장비는 역산한 단계를 얻는다');
  assert.equal(migrated.name, deep.name, '이름은 그대로다');
  assert.deepEqual(migrated.stats, deep.stats, '스탯도 그대로다(서버 동일성 유지)');
  assert.equal(migrateItem(fresh).plus, fresh.plus, '이미 적힌 단계는 그대로 읽는다');
  assert.equal(migrateItem(zero).plus, 0, '0단계를 적어 둔 장비는 다시 역산하지 않는다');
  assert.equal(migrateItem({ ...deep, plus: 99 }).plus, MAX_PLUS, '범위를 넘는 값은 +7로 다듬는다');
  assert.equal(migrateItem({ ...deep, plus: -3 }).plus, 0);
  // 세이브 전체를 읽어도 강화 단계가 붙고, 이름·스탯은 변하지 않는다.
  const save = freshSave();
  save.floor = 51;
  save.bag = [deep, { id: 'book', name: '[스킬북] 회오리 베기', slot: 'skillbook', kind: 'skillbook', skillId: 'spin', rarity: 'rare', stats: {} }];
  const parsed = parseSave(save);
  assert.equal(parsed.bag[0].plus, 4);
  assert.equal(parsed.bag[0].name, deep.name);
  assert.equal(plusOf(parsed.bag[1]), 0, '스킬북에는 단계가 없다');
  assert.equal(itemDisplayName(parsed.bag[0]), `${deep.name} +4`, '읽는 이름에는 단계가 붙는다');
  assert.equal(itemDisplayName(parsed.bag[1]), '[스킬북] 회오리 베기');
});

// ── UI: 이름 옆 다른 색 `+N` ────────────────────────────────────────────────
function node(tag = 'div') {
  return { tag, children: [], className: '', textContent: '', attrs: {}, dataset: {}, style: { setProperty() {} },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener() {}, remove() {},
    classList: { add() {}, toggle() {} } };
}
function withDocument(work) {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => node(tag), createTextNode: text => ({ textContent: text, children: [] }), body: node('body') };
  try { return work(); } finally { globalThis.document = previous; }
}
const findByClass = (root, name) => {
  if (root?.className?.split(' ').includes(name)) return root;
  for (const child of root?.children ?? []) { const found = findByClass(child, name); if (found) return found; }
  return undefined;
};
const allText = root => [root.textContent, ...(root.children ?? []).map(allText)].filter(Boolean).join(' ');
const css = modalStyles();

test('a piece with a 강화 단계 shows +N in its own colour beside the name, and +0 shows nothing', () => {
  const plusItem = { id: 'p7', name: '영원의 룬 블레이드', slot: 'weapon', rarity: 'rare', stats: { attack: 120 }, plus: 7 };
  const plainItem = { id: 'p0', name: '영원의 룬 블레이드', slot: 'weapon', rarity: 'rare', stats: { attack: 120 }, plus: 0 };
  withDocument(() => {
    const badgeHost = renderItemName(node('b'), plusItem);
    const badge = findByClass(badgeHost, 'item-plus');
    assert(badge, '이름 옆에 배지가 붙는다');
    assert.equal(badge.textContent, '+7');
    assert.equal(badgeHost.textContent, plusItem.name, '이름 글자는 그대로');
    assert.equal(findByClass(renderItemName(node('b'), plainItem), 'item-plus'), undefined, '0단계는 표기하지 않는다');
    assert.equal(plusItem.name, '영원의 룬 블레이드', '이름 문자열 자체는 바뀌지 않는다(409 방지)');
    // 가방 상세(장비창) 제목과 강화된 장비 설명에도 같은 배지가 들어간다.
    const ui = { world: { save: freshSave(), onChange() {} }, message() {} };
    const detail = itemDetail.call(ui, ui.world.save, plusItem);
    assert(findByClass(detail, 'item-plus'), '장비 상세 제목에 배지');
    assert.equal(findByClass(detail, 'item-plus').textContent, '+7');
    // 분해 보호 팝업: 보호할 장비 이름 옆, 장착 중인 장비 이름 옆.
    ui.world.save.equipment.weapon = plainItem;
    const overlay = openSalvageProtection(ui, [{ item: plusItem, slot: 'weapon', equipped: plainItem, gain: 10 }], { exclude() {}, confirm() {}, cancel() {} });
    const badgeInPopup = findByClass(overlay, 'item-plus');
    assert(badgeInPopup, '보호 팝업에도 배지');
    assert(allText(overlay).includes(plainItem.name), '장착 중 장비도 이름으로 보인다');
  });
  // 배지 색은 등급 색과 다른 한 가지(밝은 에메랄드/시안)다.
  const rule = css.match(/\.item-plus \{([^}]*)\}/)?.[1] ?? '';
  assert.match(rule, /color: #43f6c5/, '배지 색이 따로 있다');
  for (const rarityColor of ['#9ca3af', '#60a5fa', '#facc15', '#c084fc', '#fb923c', '#f87171']) {
    assert(!rule.includes(rarityColor), `등급 색 ${rarityColor}를 쓰지 않는다`);
  }
  assert.match(rule, /font-weight: 800/);
});

// ── 서버: 409 ITEM_CONFLICT 무발생 ──────────────────────────────────────────
const serverModule = fileURLToPath(new URL('../server/database.mjs', import.meta.url));
test('an old save that gains plus still saves without 409 ITEM_CONFLICT, while stat forgery still fails', async t => {
  if (!existsSync(serverModule)) { t.skip('server/** 가 sparse 체크아웃 밖이라 건너뛴다(전체 체크아웃·CI에서 실행)'); return; }
  const { createClient } = await import('@libsql/client');
  const { schema, account, transaction, reconcileItems } = await import('../server/database.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-item-plus-'));
  const url = `file:${join(directory, 'item-plus.db')}`;
  process.env.TURSO_DATABASE_URL = url; process.env.TURSO_AUTH_TOKEN = 'local-item-plus-test';
  const db = createClient({ url });
  const legacySave = freshSave();
  legacySave.floor = 51;
  legacySave.bag = [
    { id: 'legacy-blade', name: '황혼의 룬 블레이드', slot: 'weapon', rarity: 'rare', stats: { attack: 82 } },
    { id: 'legacy-boots', name: '낡은 부츠', slot: 'boots', rarity: 'common', stats: { defense: 12 } }
  ];
  legacySave.equipment = { weapon: { id: 'legacy-worn', name: '서리의 두손검', slot: 'weapon', rarity: 'magic', stats: { attack: 18 } } };
  try {
    await schema(db);
    await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: ['hero', 'test-hash', JSON.stringify(legacySave), new Date().toISOString()] });
    await transaction(db, async tx => { const row = await account(tx, 'hero'); await reconcileItems(tx, 'hero', row.save, row.save); });
    const before = await transaction(db, async tx => (await account(tx, 'hero')).save);
    const client = parseSave(before, 'hero');
    assert.equal(client.bag[0].plus, 4, '옛 장비가 로드에서 단계를 얻었다');
    // 이름·스탯은 그대로, plus만 새로 붙은 세이브가 그대로 통과한다.
    await transaction(db, async tx => { const row = await account(tx, 'hero'); await reconcileItems(tx, 'hero', row.save, client); });
    const stored = (await db.execute({ sql: 'SELECT item_json FROM djrpg_item_owners WHERE item_id=?', args: ['legacy-blade'] })).rows[0];
    assert.equal(JSON.parse(stored.item_json).name, '황혼의 룬 블레이드', '서버 사본의 이름·스탯은 그대로(plus는 동일성 밖)');
    assert.equal(JSON.parse(stored.item_json).plus, undefined, 'plus는 소유권 기록에 끼어들지 않는다');
    // plus 값만 다른 클라이언트도 통과한다(0으로 되돌려 보내도 409가 아니다).
    const zeroed = structuredClone(client);
    zeroed.bag[0].plus = 0; zeroed.bag[1].plus = MAX_PLUS;
    await transaction(db, async tx => { const row = await account(tx, 'hero'); await reconcileItems(tx, 'hero', row.save, zeroed); });
    // 능력치를 손댄 세이브는 여전히 ITEM_CONFLICT로 막힌다.
    const forged = structuredClone(client);
    forged.bag[0].stats.attack = 999;
    await assert.rejects(transaction(db, async tx => { const row = await account(tx, 'hero'); await reconcileItems(tx, 'hero', row.save, forged); }),
      error => error.code === 'ITEM_CONFLICT' && error.status === 409, '스탯 변조는 막힌다');
  } finally {
    await db.close(); delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
