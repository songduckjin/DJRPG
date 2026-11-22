import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave, totalStats } = await import('../src/game/store.ts');
const { useAllReadySkillBooks } = await import('../src/ui/skillBooks.ts');

const book = (id, skillId) => ({ id, name: `[스킬북] ${skillId}`, slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId, stats: {} });
/** 작업 245 — 스킬북 `자동 강화`(함수 규칙). 화면의 `자동 강화` 버튼은 4단계 스킬 트리에서 빠졌다 — 스킬은 SP로 오른다. */

test('내 직업 스킬북으로 가능한 만큼 연속 습득·강화한다', () => {
  const save = freshSave('male', 'warrior');
  save.bag = [book('d1', 'destroy'), book('d2', 'destroy'), book('d3', 'destroy'), book('d4', 'destroy')];
  const result = useAllReadySkillBooks(save);
  // 필요 권수가 1권인 구간(레벨 0→4)이라 네 번 연속 오른다.
  assert.equal(result.used, 4);
  assert.equal(save.skillLevels.destroy, 4);
  assert(save.learned.includes('destroy'), '미습득 스킬은 습득부터');
  assert.equal(save.bag.length, 0, '쓴 책은 사라진다');
  assert.deepEqual(result.upgrades.map(entry => entry.level), [1, 2, 3, 4]);
  assert.equal(result.upgrades[0].name, '디스트로이 스윙');
});

test('다른 직업 스킬북·권수 부족·최대 레벨 스킬은 건드리지 않는다', () => {
  const save = freshSave('male', 'warrior');
  save.skillLevels = { slam: 5, hell: 30 };
  save.learned = ['slam', 'hell'];
  save.bag = [
    book('own', 'power'),
    book('foreign-archer', 'doubleShot'),
    book('foreign-mage', 'fireBolt'),
    book('short', 'slam'),            // 레벨 5 → 다음 레벨 필요 2권인데 1권뿐
    book('maxed', 'hell'), book('maxed2', 'hell')
  ];
  const result = useAllReadySkillBooks(save);
  assert.equal(result.used, 1, '내 직업이면서 바로 쓸 수 있는 책만');
  assert.equal(save.skillLevels.power, 1);
  const left = save.bag.map(item => item.id).sort();
  assert.deepEqual(left, ['foreign-archer', 'foreign-mage', 'maxed', 'maxed2', 'short']);
  assert.equal(save.skillLevels.slam, 5);
  assert.equal(save.skillLevels.hell, 30);
  assert.equal(save.learned.includes('doubleShot'), false);
  assert.equal(save.learned.includes('fireBolt'), false);
});

test('쓸 수 있는 책이 없으면 아무것도 바꾸지 않는다', () => {
  const save = freshSave('male', 'mage');
  save.bag = [book('foreign', 'slash2')];
  const before = JSON.stringify(save);
  const result = useAllReadySkillBooks(save);
  assert.equal(result.used, 0);
  assert.deepEqual(result.upgrades, []);
  assert.equal(JSON.stringify(save), before);
});

test('패시브 스킬북도 자동 강화 대상이다(최대 체력 +15%)', () => {
  const save = freshSave('male', 'warrior');
  save.bag = [book('body1', 'body')];
  const before = totalStats(save).health;
  const result = useAllReadySkillBooks(save);
  assert.equal(result.used, 1);
  assert(save.passives.includes('body'));
  assert(totalStats(save).health > before, '강인한 육체 Lv.1은 최대 HP를 올린다');
});
