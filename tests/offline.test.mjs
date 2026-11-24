import { test } from 'node:test';
import assert from 'node:assert/strict';
// 기념 종일 버프(2026-11-22 공·방·체 +30%)를 끈 시각으로 시계를 고정한다 — 밸런스 스냅샷이 흔들리지 않게.
import './patch-buff-off.mjs';

const { freshSave, floorKillTarget } = await import('../src/game/store.ts');
const { applyOfflineRewards, offlineKillsPerMinute, offlineHeroDps, OFFLINE_EFFICIENCY } = await import('../src/game/offline.ts');
const { equipmentDropChance, itemDropChance, offlineDropChance } = await import('../src/game/items.ts');
const { killReward } = await import('../src/game/progress.ts');
const { fieldSpawnRate, enemyMaxHp } = await import('../src/game/battle/formulas.ts');
const { equipmentCount } = await import('../src/game/bagCapacity.ts');

test('offline hunts award one equipment per kill (파트 B — 스킬북 폐지) and gold, and a boss only past the floor target', () => {
  const originalRandom = Math.random; Math.random = () => 0;
  try {
    const save = freshSave(); save.tutorial = 1;
    const reward = applyOfflineRewards(save, 600);
    // 10분 — 1층 젠(0.82마리/초)을 70% 효율로 따라가 1분에 약 41마리다(밸런스 v2).
    assert(reward.kills >= 300 && reward.kills <= 460, `10분에 400마리 안팱 (${reward.kills})`);
    assert(reward.kills > floorKillTarget(1), '1층 목표(150)를 넘겨 보스를 만난다');
    assert.equal(reward.bossKills, 0, '맨몸 Lv.1은 1층 보스를 잡지 못한다');
    assert(reward.deaths >= 1, '보스에게 진 기록이 남는다');
    // 드롭·금화는 한 마리당 한 번이다 — 파트 B: 스킬북이 폐지되어 난수 0이면 장비 하나가 떨어진다.
    // 영구 스탯북은 **별개로** 개극악 확률(0.001%)을 한 번 더 굴린다(`statBooks.ts`).
    // 파트 B에서는 모든 아이템이 1칸이라 가방 40칸이 차면 남은 드롭은 '놓친 몫'으로 센다.
    // 난수 0에서는 스탯북 확률(0.001%)도 통과하므로 드롭은 "한 마리당 장비 1개 + 가끔 스탯북"이다.
    assert(reward.items.length + reward.missedDrops >= reward.kills, '한 마리당 최소 장비 1개');
    // 주머니 스택형: 주머니·같은 종류의 스탯북은 한 칸에 쌓이므로 **아이템 수**가 아니라 **칸 수**가 40을 넘지 않아야 한다.
    assert(equipmentCount(save.bag) <= 40, `가방 40칸을 넘지 않는다(${equipmentCount(save.bag)}칸)`);
    assert(reward.items.every(item => item.slot === 'statbook' || item.kind === undefined || item.kind === 'equipment'), '드롭은 장비 아니면 영구 스탯북');
    // 금화는 처치한 일반 몹의 필드 계수 몫만 — 보스를 이기지 못해 보스 금화는 없다.
    const unit = killReward({ floor: 1 });
    assert.equal(reward.gold, reward.kills * unit.gold, '1층 금화 3 × 처치 수');
    // 보스에게 진 패널티(10골드)는 세이브에서만 빠진다 — 정산서는 번 금화를 그대로 보여 준다.
    // 2026-11-24: 사냥 중 사뫀(일반·정예)도 접속과 같이 10골드를 문다(`fieldDeaths`).
    assert.equal(save.gold, reward.gold - (reward.deaths + reward.fieldDeaths) * 10);
  } finally { Math.random = originalRandom; }
});

test('full bag takes nothing now that every item counts and the tutorial suppresses all loot', () => {
  const originalRandom = Math.random; Math.random = () => 0;
  try {
    const save = freshSave(); save.tutorial = 1;
    save.bag = Array.from({ length: 40 }, (_, index) => ({ id: `item-${index}`, name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } }));
    const reward = applyOfflineRewards(save, 60);
    // 파트 B: 모든 아이템이 1칸이라 가득 찬 가방(40칸)에는 아무것도 들어가지 않고, 놓친 몫으로 센다.
    assert.equal(reward.items.length, 0, '가득 찬 가방에는 드롭이 들어가지 않는다');
    assert(reward.missedDrops >= 1, '놓친 드롭을 센다');
    assert.equal(save.bag.length, 40, '장비 40칸은 그대로');
    const tutorial = freshSave(), early = applyOfflineRewards(tutorial, 600);
    assert.equal(early.items.length, 0); assert.equal(early.missedDrops, 0);
    assert.equal(early.gold, early.kills * killReward({ floor: 1 }).gold);
  } finally { Math.random = originalRandom; }
});

