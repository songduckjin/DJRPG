import './ts-loader.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { schema, account, transaction, reconcileItems } from '../server/database.mjs';
import { removeTempDbDirectory } from './helpers/temp-db.mjs';
import { ITEMS_FLOOR, ITEMS_PER_SECOND, rewardBudget } from '../server/save-guard.mjs';
const { parseSave, freshSave } = await import('../src/game/store.ts');

/**
 * 아이템 생성 기본 허용치 (작업 245).
 *
 * 보물 주머니를 연달아 열거나 공용창고 앞뒤로 저장이 몰리면 **한 번의 저장에서** 새 아이템이 여러 개
 * 생긴다. 예전 기본값 8개는 그런 정상 장면을 `INVALID_ITEM: 아이템 생성이 서버 허용 범위를 넘었습니다`로
 * 막았다. 가방 상한(40칸)과 같은 40개까지는 그대로 통과해야 한다.
 * 검사는 저장 경로의 `reconcileItems`(서버가 처음 보는 id를 셀 때)에서 하므로 여기서 직접 부른다.
 */
let db, directory, url;
const env = () => ({ TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: 'item-mint-key' });
const saveOf = over => ({ ...parseSave({ ...freshSave('male'), name: '전사' }, undefined), gold: 1000, tutorial: 3, ...over });
const weapon = id => ({ id, name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } });
const book = id => ({ id, name: '[스킬북] 이단참', slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId: 'slash2', stats: {} });

async function seed(id) {
  const save = saveOf({ bag: [] });
  await db.execute({ sql: 'INSERT INTO djrpg_accounts(id,password_hash,save_json,updated_at,session_id) VALUES(?,?,?,?,?)', args: [id, 'hash', JSON.stringify(save), new Date().toISOString(), `sid-${id}`] });
  await account(db, id);
}
/** 저장 경로와 같은 순서(계정 읽기 → reconcileItems)로 새 아이템을 넣어 본다. */
const mint = (id, items) => transaction(db, async tx => {
  const row = await account(tx, id);
  const next = saveOf({ bag: items });
  await reconcileItems(tx, id, row.save, next, { slot: row.slot, elapsedSeconds: 0 });
  return next;
});

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'djrpg-item-mint-'));
  url = `file:${join(directory, 'mint.db')}`;
  db = createClient({ url });
  await schema(db, env());
});
after(async () => {
  await db.close();
  await removeTempDbDirectory(directory).catch(() => rm(directory, { recursive: true, force: true }));
});

test('허용치는 가방 40칸과 같은 40개다', () => {
  assert.equal(ITEMS_FLOOR, 40);
  assert.equal(ITEMS_PER_SECOND, .5);
  const previous = saveOf({});
  assert.equal(rewardBudget(previous, 0).items, 40, '한 번에 40개까지');
  assert.equal(rewardBudget(previous, 60).items, 70, '1분이 지나면 초당 0.5개가 더 붙는다');
});

test('한 번의 저장에서 장비 40개(가방 상한)까지 통과한다', async () => {
  await seed('mint-40');
  const saved = await mint('mint-40', Array.from({ length: 40 }, (_, index) => weapon(`mint-40-${index}`)));
  assert.equal(saved.bag.length, 40);
  const owners = (await db.execute({ sql: 'SELECT item_id FROM djrpg_item_owners WHERE account_id=?', args: ['mint-40'] })).rows;
  assert.equal(owners.length, 40, '40개 모두 소유 기록이 생긴다');
});

test('41개를 한꺼번에 만들면 허용 범위를 넘는다', async () => {
  await seed('mint-41');
  // 가방 40칸을 차지하지 않는 내 직업 스킬북으로 세어 41개를 한 번에 만든다.
  await assert.rejects(mint('mint-41', Array.from({ length: 41 }, (_, index) => book(`mint-41-${index}`))),
    error => error?.code === 'INVALID_ITEM' || error?.status === 400, '41개는 허용 범위를 넘는다');
  // 40개라면 같은 경로로 통과한다.
  await seed('mint-40-books');
  const saved = await mint('mint-40-books', Array.from({ length: 40 }, (_, index) => book(`mint-40-books-${index}`)));
  assert.equal(saved.bag.length, 40);
});
