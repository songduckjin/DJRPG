import './ts-loader.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { schema, account } from '../server/database.mjs';
import { snapshot, mutate } from '../server/journey.mjs';
import { RESET_DIAMONDS, RESET_MAIL_ID, RESET_POUCHES, seededJourneyState } from '../scripts/reset-server-test.mjs';

/**
 * 우편 기능 정밀 검증 — 초기화 보상(다이아 5,000 + 보물 주머니 30개)과 다량 꾸러미·여러 통 수령.
 *
 * 2026-11-22 사용자 지시 "우편기능 제대로 확인해야돼". 여기서 확인하는 것:
 *  ① 우편함 화면이 쓰는 값(`journeyView.mail`)에 제목·본문·보상 수량이 모두 실려 오는가
 *  ② 보물 주머니 30개가 **가방 30칸**(1개 = 1칸)을 쓰고, 다이아는 지갑 원장으로 한 번만 들어가는가
 *  ③ 가방이 가득 차면 **아무것도 들어가지 않고**(다이아도) 우편이 미수령으로 남는가
 *  ④ 여러 통을 `모두 받기`로 받을 때 자리가 모자란 우편만 건너뛰고 나머지는 정상 수령되는가
 *  ⑤ 같은 요청 재시도(멱등)·두 번째 수령 시도에서 중복 지급이나 400/500이 없는가
 *
 * 서버 저장은 매 수령마다 `writeSave`(save-guard·reconcileItems)를 지나므로, 400이 나면 여기서 실패한다.
 */
let db, directory;
const accountIds = [];

const gear = (id = randomUUID()) => ({ id, name: '강철 쯔바이핸드', slot: 'weapon', rarity: 'rare', stats: { attack: 25 } });
/** 새 시즌 캐릭터 — 초기화 뒤 첫 로그인과 같은 모양(Lv.1, 빈 가방). */
const freshSave = (bag = []) => ({
  version: 1, name: '모험가', accountId: 'AAAA1111', gender: 'male', job: 'warrior', auto: true, autoClimb: true,
  level: 1, exp: 0, gold: 0, floor: 1, maxFloor: 1, floorKills: 0, kills: 0, bossKills: 0, playSeconds: 0,
  salvageCount: 0, health: 140, equipment: {}, equipmentCollection: [], bag, tutorial: 0, stones: 0,
  skillPoints: 3, lastActiveAt: Date.now(), learned: ['slash2'], passives: [], quickSlots: [null, null, null],
  skillLevels: { slash2: 1 }, statBooks: { attack: 0, defense: 0, health: 0, skill: 0 },
  dungeonFloor: 0, dungeonClearAt: 0, bossRetryFloor: 0
});

/** 계정 하나 + 여정 상태를 넣는다(초기화 스크립트가 깔아 두는 모양 그대로). */
async function seed(id, { bag = [], mail } = {}) {
  accountIds.push(id);
  const at = new Date().toISOString();
  await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: [id, 'test-password-hash', JSON.stringify(freshSave(bag)), at] });
  await db.execute({ sql: 'INSERT INTO djrpg_characters (account_id,slot,save_json,updated_at) VALUES (?,?,?,?)', args: [id, 1, JSON.stringify(freshSave(bag)), at] });
  await db.execute({ sql: 'INSERT INTO djrpg_shop_wallet (account_id,diamonds,max_slots,customer_key) VALUES (?,?,?,?)', args: [id, 0, 3, `ck-${id}`] });
  const state = seededJourneyState();
  if (mail) state.mail.push(...mail);
  await db.execute({ sql: 'INSERT INTO djrpg_journey (account_id,state_json) VALUES (?,?)', args: [id, JSON.stringify(state)] });
}
async function claim(id, kind = 'mail', mailId = 'all', requestId = randomUUID()) {
  const row = await account(db, id);
  return mutate(db, id, { action: 'journey-claim', kind, id: mailId, revision: row.revision, requestId });
}
async function sendOnce(id, action, extra, requestId = randomUUID()) {
  const row = await account(db, id);
  return mutate(db, id, { action, revision: row.revision, requestId, ...extra });
}
const wallet = async id => Number((await db.execute({ sql: 'SELECT diamonds FROM djrpg_shop_wallet WHERE account_id=?', args: [id] })).rows[0]?.diamonds ?? 0);
const ledgerRows = async id => Number((await db.execute({ sql: "SELECT COUNT(*) AS n FROM djrpg_shop_ledger WHERE account_id=? AND source_type='mail'", args: [id] })).rows[0]?.n ?? 0);
const saveOf = async id => (await account(db, id)).save;
const journeyOf = async id => JSON.parse((await db.execute({ sql: 'SELECT state_json FROM djrpg_journey WHERE account_id=?', args: [id] })).rows[0].state_json);
const mailOf = async (id, mailId) => (await journeyOf(id)).mail.find(entry => entry.id === mailId);
const bagSlots = save => save.bag.length;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'djrpg-mail-flow-'));
  db = createClient({ url: `file:${join(directory, 'mail.db')}` });
  await schema(db);
});
after(async () => { await db.close(); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });

