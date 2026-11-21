import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { accountEndpoint } from '../server/endpoints/account.mjs';
import { account, bagCapacityLimit, countedBagItems } from '../server/database.mjs';
import { snapshot, mutate } from '../server/journey.mjs';

/**
 * 가방 40칸 초과 세이브의 저장 잠금 회복 (작업 246).
 *
 * 사용자 제보 `#20869` "우편함 안받아져" · `#20887` "이전저장결과를 확인하래" ·
 * `#20915` "가방또는 징비데이터도 올바르지 않대".
 * 서버는 우편·보상 스킬북을 칸 검사 없이 가방에 넣는데, 저장 검사는 장비 + **다른 직업 스킬북**이 40을
 * 넘으면 400으로 거절했다. 그래서 40칸이 찬 계정이 보상을 받은 순간부터 모든 save가 거절되고,
 * `sync.flush()`가 실패해 우편함·거래소가 영구히 잠겼다.
 */
const post = (body, token) => new Request('https://example.test/api/account', {
  method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body)
});
const gear = () => ({ id: randomUUID(), name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 2 }, plus: 0 });
// 전사 계정 기준 **다른 직업** 스킬북(궁수·마법사) — 가방 40칸에 세는 아이템이다.
const foreignBook = skillId => ({ id: randomUUID(), kind: 'skillbook', slot: 'skillbook', skillId, rarity: 'rare', name: skillId, stats: {} });

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-bag-'));
  const env = { TURSO_DATABASE_URL: `file:${join(directory, 'bag.db')}`, TURSO_AUTH_TOKEN: 'local-bag-key' };
  const options = { env, createDbClient: ({ TURSO_DATABASE_URL }) => createClient({ url: TURSO_DATABASE_URL }) };
  const call = async (body, token) => {
    const response = await accountEndpoint(post(body, token), options);
    return { status: response.status, body: await response.json() };
  };
  const registered = await call({ action: 'register', loginId: '가방가득', password: 'test-password-247' });
  assert.equal(registered.status, 200, JSON.stringify(registered.body));
  const token = registered.body.token;
  const created = await call({ action: 'createCharacter', slot: 1, name: '가방가득', gender: 'male', job: 'warrior', revision: 0 }, token);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const db = createClient({ url: env.TURSO_DATABASE_URL });
  return { directory, db, call, token, revision: created.body.revision };
}

/** 서버 세이브를 직접 바꿔 "이미 40칸이 찬 계정" 상태를 만든다(보상으로 받은 책 포함). */
async function seedBag(db, id, bag) {
  const row = await account(db, id);
  const save = { ...row.save, bag };
  await db.execute({ sql: 'UPDATE djrpg_characters SET save_json=? WHERE account_id=? AND slot=1', args: [JSON.stringify(save), id] });
  await db.execute({ sql: 'UPDATE djrpg_accounts SET save_json=? WHERE id=?', args: [JSON.stringify(save), id] });
  return { ...row, save };
}

test('가방이 40칸을 넘긴 서버 세이브는 그대로 저장된다 — 우편 보상 뒤 저장 잠금이 풀린다', async () => {
  const { directory, db, call, token, revision } = await setup();
  try {
    const bag = [...Array.from({ length: 40 }, gear), foreignBook('doubleShot'), foreignBook('fireBolt')];
    const row = await seedBag(db, '가방가득', bag);
    assert.equal(countedBagItems(bag, 'warrior'), 42, '장비 40 + 다른 직업 책 2');
    assert.equal(bagCapacityLimit(row.save), 42, '서버가 들고 있는 초과분은 상한으로 인정한다');

    const saved = await call({ action: 'save', save: row.save, revision, characterSlot: 1, requestId: randomUUID() }, token);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.save.bag.length, 42, '아이템을 잃지 않는다');

    // 하나 분해해 41칸이 되어도, 서버가 들고 있는 수까지는 그대로 저장된다.
    const trimmed = { ...saved.body.save, bag: saved.body.save.bag.filter(item => item.skillId !== 'fireBolt') };
    assert.equal(bagCapacityLimit(trimmed), 41);
    const next = await call({ action: 'save', save: trimmed, revision: saved.body.revision, characterSlot: 1, requestId: randomUUID() }, token);
    assert.equal(next.status, 200, JSON.stringify(next.body));
    assert.equal(next.body.save.bag.length, 41, '서버가 들고 있던 아이템은 그대로 저장된다');
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('클라이언트가 상한 위로 더 넣는 저장은 계속 거절하고 이유를 알려 준다', async () => {
  const { directory, db, call, token, revision } = await setup();
  try {
    const bag = [...Array.from({ length: 40 }, gear), foreignBook('doubleShot'), foreignBook('fireBolt')];
    const row = await seedBag(db, '가방가득', bag);
    const grown = { ...row.save, bag: [...bag, gear()] };
    const rejected = await call({ action: 'save', save: grown, revision, characterSlot: 1, requestId: randomUUID() }, token);
    assert.equal(rejected.status, 400, JSON.stringify(rejected.body));
    assert.equal(rejected.body.code, 'INVALID_SAVE');
    assert.match(rejected.body.error, /가방이 42칸까지입니다/, '스스로 자리를 비우도록 안내한다');
    // 같은 상한 안의 저장은 그대로 통과한다.
    const okay = await call({ action: 'save', save: row.save, revision, characterSlot: 1, requestId: randomUUID() }, token);
    assert.equal(okay.status, 200, JSON.stringify(okay.body));
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('가방이 찬 계정도 우편 보상을 받고, 그 세이브로 다시 저장할 수 있다', async () => {
  const { directory, db, call, token, revision } = await setup();
  try {
    const bag = [...Array.from({ length: 40 }, gear), foreignBook('doubleShot'), foreignBook('fireBolt')];
    const row = await seedBag(db, '가방가득', bag);
    const before = await snapshot(db, '가방가득');
    const mail = before.mail.filter(entry => !entry.claimedAt && (entry.expiresAt === null || entry.expiresAt > Date.now()));
    assert(mail.length > 0, '받을 우편이 있다');

    const claimed = await mutate(db, '가방가득', { action: 'journey-claim', kind: 'mail', id: 'all', revision, requestId: randomUUID() });
    assert.equal(claimed.ok, true);
    assert.equal(claimed.save.bag.length >= 42, true, '보상 아이템을 잃지 않는다');
    if (countedBagItems(claimed.save.bag, 'warrior') > 40) assert.match(claimed.message, /가방이 \d+칸이 되어 새 장비를 주울 수 없습니다/, '가방이 넘쳤다는 안내를 함께 보낸다');

    // 핵심: 보상 수령 뒤 클라이언트의 저장(= 우편함을 막던 flush)이 통과해야 한다.
    // 로컬 서버는 updated_at을 초 단위로 읽으므로 그 사이 흐른 시간의 진행 상한과 무관하게 그대로 저장된다.
    const saved = await call({ action: 'save', save: claimed.save, revision: claimed.revision, characterSlot: 1, requestId: randomUUID() }, token);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.save.bag.length, claimed.save.bag.length);
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
