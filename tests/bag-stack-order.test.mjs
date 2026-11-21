import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { orderedBagItems, bagStacks, bagKindRank, skillBookJobRank } = await import('../src/ui/bagStacks.ts');

const pouch = id => ({ id, name: '무작위 보물 주머니', slot: 'pouch', kind: 'pouch', rarity: 'unique', stats: {} });
const book = (id, skillId, rarity = 'rare') => ({ id, name: `[스킬북] ${skillId}`, slot: 'skillbook', kind: 'skillbook', skillId, rarity, stats: {} });
const gear = (id, rarity = 'rare', slot = 'weapon') => ({ id, name: id, slot, rarity, stats: { attack: 10 } });

test('가방은 보물 주머니 → 장비 → 스킬북 3단 순서를 등급순과 상관없이 지킨다(작업 247)', () => {
  const items = [book('w-spin', 'spin', 'legendary'), gear('sword', 'common'), pouch('p1'), gear('helm', 'legendary', 'helmet')];
  assert.equal(bagKindRank(pouch('x')), 0);
  assert.equal(bagKindRank(gear('x')), 1);
  assert.equal(bagKindRank(book('x', 'spin')), 2);
  // 등급순을 켜도 주머니가 첫 칸이고 스킬북은 장비 뒤에 남는다.
  assert.deepEqual(orderedBagItems(items, true, 'warrior').map(item => item.id), ['p1', 'helm', 'sword', 'w-spin']);
  // 등급순을 끄면 같은 단 안에서는 원래 차례(안정 정렬)를 지킨다.
  assert.deepEqual(orderedBagItems(items, false, 'warrior').map(item => item.id), ['p1', 'sword', 'helm', 'w-spin']);
  assert.deepEqual(orderedBagItems(items, true, 'warrior').length, items.length);
});

test('스킬북은 내 직업 → 전사 → 궁수 → 마법사 순으로 직업별로 묶는다(작업 247)', () => {
  const items = [book('m-fire', 'fireBolt'), book('a-shot', 'doubleShot'), book('w-spin', 'spin'), book('w-slam', 'slam')];
  // 내 직업이 궁수면 궁수 책이 먼저, 그다음 전사 → 마법사(전사·마법사 사이의 고정 순서).
  assert.deepEqual(orderedBagItems(items, false, 'archer').map(item => item.id), ['a-shot', 'w-slam', 'w-spin', 'm-fire']);
  // 내 직업이 마법사면 마법사 책이 먼저, 그다음 전사 → 궁수.
  assert.deepEqual(orderedBagItems(items, false, 'mage').map(item => item.id), ['m-fire', 'w-slam', 'w-spin', 'a-shot']);
  // 전사는 스킬 표 순서(스탬프 → 용오름)를 따른다 — 같은 직업 안에서 결정적이다.
  assert.ok(skillBookJobRank(book('w-spin', 'spin'), 'warrior') < skillBookJobRank(book('a-shot', 'doubleShot'), 'warrior'));
  assert.deepEqual(orderedBagItems([...items, pouch('p1'), gear('sword')], true, 'warrior').map(item => item.id),
    ['p1', 'sword', 'w-slam', 'w-spin', 'a-shot', 'm-fire']);
});

test('같은 스킬북·같은 주머니는 한 칸 ×N, 장비는 묶지 않는다', () => {
  const items = [book('b1', 'spin'), gear('sword1'), book('b2', 'spin'), pouch('p1'), pouch('p2')];
  const stacks = bagStacks(items);
  assert.equal(stacks.length, 3);
  assert.deepEqual(stacks.map(stack => [stack.item.id, stack.count]), [['b1', 2], ['sword1', 1], ['p1', 2]]);
  // 묶음의 대표 id는 그 묶음의 첫 아이템이다 — 등록·사용은 이 id로 나간다.
  assert.equal(stacks[0].item.id, 'b1');
});
