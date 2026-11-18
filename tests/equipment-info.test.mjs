import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import './ts-loader.mjs';

const { equipmentInfoSlots, equipmentInfoStats } = await import('../src/ui/modals/equipModal.ts');
const interfaceSource = readFileSync(new URL('../src/ui/interface.ts', import.meta.url), 'utf8');
const accountSource = readFileSync(new URL('../src/ui/modals/accountModal.ts', import.meta.url), 'utf8');
const modalStyles = readFileSync(new URL('../src/styles/modals.css', import.meta.url), 'utf8');

test('bottom navigation contains only the unified info, skills, and market tabs', () => {
  const nav = interfaceSource.match(/<nav class="bottom-nav"[^>]*>(.*?)<\/nav>/)?.[1];
  assert(nav, 'bottom navigation template exists');
  assert.deepEqual([...nav.matchAll(/<button data-modal="([^"]+)"/g)].map(match => match[1]), ['equipment', 'skills', 'market']);
  assert.match(nav, /data-modal="equipment" type="button" aria-label="내 정보" title="내 정보"/);
  assert.doesNotMatch(interfaceSource, /\brenderCharacter\b|statusModal|openModal === 'status'|status: '내 상태'/);
  assert.equal(existsSync(new URL('../src/ui/modals/statusModal.ts', import.meta.url)), false);
});

test('gender is fixed after character creation and gender switch UI is removed', () => {
  assert.doesNotMatch(accountSource, /account-gender|save\.gender\s*=/);
  assert.doesNotMatch(modalStyles, /gender-switch|account-gender|status-modal/);
});

test('info modal exposes six required stats and the ten equipment slots in two row order', () => {
  assert.deepEqual(equipmentInfoStats, ['전투력', 'HP', '공격력', '방어력', '치명타', '공격속도']);
  assert.deepEqual(equipmentInfoSlots, ['weapon', 'helmet', 'armor', 'gloves', 'boots', 'offhand', 'necklace', 'belt', 'ring1', 'ring2']);
});
