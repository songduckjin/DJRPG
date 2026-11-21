import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import './ts-loader.mjs';

const { freshSave, parseSave, totalStats } = await import('../src/game/store.ts');
const { World, archerAttackRange, archerStopRange } = await import('../src/game/world.ts');
const { archerSkillOrder, archerPassiveOrder, mageSkillOrder, magePassiveOrder, skillOrder, passiveOrder, passives, skills } = await import('../src/game/skills.ts');
const { rollItem, rollSkillBook, bowBases, staffBases, baseItems, equipmentImage, baseItemIndex, migrateItem } = await import('../src/game/items.ts');
const { availableSkills, normalizeQuickSlots } = await import('../src/game/loadout.ts');
const { hasSkillUpgrade } = await import('../src/game/skillProgress.ts');
const { equipmentPortraitPlan } = await import('../src/ui/equipmentPortrait.ts');

const assetRoot = fileURLToPath(new URL('../public/assets/', import.meta.url));

function archerSave(gender = 'male') {
  const save = freshSave(gender, 'archer');
  save.knockback = undefined;
  return save;
}

function enemyAt(world, distance) {
  const enemy = { x: world.player.x + distance * .7, y: world.player.y + distance * .7, y: world.player.y, hp: 100000, maxHp: 100000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.enemies = [enemy];
  return enemy;
}

test('직업은 생성할 때 정해지고, 직업이 없는 예전 세이브는 전사로 읽힌다', () => {
  assert.equal(freshSave().job, 'warrior');
  assert.equal(freshSave('female').job, 'warrior');
  assert.equal(freshSave('male', 'archer').job, 'archer');
  const legacy = freshSave();
  delete legacy.job;
  assert.equal(parseSave(JSON.parse(JSON.stringify(legacy))).job, 'warrior');
  const archer = parseSave(JSON.parse(JSON.stringify(freshSave('female', 'archer'))));
  assert.equal(archer.job, 'archer');
  assert.equal(archer.gender, 'female');
});

test('궁수 세이브는 저장·로그인을 거쳐도 습득 스킬과 퀵슬롯이 그대로 남는다', () => {
  const save = archerSave('female');
  save.learned = ['doubleShot', 'snipe'];
  save.quickSlots = ['snipe', 'doubleShot', null];
  save.passives = ['bowMastery'];
  save.skillLevels = { doubleShot: 4, snipe: 2, bowMastery: 6 };
  const loaded = parseSave(JSON.parse(JSON.stringify(save)));
  assert.deepEqual(loaded.learned, ['doubleShot', 'snipe']);
  assert.deepEqual(loaded.quickSlots, ['snipe', 'doubleShot', null]);
  assert.deepEqual(loaded.passives, ['bowMastery']);
  assert.equal(loaded.skillLevels.doubleShot, 4);
  assert.equal(loaded.skillLevels.bowMastery, 6);
});

test('전사 세이브는 직업 필드가 생겨도 장비·진행이 그대로 보존된다', () => {
  const save = freshSave();
  save.level = 17; save.gold = 1234; save.equipment.weapon = { id: 'w', name: '영원의 패왕의 성검', slot: 'weapon', rarity: 'legendary', stats: { attack: 99 } };
  const loaded = parseSave(JSON.parse(JSON.stringify(save)));
  assert.equal(loaded.job, 'warrior');
  assert.equal(loaded.level, 17);
  assert.equal(loaded.gold, 1234);
  assert.equal(loaded.equipment.weapon.name, '영원의 패왕의 성검');
  assert.equal(loaded.equipment.weapon.stats.attack, 99);
});

test('궁수는 액티브 8종·패시브 3종을 따로 가지며 전사 목록을 섞지 않는다', () => {
  assert.equal(archerSkillOrder.length, 8);
  assert.equal(archerPassiveOrder.length, 3);
  assert.equal(skillOrder.length, 8);
  assert.deepEqual(archerSkillOrder.map(id => id), ['doubleShot', 'multiShot', 'pierceShot', 'iceArrow', 'hawkEye', 'snipe', 'stormVolley', 'arrowRain']);
  assert.deepEqual(archerPassiveOrder, ['bowMastery', 'swiftStep', 'hawkSight']);
  for (const id of archerSkillOrder) { assert(skills[id].name.length > 0); assert(skills[id].range >= 200); }
  for (const id of archerPassiveOrder) assert(passives[id].description.length > 0);
  // 궁수 세이브의 퀵슬롯은 궁수 스킬만 받는다.
  const save = archerSave();
  const slots = normalizeQuickSlots(['doubleShot', 'slash2', 'snipe'], ['doubleShot', 'slash2', 'snipe'], 'archer');
  assert.deepEqual(slots, ['doubleShot', null, 'snipe']);
  save.learned = ['doubleShot', 'snipe'];
  assert.deepEqual(availableSkills(save), ['doubleShot', 'snipe']);
  save.quickSlots = ['doubleShot', null, null];
  assert.deepEqual(availableSkills(save), ['snipe']);
});

test('스킬북은 세 직업이 같은 확률로 떨어진다 (작업 204 사용자 확정)', () => {
  // "다른직업 장비나 스킬북도 동일확률로 뜰수있어" — 직업을 먼저 1/3로 고른 뒤 그 직업 목록에서 뽑는다.
  const pools = {
    warrior: [...skillOrder, ...passiveOrder],
    archer: [...archerSkillOrder, ...archerPassiveOrder],
    mage: [...mageSkillOrder, ...magePassiveOrder]
  };
  const random = Math.random;
  try {
    let state = 20260;
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
    let state = 777;
    Math.random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    const counts = { warrior: 0, archer: 0, mage: 0 };
    let weapons = 0;
    for (let index = 0; index < 6000; index++) {
      const item = rollItem(20, false, false, 'archer');
      if (item.slot !== 'weapon') continue;
      weapons++;
      const owner = bowBases.some(name => item.name.endsWith(name)) ? 'archer'
        : staffBases.some(name => item.name.endsWith(name)) ? 'mage' : 'warrior';
      if (owner === 'warrior') assert(baseItems.weapon.some(name => item.name.endsWith(name)), `대검 목록에 없는 무기 이름: ${item.name}`);
      counts[owner]++;
    }
    assert(weapons > 400, `무기 드랍 표본이 너무 적다 (${weapons})`);
    for (const [job, count] of Object.entries(counts)) assert(Math.abs(count / weapons - 1 / 3) < .05, `${job} 무기 비중 ${(count / weapons * 100).toFixed(1)}%`);
    const starter = rollItem(1, true, false, 'archer');
    assert.equal(starter.name, '낡은 사냥꾼의 활');
    assert.equal(rollItem(1, true).name, '낡은 두손검');
    assert.equal(rollItem(1, true, false, 'mage').name, '낡은 견습생의 지팡이');
  } finally { Math.random = random; }
});

test('활 아이콘은 전용 시트를 가리키고, 활 이름은 저장·불러오기에서 유지된다', () => {
  const bow = { id: 'b', name: '영원의 패왕의 신궁', slot: 'weapon', rarity: 'legendary', stats: { attack: 50 } };
  assert.equal(baseItemIndex(bow), 9);
  assert.deepEqual(equipmentImage(bow), { path: '/assets/item-art/bow_5.png', frame: 4, columns: 5 });
  const low = { id: 'b2', name: '사냥꾼의 활', slot: 'weapon', rarity: 'common', stats: { attack: 5 } };
  assert.deepEqual(equipmentImage(low), { path: '/assets/item-art/bow_0.png', frame: 0, columns: 5 });
  const saved = migrateItem(bow);
  assert.equal(saved.name, '영원의 패왕의 신궁');
  assert.equal(baseItemIndex({ ...saved, name: '황혼의 혈염 장궁' }), 6);
  // 대검 목록은 그대로 남아 있다.
  assert.equal(baseItems.weapon.length, 10);
  assert.equal(bowBases.length, 10);
});

test('궁수 평타는 멈춰 서서 화살을 쏘고, 화살이 도착한 뒤에 피해가 들어간다', () => {
  const save = archerSave();
  const world = new World(save);
  world.spawnTimer = 999;
  const enemy = enemyAt(world, 100);
  world.update(.016);
  // 정지 거리 안이므로 다가가지 않고 그 자리에서 쏜다.
  assert.equal(Math.hypot(world.activeMove.x, world.activeMove.y), 0);
  assert.equal(world.player.x, 0);
  const shot = world.effects.find(effect => effect.kind === 'shot');
  assert(shot, '화살 이펙트가 없다');
  assert.equal(enemy.hp, 100000, '날아가는 동안에는 맞지 않는다');
  for (let index = 0; index < 40 && enemy.hp === 100000; index++) world.update(.016);
  assert(enemy.hp < 100000, '화살이 도착하면 피해가 들어간다');
});

test('궁수는 사거리 밖에서만 다가가고, 사거리 안에서는 서서 쏜다', () => {
  const world = new World(archerSave());
  world.spawnTimer = 999; world.cooldown.attack = 999;
  const enemy = world.enemies[0]; enemy.hp = enemy.maxHp = 10000;
  // 거리 기대값은 상수에서 만든다 — 사거리 간격을 조정해도(작업 207) 의미가 그대로다.
  enemy.x = world.player.x + archerStopRange + 20; enemy.y = world.player.y;
  world.update(.05);
  assert(Math.hypot(world.activeMove.x, world.activeMove.y) > .05, '정지 거리 밖에서는 다가간다');
  enemy.x = world.player.x + archerStopRange - 20; enemy.y = world.player.y;
  world.update(.05);
  assert.equal(world.activeMove.x, 0);
  assert.equal(world.activeMove.y, 0);
  assert.equal(world.pursuing, false);
  assert(archerAttackRange > archerStopRange);
});

test('직업별 사거리 간격은 궁수 > 마법사 > 전사(90) 순서다', async () => {
  const { mageAttackRange, mageStopRange } = await import('../src/game/world.ts');
  // 작업 207 확정 수치 → 마법사 240/130(작업 216) → 궁수 330/180·마법사 285/160(작업 244 사거리 소폭 상향).
  assert.equal(archerAttackRange, 330); assert.equal(archerStopRange, 180);
  assert.equal(mageAttackRange, 285); assert.equal(mageStopRange, 160);
  assert(archerAttackRange > mageAttackRange && mageAttackRange > 90, '사거리: 궁수 > 마법사 > 전사');
  assert(archerStopRange > mageStopRange && mageStopRange > 90, '정지 거리: 궁수 > 마법사 > 전사');
});

test('궁수 스킬 8종은 화살·화살비 이펙트를 만들고 피해를 준다', () => {
  for (const id of archerSkillOrder) {
    const save = archerSave();
    save.learned = [id]; save.quickSlots = [id, null, null];
    const world = new World(save);
    world.spawnTimer = 999; world.cooldown.attack = 999;
    const enemy = enemyAt(world, 180);
    world.action(id);
    const { effects } = world;
    assert(effects.length > 0, `${id}: 이펙트가 없다`);
    for (let index = 0; index < 80; index++) world.update(.02);
    if (id === 'hawkEye') {
      assert(world.player.berserk > 0, '호크아이는 공격 버프를 건다');
      assert(effects.some(effect => effect.kind === 'hawk'));
    } else {
      assert(enemy.hp < 100000 || world.enemies.length === 0 || enemy.hp <= 0, `${id}: 피해가 없다`);
    }
  }
});

test('궁수는 전사용 갑옷·대검을 그리지 않고, 궁수 갑옷·투구·활 시트와 파츠를 쓴다', () => {
  const save = archerSave('female');
  // 전사용 갑옷 이름을 입어도 궁수는 자기 시트를 쓴다.
  save.equipment.armor = { id: 'a', name: '황혼의 드래곤 메일', slot: 'armor', rarity: 'rare', stats: { defense: 10 } };
  save.equipment.helmet = { id: 'h', name: '황혼의 기사 헬름', slot: 'helmet', rarity: 'rare', stats: { defense: 5 } };
  save.equipment.weapon = { id: 'w', name: '황혼의 혈염 장궁', slot: 'weapon', rarity: 'rare', stats: { attack: 30 } };
  const plan = equipmentPortraitPlan(save);
  // 작업 205: 궁수 갑옷 1~9번은 그 티어의 **머리 지운** 갑옷 시트(활도 지운 판) 위에 궁수 투구·활 파츠를 얹는다.
  assert.equal(plan.base, '/assets/pilot-25d/archer_armors/nobow/headless/archer_female_armor_7_idle_v1.png?v=5');
  assert.equal(plan.helmet, undefined, '전사 투구 파츠는 궁수에게 쓰지 않는다');
  assert.equal(plan.weapon, undefined, '전사 대검 파츠는 궁수에게 쓰지 않는다');
  assert.equal(plan.archerHelm?.path, '/assets/pilot-25d/archer_helms/female_3_v1.png?v=5');
  assert.equal(plan.bow?.path, '/assets/pilot-25d/bows/bow_6_v1.png?v=5');
  assert.equal(plan.key, 'archer:female:a7:/assets/pilot-25d/bows/bow_6_v1.png?v=5:/assets/pilot-25d/archer_helms/female_3_v1.png?v=5');
  // 능력치는 그대로 오른다.
  const bare = archerSave('female');
  assert(totalStats(save).attack > totalStats(bare).attack);
});

test('궁수 0번(사냥꾼의 활)은 기본 시트를 그대로 쓰고 활 파츠를 얹지 않는다', () => {
  const save = archerSave('male');
  save.equipment.weapon = { id: 'w0', name: '사냥꾼의 활', slot: 'weapon', rarity: 'common', stats: { attack: 4 } };
  const plan = equipmentPortraitPlan(save);
  assert.equal(plan.base, '/assets/pilot-25d/archer_male_idle_v1.png?v=5');
  assert.equal(plan.bow, undefined);
});

test('궁수 기본 시트 6장은 전사와 같은 셀 규격의 RGBA PNG다', () => {
  const sizes = { idle: [362, 362], walk: [1448, 362], attack: [1448, 362] };
  for (const gender of ['male', 'female']) for (const [motion, [width, height]] of Object.entries(sizes)) {
    const path = join(assetRoot, 'pilot-25d', `archer_${gender}_${motion}_v1.png`);
    assert(existsSync(path), `${path} 가 없다`);
    const data = readFileSync(path);
    assert.equal(data.toString('ascii', 1, 4), 'PNG');
    assert.equal(data.readUInt32BE(16), width);
    assert.equal(data.readUInt32BE(20), height);
    assert.equal(data[25], 6, 'RGBA PNG여야 한다');
  }
});

test('궁수 시트 URL은 모두 캐시 버스터(?v=)를 단다', () => {
  // `/assets/*`는 `public/_headers`가 immutable 1년 캐시로 고정한다. 시트를 갈아도 URL이 같으면
  // 브라우저가 옛 그림을 계속 쓰므로, 궁수 시트를 참조하는 곳은 전부 버전 쿼리를 붙여야 한다(작업 159).
  // 작업 224: 버전은 `render/pilotAssets.ts`의 `PILOT_ASSET_VERSION` 한 곳에서 나오므로, 경로를 직접
  // 적는 대신 `pilotSheet()`를 거치거나 `?v=N`을 붙인 줄만 통과한다.
  for (const file of ['src/game/render.ts', 'src/ui/equipmentPortrait.ts']) {
    const lines = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').split('\n').filter(line => line.includes('archer') && line.includes('_v1.png'));
    assert(lines.length > 0, `${file}: 궁수 시트 경로가 없다`);
    for (const line of lines) {
      assert(
        /_v1\.png\?v=\d/.test(line) || line.includes('pilotSheet('),
        `${file}: 캐시 버스터 없는 경로 — ${line.trim()}`
      );
    }
  }
  // 작업 210: 캐릭터 선택 카드는 자기 시트 경로를 직접 쓰지 않고 공용 초상화 경로(`equipmentPortrait.ts`)를
  // 그대로 쓴다 — 버전 쿼리 규칙이 한 곳에만 있어야 카드만 옛 그림을 캐시하는 일이 없다.
  const card = readFileSync(new URL('../src/ui/modals/charactersModal.ts', import.meta.url), 'utf8');
  assert.equal(/_v1\.png/.test(card), false, 'charactersModal.ts가 시트 경로를 직접 만들지 않는다');
  assert(card.includes("from '../equipmentPortrait'"));
});

test('궁수 스킬북도 강화 가능 표시에 잡힌다', () => {
  const save = archerSave();
  assert.equal(hasSkillUpgrade(save), false);
  save.bag = [{ id: 'book', name: '[스킬북] 더블 샷', slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId: 'doubleShot', stats: {} }];
  assert.equal(hasSkillUpgrade(save), true);
});
