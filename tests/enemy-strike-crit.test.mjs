import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ts-loader.mjs';
const { freshSave, totalStats } = await import('../src/game/store.ts');
const { World, ENEMY_STRIKE_SECONDS, CRIT_DAMAGE_SCALE, CRIT_CHANCE_CAP } = await import('../src/game/world.ts');

/** 적 공격 모션(작업 245) — 적이 때리면 그 적이 `attack` 타이머로 내딛고, 맞는 쪽에 `enemyStrike`가 뜬다. */
test('필드: 적이 때리면 공격 모션 타이머가 서고 맞은 자리에 enemyStrike 효과가 뜬다', () => {
  const save = freshSave();
  save.equipment = {}; save.level = 20;
  const world = new World(save);
  world.spawnTimer = 999;
  world.cooldown.attack = 999;                               // 내 평타가 먼저 적을 죽이지 않게
  const enemy = world.enemies[0];
  enemy.hp = enemy.maxHp = 1e6;
  enemy.x = world.player.x; enemy.y = world.player.y + 20;   // 접촉 거리(35px 안)
  world.player.hit = 0;
  const before = world.player.hp;
  world.update(.016);
  assert.equal(enemy.attack, ENEMY_STRIKE_SECONDS, '때린 적이 내딛는다');
  assert.ok(world.player.hp < before, '피해는 그대로 들어간다');
  const strike = world.effects.find(effect => effect.kind === 'enemyStrike');
  assert.ok(strike, '맞은 자리에 enemyStrike 효과');
  assert.ok((strike.amount ?? 0) > 0, '잃은 체력이 숫자로 실린다');
  // 시간이 지나면 모션은 끝난다.
  for (let i = 0; i < 40; i++) { world.player.hit = 999; world.update(.016); }
  assert.equal(enemy.attack, 0, '모션은 제자리로 돌아온다');
});

/** 치명타(작업 245) — 장비 추가옵션 `치명타 확률`이 실제 피해 배수로 들어간다. */
test('치명타: 확률 100%면 1.8배로 들어가고, 0%면 그대로다', () => {
  const roll = (chance) => {
    const save = freshSave();
    save.equipment = {}; save.level = 30;
    const world = new World(save);
    world.spawnTimer = 999;
    // 스탯 `crit`을 원하는 값으로 고정한다(장비·패시브 합산 자리와 같은 값).
    const crit = chance;
    world.damage = ((original) => function (radius, amount, angle, arc, knockback, slow, origin, maxTargets, labelOffset) {
      return original.call(this, radius, amount, angle, arc, knockback, slow, origin, maxTargets, labelOffset);
    })(world.damage);
    const enemy = world.enemies[0];
    enemy.x = 10; enemy.y = 0; enemy.hp = enemy.maxHp = 1e9;
    // `critRoll`이 0을 돌려주면 항상 발동, 1을 돌려주면 절대 발동하지 않는다.
    world.critRoll = () => (crit ? 0 : 1);
    const stats = totalStats(save);
    // 기준: 치명타 확률 0인 월드에서 같은 스윙의 피해를 잰다.
    const base = (() => {
      const plain = new World(structuredClone(save));
      plain.spawnTimer = 999; plain.critRoll = () => 1;
      const target = plain.enemies[0]; target.x = 10; target.y = 0; target.hp = target.maxHp = 1e9;
      plain.damage(120, stats.attack * 1.6, 0, Math.PI, 0, 0, plain.player, 1);
      return target.maxHp - target.hp;
    })();
    world.damage(120, stats.attack * 1.6, 0, Math.PI, 0, 0, world.player, 1);
    return { dealt: enemy.maxHp - enemy.hp, base, crit: world.effects.find(effect => effect.kind === 'hit')?.crit === true };
  };
  const critHit = roll(1), plainHit = roll(0);
  assert.equal(plainHit.crit, false, '굴림이 빗나가면 치명타가 아니다');
  assert.ok(Math.abs(plainHit.dealt - plainHit.base) < 1e-6, '치명타가 아니면 기준 피해 그대로');
  assert.equal(critHit.crit, true, '굴림이 맞으면 치명타');
  assert.ok(Math.abs(critHit.dealt - plainHit.base * CRIT_DAMAGE_SCALE) < 1e-3, `치명타는 ${CRIT_DAMAGE_SCALE}배`);
});

test('치명타 확률은 80%로 잘린다', () => {
  assert.equal(CRIT_CHANCE_CAP, 80);
  const save = freshSave();
  save.equipment = {}; save.level = 30;
  const world = new World(save);
  assert.ok(Math.min(CRIT_CHANCE_CAP, Math.max(0, totalStats(save).crit)) <= CRIT_CHANCE_CAP);
});