// ── ① 우편함에 보이는 값 ─────────────────────────────────────────────────────

test('초기화 보상 우편이 제목·본문·보상 수량(다이아 5,000 · 보물 주머니 30)과 함께 실려 온다', async () => {
  await seed('view-1');
  const data = await snapshot(db, 'view-1');
  const mail = data.mail.find(entry => entry.id === RESET_MAIL_ID);
  assert(mail, '초기화 보상 우편이 우편함에 있다');
  assert.equal(mail.title, '[테스트 시즌 초기화] 보상 안내');
  assert.equal(mail.sender, '운영팀');
  assert.match(mail.body, /다이아 5,000개/, '본문에 다이아 수량');
  assert.match(mail.body, /보물 주머니 30개/, '본문에 주머니 수량');
  assert.equal(mail.diamonds, RESET_DIAMONDS, '보상 카드가 읽는 다이아 값');
  assert.equal(mail.pouches, RESET_POUCHES, '보상 카드가 읽는 주머니 값');
  assert.equal(mail.gold, 0);
  assert.equal(mail.claimedAt, null);
  assert.equal(mail.expired, false);
  assert.equal(mail.expiresAt, null, '무기한 우편');
});

// ── ② 다량 꾸러미 수령 ───────────────────────────────────────────────────────

test('보물 주머니 30개는 가방 30칸(1개 = 1칸)을 쓰고, 다이아는 지갑·원장에 한 번만 들어간다', async () => {
  await seed('claim-1');
  await claim('claim-1', 'mail', RESET_MAIL_ID);
  const save = await saveOf('claim-1');
  assert.equal(bagSlots(save), RESET_POUCHES, `주머니 ${RESET_POUCHES}개 = ${RESET_POUCHES}칸`);
  assert(save.bag.every(item => item.kind === 'pouch' && item.slot === 'pouch'), '가방은 전부 보물 주머니');
  assert.equal(new Set(save.bag.map(item => item.id)).size, RESET_POUCHES, '주머니는 서로 다른 아이템이다(개별 칸)');
  assert.equal(await wallet('claim-1'), RESET_DIAMONDS, '다이아 5,000이 지갑으로');
  assert.equal(await ledgerRows('claim-1'), 1, '원장 기록은 한 번');
  const mail = await mailOf('claim-1', RESET_MAIL_ID);
  assert(mail.claimedAt, '수령 시각이 남는다');
  assert.equal(mail.read, true);
  // 두 번째 수령 시도는 거절되고 아무것도 늘지 않는다.
  await assert.rejects(claim('claim-1', 'mail', RESET_MAIL_ID), error => error.code === 'NOT_AVAILABLE');
  assert.equal(bagSlots(await saveOf('claim-1')), RESET_POUCHES);
  assert.equal(await wallet('claim-1'), RESET_DIAMONDS);
  assert.equal(await ledgerRows('claim-1'), 1);
});

