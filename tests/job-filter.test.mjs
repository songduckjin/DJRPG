import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { itemJob, skillBookJob, usableByJob, weaponJob, rollSkillBook } = await import('../src/game/items.ts');
const { jobOnlyVisible, jobOnlyHidden, jobOnlyLabel, readJobOnly, saveJobOnly, BAG_JOB_ONLY_KEY, MARKET_JOB_ONLY_KEY } = await import('../src/ui/jobFilter.ts');

const equipment = (slot, name) => ({ id: name, name, slot, rarity: 'rare', stats: {} });
const book = (skillId) => ({ id: skillId, name: `[스킬북] ${skillId}`, slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId, stats: {} });

test('a weapon belongs to the job that can swing it, and armour belongs to no one', () => {
  assert.equal(weaponJob(equipment('weapon', '패왕의 성검')), 'warrior');
  assert.equal(weaponJob(equipment('weapon', '룬 각궁')), 'archer');
  assert.equal(weaponJob(equipment('weapon', '대현자의 성지팡이')), 'mage');
  assert.equal(itemJob(equipment('weapon', '룬 각궁')), 'archer');
  assert.equal(itemJob(equipment('weapon', '대현자의 성지팡이')), 'mage');
  // 장갑·신발·문장·장신구는 공용이고, 투구·갑옷도 **옛 전사용 이름**은 공용으로 남는다(작업 249 호환).
  for (const slot of ['helmet', 'armor', 'gloves', 'belt', 'boots', 'necklace', 'ring1', 'ring2', 'offhand']) {
    assert.equal(itemJob(equipment(slot, '미스릴 아머')), undefined, `${slot} is not a job item`);
    assert.equal(usableByJob(equipment(slot, '미스릴 아머'), 'mage'), true);
  }
  // 새로 나뉜 궁수·마법사 투구·갑옷은 그 직업의 것이다.
  assert.equal(itemJob(equipment('helmet', '황혼의 미스릴 서클릿')), 'archer');
  assert.equal(itemJob(equipment('armor', '황혼의 룬 전투 법의')), 'mage');
  assert.equal(usableByJob(equipment('armor', '황혼의 룬 전투 법의'), 'mage'), true);
  assert.equal(usableByJob(equipment('armor', '황혼의 룬 전투 법의'), 'archer'), false);
  assert.equal(usableByJob(equipment('helmet', '황혼의 미스릴 서클릿'), 'warrior'), false);
});

test('a skill book names the job whose skill it teaches', () => {
  // 액티브·패시브 모두 `skillOrderFor`/`passiveOrderFor`로 판별한다.
  for (const [skillId, job] of [['spin', 'warrior'], ['doubleShot', 'archer'], ['fireBolt', 'mage'], ['body', 'warrior'], ['bowMastery', 'archer'], ['arcaneSense', 'mage']]) {
    assert.equal(skillBookJob(book(skillId)), job, `${skillId} should be ${job}`);
    assert.equal(itemJob(book(skillId)), job);
  }
  assert.equal(skillBookJob(equipment('weapon', '두손검')), undefined);
  assert.equal(itemJob(equipment('weapon', '두손검')), 'warrior');
  // 떨어지는 스킬북도 항상 세 직업 중 하나로 판별된다.
  for (let index = 0; index < 60; index++) {
    const dropped = rollSkillBook(10, 'warrior');
    assert.ok(['warrior', 'archer', 'mage'].includes(skillBookJob(dropped)), `${dropped.skillId} has no job`);
  }
});

test('usableByJob keeps my own job and shared gear, drops only the other jobs', () => {
  const archerBlade = equipment('weapon', '바람결 장궁');
  assert.equal(usableByJob(archerBlade, 'warrior'), false);
  assert.equal(usableByJob(archerBlade, 'archer'), true);
  assert.equal(usableByJob(book('meteorStrike'), 'warrior'), false);
  assert.equal(usableByJob(book('meteorStrike'), 'mage'), true);
  // 직업 값이 비어 있는 옛 세이브는 전사로 본다.
  assert.equal(usableByJob(equipment('weapon', '두손검'), undefined), true);
  assert.equal(usableByJob(archerBlade, undefined), false);
});

test('the 내 직업만 보기 filter hides only other-job items and says how many', () => {
  const entries = [
    { item: equipment('weapon', '패왕의 성검') },
    { item: equipment('weapon', '룬 각궁') },
    { item: book('fireBolt') },
    { item: equipment('armor', '용갑') },
    { gold: 120 }
  ];
  const itemOf = entry => entry.item;
  // 꺼져 있으면 목록 그대로(금화 줄까지).
  assert.deepEqual(jobOnlyVisible(entries, itemOf, 'archer', false), entries);
  assert.equal(jobOnlyHidden(entries, itemOf, 'archer', false), 0);
  // 켜면 궁수 활·공용 갑옷·아이템 없는 줄만 남는다.
  const archerView = jobOnlyVisible(entries, itemOf, 'archer', true);
  assert.deepEqual(archerView.map(entry => entry.item?.name ?? entry.gold), ['룬 각궁', '용갑', 120]);
  assert.equal(jobOnlyHidden(entries, itemOf, 'archer', true), 2);
  // 전사에게는 반대로 활·마법사 책만 빠진다.
  assert.deepEqual(jobOnlyVisible(entries, itemOf, 'warrior', true).map(entry => entry.item?.name ?? entry.gold), ['패왕의 성검', '용갑', 120]);
  // 원본 배열은 건드리지 않는다.
  assert.equal(entries.length, 5);
});

test('the switch is remembered per screen and defaults to showing everything', () => {
  const store = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) };
  try {
    assert.equal(readJobOnly(BAG_JOB_ONLY_KEY), false);
    saveJobOnly(BAG_JOB_ONLY_KEY, true);
    assert.equal(readJobOnly(BAG_JOB_ONLY_KEY), true);
    assert.equal(readJobOnly(MARKET_JOB_ONLY_KEY), false);
    saveJobOnly(MARKET_JOB_ONLY_KEY, true);
    saveJobOnly(BAG_JOB_ONLY_KEY, false);
    assert.equal(readJobOnly(BAG_JOB_ONLY_KEY), false);
    assert.equal(readJobOnly(MARKET_JOB_ONLY_KEY), true);
    assert.equal(jobOnlyLabel(true), '내 직업만 보기: 켬');
    assert.equal(jobOnlyLabel(false), '내 직업만 보기: 끔');
  } finally {
    globalThis.localStorage = previous;
  }
  // 저장이 막힌 환경(사생활 모드)에서도 예외 없이 기본값으로 돌아온다.
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  try {
    assert.equal(readJobOnly(BAG_JOB_ONLY_KEY), false);
    saveJobOnly(BAG_JOB_ONLY_KEY, true);
  } finally {
    globalThis.localStorage = previous;
  }
});
