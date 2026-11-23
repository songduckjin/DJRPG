import { test } from 'node:test';
import assert from 'node:assert/strict';
import './patch-buff-off.mjs';
import './ts-loader.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { equipDelta, isUpgradeForHero, isDowngradeForHero, autoEquipBest } = await import('../src/game/items.ts');
const { salvageUpgrades } = await import('../src/game/inventory.ts');
const { extraOptionValue } = await import('../src/game/extraOptions.ts');
const gear = (id, slot, stats, extraOptions) => ({ id, name: id, slot, rarity: extraOptions ? 'epic' : 'common', stats, ...(extraOptions ? { extraOptions } : {}) });

test('장비 교체의 실제 스탯 변화가 화살표와 분해 보호에 동일하게 반영된다', () => {
  const save = freshSave(); save.level = 100;
  save.equipment.weapon = gear('old', 'weapon', { attack: 10 });
  const candidate = gear('new', 'weapon', { attack: 9 }, { attackPct: 3 });
  const delta = equipDelta(save, candidate);
  assert(delta.stats.attack > 0);
  assert(delta.score > 0);
  assert.equal(isUpgradeForHero(save, candidate), true);
  assert.equal(isDowngradeForHero(save, candidate), false);
  assert.equal(salvageUpgrades(save, [candidate])[0].gain, delta.score);
});

test('자동 장착은 실효 변화가 최대인 장비를 고른다', () => {
  const save = freshSave(); save.level = 100;
  save.equipment.helmet = gear('old', 'helmet', { defense: 1 });
  const options = [gear('flat', 'helmet', { defense: 5 }), gear('percent', 'helmet', { defense: 2 }, { defensePct: 3 })];
  save.bag = options;
  const best = options.toSorted((a, b) => equipDelta(save, b).score - equipDelta(save, a).score)[0];
  autoEquipBest(save);
  assert.equal(save.equipment.helmet.id, best.id);
});

test('반지는 약한 칸을 대체하고 화살표가 동시에 켜지지 않는다', () => {
  const save = freshSave();
  save.equipment.ring1 = gear('strong', 'ring1', { attack: 30 });
  save.equipment.ring2 = gear('weak', 'ring2', { attack: 10 });
  const candidate = gear('candidate', 'ring1', { attack: 11 });
  assert.equal(equipDelta(save, candidate).equipped.id, 'weak');
  assert.equal(isUpgradeForHero(save, candidate) && isDowngradeForHero(save, candidate), false);
});

test('알 수 없는 추가옵션 키도 안전한 보수적 가치를 갖는다', () => {
  assert(extraOptionValue('critDamagePct', 2, { attack: 100, defense: 50, health: 500, crit: 10, speed: 5, cdr: 0 }) > 0);
});

test('치명·회피 추가옵션이 상한에 닿으면 더 높은 등급도 업그레이드가 아니다', () => {
  for (const key of ['critPct', 'evasionPct']) {
    const save = freshSave(); save.equipment = {};
    const slots = ['weapon', 'offhand', 'helmet', 'armor', 'necklace', 'gloves', 'belt', 'boots', 'ring1', 'ring2'];
    for (const slot of slots) save.equipment[slot] = gear(`${key}-${slot}`, slot, {}, { [key]: 3 });
    const candidate = gear(`${key}-candidate`, 'helmet', {}, { [key]: 3 });
    assert.equal(equipDelta(save, candidate).score, 0);
    assert.equal(isUpgradeForHero(save, candidate), false);
    assert.equal(isDowngradeForHero(save, candidate), false);
    assert(equipDelta(save, candidate).capped.includes(key));
  }
});
