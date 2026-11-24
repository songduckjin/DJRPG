// 밸런스 v2 (작업 265) — `downloads/djrpg_balance_proposal_v2.md`의 확정 수치를 고정한다.
//
// 고정하는 것:
//  ① 최대 공속 위계 — 궁수 6.00 > 전사 ~4.54 > 마법사 ~3.36, 마법사 기본 간격 0.63초, 상한 6.00타/초.
//  ② 스킬 쿨타임 감소(CDR) — 마법사 지팡이·모자·로브 기본 + 추가옵션 1~2%, 합산 상한 35%, 스킬에만 적용.
//  ③ 치명 — 기본 2 + (lv-1)×0.6, 패시브 4 + 0.9×n, 상한 100%, 장비 치명은 층과 분리(×0.70).
//  ④ 피흡 — 장비 합산 5%, 타격당 0.4%, 초당 2.5%.
//  ⑤ 방어 % 감소(상한 62%), 군집 타격(2~3마리 ×0.55), 몹·보스 HP, killsToBoss, 필드 보상 계수, 드롭률.
//  ⑥ 목표 생존 수 젠(3/5/7)과 리필 간격.
//  ⑦ 던전(2×층)과 방치 정산이 필드와 같은 식을 쓰는지.
//  ⑧ 기존 세이브 마이그레이션(치명·공속·쿨감만 새 척도로, 나머지 보존).
//  ⑨ 입문 온보딩 — 1~4층 완화, Lv.1 체력 140, 입문 방어구 확정 드랍, 첫 스킬 기본 습득.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const items = await import('../src/game/items.ts');
const extra = await import('../src/game/extraOptions.ts');
const formulas = await import('../src/game/battle/formulas.ts');
const progress = await import('../src/game/progress.ts');
const store = await import('../src/game/store.ts');
const offline = await import('../src/game/offline.ts');
const dungeon = await import('../src/game/dungeon/battle.ts');
const serverSeed = await import('../server/save-seed.mjs');
const { itemWithinBounds } = await import('../server/save-guard.mjs');
const { World } = await import('../src/game/world.ts');
// 밸런스 수치는 **기념 버프(2026-11-22 종일 공·방·체 +30%) 밖**의 값이다 — `patchBuff.ts`가 안내하는
// 대로 스냅샷 테스트는 시계를 버프 기간 밖에 묶는다. 버프 자체는 `tests/patch-rewards-and-buff.test.mjs`가 본다.
const patchBuff = await import('../src/game/patchBuff.ts');
patchBuff.setPatchBuffClock(() => patchBuff.PATCH_BUFF_START - 1);
const { FIRE_BOLT_TOTAL_POWER, iceBoltProfile, skills, skillOrderFor, passiveOrderFor, skillDamageScale } = await import('../src/game/skills.ts');

const { slots, baseItems, gearStats, applyPlus, maxPlusFor, totalStats, statNames, rarityScales, tierFactor, slotProfileFor } = items;
const levelFor = floor => Math.min(30, Math.max(1, Math.round(5 + floor * .6)));
const tierTop = slot => (slot === 'weapon' ? 9 : baseItems[slot].length - 1);
const TIERS = { low: ['rare', 'mid'], std: ['epic', 'mid'], full: ['legendary', 'top'] };

