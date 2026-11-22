import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { schema } from '../server/database.mjs';
import { advanceJourney, APOLOGY_MAIL_ID, UPDATE_NOTICE_ID, UPDATE_NOTICE_2_ID } from '../server/journey-state.mjs';
import { HISTORICAL_NOTICE_IDS, RESET_DIAMONDS, RESET_MAIL_ID, RESET_POUCHES, planReset, resetServer, seededJourneyState } from '../scripts/reset-server-test.mjs';

/**
 * 테스트 서버 초기화 & 보상 우편 스크립트 (파트 B).
 *
 * 계정(아이디·비밀번호)만 남기고 캐릭터·아이템(가방·창고·거래소)·스테이지를 전부 비운 뒤,
 * 계정마다 다이아 5,000 + 무작위 보물 주머니 30개 우편을 한 통 넣는다. 로컬 libSQL로 리허설한다.
 */
let db, directory;
const save = (over = {}) => ({
  version: 1, name: '전사', gender: 'male', job: 'warrior', auto: true, autoClimb: true, level: 17, exp: 400, gold: 123456,
  floor: 12, maxFloor: 12, floorKills: 30, kills: 9000, bossKills: 11, playSeconds: 90000, health: 900,
  equipment: {}, equipmentCollection: [], bag: [], tutorial: 3, stones: 77, skillPoints: 4,
  lastActiveAt: Date.now(), learned: [], passives: [], quickSlots: [null, null, null], skillLevels: {},
  dungeonFloor: 7, dungeonClearAt: 1700000000000, bossRetryFloor: 12,
  statBooks: { attack: 9, defense: 4, health: 2 }, ...over
});
const charSave = (over = {}) => { const value = save(over); delete value.gold; return value; };
const item = id => ({ id, name: '강철 쯔바이핸드', slot: 'weapon', rarity: 'rare', stats: { attack: 25 } });

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'djrpg-reset-'));
  db = createClient({ url: `file:${join(directory, 'reset.db')}` });
  await schema(db);
  const at = new Date().toISOString();
  for (const [id, hash, name] of [['hero', 'hash-hero', '모험가1'], ['second', 'hash-second', '모험가2'], ['guest1', 'guest', '게스트']]) {
    await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: [id, hash, JSON.stringify(save({ name })), at] });
    await db.execute({ sql: 'INSERT INTO djrpg_characters (account_id,slot,save_json,updated_at) VALUES (?,?,?,?)', args: [id, 1, JSON.stringify(charSave({ name })), at] });
    await db.execute({ sql: 'INSERT INTO djrpg_account_profiles (account_id,shared_gold,active_slot) VALUES (?,?,?)', args: [id, 123456, 1] });
    await db.execute({ sql: 'INSERT INTO djrpg_shop_wallet (account_id,diamonds,max_slots,customer_key) VALUES (?,?,?,?)', args: [id, 320, 5, `ck-${id}`] });
    await db.execute({ sql: 'INSERT INTO djrpg_journey (account_id,state_json) VALUES (?,?)', args: [id, JSON.stringify({ achievements: ['level-5'], notices: ['old-notice'], mail: [{ id: 'old-mail', title: '옛 우편', claimedAt: 1, pouches: 5 }] })] });
    // 아이템·창고·거래소·던전 기록
    const bagItem = item(`bag-${id}`), stored = item(`store-${id}`);
    await db.execute({ sql: 'INSERT INTO djrpg_item_owners VALUES (?,?,?,?)', args: [bagItem.id, id, 'inventory', JSON.stringify(bagItem)] });
    await db.execute({ sql: 'INSERT INTO djrpg_warehouse (account_id,item_id,item_json) VALUES (?,?,?)', args: [id, stored.id, JSON.stringify(stored)] });
    await db.execute({ sql: 'INSERT INTO djrpg_market (id,seller,seller_name,item_json,name,slot,rarity,price,state,created_at,expires_at,quantity) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', args: [`m-${id}`, id, '모험가', JSON.stringify(stored), stored.name, 'weapon', 'rare', 1000, 'active', 1, Date.now() + 1e6, 1] });
    await db.execute({ sql: 'INSERT INTO djrpg_dungeon_records (account_id,name,cleared_floor,cleared_at,updated_at) VALUES (?,?,?,?,?)', args: [id, '모험가', 7, 1, 1] });
  }
});
after(async () => { await db.close(); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });

async function journeyOf(id) {
  const row = (await db.execute({ sql: 'SELECT state_json FROM djrpg_journey WHERE account_id=?', args: [id] })).rows[0];
  return row ? JSON.parse(row.state_json) : undefined;
}

test('초기화 계획은 무엇을 지우고 누구에게 보상하는지 세어 보여 준다 — 쓰기는 없다', async () => {
  const plan = await planReset(db);
  assert.equal(plan.accounts, 3);
  assert.equal(plan.guestAccounts, 1);
  assert.equal(plan.rewardAccounts, 2, '게스트를 뺀 두 계정이 보상 대상');
  assert.equal(plan.tables.djrpg_characters, 3);
  assert.equal(plan.tables.djrpg_market, 3);
  assert.equal(plan.tables.djrpg_warehouse, 3);
  assert.equal(plan.tables.djrpg_dungeon_records, 3);
  const dry = await resetServer(db, { apply: false });
  assert.equal(dry.applied, false);
  assert.equal((await planReset(db)).tables.djrpg_characters, 3, 'dry-run은 아무것도 지우지 않는다');
});

