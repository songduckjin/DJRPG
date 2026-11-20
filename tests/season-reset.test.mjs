import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { removeTempDbDirectory } from './helpers/temp-db.mjs';
import { schema } from '../server/database.mjs';
import { dungeonSchema } from '../server/dungeon-schema.mjs';
import { worldBossSchema } from '../server/world-boss-schema.mjs';
import { accountEndpoint } from '../server/endpoints/account.mjs';
import { hashPassword, tokenFor } from '../server/auth.mjs';
import { runSeasonReset, seasonArmed, SEASON_EPOCH } from '../server/season.mjs';
import { snapshot as journeySnapshot, mutate as journeyMutate } from '../server/journey.mjs';
import { account } from '../server/database.mjs';
import { advanceJourney, DIAMOND_MAIL_ID, SEASON_NOTICE_ID } from '../server/journey-state.mjs';
import { randomUUID } from 'node:crypto';

const PRODUCTION = 'https://djrpg.pages.dev/api/account';
const PREVIEW = 'https://preview-gravel-background-fk.djrpg.pages.dev/api/account';
const envFor = url => ({ TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: 'season-test-key' });
const post = (url, body, token) => new Request(url, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });
const withDb = async url => {
  const env = envFor(url);
  return async (body, { token, host = PRODUCTION } = {}) => {
    const response = await accountEndpoint(post(host, body, token), { env, createDbClient: () => createClient({ url }) });
    return { status: response.status, body: await response.json() };
  };
};

const prepare = async (db, env) => { await schema(db, env); await dungeonSchema(db); await worldBossSchema(db); };

const oldSave = (accountId, name) => ({
  version: 1, name, accountId, gender: 'male', job: 'warrior', auto: true, autoClimb: true, level: 14, exp: 30, gold: 9_000, floor: 7, maxFloor: 9,
  floorKills: 40, kills: 900, health: 320, equipment: {}, equipmentCollection: ['weapon:3'], bag: [{ id: `${accountId}-sword`, name: '낡은 두손검', slot: 'weapon', rarity: 'rare', stats: { attack: 40 } }],
  tutorial: 3, stones: 12, skillPoints: 4, lastActiveAt: Date.now(), learned: ['slash2'], passives: [], quickSlots: ['slash2', null, null], skillLevels: { slash2: 3 }, dungeonFloor: 4, dungeonClearAt: 1_700_000_000_000
});