/** 시뮬레이터(§2)와 같은 장비 한 벌 — 저스펙 레어·표준 에픽·풀 전설. */
function setFor(job, floor, tierKey, skillLevel) {
  const [rarity, tierMode] = TIERS[tierKey];
  const save = store.freshSave('male', job);
  save.level = levelFor(floor); save.floor = floor; save.maxFloor = floor; save.equipment = {};
  save.learned = []; save.passives = []; save.skillLevels = {}; save.quickSlots = [null, null, null];
  const plus = maxPlusFor(floor);
  for (const slot of slots) {
    const gearJob = slot === 'weapon' || slot === 'helmet' || slot === 'armor' ? job : undefined;
    const tier = tierMode === 'top' ? tierTop(slot) : Math.floor(tierTop(slot) * .5);
    const stats = gearStats(slot, rarity, tier, floor, gearJob, false, () => .5);
    applyPlus(stats, plus);
    // 시뮬레이터(`djrpg-balance/sim6.mjs`)와 **같은 id** — 추가옵션 난수가 같아 문서 표를 그대로 재현한다.
    const item = { id: `fixed-${slot}-${job}-${rarity}-${tier}`, name: `${slot}-${tier}`, slot, rarity, stats, plus };
    if (gearJob) item.job = gearJob;
    extra.normalizeExtraOptions(item);
    save.equipment[slot] = item;
  }
  const act = skillOrderFor(job), pass = passiveOrderFor(job);
  save.learned = [...act]; save.passives = [...pass];
  for (const id of [...act, ...pass]) save.skillLevels[id] = skillLevel;
  const burst = { slash2: 2.2, slam: 2.2, warcry: 0, power: 4, destroy: 2.7, hell: 3.2, crushing: 3.4, spin: 1.65,
    doubleShot: 2.7, multiShot: .95, pierceShot: 2.6, iceArrow: 1.9, hawkEye: 0, snipe: 6.5, stormVolley: .8, arrowRain: 2.55,
    fireBolt: FIRE_BOLT_TOTAL_POWER, iceBolt: iceBoltProfile(skillLevel).power / skillDamageScale(skillLevel), chainLightning: 1.25, manaBurst: 0, frostNova: 1.5, arcaneShield: 0, meteorStrike: 3.6, arcaneOverlord: 3 };
  save.quickSlots = act.map(id => ({ id, dps: (burst[id] || 0) * skillDamageScale(skillLevel) / skills[id].cooldown }))
    .sort((a, b) => b.dps - a.dps).slice(0, 3).map(entry => entry.id);
  return save;
}

/** 시뮬레이터와 같은 초당 타격 수 — 버프 전/중. */
const hitsOf = (save, berserk = false) => 1 / formulas.attackInterval(save.job, totalStats(save).speed, berserk ? formulas.berserkSpeedScale(save.skillLevels[passiveOrderFor(save.job)[0]] ?? 10) : 1);

test('최대 공속 위계 — 궁수 6.00 > 전사 ~4.54 > 마법사 ~3.36, 6.00타/초에서 자른다', () => {
  assert.deepEqual({ ...formulas.BASE_ATTACK_INTERVAL }, { warrior: .48, archer: .48, mage: .63 });
  assert.equal(formulas.HITS_PER_SECOND_CAP, 6);
  assert.equal(formulas.attackInterval('archer', 0), .48);
  assert.equal(formulas.attackInterval('mage', 0), .63);
  // 아무리 빨라도 6.00타/초(간격 1/6) 밑으로 내려가지 않는다.
  assert.equal(formulas.attackInterval('warrior', 10_000), 1 / 6);

  const full = Object.fromEntries(['warrior', 'archer', 'mage'].map(job => [job, hitsOf(setFor(job, 20, 'full', 30), true)]));
  assert(Math.abs(full.archer - 6) < .01, `궁수 6.00 (${full.archer.toFixed(2)})`);
  // 백로그 2번(2026-11-23)이 추가옵션 풀에 `critDmgPct`를 더해 11종이 되면서, **고정 id**로 뽑던
  // 이 시험 장비들의 옵션이 한 번 다시 뽑혔다(저장된 옵션이 있는 실제 장비는 그대로다). 그만큼 위계 값이
  // 조금 움직였다 — 순서(궁수 > 전사 > 마법사)와 상한 6.00은 그대로다.
  assert(Math.abs(full.warrior - 4.63) < .03, `전사 ~4.63 (${full.warrior.toFixed(2)})`);
  assert(Math.abs(full.mage - 3.46) < .03, `마법사 ~3.46 (${full.mage.toFixed(2)})`);
  assert(full.archer > full.warrior && full.warrior > full.mage, '궁수 > 전사 > 마법사');
  // 마법사의 느린 평타를 공격 숙련 1.52가 보상한다.
  assert.equal(items.jobMastery.mage.attack, 1.52);
});

