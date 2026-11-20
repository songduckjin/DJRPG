import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { World, WEAPON_REQUIRED_NOTICE, WEAPON_NOTICE_COOLDOWN } = await import('../src/game/world.ts');

const weapon = () => ({ id: 'w-216', name: '낡은 두손검', slot: 'weapon', rarity: 'common', stats: { attack: 4 } });
const enemyAt = (world, x, y) => {
  const enemy = { x, y, hp: 100000, maxHp: 100000, boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
  world.enemies.push(enemy);
  return enemy;
};
const capture = world => {
  const messages = [];
  world.onMessage = text => messages.push(text);
  return messages;
};

/**
 * 무기 미장착 시 공격 불가 + 장착 안내(작업 216).
 *
 * 전사·궁수·마법사 모두 `save.equipment.weapon`이 없으면 평타와 공격 스킬이 나가지 않고,
 * `"무기를 장착해야 공격할 수 있습니다."`를 띄운다. 자동 사냥이 매 프레임 시도하므로 안내는
 * 4.5초에 한 번만 나간다.
 */
test('무기가 없으면 세 직업 모두 평타가 나가지 않고 안내가 한 번만 뜬다', () => {
  for (const job of ['warrior', 'archer', 'mage']) {
    const save = freshSave('male', job);
    save.tutorial = 3; save.equipment = {};
    const world = new World(save); world.spawnTimer = 999;
    world.enemies = [];
    const target = enemyAt(world, world.player.x + 70, world.player.y + 10);
    const messages = capture(world);
    world.action('attack');
    assert.equal(target.hp, 100000, `${job}: 무기가 없으면 평타가 들어가지 않는다`);
    assert.equal(world.effects.filter(effect => effect.kind === 'hit' || effect.kind === 'shot' || effect.kind === 'slash').length, 0, `${job}: 공격 연출도 없다`);
    assert.deepEqual(messages, [WEAPON_REQUIRED_NOTICE]);
    world.cooldown.attack = 0; world.action('attack');
    assert.equal(messages.length, 1, '연속 시도에도 안내는 한 번만');
    // 4.5초가 지나면 다시 한 번 안내한다.
    for (let step = 0; step < 6; step++) world.update(1);
    world.cooldown.attack = 0; world.action('attack');
    assert.equal(messages.length, 2, '쿨다운이 지나면 다시 알린다');
  }
});

test('무기가 없으면 공격 스킬도 나가지 않는다', () => {
  const cases = [['warrior', 'slash2'], ['archer', 'doubleShot'], ['mage', 'fireBolt']];
  for (const [job, skill] of cases) {
    const save = freshSave('male', job);
    save.tutorial = 3; save.equipment = {}; save.learned = [skill]; save.quickSlots = [skill, null, null];
    const world = new World(save); world.spawnTimer = 999;
    world.enemies = [];
    const target = enemyAt(world, world.player.x + 70, world.player.y + 10);
    const messages = capture(world);
    world.action(skill);
    assert.equal(target.hp, 100000, `${job}: ${skill}이(가) 나가지 않는다`);
    assert.equal(world.effects.length, 0, `${job}: 스킬 연출도 없다`);
    assert.deepEqual(messages, [WEAPON_REQUIRED_NOTICE]);
  }
});

test('무기를 장착하면 곧바로 평타·스킬이 다시 나간다', () => {
  const save = freshSave('male', 'warrior');
  save.tutorial = 3; save.equipment = { weapon: weapon() };
  const world = new World(save); world.spawnTimer = 999;
  world.enemies = [];
  const target = enemyAt(world, world.player.x + 60, world.player.y);
  const messages = capture(world);
  world.action('attack');
  assert(target.hp < 100000, '무기를 차면 평타가 들어간다');
  assert.equal(messages.length, 0);
});

test('자동 사냥은 프레임마다 시도해도 안내를 도배하지 않는다', () => {
  const save = freshSave('male', 'warrior');
  save.tutorial = 3; save.equipment = {};
  const world = new World(save); world.spawnTimer = 999;
  world.enemies = [];
  const target = enemyAt(world, world.player.x + 40, world.player.y);
  const messages = capture(world);
  // 3초 동안 60fps로 자동 사냥이 공격을 계속 시도한다.
  for (let step = 0; step < 180; step++) world.update(1 / 60);
  assert.equal(target.hp, 100000, '자동 사냥도 막힌다');
  assert.equal(messages.filter(text => text === WEAPON_REQUIRED_NOTICE).length, 1, '3초 동안 안내는 한 번');
  // 4.5초가 지나면 한 번 더 — 쿨다운 값 자체를 계약으로 둔다.
  assert.equal(WEAPON_NOTICE_COOLDOWN, 4.5);
  for (let step = 0; step < 120; step++) world.update(1 / 60);
  assert.equal(messages.filter(text => text === WEAPON_REQUIRED_NOTICE).length, 2, '쿨다운마다 한 번씩만');
});

test('첫 처치 전(튜토리얼 0)만 맨손 허용 — 시작 무기를 받을 길을 막지 않는다', () => {
  const save = freshSave('male', 'warrior');
  assert.equal(save.tutorial, 0);
  assert.equal(save.equipment.weapon, undefined);
  const world = new World(save); world.spawnTimer = 999;
  world.enemies = [];
  const target = enemyAt(world, world.player.x + 60, world.player.y);
  const messages = capture(world);
  world.action('attack');
  assert(target.hp < 100000, '튜토리얼 0단계에서는 맨손 평타가 들어간다');
  assert.equal(messages.length, 0);
  // 첫 처치 뒤(튜토리얼 1 이상)부터는 무기가 없으면 막힌다.
  save.tutorial = 1;
  world.cooldown.attack = 0;
  const before = target.hp;
  world.action('attack');
  assert.equal(target.hp, before);
  assert.deepEqual(messages, [WEAPON_REQUIRED_NOTICE]);
});