async function seed(db) {
  const password = await hashPassword('password1');
  const insert = (sql, args) => db.execute({ sql, args });
  for (const [id, hash, name] of [['hero', password, '용사'], ['guest_abc', 'guest', '모험가']]) {
    await insert('INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at,session_id) VALUES (?,?,?,?,?)', [id, hash, JSON.stringify(oldSave(id, name)), new Date().toISOString(), `sid-${id}`]);
    await insert('INSERT INTO djrpg_account_profiles(account_id,shared_gold,active_slot) VALUES (?,?,?)', [id, 9_000, 2]);
    await insert('INSERT INTO djrpg_characters(account_id,slot,save_json,updated_at) VALUES (?,?,?,?)', [id, 1, JSON.stringify({ ...oldSave(id, name), gold: undefined }), new Date().toISOString()]);
    await insert('INSERT INTO djrpg_characters(account_id,slot,save_json,updated_at) VALUES (?,?,?,?)', [id, 2, JSON.stringify({ ...oldSave(id, name), gold: undefined }), new Date().toISOString()]);
    await insert('INSERT INTO djrpg_shop_wallet(account_id,diamonds,max_slots,customer_key) VALUES (?,?,?,?)', [id, 500, 5, `customer-${id}`]);
    await insert('INSERT INTO djrpg_item_owners VALUES (?,?,?,?)', [`${id}-sword`, id, 'inventory', JSON.stringify(oldSave(id, name).bag[0])]);
    await insert('INSERT INTO djrpg_character_item_owners VALUES (?,?,?)', [`${id}-sword`, id, 1]);
    await insert('INSERT INTO djrpg_warehouse(account_id,item_id,item_json) VALUES (?,?,?)', [id, `${id}-box`, JSON.stringify({ id: `${id}-box`, name: '창고 검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } })]);
    await insert('INSERT INTO djrpg_dungeon_records (account_id,name,cleared_floor,cleared_at,updated_at) VALUES (?,?,?,?,?)', [id, name, 7, 1, 1]);
    await insert('INSERT INTO djrpg_boss_scores (day,account_id,name,damage,joined_at) VALUES (?,?,?,?,?)', ['2026-11-20', id, name, 1200, 1]);
    await insert('INSERT INTO djrpg_journey(account_id,state_json) VALUES (?,?)', [id, '{"mail":["welcome"]}']);
    await insert('INSERT INTO djrpg_save_versions(account_id,revision) VALUES (?,?)', [id, 37]);
    await insert('INSERT INTO djrpg_market (id,seller,seller_name,buyer,item_json,name,slot,rarity,price,state,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [`${id}-listing`, id, name, null, JSON.stringify({ id: `${id}-sold`, name: '매물 검', slot: 'weapon', rarity: 'rare', stats: { attack: 9 } }), '매물 검', 'weapon', 'rare', 1200, 'active', 1, 9_999_999_999_999]);
  }
  await insert('INSERT INTO djrpg_shop_orders (order_id,account_id,product_id,amount,currency,provider,grant_json,status,payment_key,created_at,confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', ['order-1', 'hero', 'diamond-500', 5500, 'KRW', 'toss', '{}', 'paid', 'pay-1', 1, 2]);
  await insert('INSERT INTO djrpg_shop_ledger (account_id,source_type,source_id,diamonds_delta,created_at) VALUES (?,?,?,?,?)', ['hero', 'order', 'order-1', 500, 2]);
}

test('미리보기 호스트는 시즌 초기화를 실행하지 않는다', async () => {
  assert.equal(seasonArmed(post(PRODUCTION), {}), true);
  assert.equal(seasonArmed(post(PREVIEW), {}), false);
  assert.equal(seasonArmed(post('https://abc1234.djrpg.pages.dev/api/account'), {}), false);
  assert.equal(seasonArmed(post(PRODUCTION), { DJRPG_SEASON_RESET: 'off' }), false);
  assert.equal(seasonArmed({ method: 'POST' }, {}), false, 'URL이 없는 어댑터는 실행하지 않는다');
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-season-preview-'));
  const url = `file:${join(directory, 'preview.db')}`;
  const db = createClient({ url });
  try {
    await schema(db, envFor(url));
    await prepare(db, envFor(url));
    await seed(db);
    const call = await withDb(url);
    const loaded = await call({ action: 'load' }, { token: tokenFor('hero', envFor(url), 'sid-hero'), host: PREVIEW });
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.needsSetup, false, '미리보기에서는 새 시즌 설정을 요구하지 않는다');
    assert.equal(loaded.body.save.level, 14);
    const row = (await db.execute({ sql: "SELECT save_json FROM djrpg_accounts WHERE id='hero'", args: [] })).rows[0];
    assert.equal(JSON.parse(row.save_json).level, 14, '운영 유저 데이터는 지워지지 않는다');
    assert.equal((await db.execute({ sql: 'SELECT * FROM djrpg_market', args: [] })).rows.length, 2);
    assert.equal((await db.execute({ sql: 'SELECT * FROM djrpg_meta', args: [] })).rows.length, 0);
  } finally { await db.close(); await removeTempDbDirectory(directory); }
});

test('운영 호스트에서 시즌 마이그레이션이 한 번만 돌아 ID·비번만 남기고 전부 초기화한다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-season-'));
  const url = `file:${join(directory, 'season.db')}`;
  const db = createClient({ url });
  const env = envFor(url);
  try {
    await prepare(db, env);
    await seed(db);
    const before = (await db.execute({ sql: "SELECT * FROM djrpg_accounts WHERE id='hero'", args: [] })).rows[0];
    const call = await withDb(url);
    const loaded = await call({ action: 'load' }, { token: tokenFor('hero', env, 'sid-hero') });
    assert.equal(loaded.status, 200);
    assert.equal(loaded.body.needsSetup, true, '로그인·불러오기 응답이 새 시즌 설정을 알린다');
    assert.equal(loaded.body.save.needsSetup, true);
    assert.equal(loaded.body.save.level, 1);
    assert.equal(loaded.body.save.floor, 1);
    assert.equal(loaded.body.save.gold, 0);
    assert.equal(loaded.body.save.bag.length, 0);
    assert.equal(loaded.body.save.name, '용사', '캐릭터 이름은 남는다');
    assert.equal(loaded.body.save.season, SEASON_EPOCH);

    const row = (await db.execute({ sql: "SELECT * FROM djrpg_accounts WHERE id='hero'", args: [] })).rows[0];
    assert.equal(row.password_hash, before.password_hash, '비밀번호 해시는 그대로');
    assert.equal(row.session_id, 'sid-hero', '세션 번호도 그대로');
    for (const table of ['djrpg_market', 'djrpg_market_events', 'djrpg_market_inbox', 'djrpg_warehouse', 'djrpg_item_owners', 'djrpg_character_item_owners', 'djrpg_dungeon_records', 'djrpg_boss_days', 'djrpg_boss_scores', 'djrpg_boss_attempts', 'djrpg_boss_rewards', 'djrpg_journey', 'djrpg_save_requests']) {
      assert.equal((await db.execute({ sql: `SELECT * FROM ${table}`, args: [] })).rows.length, 0, `${table} 비움`);
    }
    assert.equal((await db.execute({ sql: "SELECT revision FROM djrpg_save_versions WHERE account_id='hero'", args: [] })).rows.length, 0, '저장 리비전 초기화');
    const profile = (await db.execute({ sql: "SELECT * FROM djrpg_account_profiles WHERE account_id='hero'", args: [] })).rows[0];
    assert.equal(Number(profile.shared_gold), 0); assert.equal(Number(profile.active_slot), 1);
    const wallet = (await db.execute({ sql: "SELECT * FROM djrpg_shop_wallet WHERE account_id='hero'", args: [] })).rows[0];
    assert.equal(Number(wallet.diamonds), 0, '다이아도 100% 초기화'); assert.equal(Number(wallet.max_slots), 3, '부캐 슬롯 초기화');
    assert.equal(wallet.customer_key, 'customer-hero', '결제 고객 키는 남긴다');
    const orders = (await db.execute({ sql: 'SELECT * FROM djrpg_shop_orders', args: [] })).rows;
    assert.equal(orders.length, 1, '결제 기록은 남긴다');
    assert.equal((await db.execute({ sql: 'SELECT * FROM djrpg_shop_ledger', args: [] })).rows.length, 1);
    const characters = (await db.execute({ sql: "SELECT slot,save_json FROM djrpg_characters WHERE account_id='hero'", args: [] })).rows;
    assert.deepEqual(characters.map(entry => Number(entry.slot)), [1], '부캐 슬롯은 1개만 남는다');
    assert.equal(JSON.parse(characters[0].save_json).needsSetup, true);
    const meta = (await db.execute({ sql: "SELECT value FROM djrpg_meta WHERE key='season_epoch'", args: [] })).rows[0];
    assert.equal(Number(meta.value), SEASON_EPOCH);

    // 게스트 계정은 이 초기화의 대상이 아니다.
    const guest = (await db.execute({ sql: "SELECT save_json FROM djrpg_accounts WHERE id='guest_abc'", args: [] })).rows[0];
    assert.equal(JSON.parse(guest.save_json).level, 14, '게스트는 그대로 둔다');
    assert.equal((await db.execute({ sql: "SELECT * FROM djrpg_characters WHERE account_id='guest_abc'", args: [] })).rows.length, 2);

    // 두 번째 요청은 다시 지우지 않는다.
    await db.execute({ sql: 'INSERT INTO djrpg_market (id,seller,seller_name,buyer,item_json,name,slot,rarity,price,state,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', args: ['after-listing', 'hero', '용사', null, '{}', '새 매물', 'weapon', 'rare', 10, 'active', 1, 9_999_999_999_999] });
    const again = await call({ action: 'load' }, { token: tokenFor('hero', env, 'sid-hero') });
    assert.equal(again.status, 200);
    assert.equal((await db.execute({ sql: 'SELECT * FROM djrpg_market', args: [] })).rows.length, 1, '두 번째 접속에서는 지우지 않는다');
    assert.equal(await runSeasonReset(db, post(PRODUCTION), env), false, '이미 이번 시즌이다');

    // 새 시즌 설정 전에는 세이브가 막힌다.
    const blocked = await call({ action: 'save', save: loaded.body.save, revision: loaded.body.revision, requestId: 'req-1', characterSlot: 1 }, { token: tokenFor('hero', env, 'sid-hero') });
    assert.equal(blocked.status, 409); assert.equal(blocked.body.code, 'SEASON_SETUP_REQUIRED');

    // 직업·성별을 고르면 1층 캐릭터로 입장한다.
    const setup = await call({ action: 'completeSetup', job: 'mage', gender: 'female' }, { token: tokenFor('hero', env, 'sid-hero') });
    assert.equal(setup.status, 200);
    assert.equal(setup.body.save.job, 'mage'); assert.equal(setup.body.save.gender, 'female');
    assert.equal(setup.body.save.level, 1); assert.equal(setup.body.save.floor, 1);
    assert.equal(setup.body.save.needsSetup, undefined, '설정이 끝나면 표시가 사라진다');
    assert.equal(setup.body.job, 'mage');
    const stored = (await db.execute({ sql: "SELECT save_json FROM djrpg_characters WHERE account_id='hero' AND slot=1", args: [] })).rows[0];
    assert.equal(JSON.parse(stored.save_json).job, 'mage');
    assert.equal(JSON.parse(stored.save_json).needsSetup, undefined);
    const twice = await call({ action: 'completeSetup', job: 'warrior', gender: 'male' }, { token: tokenFor('hero', env, 'sid-hero') });
    assert.equal(twice.status, 409); assert.equal(twice.body.code, 'SETUP_DONE');
    const saved = await call({ action: 'save', save: { ...setup.body.save, gold: 5 }, revision: setup.body.revision, requestId: 'req-2', characterSlot: 1 }, { token: tokenFor('hero', env, 'sid-hero') });
    assert.equal(saved.status, 200, '설정 뒤에는 정상 저장');
    const invalid = await call({ action: 'completeSetup', job: 'mage', gender: 'x' }, { token: tokenFor('hero', env, 'sid-hero') });
    assert.equal(invalid.status, 400);
  } finally { await db.close(); await removeTempDbDirectory(directory); }
});

test('시즌 초기화 뒤 기존 비밀번호로 로그인하면 새 시즌 설정을 받는다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-season-login-'));
  const url = `file:${join(directory, 'login.db')}`;
  const db = createClient({ url });
  const env = envFor(url);
  try {
    await prepare(db, env);
    await seed(db);
    const call = await withDb(url);
    const login = await call({ action: 'login', loginId: 'hero', password: 'password1' });
    assert.equal(login.status, 200);
    assert.equal(login.body.needsSetup, true);
    assert.equal(login.body.save.needsSetup, true);
    assert.equal(login.body.loginId, 'hero');
    const setup = await call({ action: 'completeSetup', job: 'archer', gender: 'male' }, { token: login.body.token });
    assert.equal(setup.status, 200);
    assert.equal(setup.body.save.job, 'archer'); assert.equal(setup.body.save.floor, 1);
    // 다음 로그인은 곧바로 인게임으로 들어간다.
    const next = await call({ action: 'login', loginId: 'hero', password: 'password1' });
    assert.equal(next.body.needsSetup, false);
    assert.equal(next.body.save.job, 'archer');
  } finally { await db.close(); await removeTempDbDirectory(directory); }
});