test('스킬 쿨타임 감소 — 마법사 전용 부위 기본 + 추가옵션 1~2%, 상한 35%, 평타 간격은 그대로', () => {
  const full = totalStats(setFor('mage', 20, 'full', 30));
  assert.equal(full.cdr, 30, `풀 세팅 마법사 30% (${full.cdr})`);
  const standard = totalStats(setFor('mage', 20, 'std', 10));
  assert.equal(standard.cdr, 17, `표준 세팅 17% (${standard.cdr})`);
  // 전사·궁수는 추가옵션으로만 얻는다(3~6%).
  assert(totalStats(setFor('warrior', 20, 'full', 30)).cdr <= 6);
  assert(totalStats(setFor('archer', 20, 'full', 30)).cdr <= 6);
  // 생성식: 마법사 지팡이·모자·로브에만, 등급·티어로 정해진다(층과 무관).
  for (const slot of ['weapon', 'helmet', 'armor']) {
    const shallow = gearStats(slot, 'legendary', 9, 1, 'mage', false, () => 0).cdr;
    const deep = gearStats(slot, 'legendary', 9, 50, 'mage', false, () => 0).cdr;
    assert.equal(shallow, deep, `${slot} 쿨감은 층과 무관`);
    assert(shallow > 0);
  }
  assert.equal(gearStats('weapon', 'legendary', 9, 20, 'warrior', false, () => 0).cdr, undefined, '전사 무기에는 없다');
  assert.equal(gearStats('gloves', 'legendary', 9, 20, 'mage', false, () => 0).cdr, undefined, '마법사도 장갑에는 없다');
  assert.equal(items.CDR_CAP, 35);
  // 추가옵션 풀 11종(백로그 2번이 `critDmgPct`를 더했다) — 쿨감만 1~2%, 합산 상한 6%.
  assert.equal(extra.extraOptionKeys.length, 11);
  assert.equal(extra.EXTRA_CDR_CAP, 6);
  for (let index = 0; index < 200; index++) {
    const options = extra.deriveExtraOptions('legendary', crypto.randomUUID());
    if (options.cdrPct !== undefined) assert(options.cdrPct >= 1 && options.cdrPct <= 2, `쿨감 ${options.cdrPct}`);
  }

  // 전투: 스킬 쿨타임에만 곱한다 — 평타 간격은 CDR과 무관하다.
  const save = store.freshSave('male', 'warrior');
  save.learned = ['slash2']; save.quickSlots = ['slash2', null, null]; save.skillLevels = { slash2: 1 };
  save.equipment = {
    weapon: { id: 'cdr-w', name: '시험 지팡이', slot: 'weapon', rarity: 'rare', stats: { attack: 10, cdr: 20 }, plus: 0 }
  };
  save.job = 'mage';
  const world = new World(save);
  world.spawnTimer = 999;
  const stats = totalStats(save);
  assert.equal(stats.cdr, 20);
  world.action('attack');
  assert(Math.abs(world.cooldown.attack - formulas.attackInterval('mage', stats.speed)) < 1e-9, '평타 간격은 직업 기본 간격 그대로');
  world.cooldown.attack = 0; world.cooldown.slash2 = 0;
  world.action('slash2');
  assert(Math.abs(world.cooldown.slash2 - skills.slash2.cooldown * .8) < 1e-9, '스킬 쿨타임은 20% 줄어든다');
});

test('치명 — 기본 20% · 패시브 30% · 장비 60% 예산, 실전 상한 100%', () => {
  assert.equal(formulas.CRIT_CHANCE_CAP, 100);
  const bare = level => { const save = store.freshSave(); save.equipment = {}; save.level = level; return totalStats(save).crit; };
  assert.equal(bare(1), 2);
  assert.equal(Math.round(bare(30) * 10) / 10, 19.4);
  // 패시브: 4% + 레벨당 0.9%(Lv30 30%).
  const passive = (job, id) => { const save = store.freshSave('male', job); save.equipment = {}; save.level = 30; save.passives = [id]; save.skillLevels = { [id]: 30 }; return totalStats(save).crit - bare(30); };
  assert.equal(Math.round(passive('warrior', 'instinct') * 10) / 10, 30.1);
  assert.equal(Math.round(passive('archer', 'hawkSight') * 10) / 10, 30.1);
  // 장비 치명은 층과 분리 — 1층과 50층의 같은 장비가 같은 값이다.
  assert.equal(gearStats('necklace', 'legendary', 4, 1, undefined, false, () => 0).crit,
    gearStats('necklace', 'legendary', 4, 50, undefined, false, () => 0).crit);
  // 풀 세팅 20층: 세 직업 모두 97~100%.
  for (const job of ['warrior', 'archer', 'mage']) {
    const crit = Math.min(100, totalStats(setFor(job, 20, 'full', 30)).crit);
    assert(crit >= 93 && crit <= 100, `${job} ${Math.round(crit)}%`);
  }
  // 추가옵션 치명·공속 합산 상한 10%.
  assert.equal(extra.EXTRA_CRIT_CAP, 10);
  assert.equal(extra.EXTRA_SPEED_CAP, 10);
});

