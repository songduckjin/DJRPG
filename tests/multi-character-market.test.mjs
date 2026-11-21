import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { removeTempDbDirectory } from './helpers/temp-db.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { schema, account } from '../server/database.mjs';
import { mutate, snapshot } from '../server/market.mjs';
import accountHandler from '../api/account.mjs';

/**
 * 다캐릭터 거래소 통합 테스트 (작업 239).
 *
 * 거래소는 **계정 공용**(매물·수령함·판매 한도·골드)이고 가방·착용은 **캐릭터별**이다. 그 경계에서
 * 2·3번 캐릭터로 갈아탄 뒤에도 등록·취소·구매·수령이 409 없이 이어지는지, 다른 캐릭터의 진행 세이브를
 * 들고 온 요청이 서버 세이브를 건드리지 않고 거절되는지를 실제 libSQL DB로 확인한다.
 */

const directory = await mkdtemp(join(tmpdir(), 'djrpg-characters-market-'));
const url = `file:${join(directory, 'multi.db')}`;
process.env.TURSO_DATABASE_URL = url;
process.env.TURSO_AUTH_TOKEN = 'local-multi-market-test';
const db = createClient({ url });
const tokens = new Map();
const item = (id, name, extra = {}) => ({ id, name, slot: 'weapon', rarity: 'rare', stats: { attack: 25, crit: 4 }, ...extra });

async function call(id, body) {
  const result = {};
  const token = tokens.get(id) ?? (() => {
    const signed = Buffer.from(JSON.stringify({ id, exp: Date.now() + 600_000 })).toString('base64url');
    return `${signed}.${createHmac('sha256', process.env.TURSO_AUTH_TOKEN).update(signed).digest('base64url')}`;
  })();
  await accountHandler({ method: 'POST', headers: { authorization: `Bearer ${token}` }, body }, { status(code) { result.status = code; return this; }, json(data) { result.body = data; return this; } });
  return { ...result.body, status: result.status };
}
async function signedUp(id) {
  const registered = await call(id, { action: 'register', loginId: id, password: 'password1' });
  tokens.set(id, registered.token);
  assert.equal(registered.status, 200, `${id} 가입`);
  return call(id, { action: 'createCharacter', slot: 1, name: `${id}1`, gender: 'male', job: 'warrior', revision: registered.revision });
}
/** 캐릭터 슬롯을 바꾸고 그 캐릭터의 세이브·revision을 돌려준다(서버 응답 그대로). */
async function switchTo(id, slot) {
  const latest = await call(id, { action: 'load' });
  const selected = await call(id, { action: 'selectCharacter', slot, revision: latest.revision });
  assert.equal(selected.status, 200, `${id} ${slot}번 전환: ${selected.code ?? ''}`);
  return selected;
}
async function saveCharacter(id, slot, save) {
  const latest = await call(id, { action: 'load' });
  return call(id, { action: 'save', save, revision: latest.revision, requestId: randomUUID(), characterSlot: slot });
}
/** 지금 활성 캐릭터로 거래 한 건. */
async function trade(id, body) {
  const row = await account(db, id);
  return mutate(db, id, { ...body, revision: row.revision, requestId: body.requestId ?? randomUUID(), characterSlot: body.characterSlot ?? row.slot });
}
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code);

await schema(db);
const alphaFirst = await signedUp('alpha');
const alphaSaved = await saveCharacter('alpha', 1, { ...alphaFirst.save, name: '알파1', gold: 50_000, bag: [item('alpha-sword', '강철 검'), item('alpha-axe', '강철 도끼'), item('alpha-dagger', '강철 단검')] });
assert.equal(alphaSaved.status, 200, `알파 1번 저장 ${alphaSaved.code ?? ''}`);
const alphaSecond = await call('alpha', { action: 'createCharacter', slot: 2, name: '알파2', gender: 'female', job: 'archer', revision: alphaSaved.revision });
assert.equal(alphaSecond.status, 200, `알파 2번 생성 ${alphaSecond.code ?? ''}`);