test('새 시즌 초기화 뒤 첫 우편 조회에 전 슬롯 기념 다이아 4,000개와 새 시즌 환영 우편(1,000G + 보물 주머니 1개)이 함께 온다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-season-mail-'));
  const url = `file:${join(directory, 'mail.db')}`;
  const db = createClient({ url });
  const env = envFor(url);
  try {
    await prepare(db, env);
    await seed(db);
    const call = await withDb(url);
    assert.equal((await call({ action: 'load' }, { token: tokenFor('hero', env, 'sid-hero') })).body.needsSetup, true);
    const setup = await call({ action: 'completeSetup', job: 'warrior', gender: 'male' }, { token: tokenFor('hero', env, 'sid-hero') });
    assert.equal(setup.status, 200);
    const data = await journeySnapshot(db, 'hero');
    const diamond = data.mail.find(mail => mail.id === DIAMOND_MAIL_ID);
    const seasonMail = data.mail.find(mail => mail.id === SEASON_NOTICE_ID);
    assert(diamond, '전 슬롯 방치 기념 다이아 우편이 새 시즌에도 다시 온다');
    assert.equal(diamond.diamonds, 4000); assert.equal(diamond.expiresAt, null, '만료가 없어 기간이 지나도 빠지지 않는다');
    assert(seasonMail, '새 시즌 환영 우편이 온다');
    assert.equal(seasonMail.gold, 1000); assert.equal(seasonMail.pouches, 1); assert.equal(seasonMail.books, 0);
    assert.match(seasonMail.title, /보물 주머니 1개/);
    assert.match(seasonMail.body, /대공사 새 시즌 오픈! 기념 보물 주머니 1개를 드립니다/);
    // 두 우편을 받으면 다이아 4,000개·금화 1,000·보물 주머니 1개가 실제로 들어간다(환영 1,000G·업데이트 3,000G 포함).
    const row = await account(db, 'hero');
    await journeyMutate(db, 'hero', { action: 'journey-claim', kind: 'mail', id: 'all', revision: row.revision, requestId: randomUUID(), characterSlot: 1 });
    const claimed = await account(db, 'hero');
    assert.equal(claimed.save.gold, 5000, '환영 1,000 + 업데이트 3,000 + 새 시즌 1,000');
    assert.equal(claimed.save.bag.filter(item => item.slot === 'pouch').length, 1, '새 시즌 환영 보물 주머니 1개');
    const wallet = (await db.execute({ sql: "SELECT diamonds FROM djrpg_shop_wallet WHERE account_id='hero'", args: [] })).rows[0];
    assert.equal(Number(wallet.diamonds), 4000, '전 슬롯 방치 기념 다이아');
    const again = await journeySnapshot(db, 'hero');
    assert.equal(again.mail.filter(mail => !mail.claimedAt).length, 0, '다시 붙지 않는다');
  } finally { await db.close(); await removeTempDbDirectory(directory); }
});

test('게스트는 다이아 기념 우편을 받지 않고 새 시즌 환영 우편만 받는다', () => {
  const saveNow = () => ({ version: 1, name: '게스트', gender: 'male', gold: 0, bag: [], equipment: {}, kills: 0, bossKills: 0, playSeconds: 0, level: 1, floor: 1, maxFloor: 1, equipmentCollection: [], learned: [], passives: [], skillLevels: {} });
  const now = Date.parse('2026-11-20T03:00:00Z');
  const guest = advanceJourney(undefined, saveNow(), saveNow(), now, false);
  assert.equal(guest.mail.filter(mail => mail.id === DIAMOND_MAIL_ID).length, 0, '게스트에게는 다이아를 주지 않는다');
  assert.equal(guest.mail.filter(mail => mail.id === SEASON_NOTICE_ID).length, 1);
  const regular = advanceJourney(undefined, saveNow(), saveNow(), now, true);
  assert.equal(regular.mail.filter(mail => mail.id === DIAMOND_MAIL_ID).length, 1, '정식 계정은 다이아 기념 우편을 받는다');
});