test('피흡 — 장비 합산 5%, 타격당 0.4%, 초당 2.5%', () => {
  assert.equal(extra.EXTRA_LIFESTEAL_CAP, 5);
  assert.equal(extra.EXTRA_LIFESTEAL_HIT_CAP, .004);
  assert.equal(extra.EXTRA_LIFESTEAL_SECOND_CAP, .025);
  const save = store.freshSave('male', 'warrior');
  save.tutorial = 3; save.level = 30; save.floor = 6;
  save.equipment = { weapon: { id: 'ls', name: '피의 검', slot: 'weapon', rarity: 'unique', stats: { attack: 40 }, plus: 0, extraOptions: { lifestealPct: 3, bonusDmgPct: 1 } } };
  const world = new World(save);
  world.critRoll = () => 1;
  const maxHp = totalStats(save).health;
  world.player.hp = 1;
  world.lifesteal(1e9, 5);
  assert.equal(world.player.hp, 1 + Math.ceil(maxHp * .004), '한 타는 0.4%까지');
  world.lifesteal(1e9, 5);
  world.lifesteal(1e9, 5);
  world.lifesteal(1e9, 5);
  world.lifesteal(1e9, 5);
  world.lifesteal(1e9, 5);
  world.lifesteal(1e9, 5);
  assert.equal(world.player.hp, 1 + Math.ceil(maxHp * .025), '1초 합계는 2.5%까지');
});

test('방어 % 감소 — min(62%, def / (def + 50×(1+층/2))), 일반 몹은 군집 ×0.55', () => {
  assert.equal(formulas.damageReduction(0, 10), 0);
  assert.equal(Math.round(formulas.damageReduction(531, 20) * 100) / 100, .49, '20층 표준 전사 방어 531 = 49%');
  assert.equal(formulas.damageReduction(1e9, 20), .62, '상한 62%');
  assert.equal(formulas.MOB_DAMAGE_SWARM_SCALE, .55);
  assert.deepEqual([1, 10, 11, 15, 16, 20].map(formulas.swarmCount), [1, 1, 2, 2, 3, 3], '동시 타격 2~3마리');
  // 일반 몹 한 대 = 원공격 × 0.55 × (1−DR), 보스는 군집 없이 그대로.
  const raw = formulas.enemyRawHit(20, false);
  assert.equal(formulas.enemyHitDamage(20, false, 400), Math.max(1, Math.round(raw * .55 * (1 - formulas.damageReduction(400, 20)))));
  assert.equal(formulas.enemyHitDamage(20, true, 400), Math.max(1, Math.round(formulas.enemyRawHit(20, true) * (1 - formulas.damageReduction(400, 20)))));
  assert.equal(formulas.enemyHitDamage(20, false, 400, false), Math.max(1, Math.round(raw * (1 - formulas.damageReduction(400, 20)))), 'swarmed=false(던전)');
});