test('캐릭터 1이 올린 매물을 캐릭터 2가 취소·수령해 자기 아이템으로 저장·재등록한다', async () => {
  await switchTo('alpha', 1);
  const registered = await trade('alpha', { action: 'register', itemId: 'alpha-sword', price: 500 });
  const listingId = registered.effect.listing.id;
  assert.equal((await snapshot(db, 'alpha', { view: 'inbox' })).inbox.length, 0);

  // 2번 캐릭터로 갈아탄다 — 가방은 비어 있고 계정 공용 매물은 그대로 보인다.
  const second = await switchTo('alpha', 2);
  assert.equal(second.characterSlot, 2);
  assert.equal(second.save.bag.length, 0);
  assert((await snapshot(db, 'alpha', { view: 'mine' })).listings.some(entry => entry.id === listingId), '다른 캐릭터로 전환해도 내 매물이 보인다');

  const cancelled = await trade('alpha', { action: 'cancel', listingId });
  assert.match(cancelled.message, /수령함/);
  const inbox = await snapshot(db, 'alpha', { view: 'inbox' });
  const delivery = inbox.inbox.find(entry => entry.item?.id === 'alpha-sword');
  assert(delivery, '취소한 아이템이 계정 공용 수령함으로 온다');

  const claimed = await trade('alpha', { action: 'claim', deliveryId: delivery.id, progress: second.save });
  assert.deepEqual(claimed.save.bag.map(entry => entry.id), ['alpha-sword']);
  assert.match(claimed.message, /알파2의 가방으로/, '어느 캐릭터가 받았는지 알려 준다');

  const stored = await saveCharacter('alpha', 2, claimed.save);
  assert.equal(stored.status, 200, `2번 캐릭터 저장: ${stored.code ?? ''}`);
  const relisted = await trade('alpha', { action: 'register', itemId: 'alpha-sword', price: 700 });
  assert.equal(relisted.effect.listing.state, 'active');
  const mine = await snapshot(db, 'alpha', { view: 'mine' });
  assert.equal(mine.listings.find(entry => entry.id === relisted.effect.listing.id).sellerName, '알파2', '등록한 캐릭터 이름으로 팔린다');
  // 정리: 취소하고 2번 캐릭터로 받아 둔다(다음 테스트의 수령함을 비운다).
  await trade('alpha', { action: 'cancel', listingId: relisted.effect.listing.id });
  for (const entry of (await snapshot(db, 'alpha', { view: 'inbox' })).inbox) await trade('alpha', { action: 'claim', deliveryId: entry.id });
});

test('캐릭터 2가 캐릭터 1의 진행 세이브를 들고 오면 409로 막고 서버 세이브를 건드리지 않는다', async () => {
  await switchTo('alpha', 1);
  const charOne = await call('alpha', { action: 'load' });
  assert(charOne.save.bag.some(entry => entry.id === 'alpha-axe'), '1번 캐릭터 가방에 도끼가 있다');
  const second = await switchTo('alpha', 2);
  const secondBag = second.save.bag.map(entry => entry.id);
  await rejects(trade('alpha', { action: 'register', itemId: 'alpha-axe', price: 100, progress: charOne.save }), 'ITEM_CONFLICT');
  const after = await call('alpha', { action: 'load' });
  assert.equal(after.characterSlot, 2);
  assert.deepEqual(after.save.bag.map(entry => entry.id), secondBag, '2번 캐릭터 세이브는 그대로다');
  await switchTo('alpha', 1);
  const again = await call('alpha', { action: 'load' });
  assert(again.save.bag.some(entry => entry.id === 'alpha-axe'), '1번 캐릭터의 도끼도 그대로다');
  await switchTo('alpha', 2);
});

test('낡은 캐릭터 번호와 낡은 revision은 CHARACTER_CONFLICT·SAVE_CONFLICT로 거절한다', async () => {
  await rejects(trade('alpha', { action: 'register', itemId: 'nothing', price: 100, characterSlot: 1 }), 'CHARACTER_CONFLICT');
  const row = await account(db, 'alpha');
  await rejects(mutate(db, 'alpha', { action: 'claim', deliveryId: 'all', revision: row.revision - 1, requestId: randomUUID(), characterSlot: row.slot }), 'SAVE_CONFLICT');
});

