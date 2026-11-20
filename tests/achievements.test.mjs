import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const journeyStateModule = await import('../server/journey-state.mjs');
const { advanceJourney, journeyView, collectionCount, skillUpgradeCount } = journeyStateModule;
const { addBossKill, bossKillCount, dungeonBossKills, isDungeonBossFloor } = await import('../src/game/bossCount.ts');
const { World } = await import('../src/game/world.ts');
const { freshSave } = await import('../src/game/store.ts');

const save = (over = {}) => ({ version: 1, name: '전사', gender: 'male', gold: 0, bag: [], equipment: {}, kills: 0, bossKills: 0, playSeconds: 0, level: 1, floor: 1, maxFloor: 1, equipmentCollection: [], learned: [], passives: [], skillLevels: {}, ...over });
const view = (over = {}) => journeyView(advanceJourney(undefined, save(over), save(over), Date.parse('2026-11-20T03:00:00Z'), false), save(over));
/** 한 분류의 (이름, 목표) 목록 — 화면에 깔리는 업적 단계 그대로. */
const steps = (achievements, name) => achievements.filter(task => task.name.startsWith(name)).map(task => [Number(task.target), task.gold, task.books]);
/** 화면에 실제로 뜨는 7개 분류의 순서 — journeyView가 만드는 순서 그대로. */
const groups = achievements => {
  const result = [];
  for (const task of achievements) {
    const name = task.name.slice(0, task.name.lastIndexOf(' '));
    if (!result.includes(name)) result.push(name);
  }
  return result;
};

test('업적 단계는 사용자 확정 7개 분류·목표로 바뀌었다 (작업 208)', () => {
  const achievements = view().achievements;
  assert.deepEqual(groups(achievements), ['캐릭터 레벨', '몬스터 처치', '보스 처치', '최고 도달 층', '장비 도감 수집', '스킬 강화 횟수', '최고 스킬 레벨']);
  assert.deepEqual(steps(achievements, '캐릭터 레벨').map(step => step[0]), [5, 10, 15, 20, 25, 30]);
  assert.deepEqual(steps(achievements, '몬스터 처치').map(step => step[0]), [500, 1000, 2000, 4000, 8000, 16000, 32000]);
  assert.deepEqual(steps(achievements, '보스 처치').map(step => step[0]), [10, 50, 100, 150, 200]);
  assert.deepEqual(steps(achievements, '최고 도달 층').map(step => step[0]), [5, 10, 15, 20]);
  assert.deepEqual(steps(achievements, '장비 도감 수집').map(step => step[0]), [10, 50, 100, 200, 300, 450, 570]);
  assert.deepEqual(steps(achievements, '스킬 강화 횟수').map(step => step[0]), [5, 15, 30, 50, 100]);
  assert.deepEqual(steps(achievements, '최고 스킬 레벨').map(step => step[0]), [5, 10, 15, 20, 25, 30]);
  // 보상은 단계 인덱스에 따른 금화 사다리 + 뒤쪽 단계 보물 주머니, 스킬북은 주지 않는다(작업 208).
  assert.deepEqual(steps(achievements, '보스 처치').map(step => [step[1], step[2]]), [[1000, 0], [2000, 0], [3000, 0], [5000, 0], [8000, 0]]);
  const pouches = achievements.filter(task => task.pouches).map(task => [task.id, task.pouches]);
  assert.deepEqual(pouches, [
    ['level-15', 1], ['level-20', 1], ['level-25', 1], ['level-30', 2],
    ['kills-2000', 1], ['kills-4000', 1], ['kills-8000', 1], ['kills-16000', 1], ['kills-32000', 2],
    ['boss-100', 1], ['boss-150', 1], ['boss-200', 2],
    ['floor-15', 1], ['floor-20', 2],
    ['collection-100', 1], ['collection-200', 1], ['collection-300', 1], ['collection-450', 1], ['collection-570', 2],
    ['skills-30', 1], ['skills-50', 1], ['skills-100', 2],
    ['rank-15', 1], ['rank-20', 1], ['rank-25', 1], ['rank-30', 2]
  ]);
  assert.equal(achievements.every(task => task.books === 0), true, '스킬북 직접 지급 없음');
});

test('보스 업적 현재 값은 사냥터 보스·정예·던전 보스·월드보스가 합쳐진 bossKills 하나를 센다', () => {
  const achievements = view({ bossKills: 50 }).achievements;
  const boss = achievements.filter(task => task.name.startsWith('보스 처치'));
  assert.deepEqual(boss.map(task => task.current), [10, 50, 50, 50, 50], '50회면 10·50단계 달성');
  const bossReady = boss.filter(task => task.current >= task.target).map(task => task.id);
  assert.deepEqual(bossReady, ['boss-10', 'boss-50']);
});

