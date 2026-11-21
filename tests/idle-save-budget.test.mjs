import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { accountEndpoint } from '../server/endpoints/account.mjs';

/**
 * 캐릭터 전환 직후 방치 보상 저장 (작업 252 핫픽스).
 *
 * 사용자 제보: "캐릭터 전환 직후 방치 보상 팝업에는 템이 있었는데 확인하고 가방 여니 아예 0개였다".
 *
 * `selectCharacter`는 다른 슬롯으로 넘어갈 때 그 캐릭터의 방치 시간을 `djrpg_shop_entitlements`의
 * `idle_claim_${slot}`에 옮겨 두고 `djrpg_characters.updated_at`을 **전환 시각**으로 덮는다. 그 직후
 * 클라이언트가 `applyOfflineRewards`로 4~12시간 방치분(아이템·금화·경험치·처치)을 세이브에 넣어
 * `save`를 보내면, 서버가 `elapsedSeconds: elapsedSince(character_updated_at)`만 넘겨 **0초**로 계산해
 * 정당한 보상을 잘라 내거나 거절했다. 이제 같은 트랜잭션에서 `idle_claim_${slot}`의 초를 더해 판정한다.
 */

const post = (body, token) => new Request('https://example.test/api/account', {
  method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body)
});
const gear = () => ({ id: randomUUID(), name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 2 }, plus: 0 });

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-idle-save-'));
  const env = { TURSO_DATABASE_URL: `file:${join(directory, 'idle.db')}`, TURSO_AUTH_TOKEN: 'local-idle-key' };
  const options = { env, createDbClient: ({ TURSO_DATABASE_URL }) => createClient({ url: TURSO_DATABASE_URL }) };
  const call = async (body, token) => {
    const response = await accountEndpoint(post(body, token), options);
    return { status: response.status, body: await response.json() };
  };
  const registered = await call({ action: 'register', loginId: '방치보상', password: 'test-password-252' });
  assert.equal(registered.status, 200, JSON.stringify(registered.body));
  const token = registered.body.token;
  const first = await call({ action: 'createCharacter', slot: 1, name: '첫째', gender: 'male', job: 'warrior', revision: 0 }, token);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const second = await call({ action: 'createCharacter', slot: 2, name: '둘째', gender: 'male', job: 'warrior', revision: first.body.revision }, token);
  assert.equal(second.status, 200, JSON.stringify(second.body));
  const db = createClient({ url: env.TURSO_DATABASE_URL });
  return { directory, db, call, token, revision: second.body.revision };
}

test('캐릭터 전환 직후 방치 보상(아이템·금화·처치)은 상한에 잘리지 않고 저장된다 (작업 252)', async () => {
  const { directory, db, call, token, revision } = await setup();
  try {
    // 슬롯 1 캐릭터가 2시간 방치돼 있고(지금은 슬롯 2가 선택된 상태), 전 슬롯 방치 30일권이 살아 있다.
    // `createCharacter`는 만든 슬롯을 바로 선택하므로, 방치된 슬롯으로 **되돌아오는** 전환이 이 시나리오다.
    const twoHoursAgo = new Date(Date.now() - 7_200_000).toISOString();
    await db.execute({ sql: 'UPDATE djrpg_characters SET updated_at=? WHERE account_id=? AND slot=1', args: [twoHoursAgo, '방치보상'] });
    await db.execute({ sql: 'INSERT INTO djrpg_shop_entitlements(account_id,entitlement_key,quantity,expires_at,updated_at) VALUES (?,?,0,?,?) ON CONFLICT(account_id,entitlement_key) DO UPDATE SET expires_at=excluded.expires_at',
      args: ['방치보상', 'all_idle_30d', Date.now() + 30 * 86_400_000, Date.now()] });

    // 전환 — 그 자리에서 방치 초를 `idle_claim_2`에 옮기고 `updated_at`을 전환 시각으로 덮는다.
    const selected = await call({ action: 'selectCharacter', slot: 1, revision }, token);
    assert.equal(selected.status, 200, JSON.stringify(selected.body));
    assert(selected.body.offlineSeconds >= 7190, `전환 응답이 방치 초를 알려 준다 (${selected.body.offlineSeconds})`);
    const claim = (await db.execute({ sql: 'SELECT quantity FROM djrpg_shop_entitlements WHERE account_id=? AND entitlement_key=?', args: ['방치보상', 'idle_claim_1'] })).rows[0];
    assert(claim && Number(claim.quantity) >= 7190, '방치 초가 idle_claim_1에 남아 있다');
    const switchedAt = (await db.execute({ sql: 'SELECT updated_at FROM djrpg_characters WHERE account_id=? AND slot=1', args: ['방치보상'] })).rows[0].updated_at;
    assert(Date.now() - Date.parse(String(switchedAt)) < 10_000, '전환 시각으로 덮여 elapsedSince는 0초가 된다(버그의 원인)');

    // 클라이언트: 방치 보상 12개 아이템 + 금화 5,000 + 처치 1,200 + 2시간 플레이를 세이브에 넣고 저장한다.
    const save = structuredClone(selected.body.save);
    const items = Array.from({ length: 12 }, gear);
    save.bag = [...(save.bag ?? []), ...items];
    save.gold = Number(save.gold ?? 0) + 5_000;
    save.kills = Number(save.kills ?? 0) + 1_200;
    save.playSeconds = Number(save.playSeconds ?? 0) + 7_200;
    const saved = await call({ action: 'save', save, revision: selected.body.revision, characterSlot: 1, requestId: randomUUID() }, token);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(Number(saved.body.save.gold), 5_000, '방치 금화가 잘리지 않는다');
    assert.equal(Number(saved.body.save.kills), 1_200, '방치 처치 수가 잘리지 않는다');
    assert.equal(Number(saved.body.save.playSeconds), 7_200, '방치 플레이 시간이 잘리지 않는다');
    assert.equal((saved.body.save.bag ?? []).length, 12, '방치 아이템 12개가 가방에 그대로 들어간다');
    assert.deepEqual(saved.body.clamped ?? [], [], '아무 값도 잘리지 않는다');

    // 저장이 끝나면 대기 중인 방치 초는 지워진다 — 두 번째 저장은 다시 0초 기준으로 판정된다.
    const left = (await db.execute({ sql: 'SELECT quantity FROM djrpg_shop_entitlements WHERE account_id=? AND entitlement_key=?', args: ['방치보상', 'idle_claim_1'] })).rows;
    assert.equal(left.length, 0, '정산 저장 뒤에는 대기 중인 방치 보상이 지워진다');
  } finally { await db.close(); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
