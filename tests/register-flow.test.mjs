import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { accountEndpoint } from '../server/endpoints/account.mjs';
// `characters` 응답이 세이브에서 전투력을 계산하며 게임 모듈(`src/game/*.ts`)을 동적으로 읽는다(백로그 11·B안) —
// 테스트 러너에서 확장자 없는 내부 import까지 풀리도록 TS 훅을 먼저 등록한다.
import './ts-loader.mjs';

const post = (body, token) => new Request('https://example.test/api/account', {
  method: 'POST',
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  body: JSON.stringify(body)
});

/**
 * 신규 가입 → 캐릭터 생성 분리(작업 216).
 *
 * 가입 단계는 아이디·비밀번호만 받고 캐릭터를 만들지 않는다(목록 0개, `needsCharacter`).
 * 캐릭터 생성 화면에서 닉네임·직업·성별을 정해 첫 캐릭터를 만들고 나서야 사냥터로 들어간다.
 * 기존 계정 로그인과 `게스트로 시작하기`는 종전 그대로 1번 슬롯 캐릭터와 함께 바로 입장한다.
 */
test('가입은 아이디·비밀번호만 — 캐릭터 0개로 시작해 생성 화면을 거쳐 입장한다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-register-'));
  const env = { TURSO_DATABASE_URL: `file:${join(directory, 'register.db')}`, TURSO_AUTH_TOKEN: 'local-register-key' };
  const options = { env, createDbClient: ({ TURSO_DATABASE_URL }) => createClient({ url: TURSO_DATABASE_URL }) };
  const call = async (body, token) => {
    const response = await accountEndpoint(post(body, token), options);
    return { status: response.status, body: await response.json() };
  };
  try {
    // ① 가입 — 성별·직업을 보내지 않아도 된다.
    const registered = await call({ action: 'register', loginId: '새모험가', password: 'test-password-216' });
    assert.equal(registered.status, 200, JSON.stringify(registered.body));
    assert.equal(registered.body.needsCharacter, true, '가입 직후에는 캐릭터 생성이 필요하다');
    assert.equal(registered.body.characterSlot, 1);
    const token = registered.body.token;

    // ② 목록은 비어 있고(자리표시자는 캐릭터가 아니다), 접속은 생성 화면으로 안내한다.
    const list = await call({ action: 'characters' }, token);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.characters, [], '가입 직후 캐릭터는 0개다');
    const load = await call({ action: 'load' }, token);
    assert.equal(load.status, 200);
    assert.equal(load.body.needsCharacter, true, '새로고침해도 생성 화면으로 간다');

    // ③ 자리표시자에는 세이브를 받지 않는다(캐릭터 생성이 먼저).
    const earlySave = await call({ action: 'save', save: registered.body.save, revision: 0, characterSlot: 1 }, token);
    assert.equal(earlySave.status, 409);
    assert.equal(earlySave.body.code, 'CHARACTER_REQUIRED');

    // ④ 생성 화면에서 정한 닉네임·직업·성별로 첫 캐릭터를 만든다 — 자리표시자를 덮어쓴다.
    const created = await call({ action: 'createCharacter', slot: 1, name: '덕진', gender: 'female', job: 'mage', revision: 0 }, token);
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.equal(created.body.save.name, '덕진');
    assert.equal(created.body.save.gender, 'female');
    assert.equal(created.body.save.job, 'mage');
    assert.equal(created.body.save.uncreated, undefined, '만들고 나면 자리표시자가 아니다');
    assert.equal(created.body.revision, 1);
    const after = await call({ action: 'characters' }, token);
    assert.deepEqual(after.body.characters.map(entry => [entry.slot, entry.name, entry.gender, entry.job]), [[1, '덕진', 'female', 'mage']]);
    const reloaded = await call({ action: 'load' }, token);
    assert.equal(reloaded.body.needsCharacter, undefined, '캐릭터를 만들었으면 사냥터로 바로 들어간다');

    // ⑤ 그 뒤로는 종전과 똑같이 저장·로그인이 된다.
    const saved = await call({ action: 'save', save: { ...created.body.save, gold: 42 }, revision: created.body.revision, characterSlot: 1 }, token);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.save.gold, 42);
    const login = await call({ action: 'login', loginId: '새모험가', password: 'test-password-216' });
    assert.equal(login.status, 200);
    assert.equal(login.body.needsCharacter, undefined);
    assert.equal(login.body.save.gold, 42);
    assert.equal(login.body.save.name, '덕진');
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('게스트와 예전 가입 요청(성별·직업 포함)은 종전 그대로 바로 입장한다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-register-legacy-'));
  const env = { TURSO_DATABASE_URL: `file:${join(directory, 'legacy.db')}`, TURSO_AUTH_TOKEN: 'local-register-key' };
  const options = { env, createDbClient: ({ TURSO_DATABASE_URL }) => createClient({ url: TURSO_DATABASE_URL }) };
  const call = async (body, token) => {
    const response = await accountEndpoint(post(body, token), options);
    return { status: response.status, body: await response.json() };
  };
  try {
    const guest = await call({ action: 'guest' });
    assert.equal(guest.status, 200);
    assert.equal(guest.body.needsCharacter, undefined, '게스트는 바로 1번 캐릭터로 입장한다');
    assert.equal(guest.body.save.name, '모험가');
    const guestList = await call({ action: 'characters' }, guest.body.token);
    assert.equal(guestList.body.characters.length, 1, '게스트 캐릭터는 목록에 그대로 있다');

    // 예전 클라이언트처럼 gender·job을 함께 보내는 가입도 받아 준다(가입 자체는 여전히 캐릭터 0개).
    const legacyStyle = await call({ action: 'register', loginId: 'legacy216', password: 'test-password-216', gender: 'female', job: 'archer' });
    assert.equal(legacyStyle.status, 200);
    assert.equal(legacyStyle.body.needsCharacter, true);
    assert.equal(legacyStyle.body.save.gender, 'female');
    assert.equal(legacyStyle.body.save.job, 'archer');
    const built = await call({ action: 'createCharacter', slot: 1, name: '레거시', gender: 'male', job: 'warrior', revision: 0 }, legacyStyle.body.token);
    assert.equal(built.status, 200);
    assert.equal(built.body.save.name, '레거시');
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test('가입 검증: 아이디 규칙·비밀번호 길이는 그대로 본다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'djrpg-register-invalid-'));
  const env = { TURSO_DATABASE_URL: `file:${join(directory, 'invalid.db')}`, TURSO_AUTH_TOKEN: 'local-register-key' };
  const options = { env, createDbClient: ({ TURSO_DATABASE_URL }) => createClient({ url: TURSO_DATABASE_URL }) };
  const call = async body => {
    const response = await accountEndpoint(post(body), options);
    return { status: response.status, body: await response.json() };
  };
  try {
    for (const body of [
      { action: 'register', loginId: 'a', password: 'test-password-216' },
      { action: 'register', loginId: 'bad id!', password: 'test-password-216' },
      { action: 'register', loginId: 'ok216', password: 'short' }
    ]) {
      const result = await call(body);
      assert.equal(result.status, 400, JSON.stringify(body));
      assert.equal(result.body.code, 'INVALID_ACCOUNT');
    }
    const ok = await call({ action: 'register', loginId: 'ok216', password: 'test-password-216' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.needsCharacter, true);
  } finally {
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
