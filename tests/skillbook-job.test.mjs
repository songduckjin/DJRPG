import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave, useSkillBook, skillLevel } = await import('../src/game/store.ts');
const { skillBookJob, rollSkillBook } = await import('../src/game/items.ts');

const book = (id, skillId) => ({ id, name: `[스킬북] ${skillId}`, slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId, stats: {} });

test('다른 직업의 스킬북은 사용되지 않고 소모되지도 않는다', () => {
  for (const [job, own, foreign, message] of [
    ['warrior', 'slash2', 'doubleShot', '궁수 전용 스킬북입니다'],
    ['warrior', 'slash2', 'fireBolt', '마법사 전용 스킬북입니다'],
    ['archer', 'doubleShot', 'slash2', '전사 전용 스킬북입니다'],
    ['mage', 'fireBolt', 'doubleShot', '궁수 전용 스킬북입니다']
  ]) {
    const save = freshSave('male', job);
    save.bag = [book(`${job}-foreign`, foreign), book(`${job}-own`, own)];
    assert.equal(skillBookJob(save.bag[0]), foreign === 'slash2' ? 'warrior' : foreign === 'doubleShot' ? 'archer' : 'mage');
    const before = JSON.stringify(save);
    const refused = useSkillBook(save, `${job}-foreign`);
    assert.equal(refused.ok, false, `${job} 캐릭터는 ${foreign} 스킬북을 쓸 수 없다`);
    assert.equal(refused.message, message);
    assert.equal(JSON.stringify(save), before, '막힌 사용은 세이브를 건드리지 않는다');
    assert(save.bag.some(item => item.id === `${job}-foreign`), '책이 사라지지 않는다');
    assert.equal(save.learned.includes(foreign), false);
    assert.equal(save.passives.includes(foreign), false);
    // 같은 가방의 내 직업 책은 그대로 쓸 수 있다.
    const used = useSkillBook(save, `${job}-own`);
    assert.equal(used.ok, true, used.message);
    assert(save.learned.includes(own));
    assert.equal(save.bag.length, 1, '내 책만 소모된다');
    assert.equal(save.bag[0].id, `${job}-foreign`);
  }
});

test('직업을 고르지 않은 예전 세이브는 전사로 보고 전사 책을 쓴다', () => {
  const save = freshSave();
  delete save.job;
  save.bag = [book('old-warrior', 'slash2'), book('old-archer', 'doubleShot')];
  assert.equal(skillBookJob(save.bag[1]), 'archer');
  assert.equal(useSkillBook(save, 'old-archer').ok, false);
  assert.equal(useSkillBook(save, 'old-warrior').ok, true);
});

test('드롭된 스킬북은 세 직업 모두 나오고, 직업 이름이 그 책의 주인이다', () => {
  const originalRandom = Math.random;
  try {
    const owners = new Set();
    for (const value of [0, .34, .67, .99]) {
      Math.random = () => value;
      owners.add(skillBookJob(rollSkillBook(20)));
    }
    assert.deepEqual([...owners].sort(), ['archer', 'mage', 'warrior'], '전사·궁수·마법사 책이 모두 떨어진다');
  } finally { Math.random = originalRandom; }
});
