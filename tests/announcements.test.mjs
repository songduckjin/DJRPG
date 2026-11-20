import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { schema, account } from '../server/database.mjs';
import { ANNOUNCEMENT_WINDOW_MS, announcePouchLegend, announcedItemName, recentAnnouncements } from '../server/announcements.mjs';
import { marketEndpoint } from '../server/endpoints/market.mjs';
import { tokenFor } from '../server/auth.mjs';

let db, directory, env, url;
const save = (name = '전사') => ({ version: 1, name, gender: 'male', job: 'warrior', gold: 0, bag: [], equipment: {}, kills: 0, bossKills: 0, playSeconds: 0, level: 1, floor: 1, maxFloor: 1, equipmentCollection: [], learned: [], passives: [], skillLevels: {} });
async function seed(id, password_hash = 'hashed', name = '전사') {
  await db.execute({ sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: [id, password_hash, JSON.stringify(save(name)), new Date().toISOString()] });
  await db.execute({ sql: 'INSERT OR IGNORE INTO djrpg_account_profiles(account_id,shared_gold,active_slot) VALUES (?,0,1)', args: [id] });
  await db.execute({ sql: 'INSERT OR IGNORE INTO djrpg_characters(account_id,slot,save_json,updated_at) VALUES (?,1,?,?)', args: [id, JSON.stringify(save(name)), new Date().toISOString()] });
}
// 엔드포인트는 `createDbClient`로 만든 연결을 요청 끝에 닫으므로, 호출마다 새 연결을 준다.
const call = async (id, body) => marketEndpoint(new Request('https://preview.djrpg.pages.dev/api/market', { method: 'POST', headers: { Authorization: `Bearer ${tokenFor(id, env)}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { env, createDbClient: () => createClient({ url }) });
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'djrpg-announce-'));
  url = `file:${join(directory, 'test.db')}`;
  db = createClient({ url });
  env = { TURSO_DATABASE_URL: 'file:test', TURSO_AUTH_TOKEN: 'token', JWT_SECRET: 'secret' };
  await schema(db, env);
});
after(async () => { await db.close(); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });

test('보물 주머니 레전드 공지는 최근 5분 것만 내려주고 오래된 줄은 빠진다', async () => {
  const now = Date.now();
  await announcePouchLegend(db, { accountId: 'a', character: '가람', item: '영원의 패왕의 성검' }, now - 60_000);
  await announcePouchLegend(db, { accountId: 'b', character: '나래', item: '영원의 룬 블레이드' }, now - ANNOUNCEMENT_WINDOW_MS - 60_000);
  const recent = await recentAnnouncements(db, now);
  assert.deepEqual(recent.announcements.map(row => row.character), ['가람'], '창(5분) 밖의 공지는 내려가지 않는다');
  assert.equal(recent.announcements[0].item, '영원의 패왕의 성검');
  assert.equal(recent.windowMs, ANNOUNCEMENT_WINDOW_MS);
  assert(recent.announcements[0].id && recent.announcements[0].createdAt > 0, 'id·시각이 그대로 온다');
});

test('같은 계정이 5초 안에 두 번 올리면 한 줄만 남고, 다른 계정은 따로 남는다', async () => {
  const now = Date.now() + 1_000_000;
  const first = await announcePouchLegend(db, { accountId: 'c', character: '다온', item: '영원의 혈빛 대검' }, now);
  const again = await announcePouchLegend(db, { accountId: 'c', character: '다온', item: '영원의 혈빛 대검' }, now + 1_000);
  assert.equal(first.duplicate, false); assert.equal(again.duplicate, true); assert.equal(again.announcement.id, first.announcement.id);
  const other = await announcePouchLegend(db, { accountId: 'd', character: '라온', item: '영원의 용살자의 대검' }, now + 2_000);
  assert.equal(other.duplicate, false);
  const rows = await recentAnnouncements(db, now + 3_000);
  assert.equal(rows.announcements.filter(row => row.character === '다온').length, 1);
});

test('아이템 이름은 한 줄로 다듬고 너무 길거나 비면 받지 않는다', () => {
  assert.equal(announcedItemName('  영원의   패왕의 성검 '), '영원의 패왕의 성검');
  assert.equal(announcedItemName(''), undefined); assert.equal(announcedItemName('   '), undefined);
  assert.equal(announcedItemName(42), undefined); assert.equal(announcedItemName('가'.repeat(61)), undefined);
  assert.equal(announcedItemName('가'.repeat(60)).length, 60);
});

test('정식 계정은 레전드 공지를 올리고, 게스트는 거절되며, 응답은 같은 줄을 돌려준다', async () => {
  await seed('normal-1', 'hashed', '검은여우'); await seed('guest-1', 'guest', '게스트');
  const posted = await (await call('normal-1', { action: 'announcePouchLegend', itemName: '영원의 패왕의 성검' })).json();
  assert.equal(posted.ok, true);
  assert.equal(posted.announcement.character, '검은여우', '세이브의 캐릭터 이름으로 올린다');
  assert.equal(posted.announcement.item, '영원의 패왕의 성검');
  const guest = await call('guest-1', { action: 'announcePouchLegend', itemName: '영원의 패왕의 성검' });
  assert.equal(guest.status, 403);
  assert.equal((await guest.json()).code, 'GUEST_READ_ONLY');
  const empty = await call('normal-1', { action: 'announcePouchLegend', itemName: '   ' });
  assert.equal(empty.status, 400);
  const list = await (await call('normal-1', { action: 'announcements' })).json();
  assert(list.announcements.some(row => row.id === posted.announcement.id), '접속 중인 누구나 같은 공지를 받는다');
  const row = (await db.execute({ sql: 'SELECT item FROM djrpg_announcements WHERE account_id=?', args: ['normal-1'] })).rows[0];
  assert.equal(row.item, '영원의 패왕의 성검');
});