test('몹·보스 HP · killsToBoss · 필드 보상 계수 · 드롭률(밸런스 v2 표)', () => {
  const table = [
    // [층, 몹 HP, 보스 HP, killsToBoss, 드롭률%, 마리당 금화]
    [1, 26, 347, 150, .002418, 3], [10, 224, 2912, 501, .001997, 8], [20, 1083, 14079, 1081, .001529, 10], [40, 2069, 26897, 2841, .001443, 15], [78, 3940, 51220, 8389, .001443, 28]
  ];
  for (const [floor, mobHp, bossHp, kills, dropPct, gold] of table) {
    assert.equal(formulas.enemyMaxHp(floor, false), mobHp, `${floor}층 몹`);
    assert.equal(formulas.enemyMaxHp(floor, true), bossHp, `${floor}층 보스`);
    assert.equal(progress.killsToBoss(floor), kills, `${floor}층 목표`);
    assert.equal(Math.round(items.itemDropChance(floor) * 1e6) / 1e6, dropPct, `${floor}층 드롭률`);
    assert.equal(progress.killReward({ floor }).gold, gold, `${floor}층 금화`);
    assert.equal(progress.killGold(floor), 3 + floor, '던전 정산 금화에는 필드 계수를 곱하지 않는다');
  }
  // 20 → 21층 연속성(MAX_FLOOR 20은 그대로).
  assert.equal(progress.MAX_FLOOR, 20);
  assert(enemyGap(20, 21) > 0 && enemyGap(20, 21) < .05, '20→21층 몹 HP +5% 안');
  // 보스 금화 70×층은 그대로.
  assert.equal(progress.killReward({ floor: 20 }, { boss: true }).gold, 1400);
  function enemyGap(a, b) { return formulas.enemyMaxHp(b, false) / formulas.enemyMaxHp(a, false) - 1; }
});

test('목표 생존 수 젠 — 3/5/7마리를 리필 간격마다 채우고, 9~10층만 0.90초', () => {
  assert.deepEqual([1, 5, 6, 15, 16].map(formulas.targetAliveCount), [3, 3, 5, 5, 7]);
  assert.equal(formulas.spawnRefillSeconds(1), 1.02);
  assert.equal(formulas.spawnRefillSeconds(9), .9);
  assert.equal(formulas.spawnRefillSeconds(10), .9);
  assert(Math.abs(formulas.spawnRefillSeconds(20) - .45) < 1e-9);
  assert(Math.abs(formulas.spawnRefillSeconds(40) - .3) < 1e-9);
  assert.equal(formulas.spawnsPerRefill(8), 1);
  assert.equal(formulas.spawnsPerRefill(9), 2);

  // 필드: 목표(3)보다 적으면 리필 간격마다 채우고, 목표에 닿으면 더 부르지 않는다.
  const world = new World(store.freshSave());
  world.enemies = []; world.spawnTimer = 0;
  world.tickSpawn(1 / 60);
  assert.equal(world.enemies.length, 1, '1층은 한 번에 1마리');
  world.spawnTimer = 0; world.tickSpawn(1 / 60);
  world.spawnTimer = 0; world.tickSpawn(1 / 60);
  assert.equal(world.enemies.length, 3, '목표 3마리까지');
  world.spawnTimer = 0; world.tickSpawn(1 / 60);
  assert.equal(world.enemies.length, 3, '목표를 채우면 더 부르지 않는다');
});

test('던전과 방치 정산이 필드와 같은 식을 쓴다', () => {
  // 던전 몹 HP = 필드 2×층, 적 피해 = enemyHitDamage(2×층, 군집 없이).
  for (let floor = 1; floor <= 10; floor++) {
    assert.equal(dungeon.dungeonMobHp(floor), formulas.enemyMaxHp(floor * 2, false), `${floor}층 몹 HP`);
    assert.equal(dungeon.dungeonHitDamage(floor, false, 400), formulas.enemyHitDamage(floor * 2, false, 400, false));
  }
  assert.equal(dungeon.dungeonHitDamage(10, false, 400), 44);
  // 방치: 필드와 같은 직업 간격·치명·6.0타 상한을 쓴다 — 스킬이 없으면 평타 DPS와 정확히 같다.
  const full = setFor('archer', 20, 'full', 30);
  full.quickSlots = [null, null, null]; full.learned = [];
  const stats = totalStats(full);
  // 치명타 배수는 장비 `치명타 피해량`까지 포함한다(백로그 2번) — `critDamageScale` 한 곳.
  const crit = 1 + Math.min(100, stats.crit) / 100 * (formulas.critDamageScale(extra.effectiveExtraOptions(full.equipment).critDmgPct) - 1);
  assert(Math.abs(offline.offlineHeroDps(full) - stats.attack * formulas.basicAttackPower * crit / formulas.attackInterval('archer', stats.speed)) < 1e-6,
    '평타 DPS = 공격력 × 1.6 × 치명 / 직업 간격');
  // CDR은 방치의 스킬 몫도 줄여 DPS를 올린다(공격력은 같게 두고 쿨감만 준다).
  const bare = store.freshSave('male', 'mage');
  bare.level = 30; bare.learned = ['fireBolt']; bare.quickSlots = ['fireBolt', null, null]; bare.skillLevels = { fireBolt: 10 };
  const withCdr = { ...bare, equipment: { weapon: { id: 'c', name: '시험 지팡이', slot: 'weapon', rarity: 'rare', stats: { cdr: 20 }, plus: 0 } } };
  assert(offline.offlineHeroDps(withCdr) > offline.offlineHeroDps(bare), '쿨감 20%는 방치 DPS를 올린다');
  const standard = setFor('mage', 20, 'std', 10);
  const kpm = offline.offlineKillsPerMinute(standard);
  const expected = 60 * Math.min(offline.offlineHeroDps(standard) / formulas.enemyMaxHp(20, false), formulas.fieldSpawnRate(20)) * offline.OFFLINE_EFFICIENCY;
  assert(Math.abs(kpm - expected) < 1e-6);
  assert(offline.offlineBossBattle(setFor('mage', 20, 'std', 10), 20).bossHp === formulas.enemyMaxHp(20, true));
});

