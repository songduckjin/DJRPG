// 서버 스킬북 검증(작업 209): `server/database.mjs` `itemValid`가 스킬북 `skillId`를 전사 11종으로만
// 하드코딩해 **궁수·마법사 스킬북이 가방에 들어올 때 400 INVALID_ITEM**으로 막히던 버그의 회귀 테스트다.
//
// ① 서버 목록(`server/skill-ids.mjs`)이 클라이언트 `src/game/skills.ts`의 33종과 ID·순서·이름까지 같은지,
// ② 3직업 액티브·패시브 스킬북 33종 + 보물 주머니가 `reconcileItems`·`writeSave`를 통과하고 그대로 다시
//    읽히는지(load 정리 `healStaleLoadItems`가 지우지 않는지),
// ③ 잘못된 skillId·중복 id·kind 불일치는 여전히 400으로 막히는지,
// ④ 우편·여정 보상 스킬북도 세 직업에서 나오고 그 세이브가 다시 저장되는지 — 를 실제 sqlite 서버 모듈로 확인한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import './ts-loader.mjs';

const clientSkills = await import('../src/game/skills.ts');
const serverSkills = await import('../server/skill-ids.mjs');
const { schema, account, transaction, reconcileItems, writeSave, healStaleLoadItems } = await import('../server/database.mjs');
const { mutate } = await import('../server/journey.mjs');

const save = () => ({
  version: 1, name: '궁수', gender: 'female', job: 'archer', gold: 0, bag: [], equipment: {},
  kills: 0, bossKills: 0, playSeconds: 0, level: 1, floor: 1, maxFloor: 1,
  equipmentCollection: [], learned: [], passives: [], skillLevels: {}
});
const book = (skillId, name = serverSkills.skillBookName(skillId)) => ({
  id: randomUUID(), kind: 'skillbook', slot: 'skillbook', skillId, rarity: 'rare', name, stats: {}
});
const pouch = () => ({ id: randomUUID(), kind: 'pouch', slot: 'pouch', rarity: 'unique', name: '무작위 보물 주머니', stats: {} });
const jobOf = skillId => ['warrior', 'archer', 'mage'].find(job =>
  clientSkills.skillOrderFor(job).includes(skillId) || clientSkills.passiveOrderFor(job).includes(skillId));

const invalidItem = error => error?.status === 400 && error?.code === 'INVALID_ITEM';

