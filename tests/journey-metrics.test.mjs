import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { schema } from '../server/database.mjs';
import { periods } from '../server/journey-state.mjs';

const { worldBossOperation } = await import('../server/world-boss.mjs');
const { freshSave, parseSave } = await import('../src/game/store.ts');
const { salvageItems, autoSalvageRecovered } = await import('../src/game/inventory.ts');
const { salvageByRarity } = await import('../src/game/items.ts');

/** 월드보스 도전·장비 분해가 일일·주간 미션 카운터에 쌓이는지 (작업 207). */
test('월드보스 도전은 일일·주간 `월드보스 도전` 카운터에 1회로 기록되고 재시도로 늘지 않는다', async () => {
  const db = createClient({ url: 'file::memory:' });
  await schema(db);
  const id = 'mission-boss', now = Date.parse('2026-11-20T10:00:00Z');
  await db.execute({ sql: 'INSERT INTO djrpg_accounts(id,password_hash,save_json,updated_at) VALUES (?,?,?,?)', args: [id, 'hash', JSON.stringify(parseSave({ ...freshSave('male'), name: id, level: 7 }, id)), new Date(now).toISOString()] });
  const start = (requestId = randomUUID(), time = now) => worldBossOperation(db, id, { action: 'start', requestId, characterSlot: 1 }, undefined, time);
  const key = randomUUID();
  await start(key); await start(key);
  const read = async () => JSON.parse((await db.execute({ sql: 'SELECT state_json FROM djrpg_journey WHERE account_id=?', args: [id] })).rows[0].state_json);
  let state = await read();
  assert.equal(state.daily.worldBoss, 1, '도전 1회 — 같은 requestId 재시도는 세지 않는다');
  assert.equal(state.weekly.worldBoss, 1);
  // 다음 날 한 번 더 → 일일은 새 기간에서 1, 주간은 2.
  await start(randomUUID(), periods(now).dailyEnd + 1000);
  state = await read();
  assert.equal(state.daily.worldBoss, 1, '새 날의 첫 도전');
  assert.equal(state.weekly.worldBoss, 2, '주간은 이어진다');
  await db.close();
});

test('장비 분해(수동·일괄·자동)는 분해한 장비 수만큼 salvageCount를 올린다', () => {
  const save = freshSave();
  const gear = index => ({ id: `g${index}`, name: '두손검', slot: 'weapon', rarity: 'common', stats: { attack: 1 }, plus: 0 });
  save.bag = [gear(1), gear(2), gear(3)];
  assert.equal(save.salvageCount, 0);
  const manual = salvageItems(save, ['g1', 'g2']);
  assert.equal(manual.count, 2);
  assert.equal(save.salvageCount, 2, '수동 일괄 분해 2벌');
  // 자동 분해는 빈 슬롯·더 좋은 장비를 지킨다 — 장착한 강한 무기보다 약한 장비만 삼킨다.
  save.equipment.weapon = { id: 'worn', name: '영원의 두손검', slot: 'weapon', rarity: 'legendary', stats: { attack: 999 }, plus: 0 };
  const swept = autoSalvageRecovered(save, gear(4), 'unique');
  assert.deepEqual(swept, { gold: 3, stones: 1 }, '가방에 넣지 않고 바로 분해');
  assert.equal(save.salvageCount, 3, '자동 분해 1벌');
  // 가방에는 g3 하나만 남아 있다 — 등급 일괄 분해가 그것까지 삼킨다.
  save.bag.push(gear(5), gear(6));
  const bulk = salvageByRarity(save, 'unique');
  assert.equal(bulk.count, 3);
  assert.equal(save.salvageCount, 6, '등급 일괄 분해도 벌 수만큼');
  // 파싱해도 값이 남는다(옛 세이브는 0).
  assert.equal(parseSave({ ...save, salvageCount: 7 }).salvageCount, 7);
  const legacy = { ...save }; delete legacy.salvageCount;
  assert.equal(parseSave(legacy).salvageCount, 0);
});