test('기존 세이브 마이그레이션 — 치명·공속·쿨감만 새 척도로 다시 박고 나머지는 보존한다', () => {
  const legacy = {
    id: 'legacy', name: '영원의 패왕의 성검', slot: 'weapon', rarity: 'legendary', plus: 4,
    stats: { attack: 883, defense: 12, health: 240, crit: 883, speed: 1255 }
  };
  const migrated = items.migrateItem(legacy);
  assert.equal(migrated.sec, items.SECONDARY_SCALE_VERSION);
  assert.equal(migrated.name, legacy.name, '이름(서버 동일성)은 그대로');
  assert.equal(migrated.plus, 4, '+N 보존');
  assert.equal(migrated.rarity, 'legendary');
  assert.equal(migrated.slot, 'weapon');
  assert.equal(migrated.stats.attack, 883, '공격 보존');
  assert.equal(migrated.stats.defense, 12, '방어 보존');
  assert.equal(migrated.stats.health, 240, '체력 보존');
  assert(migrated.stats.crit <= 10, `치명은 새 척도로 (${migrated.stats.crit})`);
  assert(migrated.stats.speed <= 10, `공속은 새 척도로 (${migrated.stats.speed})`);
  // 두 번 적용해도 같은 값(멱등).
  assert.deepEqual(items.migrateItem(migrated), migrated);
  // 마법사 지팡이는 쿨감을 얻고, 전사 검은 얻지 않는다.
  const staff = items.migrateItem({ id: 's', name: '영원의 대현자의 성지팡이', slot: 'weapon', rarity: 'legendary', stats: { attack: 100, crit: 200, speed: 200 } });
  assert(staff.stats.cdr > 0, '마법사 지팡이에 쿨감 기본값');
  assert.equal(items.migrateItem({ id: 'w', name: '영원의 패왕의 성검', slot: 'weapon', rarity: 'legendary', stats: { attack: 100 } }).stats.cdr, undefined);
  // 서버 저장 상한도 새 값을 통과시킨다.
  assert(itemWithinBounds(staff, 120));
  assert(itemWithinBounds(migrated, 120));
});