test('offline kill rate is 60 × min(내 처치력, 젠) × 0.7 — 접속과 같은 몹 HP·젠을 쓴다', () => {
  const low = freshSave(); low.floor = 50;
  // Lv.1 맨몸으로 50층 몹(2,069)은 거의 잡지 못한다 — 최소 1마리/분.
  assert.equal(applyOfflineRewards(low, 60).kills, 1);
  const high = freshSave(); high.equipment.weapon = { id: 'high-attack', name: '검', slot: 'weapon', rarity: 'common', stats: { attack: 10_000 } };
  const capped = 60 * fieldSpawnRate(1) * OFFLINE_EFFICIENCY;
  assert.equal(applyOfflineRewards(high, 60).kills, Math.floor(capped), '젠이 상한 — 공격력이 아무리 높아도 젠보다 많이 잡지 않는다');
  assert(offlineHeroDps(high) / enemyMaxHp(1, false) > fieldSpawnRate(1), '처치력이 젠보다 크다');
  assert.equal(applyOfflineRewards(freshSave(), 59), undefined);
  // 같은 스펙이면 처치/분은 층이 깊을수록 몹 HP·젠에 맞춰 줄어든다.
  assert(offlineKillsPerMinute(freshSave()) >= offlineKillsPerMinute(low));
});

test('아이템 드롭률 — 접속은 층별 계수(1층 0.0242% → 20층 0.0153% → 34층+ 0.0144%), 보스 0.4%, 방치는 일반 0.030%', () => {
  const round = value => Math.round(value * 1e6) / 1e6;
  assert.equal(round(itemDropChance(1, false)), .000242);
  assert.equal(round(itemDropChance(20, false)), .000153, '층이 깊을수록 낮아진다');
  assert.equal(round(itemDropChance(40, false)), round(.00039 * .37));
  assert.equal(itemDropChance(1, true), .004);
  assert.equal(itemDropChance(20, true), .004);
  // 방치 사냥은 같은 자리의 `offlineDropChance` — 일반 0.030%, 보스는 같다.
  assert.equal(offlineDropChance(1, false), .0003);
  assert.equal(offlineDropChance(20, false), .0003);
  assert.equal(offlineDropChance(1, true), .004);
  // 파트 B: 스킬북이 폐지되어 70:30 분기가 없다 — 한 번 굴린 드롭은 곧 장비 하나다.
  // 영구 스탯북은 `src/game/statBooks.ts`의 개극악 확률을 **따로** 한 번 더 굴린다.
  assert.equal(round(equipmentDropChance(1, false)), round(.000242));
  assert.equal(round(equipmentDropChance(20, true)), .004);
});

test('아래층 오프라인 정산에는 보스 몫(보스 처치·보스 금화)이 들어가지 않는다(작업 210)', () => {
  const originalRandom = Math.random; Math.random = () => .99;
  try {
    // 자동 등반이 꺼져 있으면 아래층에서 계속 사냥한다(작업 245 — 켜져 있으면 한 층씩 올라간다).
    const save = freshSave(); save.tutorial = 1; save.floor = 2; save.maxFloor = 7; save.autoClimb = false;
    const reward = applyOfflineRewards(save, 3600);
    assert(save.bossKills === 0, '아래층에는 보스가 없으니 보스 처치 0');
    assert.equal(reward.gold, reward.kills * killReward({ floor: 2 }).gold, '보스 금화(70×층) 없이 일반 몹 금화만');
    assert.equal(save.floor, 2, '자동 등반이 꺼져 있으면 층은 그대로');
    assert(save.floorKills < floorKillTarget(2), '진행도는 목표 안에서만 돈다');
  } finally { Math.random = originalRandom; }
});

test('자동 등반 중이면 방치 정산도 층 목표를 채울 때마다 한 층씩 올라가고, 최고층에서는 보스를 상대한다(작업 245)', () => {
  const originalRandom = Math.random; Math.random = () => .99;
  try {
    const save = freshSave(); save.tutorial = 1; save.floor = 1; save.maxFloor = 2; save.floorKills = 0;
    const reward = applyOfflineRewards(save, 3600);
    assert(reward.kills > floorKillTarget(1), '1층 목표를 넘길 만큼 잡았다');
    assert.equal(save.floor, 2, '목표를 채운 만큼 한 층 올라간다');
    assert.equal(reward.endFloor, 2, '정산이 끝난 층도 올라간 층이다');
    assert.equal(save.maxFloor, 2, '올라가도 최고 도달 층은 그대로');
    assert(save.floorKills <= floorKillTarget(2), '최고층 진행도는 목표 안에');
    assert(reward.gold >= floorKillTarget(1) * killReward({ floor: 1 }).gold, '올라간 1층 사냥은 1층 금화로 정산');
    // 목표를 다 못 채우면 그 층에 머문다.
    const short = freshSave(); short.tutorial = 1; short.floor = 1; short.maxFloor = 3;
    const shortReward = applyOfflineRewards(short, 60);
    assert(shortReward.kills < floorKillTarget(1), '10분으로는 1층 목표에 못 미친다');
    assert.equal(short.floor, 1, '1층 목표에 못 미치면 1층에 머문다');
    assert.equal(short.floorKills, shortReward.kills, '잡은 만큼 진행도에 쌓인다');
    // 자동 등반이 꺼져 있으면 목표를 채워도 층은 그대로(작업 210 규칙 유지).
    const still = freshSave(); still.tutorial = 1; still.floor = 1; still.maxFloor = 3; still.autoClimb = false;
    applyOfflineRewards(still, 3600);
    assert.equal(still.floor, 1, '자동 등반이 꺼져 있으면 올라가지 않는다');
  } finally { Math.random = originalRandom; }
});