test('가방이 가득 차면 수령이 막히고 다이아도 들어가지 않는다 — 우편은 미수령으로 남는다', async () => {
  await seed('full-1', { bag: Array.from({ length: 40 }, () => gear()) });
  await assert.rejects(claim('full-1', 'mail', RESET_MAIL_ID), error => error.code === 'BAG_FULL');
  const save = await saveOf('full-1');
  assert.equal(bagSlots(save), 40, '가방은 그대로');
  assert.equal(await wallet('full-1'), 0, '한 트랜잭션이라 다이아도 들어가지 않는다');
  assert.equal(await ledgerRows('full-1'), 0, '원장도 남지 않는다');
  const mail = await mailOf('full-1', RESET_MAIL_ID);
  assert.equal(mail.claimedAt, null, '미수령으로 남아 나중에 받을 수 있다');
  // 10칸을 비우면(30칸 필요) 받을 수 있다.
  const spare = Array.from({ length: 10 }, () => gear());
  const row = await account(db, 'full-1');
  await mutate(db, 'full-1', { action: 'journey-read', id: RESET_MAIL_ID, revision: row.revision, requestId: randomUUID(), progress: { ...row.save, bag: spare } });
  await claim('full-1', 'mail', RESET_MAIL_ID);
  assert.equal(bagSlots(await saveOf('full-1')), 40, '10칸 + 주머니 30칸 = 40칸');
  assert.equal(await wallet('full-1'), RESET_DIAMONDS);
});

// ── ③ 여러 통 · 모두 받기 ────────────────────────────────────────────────────

test('모두 받기 — 자리가 모자란 아이템 우편만 건너뛰고, 다이아·금화 우편은 받는다', async () => {
  const legend = { id: 'legend-reward-1', title: '[레전드] 보상 꾸러미', sender: '운영팀', body: '레전드 보상입니다.', createdAt: Date.now(), expiresAt: null, gold: 2000, books: 0, pouches: 3, diamonds: 0, claimedAt: null, read: false };
  const diamonds = { id: 'diamond-only-1', title: '다이아 777개 지급', sender: '운영팀', body: '다이아만 있는 우편', createdAt: Date.now(), expiresAt: null, gold: 0, books: 0, pouches: 0, diamonds: 777, claimedAt: null, read: false };
  await seed('multi-1', { bag: Array.from({ length: 20 }, () => gear()), mail: [legend, diamonds] });
  // 서버와 같은 규칙으로 기대값을 먼저 센다(칸이 모자란 우편만 건너뛴다).
  const before = await snapshot(db, 'multi-1');
  const open = before.mail.filter(mail => !mail.claimedAt && (mail.expiresAt === null || mail.expiresAt > Date.now()));
  let slots = 20; const expectClaimed = [], expectSkipped = [];
  for (const mail of open) {
    const need = (mail.pouches ?? 0) + (mail.item ? 1 : 0);
    if (!need || slots + need <= 40) { slots += need; expectClaimed.push(mail.id); } else expectSkipped.push(mail.id);
  }
  assert(expectSkipped.includes(RESET_MAIL_ID), '30칸이 필요한 초기화 보상은 자리가 없어 건너뛴다');
  const result = await claim('multi-1', 'mail', 'all');
  assert.match(result.message, new RegExp(`${expectClaimed.length}개 보상을 수령했습니다`));
  assert.match(result.message, new RegExp(`가방이 가득 차 ${expectSkipped.length}개 우편은 받지 못했습니다`));
  const save = await saveOf('multi-1');
  assert.equal(bagSlots(save), slots, '받은 만큼만 칸을 쓴다');
  for (const id of expectClaimed) assert.notEqual((await mailOf('multi-1', id)).claimedAt, null, `${id} 수령`);
  for (const id of expectSkipped) assert.equal((await mailOf('multi-1', id)).claimedAt, null, `${id} 미수령`);
  assert.equal(save.gold, 2000, '레전드 꾸러미 금화');
  assert.equal(await wallet('multi-1'), 777, '다이아만 있는 우편의 다이아');
  // 남은 우편은 나중에(칸을 비운 뒤) 그대로 받을 수 있다.
  const row = await account(db, 'multi-1');
  await mutate(db, 'multi-1', { action: 'journey-read', id: RESET_MAIL_ID, revision: row.revision, requestId: randomUUID(), progress: { ...row.save, bag: [] } });
  await claim('multi-1', 'mail', RESET_MAIL_ID);
  assert.equal(bagSlots(await saveOf('multi-1')), RESET_POUCHES);
  assert.equal(await wallet('multi-1'), 777 + RESET_DIAMONDS, '다이아가 두 번 들어가지 않는다');
  const ledgers = Number((await db.execute({ sql: "SELECT COUNT(*) AS n FROM djrpg_shop_ledger WHERE account_id=? AND source_type='mail' AND diamonds_delta>0", args: ['multi-1'] })).rows[0]?.n ?? 0);
  assert.equal(ledgers, 2, '다이아가 든 우편 두 통 = 원장 두 줄');
});