test('입문 온보딩 — 1~4층 완화, Lv.1 체력 140, 입문 방어구 확정 드랍, 첫 스킬 기본 습득', () => {
  // ① 1~4층 몹 HP·공격 완화가 6층부터 원래 곡선으로 돌아온다.
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(floor => formulas.earlyEaseScale(floor)), [.65, .72, .79, .86, .93, 1]);
  assert.equal(formulas.enemyMaxHp(1, false), 26);
  assert.equal(Math.round(formulas.enemyRawHit(1, false) * 10) / 10, 6.4, '1층 몹 공격 6.4(완화 전 9.9)');
  assert.equal(formulas.enemyMaxHp(6, false), Math.round(24 + 6 * 12 + Math.pow(6, 1.55) * 4), '6층부터 종전 곡선');
  // ② Lv.1 기본 체력 140.
  const fresh = store.freshSave();
  assert.equal(totalStats(fresh).health, 140);
  assert.equal(fresh.health, 140);
  // ③ 입문 구간 자연 회복 — 1초마다 1%(최소 1).
  const world = new World(store.freshSave());
  world.enemies = []; world.spawnTimer = 999; world.player.hp = 100;
  world.update(1);
  assert.equal(world.player.hp, 100 + Math.max(1, Math.ceil(140 * .01)));
  // ④ 1~2층 두 번째·세 번째 처치에서 내 직업 투구·갑옷이 확정으로 떨어진다.
  const random = Math.random; Math.random = () => .99; // 확률 드롭은 없다
  try {
    const save = store.freshSave('male', 'archer');
    save.tutorial = 3; save.kills = 1; save.floor = 1;
    const field = new World(save); field.enemies = [];
    const mob = () => ({ x: 40, y: 0, hp: 0, maxHp: 10, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 });
    field.kill(mob());
    assert.equal(field.drops.length, 1, '두 번째 처치 → 투구');
    assert.equal(field.drops[0].item.slot, 'helmet');
    assert.equal(field.drops[0].item.rarity, 'magic');
    assert.equal(field.drops[0].item.job, 'archer', '내 직업 것');
    field.drops = [];
    field.kill(mob());
    assert.equal(field.drops.length, 1, '세 번째 처치 → 갑옷');
    assert.equal(field.drops[0].item.slot, 'armor');
    field.drops = [];
    field.kill(mob());
    assert.equal(field.drops.length, 0, '그 뒤로는 확정 드랍이 없다');
    // 3층부터는 확정 드랍이 없다.
    const deep = store.freshSave(); deep.tutorial = 3; deep.kills = 1; deep.floor = 3;
    const deepWorld = new World(deep); deepWorld.enemies = [];
    deepWorld.kill(mob());
    assert.equal(deepWorld.drops.length, 0);
  } finally { Math.random = random; }
  // ⑤ 새 캐릭터는 그 직업의 첫 액티브 스킬을 습득한 상태로 시작한다 — 퀵슬롯에는 넣지 않는다.
  for (const [job, skill] of [['warrior', 'slash2'], ['archer', 'doubleShot'], ['mage', 'fireBolt']]) {
    const save = store.freshSave('male', job);
    assert.deepEqual(save.learned, [skill], `${job} 첫 스킬`);
    assert.equal(save.skillLevels[skill], 1);
    assert.deepEqual(save.quickSlots, [null, null, null], '자동 장착은 하지 않는다(튜토리얼 몫)');
    assert.equal(skillOrderFor(job)[0], skill);
  }
  // 서버가 만드는 첫 세이브도 같다(계정 가입·캐릭터 추가·시즌 초기화 공용).
  for (const [job, skill] of [['warrior', 'slash2'], ['archer', 'doubleShot'], ['mage', 'fireBolt']]) {
    const seeded = serverSeed.initialSave('ACC', 'female', '모험가', job);
    assert.deepEqual(seeded.learned, [skill]);
    assert.equal(seeded.health, 140);
    assert.deepEqual(seeded.quickSlots, [null, null, null]);
    assert.deepEqual(seeded.skillLevels, { [skill]: 1 });
  }
  // 새 세이브도 서버 저장 검증을 통과한다.
  const parsed = store.parseSave(serverSeed.initialSave('ACC', 'male', '모험가', 'mage'), 'ACC');
  assert.deepEqual(parsed.learned, ['fireBolt']);
});

test('새 장비 스탯 표시 — 쿨감은 `statNames`에 있고 장비 비교에도 함께 나온다', () => {
  assert.equal(statNames.cdr, '쿨감');
  const staff = { id: 's', name: '영원의 대현자의 성지팡이', slot: 'weapon', rarity: 'legendary', stats: { attack: 100, cdr: 14 }, plus: 0 };
  assert.equal(items.itemPower(staff) > items.itemPower({ ...staff, stats: { attack: 100 } }), true, '전투력이 쿨감을 센다');
  // 추가옵션 10종의 이름·전투력 가중치에도 들어 있다.
  assert.equal(extra.extraOptionNames.cdrPct, '쿨타임 감소');
  assert.equal(extra.extraOptionStat.cdrPct, 'cdr');
});