async function withDatabase(run) {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-skillbook-'));
  const db = createClient({ url: `file:${join(directory, 'skillbook.db')}` });
  try {
    await schema(db);
    return await run(db);
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

async function seed(db, id, base = save()) {
  await db.execute({
    sql: 'INSERT INTO djrpg_accounts (id,password_hash,save_json,updated_at) VALUES (?,?,?,?)',
    args: [id, 'hashed', JSON.stringify(base), new Date().toISOString()]
  });
}

test('서버 스킬북 목록은 클라이언트 33종과 ID·순서·이름이 같다', () => {
  assert.deepEqual(serverSkills.activeSkillIds, clientSkills.allSkillIds, '액티브 24종');
  assert.deepEqual(serverSkills.passiveSkillIds, clientSkills.allPassiveIds, '패시브 9종');
  assert.deepEqual(serverSkills.skillBookIds, [...clientSkills.allSkillIds, ...clientSkills.allPassiveIds]);
  assert.equal(serverSkills.skillBookIds.length, 33, '3직업 × (액티브 8 + 패시브 3)');
  for (const skillId of serverSkills.skillBookIds) {
    const clientName = skillId in clientSkills.skills
      ? clientSkills.skills[skillId].name
      : clientSkills.passives[skillId].name;
    assert.equal(serverSkills.skillNames[skillId], clientName, `${skillId} 이름이 화면과 같다`);
    assert.equal(serverSkills.skillBookName(skillId), `[스킬북] ${clientName}`);
    assert.ok(serverSkills.skillBookIdSet.has(skillId));
  }
  // 직업별로 액티브 8 + 패시브 3씩 — 한 직업도 빠지지 않는다.
  for (const job of clientSkills.jobs) {
    assert.equal(clientSkills.skillOrderFor(job).length, 8, `${job} 액티브 8`);
    assert.equal(clientSkills.passiveOrderFor(job).length, 3, `${job} 패시브 3`);
  }
});

test('궁수·마법사 스킬북과 보물 주머니가 400 INVALID_ITEM 없이 저장되고 다시 읽힌다', () => withDatabase(async db => {
  await seed(db, 'archer');
  await account(db, 'archer');
  // 34개를 한 번에 넣는 것은 정상 플레이가 아니다 — 서버의 생성 상한(작업 209: 8 + 초당 0.5개) 안에 들어오도록
  // 마지막 저장 이후 시간을 넉넉히 되돌려 둔다.
  await db.execute({ sql: 'UPDATE djrpg_characters SET updated_at=? WHERE account_id=?', args: [new Date(Date.now() - 120_000).toISOString(), 'archer'] });
  const items = [...serverSkills.skillBookIds.map(skillId => book(skillId)), pouch()];
  const saved = await transaction(db, async tx => {
    const row = await account(tx, 'archer');
    const incoming = { ...structuredClone(row.save), bag: structuredClone(items) };
    await reconcileItems(tx, 'archer', row.save, incoming, { slot: row.slot, elapsedSeconds: 120 });
    return writeSave(tx, row, incoming);
  });
  assert.equal(saved.save.bag.length, 34, '스킬북 33권 + 주머니 1개가 모두 저장된다');
  const stored = await account(db, 'archer');
  assert.deepEqual(stored.save.bag.map(item => item.skillId ?? item.slot), [...serverSkills.skillBookIds, 'pouch']);
  // load 정리(`healStaleLoadItems`)가 타직업 스킬북을 '잘못된 아이템'으로 보고 지우지 않는다.
  const healed = await transaction(db, tx => healStaleLoadItems(tx, stored));
  assert.equal(healed.bag.length, 34);
  assert.deepEqual(healed.bag.map(item => item.skillId ?? item.slot), [...serverSkills.skillBookIds, 'pouch']);
}));

test('알 수 없는 skillId·중복 id·kind 불일치는 여전히 400 INVALID_ITEM이다', () => withDatabase(async db => {
  await seed(db, 'guard');
  const attempt = bag => transaction(db, async tx => {
    const row = await account(tx, 'guard');
    return reconcileItems(tx, 'guard', row.save, { ...structuredClone(row.save), bag: structuredClone(bag) }, { slot: row.slot });
  });
  const cases = [
    ['없는 skillId', [book('fireball')]],
    ['전사 11종 밖의 오타', [book('doubleShots')]],
    ['skillId 없음', [(() => { const item = book('doubleShot'); delete item.skillId; return item; })()]],
    ['스킬북인데 kind가 equipment', [{ ...book('fireBolt'), kind: 'equipment' }]],
    ['주머니인데 kind가 skillbook', [{ ...pouch(), kind: 'skillbook' }]]
  ];
  for (const [label, bag] of cases) await assert.rejects(attempt(bag), invalidItem, label);
  // 같은 id가 두 번 오면 예전처럼 막는다(스킬북이 늘어나도 중복 검사는 그대로).
  const duplicate = book('doubleShot');
  await assert.rejects(attempt([duplicate, { ...duplicate }]), invalidItem, '중복 id');
}));

test('보상 스킬북 추첨은 33종 전부를 고르고 이름도 화면과 같다', () => {
  // 0 ≤ random < 1의 33칸을 모두 훑어 세 직업 33종이 한 번씩 나오는지 본다(추첨 함수 자체의 회귀).
  const picked = serverSkills.skillBookIds.map((_, index) => serverSkills.rollRewardSkillBook(() => (index + .5) / 33));
  assert.deepEqual(picked.map(entry => entry.skillId), serverSkills.skillBookIds);
  for (const entry of picked) assert.equal(entry.name, serverSkills.skillBookName(entry.skillId));
  assert.deepEqual(new Set(serverSkills.skillBookIds.map(jobOf)), new Set(['warrior', 'archer', 'mage']), '세 직업 모두 후보에 있다');
  // 범위 밖 난수도 목록 안으로 떨어진다.
  assert.equal(serverSkills.rollRewardSkillBook(() => 1).skillId, serverSkills.skillBookIds.at(-1));
});

test('우편 보상 스킬북은 33종 안에서 나오고 그 세이브가 다시 저장된다', () => withDatabase(async db => {
  for (let index = 0; index < 12; index++) {
    const id = `reward${index}`;
    await seed(db, id);
    const row = await account(db, id);
    const claimed = await mutate(db, id, { action: 'journey-claim', kind: 'mail', id: 'welcome-v1', revision: row.revision, requestId: randomUUID() });
    const books = claimed.save.bag.filter(item => item.slot === 'skillbook');
    assert.equal(books.length, 1, '환영 우편은 스킬북 1권');
    const [item] = books;
    assert.ok(serverSkills.skillBookIdSet.has(item.skillId), `${item.skillId}가 33종 밖이면 서버가 자기 보상을 거부한다`);
    assert.equal(item.name, serverSkills.skillBookName(item.skillId));
    assert.ok(jobOf(item.skillId), `${item.skillId}의 직업을 알 수 없다`);
    // 클라이언트가 가방을 그대로 다시 저장하는 경로(예전에는 여기서 400이 났다).
    await transaction(db, async tx => {
      const current = await account(tx, id);
      await reconcileItems(tx, id, current.save, structuredClone(current.save), { slot: current.slot });
    });
  }
}));