test('개별 수령을 반복해도 각 우편은 한 번만 들어간다(중복·유실 없음)', async () => {
  const small = (id, pouches, diamonds) => ({ id, title: `보상 ${id}`, sender: '운영팀', body: '보상', createdAt: Date.now(), expiresAt: null, gold: 0, books: 0, pouches, diamonds, claimedAt: null, read: false });
  await seed('each-1', { mail: [small('small-a', 2, 100), small('small-b', 1, 250)] });
  await claim('each-1', 'mail', 'small-a');
  await claim('each-1', 'mail', 'small-b');
  const save = await saveOf('each-1');
  assert.equal(bagSlots(save), 3, '주머니 2 + 1');
  assert.equal(await wallet('each-1'), 350);
  assert.equal(await ledgerRows('each-1'), 2);
  await assert.rejects(claim('each-1', 'mail', 'small-a'), error => error.code === 'NOT_AVAILABLE');
  assert.equal(bagSlots(await saveOf('each-1')), 3, '재수령 시도로 늘지 않는다');
});

// ── ④ 멱등 ───────────────────────────────────────────────────────────────────

test('같은 requestId로 다시 보내면 같은 응답을 돌려주고 지급은 한 번뿐이다', async () => {
  const mail = { id: 'idem-1', title: '멱등 확인', sender: '운영팀', body: '보상', createdAt: Date.now(), expiresAt: null, gold: 0, books: 0, pouches: 2, diamonds: 500, claimedAt: null, read: false };
  await seed('idem-acc', { mail: [mail] });
  const requestId = randomUUID();
  const row = await account(db, 'idem-acc');
  const input = { action: 'journey-claim', kind: 'mail', id: 'idem-1', revision: row.revision, requestId };
  const first = await mutate(db, 'idem-acc', input);
  const replay = await mutate(db, 'idem-acc', { ...input, revision: (await account(db, 'idem-acc')).revision });
  assert.equal(replay.message, first.message, '저장된 응답을 그대로 돌려준다');
  const save = await saveOf('idem-acc');
  assert.equal(bagSlots(save), 2, '주머니는 한 번만');
  assert.equal(await wallet('idem-acc'), 500, '다이아도 한 번만');
  assert.equal(await ledgerRows('idem-acc'), 1);
  // 요청 기록도 한 줄만 남는다(재시도가 쌓이지 않는다).
  const requests = Number((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM djrpg_journey_requests WHERE account_id=?', args: ['idem-acc'] })).rows[0]?.n ?? 0);
  assert.equal(requests, 1);
});

test('읽음·삭제 처리도 우편을 잃지 않는다 — 미수령 보상은 삭제되지 않는다', async () => {
  await seed('read-1');
  await sendOnce('read-1', 'journey-read', { id: RESET_MAIL_ID });
  assert.equal((await mailOf('read-1', RESET_MAIL_ID)).read, true);
  await sendOnce('read-1', 'journey-delete', {});
  assert((await mailOf('read-1', RESET_MAIL_ID)), '미수령 우편은 삭제 대상이 아니다');
  await claim('read-1', 'mail', RESET_MAIL_ID);
  await sendOnce('read-1', 'journey-delete', {});
  assert.equal(await mailOf('read-1', RESET_MAIL_ID), undefined, '수령한 우편은 삭제된다');
});
