import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import './ts-loader.mjs';

const { freshSave, parseSave, totalStats } = await import('../src/game/store.ts');
const { World, archerAttackRange, archerStopRange } = await import('../src/game/world.ts');
const { archerSkillOrder, archerPassiveOrder, skillOrder, passiveOrder, passives, skills } = await import('../src/game/skills.ts');
const { rollItem, rollSkillBook, bowBases, baseItems, equipmentImage, baseItemIndex, migrateItem } = await import('../src/game/items.ts');
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

test('궁수 스킬북은 궁수 스킬만 떨어지고, 전사 스킬북은 그대로다', () => {
  const random = Math.random;
  try {
    Math.random = () => .5;
    for (let index = 0; index < 20; index++) {
      const book = rollSkillBook(30, 'archer');
      assert(archerSkillOrder.includes(book.skillId) || archerPassiveOrder.includes(book.skillId));
      const warrior = rollSkillBook(30, 'warrior');
      assert(skillOrder.includes(warrior.skillId) || passiveOrder.includes(warrior.skillId));
    }
  } finally { Math.random = random; }
});

test('궁수 장비 드랍은 활 10종만 쓰고, 전사 드랍은 대검 그대로다', () => {
  const random = Math.random;
  try {
    const seen = new Set();
    for (let index = 0; index < 4000; index++) {
      const item = rollItem(20, false, false, 'archer');
      if (item.slot !== 'weapon') continue;
      seen.add(baseItemIndex(item));
      const base = bowBases.find(name => item.name.endsWith(name));
      assert(base, `활 목록에 없는 무기 이름: ${item.name}`);
    }
    assert(seen.size > 1);
    const warrior = rollItem(20, false, false, 'warrior');
    if (warrior.slot === 'weapon') {
      assert(!bowBases.some(name => warrior.name.endsWith(name)), '전사 드랍에 활이 섞였다');
    }
    const starter = rollItem(1, true, false, 'archer');
    assert.equal(starter.name, '낡은 사냥꾼의 활');
    assert.equal(rollItem(1, true).name, '낡은 두손검');
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
  // 정지 거리(118) 안이므로 다가가지 않고 그 자리에서 쏜다.
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
  const enemy = world.enemies[0];
  enemy.x = world.player.x + 99; enemy.y = world.player.y + 99; enemy.hp = enemy.maxHp = 10000;
  world.update(.05);
  assert(Math.hypot(world.activeMove.x, world.activeMove.y) > .05, '정지 거리 밖에서는 다가간다');
  enemy.x = world.player.x + 70; enemy.y = world.player.y + 70;
  world.update(.05);
  assert.equal(world.activeMove.x, 0);
  assert.equal(world.activeMove.y, 0);
  assert(archerAttackRange > archerStopRange);
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
  // 작업 203: 궁수 갑옷 1~9번은 그 티어의 **머리 지운** 갑옷 시트(활도 지운 판) 위에 궁수 투구·활 파츠를 얹는다.
  assert.equal(plan.base, '/assets/pilot-25d/archer_armors/nobow/headless/archer_female_armor_7_idle_v1.png');
  assert.equal(plan.helmet, undefined, '전사 투구 파츠는 궁수에게 쓰지 않는다');
  assert.equal(plan.weapon, undefined, '전사 대검 파츠는 궁수에게 쓰지 않는다');
  assert.equal(plan.archerHelm?.path, '/assets/pilot-25d/archer_helms/female_3_v1.png');
  assert.equal(plan.bow?.path, '/assets/pilot-25d/bows/bow_6_v1.png');
  assert.equal(plan.key, 'archer:female:a7:/assets/pilot-25d/bows/bow_6_v1.png:/assets/pilot-25d/archer_helms/female_3_v1.png');
  // 능력치는 그대로 오른다.
  const bare = archerSave('female');
  assert(totalStats(save).attack > totalStats(bare).attack);
});

test('궁수 0번(사냥꾼의 활)은 기본 시트를 그대로 쓰고 활 파츠를 얹지 않는다', () => {
  const save = archerSave('male');
  save.equipment.weapon = { id: 'w0', name: '사냥꾼의 활', slot: 'weapon', rarity: 'common', stats: { attack: 4 } };
  const plan = equipmentPortraitPlan(save);
  assert.equal(plan.base, '/assets/pilot-25d/archer_male_idle_v1.png?v=2');
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
  for (const file of ['src/game/render.ts', 'src/ui/equipmentPortrait.ts', 'src/ui/modals/charactersModal.ts']) {
    const lines = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').split('\n').filter(line => line.includes('archer') && line.includes('_v1.png'));
    assert(lines.length > 0, `${file}: 궁수 시트 경로가 없다`);
    for (const line of lines) assert.doesNotMatch(line, /_v1\.png(?!\?v=\d)/, `${file}: 캐시 버스터 없는 경로 — ${line.trim()}`);
  }
});

test('궁수 스킬북도 강화 가능 표시에 잡힌다', () => {
  const save = archerSave();
  assert.equal(hasSkillUpgrade(save), false);
  save.bag = [{ id: 'book', name: '[스킬북] 더블 샷', slot: 'skillbook', rarity: 'rare', kind: 'skillbook', skillId: 'doubleShot', stats: {} }];
  assert.equal(hasSkillUpgrade(save), true);
});
