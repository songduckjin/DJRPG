import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { autoEquipBest, baseItems, bowBases, canWield, dropJob, dropJobs, rollItem, rollSkillBook, staffBases, weaponJob } = await import('../src/game/items.ts');
const { autoSalvageBlock, salvageUpgrades } = await import('../src/game/inventory.ts');
const { archerPassiveOrder, archerSkillOrder, magePassiveOrder, mageSkillOrder, passiveOrder, skillOrder } = await import('../src/game/skills.ts');

const piece = (name, stats = { attack: 50 }, extra = {}) => ({ id: name, name, slot: 'weapon', rarity: 'epic', stats, ...extra });
const sword = (attack = 50) => piece('황혼의 아다만트 그레이트소드', { attack });
const bow = (attack = 50, extra = {}) => piece('황혼의 룬 각궁', { attack }, extra);
const staff = (attack = 50, extra = {}) => piece('황혼의 룬 지팡이', { attack }, extra);
const helmet = () => ({ id: 'h', name: '기사 헬름', slot: 'helmet', rarity: 'rare', stats: { defense: 9 } });

test('무기·스킬북은 세 직업이 1/3씩 같은 확률로 떨어지고, 확정 드롭만 내 직업이다', () => {
  // 사용자 확정(작업 204): "다른직업 장비나 스킬북도 동일확률로 뜰수있어".
  assert.deepEqual([...dropJobs], ['warrior', 'archer', 'mage']);
  assert.equal(dropJob(() => 0), 'warrior');
  assert.equal(dropJob(() => .5), 'archer');
  assert.equal(dropJob(() => .999), 'mage');
  assert.equal(dropJob(() => 1), 'mage', '경계값도 세 직업 안에 머문다');

  const pools = {
    warrior: [...skillOrder, ...passiveOrder],
    archer: [...archerSkillOrder, ...archerPassiveOrder],
    mage: [...mageSkillOrder, ...magePassiveOrder]
  };
  const original = Math.random;
  try {
    let state = 2042026;
    Math.random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    const samples = 3000, counts = { warrior: 0, archer: 0, mage: 0 };
    for (let index = 0; index < samples; index++) {
      const book = rollSkillBook(30);
      const owner = Object.keys(pools).find(job => pools[job].includes(book.skillId));
      assert(owner, `세 직업 스킬 목록에 없는 스킬북: ${book.skillId}`);
      counts[owner]++;
    }
    for (const [job, count] of Object.entries(counts)) assert(Math.abs(count / samples - 1 / 3) < .04, `${job} 스킬북 비중 ${(count / samples * 100).toFixed(1)}%`);
    // 얕은 층에서는 그 층의 해금 조건(레벨 ≤ 층 × 2)을 지킨다.
    for (let index = 0; index < 200; index++) {
      const book = rollSkillBook(1);
      const owner = Object.keys(pools).find(job => pools[job].includes(book.skillId));
      assert(owner, '1층에도 세 직업 스킬북이 나온다');
    }
    // 튜토리얼 첫 확정 드롭은 내 직업 무기 그대로다.
    assert.equal(rollItem(1, true, false, 'warrior').name, '낡은 두손검');
    assert.equal(rollItem(1, true, false, 'archer').name, '낡은 사냥꾼의 활');
    assert.equal(rollItem(1, true, false, 'mage').name, '낡은 견습생의 지팡이');
    assert.equal(rollItem(1, true).name, '낡은 두손검', '직업을 안 주면 전사');
  } finally { Math.random = original; }
});

test('무기 직업 판별 — 활은 궁수, 지팡이는 마법사, 대검은 전사이고 옛 방어구 이름은 공용이다', () => {
  assert.equal(weaponJob(sword()), 'warrior');
  assert.equal(weaponJob(bow()), 'archer');
  assert.equal(weaponJob(staff()), 'mage');
  assert.equal(canWield(sword(), 'warrior'), true);
  assert.equal(canWield(sword(), 'archer'), false);
  assert.equal(canWield(sword(), 'mage'), false);
  assert.equal(canWield(bow(), 'archer'), true);
  assert.equal(canWield(bow(), 'warrior'), false);
  assert.equal(canWield(bow(), 'mage'), false);
  assert.equal(canWield(staff(), 'mage'), true);
  assert.equal(canWield(staff(), 'warrior'), false);
  assert.equal(canWield(staff(), 'archer'), false);
  assert.equal(canWield(helmet(), 'mage'), true, '옛 전사용 투구 이름은 공용으로 남는다(작업 249 호환 규칙)');
  // 목록 자체는 그대로다 — 세 직업 무기 10종씩.
  assert.equal(baseItems.weapon.length, 10);
  assert.equal(bowBases.length, 10);
  assert.equal(staffBases.length, 10);
});

test('자동 장착은 내 직업 무기만 장착한다', () => {
  const warrior = freshSave();
  warrior.bag = [bow(999), staff(888)];
  assert.equal(autoEquipBest(warrior), 0, '다른 직업 무기뿐이면 아무것도 장착하지 않는다');
  assert.equal(warrior.equipment.weapon, undefined);
  warrior.bag.push(sword(30));
  autoEquipBest(warrior);
  assert.equal(warrior.equipment.weapon?.name, sword().name, '내 직업 대검을 장착한다');
  assert.deepEqual([...new Set(warrior.bag.filter(item => item.slot === 'weapon').map(item => item.name))].sort(), [bow().name, staff().name].sort(), '다른 직업 무기는 가방에 남는다');

  const archer = freshSave('male', 'archer');
  archer.bag = [sword(999), staff(888), bow(30)];
  autoEquipBest(archer);
  assert.equal(archer.equipment.weapon?.name, bow().name);

  const mage = freshSave('female', 'mage');
  mage.bag = [sword(999), bow(888), staff(30)];
  autoEquipBest(mage);
  assert.equal(mage.equipment.weapon?.name, staff().name);
});

test('다른 직업 무기는 더 강해도 분해 보호·자동 분해 대상이 아니다', () => {
  const save = freshSave();
  save.equipment.weapon = sword(50);
  // 내 무기보다 훨씬 강한 활이어도 전사에게는 입을 수 없는 장비다 — '더 좋은 장비' 보호 팝업에 끼지 않는다.
  assert.deepEqual(salvageUpgrades(save, [bow(5000)]), []);
  // 내 직업의 더 강한 무기는 그대로 보호된다.
  assert.equal(salvageUpgrades(save, [sword(4000)]).length, 1);
  // 무기 칸이 비어 있어도, 입을 수 없는 무기는 '빈 슬롯'으로 가방에 남지 않는다.
  delete save.equipment.weapon;
  assert.equal(autoSalvageBlock(save, bow(10), 'epic', 7), undefined);
  assert.equal(autoSalvageBlock(save, sword(10), 'epic', 7), 'empty-slot');
  // 등급·+단계 보호는 그대로 — 경매장에 팔 수 있는 높은 등급은 직업과 상관없이 남는다.
  save.equipment.weapon = sword(50);
  assert.equal(autoSalvageBlock(save, bow(10, { rarity: 'legendary' }), 'epic', 7), 'grade');
  save.maxFloor = 45;
  assert.equal(autoSalvageBlock(save, bow(10, { plus: 6 }), 'epic', 4), 'plus');
  // 마법사도 같은 규칙이다.
  const mage = freshSave('female', 'mage');
  mage.equipment.weapon = staff(50);
  mage.bag = [sword(4000), bow(4000)];
  assert.deepEqual(salvageUpgrades(mage, [...mage.bag]), []);
});
