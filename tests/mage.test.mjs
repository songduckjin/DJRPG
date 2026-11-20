import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import './ts-loader.mjs';

const { freshSave, parseSave, totalStats } = await import('../src/game/store.ts');
const { World, mageAttackRange, mageStopRange } = await import('../src/game/world.ts');
const { mageSkillOrder, magePassiveOrder, skillOrder, archerSkillOrder, archerPassiveOrder, passiveOrder, passives, skills, jobNames, jobs, jobOrDefault } = await import('../src/game/skills.ts');
const { rollItem, rollSkillBook, staffBases, bowBases, baseItems, equipmentImage, baseItemIndex, migrateItem, slotNameFor, staffIndex, isStaff } = await import('../src/game/items.ts');
const { availableSkills, normalizeQuickSlots } = await import('../src/game/loadout.ts');
const { hasSkillUpgrade } = await import('../src/game/skillProgress.ts');
const { equipmentPortraitPlan } = await import('../src/ui/equipmentPortrait.ts');

const assetRoot = fileURLToPath(new URL('../public/assets/', import.meta.url));

function mageSave(gender = 'male') {
  return freshSave(gender, 'mage');
}

function enemyAt(world, distance) {
  const enemy = { x: world.player.x + distance * .7, y: world.player.y + distance * .7, hp: 100000, maxHp: 100000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.enemies = [enemy];
  return enemy;
}

test('직업 목록에 마법사가 있고, 직업이 없는 예전 세이브는 그대로 전사로 읽힌다', () => {
  assert.deepEqual([...jobs], ['warrior', 'archer', 'mage']);
  assert.equal(jobNames.mage, '마법사');
  assert.equal(freshSave('male', 'mage').job, 'mage');
  const legacy = freshSave();
  delete legacy.job;
  assert.equal(parseSave(JSON.parse(JSON.stringify(legacy))).job, 'warrior');
  // 기존 전사·궁수 세이브의 직업은 그대로 보존된다.
  assert.equal(parseSave(JSON.parse(JSON.stringify(freshSave('female', 'archer')))).job, 'archer');
  assert.equal(parseSave(JSON.parse(JSON.stringify(freshSave('female', 'mage')))).job, 'mage');
});

test('마법사 세이브는 저장·로그인을 거쳐도 습득 스킬과 퀵슬롯이 그대로 남는다', () => {
  const save = mageSave('female');
  save.learned = ['fireBolt', 'meteorStrike'];
  save.quickSlots = ['meteorStrike', 'fireBolt', null];
  save.passives = ['staffMastery'];
  save.skillLevels = { fireBolt: 4, meteorStrike: 2, staffMastery: 6 };
  const loaded = parseSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(loaded.learned, ['fireBolt', 'meteorStrike']);
  assert.deepEqual(loaded.quickSlots, ['meteorStrike', 'fireBolt', null]);
  assert.deepEqual(loaded.passives, ['staffMastery']);
  assert.equal(loaded.skillLevels.fireBolt, 4);
  assert.equal(loaded.skillLevels.staffMastery, 6);
});

test('전사·궁수 세이브는 마법사가 추가되어도 장비·진행이 그대로 보존된다', () => {
  const save = freshSave();
  save.level = 17; save.gold = 1234;
  save.equipment.weapon = { id: 'w', name: '영원의 패왕의 성검', slot: 'weapon', rarity: 'legendary', stats: { attack: 99 } };
  const loaded = parseSave(JSON.parse(JSON.stringify(save)));
  assert.equal(loaded.job, 'warrior');
  assert.equal(loaded.level, 17);
  assert.equal(loaded.gold, 1234);
  assert.equal(loaded.equipment.weapon.name, '영원의 패왕의 성검');
  const archer = freshSave('male', 'archer');
  archer.equipment.weapon = { id: 'b', name: '영원의 패왕의 신궁', slot: 'weapon', rarity: 'legendary', stats: { attack: 60 } };
  assert.equal(parseSave(JSON.parse(JSON.stringify(archer))).equipment.weapon.name, '영원의 패왕의 신궁');
});

test('마법사는 액티브 8종·패시브 3종을 따로 가지며 다른 직업 목록을 섞지 않는다', () => {
  assert.equal(mageSkillOrder.length, 8);
  assert.equal(magePassiveOrder.length, 3);
  assert.deepEqual([...mageSkillOrder], ['fireBolt', 'iceBolt', 'chainLightning', 'manaBurst', 'frostNova', 'arcaneShield', 'meteorStrike', 'arcaneOverlord']);
  assert.deepEqual([...magePassiveOrder], ['staffMastery', 'manaCircuit', 'arcaneSense']);
  for (const id of mageSkillOrder) { assert(skills[id].name.length > 0); assert(skills[id].range >= 120); }
  for (const id of magePassiveOrder) assert(passives[id].description.length > 0);
  // 전사·궁수 목록은 그대로다.
  assert.deepEqual([...skillOrder], ['slash2', 'slam', 'warcry', 'power', 'destroy', 'hell', 'crushing', 'spin']);
  assert.deepEqual([...archerSkillOrder], ['doubleShot', 'multiShot', 'pierceShot', 'iceArrow', 'hawkEye', 'snipe', 'stormVolley', 'arrowRain']);
  assert.deepEqual([...passiveOrder], ['mastery', 'body', 'instinct']);
  // 마법사 세이브의 퀵슬롯은 마법사 스킬만 받는다.
  assert.deepEqual(normalizeQuickSlots(['fireBolt', 'slash2', 'meteorStrike'], ['fireBolt', 'slash2', 'meteorStrike'], 'mage'), ['fireBolt', null, 'meteorStrike']);
  const save = mageSave();
  save.learned = ['fireBolt', 'meteorStrike'];
  assert.deepEqual(availableSkills(save), ['fireBolt', 'meteorStrike']);
  save.quickSlots = ['fireBolt', null, null];
  assert.deepEqual(availableSkills(save), ['meteorStrike']);
});

test('스킬북은 세 직업이 같은 확률로 떨어진다 (작업 204 사용자 확정)', () => {
  // 직업을 먼저 1/3로 고른 뒤 그 직업 목록에서 뽑는다 — 마법사 세이브도 전사·궁수 스킬북을 받는다.
  const pools = {
    warrior: [...skillOrder, ...passiveOrder],
    archer: [...archerSkillOrder, ...archerPassiveOrder],
    mage: [...mageSkillOrder, ...magePassiveOrder]
  };
  const random = Math.random;
  try {
    let state = 4048;
    Math.random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    const samples = 3000, counts = { warrior: 0, archer: 0, mage: 0 };
    for (let index = 0; index < samples; index++) {
      const book = rollSkillBook(30);
      const owner = Object.keys(pools).find(job => pools[job].includes(book.skillId));
      assert(owner, `세 직업 스킬 목록에 없는 스킬북: ${book.skillId}`);
      counts[owner]++;
    }
    for (const [job, count] of Object.entries(counts)) assert(Math.abs(count / samples - 1 / 3) < .04, `${job} 스킬북 비중 ${(count / samples * 100).toFixed(1)}%`);
  } finally { Math.random = random; }
});

test('무기 드랍은 세 직업 목록이 1/3씩 섞여 나오고, 튜토리얼 첫 무기는 내 직업이다', () => {
  const random = Math.random;
  try {
    let state = 909;
    Math.random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    const counts = { warrior: 0, archer: 0, mage: 0 };
    let weapons = 0;
    for (let index = 0; index < 6000; index++) {
      const item = rollItem(20, false, false, 'mage');
      if (item.slot !== 'weapon') continue;
      weapons++;
      const owner = staffBases.some(name => item.name.endsWith(name)) ? 'mage'
        : bowBases.some(name => item.name.endsWith(name)) ? 'archer' : 'warrior';
      if (owner === 'warrior') assert(baseItems.weapon.some(name => item.name.endsWith(name)), `대검 목록에 없는 무기 이름: ${item.name}`);
      counts[owner]++;
    }
    assert(weapons > 400, `무기 드랍 표본이 너무 적다 (${weapons})`);
    for (const [job, count] of Object.entries(counts)) assert(Math.abs(count / weapons - 1 / 3) < .05, `${job} 무기 비중 ${(count / weapons * 100).toFixed(1)}%`);
    assert.equal(staffBases.length, 10);
    assert.equal(bowBases.length, 10);
    assert.equal(baseItems.weapon.length, 10);
    const starter = rollItem(1, true, false, 'mage');
    assert.equal(starter.name, '낡은 견습생의 지팡이');
    assert.equal(rollItem(1, true).name, '낡은 두손검');
    assert.equal(rollItem(1, true, false, 'archer').name, '낡은 사냥꾼의 활');
  } finally { Math.random = random; }
});

test('지팡이 아이콘은 전용 시트를 가리키고, 지팡이 이름은 저장·불러오기에서 유지된다', () => {
  const staff = { id: 's', name: '영원의 대현자의 성지팡이', slot: 'weapon', rarity: 'legendary', stats: { attack: 50 } };
  assert.equal(baseItemIndex(staff), 9);
  assert.equal(staffIndex(staff), 9);
  assert(isStaff(staff));
  assert.deepEqual(equipmentImage(staff), { path: '/assets/item-art/staff_5.png', frame: 4, columns: 5 });
  const low = { id: 's2', name: '견습생의 지팡이', slot: 'weapon', rarity: 'common', stats: { attack: 5 } };
  assert.deepEqual(equipmentImage(low), { path: '/assets/item-art/staff_0.png', frame: 0, columns: 5 });
  const saved = migrateItem(staff);
  assert.equal(saved.name, '영원의 대현자의 성지팡이');
  assert.equal(baseItemIndex({ ...saved, name: '황혼의 혈염 지팡이' }), 6);
  // 무기 슬롯 표기만 직업을 따른다.
  assert.equal(slotNameFor('weapon', 'mage'), '지팡이');
  assert.equal(slotNameFor('weapon', 'archer'), '활');
  assert.equal(slotNameFor('weapon', 'warrior'), '두손검');
  assert.equal(slotNameFor('armor', 'mage'), '갑옷');
});

test('마법사 평타는 멈춰 서서 마법 구슬을 쏘고, 구슬이 도착한 뒤에 피해가 들어간다', () => {
  const world = new World(mageSave());
  world.spawnTimer = 999;
  const enemy = enemyAt(world, 100);
  world.update(.016);
  assert.equal(Math.hypot(world.activeMove.x, world.activeMove.y), 0);
  const shot = world.effects.find(effect => effect.kind === 'shot');
  assert(shot, '마법 구슬 이펙트가 없다');
  assert.equal(shot.variant, 'arcane', '남성 마법사는 푸른 마력 구슬을 쓴다');
  assert.equal(enemy.hp, 100000, '날아가는 동안에는 맞지 않는다');
  for (let index = 0; index < 40 && enemy.hp === 100000; index++) world.update(.016);
  assert(enemy.hp < 100000, '구슬이 도착하면 피해가 들어간다');
  // 여성 마법사는 붉은 화염 구슬을 쓴다.
  const female = new World(mageSave('female'));
  female.spawnTimer = 999; enemyAt(female, 100); female.update(.016);
  assert.equal(female.effects.find(effect => effect.kind === 'shot')?.variant, 'fire');
});

test('마법사는 사거리 밖에서만 다가가고, 사거리 안에서는 서서 쏜다', () => {
  const world = new World(mageSave());
  world.spawnTimer = 999; world.cooldown.attack = 999;
  const enemy = world.enemies[0]; enemy.hp = enemy.maxHp = 10000;
  // 거리 기대값은 상수에서 만든다 — 사거리 간격을 조정해도(작업 207) 의미가 그대로다.
  enemy.x = world.player.x + mageStopRange + 20; enemy.y = world.player.y;
  world.update(.05);
  assert(Math.hypot(world.activeMove.x, world.activeMove.y) > .05, '정지 거리 밖에서는 다가간다');
  enemy.x = world.player.x + mageStopRange - 20; enemy.y = world.player.y;
  world.update(.05);
  assert.equal(world.activeMove.x, 0);
  assert.equal(world.activeMove.y, 0);
  assert.equal(world.pursuing, false);
  assert(mageAttackRange > mageStopRange);
});

test('마법사 스킬 8종은 각자의 이펙트를 만들고 피해나 버프를 준다', () => {
  for (const id of mageSkillOrder) {
    const save = mageSave();
    save.learned = [id]; save.quickSlots = [id, null, null];
    const world = new World(save);
    world.spawnTimer = 999; world.cooldown.attack = 999;
    const enemy = enemyAt(world, 150);
    world.action(id);
    const { effects } = world;
    assert(effects.length > 0, `${id}: 이펙트가 없다`);
    for (let index = 0; index < 90; index++) world.update(.02);
    if (id === 'arcaneShield') {
      assert(world.player.berserk > 0, '아케인 실드는 공격 버프를 건다');
      assert(effects.some(effect => effect.kind === 'ward'));
    } else {
      assert(enemy.hp < 100000 || world.enemies.length === 0 || enemy.hp <= 0, `${id}: 피해가 없다`);
    }
  }
  // 투사체 스킬은 마법 구슬('shot')로, 폭발·노바는 전용 이펙트로 나간다.
  const projectile = new World(mageSave());
  projectile.spawnTimer = 999; projectile.cooldown.attack = 999;
  enemyAt(projectile, 150);
  for (const id of ['fireBolt', 'iceBolt', 'chainLightning']) {
    projectile.save.learned = [id]; projectile.save.quickSlots = [id, null, null];
    projectile.effects = []; projectile.cooldown[id] = 0;
    projectile.action(id);
    assert(projectile.effects.some(effect => effect.kind === 'shot'), `${id}: 마법 구슬이 없다`);
  }
  for (const id of ['manaBurst', 'meteorStrike']) {
    projectile.effects = []; projectile.cooldown[id] = 0;
    projectile.save.learned = [id]; projectile.save.quickSlots = [id, null, null];
    projectile.action(id);
    assert(projectile.effects.some(effect => effect.kind === 'burst'), `${id}: 폭발 이펙트가 없다`);
  }
  for (const id of ['frostNova', 'arcaneOverlord']) {
    projectile.effects = []; projectile.cooldown[id] = 0;
    projectile.save.learned = [id]; projectile.save.quickSlots = [id, null, null];
    projectile.action(id);
    assert(projectile.effects.some(effect => effect.kind === 'nova'), `${id}: 노바 이펙트가 없다`);
  }
});

test('마법사는 갑옷 티어의 전용 로브를 쓰고 전사용 투구·검 파츠는 그리지 않는다', () => {
  const save = mageSave('female');
  save.equipment.armor = { id: 'a', name: '황혼의 드래곤 메일', slot: 'armor', rarity: 'rare', stats: { defense: 10 } };
  save.equipment.helmet = { id: 'h', name: '황혼의 기사 헬름', slot: 'helmet', rarity: 'rare', stats: { defense: 5 } };
  save.equipment.weapon = { id: 'w', name: '황혼의 혈염 지팡이', slot: 'weapon', rarity: 'rare', stats: { attack: 30 } };
  const plan = equipmentPortraitPlan(save);
  // 작업 201: 지팡이를 차면 기본 지팡이를 지운 시트 위에 지팡이 파츠를 얹는다(전사 갑옷·투구·검은 그대로 제외).
  // 작업 204: 투구를 쓰면 마법사 전용 모자·투구 파츠를 쓰고, 본체는 같은 자리에서 머리를 지운 시트다.
  // 작업 208: 갑옷 7번(드래곤 메일)을 입으면 그 티어 로브(지팡이 없는) 시트를 쓰고, 투구를 함께 쓰면
  //           로브의 **머리 없는 판**을 쓴다. 지팡이·투구는 파츠로 얹는다.
  assert.equal(plan.base, '/assets/pilot-25d/robes/headless/mage_female_robe_7_idle_v1.png');
  assert.equal(plan.helmet, undefined);
  assert.equal(plan.weapon, undefined);
  assert.equal(plan.staff?.path, '/assets/pilot-25d/staffs/staff_6_v1.png', '황혼의 혈염 지팡이 → 6번');
  assert.equal(plan.mageHelm?.path, '/assets/pilot-25d/mage_helms/female_3_v1.png', '황혼의 기사 헬름 → 3번');
  assert.equal(plan.key, 'mage:female:r7:/assets/pilot-25d/staffs/staff_6_v1.png:/assets/pilot-25d/mage_helms/female_3_v1.png');
  const bare = mageSave('female');
  // [작업 216] 지팡이를 안 찬 빈손이므로 기본 지팡이를 지운 판(nostaff)을 쓴다.
  assert.equal(equipmentPortraitPlan(bare).base, '/assets/pilot-25d/mage_nostaff/mage_female_idle_v1.png?v=2');
  // 능력치는 그대로 오른다.
  assert(totalStats(save).attack > totalStats(mageSave('female')).attack);
  // 전사 초상화 계획은 마법사와 섞이지 않는다.
  assert.equal(equipmentPortraitPlan(freshSave('female')).base, '/assets/pilot-25d/noweapon/warrior_female_idle_v1.png');
});

test('마법사 기본 시트 6장은 전사와 같은 셀 규격의 RGBA PNG다', () => {
  const sizes = { idle: [362, 362], walk: [1448, 362], attack: [1448, 362] };
  for (const gender of ['male', 'female']) for (const [motion, [width, height]] of Object.entries(sizes)) {
    const path = join(assetRoot, 'pilot-25d', `mage_${gender}_${motion}_v1.png`);
    assert(existsSync(path), `${path} 가 없다`);
    const data = readFileSync(path);
    assert.equal(data.toString('ascii', 1, 4), 'PNG');
    assert.equal(data.readUInt32BE(16), width);
    assert.equal(data.readUInt32BE(20), height);
    assert.equal(data[25], 6, 'RGBA PNG여야 한다');
    assert(data.length < 420 * 1024, `${path} 가 420KB를 넘는다`);
  }
});

test('마법사 스킬북도 강화 가능 표시에 잡힌다', () => {
  const save = mageSave();
  assert.equal(hasSkillUpgrade(save), false);
  save.bag = [{ id: 'book', name: '[스킬북] 파이어 볼트', slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId: 'fireBolt', stats: {} }];
  assert.equal(hasSkillUpgrade(save), true);
});
