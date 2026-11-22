import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { orderedBagItems, bagStacks, bagKindRank, statBookRank } = await import('../src/ui/bagStacks.ts');

const pouch = id => ({ id, name: '무작위 보물 주머니', slot: 'pouch', kind: 'pouch', rarity: 'unique', stats: {} });
const book = (id, kind = 'attack', rarity = 'unique') => ({ id, name: { attack: '공격의 서', defense: '방어의 서', health: '체력의 서' }[kind], slot: 'statbook', kind: 'statbook', book: kind, rarity, stats: {} });
const gear = (id, rarity = 'rare', slot = 'weapon') => ({ id, name: id, slot, rarity, stats: { attack: 10 } });

test('가방은 보물 주머니 → 장비 → 영구 스탯북 3단 순서를 등급순과 상관없이 지킨다(작업 247 → 파트 B)', () => {
  const items = [book('b-attack', 'attack', 'legendary'), gear('sword', 'common'), pouch('p1'), gear('helm', 'legendary', 'helmet')];
  assert.equal(bagKindRank(pouch('x')), 0);
  assert.equal(bagKindRank(gear('x')), 1);
  assert.equal(bagKindRank(book('x', 'attack')), 2);
  // 등급순을 켜도 주머니가 첫 칸이고 스탯북은 장비 뒤에 남는다.
  assert.deepEqual(orderedBagItems(items, true, 'warrior').map(item => item.id), ['p1', 'helm', 'sword', 'b-attack']);
  // 등급순을 끄면 같은 단 안에서는 원래 차례(안정 정렬)를 지킨다.
  assert.deepEqual(orderedBagItems(items, false, 'warrior').map(item => item.id), ['p1', 'sword', 'helm', 'b-attack']);
  assert.deepEqual(orderedBagItems(items, true, 'warrior').length, items.length);
});

test('스탯북은 공격 → 방어 → 체력 고정 순서로 묶는다(파트 B — 직업 구분 없음)', () => {
  const items = [book('b-health', 'health'), book('b-defense', 'defense'), book('b-attack', 'attack')];
  assert.deepEqual(orderedBagItems(items, false, 'warrior').map(item => item.id), ['b-attack', 'b-defense', 'b-health']);
  // 직업은 순서에 영향을 주지 않는다(스탯북은 세 직업 공용 소모품).
  assert.deepEqual(orderedBagItems(items, false, 'mage').map(item => item.id), ['b-attack', 'b-defense', 'b-health']);
  assert.ok(statBookRank(book('b-attack', 'attack')) < statBookRank(book('b-health', 'health')));
  assert.deepEqual(orderedBagItems([...items, pouch('p1'), gear('sword')], true, 'warrior').map(item => item.id),
    ['p1', 'sword', 'b-attack', 'b-defense', 'b-health']);
});

test('같은 스탯북·같은 주머니는 한 칸 ×N, 장비는 묶지 않는다', () => {
  const items = [book('b1', 'attack'), gear('sword1'), book('b2', 'attack'), pouch('p1'), pouch('p2'), book('b3', 'defense')];
  const stacks = bagStacks(items);
  assert.equal(stacks.length, 4);
  assert.deepEqual(stacks.map(stack => [stack.item.id, stack.count]), [['b1', 2], ['sword1', 1], ['p1', 2], ['b3', 1]]);
  // 묶음의 대표 id는 그 묶음의 첫 아이템이다 — 등록·사용은 이 id로 나간다.
  assert.equal(stacks[0].item.id, 'b1');
});
