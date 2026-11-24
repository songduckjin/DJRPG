import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';

const { freshSave } = await import('../src/game/store.ts');
const { frostNovaStun } = await import('../src/game/skills.ts');
const { World } = await import('../src/game/world.ts');

test('프로스트 노바는 넉백 뒤 기절하고 스킬 레벨에 따라 더 오래 멈춘다', () => {
  assert(frostNovaStun(10) > frostNovaStun(1));
  assert.equal(frostNovaStun(1), .35);
  assert(Math.abs(frostNovaStun(10) - .8) < 1e-9);
  for (const level of [1, 10]) {
    const save = freshSave('female', 'mage');
    save.learned = ['frostNova']; save.quickSlots = ['frostNova', null, null];
    save.skillLevels = { frostNova: level };
    const world = new World(save); world.spawnTimer = 999; world.enemies = []; world.critRoll = () => 1;
    const enemy = { x: world.player.x + 95, y: world.player.y, hp: 100000, maxHp: 100000,
      boss: false, hit: 0, step: 0, moving: false, knockX: 0, knockY: 0, slow: 0 };
    world.enemies.push(enemy);
    world.action('frostNova');
    world.save.quickSlots = [null, null, null]; world.cooldown.attack = Number.POSITIVE_INFINITY;
    world.update(.13);
    assert(enemy.hp < enemy.maxHp, '결계가 주변 적에게 피해를 준다');
    assert(enemy.knockX > 0, '바깥으로 밀어낸다');
    assert(enemy.stunDelay > 0, '넉백이 시작된 직후 기절을 예약한다');
    assert(Math.abs(enemy.stun - frostNovaStun(level)) < 1e-9);
    world.update(.18);
    assert.equal(enemy.moving, false, '넉백 뒤 기절 중에는 걸어오지 않는다');
    world.update(frostNovaStun(level) + .1);
    assert.equal(enemy.stun, 0, '기절이 끝난다');
  }
});