test('다른 캐릭터가 올린 내 매물은 구매할 수 없고, 안내가 취소·수령을 알려 준다', async () => {
  await switchTo('alpha', 1);
  const listing = await trade('alpha', { action: 'register', itemId: 'alpha-axe', price: 900 });
  await switchTo('alpha', 2);
  await assert.rejects(trade('alpha', { action: 'buy', listingId: listing.effect.listing.id }), error => error.code === 'OWN_LISTING' && /등록을 취소하면 수령함에서 받을 수 있습니다/.test(error.message));
  await trade('alpha', { action: 'cancel', listingId: listing.effect.listing.id });
  const inbox = await snapshot(db, 'alpha', { view: 'inbox' });
  const delivery = inbox.inbox.find(entry => entry.item?.id === 'alpha-axe');
  const claimed = await trade('alpha', { action: 'claim', deliveryId: delivery.id });
  assert(claimed.save.bag.some(entry => entry.id === 'alpha-axe'));
  assert.equal((await saveCharacter('alpha', 2, claimed.save)).status, 200);
});

test('구매한 물품은 고른 캐릭터 가방으로만 들어가고 다른 캐릭터 저장과 섞이지 않는다', async () => {
  const beta = await signedUp('beta');
  const betaSaved = await saveCharacter('beta', 1, { ...beta.save, name: '베타1', gold: 20_000, bag: [item('beta-blade', '베타 검')] });
  assert.equal(betaSaved.status, 200, `베타 저장 ${betaSaved.code ?? ''}`);
  const listing = await trade('beta', { action: 'register', itemId: 'beta-blade', price: 300 });

  // 알파는 1번 캐릭터로 산다.
  await switchTo('alpha', 1);
  const bought = await trade('alpha', { action: 'buy', listingId: listing.effect.listing.id });
  assert.match(bought.message, /수령함/);
  // 2번 캐릭터로 받는다.
  const second = await switchTo('alpha', 2);
  const inbox = await snapshot(db, 'alpha', { view: 'inbox' });
  const purchase = inbox.inbox.find(entry => entry.item?.id === 'beta-blade');
  const claimed = await trade('alpha', { action: 'claim', deliveryId: purchase.id, progress: second.save });
  assert(claimed.save.bag.some(entry => entry.id === 'beta-blade'));
  assert.equal((await saveCharacter('alpha', 2, claimed.save)).status, 200);

  // 1번 캐릭터로 돌아가 저장해도 2번 캐릭터가 받은 검은 따라오지 않는다.
  const first = await switchTo('alpha', 1);
  assert(!first.save.bag.some(entry => entry.id === 'beta-blade'), '1번 캐릭터 가방에는 없다');
  const firstSaved = await call('alpha', { action: 'save', save: first.save, revision: first.revision, requestId: randomUUID(), characterSlot: 1 });
  assert.equal(firstSaved.status, 200);
  const secondBack = await switchTo('alpha', 2);
  assert(secondBack.save.bag.some(entry => entry.id === 'beta-blade'), '2번 캐릭터 가방에는 그대로 있다');
});

test('판매대금은 계정 공용이라 어느 캐릭터로 받아도 같은 금화가 는다', async () => {
  await switchTo('alpha', 1);
  assert((await call('alpha', { action: 'load' })).save.bag.some(entry => entry.id === 'alpha-dagger'));
  const listing = await trade('alpha', { action: 'register', itemId: 'alpha-dagger', price: 1_000 });
  const beta = await account(db, 'beta');
  const bought = await mutate(db, 'beta', { action: 'buy', listingId: listing.effect.listing.id, revision: beta.revision, requestId: randomUUID(), characterSlot: beta.slot });
  assert.match(bought.message, /수령함/);
  // 판매자(알파)는 2번 캐릭터로 접속해도 판매대금을 받는다.
  await switchTo('alpha', 2);
  const before = (await call('alpha', { action: 'load' })).save.gold;
  const inbox = await snapshot(db, 'alpha', { view: 'inbox' });
  const proceeds = inbox.inbox.find(entry => entry.reason.includes('판매대금'));
  assert(proceeds, '판매대금이 수령함에 있다');
  const claimed = await trade('alpha', { action: 'claim', deliveryId: proceeds.id });
  assert.equal(claimed.save.gold, before + 950, '수수료 5%를 뺀 950 금화');
  assert.equal((await saveCharacter('alpha', 2, claimed.save)).status, 200);
});

test('정리: 임시 DB를 지운다', async () => {
  await db.close();
  await removeTempDbDirectory(directory);
});
