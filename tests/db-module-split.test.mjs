import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as facade from '../server/database.mjs';
import * as errors from '../server/db/errors.mjs';
import * as connection from '../server/db/connection.mjs';
import * as schemaModule from '../server/db/schema.mjs';
import * as accounts from '../server/db/accounts.mjs';
import * as items from '../server/db/items.mjs';
import * as save from '../server/db/save.mjs';

/**
 * `server/database.mjs` 5분할(작업 260)의 **계약 보존** 검사.
 *
 * 서버 16개 모듈과 테스트 28개가 `../server/database.mjs`에서 이름을 가져다 쓴다. 그래서 이 PR은
 *  - export 이름 집합을 그대로 둔다(빠지면 다른 모듈이 import 단계에서 죽는다)
 *  - 파사드는 **같은 함수 객체**를 re-export한다(복사본을 만들면 `instanceof ApiError` 같은 판정이 갈라진다)
 *  - `server/database.mjs`에는 SQL이 남지 않는다(다시 한 덩어리로 자라지 않게)
 * 를 테스트로 고정한다.
 */

const root = fileURLToPath(new URL('..', import.meta.url));

/** 분리 전 `server/database.mjs`가 export하던 이름 — 하나라도 줄면 계약 위반이다. */
const CONTRACT = [
  'ApiError', 'EQUIPMENT_BAG_LIMIT', 'MARKET_SORT_STATS', 'MAX_FLOOR', 'account', 'accountQuery',
  'assertRevision', 'assertSession', 'assertSessionId', 'assignSession', 'bagCapacityLimit', 'client',
  'countedBagItems', 'decodeAccount', 'fail', 'healStaleLoadItems', 'inventoryOwnerQuery',
  'marketSortIndexStatements', 'marketStatExpression', 'reconcileItems', 'schema', 'sessionReplaced',
  'transaction', 'validateSave', 'writeSave'
].sort();

test('파사드의 export 이름이 분리 전과 같다', () => {
  assert.deepEqual(Object.keys(facade).sort(), CONTRACT);
});

test('파사드는 구현 모듈의 같은 객체를 re-export한다(복사본이 아니다)', () => {
  assert.equal(facade.ApiError, errors.ApiError);
  assert.equal(facade.fail, errors.fail);
  assert.equal(facade.client, connection.client);
  assert.equal(facade.schema, connection.schema);
  assert.equal(facade.transaction, connection.transaction);
  assert.equal(facade.marketStatExpression, schemaModule.marketStatExpression);
  assert.equal(facade.MARKET_SORT_STATS, schemaModule.MARKET_SORT_STATS);
  assert.equal(facade.marketSortIndexStatements, schemaModule.marketSortIndexStatements);
  assert.equal(facade.account, accounts.account);
  assert.equal(facade.accountQuery, accounts.accountQuery);
  assert.equal(facade.decodeAccount, accounts.decodeAccount);
  assert.equal(facade.assertRevision, accounts.assertRevision);
  assert.equal(facade.reconcileItems, items.reconcileItems);
  assert.equal(facade.healStaleLoadItems, items.healStaleLoadItems);
  assert.equal(facade.bagCapacityLimit, items.bagCapacityLimit);
  assert.equal(facade.writeSave, save.writeSave);
  assert.equal(facade.MAX_FLOOR, save.MAX_FLOOR);
});

test('도메인 모듈마다 책임이 한 곳에만 있다', () => {
  // 같은 이름이 두 모듈에 있으면 어느 쪽이 진짜인지 갈라진다.
  const exported = module => Object.keys(module).sort();
  assert.deepEqual(exported(errors), ['ApiError', 'fail']);
  assert.deepEqual(exported(connection), ['client', 'schema', 'transaction', 'transientDatabaseError']);
  assert.deepEqual(exported(accounts), ['account', 'accountQuery', 'assertRevision', 'assertSession', 'assertSessionId', 'assignSession', 'decodeAccount', 'sessionReplaced']);
  assert.deepEqual(exported(items), ['EQUIPMENT_BAG_LIMIT', 'bagCapacityLimit', 'countedBagItems', 'healStaleLoadItems', 'inventoryOwnerQuery', 'itemsOf', 'reconcileItems']);
  assert.deepEqual(exported(save), ['MAX_FLOOR', 'validateSave', 'writeSave']);
});

test('server/database.mjs에는 SQL이 남아 있지 않다', () => {
  const text = readFileSync(`${root}server/database.mjs`, 'utf8');
  // 주석을 걷어낸 코드에만 SQL이 없는지 본다(설명에는 "re-export"·"SELECT\" 같은 단어가 나올 수 있다).
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '');
  assert.doesNotMatch(code, /CREATE TABLE|CREATE INDEX|ALTER TABLE/);
  assert.doesNotMatch(code, /SELECT |UPDATE |DELETE FROM|INSERT INTO/);
  assert.ok(text.split('\n').length < 80, '파사드는 80줄 미만이어야 한다');
});

test('오류 코드 계약은 그대로다', () => {
  // DB가 설정되지 않은 환경에서의 client()는 503 DB_NOT_CONFIGURED.
  try {
    facade.client({});
    assert.fail('client()가 오류를 던지지 않았다');
  } catch (error) {
    assert.ok(error instanceof facade.ApiError, '파사드에서 본 ApiError와 같은 클래스여야 한다');
    assert.ok(error instanceof errors.ApiError);
    assert.equal(error.status, 503);
    assert.equal(error.code, 'DB_NOT_CONFIGURED');
  }
  assert.throws(() => facade.validateSave({ version: 2 }), error => error instanceof facade.ApiError && error.status === 400 && error.code === 'INVALID_SAVE');
  assert.throws(() => facade.validateSave(null), /저장 데이터 형식/);
  // 단일 세션: 세션 번호가 없는 예전 행은 통과, 다른 번호는 401 SESSION_REPLACED.
  assert.equal(facade.assertSession({ session_id: null }, 'anything'), undefined);
  assert.throws(() => facade.assertSession({ session_id: 'sid-a' }, 'sid-b'), error => error.status === 401 && error.code === 'SESSION_REPLACED');
  // revision: 정수가 아니거나 다르면 409 SAVE_CONFLICT.
  assert.throws(() => facade.assertRevision({ revision: 3 }, 2), error => error.status === 409 && error.code === 'SAVE_CONFLICT');
  assert.equal(facade.assertRevision({ revision: 3 }, 3), undefined);
  // 가방 40칸 규칙: 내 직업 스킬북은 세지 않고, 다른 직업 책·장비는 센다.
  const item = (slot, skillId) => ({ id: `${slot}-${skillId ?? ''}`, slot, kind: slot === 'skillbook' ? 'skillbook' : 'equipment', skillId });
  assert.equal(facade.countedBagItems([item('skillbook', 'slash2'), item('weapon')], 'warrior'), 1);
  assert.equal(facade.countedBagItems([item('skillbook', 'fireBolt'), item('weapon')], 'warrior'), 2);
  assert.equal(facade.bagCapacityLimit({ job: 'warrior', bag: [item('weapon')] }), 40);
  assert.equal(facade.bagCapacityLimit({ job: 'warrior', bag: Array.from({ length: 43 }, (_, index) => ({ ...item('weapon'), id: `w-${index}` })) }), 43, '이미 넘친 세이브는 그 수까지 인정한다(작업 246)');
});