test('계정만 남기고 캐릭터·아이템(가방·창고·거래소)·스테이지를 비운 뒤 보상 우편을 한 통 넣는다', async () => {
  const result = await resetServer(db, { apply: true });
  assert.equal(result.applied, true);
  // ① 계정은 그대로다 — 아이디·비밀번호·세션.
  const accounts = (await db.execute({ sql: 'SELECT id, password_hash FROM djrpg_accounts ORDER BY id', args: [] })).rows;
  assert.deepEqual(accounts.map(row => [row.id, row.password_hash]), [['guest1', 'guest'], ['hero', 'hash-hero'], ['second', 'hash-second']]);
  // ② 캐릭터·아이템·스테이지 기록은 전부 빈다.
  const after = await planReset(db);
  for (const table of ['djrpg_characters', 'djrpg_item_owners', 'djrpg_warehouse', 'djrpg_market', 'djrpg_dungeon_records']) {
    assert.equal(after.tables[table] ?? 0, 0, `${table} 이 비어 있다`);
  }
  // ③ 계정 세이브는 시즌 초기화 모양(직업·성별을 다시 고르는 상태)이다.
  for (const id of ['hero', 'second']) {
    const row = (await db.execute({ sql: 'SELECT save_json FROM djrpg_accounts WHERE id=?', args: [id] })).rows[0];
    const value = JSON.parse(row.save_json);
    assert.equal(value.needsSetup, true, `${id}: 직업·성별 재선택`);
    assert.equal(value.level, 1);
    assert.equal(value.floor, 1);
    assert.equal(value.maxFloor, 1);
    assert.equal(value.dungeonFloor, 0);
    assert.deepEqual(value.bag, []);
    assert.equal(value.gold ?? 0, 0);
  }
  const profile = (await db.execute({ sql: 'SELECT shared_gold, active_slot FROM djrpg_account_profiles WHERE account_id=?', args: ['hero'] })).rows[0];
  assert.equal(Number(profile.shared_gold), 0);
  assert.equal(Number(profile.active_slot), 1);
  const wallet = (await db.execute({ sql: 'SELECT diamonds, max_slots FROM djrpg_shop_wallet WHERE account_id=?', args: ['hero'] })).rows[0];
  assert.equal(Number(wallet.diamonds), 0, '지갑 잔액은 0 — 보상은 우편으로 받는다');
  assert.equal(Number(wallet.max_slots), 3);
  // ④ 보상 우편: 다이아 5,000 + 무작위 보물 주머니 30개, 계정마다 한 통.
  for (const id of ['hero', 'second']) {
    const state = await journeyOf(id);
    assert.equal(state.mail.length, 1, `${id}: 초기화 우편 한 통`);
    const mail = state.mail[0];
    assert.equal(mail.id, RESET_MAIL_ID);
    assert.equal(mail.diamonds, RESET_DIAMONDS);
    assert.equal(mail.pouches, RESET_POUCHES);
    assert.equal(mail.books, 0, '스킬북은 주지 않는다');
    assert.equal(mail.claimedAt, null);
    // 지난 안내·보상 우편은 지급 이력으로 남겨 로그인할 때 다시 붙지 않게 한다.
    for (const notice of HISTORICAL_NOTICE_IDS) assert(state.notices.includes(notice), `${id}: ${notice} 재지급 방지`);
  }
  // 게스트는 우편을 받지 않는다(수령 자체가 403).
  assert.equal(await journeyOf('guest1'), undefined);
});

test('다시 실행해도 우편이 두 통이 되지 않고, 지난 안내 우편이 되살아나지 않는다', async () => {
  await resetServer(db, { apply: true });
  const state = await journeyOf('hero');
  assert.equal(state.mail.length, 1);
  assert.equal(state.mail[0].id, RESET_MAIL_ID);
  // 로그인 정산(`advanceJourney`)을 지나도 옛 업데이트·사과 우편이 붙지 않는다.
  const advanced = advanceJourney(structuredClone(state), save(), save(), Date.UTC(2026, 10, 22, 1, 0, 0));
  assert.equal(advanced.mail.filter(entry => entry.id === UPDATE_NOTICE_ID).length, 0);
  assert.equal(advanced.mail.filter(entry => entry.id === UPDATE_NOTICE_2_ID).length, 0);
  assert.equal(advanced.mail.filter(entry => entry.id === APOLOGY_MAIL_ID).length, 0);
  assert.equal(advanced.mail.filter(entry => entry.id === RESET_MAIL_ID).length, 1, '초기화 보상 우편은 그대로');
  // 다이아 원장에는 이 우편의 행이 없다(아직 아무도 받지 않았다) — 두 번째 실행이 지워도 안전하다.
  const ledger = (await db.execute({ sql: "SELECT COUNT(*) AS n FROM djrpg_shop_ledger WHERE source_id=?", args: [RESET_MAIL_ID] })).rows[0];
  assert.equal(Number(ledger.n), 0);
});

test('초기화 여정 모양 — 보상 우편 1통과 지난 안내 이력만 담는다', () => {
  const state = seededJourneyState(1700000000000);
  assert.equal(state.mail.length, 1);
  assert.deepEqual(state.notices, HISTORICAL_NOTICE_IDS);
  assert.equal(state.mail[0].diamonds, 5000);
  assert.equal(state.mail[0].pouches, 30);
  assert.equal(state.mail[0].expiresAt, null, '보상 우편은 만료가 없다');
});