test('필드 정예 몹은 bossKills를 올리고 일반 몹은 올리지 않는다 — 합산의 시작점', () => {
  const originalRandom = Math.random; Math.random = () => .99;
  try {
    const world = new World(freshSave()); world.enemies = []; world.spawnTimer = 999;
    const enemy = over => ({ x: 60, y: 20, hp: 0, maxHp: 10, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0, ...over });
    world.kill(enemy({})); assert.equal(world.save.bossKills, 0, '일반 몹');
    world.kill(enemy({ elite: true })); assert.equal(world.save.bossKills, 1, '정예 몹');
    world.kill(enemy({ boss: true })); assert.equal(world.save.bossKills, 2, '사냥터 층 보스');
  } finally { Math.random = originalRandom; }
});

test('던전 보스 층(5·10층)만 클리어가 보스 처치로 세진다', () => {
  assert.equal(isDungeonBossFloor(5), true); assert.equal(isDungeonBossFloor(10), true);
  assert.equal(isDungeonBossFloor(1), false); assert.equal(isDungeonBossFloor(9), false); assert.equal(isDungeonBossFloor(0), false);
  assert.equal(dungeonBossKills(5, true), 1); assert.equal(dungeonBossKills(10, true), 1);
  assert.equal(dungeonBossKills(5, false), 0, '실패·시간 초과는 세지 않는다');
  assert.equal(dungeonBossKills(4, true), 0);
});

test('addBossKill은 값이 비어 있거나 깨져 있어도 0에서 1로 올린다(월드보스·던전이 쓰는 길)', () => {
  assert.equal(addBossKill({}), 1); assert.equal(addBossKill({ bossKills: undefined }), 1);
  assert.equal(addBossKill({ bossKills: Number.NaN }), 1); assert.equal(addBossKill({ bossKills: 41 }), 42);
  assert.equal(bossKillCount({ bossKills: -3 }), 0); assert.equal(bossKillCount({ bossKills: 7.8 }), 7);
});

test('스킬 강화 횟수는 배운 스킬의 1레벨을 뺀 합계다', () => {
  assert.equal(skillUpgradeCount({ skillLevels: {} }), 0);
  assert.equal(skillUpgradeCount({ skillLevels: { slash2: 1, spin: 1 } }), 0, '배우기만 한 상태');
  assert.equal(skillUpgradeCount({ skillLevels: { slash2: 6, spin: 3, mastery: 1 } }), 7);
  const achievements = view({ skillLevels: { slash2: 6, spin: 3, mastery: 1 } }).achievements;
  const skills = achievements.filter(task => task.name.startsWith('스킬 강화 횟수'));
  assert.deepEqual(skills.map(task => task.current), [5, 7, 7, 7, 7]);
  assert.deepEqual(skills.filter(task => task.current >= task.target).map(task => task.id), ['skills-5']);
});

test('장비 도감 수집은 등급별 발견 칸만 센다 — 570칸이 마지막 단계', () => {
  const keys = ['weapon:0:common', 'weapon:0:magic', 'armor:3:legendary', 'weapon:3', 'unknown:1:rare', 42];
  assert.equal(collectionCount({ equipmentCollection: keys }), 3, '구키·알 수 없는 키는 세지 않는다');
  // 투구 10종 × 6등급 = 60칸을 모두 발견한 세이브.
  const collection60 = Array.from({ length: 60 }, (_, index) => `helmet:${index % 10}:${['common', 'magic', 'rare', 'epic', 'unique', 'legendary'][Math.floor(index / 10)]}`);
  assert.equal(collectionCount({ equipmentCollection: collection60 }), 60);
  const collection = view({ equipmentCollection: collection60 }).achievements.filter(task => task.name.startsWith('장비 도감 수집'));
  assert.deepEqual(collection.map(task => task.current), [10, 50, 60, 60, 60, 60, 60]);
  assert.equal(collectionCount({ equipmentCollection: [] }), 0);
});

test('업적 보상 금화 사다리와 보물 주머니 규칙은 마지막 단계를 크게 준다', () => {
  const { achievementGold, achievementReward } = journeyStateModule;
  assert.deepEqual(achievementGold, [1000, 2000, 3000, 5000, 8000, 12000, 20000]);
  assert.deepEqual(achievementReward(0, 7), { gold: 1000, books: 0, pouches: 0 });
  assert.deepEqual(achievementReward(2, 7), { gold: 3000, books: 0, pouches: 1 });
  assert.deepEqual(achievementReward(6, 7), { gold: 20000, books: 0, pouches: 2 }, '마지막 단계는 2개');
  assert.deepEqual(achievementReward(1, 3), { gold: 2000, books: 0, pouches: 0 }, '짧은 사슬은 앞 단계 주머니 없음');
  assert.deepEqual(achievementReward(2, 3), { gold: 3000, books: 0, pouches: 2 }, '짧은 사슬의 마지막은 2개');
  assert.deepEqual(achievementReward(9, 12), { gold: 20000, books: 0, pouches: 1 }, '금화는 마지막 값을 넘지 않는다');
});

test('최고 스킬 레벨 업적은 스킬 레벨 최고값을 30단계까지 센다', () => {
  const achievements = view({ skillLevels: { slash2: 21 } }).achievements;
  const rank = achievements.filter(task => task.name.startsWith('최고 스킬 레벨'));
  assert.deepEqual(rank.map(task => task.current), [5, 10, 15, 20, 21, 21]);
});
