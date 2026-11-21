import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { accountEndpoint } from '../server/endpoints/account.mjs';
import { account, countedBagItems } from '../server/database.mjs';

/**
 * 직업별 투구·갑옷이 서버 저장(작업 249)을 통과하는지.
 *
 * 서버 `itemValid`는 아이템 **이름을 검사하지 않고**(길이만), `job` 같은 덧붙은 필드도 그대로 둔다.
 * 이 테스트는 그 사실에 기대는 부분을 고정한다 — 새 이름·`job` 표식이 `400 INVALID_ITEM/INVALID_SAVE`로
 * 막히지 않고, 저장 → 다시 불러오기에서 표식이 유지되어야 한다(클라이언트가 그 표식으로 장착을 막는다).
 * 옛 세이브의 전사용 이름(표식 없음)도 같은 저장에 함께 넣어 호환을 확인한다.
 */
const post = (body, token) => new Request('https://example.test/api/account', {
  method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body)
});
const item = (name, slot, extra = {}) => ({ id: randomUUID(), name, slot, rarity: 'rare', stats: { defense: 20, health: 10 }, plus: 0, ...extra });

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-jobgear-'));
  const env = { TURSO_DATABASE_URL: `file:${join(directory, 'gear.db')}`, TURSO_AUTH_TOKEN: 'local-gear-key' };
  const options = { env, createDbClient: ({ TURSO_DATABASE_URL }) => createClient({ url: TURSO_DATABASE_URL }) };
  const call = async (body, token) => {
    const response = await accountEndpoint(post(body, token), options);
    return { status: response.status, body: await response.json() };
  };
  const registered = await call({ action: 'register', loginId: '장비구분', password: 'test-password-249' });
  assert.equal(registered.status, 200, JSON.stringify(registered.body));
  const token = registered.body.token;
  const created = await call({ action: 'createCharacter', slot: 1, name: '장비구분', gender: 'female', job: 'mage', revision: 0 }, token);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const db = createClient({ url: env.TURSO_DATABASE_URL });
  const row = await account(db, '장비구분');
  return { directory, db, call, token, row };
}

test('직업별 투구·갑옷과 `job` 표식이 서버 저장·불러오기에서 그대로 살아남는다', async () => {
  const { directory, db, call, token, row } = await setup();
  try {
    const robe = item('황혼의 룬 전투 법의', 'armor', { job: 'mage' });
    const hat = item('영원의 대현자의 황금 왕관', 'helmet', { job: 'mage' });
    const legacyPlate = item('서리의 흑요석 갑주', 'armor');               // 옛 세이브의 전사용 이름(표식 없음)
    const foreignGear = item('영원의 용린 레인저 갑주', 'armor', { job: 'archer' });
    const save = {
      ...row.save,
      equipment: { ...row.save.equipment, armor: robe, helmet: hat },
      bag: [legacyPlate, foreignGear]
    };
    const saved = await call({ action: 'save', save, revision: row.revision, characterSlot: 1, requestId: randomUUID() }, token);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.save.equipment.armor.job, 'mage', '새 갑옷의 주인 직업이 저장된다');
    assert.equal(saved.body.save.equipment.armor.name, '황혼의 룬 전투 법의');
    assert.equal(saved.body.save.equipment.helmet.job, 'mage');
    assert.equal(saved.body.save.bag.find(entry => entry.id === legacyPlate.id).job, undefined, '옛 장비에는 표식이 생기지 않는다');
    assert.equal(saved.body.save.bag.find(entry => entry.id === foreignGear.id).job, 'archer', '다른 직업 장비의 표식도 그대로다');

    // 같은 세이브를 다시 불러와도 표식·이름이 유지된다(다음 저장이 409가 되지 않는다).
    const loaded = await call({ action: 'load', characterSlot: 1 }, token);
    assert.equal(loaded.status, 200, JSON.stringify(loaded.body));
    const loadedSave = loaded.body.save;
    assert.equal(loadedSave.equipment.armor.job, 'mage');
    assert.equal(loadedSave.bag.find(entry => entry.id === foreignGear.id).job, 'archer');
    const again = await call({ action: 'save', save: loadedSave, revision: loaded.body.revision, characterSlot: 1, requestId: randomUUID() }, token);
    assert.equal(again.status, 200, JSON.stringify(again.body));
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('가방 40칸은 투구·갑옷도 장비로 센다 — 직업과 상관없이 한 칸', async () => {
  const { directory, db, call, token, row } = await setup();
  try {
    const bag = [
      item('사냥꾼 가죽 조끼', 'armor', { job: 'archer' }),
      item('미스릴 아머', 'armor'),
      item('수련생 천 두건', 'helmet', { job: 'mage' })
    ];
    const save = { ...row.save, bag };
    const saved = await call({ action: 'save', save, revision: row.revision, characterSlot: 1, requestId: randomUUID() }, token);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(countedBagItems(saved.body.save.bag, 'mage'), 3, '직업이 달라도 장비는 모두 40칸에 센다(무기와 같은 규칙)');
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
